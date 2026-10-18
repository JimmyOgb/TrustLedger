import json
import pytest

SAMPLE_CRITERIA = json.dumps(
    [
        {
            "id": "C1",
            "description": "Smart contract with payable escrow",
            "weight": 50,
            "mandatory": True,
        },
        {
            "id": "C2",
            "description": "Comprehensive security testing suite",
            "weight": 50,
            "mandatory": True,
        },
    ]
)


def _addr_bytes(vm, addr) -> bytes:
    return vm._to_bytes(addr)


def _hex(addr) -> str:
    if hasattr(addr, "as_hex"):
        return addr.as_hex
    if isinstance(addr, bytes):
        return "0x" + addr.hex()
    return str(addr)


def _install_transfer_hook(vm, simulate_child_failure=False):
    """
    Hook into direct_vm._gl_call_hook to capture emit_transfer calls.
    If simulate_child_failure is True, it simulates an asynchronous child transaction
    failure at the protocol level where the parent emits the transfer, but the recipient
    fails to receive the credited funds.
    """
    emitted_transfers = []

    def _hook(vm_ctx, request):
        msg = None
        if isinstance(request, dict):
            msg = request.get("EmitInternalMessage") or request.get("PostMessage")
        if msg is not None:
            to_addr = msg.get("address")
            val = int(msg.get("value", 0))
            on_mode = msg.get("on", "finalized")
            contract_bytes = _addr_bytes(vm_ctx, vm_ctx._contract_address)
            to_bytes = _addr_bytes(vm_ctx, to_addr)
            cur_contract_bal = vm_ctx._balances.get(contract_bytes, 0)
            if cur_contract_bal < val:
                raise RuntimeError(
                    f"Transfer failed: contract balance {cur_contract_bal} < {val}"
                )
            if not simulate_child_failure:
                # Normal finalization: Contract is debited and recipient is credited
                vm_ctx._balances[contract_bytes] = cur_contract_bal - val
                vm_ctx._balances[to_bytes] = vm_ctx._balances.get(to_bytes, 0) + val

            emitted_transfers.append(
                {
                    "to": _hex(to_addr),
                    "value": val,
                    "on": on_mode,
                    "child_success": not simulate_child_failure,
                }
            )
            return {"ok": None}
        return None

    vm._gl_call_hook = _hook
    return emitted_transfers


def _fund_milestone(vm, contract, client_addr, milestone_id: int, amount_wei: int):
    client_bytes = _addr_bytes(vm, client_addr)
    contract_bytes = _addr_bytes(vm, vm._contract_address)
    cur_client_bal = vm._balances.get(client_bytes, 0)
    if cur_client_bal < amount_wei:
        vm._balances[client_bytes] = cur_client_bal + amount_wei * 2
    vm._balances[client_bytes] = vm._balances[client_bytes] - amount_wei
    vm._balances[contract_bytes] = vm._balances.get(contract_bytes, 0) + amount_wei
    vm.sender = client_addr
    vm.value = amount_wei
    try:
        return contract.fund_milestone(milestone_id)
    finally:
        vm.value = 0


def test_audit_duplicate_payout_and_concurrent_refund_prevented(
    direct_vm, direct_deploy, direct_accounts
):
    """
    AUDIT TEST (Unit/Simulated):
    Verify that once a milestone is paid out, neither a duplicate payout
    nor a concurrent refund can be executed under any circumstances.
    """
    emitted = _install_transfer_hook(direct_vm)
    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    f_vault = direct_accounts[2]
    c_vault = direct_accounts[3]
    arbitrator = direct_accounts[4]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Audit Project", "Detailed description of audit project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Detailed description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    # Fund milestone
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    # Submit evidence and simulate APPROVED verdict
    direct_vm.sender = freelancer
    escrow.submit_evidence(mid, "https://example.com/ev", "sha256:abcd1234abcd1234abcd1234abcd1234", "Finished")

    direct_vm.mock_web(r".*", {"status": 200, "body": "Satisfied"})
    direct_vm.mock_llm(r".*", json.dumps({"inconclusive": False, "met_ids": ["C1", "C2"], "rationale": "All criteria met"}))

    direct_vm.sender = client
    escrow.evaluate_milestone(mid)

    # First release succeeds -> creates payout claim
    rel_res = escrow.release_milestone(mid)
    assert rel_res["status"] == "RELEASED"
    assert rel_res["claim_status"] == "CLAIMABLE"
    assert rel_res["released_wei"] == 100_000

    # Beneficiary withdraws claim (enters terminal DISPATCHED)
    direct_vm.sender = freelancer
    w_res = escrow.withdraw_claim(rel_res["claim_id"])
    assert w_res["status"] == "DISPATCHED"
    assert len(emitted) == 1
    assert escrow.get_claim(rel_res["claim_id"])["status"] == "DISPATCHED"

    # Replay withdrawal is strictly rejected
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(rel_res["claim_id"])

    # Attempt duplicate release: MUST REJECT
    with pytest.raises(Exception, match="already settled"):
        escrow.release_milestone(mid)

    # Attempt concurrent refund on released milestone: MUST REJECT
    direct_vm.sender = client
    with pytest.raises(Exception, match="already settled"):
        escrow.refund_milestone(mid)


def test_audit_duplicate_refund_and_concurrent_payout_prevented(
    direct_vm, direct_deploy, direct_accounts
):
    """
    AUDIT TEST (Unit/Simulated):
    Verify that once a milestone is refunded, neither a duplicate refund
    nor a subsequent payout can be executed.
    """
    emitted = _install_transfer_hook(direct_vm)
    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    f_vault = direct_accounts[2]
    c_vault = direct_accounts[3]
    arbitrator = direct_accounts[4]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Audit Project", "Detailed description of audit project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Detailed description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    # Fund milestone
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    # Open dispute and resolve as REFUND
    direct_vm.sender = client
    escrow.open_dispute(mid, "Deliverable rejected by client")

    direct_vm.sender = freelancer
    escrow.resolve_dispute(mid, "REFUND", "Freelancer concedes deliverable cannot be completed")

    # First refund succeeds (client calls refund) -> creates refund claim
    direct_vm.sender = client
    ref_res = escrow.refund_milestone(mid)
    assert ref_res["status"] == "REFUNDED"
    assert ref_res["claim_status"] == "CLAIMABLE"
    assert ref_res["refunded_wei"] == 100_000

    # Client pulls refund (enters terminal DISPATCHED state)
    w_res = escrow.withdraw_claim(ref_res["claim_id"])
    assert w_res["status"] == "DISPATCHED"
    assert len(emitted) == 1
    assert escrow.get_claim(ref_res["claim_id"])["status"] == "DISPATCHED"

    # Replay withdrawal is strictly rejected
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(ref_res["claim_id"])

    # Attempt duplicate refund: MUST REJECT
    with pytest.raises(Exception, match="already settled"):
        escrow.refund_milestone(mid)

    # Attempt concurrent payout on refunded milestone: MUST REJECT
    with pytest.raises(Exception, match="already settled"):
        escrow.release_milestone(mid)


def test_audit_inconclusive_evaluation_prevents_unauthorized_settlement(
    direct_vm, direct_deploy, direct_accounts
):
    """
    AUDIT TEST (Unit/Simulated):
    Verify that an INCONCLUSIVE evaluation locks the milestone in INCONCLUSIVE
    status, strictly preventing any payout or refund until explicit dispute resolution.
    """
    _install_transfer_hook(direct_vm)
    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    f_vault = direct_accounts[2]
    c_vault = direct_accounts[3]
    arbitrator = direct_accounts[4]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    pid = escrow.create_project("Audit Project", "Detailed description of audit project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Detailed description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    direct_vm.sender = freelancer
    escrow.submit_evidence(mid, "https://example.com/broken-url", "sha256:00000000000000000000000000000000", "Evidence")

    # Mock web failure (404)
    direct_vm.mock_web(r".*", {"status": 404, "body": "Not Found"})
    direct_vm.mock_llm(r".*", json.dumps({"inconclusive": True, "met_ids": [], "rationale": "Evidence not accessible"}))

    direct_vm.sender = client
    eval_res = escrow.evaluate_milestone(mid)
    assert eval_res["verdict"] == "INCONCLUSIVE"
    assert eval_res["status"] == "INCONCLUSIVE"

    # Attempting release while INCONCLUSIVE: MUST FAIL
    with pytest.raises(Exception, match="not eligible for release"):
        escrow.release_milestone(mid)

    # Attempting refund while INCONCLUSIVE without dispute: MUST FAIL
    with pytest.raises(Exception, match="not eligible for refund"):
        escrow.refund_milestone(mid)


def test_audit_unauthorized_callers_and_mismatched_milestones_rejected(
    direct_vm, direct_deploy, direct_accounts
):
    """
    AUDIT TEST (Unit/Simulated):
    Verify that callers cannot access milestones belonging to other projects,
    non-existent milestones, or execute unauthorized lifecycle transitions.
    """
    _install_transfer_hook(direct_vm)
    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    vault = direct_accounts[2]
    arbitrator = direct_accounts[3]
    attacker = direct_accounts[4]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    pid = escrow.create_project("Project 1", "Detailed project description", _hex(vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Detailed milestone description", SAMPLE_CRITERIA, _hex(freelancer), _hex(vault), 50_000)

    # Non-client funding attempt
    direct_vm.deal(attacker, 50_000)
    direct_vm.sender = attacker
    direct_vm.value = 50_000
    try:
        with pytest.raises(Exception, match="Only the authorized project client"):
            escrow.fund_milestone(mid)
    finally:
        direct_vm.value = 0

    # Fund as authorized client
    _fund_milestone(direct_vm, escrow, client, int(mid), 50_000)

    # Non-freelancer evidence submission
    direct_vm.sender = attacker
    with pytest.raises(Exception, match="Only the authorized freelancer"):
        escrow.submit_evidence(mid, "https://example.com/ev", "sha256:12345678901234567890", "Hacked")

    # Non-existent milestone
    with pytest.raises(Exception, match="does not exist"):
        escrow.get_milestone(999)

    # Non-participant dispute opening
    direct_vm.sender = attacker
    with pytest.raises(Exception, match="Only the project client or freelancer"):
        escrow.open_dispute(mid, "Attacker trying to freeze contract")


def test_audit_asynchronous_child_failure_simulation(
    direct_vm, direct_deploy, direct_accounts
):
    """
    AUDIT TEST (Unit/Simulated — ARCHITECTURAL FINDING DEMONSTRATION):
    Simulate a scenario where emit_transfer(value=..., on='finalized') is emitted
    by the escrow contract, but the child transaction fails at the protocol level
    (e.g. invalid recipient contract, out of gas, or execution failure).
    Demonstrate that:
    1. The contract storage marks the milestone as 'RELEASED'
    2. The contract has no callback or record to detect that the child failed.
    """
    # Install hook with simulated child transaction failure
    emitted = _install_transfer_hook(direct_vm, simulate_child_failure=True)

    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    f_vault = direct_accounts[2]
    c_vault = direct_accounts[3]
    arbitrator = direct_accounts[4]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Project 1", "Detailed project description", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Detailed milestone description", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    # Submit evidence & evaluate
    direct_vm.sender = freelancer
    escrow.submit_evidence(mid, "https://example.com/ev", "sha256:12345678901234567890", "Notes")
    direct_vm.mock_web(r".*", {"status": 200, "body": "OK"})
    direct_vm.mock_llm(r".*", json.dumps({"inconclusive": False, "met_ids": ["C1", "C2"], "rationale": "OK"}))
    direct_vm.sender = client
    escrow.evaluate_milestone(mid)

    # Release milestone -> creates payout claim without pushing funds
    res = escrow.release_milestone(mid)
    assert res["status"] == "RELEASED"
    assert res["claim_status"] == "CLAIMABLE"
    cid = res["claim_id"]

    # Initial summary: funds safely in escrow, tracked as claimable
    summary = escrow.get_escrow_summary()
    assert summary["contract_balance_wei"] == 100_000
    assert summary["total_escrow_claimable_wei"] == 100_000

    # Beneficiary attempts withdrawal, child transfer simulated to fail
    direct_vm.sender = freelancer
    w_res = escrow.withdraw_claim(cid)
    assert w_res["status"] == "DISPATCHED"
    assert len(emitted) == 1

    # BUT the child transaction failed at protocol level
    f_vault_bytes = _addr_bytes(direct_vm, f_vault)
    f_vault_balance = direct_vm._balances.get(f_vault_bytes, 0)
    assert f_vault_balance == 0  # Recipient never received funds

    # Contract balance is NOT lost: still in escrow
    contract_bytes = _addr_bytes(direct_vm, direct_vm._contract_address)
    assert direct_vm._balances.get(contract_bytes, 0) == 100_000

    # V2 FAIL-CLOSED QUARANTINE VERIFICATION:
    # Under GenVM non-blocking semantics, on-chain child transaction status cannot be verified.
    # Therefore, V2 permanently quarantines the liability in DISPATCHED status.
    # Automated retry or unverified confirmations are permanently removed to eliminate double-payout risk.
    assert w_res["total_dispatched_wei"] == 100_000
    claim_state = escrow.get_claim(cid)
    assert claim_state["status"] == "DISPATCHED"
    assert claim_state["dispatched_count"] == 1

    # Retry is not permitted and claim cannot be re-dispatched
    assert not hasattr(escrow, "retry_failed_withdrawal")
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)

    # Active solvency invariant remains intact: balance >= locked + claimable
    post_summary = escrow.get_escrow_summary()
    assert post_summary["total_escrow_claimable_wei"] == 0
    assert post_summary["total_escrow_locked_wei"] == 0
    assert post_summary["total_escrow_dispatched_wei"] == 100_000
    assert post_summary["contract_balance_wei"] >= (
        post_summary["total_escrow_locked_wei"] + post_summary["total_escrow_claimable_wei"]
    )
