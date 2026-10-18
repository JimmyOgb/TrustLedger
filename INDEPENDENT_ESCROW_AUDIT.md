# TrustLedger — Independent Live StudioNet Escrow Audit Report

**Date of Audit:** October 16, 2026  
**Auditor:** Antigravity Autonomous Security & Verification Suite  
**Network:** GenLayer StudioNet  
**Chain ID:** `61999` (`0xf22f`)  
**RPC Endpoint:** `https://studio.genlayer.com/api`  
**Audit Scope:** Read-only verification of deployed contracts, live on-chain transactions, state accounting, access control, and asynchronous settlement mechanics.  
**Audit Verdict:** **VERIFIED WITH LIMITATIONS**

---

## Executive Summary

An independent, read-only audit of the **TrustLedger** native GEN milestone escrow system was performed directly against GenLayer StudioNet (`chainId: 61999`). 

All reported transactions, on-chain contract states, and account balances were queried directly from the authoritative StudioNet RPC endpoint (`https://studio.genlayer.com/api`). In addition, direct-mode execution was performed across 11 test suites covering regression and edge cases.

### Summary of Audit Findings
1. **Real Native GEN Flow Confirmed**: Actual native GEN was transferred into the escrow contract, held in contract-controlled custody, and disbursed via GenVM's internal `emit_transfer` mechanism to both the freelancer and client vaults.
2. **Authoritative Balance Reconciliation (100% Match)**:
   - Total Funded: **350,000 wei GEN**
   - Total Released (Milestone 1): **150,000 wei GEN**
   - Total Refunded (Milestone 2): **200,000 wei GEN**
   - Final Escrow Contract Balance: **0 wei GEN**
   - Freelancer Vault Balance: **150,000 wei GEN**
   - Client Refund Vault Balance: **200,000 wei GEN**
3. **Child Transaction Finality**: Both the freelancer payout child transaction (`0x41485f...`) and client refund child transaction (`0xae8239...`) were confirmed `FINALIZED` on-chain with `value_credited: true`.
4. **Architectural Limitation Identified (HIGH)**: GenVM's `emit_transfer(value=..., on="finalized")` operates asynchronously without native settlement callback hooks. If an asynchronous child transfer were to fail at the protocol level, the parent contract has already committed state transitions (`RELEASED` / `REFUNDED`), resulting in orphaned funds requiring manual intervention.

---

## 1. Network and Contract Identity

### 1.1 Network Parameters
The network was independently queried via standard JSON-RPC:
- `eth_chainId`: `0xf22f` (Decimal: `61999` — GenLayer StudioNet)
- `net_version`: `61999`
- RPC Endpoint: `https://studio.genlayer.com/api`

### 1.2 Active Deployment Identity (Run 2)
The active deployment was independently verified via RPC storage and balance checks:

| Role / Contract | On-Chain Address | On-Chain Balance | Verified Code / Contract Type |
|---|---|---|---|
| **TrustLedgerEscrow** | `0x02b52a875Aad5aE41b3997725364C00C715A99C4` | `0 wei` (`0x0`) | Intelligent Escrow (`TrustLedgerEscrow`) |
| **FreelancerVault** | `0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775` | `150,000 wei` (`0x249f0`) | Payable Vault (`SimpleVault`) |
| **ClientRefundVault** | `0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068` | `200,000 wei` (`0x30d40`) | Payable Vault (`SimpleVault`) |

### 1.3 Deployment Transaction Verification
The contract deployments were verified against StudioNet:
- **FreelancerVault Deployment Tx**: `0x8330e4832164bc03b2682702bc1f0860f64891521639e27b560c9924c6c9b743`
  - Status: `FINALIZED` | Consensus: `MAJORITY_AGREE` (5/5 validators)
  - Created Address: `0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775`
- **ClientRefundVault Deployment Tx**: `0xc423266a1c37652b168520b9835e1b382ca73e2a1f5ae98f7aebfecebd74b544`
  - Status: `FINALIZED` | Consensus: `MAJORITY_AGREE` (5/5 validators)
  - Created Address: `0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068`
- **TrustLedgerEscrow Deployment Tx**: `0x6fa9eff9aa775bbfec62d8485cb1c37c19f1faaaced061b3ab9b58d6b285e8d1`
  - Status: `FINALIZED` | Consensus: `MAJORITY_AGREE` (5/5 validators)
  - Created Address: `0x02b52a875Aad5aE41b3997725364C00C715A99C4`

### 1.4 Prior Run Address Discrepancy Note (Run 1)
An earlier deployment run generated addresses (`0x47CcCEBB4ceB93bB897f4E3c03C319DCd025F63B`, `0x8269Db6128951f50B210c1cE8e446c4400Be0471`, `0xfb669219C268e7E7C9d183a97CaAd87111C6f6cC`). In that run, an RPC timeout occurred during parameter binding. The contracts for Run 1 remain on-chain (holding 200,000 wei in `0x47Cc...` from Milestone 2 funding). Run 2 was executed cleanly with all 17 transactions finalized and fully reconciled.

---

## 2. On-Chain Transaction & Execution Evidence

Every transaction in the lifecycle of Project 1 was queried using `gen_getTransactionByHash` on StudioNet:

| Step | Action | Transaction Hash | Status | Consensus | Value | Notes |
|:---:|---|---|:---:|:---:|:---:|---|
| **1** | Deploy Escrow | `0x6fa9eff9aa775bbfec62d8485cb1c37c19f1faaaced061b3ab9b58d6b285e8d1` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Creates Escrow contract |
| **2** | Deploy Freelancer Vault | `0x8330e4832164bc03b2682702bc1f0860f64891521639e27b560c9924c6c9b743` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Creates Freelancer Vault |
| **3** | Deploy Client Vault | `0xc423266a1c37652b168520b9835e1b382ca73e2a1f5ae98f7aebfecebd74b544` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Creates Client Refund Vault |
| **4** | Create Project 1 | `0xe405bf1e36a500a1719ed55a7e0df7cf5ae6208d1b51468a464e9e11145c3c58` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Initializes Project ID 1 |
| **5** | Add Milestone 1 | `0x95c46809e0e4cfa7b6170d10e440166e289fe6ff8cbe4e5497a48193fdb80006` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Amount: 150,000 wei |
| **6** | Add Milestone 2 | `0xeac58d009577caa6bf5b2a89486736f1da9c0b5be8a568e6e21d9076485f3984` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Amount: 200,000 wei |
| **7** | **Fund Milestone 1** | `0x1c6174030991c93d8ea02287ac77b2e91721578577f3044b311f5a93ef458e38` | `FINALIZED` | `MAJORITY_AGREE` | 150,000 wei | `value_credited: true` |
| **8** | Submit Evidence M1 | `0xadda0d70ada3cdbc73c90de72ef9a5b5613a9c7245808a0e14a57bdb5aac3b85` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Freelancer evidence payload |
| **9** | LLM Evaluation M1 | `0x797084ebe628bd57227604c7fa01619d5eeddf306147212a43402d334008becc` | `FINALIZED` | `MAJORITY_AGREE` | 0 | On-chain AI evaluation; returned `INCONCLUSIVE` (404 mock URL) |
| **10** | Open Dispute M1 | `0x66a98e551b78e194486d4aa3815de55d8c362638c6912b628f2144ba3adda085` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Inconclusive dispute opened |
| **11** | Resolve Dispute M1 | `0x9e590ab224c42f9762b625bf429c5caa41cccf6f085095b268af9be9c21c49ac` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Arbitrator ruled: `RELEASE` |
| **12** | **Release Milestone 1** | `0xaaea0c025472470b889ba87bd5c2d93b76df2e81539c0c3514e0dd91f5f1d836` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Parent release call |
| **13** | **Child Payout M1** | `0x41485f166ffc479bf7bd2a2bbfae43c3c0f6dd7ad476a8d693321b66d7e3a347` | `FINALIZED` | `MAJORITY_AGREE` | 150,000 wei | Native transfer to Freelancer Vault; `value_credited: true` |
| **14** | **Fund Milestone 2** | `0xc952bcf092a0091047f677173e787f85f6ba6e00c5d1a75310ee230ea14816a1` | `FINALIZED` | `MAJORITY_AGREE` | 200,000 wei | `value_credited: true` |
| **15** | Open Dispute M2 | `0xdb7d50de12f74ba6a2a982bddcd7e5f593ff218e9160a559a8336bd05b2672e9` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Client opened dispute |
| **16** | Resolve Dispute M2 | `0x83e8c2e3c6df0937c0186069f5a9d44cfbb917cbffc6063a3d5070ce4befedae` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Freelancer conceded: `REFUND` |
| **17** | **Refund Milestone 2** | `0x397d560c0a2c961046a2346e2e27749235ee4903d76744c230f918c5c6338e6e` | `FINALIZED` | `MAJORITY_AGREE` | 0 | Parent refund call |
| **18** | **Child Refund M2** | `0xae82390bdd94f00937bf94398074faad68e44a7cee5bf953e076fbf4d9e40fdb` | `FINALIZED` | `MAJORITY_AGREE` | 200,000 wei | Native transfer to Client Vault; `value_credited: true` |

---

## 3. Authoritative Contract State Read-Back

The state was queried directly from the contract methods on StudioNet:

### 3.1 Escrow Summary (`get_escrow_summary`)
```json
{
  "contract_balance_wei": 0,
  "total_escrow_funded_wei": 350000,
  "total_escrow_locked_wei": 0,
  "total_escrow_released_wei": 150000,
  "total_escrow_refunded_wei": 200000,
  "project_count": 1,
  "milestone_count": 2
}
```

### 3.2 Project State (`get_project(1)`)
```json
{
  "project_id": 1,
  "title": "TrustLedger Live Escrow Integration",
  "client": "0x0f7c3c537205d2afa9d7e924292386e17b051f6e",
  "client_refund_vault": "0x7e5eb0458bf08dcff50f619853e4a071adbd0068",
  "arbitrator": "0x42ad8508ebbee7a3ee74ed50813054b2e4f73895",
  "milestone_ids": [1, 2],
  "total_budget_wei": 350000,
  "status": "COMPLETED"
}
```

### 3.3 Milestone 1 State (`get_milestone(1)`)
```json
{
  "milestone_id": 1,
  "title": "Core Escrow Smart Contract",
  "recipient": "0x6ff1e202fca18a07320ce7a2773bb8e4ae39265c",
  "recipient_vault": "0x02c7c74e61ccf3dd594ab80d4a1da40101e44775",
  "amount_wei": 150000,
  "funded_wei": 150000,
  "released_wei": 150000,
  "refunded_wei": 0,
  "status": "RELEASED",
  "dispute_status": "RESOLVED"
}
```

### 3.4 Milestone 2 State (`get_milestone(2)`)
```json
{
  "milestone_id": 2,
  "title": "Frontend and Test Suite",
  "recipient": "0x6ff1e202fca18a07320ce7a2773bb8e4ae39265c",
  "recipient_vault": "0x02c7c74e61ccf3dd594ab80d4a1da40101e44775",
  "amount_wei": 200000,
  "funded_wei": 200000,
  "released_wei": 0,
  "refunded_wei": 200000,
  "status": "REFUNDED",
  "dispute_status": "RESOLVED"
}
```

### 3.5 Recipient Vault State (`get_vault_state`)
- **Freelancer Vault (`0x02c7...4775`)**:
  - `vault_balance`: `150,000 wei`
  - `deposit_count`: `1`
  - `total_received`: `150,000 wei`
- **Client Refund Vault (`0x7E5E...0068`)**:
  - `vault_balance`: `200,000 wei`
  - `deposit_count`: `1`
  - `total_received`: `200,000 wei`

---

## 4. Security Findings & Risk Classification

### Finding 1: Asynchronous Child Transfer Atomicity & Lack of Failure Callbacks
- **Severity**: **HIGH**
- **Component**: `contracts/trust_ledger.py` (`release_milestone`, `refund_milestone`)
- **Description**: 
  In GenVM, native token transfers triggered by contracts use `emit_transfer(to, value, on="finalized")`. This generates an asynchronous internal transaction executed after the parent contract transaction has committed.
  In `TrustLedgerEscrow`:
  1. `release_milestone` updates `milestone.status = "RELEASED"`, sets `milestone.released_wei = amount`, and decrements `total_escrow_locked_wei`.
  2. The parent transaction finalizes with `MAJORITY_AGREE`.
  3. If the recipient contract's payable fallback fails or the child transfer fails at the protocol level, GenVM records the child transaction with status `FINALIZED` and `consensus_data.vote: "NO_MAJORITY"` (`value_credited: false`).
  4. Because GenVM does not provide bidirectional asynchronous callback hooks to the originating contract, the parent contract cannot automatically detect or revert from a child transfer failure.
- **Impact**: In the event of a child execution failure, the milestone remains marked as `RELEASED` or `REFUNDED`, funds remain trapped in the escrow contract, and neither a retry nor a refund can be executed through normal contract calls.
- **Verification**: Verified and simulated via unit test `test_audit_asynchronous_child_failure_simulation`.
- **Recommendation**:
  1. Implement a **pull-over-push** architecture: Instead of the contract pushing funds via `emit_transfer` upon release, the contract should credit an internal claim balance (`claimable_freelancer_wei[recipient] += amount`), allowing the recipient to call `withdraw()`.
  2. Alternatively, require a two-phase settlement pattern where child completion is proven or acknowledged by an authorized settlement oracle.

---

### Finding 2: AI Evaluator Fragility on Dead or Private Evidence URLs
- **Severity**: **LOW**
- **Component**: `contracts/trust_ledger.py` (`evaluate_milestone_submission`)
- **Description**: 
  When evidence URLs are submitted to the GenLayer non-deterministic web-reading validator, any 404, HTTP error, or private intranet link causes the web request to fail. In Milestone 1, validators received HTTP 404 and rendered an `INCONCLUSIVE` verdict.
- **Positive Security Control**: 
  The escrow contract correctly handled this: `INCONCLUSIVE` did **not** trigger payout. It blocked automatic release and forced the milestone into dispute resolution.
- **Recommendation**:
  Incorporate cryptographic content hashes (e.g., IPFS CID or Arweave transaction ID) and multi-URL mirror fallbacks in the evidence criteria schema.

---

### Finding 3: Prior Deployment Address Ambiguity
- **Severity**: **INFORMATIONAL**
- **Description**:
  The workspace previously contained artifacts referencing Run 1 contracts (`0x47Cc...`) alongside Run 2 contracts (`0x02b5...`). The report has now resolved and disambiguated all deployment identifiers.

---

## 5. Comprehensive Test Suite Results

The direct-mode test suite was executed using GenVM runner `v0.6.0-rc9`. All 11 tests passed successfully:

```text
tests/direct/test_audit_edge_cases.py::test_audit_duplicate_payout_and_concurrent_refund_prevented PASSED [  9%]
tests/direct/test_audit_edge_cases.py::test_audit_duplicate_refund_and_concurrent_payout_prevented PASSED [ 18%]
tests/direct/test_audit_edge_cases.py::test_audit_inconclusive_evaluation_prevents_unauthorized_settlement PASSED [ 27%]
tests/direct/test_audit_edge_cases.py::test_audit_unauthorized_callers_and_mismatched_milestones_rejected PASSED [ 36%]
tests/direct/test_audit_edge_cases.py::test_audit_asynchronous_child_failure_simulation PASSED [ 45%]
tests/direct/test_trust_ledger.py::test_happy_path_escrow_fund_evaluate_and_release PASSED [ 54%]
tests/direct/test_trust_ledger.py::test_partial_funding_overfunding_and_zero_funding_rejected PASSED [ 63%]
tests/direct/test_trust_ledger.py::test_unauthorized_calls_and_cross_user_isolation PASSED [ 72%]
tests/direct/test_trust_ledger.py::test_immutability_after_funding_and_mutual_recipient_amendment PASSED [ 81%]
tests/direct/test_trust_ledger.py::test_duplicate_settlement_replayed_decisions_and_insufficient_escrow PASSED [ 90%]
tests/direct/test_trust_ledger.py::test_inconclusive_evaluation_and_rejected_refund_and_dispute_flow PASSED [100%]

============================= 11 passed in 3.07s ==============================
```

---

## 6. Prioritized Remediation Roadmap

1. **High Priority — Pull-Based Claim Pattern**:
   Replace direct `emit_transfer` in `release_milestone` and `refund_milestone` with `claimable_wei[account] += amount` and an explicit `claim_payout()` method. This completely isolates the parent state transition from potential child transfer failures.
2. **Medium Priority — Recovery Escrow Function**:
   Add an arbitrator emergency recovery function that checks `self.balance > self.total_escrow_locked_wei` and allows releasing orphaned funds to their rightful owner if an asynchronous transfer failed.
3. **Low Priority — IPFS Multi-Mirror Evidence Support**:
   Enhance evidence submission to support decentralized, pinned storage hashes rather than single HTTP URLs.

---

## 7. Audit Conclusion and Verdict

### Verdict: **VERIFIED WITH LIMITATIONS**

- **Verified**:
  - StudioNet transactions and contract deployments exist, finalized with full majority consensus, and are fully queryable via RPC.
  - Native GEN movements occurred on-chain: 350,000 wei funded, 150,000 wei transferred to Freelancer Vault, 200,000 wei transferred to Client Refund Vault.
  - State accounting balances reconcile with zero leakage.
  - Access controls prevent duplicate payout, duplicate refund, unauthorized funding, and cross-project manipulation.
- **Limitations**:
  - GenVM's push-based `emit_transfer` architecture creates asynchronous failure exposure if a child transfer fails at the protocol level.
  - Testnet currency notice: StudioNet GEN is a testnet token with no monetary value.
