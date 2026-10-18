# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TrustLedger — Adversarial Review Test Suite for Pull-Withdrawal Implementation
Target Contract: contracts/trust_ledger.py

This suite verifies that the critical vulnerabilities identified during the adversarial review
(TL-ADV-01 through TL-ADV-05) have been permanently resolved and neutralized in V2:
1. Pending child transfer cannot enable retries or double payouts (Failure Modes 1 & 6).
2. Unconfirmed withdrawal does not create ghost liabilities or brick contract operations (Failure Modes 4, 5, 7 & 8).
3. Claims are strictly isolated without cross-claim balance blocking (Failure Modes 2 & 5).
4. Counterparty premature confirmation is eliminated because unverified confirmations are removed (Failure Mode 3).
"""

import json
import pytest

SAMPLE_CRITERIA = json.dumps(
    [
        {
            "id": "C1",
            "description": "Adversarial test criteria",
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
# ADVERSARIAL TEST 1: PENDING CHILD TRANSFER DOUBLE-PAYOUT MITIGATION
# (Failure Modes 1 & 6 Neutralized)
# ==============================================================================

def test_adversarial_pending_child_transfer_enables_double_payout(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [SIMULATED PROTOCOL ADVERSARIAL VERIFICATION]
    Verifies that the double-payout exploit via retry_failed_withdrawal is neutralized:
    1. Calling withdraw_claim emits exactly one child transfer.
    2. The claim immediately transitions to terminal DISPATCHED status.
    3. retry_failed_withdrawal has been permanently removed from the contract.
    4. Repeated withdraw_claim calls revert with 'has already been dispatched'.
    5. Recipient vault receives exactly the authorized amount (100k), and other depositors'
       funds (Project 2's 100k) remain fully solvent in escrow.
    """
    emitted_transfers = []
    execute_transfers_immediately = False  # Simulates pending asynchronous child queue

    def _async_queue_hook(vm_ctx, request):
        msg = None
        if isinstance(request, dict):
            msg = request.get("EmitInternalMessage") or request.get("PostMessage")
        if msg is not None:
            to_addr = msg.get("address")
            val = int(msg.get("value", 0))
            contract_bytes = _addr_bytes(vm_ctx, vm_ctx._contract_address)
            to_bytes = _addr_bytes(vm_ctx, to_addr)

            emitted_transfers.append(
                {
                    "to": _hex(to_addr),
                    "value": val,
                    "target_bytes": to_bytes,
                }
            )

            if execute_transfers_immediately:
                cur_bal = vm_ctx._balances.get(contract_bytes, 0)
                vm_ctx._balances[contract_bytes] = cur_bal - val
                vm_ctx._balances[to_bytes] = vm_ctx._balances.get(to_bytes, 0) + val

            return {"ok": None}
        return None

    direct_vm._gl_call_hook = _async_queue_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    # Setup contract with two funded milestones from different projects
    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid1 = escrow.create_project("Project 1", "Description of project", _hex(c_vault), _hex(arbitrator))
    m1 = escrow.add_milestone(pid1, "Milestone 1", "Description of project", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(m1), 100_000)

    pid2 = escrow.create_project("Project 2", "Description of project", _hex(c_vault), _hex(arbitrator))
    m2 = escrow.add_milestone(pid2, "Milestone 2", "Description of project", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(m2), 100_000)

    assert direct_vm._balances[_addr_bytes(direct_vm, direct_vm._contract_address)] == 200_000

    # Settle Milestone 1
    direct_vm.sender = client
    escrow.open_dispute(m1, "Dispute")
    escrow.resolve_dispute(m1, "RELEASE", "Concession")
    rel_res = escrow.release_milestone(m1)
    cid = rel_res["claim_id"]

    # 1. First withdrawal call
    direct_vm.sender = freelancer
    w1 = escrow.withdraw_claim(cid)
    assert w1["status"] == "DISPATCHED"
    assert len(emitted_transfers) == 1
    # Child transfer is pending in consensus queue; contract balance is NOT yet debited
    assert direct_vm._balances[_addr_bytes(direct_vm, direct_vm._contract_address)] == 200_000

    # 2. In V2, retry_failed_withdrawal is permanently removed!
    assert not hasattr(escrow, "retry_failed_withdrawal")

    # 3. Attacker attempts to call withdraw_claim a second time on the same claim: MUST REJECT
    with pytest.raises(Exception, match="has already been dispatched"):
        escrow.withdraw_claim(cid)
    assert len(emitted_transfers) == 1  # Exactly ONE child transfer dispatched

    # 4. Process child queue
    contract_bytes = _addr_bytes(direct_vm, direct_vm._contract_address)
    for transfer in emitted_transfers:
        cur_bal = direct_vm._balances.get(contract_bytes, 0)
        direct_vm._balances[contract_bytes] = cur_bal - transfer["value"]
        direct_vm._balances[transfer["target_bytes"]] = (
            direct_vm._balances.get(transfer["target_bytes"], 0) + transfer["value"]
        )

    # MITIGATION PROVEN:
    # Recipient vault received exactly 100,000 wei (no double payout)
    assert direct_vm._balances[_addr_bytes(direct_vm, f_vault)] == 100_000
    # Escrow contract balance retains Project 2's locked 100,000 wei intact!
    assert direct_vm._balances[contract_bytes] == 100_000
    summary = escrow.get_escrow_summary()
    assert summary["contract_balance_wei"] == 100_000
    assert summary["total_escrow_locked_wei"] == 100_000
    assert summary["total_escrow_claimable_wei"] == 0
    assert summary["total_escrow_dispatched_wei"] == 100_000


# ==============================================================================
# ADVERSARIAL TEST 2: GHOST LIABILITY / BRICKING VULNERABILITY NEUTRALIZED
# (Failure Modes 4, 5, 7 & 8 Neutralized)
# ==============================================================================

def test_adversarial_unconfirmed_withdrawal_bricks_entire_contract(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [SIMULATED PROTOCOL ADVERSARIAL VERIFICATION]
    Verifies that unconfirmed withdrawals can no longer brick the contract:
    In V2, withdraw_claim immediately moves liability from claimable to quarantined
    dispatched. No unverified confirm_claim_withdrawn is required.
    Active solvency (self.balance >= locked + claimable) is maintained at all times,
    allowing Project 2 to release and Project 3 to fund milestones without hindrance.
    """
    emitted = []

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
            emitted.append({"to": _hex(to_addr), "value": val})
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = _sync_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    # Project 1: Milestone 1 = 100,000 wei
    pid1 = escrow.create_project("Project 1", "Description of project", _hex(c_vault), _hex(arbitrator))
    m1 = escrow.add_milestone(pid1, "Milestone 1", "Description of project", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(m1), 100_000)

    # Project 2: Milestone 2 = 200,000 wei
    pid2 = escrow.create_project("Project 2", "Description of project", _hex(c_vault), _hex(arbitrator))
    m2 = escrow.add_milestone(pid2, "Milestone 2", "Description of project", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 200_000)
    _fund_milestone(direct_vm, escrow, client, int(m2), 200_000)

    assert direct_vm._balances[_addr_bytes(direct_vm, direct_vm._contract_address)] == 300_000

    # Milestone 1 is approved and released -> Claim 1 created (100k)
    direct_vm.sender = client
    escrow.open_dispute(m1, "Dispute")
    escrow.resolve_dispute(m1, "RELEASE", "Concession")
    rel_res = escrow.release_milestone(m1)
    cid1 = rel_res["claim_id"]

    # Freelancer withdraws Claim 1
    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid1)

    # In V2, claimable liability is 0 immediately upon dispatch!
    summary = escrow.get_escrow_summary()
    assert summary["contract_balance_wei"] == 200_000
    assert summary["total_escrow_locked_wei"] == 200_000
    assert summary["total_escrow_claimable_wei"] == 0  # NO GHOST LIABILITY!
    assert summary["total_escrow_dispatched_wei"] == 100_000

    # Active solvency holds: balance (200k) >= locked (200k) + claimable (0)
    # Project 2 can release Milestone 2 without being blocked!
    direct_vm.sender = client
    escrow.open_dispute(m2, "Dispute M2")
    escrow.resolve_dispute(m2, "RELEASE", "Concession M2")
    rel_res2 = escrow.release_milestone(m2)
    assert rel_res2["status"] == "RELEASED"

    # Project 3 can fund a new milestone without being blocked!
    pid3 = escrow.create_project("Project 3", "Description of project", _hex(c_vault), _hex(arbitrator))
    m3 = escrow.add_milestone(pid3, "Milestone 3", "Description of project", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 50_000)
    fund_res = _fund_milestone(direct_vm, escrow, client, int(m3), 50_000)
    assert fund_res["status"] == "FUNDED"


# ==============================================================================
# ADVERSARIAL TEST 3: CROSS-CLAIM BLOCKING NEUTRALIZED
# (Failure Modes 2, 5 & 7 Neutralized)
# ==============================================================================

def test_adversarial_unconfirmed_claim_blocks_retry_of_failed_claim(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [SIMULATED PROTOCOL ADVERSARIAL VERIFICATION]
    Verifies that claims are strictly independent in V2.
    Claim 1's withdrawal does not affect Claim 2's accounting, and unverified
    shared balance dependencies are removed.
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

            # First transfer succeeds; second transfer stays pending / fails
            if len(emitted) == 1:
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

    pid1 = escrow.create_project("Project 1", "Description of project", _hex(c_vault), _hex(arbitrator))
    m1 = escrow.add_milestone(pid1, "Milestone 1", "Description of project", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(m1), 100_000)

    pid2 = escrow.create_project("Project 2", "Description of project", _hex(c_vault), _hex(arbitrator))
    m2 = escrow.add_milestone(pid2, "Milestone 2", "Description of project", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 50_000)
    _fund_milestone(direct_vm, escrow, client, int(m2), 50_000)

    # Release both milestones into claims
    direct_vm.sender = client
    escrow.open_dispute(m1, "Dispute 1")
    escrow.resolve_dispute(m1, "RELEASE", "Concession 1")
    cid1 = escrow.release_milestone(m1)["claim_id"]

    escrow.open_dispute(m2, "Dispute 2")
    escrow.resolve_dispute(m2, "RELEASE", "Concession 2")
    cid2 = escrow.release_milestone(m2)["claim_id"]

    # Freelancer withdraws Claim 1 -> Succeeds, debits 100k
    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid1)
    assert direct_vm._balances[_addr_bytes(direct_vm, direct_vm._contract_address)] == 50_000

    # Freelancer withdraws Claim 2 -> Dispatched
    escrow.withdraw_claim(cid2)
    assert escrow.get_claim(cid2)["status"] == "DISPATCHED"

    # Both claims safely accounted as dispatched
    summary = escrow.get_escrow_summary()
    assert summary["total_escrow_claimable_wei"] == 0
    assert summary["total_escrow_dispatched_wei"] == 150_000
    assert summary["total_escrow_locked_wei"] == 0


# ==============================================================================
# ADVERSARIAL TEST 4: COUNTERPARTY PREMATURE CONFIRMATION EXPLOIT ELIMINATED
# (Failure Mode 3 Neutralized)
# ==============================================================================

def test_adversarial_counterparty_premature_confirmation_traps_failed_payout(
    direct_vm, direct_deploy, direct_accounts
):
    """
    [SIMULATED PROTOCOL ADVERSARIAL VERIFICATION]
    Verifies that confirm_claim_withdrawn is permanently removed from V2,
    so an adversarial counterparty has no interface to manipulate claim states
    or falsely confirm payouts.
    """
    def _failure_hook(vm_ctx, request):
        return {"ok": None}

    direct_vm._gl_call_hook = _failure_hook

    client, freelancer, f_vault, c_vault, arbitrator = direct_accounts[:5]

    direct_vm.sender = client
    escrow = direct_deploy("contracts/trust_ledger.py")
    escrow.register_approved_vault(_hex(f_vault))
    escrow.register_approved_vault(_hex(c_vault))

    pid = escrow.create_project("Project 1", "Description of project", _hex(c_vault), _hex(arbitrator))
    mid = escrow.add_milestone(pid, "Milestone 1", "Description of project", SAMPLE_CRITERIA, _hex(freelancer), _hex(f_vault), 100_000)
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    escrow.open_dispute(mid, "Dispute")
    escrow.resolve_dispute(mid, "RELEASE", "Concession")
    cid = escrow.release_milestone(mid)["claim_id"]

    direct_vm.sender = freelancer
    escrow.withdraw_claim(cid)

    # In V2, confirm_claim_withdrawn is permanently removed!
    assert not hasattr(escrow, "confirm_claim_withdrawn")
    assert not hasattr(escrow, "retry_failed_withdrawal")
