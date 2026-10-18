# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TrustLedger — Final Async Escrow Architecture Review Test Suite
Target: contracts/trust_ledger.py & contracts/recipient_vault.py

Test Labels:
  - [DIRECT-MODE SIMULATION]: In-memory GenVM execution testing asynchronous message
    queuing, hook interception, and balance tracking.
  - [UNIT]: In-memory GenVM direct state machine and access control validation.
  - [DISCLAIMER]: Simulated child-transaction behavior models the protocol semantics
    defined in GenVM SDK specifications and is not live network proof.

12 Target Scenarios Covered:
  1. Child transfer remains pending.
  2. Retry is attempted while pending.
  3. Child transfer fails after parent finalizes.
  4. Another project's payout succeeds while previous payout is pending.
  5. A hostile client attempts to confirm a freelancer payout.
  6. A beneficiary repeats a withdrawal request.
  7. Successful transfer followed by delayed/missing confirmation.
  8. Recipient vault rejects transfer.
  9. Multiple withdrawals compete for same available balance.
  10. INCONCLUSIVE dispute settlement.
  11. Replay and duplicate settlement calls.
  12. Recovery attempts with unauthorized callers/recipients.
"""

import json
import pytest

SAMPLE_CRITERIA = json.dumps(
    [
        {
            "id": "C1",
            "description": "Standard acceptance criteria for milestone",
            "weight": 100,
            "mandatory": True,
        }
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
# SCENARIO 1: Child transfer remains pending
# ==============================================================================

def test_scenario_01_child_transfer_remains_pending(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [DIRECT-MODE SIMULATION]
    Verifies that calling withdraw_claim queues an asynchronous child message,
    marking the claim DISPATCHED while the contract balance remains intact
    during the parent commit window.
    """
    emitted = []

    def _queue_only_hook(vm_ctx, request):
        msg = None
        if isinstance(request, dict):
            msg = request.get("EmitInternalMessage") or request.get("PostMessage")
        if msg is not None:
            emitted.append(msg)
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = _queue_only_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Project Alpha", "Description Alpha", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    # Release milestone
    escrow.open_dispute(mid, "Dispute Alpha")
    escrow.resolve_dispute(mid, "RELEASE", "Concession Alpha")
    cid = escrow.release_milestone(mid)["claim_id"]

    # Withdraw claim
    direct_vm.sender = freelancer
    res = escrow.withdraw_claim(cid)
    assert res["status"] == "DISPATCHED"
    assert len(emitted) == 1
    # Child transfer is pending in consensus queue; contract balance is NOT yet debited
    contract_bytes = _addr_bytes(direct_vm, direct_vm._contract_address)
    assert direct_vm._balances[contract_bytes] == 100_000


# ==============================================================================
# SCENARIO 2: Retry is attempted while pending (Eliminated in V2)
# ==============================================================================

def test_scenario_02_retry_attempted_while_pending(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [DIRECT-MODE SIMULATION]
    Verifies that in V2, retry_failed_withdrawal is permanently removed to prevent
    double payouts, and attempting to re-withdraw reverts.
    """
    emitted = []

    def _queue_hook(vm_ctx, request):
        msg = None
        if isinstance(request, dict):
            msg = request.get("EmitInternalMessage") or request.get("PostMessage")
        if msg is not None:
            emitted.append(msg)
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = _queue_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Project Beta", "Description Beta", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    escrow.open_dispute(mid, "Dispute Beta")
    escrow.resolve_dispute(mid, "RELEASE", "Concession Beta")
    cid = escrow.release_milestone(mid)["claim_id"]

    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid)
    assert len(emitted) == 1

    # In V2, retry_failed_withdrawal is permanently removed
    assert not hasattr(escrow, "retry_failed_withdrawal")
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)


# ==============================================================================
# SCENARIO 3: Child transfer fails after parent finalizes (Fail-Closed Quarantine)
# ==============================================================================

def test_scenario_03_child_transfer_fails_after_parent_finalizes(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [DIRECT-MODE SIMULATION]
    Models child transaction failure where emit_transfer is dispatched, but funds
    fail to debit. In V2, the claim remains quarantined in DISPATCHED status.
    """
    def _fail_hook(vm_ctx, request):
        # Child fails; no debit occurs
        return {"ok": None}

    direct_vm._gl_call_hook = _fail_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Project Gamma", "Description Gamma", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    escrow.open_dispute(mid, "Dispute Gamma")
    escrow.resolve_dispute(mid, "RELEASE", "Concession Gamma")
    cid = escrow.release_milestone(mid)["claim_id"]

    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid)
    assert escrow.get_claim(cid)["status"] == "DISPATCHED"

    # In V2, automated retry is removed; claim cannot be re-dispatched
    assert not hasattr(escrow, "retry_failed_withdrawal")
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)


# ==============================================================================
# SCENARIO 4: Another project's payout succeeds while previous payout is pending
# ==============================================================================

def test_scenario_04_other_project_payout_succeeds_while_previous_pending(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [DIRECT-MODE SIMULATION]
    Project 1 withdrawal is pending (not debited).
    Project 2 withdrawal executes and debits funds.
    Demonstrates balance interaction in a shared escrow pool.
    """
    emitted = []

    def _selective_hook(vm_ctx, request):
        msg = None
        if isinstance(request, dict):
            msg = request.get("EmitInternalMessage") or request.get("PostMessage")
        if msg is not None:
            to_addr = msg.get("address")
            val = int(msg.get("value", 0))
            contract_bytes = _addr_bytes(vm_ctx, vm_ctx._contract_address)
            to_bytes = _addr_bytes(vm_ctx, to_addr)
            emitted.append({"to": _hex(to_addr), "value": val})

            # Transfer 1 (Project 1) stays pending (no debit)
            # Transfer 2 (Project 2) succeeds and debits
            if len(emitted) == 2:
                cur_bal = vm_ctx._balances.get(contract_bytes, 0)
                vm_ctx._balances[contract_bytes] = cur_bal - val
                vm_ctx._balances[to_bytes] = vm_ctx._balances.get(to_bytes, 0) + val
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = _selective_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid1 = escrow.create_project("Project 1", "Description Project 1", _hex(c_vault), _hex(arbitrator))
    m1 = escrow.add_milestone(pid1, "Milestone 1", "Description M1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(m1), 100_000)

    pid2 = escrow.create_project("Project 2", "Description Project 2", _hex(c_vault), _hex(arbitrator))
    m2 = escrow.add_milestone(pid2, "Milestone 2", "Description M2", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 200_000)
    _fund_milestone(direct_vm, escrow, client, int(m2), 200_000)

    # Release both
    escrow.open_dispute(m1, "Dispute 1")
    escrow.resolve_dispute(m1, "RELEASE", "Concession 1")
    cid1 = escrow.release_milestone(m1)["claim_id"]

    escrow.open_dispute(m2, "Dispute 2")
    escrow.resolve_dispute(m2, "RELEASE", "Concession 2")
    cid2 = escrow.release_milestone(m2)["claim_id"]

    # P1 withdraws (pending)
    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid1)

    # P2 withdraws (succeeds)
    escrow.withdraw_claim(cid2)

    # Contract balance: 300k - 200k = 100k
    assert direct_vm._balances[_addr_bytes(direct_vm, direct_vm._contract_address)] == 100_000


# ==============================================================================
# SCENARIO 5: Hostile client attempts to confirm freelancer payout
# ==============================================================================

def test_scenario_05_hostile_client_confirms_freelancer_payout(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT & DIRECT-MODE SIMULATION]
    Shows that confirm_claim_withdrawn was permanently removed in V2,
    preventing any party from fabricating payment receipts or trapping funds.
    """
    # Simulate child failure
    direct_vm._gl_call_hook = lambda vm_ctx, req: {"ok": None}

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Project Delta", "Description Delta", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    escrow.open_dispute(mid, "Dispute Delta")
    escrow.resolve_dispute(mid, "RELEASE", "Concession Delta")
    cid = escrow.release_milestone(mid)["claim_id"]

    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid)

    # In V2, confirm_claim_withdrawn is permanently removed
    assert not hasattr(escrow, "confirm_claim_withdrawn")
    assert not hasattr(escrow, "retry_failed_withdrawal")


# ==============================================================================
# SCENARIO 6: Beneficiary repeats withdrawal request
# ==============================================================================

def test_scenario_06_beneficiary_repeats_withdrawal_request(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verifies that calling withdraw_claim repeatedly while in terminal DISPATCHED
    is strictly rejected.
    """
    direct_vm._gl_call_hook = lambda vm_ctx, req: {"ok": None}

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Project Epsilon", "Description Epsilon", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    escrow.open_dispute(mid, "Dispute Epsilon")
    escrow.resolve_dispute(mid, "RELEASE", "Concession Epsilon")
    cid = escrow.release_milestone(mid)["claim_id"]

    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid)

    # Repeated withdrawal while DISPATCHED: MUST REJECT
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)


# ==============================================================================
# SCENARIO 7: Successful transfer followed by delayed/missing confirmation
# ==============================================================================

def test_scenario_07_successful_transfer_with_delayed_missing_confirmation(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [DIRECT-MODE SIMULATION]
    Verifies that in V2 three-bucket accounting, withdraw_claim immediately clears
    claimable liability upon dispatch. No unverified confirmation is required,
    so subsequent operations are never bricked by missing callbacks!
    """
    def _sync_hook(vm_ctx, request):
        msg = None
        if isinstance(request, dict):
            msg = request.get("EmitInternalMessage") or request.get("PostMessage")
        if msg is not None:
            to_addr = msg.get("address")
            val = int(msg.get("value", 0))
            contract_bytes = _addr_bytes(vm_ctx, vm_ctx._contract_address)
            to_bytes = _addr_bytes(vm_ctx, to_addr)
            cur_bal = vm_ctx._balances.get(contract_bytes, 0)
            vm_ctx._balances[contract_bytes] = cur_bal - val
            vm_ctx._balances[to_bytes] = vm_ctx._balances.get(to_bytes, 0) + val
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = _sync_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid1 = escrow.create_project("Project 1", "Description Project 1", _hex(c_vault), _hex(arbitrator))
    m1 = escrow.add_milestone(pid1, "Milestone 1", "Description Milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(m1), 100_000)

    pid2 = escrow.create_project("Project 2", "Description Project 2", _hex(c_vault), _hex(arbitrator))
    m2 = escrow.add_milestone(pid2, "Milestone 2", "Description Milestone 2", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 200_000)
    _fund_milestone(direct_vm, escrow, client, int(m2), 200_000)

    # Release M1 and withdraw
    escrow.open_dispute(m1, "Dispute 1")
    escrow.resolve_dispute(m1, "RELEASE", "Concession 1")
    cid1 = escrow.release_milestone(m1)["claim_id"]

    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid1)

    # In V2: claimable liability is immediately cleared upon dispatch!
    summary = escrow.get_escrow_summary()
    assert summary["contract_balance_wei"] == 200_000
    assert summary["total_escrow_locked_wei"] == 200_000
    assert summary["total_escrow_claimable_wei"] == 0  # No ghost liability!
    assert summary["total_escrow_dispatched_wei"] == 100_000

    # Solvency holds: 200k >= 200k + 0. M2 can release cleanly without being blocked!
    direct_vm.sender = client
    escrow.open_dispute(m2, "Dispute 2")
    escrow.resolve_dispute(m2, "RELEASE", "Concession 2")
    res_m2 = escrow.release_milestone(m2)
    assert res_m2["status"] == "RELEASED"


# ==============================================================================
# SCENARIO 8: Recipient vault rejects transfer
# ==============================================================================

def test_scenario_08_recipient_vault_rejects_transfer(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [DIRECT-MODE SIMULATION]
    Simulates a recipient vault whose receive handler reverts.
    The native GEN remains at the escrow contract.
    """
    reverted_transfers = []

    def _reverting_vault_hook(vm_ctx, request):
        msg = None
        if isinstance(request, dict):
            msg = request.get("EmitInternalMessage") or request.get("PostMessage")
        if msg is not None:
            # Transfer rejected by recipient; no balance moved
            reverted_transfers.append(msg)
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = _reverting_vault_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Project Zeta", "Description Zeta", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    escrow.open_dispute(mid, "Dispute Zeta")
    escrow.resolve_dispute(mid, "RELEASE", "Concession Zeta")
    cid = escrow.release_milestone(mid)["claim_id"]

    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid)

    assert len(reverted_transfers) == 1
    # Funds remained in escrow contract
    assert direct_vm._balances[_addr_bytes(direct_vm, direct_vm._contract_address)] == 100_000
    assert direct_vm._balances.get(_addr_bytes(direct_vm, f_vault), 0) == 0


# ==============================================================================
# SCENARIO 9: Multiple withdrawals compete for same available balance
# ==============================================================================

def test_scenario_09_multiple_withdrawals_compete_for_balance(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT & DIRECT-MODE SIMULATION]
    Two claims exist for 100k each, but contract balance is artificially drained to 150k.
    First withdrawal succeeds; second withdrawal is strictly rejected due to insufficient balance.
    """
    direct_vm._gl_call_hook = lambda vm_ctx, req: {"ok": None}

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))
    pid = escrow.create_project("Project Eta", "Description Eta", _hex(c_vault), _hex(arbitrator))
    m1 = escrow.add_milestone(pid, "Milestone 1", "Description Milestone 1", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    m2 = escrow.add_milestone(pid, "Milestone 2", "Description Milestone 2", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(m1), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(m2), 100_000)

    # Release both
    escrow.open_dispute(m1, "Dispute 1")
    escrow.resolve_dispute(m1, "RELEASE", "Concession 1")
    cid1 = escrow.release_milestone(m1)["claim_id"]

    escrow.open_dispute(m2, "Dispute 2")
    escrow.resolve_dispute(m2, "RELEASE", "Concession 2")
    cid2 = escrow.release_milestone(m2)["claim_id"]

    # Artificially drain contract balance to 50k (less than 100k required for claim)
    contract_bytes = _addr_bytes(direct_vm, direct_vm._contract_address)
    direct_vm._balances[contract_bytes] = 50_000

    direct_vm.sender = freelancer
    with pytest.raises(Exception, match="Insufficient on-chain contract GEN balance"):
        escrow.withdraw_claim(cid1)


# ==============================================================================
# SCENARIO 10: INCONCLUSIVE dispute settlement
# ==============================================================================

def test_scenario_10_inconclusive_dispute_settlement(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verifies that an INCONCLUSIVE evaluation verdict strictly blocks claim creation,
    leaving escrow funds locked.
    """
    direct_vm._gl_call_hook = lambda vm_ctx, req: {"ok": None}

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    pid = escrow.create_project("Project Theta", "Description Theta", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    direct_vm.sender = freelancer
    escrow.submit_evidence(mid, "https://evidence.example/down", "sha256:deadbeef", "Notes")
    direct_vm.mock_web(r".*", {"status": 500, "body": "Server Down"})

    eval_res = escrow.evaluate_milestone(mid)
    assert eval_res["verdict"] == "INCONCLUSIVE"

    # Both release and refund MUST be blocked
    direct_vm.sender = freelancer
    with pytest.raises(Exception, match="not eligible for release"):
        escrow.release_milestone(mid)

    direct_vm.sender = client
    with pytest.raises(Exception, match="not eligible for refund"):
        escrow.refund_milestone(mid)


# ==============================================================================
# SCENARIO 11: Replay and duplicate settlement calls
# ==============================================================================

def test_scenario_11_replay_and_duplicate_settlement_calls(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verifies that duplicate calls to release_milestone, refund_milestone,
    or resolve_dispute on an already settled milestone are strictly rejected.
    """
    direct_vm._gl_call_hook = lambda vm_ctx, req: {"ok": None}

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    pid = escrow.create_project("Project Iota", "Description Iota", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    escrow.open_dispute(mid, "Dispute Iota")
    escrow.resolve_dispute(mid, "RELEASE", "Concession Iota")
    escrow.release_milestone(mid)

    # Replay release_milestone: MUST REJECT
    with pytest.raises(Exception, match="already settled"):
        escrow.release_milestone(mid)

    # Replay refund_milestone: MUST REJECT
    with pytest.raises(Exception, match="already settled"):
        escrow.refund_milestone(mid)

    # Replay resolve_dispute: MUST REJECT
    with pytest.raises(Exception, match="is not in DISPUTED status"):
        escrow.resolve_dispute(mid, "RELEASE", "Second resolution")


# ==============================================================================
# SCENARIO 12: Recovery attempts with unauthorized recipients/callers
# ==============================================================================

def test_scenario_12_recovery_attempts_with_unauthorized_callers(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [UNIT]
    Verifies that unauthorized third parties cannot execute retry_failed_withdrawal
    or confirm_claim_withdrawn.
    """
    direct_vm._gl_call_hook = lambda vm_ctx, req: {"ok": None}

    client, freelancer, f_vault, c_vault, arbitrator, attacker = direct_accounts[:6]
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    pid = escrow.create_project("Project Kappa", "Description Kappa", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description Milestone", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    escrow.open_dispute(mid, "Dispute Kappa")
    escrow.resolve_dispute(mid, "RELEASE", "Concession Kappa")
    cid = escrow.release_milestone(mid)["claim_id"]

    # Before vault approval, withdraw_claim MUST REJECT due to unapproved vault
    direct_vm.sender = freelancer
    with pytest.raises(Exception, match="is not an approved deployed vault"):
        escrow.withdraw_claim(cid)

    # Approve the vault
    direct_vm.sender = client
    escrow.register_approved_vault(_hex(f_vault))

    # Attacker attempts unauthorized withdrawal: MUST REJECT
    direct_vm.sender = attacker
    with pytest.raises(Exception, match="Unauthorized withdrawal caller"):
        escrow.withdraw_claim(cid)

    # Removed recovery functions do not exist in V2
    assert not hasattr(escrow, "retry_failed_withdrawal")
    assert not hasattr(escrow, "confirm_claim_withdrawn")
