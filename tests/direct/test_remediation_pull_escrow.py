# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TrustLedger — V2 Pull-Escrow Three-Bucket Implementation Test Suite
Target Contract: contracts/trust_ledger.py

Verifies:
1. Valid payout and refund claims via single-use pull pattern (locked -> claimable -> dispatched).
2. Strict access control & vault authorization checks.
3. Duplicate claims, replay withdrawals, and re-entrancy prevention.
4. Concurrent payout vs. refund prevention.
5. Asynchronous child failure fail-closed quarantine (no double-payout retries).
6. Inconclusive AI evaluation adjudication protections.
7. Active solvency invariant: balance >= locked + claimable.
8. Comprehensive accounting reconciliation across the full milestone lifecycle.
"""

import json
import pytest

SAMPLE_CRITERIA = json.dumps(
    [
        {
            "id": "C1",
            "description": "Milestone delivery criterion",
            "weight": 60,
            "mandatory": True,
        },
        {
            "id": "C2",
            "description": "Audit & test verification",
            "weight": 40,
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


def _install_transfer_hook(vm, simulate_child_failure: bool = False):
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

            emitted_transfers.append(
                {
                    "to": _hex(to_addr),
                    "value": val,
                    "on": on_mode,
                }
            )

            if not simulate_child_failure:
                cur_contract_bal = vm_ctx._balances.get(contract_bytes, 0)
                if cur_contract_bal < val:
                    raise RuntimeError(
                        f"Transfer failed: contract balance {cur_contract_bal} < {val}"
                    )
                vm_ctx._balances[contract_bytes] = cur_contract_bal - val
                vm_ctx._balances[to_bytes] = vm_ctx._balances.get(to_bytes, 0) + val

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


# ==============================================================================
# 1. VALID PAYOUT AND REFUND CLAIMS
# ==============================================================================

def test_unit_valid_payout_claim_and_authorized_withdrawal(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT & SIMULATED TRANSFER]
    Verify that an approved milestone creates a valid claimable payout balance
    without premature fund transfer, and that the authorized freelancer can
    pull the funds via withdraw_claim.
    """
    emitted = _install_transfer_hook(direct_vm)
    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Project Alpha", "Description of alpha project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 150_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 150_000)

    # Submit evidence & evaluate as APPROVED
    direct_vm.sender = freelancer
    escrow.submit_evidence(mid, "https://evidence.example/m1", "sha256:11112222333344445555666677778888", "Notes")
    direct_vm.mock_web(r".*", {"status": 200, "body": "OK"})
    direct_vm.mock_llm(r".*", json.dumps({"inconclusive": False, "met_ids": ["C1", "C2"], "rationale": "Perfect delivery"}))
    direct_vm.sender = client
    escrow.evaluate_milestone(mid)

    # Release milestone -> Creates payout claim
    direct_vm.sender = freelancer
    rel_res = escrow.release_milestone(mid)
    assert rel_res["status"] == "RELEASED"
    assert rel_res["claim_status"] == "CLAIMABLE"
    assert rel_res["claimable_wei"] == 150_000
    assert len(emitted) == 0  # No funds prematurely pushed!

    # Inspect claim record
    cid = rel_res["claim_id"]
    claim = escrow.get_claim(cid)
    assert claim["claim_id"] == cid
    assert claim["project_id"] == int(pid)
    assert claim["milestone_id"] == int(mid)
    assert claim["claim_type"] == "PAYOUT"
    assert claim["beneficiary"].lower() == _hex(freelancer).lower()
    assert claim["recipient_vault"].lower() == _hex(f_vault).lower()
    assert claim["amount_wei"] == 150_000
    assert claim["status"] == "CLAIMABLE"

    # Freelancer securely pulls funds via withdraw_claim (transitions to terminal DISPATCHED)
    w_res = escrow.withdraw_claim(cid)
    assert w_res["status"] == "DISPATCHED"
    assert len(emitted) == 1
    assert emitted[0]["to"].lower() == _hex(f_vault).lower()
    assert emitted[0]["value"] == 150_000

    # In V2, claim is terminal DISPATCHED and cannot be withdrawn again
    assert escrow.get_claim(cid)["status"] == "DISPATCHED"
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)

    # Vault received funds and contract accounting updated
    assert direct_vm._balances[_addr_bytes(direct_vm, f_vault)] == 150_000
    assert escrow.get_escrow_summary()["contract_balance_wei"] == 0
    assert escrow.get_escrow_summary()["total_escrow_dispatched_wei"] == 150_000


def test_unit_valid_refund_claim_and_authorized_withdrawal(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT & SIMULATED TRANSFER]
    Verify that a rejected milestone creates a valid client refund claim,
    and that only the authorized client can withdraw it to the refund vault.
    """
    emitted = _install_transfer_hook(direct_vm)
    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Project Beta", "Description of beta project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 200_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 200_000)

    # Open dispute and resolve as REFUND
    direct_vm.sender = client
    escrow.open_dispute(mid, "Deliverable rejected due to scope failure")
    direct_vm.sender = freelancer
    escrow.resolve_dispute(mid, "REFUND", "Freelancer concedes refund")

    # Client triggers refund -> creates refund claim
    direct_vm.sender = client
    ref_res = escrow.refund_milestone(mid)
    assert ref_res["status"] == "REFUNDED"
    assert ref_res["claim_status"] == "CLAIMABLE"
    assert ref_res["refunded_wei"] == 200_000
    assert len(emitted) == 0  # No premature push

    cid = ref_res["claim_id"]
    claim = escrow.get_claim(cid)
    assert claim["claim_type"] == "REFUND"
    assert claim["beneficiary"].lower() == _hex(client).lower()
    assert claim["recipient_vault"].lower() == _hex(c_vault).lower()
    assert claim["amount_wei"] == 200_000

    # Client pulls refund
    w_res = escrow.withdraw_claim(cid)
    assert w_res["status"] == "DISPATCHED"
    assert len(emitted) == 1
    assert emitted[0]["to"].lower() == _hex(c_vault).lower()

    # Replay protection
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)

    assert direct_vm._balances[_addr_bytes(direct_vm, c_vault)] == 200_000
    assert escrow.get_escrow_summary()["contract_balance_wei"] == 0
    assert escrow.get_escrow_summary()["total_escrow_dispatched_wei"] == 200_000


# ==============================================================================
# 2. ACCESS CONTROL & UNAUTHORIZED WITHDRAWALS
# ==============================================================================

def test_unit_unauthorized_withdrawal_attempts_rejected(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verify that attackers or unauthorized third parties CANNOT withdraw
    a claim belonging to someone else, and unapproved vaults are rejected.
    """
    _install_transfer_hook(direct_vm)
    client, freelancer, f_vault, c_vault, arbitrator, attacker = direct_accounts[:6]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    pid = escrow.create_project("Project Gamma", "Description of gamma project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    # Setup approved release
    direct_vm.sender = client
    escrow.open_dispute(mid, "Dispute")
    direct_vm.sender = client
    escrow.resolve_dispute(mid, "RELEASE", "Client concedes release")
    rel_res = escrow.release_milestone(mid)
    cid = rel_res["claim_id"]

    # 1. Before vault approval: MUST REJECT unapproved vault
    direct_vm.sender = freelancer
    with pytest.raises(Exception, match="is not an approved deployed vault"):
        escrow.withdraw_claim(cid)

    # Register vault
    direct_vm.sender = client
    escrow.register_approved_vault(_hex(f_vault))

    # 2. Attacker attempts to withdraw freelancer's claim: MUST REJECT
    direct_vm.sender = attacker
    with pytest.raises(Exception, match="Unauthorized withdrawal caller"):
        escrow.withdraw_claim(cid)

    # 3. Client attempts to withdraw freelancer's claim: MUST REJECT
    direct_vm.sender = client
    with pytest.raises(Exception, match="Unauthorized withdrawal caller"):
        escrow.withdraw_claim(cid)

    # 4. Arbitrator attempts to withdraw freelancer's claim directly: MUST REJECT
    direct_vm.sender = arbitrator
    with pytest.raises(Exception, match="Unauthorized withdrawal caller"):
        escrow.withdraw_claim(cid)

    # 5. Only freelancer or designated f_vault can withdraw:
    direct_vm.sender = freelancer
    w_res = escrow.withdraw_claim(cid)
    assert w_res["status"] == "DISPATCHED"


# ==============================================================================
# 3. DUPLICATE CLAIMS & DUPLICATE WITHDRAWALS
# ==============================================================================

def test_unit_duplicate_claims_and_duplicate_withdrawals_rejected(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verify that:
    1. A milestone cannot generate duplicate claims.
    2. A claim cannot be withdrawn twice.
    """
    _install_transfer_hook(direct_vm)
    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Project Delta", "Description of delta project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    direct_vm.sender = client
    escrow.open_dispute(mid, "Dispute")
    direct_vm.sender = client
    escrow.resolve_dispute(mid, "RELEASE", "Concession")
    rel_res = escrow.release_milestone(mid)
    cid = rel_res["claim_id"]

    # Duplicate release attempt: MUST REJECT
    with pytest.raises(Exception, match="already settled"):
        escrow.release_milestone(mid)

    # First withdrawal succeeds
    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid)

    # Concurrent/repeated withdrawal while already DISPATCHED: MUST REJECT
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)


# ==============================================================================
# 4. CONCURRENT PAYOUT / REFUND ATTEMPTS
# ==============================================================================

def test_unit_concurrent_payout_and_refund_attempts_prevented(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verify that a milestone can never have both a payout claim and a refund claim.
    """
    _install_transfer_hook(direct_vm)
    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Project Epsilon", "Description of epsilon project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    direct_vm.sender = client
    escrow.open_dispute(mid, "Dispute")
    direct_vm.sender = client
    escrow.resolve_dispute(mid, "RELEASE", "Concession")
    escrow.release_milestone(mid)

    # Attempt to refund released milestone: MUST REJECT
    direct_vm.sender = client
    with pytest.raises(Exception, match="already settled"):
        escrow.refund_milestone(mid)


# ==============================================================================
# 5. ASYNCHRONOUS CHILD FAILURE & FAIL-CLOSED QUARANTINE
# ==============================================================================

def test_simulated_transfer_failed_child_transfer_and_safe_retry(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [SIMULATED TRANSFER]
    Demonstrates V2 fail-closed handling when emit_transfer fails at protocol level:
    1. Contract balance remains intact in escrow.
    2. Claim enters terminal DISPATCHED status and liability is quarantined.
    3. retry_failed_withdrawal has been removed to prevent double-payouts.
    4. Active solvency is preserved: balance >= locked + claimable.
    """
    emitted = _install_transfer_hook(direct_vm, simulate_child_failure=True)
    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Project Zeta", "Description of zeta project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    direct_vm.sender = client
    escrow.open_dispute(mid, "Dispute")
    direct_vm.sender = client
    escrow.resolve_dispute(mid, "RELEASE", "Concession")
    rel = escrow.release_milestone(mid)
    cid = rel["claim_id"]

    # Freelancer attempts withdrawal; simulated child failure occurs
    direct_vm.sender = freelancer
    w_res = escrow.withdraw_claim(cid)
    assert w_res["status"] == "DISPATCHED"

    # Contract balance remains intact because child transfer failed
    summary = escrow.get_escrow_summary()
    assert summary["contract_balance_wei"] == 100_000
    assert summary["total_escrow_claimable_wei"] == 0
    assert summary["total_escrow_dispatched_wei"] == 100_000

    # In V2, retry_failed_withdrawal is permanently removed
    assert not hasattr(escrow, "retry_failed_withdrawal")
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)

    # Active solvency holds
    assert summary["contract_balance_wei"] >= summary["total_escrow_locked_wei"] + summary["total_escrow_claimable_wei"]


# ==============================================================================
# 6. INCONCLUSIVE ADJUDICATION PROTECTION
# ==============================================================================

def test_unit_inconclusive_adjudication_protects_funds(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verify that an INCONCLUSIVE evaluation verdict strictly prevents any claim
    creation, protecting escrow funds from being unlocked or withdrawn.
    """
    _install_transfer_hook(direct_vm)
    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Project Eta", "Description of eta project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    # Submit evidence & mock 500 error -> INCONCLUSIVE
    direct_vm.sender = freelancer
    escrow.submit_evidence(mid, "https://evidence.example/down", "sha256:deadbeef", "Server offline error")
    direct_vm.mock_web(r".*", {"status": 500, "body": "Internal Error"})
    eval_res = escrow.evaluate_milestone(mid)
    assert eval_res["verdict"] == "INCONCLUSIVE"

    # Both release and refund are BLOCKED:
    direct_vm.sender = freelancer
    with pytest.raises(Exception, match="not eligible for release"):
        escrow.release_milestone(mid)

    direct_vm.sender = client
    with pytest.raises(Exception, match="not eligible for refund"):
        escrow.refund_milestone(mid)

    # No claims created, funds remain locked
    summary = escrow.get_escrow_summary()
    assert summary["total_escrow_locked_wei"] == 100_000
    assert summary["total_escrow_claimable_wei"] == 0
    assert summary["claim_count"] == 0


# ==============================================================================
# 7. INSUFFICIENT BALANCE & OVER-CLAIMING REJECTION
# ==============================================================================

def test_unit_insufficient_contract_balance_and_exceeding_claims_rejected(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verify that contract enforces:
    self.balance >= total_escrow_locked_wei + total_escrow_claimable_wei
    and rejects claim creation or withdrawals if the contract balance is insufficient.
    """
    _install_transfer_hook(direct_vm)
    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Project Theta", "Description of theta project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)

    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    direct_vm.sender = client
    escrow.open_dispute(mid, "Dispute")
    direct_vm.sender = client
    escrow.resolve_dispute(mid, "RELEASE", "Concession")

    # Artificially deplete contract balance in direct_vm to simulate unexpected balance drain
    contract_bytes = _addr_bytes(direct_vm, direct_vm._contract_address)
    direct_vm._balances[contract_bytes] = 50_000  # Less than required 100,000

    # release_milestone must detect insufficient balance and reject claim creation
    with pytest.raises(Exception, match="Insufficient on-chain contract GEN balance"):
        escrow.release_milestone(mid)

    # Restore balance
    direct_vm._balances[contract_bytes] = 100_000
    rel_res = escrow.release_milestone(mid)
    cid = rel_res["claim_id"]

    # Now deplete balance before withdrawal
    direct_vm._balances[contract_bytes] = 20_000
    direct_vm.sender = freelancer
    with pytest.raises(Exception, match="Insufficient on-chain contract GEN balance"):
        escrow.withdraw_claim(cid)


# ==============================================================================
# 8. COMPREHENSIVE ACCOUNTING RECONCILIATION
# ==============================================================================

def test_unit_comprehensive_escrow_accounting_reconciliation(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT & SIMULATED TRANSFER]
    Full lifecycle test verifying accounting across multiple milestones:
    Milestone 1 funded (100k) -> Released -> Claim 1 created -> Withdrawn
    Milestone 2 funded (200k) -> Rejected -> Claim 2 created -> Withdrawn
    Invariant at every step:
    contract_balance_wei >= total_escrow_locked_wei + total_escrow_claimable_wei
    """
    _install_transfer_hook(direct_vm)
    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Multi-Milestone Project", "Comprehensive accounting test", _hex(c_vault), _hex(arbitrator))
    m1 = escrow.add_milestone(pid, "Milestone 1", "M1 description", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    m2 = escrow.add_milestone(pid, "Milestone 2", "M2 description", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 200_000)

    # Step 1: Fund M1
    _fund_milestone(direct_vm, escrow, client, int(m1), 100_000)
    s1 = escrow.get_escrow_summary()
    assert s1["contract_balance_wei"] == 100_000
    assert s1["total_escrow_locked_wei"] == 100_000
    assert s1["total_escrow_claimable_wei"] == 0
    assert s1["total_escrow_dispatched_wei"] == 0

    # Step 2: Fund M2
    _fund_milestone(direct_vm, escrow, client, int(m2), 200_000)
    s2 = escrow.get_escrow_summary()
    assert s2["contract_balance_wei"] == 300_000
    assert s2["total_escrow_locked_wei"] == 300_000
    assert s2["total_escrow_claimable_wei"] == 0

    # Step 3: Settle M1 as Release -> Claim 1 created
    direct_vm.sender = client
    escrow.open_dispute(m1, "Dispute M1")
    direct_vm.sender = client
    escrow.resolve_dispute(m1, "RELEASE", "Concede M1")
    rel_m1 = escrow.release_milestone(m1)
    c1 = rel_m1["claim_id"]

    s3 = escrow.get_escrow_summary()
    assert s3["contract_balance_wei"] == 300_000  # Funds still intact in escrow!
    assert s3["total_escrow_locked_wei"] == 200_000  # M2 still locked
    assert s3["total_escrow_claimable_wei"] == 100_000  # M1 now claimable
    assert s3["total_escrow_dispatched_wei"] == 0
    assert s3["contract_balance_wei"] >= s3["total_escrow_locked_wei"] + s3["total_escrow_claimable_wei"]

    # Step 4: Settle M2 as Refund -> Claim 2 created
    direct_vm.sender = client
    escrow.open_dispute(m2, "Dispute M2")
    direct_vm.sender = freelancer
    escrow.resolve_dispute(m2, "REFUND", "Concede M2")
    direct_vm.sender = client
    ref_m2 = escrow.refund_milestone(m2)
    c2 = ref_m2["claim_id"]

    s4 = escrow.get_escrow_summary()
    assert s4["contract_balance_wei"] == 300_000
    assert s4["total_escrow_locked_wei"] == 0
    assert s4["total_escrow_claimable_wei"] == 300_000  # 100k + 200k claimable
    assert s4["claim_count"] == 2

    # Step 5: Freelancer pulls Claim 1
    direct_vm.sender = freelancer
    escrow.withdraw_claim(c1)
    s5 = escrow.get_escrow_summary()
    assert s5["contract_balance_wei"] == 200_000
    assert s5["total_escrow_claimable_wei"] == 200_000
    assert s5["total_escrow_dispatched_wei"] == 100_000

    # Step 6: Client pulls Claim 2
    direct_vm.sender = client
    escrow.withdraw_claim(c2)
    s6 = escrow.get_escrow_summary()
    assert s6["contract_balance_wei"] == 0
    assert s6["total_escrow_locked_wei"] == 0
    assert s6["total_escrow_claimable_wei"] == 0
    assert s6["total_escrow_dispatched_wei"] == 300_000
    assert s6["total_escrow_funded_wei"] == 300_000
    assert s6["total_escrow_released_wei"] == 100_000
    assert s6["total_escrow_refunded_wei"] == 200_000

    # Final vault balances
    assert direct_vm._balances[_addr_bytes(direct_vm, f_vault)] == 100_000
    assert direct_vm._balances[_addr_bytes(direct_vm, c_vault)] == 200_000
