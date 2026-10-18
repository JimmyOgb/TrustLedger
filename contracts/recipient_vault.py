# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

ERROR_EXPECTED = "[EXPECTED]"


def _to_address(addr) -> Address:
    if isinstance(addr, Address):
        return addr
    if isinstance(addr, bytes):
        return Address(addr)
    return Address(str(addr).strip())


class TrustLedgerVault(gl.Contract):
    owner: Address
    label: str
    received_total_wei: u256
    withdrawn_total_wei: u256
    transfer_count: u256
    last_sender: Address
    last_amount_wei: u256

    def __init__(self, owner_address: str, label: str):
        owner_addr = (
            _to_address(owner_address)
            if owner_address and str(owner_address).strip()
            else _to_address(gl.message.sender_address)
        )
        self.owner = owner_addr
        self.label = label.strip() if label and label.strip() else "TrustLedger Recipient Vault"
        self.received_total_wei = u256(0)
        self.withdrawn_total_wei = u256(0)
        self.transfer_count = u256(0)
        self.last_sender = Address("0x0000000000000000000000000000000000000000")
        self.last_amount_wei = u256(0)

    @gl.public.write
    def __receive__(self) -> None:
        val = gl.message.value
        self.received_total_wei = self.received_total_wei + val
        self.transfer_count = self.transfer_count + u256(1)
        self.last_sender = _to_address(gl.message.sender_address)
        self.last_amount_wei = val

    @gl.public.write.payable
    def deposit(self) -> dict:
        val = gl.message.value
        if val <= u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Deposit value must be greater than 0")
        self.received_total_wei = self.received_total_wei + val
        self.transfer_count = self.transfer_count + u256(1)
        self.last_sender = _to_address(gl.message.sender_address)
        self.last_amount_wei = val
        return {
            "received_wei": int(val),
            "balance_wei": int(self.balance),
            "transfer_count": int(self.transfer_count),
        }

    @gl.public.write
    def transfer_out(self, target_vault: str, amount_wei: u256) -> dict:
        sender = _to_address(gl.message.sender_address)
        if sender != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the vault owner can transfer funds")
        amt = u256(amount_wei)
        if amt <= u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Transfer amount must be greater than 0")
        if self.balance < amt:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Insufficient vault GEN balance")
        self.withdrawn_total_wei = self.withdrawn_total_wei + amt
        target = _to_address(target_vault)
        gl.get_contract_at(target).emit_transfer(value=amt, on="finalized")
        return {
            "target": target.as_hex,
            "amount_wei": int(amt),
        }

    @gl.public.view
    def get_vault_state(self) -> dict:
        return {
            "owner": self.owner.as_hex,
            "label": self.label,
            "balance_wei": int(self.balance),
            "received_total_wei": int(self.received_total_wei),
            "withdrawn_total_wei": int(self.withdrawn_total_wei),
            "transfer_count": int(self.transfer_count),
            "last_sender": self.last_sender.as_hex,
            "last_amount_wei": int(self.last_amount_wei),
        }
