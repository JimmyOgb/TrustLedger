import pytest


def _hex(addr) -> str:
    if hasattr(addr, "as_hex"):
        return addr.as_hex
    if isinstance(addr, bytes):
        return "0x" + addr.hex()
    return str(addr)


def test_clean_v2_initial_state_and_no_preapproved_vaults(
    direct_vm, direct_deploy, direct_accounts
):
    """
    Test that a clean V2 instance:
    1. Stores the deploying address as deployer.
    2. Starts with ZERO pre-approved vaults (Run 2 addresses are not pre-approved).
    """
    deployer = direct_accounts[0]
    run_2_freelancer_vault = "0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775"
    run_2_client_vault = "0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068"

    direct_vm.sender = deployer
    escrow = direct_deploy("contracts/trust_ledger.py")

    assert escrow.get_deployer().lower() == _hex(deployer).lower()
    assert escrow.is_vault_approved(run_2_freelancer_vault) is False
    assert escrow.is_vault_approved(run_2_client_vault) is False


def test_unauthorized_vault_registration_rejected_before_storage(
    direct_vm, direct_deploy, direct_accounts
):
    """
    Test finding TL-SEC-01 remediation:
    An unauthorized caller (attacker) cannot register a vault address.
    Storage remains unmodified.
    """
    deployer = direct_accounts[0]
    attacker = direct_accounts[1]
    attacker_vault = direct_accounts[2]

    direct_vm.sender = deployer
    escrow = direct_deploy("contracts/trust_ledger.py")

    # Attacker attempts to register an unverified vault
    direct_vm.sender = attacker
    with pytest.raises(Exception, match=r"Unauthorized: Only the contract deployer"):
        escrow.register_approved_vault(_hex(attacker_vault))

    # Assert storage was not modified
    assert escrow.is_vault_approved(_hex(attacker_vault)) is False


def test_deployer_can_explicitly_register_approved_v2_vault(
    direct_vm, direct_deploy, direct_accounts
):
    """
    Test that authorized deployer can register legitimate recipient vaults post-deployment.
    """
    deployer = direct_accounts[0]
    freelancer_vault = direct_accounts[1]
    client_vault = direct_accounts[2]

    direct_vm.sender = deployer
    escrow = direct_deploy("contracts/trust_ledger.py")

    res1 = escrow.register_approved_vault(_hex(freelancer_vault))
    assert res1["approved"] is True
    assert escrow.is_vault_approved(_hex(freelancer_vault)) is True

    res2 = escrow.register_approved_vault(_hex(client_vault))
    assert res2["approved"] is True
    assert escrow.is_vault_approved(_hex(client_vault)) is True


def test_zero_and_invalid_vault_addresses_rejected(
    direct_vm, direct_deploy, direct_accounts
):
    """
    Test that zero address and invalid address formats are rejected even by deployer.
    """
    deployer = direct_accounts[0]
    direct_vm.sender = deployer
    escrow = direct_deploy("contracts/trust_ledger.py")

    zero_addr = "0x0000000000000000000000000000000000000000"
    with pytest.raises(Exception, match=r"Cannot approve zero address"):
        escrow.register_approved_vault(zero_addr)

    with pytest.raises(Exception, match=r"Invalid vault address"):
        escrow.register_approved_vault("")

    with pytest.raises(Exception, match=r"Invalid vault address"):
        escrow.register_approved_vault("   ")


def _addr_bytes(vm, addr) -> bytes:
    return vm._to_bytes(addr)


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


def test_unauthorized_caller_cannot_bypass_vault_restriction_on_withdrawal(
    direct_vm, direct_deploy, direct_accounts
):
    """
    Test that an attacker who is a legitimate beneficiary cannot withdraw to an unapproved vault.
    """
    import json
    deployer = direct_accounts[0]
    client = direct_accounts[1]
    freelancer = direct_accounts[2]
    unapproved_vault = direct_accounts[3]
    arbitrator = direct_accounts[4]

    direct_vm.deal(client, 1_000_000)

    direct_vm.sender = deployer
    escrow = direct_deploy("contracts/trust_ledger.py")

    # Client creates project with an unapproved vault as recipient
    direct_vm.sender = client
    pid = escrow.create_project(
        "Audit Project", "Full project description", _hex(unapproved_vault), _hex(arbitrator)
    )
    criteria = json.dumps([{"id": "C1", "description": "Deliverable", "weight": 100, "mandatory": True}])
    mid = escrow.add_milestone(
        pid, "Milestone 1", "Milestone description", criteria, _hex(freelancer), _hex(unapproved_vault), 100_000
    )

    # Fund milestone with helper that credits contract balance
    _fund_milestone(direct_vm, escrow, client, int(mid), 100_000)

    # Submit evidence and simulate APPROVED verdict
    direct_vm.sender = freelancer
    escrow.submit_evidence(mid, "https://example.com/ev", "sha256:abcd1234abcd1234abcd1234abcd1234", "Finished")

    direct_vm.mock_web(r".*", {"status": 200, "body": "Satisfied"})
    direct_vm.mock_llm(r".*", json.dumps({"inconclusive": False, "met_ids": ["C1"], "rationale": "Deliverable verified"}))

    direct_vm.sender = client
    escrow.evaluate_milestone(mid)

    # Client calls release_milestone (creates claim)
    direct_vm.sender = client
    rel_res = escrow.release_milestone(mid)
    cid = rel_res["claim_id"]

    # Freelancer attempts to withdraw to unapproved vault
    direct_vm.sender = freelancer
    with pytest.raises(Exception, match=r"is not an approved deployed vault"):
        escrow.withdraw_claim(cid)

    # Verify claim remains CLAIMABLE and balance is safe
    summary = escrow.get_escrow_summary()
    assert summary["total_escrow_claimable_wei"] == 100_000
    assert summary["total_escrow_dispatched_wei"] == 0
