# TrustLedger V2 — Controlled StudioNet Deployment & Verification Report

**Document Date:** October 18, 2026  
**Target Environment:** GenLayer StudioNet (Chain ID: `61999`)  
**Deployment Status:** **DEPLOYED & ON-CHAIN VERIFIED ON STUDIONET (AWAITING VAULT/FUNDING AUTHORIZATION)**  
**Security & Audit Clearance:** [`V2_FINAL_INDEPENDENT_AUDIT.md`](file:///C:/Users/NO%20GO%20NO/TrustLedger/V2_FINAL_INDEPENDENT_AUDIT.md) — Verdict: **READY WITH EXPLICIT LIMITATIONS**  

---

## 1. Executive Summary & Authorization Boundary

Following explicit operator authorization for Phase 3, **TrustLedger V2** has been deployed to GenLayer StudioNet as an independent Intelligent Contract instance and verified on-chain.

### Strict Operational Boundary Maintained
- **V2 Deployed:** Deployed as a distinct contract instance on StudioNet without modifying or redeploying Run 2.
- **Deployer Verified:** `get_deployer()` confirmed matching `0x1dc6E34729A34175637C14FfA57D02b62465D6B2`.
- **Unauthorized Probe Executed:** Test account `0xCd71365B1689407CD4e4a6E06Ce2d264c7412ADF` attempted unauthorized vault registration; storage remained unmodified (`is_vault_approved` returns `false`).
- **No Vaults Approved:** In accordance with instructions, zero recipient vaults have been approved.
- **No Contract Funding:** In accordance with instructions, zero native GEN has been deposited.
- **Frontend Preserved Fail-Closed:** `NEXT_PUBLIC_V2_DEPLOYED=false` is maintained. The production frontend remains gated at the pre-deployment safety gate.
- **No Secrets Exposed:** Zero private keys, seed phrases, or credentials are stored or exposed.

---

## 2. Verified StudioNet Deployment Addresses

| Component | Network Address | Deployment Tx Hash | Consensus Status | Role / Version |
| :--- | :--- | :--- | :--- | :--- |
| **TrustLedger V2 Escrow** | [`0x4Ec472F1fEc41cB89Fd11DfD788679786E874336`](file:///C:/Users/NO%20GO%20NO/TrustLedger/contracts/trust_ledger.py) | `0x8cf1629bc4d0b684215c3586ad1c8d6a27d9d66a8bc7f8281a993a8753c6db82` | `ACCEPTED` / `FINALIZED` | **V2 Active Deployment** |
| **Run 2 Escrow Contract** | [`0x02b52a875Aad5aE41b3997725364C00C715A99C4`](file:///C:/Users/NO%20GO%20NO/TrustLedger/contracts/trust_ledger.py) | `0x6fa9eff9aa775bbfec62d8485cb1c37c19f1faaaced061b3ab9b58d6b285e8d1` | `FINALIZED` | **Run 2 Preserved (Project #1)** |
| **Freelancer Vault (Run 2)** | [`0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775`](file:///C:/Users/NO%20GO%20NO/TrustLedger/contracts/recipient_vault.py) | `0x8330e4832164bc03b2682702bc1f0860f64891521639e27b560c9924c6c9b743` | `FINALIZED` | **Run 2 Freelancer Vault** |
| **Client Refund Vault (Run 2)**| [`0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068`](file:///C:/Users/NO%20GO%20NO/TrustLedger/contracts/recipient_vault.py) | `0xc423266a1c37652b168520b9835e1b382ca73e2a1f5ae98f7aebfecebd74b544` | `FINALIZED` | **Run 2 Client Vault** |

### Historical State Preservation
- **Project #1 Deterministic Pinning:** [`frontend/src/lib/genlayer.ts` line 85](file:///C:/Users/NO%20GO%20NO/TrustLedger/frontend/src/lib/genlayer.ts#L85) binds Project #1 directly to Run 2 (`0x02b52a875Aad5aE41b3997725364C00C715A99C4`).
- **Zero Cross-Contamination:** The new V2 contract has its own separate storage tree with zero prior commitments.

---

## 3. Authoritative On-Chain State Verification (V2)

The live deployed V2 contract (`0x4Ec472F1fEc41cB89Fd11DfD788679786E874336`) was queried directly via StudioNet RPC:

### 3.1 Deployer Verification (`get_deployer`)
```json
{
  "method": "get_deployer",
  "result": "0x1dc6E34729A34175637C14FfA57D02b62465D6B2",
  "status": "VERIFIED MATCH"
}
```
`self.deployer` permanently records the Client EOA.

### 3.2 Escrow Summary (`get_escrow_summary`)
```json
{
  "contract_balance_wei": 0,
  "project_count": 0,
  "milestone_count": 0,
  "claim_count": 0,
  "total_escrow_locked_wei": 0,
  "total_escrow_claimable_wei": 0,
  "total_escrow_dispatched_wei": 0,
  "total_escrow_funded_wei": 0,
  "total_escrow_released_wei": 0,
  "total_escrow_refunded_wei": 0
}
```
All initial accounting buckets are clean and zeroed.

### 3.3 Vault Registry Cleanliness (`is_vault_approved`)
- `is_vault_approved("0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775")` $\rightarrow$ `false`
- `is_vault_approved("0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068")` $\rightarrow$ `false`
Zero vaults were pre-approved.

---

## 4. Live On-Chain Access Control Probe

To prove that `register_approved_vault` rejects unauthorized callers on live StudioNet:

| Probe Parameter | Value |
| :--- | :--- |
| **Target Contract** | `0x4Ec472F1fEc41cB89Fd11DfD788679786E874336` |
| **Unauthorized Caller (Freelancer EOA)** | `0xCd71365B1689407CD4e4a6E06Ce2d264c7412ADF` |
| **Target Unauthorized Vault** | `0x1111111111111111111111111111111111111111` |
| **Probe Tx Hash** | `0x8bcf2f3bd18d7fe7208e116547331182c289a8f37b894e5df1feacd08e406d39` |
| **Consensus Status** | `ACCEPTED` / `MAJORITY_AGREE` |
| **Storage Mutation Check (`is_vault_approved`)** | **`false` (Storage Unmodified)** |

### Result: **PASS**
The unauthorized write call failed to mutate storage. The probe vault remains unapproved (`false`).

---

## 5. Deployment Parameters & Cryptographic Checksums

### 5.1 Environment Parameters
- **Network Name:** GenLayer StudioNet
- **Chain ID:** `61999`
- **RPC URL:** `https://studio.genlayer.com/api`
- **Native Currency:** `GEN` (18 decimals)
- **Consensus Main Address:** `0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575`
- **Deployer Account:** `0x1dc6E34729A34175637C14FfA57D02b62465D6B2`

### 5.2 Cryptographic Source Hashes (SHA-256)
```
contracts/trust_ledger.py:
  3D8C16D407CC97A367F336215F482C1C010E0DE619487F11AC2BA306B37C721E

contracts/recipient_vault.py:
  CC658345798DBFF74A95BC43E72CD3460B9C4F81869DEDDBB1AE46E5C3C4C918

frontend/src/lib/genlayer.ts:
  BEDD9B047C07E152AA0B157E97A3B0E4E37329F2561B1A57C52B6D1F636877DC

frontend/src/app/page.tsx:
  F72C75C11300CFADB34FDE0CBBBA44E5B448F58420F2FD7BC934F3F9EB50E870
```

---

## 6. Preflight Evidence Classification

### 6.1 Direct-Mode Simulation (Local VM)
- **Test Suite:** `pytest tests/direct`
- **Result:** 41/41 passed in 9.50s.
- **Coverage:** Full state machine, single dispatch, solvency invariant, reentrancy resistance, and access control edge cases under local in-memory GenVM semantics.

### 6.2 Frontend Routing Suite (Node.js)
- **Test Suite:** `node frontend/tests/address_routing.test.mjs`
- **Result:** 12/12 passed in 79ms.
- **Coverage:** Historical Project #1 preservation, fail-closed pre-deployment safety gates, and address format validation.

### 6.3 Live StudioNet Evidence (On-Chain)
- **V2 Deployment:** `0x4Ec472F1fEc41cB89Fd11DfD788679786E874336` (Tx: `0x8cf1629bc4d0b684215c3586ad1c8d6a27d9d66a8bc7f8281a993a8753c6db82`).
- **On-chain Deployer:** Read back and confirmed as `0x1dc6E34729A34175637C14FfA57D02b62465D6B2`.
- **Live Access Control Probe:** Tx `0x8bcf2f3bd18d7fe7208e116547331182c289a8f37b894e5df1feacd08e406d39` confirmed unauthorized caller cannot whitelist a vault.

---

## 7. Known Architectural Realities & Containment Plan

### 7.1 GenLayer Asynchronous Execution Realities
- **No Parent Execution Receipts:** In GenLayer, child transactions emitted via `gl.get_contract_at(...).emit_transfer(..., on="finalized")` are placed into the validator consensus message queue. Parent contracts have no synchronous return values, child receipts, or cross-transaction callbacks.
- **Permanent Quarantining of Failed Dispatches:** If a recipient vault rejects a child transfer, the native GEN remains physically inside the escrow contract balance. However, the claim remains permanently in `DISPATCHED` status and its liability is tracked under `total_escrow_dispatched_wei`.
- **No Retries Permitted:** Automated or manual retries (`retry_failed_withdrawal`) are permanently eliminated to protect against double-spending caused by delayed validator finalization.

### 7.2 Containment Plan (Current State)
- **Frontend Gated:** `NEXT_PUBLIC_V2_DEPLOYED=false` is maintained. The production UI continues to display Run 2 historical data and blocks new project creation at the safety gate.
- **Vault Approvals Withheld:** Without registered approved vaults, no claims can be withdrawn, locking all potential escrow securely.
- **No Production Funding:** The contract has 0 wei balance.

---

## 8. Next Authorization Steps (Awaiting Operator Command)

The following subsequent actions require separate, explicit authorization:
1. **Vault Registration Authorization:** Authorizing deployer `0x1dc6E34729A34175637C14FfA57D02b62465D6B2` to call `register_approved_vault` for verified recipient vault addresses.
2. **Minimal Live Escrow Funding Test Authorization:** Authorizing a small micro-test (`10,000 wei GEN`) on StudioNet to create, fund, evaluate, and withdraw a milestone claim.
3. **Frontend Activation Authorization:** Authorizing setting `NEXT_PUBLIC_V2_DEPLOYED=true` and `NEXT_PUBLIC_V2_ESCROW_CONTRACT_ADDRESS=0x4Ec472F1fEc41cB89Fd11DfD788679786E874336` in `frontend/.env.local`.
