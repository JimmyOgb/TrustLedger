# TrustLedger — Final Async Escrow Architecture Review & Pre-Deployment Safety Gate

**Date:** October 16, 2026  
**Auditor / Architect:** Antigravity Autonomous Security & Verification Suite  
**Scope:** GenLayer StudioNet (`chainId: 61999`, `0xf22f`), GenVM Runner `v0.6.0-rc9` / `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`  
**Target Codebase:** `contracts/trust_ledger.py`, `contracts/recipient_vault.py`  
**Companion Documents:** `ADVERSARIAL_WITHDRAWAL_REVIEW.md`, `REMEDIATION_REPORT.md`  

---

## EXECUTIVE SUMMARY & SAFETY GATE VERDICT

### 1. Current Implementation in `contracts/trust_ledger.py`: **NOT READY**
The existing codebase on disk contains active, proven vulnerabilities:
- Race condition permitting double payouts via pending child retry (`TL-ADV-01`).
- Solvency invariant breakdown that deadlocks milestone funding and releases across unrelated projects (`TL-ADV-02`).
- Broken balance heuristics blocking retries of failed claims (`TL-ADV-03`).
- Hostile counterparty confirmation trapping beneficiary payouts (`TL-ADV-04`).
- Missing in-flight liability segregation (`TL-ADV-05`).

### 2. Proposed Target Architecture Specification (V2 Post-Remediation): **READY WITH EXPLICIT LIMITATIONS**
The architecture is approved for implementation and testnet deployment **only under the explicit, uncompromising constraints defined in this review**:
1. **On-Chain Recovery Stripped Out:** Because GenVM lacks message cancellation or cryptographic death proofs for internal messages, any timelocked or arbitrator-based on-chain recovery risks double spend if the delayed message executes later. **All automated and arbitrator on-chain recovery mechanisms are permanently removed.**
2. **Unverified Confirmation Stripped Out:** No contract or user can prove child transfer success on-chain without protocol receipts. `confirm_claim_withdrawn()` is **permanently removed**. Dispatch is the terminal on-chain state for the escrow contract.
3. **Strict Dispatched Quarantine:** Dispatched liabilities are immediately quarantined from active solvency equations ($\text{self.balance} \ge \text{locked} + \text{claimable}$), mathematically guaranteeing that delayed or stranded child transfers cannot brick unrelated projects.
4. **Permanent Protocol Limitations Acknowledged:** If an asynchronous child transfer fails at the protocol or validator transport layer, native GEN remains stranded in the contract at the protocol level. It cannot be recovered on-chain without risking double payouts.

---

## DEPLOYMENT-BLOCKER MATRIX

| Blocker ID | Root Cause / Vulnerability | Severity | Exploit / Failure Demonstration | Resolution Required for V2 | Implementation Status |
|---|---|---|---|---|---|
| **BLK-01** | `retry_failed_withdrawal` checks undepleted `self.balance` while child tx is pending, resetting claim to `CLAIMABLE`. | **CRITICAL** | `test_adversarial_pending_child_transfer_enables_double_payout` | **Delete `retry_failed_withdrawal` completely.** Banned from V2. No automated or heuristic retry permitted. | **BLOCKED** in current code; specified for removal. |
| **BLK-02** | `fund_milestone`, `release_milestone`, and `refund_milestone` check `self.balance < locked + claimable`, where `claimable` retains dispatched funds. | **CRITICAL** | `test_adversarial_unconfirmed_withdrawal_bricks_entire_contract` | **Quarantine `dispatched_wei`.** Deduct from `claimable_wei` upon dispatch. Active solvency: $\text{balance} \ge \text{locked} + \text{claimable}$. | **BLOCKED** in current code; specified for fix. |
| **BLK-03** | `confirm_claim_withdrawn` allows hostile client to confirm freelancer payout without verification, sealing failed transfers. | **HIGH** | `test_adversarial_counterparty_premature_confirmation_traps_failed_payout` | **Delete `confirm_claim_withdrawn` completely.** No caller assertion accepted as proof of settlement. | **BLOCKED** in current code; specified for removal. |
| **BLK-04** | Timelocked or arbitrator recovery re-dispatches funds while original `PostMessage` remains pending in consensus queue. | **CRITICAL** | Trace in Section 1 (Issue A): Delayed child execution causes 200% payout, stealing pooled funds. | **Remove all on-chain recovery from V2.** Dispatched funds are permanently quarantined as final. | **SPECIFICATION AMENDED** herein to remove recovery. |
| **BLK-05** | Global `self.balance` heuristic treats unconfirmed payout of Claim A as failure of Claim B. | **HIGH** | `test_adversarial_unconfirmed_claim_blocks_retry_of_failed_claim` | **Eliminate all global balance heuristics for individual claim tracking.** | **BLOCKED** in current code; resolved by removing retry. |

---

## 1. CRITICAL ISSUE A: DISPATCHED FUNDS, PERSISTENCE & THE RECOVERY ATTACK TRACE

### The Double-Payout Execution Trace Under Arbitrator Recovery
Suppose the contract implements an arbitrator recovery function (`declare_dispatch_failed()` or `rescue_claim()`) after a 7-day timelock. Trace the following real-world asynchronous execution:

1. **Day 0 (Initial Dispatch):**
   - Project 1 Milestone 1 (100 GEN) is released $\to$ Claim 1 created (`amount = 100 GEN`).
   - Project 2 Milestone 2 (100 GEN) is funded $\to$ Escrow `self.balance = 200 GEN`.
   - Beneficiary 1 calls `withdraw_claim(1)`.
   - Escrow executes `gl.get_contract_at(vault_1).emit_transfer(value=100, on="finalized")`.
   - GenVM queues an internal `PostMessage` to consensus for `vault_1`.
2. **Days 1–7 (Asynchronous Message Latency / Queue Stall):**
   - Due to network congestion, validator partition, or consensus queue delay on that partition, the child transaction remains pending in the consensus pipeline and has not yet executed.
   - Escrow contract `self.balance` remains **200 GEN**.
3. **Day 8 (Arbitrator Timelocked Recovery Executed):**
   - The 7-day timelock expires. Beneficiary 1 claims they never received funds.
   - Arbitrator calls `rescue_claim(1, new_vault_address)`.
   - Because `self.balance` is 200 GEN, the rescue function resets Claim 1 and dispatches a **second** `emit_transfer(value=100, on="finalized")` directed to `new_vault_address`.
4. **Day 9 (Delayed Original Child Transaction Executes):**
   - The consensus queue unstalls. The original Day 0 `PostMessage` is processed by validators.
   - 100 GEN is debited from Escrow and credited to `vault_1`!
5. **Day 10 (Rescue Child Transaction Executes):**
   - The Day 8 rescue `PostMessage` is processed by validators.
   - 100 GEN is debited from Escrow and credited to `new_vault_address`!
6. **Fatal Outcome:**
   - Beneficiary 1 received **200 GEN** for a 100 GEN claim (100 GEN in `vault_1` + 100 GEN in `new_vault_address`).
   - Escrow contract `self.balance` is drained to **0 GEN**.
   - **Project 2's locked funds were completely stolen to fund the double payout!**

### Authoritative Protocol Analysis: Does GenLayer Prevent This?
- **Syscall Inspection:** In `genlayer/gl/genvm_contracts.py` and `_genlayer_wasi`, `PostMessage` has the schema:
  `{'address': Address, 'calldata': bytes, 'value': u256, 'on': str}`.
  There is **no message cancellation syscall**, no revocation opcode, no message TTL, and no expiration parameter.
- **Message Finality:** Once an internal message is emitted with `on="finalized"`, it is permanently committed to the consensus messaging pipeline. The parent contract has zero power to abort or cancel it.
- **Conclusion:** **No authoritative GenLayer guarantee exists to prevent a delayed child transaction from executing after a timelock.**

### Architectural Decision: Permanent Quarantine of Dispatched Funds
Because an in-flight dispatch cannot be proven dead or cancelled on-chain, **safe on-chain recovery is mathematically impossible under current GenVM semantics**.
- In V2, once a withdrawal is dispatched, the liability is permanently treated as discharged by the escrow contract.
- **All on-chain retry and recovery mechanisms are completely stripped from V2.**
- If an asynchronous transfer fails off-chain, the native GEN remains quarantined in the contract at the protocol level. It cannot be re-dispatched on-chain.

---

## 2. CRITICAL ISSUE B: THE PRECISE THREE-BUCKET ACCOUNTING MODEL

To eliminate ambiguity between accounting recognition and spendable funds, V2 collapses the state machine into **three strictly segregated on-chain balance buckets**:

```
Total Physical Contract Balance (self.balance)
  ├── 1. total_escrow_locked_wei       (Milestones funded; awaiting adjudication/dispute)
  ├── 2. total_escrow_claimable_wei    (Milestones settled; awaiting authorized pull withdrawal)
  └── 3. total_escrow_dispatched_wei   (Withdrawn; transfer emitted to consensus; permanent quarantine)
```

*(Note: "Recoverable" and "Withdrawn" buckets are eliminated. Dispatched funds are terminal from the contract's perspective).*

### 2.1 Bucket Definitions

1. **`total_escrow_locked_wei` (Active Escrow Reserve):**
   - *Meaning:* Native GEN deposited by clients for milestones in `CREATED`, `FUNDED`, `EVIDENCE_SUBMITTED`, `DISPUTED`, or `INCONCLUSIVE` status.
   - *Spendability:* Strictly non-withdrawable. Cannot be pulled by anyone until milestone adjudication.
2. **`total_escrow_claimable_wei` (Spendable Beneficiary Obligations):**
   - *Meaning:* Native GEN allocated to approved milestone payouts or rejected milestone refunds.
   - *Spendability:* Spendable strictly once by the designated beneficiary or their immutable recipient vault via `withdraw_claim()`.
3. **`total_escrow_dispatched_wei` (Quarantined Discharged Liabilities):**
   - *Meaning:* Cumulative native GEN for which `emit_transfer(value=amount, on="finalized")` has been executed.
   - *Spendability:* **Zero spendability.** Excluded from active contract solvency. These funds are in the hands of the validator consensus pipeline and cannot be touched by any user, arbitrator, or future transaction.

---

### 2.2 Complete Accounting Transition Table & Equations

| Event / Operation | State Transition | `locked_wei` | `claimable_wei` | `dispatched_wei` | `self.balance` Impact | Active Solvency Invariant Equation |
|---|---|---|---|---|---|---|
| **Client Funds Milestone** | Milestone: `CREATED` $\to$ `FUNDED` | $+amt$ | $0$ | $0$ | $+amt$ (Deposit) | $\text{balance} \ge \text{locked} + \text{claimable}$ (Holds) |
| **Milestone Released** | Milestone: `APPROVED` $\to$ `RELEASED`; Claim: `[*] -> CLAIMABLE` | $-amt$ | $+amt$ | $0$ | $0$ | $\text{balance} \ge \text{locked} + \text{claimable}$ (Holds) |
| **Milestone Refunded** | Milestone: `REJECTED` $\to$ `REFUNDED`; Claim: `[*] -> CLAIMABLE` | $-amt$ | $+amt$ | $0$ | $0$ | $\text{balance} \ge \text{locked} + \text{claimable}$ (Holds) |
| **Beneficiary Withdraws** | Claim: `CLAIMABLE` $\to$ `DISPATCHED`; `emit_transfer` emitted | $0$ | $-amt$ | $+amt$ | $0$ (Tx commit) | $\text{balance} \ge \text{locked} + \text{claimable}$ (Holds) |
| **Child Tx Succeeds** | Settles in recipient vault | $0$ | $0$ | $0$ | $-amt$ (Debited) | $\text{balance} \ge \text{locked} + \text{claimable}$ (Holds) |
| **Child Tx Fails** | Reverts at protocol/vault layer | $0$ | $0$ | $0$ | $0$ (Un-debited) | $\text{balance} \ge \text{locked} + \text{claimable}$ (Holds + Surplus) |
| **Child Pending Forever** | Stalled in validator queue | $0$ | $0$ | $0$ | $0$ | $\text{balance} \ge \text{locked} + \text{claimable}$ (Holds) |

### 2.3 Comprehensive Scenario Proofs

1. **When Child Transaction Succeeds:**
   - At dispatch: `claimable_wei` drops by $A$, `dispatched_wei` increases by $A$.
   - When child executes on-chain: `self.balance` drops by $A$.
   - Prior to child debit: $\text{balance} - A \ge \text{locked} + \text{claimable}$.
   - After child debit: $\text{balance}_{new} \ge \text{locked} + \text{claimable}$.
   - **Result:** Accounting remains exact.
2. **When Child Transaction Fails:**
   - Native GEN is not debited from `self.balance`.
   - `self.balance` retains $A$ surplus above active obligations ($\text{locked} + \text{claimable}$).
   - Because Claim A is in `DISPATCHED` status, `withdraw_claim(A)` cannot be called again.
   - Because recovery is banned, the surplus cannot be re-spent.
   - **Result:** Surplus remains quarantined; no other project's funds are touched.
3. **When Child Remains Pending Indefinitely:**
   - `self.balance` remains undepleted. Active obligations are $\text{locked} + \text{claimable}$.
   - Any other project calling `fund_milestone`, `release_milestone`, or `refund_milestone` evaluates $\text{balance} \ge \text{locked} + \text{claimable}$, which evaluates to `True`.
   - **Result:** A stalled child transaction **never bricks unrelated projects**.
4. **When Balance Decreases Because Another Claim Succeeds:**
   - Claim 2 succeeds and debits $B$.
   - $\text{self.balance}$ drops by $B$. But Claim 2's $B$ was already subtracted from `claimable_wei` at dispatch!
   - Therefore, the remaining balance covers all remaining `locked` and `claimable` funds.
   - **Result:** No cross-claim balance contamination.
5. **When Child Fails at Recipient Vault:**
   - If recipient vault reverts in `__receive__`, funds do not credit recipient.
   - Native GEN remains in escrow contract balance at the protocol layer.
   - Because `dispatched_wei` is quarantined, the contract does not count it as spendable.
   - **Result:** Solvency of active projects is preserved.
6. **When Parent Finalizes But Child Later Fails:**
   - Parent committed `c.status = "DISPATCHED"`.
   - Child fails in a later block.
   - The contract state remains immutable. The claim cannot pay twice.
   - **Result:** Immune to double spend.

---

## 3. CRITICAL ISSUE C: COMPLETION CONFIRMATION DECONSTRUCTED

### Can Child Settlement Be Proven On-Chain?
- **Protocol Fact:** **NO.** GenVM provides no opcode, WASI syscall, or transaction receipt inspection mechanism to verify whether a child message succeeded.
- **User Assertion Flaw:** A caller invoking `confirm_claim_withdrawn()` provides only their own digital signature, not cryptographic proof that native GEN settled in the vault.
  - If the client calls it, they can grief the freelancer (Finding TL-ADV-04).
  - If the freelancer calls it, it is redundant (they already called `withdraw_claim`).
  - If an automated keeper calls it, it relies on off-chain trusting heuristics.

### Architectural Decision: Removal of `confirm_claim_withdrawn`
In V2, **`confirm_claim_withdrawn` is completely deleted from the contract**.
- The escrow contract's responsibility ends when it validates eligibility and executes `emit_transfer()`.
- The claim transition is single-phase:
  $$\text{CLAIMABLE} \xrightarrow{\text{withdraw\_claim()}} \text{DISPATCHED (TERMINAL)}$$
- The contract does not make unverified claims about recipient receipt; it authoritatively records that the transfer was dispatched to the consensus network.

---

## 4. CRITICAL ISSUE D: ARBITRATOR CONTROLS ELIMINATED

As proven under Critical Issue A, because GenVM lacks message cancellation, any arbitrator recovery function:
1. Cannot guarantee that the original message will not execute later.
2. Cannot change the recipient of an already-emitted message.
3. Cannot prevent a double payout if consensus delivers the original message.

### Architectural Decision: Total Removal of On-Chain Arbitrator Recovery
- `declare_dispatch_failed()`: **DELETED**.
- `rescue_claim()`: **DELETED**.
- Arbitrator powers in V2 are strictly limited to **pre-settlement dispute adjudication** (`resolve_dispute()`).
- Once a milestone is resolved and a claim is dispatched, the arbitrator has **zero power to reallocate or re-dispatch funds**.

---

## 5. CRITICAL ISSUE E: RECIPIENT VAULT AUDIT (`contracts/recipient_vault.py`)

### Inspection of `TrustLedgerVault` Implementation
```python
@gl.public.write
def __receive__(self) -> None:
    val = gl.message.value
    self.received_total_wei = self.received_total_wei + val
    self.transfer_count = self.transfer_count + u256(1)
    self.last_sender = _to_address(gl.message.sender_address)
    self.last_amount_wei = val
```

### Vulnerability & Resilience Analysis

| Factor | Assessment | Protocol Risk |
|---|---|---|
| **Authorization Checks** | `__receive__` has no access restrictions; accepts transfers from any address. | **Pass.** Will not revert due to sender mismatch. |
| **Gas Constraints** | Writes 4 storage slots. `genvm_contracts.py:146` warns: *"Receiver may catch it with `__receive__`, so users may need to supply non-zero gas"*. | **Risk.** If GenVM consensus gas forwarding for internal messages is constrained, `__receive__` can revert on out-of-gas. |
| **Unexpected Input / Calldata** | `emit_transfer()` passes empty calldata `{}`. | **Pass.** `__receive__` receives empty calldata as expected. |
| **Pre-Deployment Timing** | If `recipient_vault` address is configured in escrow before the vault contract is actually deployed on-chain, transfer fails. | **Risk.** Requires strict deployment verification before milestone funding. |
| **EOA Target** | If recipient is an EOA instead of a contract, `emit_transfer()` succeeds at the protocol level without invoking code. | **Pass.** Standard EOA transfer succeeds. |

### Conclusion on Recipient Vaults
A standardized `TrustLedgerVault` **reduces execution risk** by ensuring no arbitrary user logic or external calls revert the receive handler.
However, it **does not eliminate asynchronous failure** because:
1. Gas policies at the validator/runner layer are outside contract control.
2. Deployment sequence errors can result in an uncontracted destination.
3. Consensus partition or message delivery failure can drop the child transaction.

---

## 6. PRESERVATION OF RUN 2 DEPLOYMENT HISTORY

The Run 2 deployment on StudioNet (`chainId: 61999`):
- `TrustLedgerEscrow`: `0x02b52a875Aad5aE41b3997725364C00C715A99C4` (Balance: `0 wei`)
- `FreelancerVault`: `0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775` (Balance: `150,000 wei`)
- `ClientRefundVault`: `0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068` (Balance: `200,000 wei`)

### Coexistence Architecture
1. **Zero State Mutation:** The Run 2 contract remains untouched, zero-balanced, and immutable.
2. **Fresh V2 Address:** When authorized, V2 will be deployed to a completely independent contract address.
3. **Frontend Multi-Version Router:**
   ```typescript
   export const ESCROW_CONTRACTS = {
     RUN_2_PRESERVED: "0x02b52a875Aad5aE41b3997725364C00C715A99C4",
     V2_REMEDIATED: "<NEW_V2_DEPLOYMENT_ADDRESS>",
   };
   ```

---

## 7. EXACT V2 SPECIFICATION (REQUIRED CONTRACT CHANGES)

When authorized to implement V2, the following exact changes must be applied to `contracts/trust_ledger.py`:

### 1. Storage Fields
```python
# contracts/trust_ledger.py (inside TrustLedgerEscrow)
total_escrow_dispatched_wei: u256  # Quarantined in-flight liabilities
```
*(Remove `total_escrow_withdrawn_wei` and `total_escrow_recoverable_wei`)*.

### 2. Active Solvency Check in `fund_milestone`, `release_milestone`, `refund_milestone`
```python
# Replaces old check:
required_active_balance = self.total_escrow_locked_wei + self.total_escrow_claimable_wei
if self.balance < required_active_balance:
    raise gl.vm.UserError(
        f"{ERROR_EXPECTED} Insufficient contract active solvency balance ({int(self.balance)} < {int(required_active_balance)})"
    )
```

### 3. Streamlined Single-Phase `withdraw_claim`
```python
@gl.public.write
def withdraw_claim(self, claim_id: u256) -> dict:
    cid = u256(claim_id)
    if cid not in self.claims:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Claim {int(cid)} does not exist")

    c = self.claims[cid]
    sender = _to_address(gl.message.sender_address)

    # 1. Access Control: strictly authorized beneficiary or vault
    if sender != c.beneficiary and sender != c.recipient_vault:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Unauthorized withdrawal caller")

    # 2. Strict Single-Execution Guard
    if c.status != "CLAIMABLE":
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Claim {int(cid)} is not eligible for withdrawal (status: {c.status})")

    # 3. Solvency Verification
    if self.balance < c.amount_wei or self.total_escrow_claimable_wei < c.amount_wei:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Insufficient contract balance or claimable accounting")

    # 4. CHECKS-EFFECTS: Move claimable to permanently quarantined dispatched liability
    c.status = "DISPATCHED"
    c.dispatched_count = c.dispatched_count + u256(1)
    self.claims[cid] = c

    self.total_escrow_claimable_wei = self.total_escrow_claimable_wei - c.amount_wei
    self.total_escrow_dispatched_wei = self.total_escrow_dispatched_wei + c.amount_wei

    # 5. INTERACTIONS: Emit asynchronous transfer
    gl.get_contract_at(c.recipient_vault).emit_transfer(value=c.amount_wei, on="finalized")

    return {
        "claim_id": int(cid),
        "status": "DISPATCHED",
        "amount_wei": int(c.amount_wei),
        "destination_vault": c.recipient_vault.as_hex,
    }
```

### 4. Complete Removal of Flawed Functions
- **DELETE** `confirm_claim_withdrawn` (Lines 1209–1250).
- **DELETE** `retry_failed_withdrawal` (Lines 1252–1296).

---

## 8. FINAL SAFETY GATE VERDICT

### Verdict: **NOT READY** (for the existing contract on disk)  
The existing contract source code in `contracts/trust_ledger.py` contains active vulnerabilities (Blockers BLK-01 to BLK-05) and cannot be deployed to testnet or production.

### Conditional Specification Verdict: **READY WITH EXPLICIT LIMITATIONS** (for V2 specification)  
The V2 specification defined in Section 7 is mathematically sound and ready for implementation under these **binding protocol limitations**:
1. **No On-Chain Recovery:** Once dispatched, a transfer cannot be cancelled, retried, or recovered on-chain.
2. **Terminal Dispatch:** The escrow contract treats `DISPATCHED` as final liability discharge.
3. **Quarantined Dispatches:** Stalled or un-debited child transfers remain permanently quarantined, guaranteeing 100% solvency and zero bricking of unrelated projects.
