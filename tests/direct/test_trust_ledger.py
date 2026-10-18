import json
import pytest


SAMPLE_CRITERIA = json.dumps(
    [
        {
            "id": "C1",
            "description": "Deliver production smart contract with payable native GEN escrow",
            "weight": 60,
            "mandatory": True,
        },
        {
            "id": "C2",
            "description": "Include automated security test suite and live verification report",
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


def _install_transfer_hook(vm):
    """
    Hook into direct_vm._gl_call_hook to capture outgoing emit_transfer
    (EmitInternalMessage / PostMessage) calls and debit/credit VM balances
    identically to GenLayer consensus finalization.
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
            vm_ctx._balances[contract_bytes] = cur_contract_bal - val
            vm_ctx._balances[to_bytes] = vm_ctx._balances.get(to_bytes, 0) + val
            emitted_transfers.append(
                {
                    "to": _hex(to_addr),
                    "value": val,
                    "on": on_mode,
                }
            )
            return {"ok": None}
        return None

    vm._gl_call_hook = _hook
    return emitted_transfers


def _fund_milestone_with_gen(vm, contract, client_addr, milestone_id: int, amount_wei: int):
    """
    Simulate an on-chain payable transaction in direct_vm:
    debits client_addr, credits contract_address, sets direct_vm.value = amount_wei,
    calls fund_milestone, and resets direct_vm.value = 0.
    """
    client_bytes = _addr_bytes(vm, client_addr)
    contract_bytes = _addr_bytes(vm, vm._contract_address)
    client_bal = vm._balances.get(client_bytes, 0)
    assert client_bal >= amount_wei, "Test setup: client lacks native GEN balance"
    vm._balances[client_bytes] = client_bal - amount_wei
    vm._balances[contract_bytes] = vm._balances.get(contract_bytes, 0) + amount_wei
    vm.sender = client_addr
    vm.value = amount_wei
    try:
        return contract.fund_milestone(milestone_id)
    finally:
        vm.value = 0


def test_happy_path_escrow_fund_evaluate_and_release(
    direct_vm, direct_deploy, direct_accounts
):
    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    freelancer_vault = direct_accounts[2]
    client_refund_vault = direct_accounts[3]
    arbitrator = direct_accounts[4]

    emitted = _install_transfer_hook(direct_vm)
    direct_vm.deal(client, 10_000_000)
    direct_vm.deal(freelancer_vault, 0)

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(freelancer_vault))
    escrow.register_approved_vault(_hex(client_refund_vault))

    pid = escrow.create_project(
        "TrustLedger Core Upgrade",
        "Native GEN milestone escrow implementation on StudioNet",
        _hex(client_refund_vault),
        _hex(arbitrator),
    )
    assert int(pid) == 1

    mid = escrow.add_milestone(
        pid,
        "Milestone 1: Smart Contract & Escrow",
        "Implement payable funding, AI evaluation, and native GEN payout",
        SAMPLE_CRITERIA,
        _hex(freelancer),
        _hex(freelancer_vault),
        2_500_000,
    )
    assert int(mid) == 1

    # Fund milestone with real native GEN
    fund_res = _fund_milestone_with_gen(direct_vm, escrow, client, mid, 2_500_000)
    assert fund_res["status"] == "FUNDED"
    assert fund_res["funded_wei"] == 2_500_000
    assert fund_res["contract_balance_wei"] == 2_500_000

    summary = escrow.get_escrow_summary()
    assert summary["contract_balance_wei"] == 2_500_000
    assert summary["total_escrow_locked_wei"] == 2_500_000

    # Submit evidence as authorized freelancer
    direct_vm.sender = freelancer
    ev_url = "https://trustledger.example.com/evidence/m1-v1.json"
    sub_res = escrow.submit_evidence(
        mid,
        ev_url,
        "sha256:9f86d081884c7d659a2feaa0c55ad015",
        "Completed payable escrow contract and full direct test suite.",
    )
    assert sub_res["submission_version"] == 1
    assert sub_res["status"] == "EVIDENCE_SUBMITTED"

    # Mock web evidence & LLM evaluation
    direct_vm.mock_web(
        r"trustledger\.example\.com/evidence/m1-v1\.json",
        {
            "status": 200,
            "body": "Deliverable verified: payable native GEN escrow contract and 14 passing security tests.",
        },
    )
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "inconclusive": False,
                "met_ids": ["C1", "C2"],
                "rationale": "Both C1 and C2 are satisfied with verified contract and test suite.",
            }
        ),
    )

    direct_vm.sender = client
    eval_res = escrow.evaluate_milestone(mid)
    assert eval_res["verdict"] == "APPROVED"
    assert eval_res["score"] == 100
    assert eval_res["mandatory_met"] is True
    assert eval_res["evaluated_version"] == 1
    assert eval_res["status"] == "APPROVED"

    # Verify validator equivalence function agrees
    assert direct_vm.run_validator() is True
    # Verify validator rejects fabricated leader verdict
    assert (
        direct_vm.run_validator(
            leader_result={
                "verdict": "REJECTED",
                "score": 0,
                "mandatory_met": False,
                "met_ids": [],
                "rationale": "Fake rejection",
            }
        )
        is False
    )

    # Release milestone funds to create a claimable balance for the freelancer
    direct_vm.sender = freelancer
    rel_res = escrow.release_milestone(mid)
    assert rel_res["status"] == "RELEASED"
    assert rel_res["claim_status"] == "CLAIMABLE"
    assert rel_res["released_wei"] == 2_500_000
    assert rel_res["remaining_escrow_locked_wei"] == 0
    assert len(emitted) == 0  # Safe pull-based: no premature push transfer

    # Freelancer securely pulls funds via withdraw_claim
    w_res = escrow.withdraw_claim(rel_res["claim_id"])
    assert w_res["status"] == "DISPATCHED"
    assert len(emitted) == 1
    assert emitted[0]["to"].lower() == _hex(freelancer_vault).lower()
    assert emitted[0]["value"] == 2_500_000
    assert emitted[0]["on"] == "finalized"

    # In V2 fail-closed pull architecture: claim is immediately in terminal DISPATCHED state
    assert escrow.get_claim(rel_res["claim_id"])["status"] == "DISPATCHED"

    # Repeated withdrawal of the same claim is strictly prevented
    with direct_vm.expect_revert("has already been dispatched"):
        escrow.withdraw_claim(rel_res["claim_id"])

    # Verify recipient balance increased and escrow balance decreased
    assert direct_vm._balances[_addr_bytes(direct_vm, freelancer_vault)] == 2_500_000
    assert escrow.get_escrow_summary()["contract_balance_wei"] == 0
    assert escrow.get_project(pid)["status"] == "COMPLETED"


def test_partial_funding_overfunding_and_zero_funding_rejected(
    direct_vm, direct_deploy, direct_accounts
):
    client = direct_accounts[0]
    freelancer = direct_accounts[1]

    _install_transfer_hook(direct_vm)
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")

    pid = escrow.create_project("Escrow Bounds Test", "Testing funding invariants", "", "")
    mid = escrow.add_milestone(
        pid,
        "Milestone 1",
        "Strict funding amount check",
        SAMPLE_CRITERIA,
        _hex(freelancer),
        _hex(freelancer),
        1_000_000,
    )

    # Zero value must revert
    direct_vm.value = 0
    with direct_vm.expect_revert("Funding requires non-zero native GEN transfer"):
        escrow.fund_milestone(mid)

    # Partial funding must revert
    direct_vm.deal(escrow.address, 500_000)
    direct_vm.value = 500_000
    with direct_vm.expect_revert("Partial funding rejected"):
        escrow.fund_milestone(mid)

    # Overfunding must revert
    direct_vm.deal(escrow.address, 1_500_000)
    direct_vm.value = 1_500_000
    with direct_vm.expect_revert("Overfunding rejected"):
        escrow.fund_milestone(mid)

    # Insufficient authoritative on-chain contract balance must revert
    direct_vm.deal(escrow.address, 400_000)
    direct_vm.value = 1_000_000
    with direct_vm.expect_revert("Authoritative on-chain balance"):
        escrow.fund_milestone(mid)
    direct_vm.value = 0


def test_unauthorized_calls_and_cross_user_isolation(
    direct_vm, direct_deploy, direct_accounts
):
    client_a = direct_accounts[0]
    freelancer_a = direct_accounts[1]
    attacker = direct_accounts[5]

    _install_transfer_hook(direct_vm)
    direct_vm.deal(client_a, 5_000_000)

    direct_vm.sender = client_a
    escrow = direct_deploy("contracts/trust_ledger.py")

    pid = escrow.create_project("Client A Project", "Confidential milestone escrow", "", "")
    mid = escrow.add_milestone(
        pid,
        "Milestone A1",
        "Deliverable for Client A",
        SAMPLE_CRITERIA,
        _hex(freelancer_a),
        _hex(freelancer_a),
        1_000_000,
    )

    # Attacker cannot add milestones to Client A's project
    direct_vm.sender = attacker
    with direct_vm.expect_revert("Only the project client can add milestones"):
        escrow.add_milestone(
            pid,
            "Malicious Milestone",
            "Steal funds",
            SAMPLE_CRITERIA,
            _hex(attacker),
            _hex(attacker),
            1_000_000,
        )

    # Attacker cannot fund Client A's milestone
    direct_vm.deal(escrow.address, 1_000_000)
    direct_vm.value = 1_000_000
    with direct_vm.expect_revert("Only the authorized project client can fund"):
        escrow.fund_milestone(mid)
    direct_vm.value = 0
    direct_vm.deal(escrow.address, 0)

    # Client A funds properly
    _fund_milestone_with_gen(direct_vm, escrow, client_a, mid, 1_000_000)

    # Attacker cannot submit evidence
    direct_vm.sender = attacker
    with direct_vm.expect_revert("Only the authorized freelancer can submit evidence"):
        escrow.submit_evidence(
            mid,
            "https://attacker.example.com/fake.json",
            "sha256:badbad",
            "Attacker submission notes",
        )

    # Client A cannot unilaterally refund while milestone is FUNDED (protects freelancer)
    direct_vm.sender = client_a
    with direct_vm.expect_revert("is not eligible for refund"):
        escrow.refund_milestone(mid)

    # Attacker cannot open dispute or release or refund
    direct_vm.sender = attacker
    with direct_vm.expect_revert("Only the project client or freelancer can open a dispute"):
        escrow.open_dispute(mid, "Unauthorized dispute attempt")
    with direct_vm.expect_revert("Unauthorized caller"):
        escrow.release_milestone(mid)
    with direct_vm.expect_revert("Unauthorized caller"):
        escrow.refund_milestone(mid)


def test_immutability_after_funding_and_mutual_recipient_amendment(
    direct_vm, direct_deploy, direct_accounts
):
    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    initial_vault = direct_accounts[2]
    new_vault = direct_accounts[3]

    _install_transfer_hook(direct_vm)
    direct_vm.deal(client, 5_000_000)

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    pid = escrow.create_project("Immutability Project", "Test post-funding immutability", "", "")
    mid = escrow.add_milestone(
        pid,
        "Milestone 1",
        "Immutable after funding",
        SAMPLE_CRITERIA,
        _hex(freelancer),
        _hex(initial_vault),
        1_000_000,
    )

    # Before funding, client can update recipient and amount
    escrow.update_unfunded_milestone(mid, _hex(initial_vault), 1_200_000)
    assert escrow.get_milestone(mid)["amount_wei"] == 1_200_000

    # Fund milestone
    _fund_milestone_with_gen(direct_vm, escrow, client, mid, 1_200_000)

    # After funding, unilateral update must fail
    direct_vm.sender = client
    with direct_vm.expect_revert("immutable after funding"):
        escrow.update_unfunded_milestone(mid, _hex(new_vault), 1_200_000)

    # Freelancer proposes new recipient vault; recipient does NOT change until client also approves
    direct_vm.sender = freelancer
    escrow.propose_recipient_amendment(mid, _hex(new_vault))
    assert escrow.get_milestone(mid)["recipient"].lower() == _hex(initial_vault).lower()

    direct_vm.sender = client
    escrow.approve_recipient_amendment(mid)
    assert escrow.get_milestone(mid)["recipient"].lower() == _hex(new_vault).lower()


def test_duplicate_settlement_replayed_decisions_and_insufficient_escrow(
    direct_vm, direct_deploy, direct_accounts
):
    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    vault = direct_accounts[2]

    _install_transfer_hook(direct_vm)
    direct_vm.deal(client, 10_000_000)

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    pid = escrow.create_project("Replay Guard Project", "Prevent double release & replay", "", "")
    mid = escrow.add_milestone(
        pid,
        "Milestone 1",
        "Security replay test",
        SAMPLE_CRITERIA,
        _hex(freelancer),
        _hex(vault),
        2_000_000,
    )

    _fund_milestone_with_gen(direct_vm, escrow, client, mid, 2_000_000)

    # Submit v1 evidence and get APPROVED
    direct_vm.sender = freelancer
    escrow.submit_evidence(
        mid,
        "https://trustledger.example.com/v1",
        "sha256:11111111",
        "First submission notes",
    )
    direct_vm.mock_web(
        r"trustledger\.example\.com/v1",
        {"status": 200, "body": "Complete deliverable C1 and C2"},
    )
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "inconclusive": False,
                "met_ids": ["C1", "C2"],
                "rationale": "Approved v1",
            }
        ),
    )
    escrow.evaluate_milestone(mid)
    assert escrow.get_milestone(mid)["status"] == "APPROVED"

    # If contract's on-chain GEN balance is drained/insufficient, release must revert
    snap = direct_vm.snapshot()
    direct_vm.deal(escrow.address, 500_000)
    with direct_vm.expect_revert("Insufficient on-chain contract GEN balance"):
        escrow.release_milestone(mid)
    direct_vm.revert(snap)

    # Release succeeds once
    escrow.release_milestone(mid)
    assert escrow.get_milestone(mid)["status"] == "RELEASED"

    # Duplicate release must revert
    with direct_vm.expect_revert("Duplicate release prevented"):
        escrow.release_milestone(mid)

    # Refund after release must also revert
    direct_vm.sender = client
    with direct_vm.expect_revert("Double refund prevented"):
        escrow.refund_milestone(mid)


def test_inconclusive_evaluation_and_rejected_refund_and_dispute_flow(
    direct_vm, direct_deploy, direct_accounts
):
    client = direct_accounts[0]
    freelancer = direct_accounts[1]
    freelancer_vault = direct_accounts[2]
    client_refund_vault = direct_accounts[3]
    arbitrator = direct_accounts[4]

    emitted = _install_transfer_hook(direct_vm)
    direct_vm.deal(client, 10_000_000)
    direct_vm.deal(client_refund_vault, 0)
    direct_vm.deal(freelancer_vault, 0)

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(freelancer_vault))
    escrow.register_approved_vault(_hex(client_refund_vault))
    pid = escrow.create_project(
        "Dispute & Refund Project",
        "Testing inconclusive, rejected, and disputed milestones",
        _hex(client_refund_vault),
        _hex(arbitrator),
    )

    # Milestone 1: INCONCLUSIVE -> resubmitted -> REJECTED -> refunded to client
    m1 = escrow.add_milestone(
        pid,
        "Milestone 1: Rejected Deliverable",
        "Must meet both C1 and C2",
        SAMPLE_CRITERIA,
        _hex(freelancer),
        _hex(freelancer_vault),
        1_500_000,
    )
    # Milestone 2: Disputed and resolved by arbitrator
    m2 = escrow.add_milestone(
        pid,
        "Milestone 2: Disputed Deliverable",
        "Subject to arbitration",
        SAMPLE_CRITERIA,
        _hex(freelancer),
        _hex(freelancer_vault),
        2_000_000,
    )

    _fund_milestone_with_gen(direct_vm, escrow, client, m1, 1_500_000)
    _fund_milestone_with_gen(direct_vm, escrow, client, m2, 2_000_000)

    # Submit v1 on m1 where evidence URL returns HTTP 503 -> INCONCLUSIVE
    direct_vm.sender = freelancer
    escrow.submit_evidence(
        m1,
        "https://trustledger.example.com/down-url",
        "sha256:v1down",
        "Initial submission while server down",
    )
    direct_vm.mock_web(
        r"trustledger\.example\.com/down-url",
        {"status": 503, "body": "Service Unavailable"},
    )
    eval_inc = escrow.evaluate_milestone(m1)
    assert eval_inc["verdict"] == "INCONCLUSIVE"
    assert eval_inc["status"] == "INCONCLUSIVE"

    # Neither release nor refund is permitted on INCONCLUSIVE!
    with direct_vm.expect_revert("not eligible for release"):
        escrow.release_milestone(m1)
    direct_vm.sender = client
    with direct_vm.expect_revert("not eligible for refund"):
        escrow.refund_milestone(m1)
    assert len(emitted) == 0

    # Freelancer submits v2 on m1, which is evaluated as REJECTED (missing mandatory C2)
    direct_vm.clear_mocks()
    direct_vm.sender = freelancer
    escrow.submit_evidence(
        m1,
        "https://trustledger.example.com/incomplete-v2",
        "sha256:v2incomplete",
        "Partial delivery without tests",
    )
    direct_vm.mock_web(
        r"trustledger\.example\.com/incomplete-v2",
        {"status": 200, "body": "Only C1 implemented; no tests written."},
    )
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "inconclusive": False,
                "met_ids": ["C1"],
                "rationale": "Mandatory criterion C2 (security test suite) was not met.",
            }
        ),
    )
    eval_rej = escrow.evaluate_milestone(m1)
    assert eval_rej["verdict"] == "REJECTED"
    assert eval_rej["score"] == 60
    assert eval_rej["mandatory_met"] is False
    assert eval_rej["status"] == "REJECTED"
    assert eval_rej["evaluated_version"] == 2

    # Client triggers refund on REJECTED milestone m1 -> creates refund claim
    direct_vm.sender = client
    ref_res = escrow.refund_milestone(m1)
    assert ref_res["status"] == "REFUNDED"
    assert ref_res["claim_status"] == "CLAIMABLE"
    assert ref_res["refunded_wei"] == 1_500_000

    # Client pulls refund via withdraw_claim (terminal DISPATCHED state)
    escrow.withdraw_claim(ref_res["claim_id"])
    assert escrow.get_claim(ref_res["claim_id"])["status"] == "DISPATCHED"
    assert direct_vm._balances[_addr_bytes(direct_vm, client_refund_vault)] == 1_500_000

    # Double refund on m1 must revert
    with direct_vm.expect_revert("Double refund prevented"):
        escrow.refund_milestone(m1)

    # Milestone 2: Open explicit dispute and resolve via arbitrator
    direct_vm.sender = freelancer
    escrow.open_dispute(m2, "Client scope creep beyond agreed acceptance criteria")
    assert escrow.get_milestone(m2)["status"] == "DISPUTED"

    # While DISPUTED, neither release nor refund can execute
    with direct_vm.expect_revert("not eligible for release"):
        escrow.release_milestone(m2)
    direct_vm.sender = client
    with direct_vm.expect_revert("not eligible for refund"):
        escrow.refund_milestone(m2)

    # Arbitrator resolves dispute in favor of RELEASE
    direct_vm.sender = arbitrator
    escrow.resolve_dispute(
        m2,
        "RELEASE",
        "Audit confirmed freelancer satisfied all original specifications.",
    )
    assert escrow.get_milestone(m2)["status"] == "RESOLVED_RELEASE"

    # Release creates freelancer payout claim
    rel_m2 = escrow.release_milestone(m2)
    assert rel_m2["status"] == "RELEASED"
    assert rel_m2["claim_status"] == "CLAIMABLE"
    assert rel_m2["released_wei"] == 2_000_000

    # Freelancer pulls payout (terminal DISPATCHED state)
    direct_vm.sender = freelancer
    escrow.withdraw_claim(rel_m2["claim_id"])
    assert escrow.get_claim(rel_m2["claim_id"])["status"] == "DISPATCHED"
    assert direct_vm._balances[_addr_bytes(direct_vm, freelancer_vault)] == 2_000_000
    assert escrow.get_escrow_summary()["contract_balance_wei"] == 0
    assert escrow.get_project(pid)["status"] == "COMPLETED"
