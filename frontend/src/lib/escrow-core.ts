/**
 * TrustLedger escrow write-path core.
 *
 * Framework-free and dependency-free so it can be unit-tested directly with
 * `node --test` (Node type stripping). All contract rules here MIRROR the
 * deployed V2 source (contracts/trust_ledger.py, code sha256 3d8c16d4…721e,
 * byte-identical to 0x4Ec472F1fEc41cB89Fd11DfD788679786E874336). The contract
 * remains the authority: these checks only avoid submitting transactions that
 * are certain to revert, and never substitute for on-chain read-back.
 */

export const STUDIONET_CHAIN_ID = 61999;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const DISPATCHED_LABEL = 'DISPATCHED — Unverified on-chain';

// ---------------------------------------------------------------------------
// Minimal on-chain record shapes (as returned by V2 view methods)
// ---------------------------------------------------------------------------
export interface ProjectView {
  project_id: number;
  client: string;
  refund_recipient: string;
  arbitrator: string;
  title: string;
  status: string;
  milestone_count: number;
}

export interface MilestoneView {
  milestone_id: number;
  project_id: number;
  freelancer: string;
  recipient: string;
  amount_wei: number | bigint | string;
  funded_wei: number | bigint | string;
  released_wei: number | bigint | string;
  refunded_wei: number | bigint | string;
  status: string;
  submission_version: number;
  evidence_url: string;
  evidence_hash: string;
  evaluated_version: number;
  evaluated_evidence_hash: string;
  verdict: string;
  settlement_count: number;
}

export interface ClaimView {
  claim_id: number;
  milestone_id: number;
  claim_type: string;
  beneficiary: string;
  recipient_vault: string;
  amount_wei: number | bigint | string;
  status: string;
  dispatched_count: number;
}

export type Check = { ok: true } | { ok: false; reason: string };
const OK: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function isAddress(a: unknown): a is string {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

export function toBig(v: number | bigint | string | null | undefined): bigint {
  if (v === null || v === undefined || v === '') return 0n;
  return BigInt(v as any);
}

// ---------------------------------------------------------------------------
// Input validation (mirrors contract rules)
// ---------------------------------------------------------------------------

/** Parse an integer wei amount. Rejects decimals, negatives, zero, non-numeric, > u256. */
export function parseWeiAmount(input: string): { ok: true; wei: bigint } | { ok: false; reason: string } {
  const s = (input ?? '').trim();
  if (!/^[0-9]+$/.test(s)) return { ok: false, reason: 'Amount must be a positive whole number of wei (no decimals, signs, or units).' };
  const wei = BigInt(s);
  if (wei <= 0n) return { ok: false, reason: 'Amount must be greater than 0 wei.' };
  if (wei >= 1n << 256n) return { ok: false, reason: 'Amount exceeds u256.' };
  return { ok: true, wei };
}

/** Optional address field: empty is allowed (contract defaults to sender). */
function optionalAddress(label: string, v: string): Check {
  const s = (v ?? '').trim();
  if (!s) return OK;
  if (!isAddress(s)) return fail(`${label} must be a 0x-prefixed 40-hex-character address.`);
  if (sameAddress(s, ZERO_ADDRESS)) return fail(`${label} must not be the zero address.`);
  return OK;
}

export function validateCreateProject(p: { title: string; description: string; refundRecipient: string; arbitrator: string }): Check {
  if ((p.title ?? '').trim().length < 3) return fail('Project title must be at least 3 characters.');
  if ((p.description ?? '').trim().length < 5) return fail('Project description must be at least 5 characters.');
  const r = optionalAddress('Refund recipient', p.refundRecipient);
  if (!r.ok) return r;
  return optionalAddress('Arbitrator', p.arbitrator);
}

export interface Criterion { id: string; description: string; weight: number; mandatory: boolean }

export function validateCriteria(criteria: Criterion[]): Check {
  if (!Array.isArray(criteria) || criteria.length === 0) return fail('At least one acceptance criterion is required.');
  const seen = new Set<string>();
  let total = 0;
  for (const c of criteria) {
    const id = (c.id ?? '').trim();
    if (!id || seen.has(id)) return fail('Criterion IDs must be unique and non-empty.');
    seen.add(id);
    if ((c.description ?? '').trim().length < 3) return fail(`Criterion ${id} description must be at least 3 characters.`);
    if (!Number.isInteger(c.weight) || c.weight <= 0 || c.weight > 100) return fail(`Criterion ${id} weight must be an integer between 1 and 100.`);
    total += c.weight;
  }
  if (total !== 100) return fail(`Criteria weights must sum to 100 (currently ${total}).`);
  return OK;
}

export function validateAddMilestone(m: {
  title: string; description: string; criteria: Criterion[]; freelancer: string; recipient: string; amountWei: string;
}): Check {
  if ((m.title ?? '').trim().length < 3) return fail('Milestone title must be at least 3 characters.');
  if ((m.description ?? '').trim().length < 5) return fail('Milestone description must be at least 5 characters.');
  const c = validateCriteria(m.criteria);
  if (!c.ok) return c;
  if (!isAddress(m.freelancer) || sameAddress(m.freelancer, ZERO_ADDRESS)) return fail('Freelancer must be a valid non-zero address.');
  const r = optionalAddress('Recipient vault', m.recipient);
  if (!r.ok) return r;
  const a = parseWeiAmount(m.amountWei);
  if (!a.ok) return fail(a.reason);
  return OK;
}

export function validateEvidence(e: { url: string; hash: string; notes: string }): Check {
  const url = (e.url ?? '').trim();
  if (!/^https?:\/\//.test(url)) return fail('Evidence URL must start with http:// or https://');
  if ((e.hash ?? '').trim().length < 6) return fail('Evidence hash/reference must be at least 6 characters.');
  if ((e.notes ?? '').trim().length < 5) return fail('Submission notes must be at least 5 characters.');
  return OK;
}

// ---------------------------------------------------------------------------
// Lifecycle preconditions against FRESH on-chain state
// ---------------------------------------------------------------------------

export function canAddMilestone(project: ProjectView | null, caller: string): Check {
  if (!project) return fail('Project not found on-chain.');
  if (!sameAddress(caller, project.client)) return fail('Only the project client can add milestones.');
  if (project.status !== 'ACTIVE') return fail(`Project is ${project.status}, not ACTIVE.`);
  return OK;
}

export function canFund(project: ProjectView, m: MilestoneView, caller: string, valueWei: bigint): Check {
  if (!sameAddress(caller, project.client)) return fail('Only the project client can fund this milestone.');
  if (m.status !== 'CREATED' || toBig(m.funded_wei) > 0n) return fail(`Milestone is ${m.status}; funding is only possible from CREATED.`);
  if (valueWei <= 0n) return fail('Funding requires a non-zero GEN value.');
  if (valueWei !== toBig(m.amount_wei)) return fail(`Value must equal the milestone amount exactly (${toBig(m.amount_wei)} wei); partial and over-funding are rejected by the contract.`);
  return OK;
}

export function canSubmitEvidence(m: MilestoneView, caller: string): Check {
  if (!sameAddress(caller, m.freelancer)) return fail('Only the milestone freelancer can submit evidence.');
  if (!['FUNDED', 'REJECTED', 'INCONCLUSIVE'].includes(m.status)) return fail(`Cannot submit evidence while milestone is ${m.status}.`);
  if (toBig(m.funded_wei) !== toBig(m.amount_wei) || m.settlement_count > 0) return fail('Milestone is not backed by active funded escrow.');
  return OK;
}

export function canEvaluate(project: ProjectView, m: MilestoneView, caller: string): Check {
  const party = sameAddress(caller, project.client) || sameAddress(caller, m.freelancer) || sameAddress(caller, project.arbitrator);
  if (!party) return fail('Only the client, freelancer, or arbitrator can request evaluation.');
  if (m.status !== 'EVIDENCE_SUBMITTED') return fail(`Evaluation requires EVIDENCE_SUBMITTED (current: ${m.status}).`);
  if (!(m.submission_version > 0) || !m.evidence_url) return fail('No active evidence submission to evaluate.');
  return OK;
}

/** True when the stored verdict was produced for the CURRENT evidence submission. */
export function isEvaluationFresh(m: MilestoneView): boolean {
  return m.evaluated_version > 0 && m.evaluated_version === m.submission_version && m.evaluated_evidence_hash === m.evidence_hash;
}

function available(m: MilestoneView): bigint {
  return toBig(m.funded_wei) - toBig(m.released_wei) - toBig(m.refunded_wei);
}

function notSettled(m: MilestoneView): Check {
  if (m.status === 'RELEASED' || m.status === 'REFUNDED' || m.settlement_count > 0 || toBig(m.released_wei) > 0n || toBig(m.refunded_wei) > 0n) {
    return fail('Milestone is already settled.');
  }
  return OK;
}

export function canRelease(project: ProjectView, m: MilestoneView, caller: string): Check {
  const party = sameAddress(caller, project.client) || sameAddress(caller, m.freelancer) || sameAddress(caller, project.arbitrator);
  if (!party) return fail('Only the client, freelancer, or arbitrator can trigger release.');
  const s = notSettled(m);
  if (!s.ok) return s;
  if (m.status === 'INCONCLUSIVE' || m.verdict === 'INCONCLUSIVE') return fail('INCONCLUSIVE evaluations cannot settle. Resubmit evidence or open a dispute.');
  if (m.status !== 'APPROVED' && m.status !== 'RESOLVED_RELEASE') return fail(`Release requires APPROVED or RESOLVED_RELEASE (current: ${m.status}).`);
  if (m.status === 'APPROVED' && (m.verdict !== 'APPROVED' || !isEvaluationFresh(m))) return fail('Stale or mismatched evaluation cannot authorize release.');
  const av = available(m);
  if (av <= 0n || av !== toBig(m.amount_wei)) return fail('Available escrow does not match the agreed amount.');
  return OK;
}

export function canRefund(project: ProjectView, m: MilestoneView, caller: string): Check {
  if (!sameAddress(caller, project.client) && !sameAddress(caller, project.arbitrator)) return fail('Only the client or arbitrator can trigger refund.');
  const s = notSettled(m);
  if (!s.ok) return s;
  if (m.status === 'INCONCLUSIVE' || m.verdict === 'INCONCLUSIVE') return fail('INCONCLUSIVE evaluations cannot settle. Resubmit evidence or open a dispute.');
  if (m.status !== 'REJECTED' && m.status !== 'RESOLVED_REFUND') return fail(`Refund requires REJECTED or RESOLVED_REFUND (current: ${m.status}).`);
  if (m.status === 'REJECTED' && (m.verdict !== 'REJECTED' || !isEvaluationFresh(m))) return fail('Stale or mismatched evaluation cannot authorize refund.');
  const av = available(m);
  if (av <= 0n || av !== toBig(m.amount_wei)) return fail('Available escrow does not match the agreed amount.');
  return OK;
}

export function canWithdraw(claim: ClaimView | null, caller: string, vaultApproved: boolean): Check {
  if (!claim) return fail('No claim exists for this milestone.');
  if (!sameAddress(caller, claim.beneficiary) && !sameAddress(caller, claim.recipient_vault)) return fail('Only the claim beneficiary or its designated vault can withdraw.');
  if (claim.status === 'DISPATCHED') return fail(`Claim already ${DISPATCHED_LABEL}.`);
  if (claim.status !== 'CLAIMABLE' || claim.dispatched_count > 0) return fail(`Claim is ${claim.status}; only CLAIMABLE claims can be withdrawn.`);
  if (sameAddress(claim.recipient_vault, ZERO_ADDRESS)) return fail('Claim destination is the zero address.');
  if (!vaultApproved) return fail('Destination vault is not approved by the contract deployer; withdraw_claim would revert.');
  return OK;
}

/** Which settlement actions the UI may offer, given current on-chain state (party checks excluded). */
export function settlementOptions(m: MilestoneView): { release: boolean; refund: boolean; note: string } {
  if (m.status === 'RELEASED' || m.status === 'REFUNDED' || m.settlement_count > 0) return { release: false, refund: false, note: 'Settled.' };
  if (m.status === 'INCONCLUSIVE') return { release: false, refund: false, note: 'INCONCLUSIVE: no settlement permitted. The freelancer may resubmit evidence, or a party may open a dispute.' };
  if (m.status === 'APPROVED') return isEvaluationFresh(m) && m.verdict === 'APPROVED' ? { release: true, refund: false, note: 'Approved by authoritative evaluation.' } : { release: false, refund: false, note: 'Evaluation is stale.' };
  if (m.status === 'REJECTED') return isEvaluationFresh(m) && m.verdict === 'REJECTED' ? { release: false, refund: true, note: 'Rejected by authoritative evaluation. The freelancer may also resubmit.' } : { release: false, refund: false, note: 'Evaluation is stale.' };
  if (m.status === 'RESOLVED_RELEASE') return { release: true, refund: false, note: 'Dispute resolved: release.' };
  if (m.status === 'RESOLVED_REFUND') return { release: false, refund: true, note: 'Dispute resolved: refund.' };
  return { release: false, refund: false, note: `No settlement available in ${m.status}.` };
}

export function claimDisplayStatus(c: Pick<ClaimView, 'status'>): string {
  if (c.status === 'DISPATCHED') return DISPATCHED_LABEL;
  return c.status;
}

// ---------------------------------------------------------------------------
// Error and receipt interpretation
// ---------------------------------------------------------------------------

export type ErrorKind = 'USER_REJECTED' | 'WRONG_NETWORK' | 'INSUFFICIENT_FUNDS' | 'RPC' | 'TIMEOUT' | 'REVERTED' | 'UNKNOWN';

export function classifyError(err: any): { kind: ErrorKind; message: string } {
  const code = err?.code ?? err?.cause?.code;
  const msg = String(err?.shortMessage || err?.message || err?.details || err || 'Unknown error');
  const low = msg.toLowerCase();
  if (code === 4001 || code === 'ACTION_REJECTED' || /user (rejected|denied|cancel)/.test(low)) return { kind: 'USER_REJECTED', message: 'Signature request was rejected in the wallet. Nothing was sent.' };
  if (low.includes('wallet is on chain') || low.includes('chain mismatch') || code === 4901) return { kind: 'WRONG_NETWORK', message: 'Wallet is not on GenLayer StudioNet (61999). Nothing was sent.' };
  if (low.includes('insufficient funds') || low.includes('insufficient balance')) return { kind: 'INSUFFICIENT_FUNDS', message: 'Insufficient GEN balance for this transaction.' };
  if (low.includes('timed out') || low.includes('timeout')) return { kind: 'TIMEOUT', message: msg };
  if (low.includes('revert') || low.includes('[expected]') || low.includes('usererror')) return { kind: 'REVERTED', message: msg };
  if (low.includes('failed to fetch') || low.includes('fetch failed') || low.includes('network') || low.includes('rpc') || code === -32603 || code === -32000) return { kind: 'RPC', message: msg };
  return { kind: 'UNKNOWN', message: msg };
}

export type ChainOutcome = 'PENDING' | 'ACCEPTED' | 'FINALIZED' | 'REVERTED' | 'UNDETERMINED' | 'UNKNOWN';

/** Interpret a GenLayer (Studio) transaction record. Never assumes success. */
export function interpretReceipt(tx: any): { outcome: ChainOutcome; statusName: string; executionResult: string | null } {
  if (!tx) return { outcome: 'UNKNOWN', statusName: 'NOT_FOUND', executionResult: null };
  const statusName = String(tx.statusName ?? tx.status_name ?? tx.status ?? 'UNKNOWN').toUpperCase();
  const lr = tx.consensus_data?.leader_receipt;
  const leader = Array.isArray(lr) ? lr[0] : lr;
  const exec = tx.txExecutionResultName ?? leader?.execution_result ?? tx.execution_result ?? null;
  const execU = exec ? String(exec).toUpperCase() : null;
  if (['CANCELED', 'CANCELLED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT'].includes(statusName)) return { outcome: 'REVERTED', statusName, executionResult: execU };
  if (statusName === 'UNDETERMINED') return { outcome: 'UNDETERMINED', statusName, executionResult: execU };
  if (statusName === 'ACCEPTED' || statusName === 'FINALIZED') {
    if (execU && execU !== 'SUCCESS' && execU !== 'FINISHED_WITH_RETURN') return { outcome: 'REVERTED', statusName, executionResult: execU };
    if (!execU) return { outcome: 'UNKNOWN', statusName, executionResult: null };
    return { outcome: statusName as ChainOutcome, statusName, executionResult: execU };
  }
  return { outcome: 'PENDING', statusName, executionResult: execU };
}

// ---------------------------------------------------------------------------
// Transaction orchestrator
// ---------------------------------------------------------------------------

export type TxPhase =
  | 'idle' | 'checking' | 'awaiting_signature' | 'submitted' | 'pending'
  | 'confirmed'      // chain accepted AND read-back verified the expected state
  | 'unverified'     // chain accepted but read-back did not confirm (or execution result unknown)
  | 'reverted' | 'rejected' | 'wrong_network' | 'insufficient_funds' | 'rpc_error' | 'timeout' | 'blocked' | 'error';

export interface TxUpdate {
  phase: TxPhase;
  hash?: string;
  message?: string;
  chainStatus?: string;
  executionResult?: string | null;
}

export interface TxSpec {
  /** Stable lock key, e.g. `fund:12`. Prevents duplicate in-flight submissions. */
  key: string;
  action: string;
  contract: string;
  caller: string;
  method: string;
  args: unknown[];
  valueWei: bigint;
  /** Re-reads fresh on-chain state right before signing; rejects stale UI state. */
  preflight: () => Promise<Check>;
  /** Re-reads on-chain state after acceptance; true only if the expected change is observed. */
  verify: () => Promise<boolean>;
}

export interface TxDeps {
  gateOpen: () => boolean;
  getWalletChainId: () => Promise<number>;
  getWalletAccount: () => Promise<string | null>;
  getBalance: (addr: string) => Promise<bigint>;
  send: (spec: TxSpec) => Promise<string>;
  getReceipt: (hash: string) => Promise<any>;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

const inFlight = new Set<string>();
export function isInFlight(key: string): boolean { return inFlight.has(key); }
/** Test helper. */
export function _resetInFlight(): void { inFlight.clear(); }

export async function runTransaction(spec: TxSpec, deps: TxDeps, onUpdate: (u: TxUpdate) => void = () => {}): Promise<TxUpdate> {
  const emit = (u: TxUpdate) => { onUpdate(u); return u; };
  if (inFlight.has(spec.key)) return emit({ phase: 'blocked', message: 'An identical transaction is already in progress. Duplicate submission prevented.' });
  inFlight.add(spec.key);
  let hash: string | undefined;
  try {
    if (!deps.gateOpen()) return emit({ phase: 'blocked', message: 'V2 writes are disabled by the deployment gate (NEXT_PUBLIC_V2_DEPLOYED=false).' });
    emit({ phase: 'checking', message: 'Checking wallet, network, balance and on-chain state…' });

    const chainId = await deps.getWalletChainId();
    if (chainId !== STUDIONET_CHAIN_ID) return emit({ phase: 'wrong_network', message: `Wallet is on chain ${chainId}; switch to GenLayer StudioNet (${STUDIONET_CHAIN_ID}). Nothing was sent.` });
    const account = await deps.getWalletAccount();
    if (!account) return emit({ phase: 'blocked', message: 'No wallet account connected.' });
    if (!sameAddress(account, spec.caller)) return emit({ phase: 'blocked', message: `Active wallet account ${account} differs from the confirmed caller ${spec.caller}. Re-confirm.` });

    if (spec.valueWei < 0n) return emit({ phase: 'blocked', message: 'Invalid negative value.' });
    if (spec.valueWei > 0n) {
      const bal = await deps.getBalance(account);
      if (bal < spec.valueWei) return emit({ phase: 'insufficient_funds', message: `Balance ${bal} wei is less than required ${spec.valueWei} wei.` });
    }

    const pre = await spec.preflight();
    if (!pre.ok) return emit({ phase: 'blocked', message: `On-chain state check failed: ${pre.reason}` });

    emit({ phase: 'awaiting_signature', message: 'Confirm the transaction in your wallet…' });
    hash = await deps.send(spec);
    if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return emit({ phase: 'error', message: `Wallet/SDK returned no valid transaction hash (${String(hash)}). Outcome unknown; do not assume success.` });
    emit({ phase: 'submitted', hash, message: 'Submitted. Waiting for GenLayer consensus…' });

    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const now = deps.now ?? (() => Date.now());
    const deadline = now() + (deps.timeoutMs ?? 300_000);
    const interval = deps.pollIntervalMs ?? 3_000;
    for (;;) {
      let rec: any = null;
      try { rec = await deps.getReceipt(hash); } catch (e) {
        const c = classifyError(e);
        if (c.kind !== 'RPC' && c.kind !== 'UNKNOWN') throw e;
        // transient read failure while polling: keep polling until the deadline
      }
      const r = interpretReceipt(rec);
      if (r.outcome === 'REVERTED') return emit({ phase: 'reverted', hash, chainStatus: r.statusName, executionResult: r.executionResult, message: `Transaction failed on-chain (${r.statusName}${r.executionResult ? ` / ${r.executionResult}` : ''}).` });
      if (r.outcome === 'UNDETERMINED') return emit({ phase: 'unverified', hash, chainStatus: r.statusName, message: 'Consensus UNDETERMINED. State may not have changed.' });
      if (r.outcome === 'ACCEPTED' || r.outcome === 'FINALIZED' || (r.outcome === 'UNKNOWN' && rec && r.statusName !== 'NOT_FOUND')) {
        let verified = false;
        try { verified = await spec.verify(); } catch { verified = false; }
        if (verified && r.outcome !== 'UNKNOWN') return emit({ phase: 'confirmed', hash, chainStatus: r.statusName, executionResult: r.executionResult, message: 'Accepted by consensus, and the expected state change was confirmed by contract read-back.' });
        return emit({ phase: 'unverified', hash, chainStatus: r.statusName, executionResult: r.executionResult, message: verified ? 'State read-back matches, but the execution result could not be determined from the receipt.' : 'Chain reports a decided status, but the expected state change was NOT observed on read-back.' });
      }
      emit({ phase: 'pending', hash, chainStatus: r.statusName, message: `Pending (${r.statusName})…` });
      if (now() >= deadline) return emit({ phase: 'timeout', hash, chainStatus: r.statusName, message: 'Timed out waiting for consensus. The transaction may still complete; check the hash before retrying.' });
      await sleep(interval);
    }
  } catch (e) {
    const c = classifyError(e);
    const map: Record<ErrorKind, TxPhase> = { USER_REJECTED: 'rejected', WRONG_NETWORK: 'wrong_network', INSUFFICIENT_FUNDS: 'insufficient_funds', RPC: 'rpc_error', TIMEOUT: 'timeout', REVERTED: 'reverted', UNKNOWN: 'error' };
    return emit({ phase: map[c.kind], hash, message: c.message });
  } finally {
    inFlight.delete(spec.key);
  }
}

export function isTerminal(p: TxPhase): boolean {
  return !['checking', 'awaiting_signature', 'submitted', 'pending'].includes(p);
}
