/**
 * MOCKED UNIT TESTS for the TrustLedger V2 write path (src/lib/escrow-core.ts).
 *
 * All wallet, RPC, receipt, and read-back calls in this file are MOCKED.
 * These tests verify client-side validation, lifecycle guards, duplicate
 * submission locks, error classification, and receipt/read-back semantics.
 * They are NOT proof of a live on-chain transaction.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWeiAmount,
  validateCreateProject,
  validateCriteria,
  validateAddMilestone,
  validateEvidence,
  canAddMilestone,
  canFund,
  canSubmitEvidence,
  canEvaluate,
  canRelease,
  canRefund,
  canWithdraw,
  settlementOptions,
  claimDisplayStatus,
  DISPATCHED_LABEL,
  runTransaction,
  _resetInFlight,
} from '../src/lib/escrow-core.ts';

const CLIENT = '0x1dc6E34729A34175637C14FfA57D02b62465D6B2';
const FREE = '0xCd71365B1689407CD4e4a6E06Ce2d264c7412ADF';
const ARB = '0xF88acD371eF5259ca6D1e75A11eC64c83a6Ec7f1';
const OTHER = '0x1111111111111111111111111111111111111111';
const VAULT = '0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775';
const ZERO = '0x0000000000000000000000000000000000000000';
const V2 = '0x4Ec472F1fEc41cB89Fd11DfD788679786E874336';
const HASH = '0x' + 'a'.repeat(64);

const proj = (over = {}) => ({
  project_id: 1, client: CLIENT, refund_recipient: CLIENT, arbitrator: ARB, title: 'Proj', status: 'ACTIVE', milestone_count: 1, ...over,
});
const ms = (over = {}) => ({
  milestone_id: 1, project_id: 1, freelancer: FREE, recipient: VAULT,
  amount_wei: 100000n, funded_wei: 0n, released_wei: 0n, refunded_wei: 0n,
  status: 'CREATED', submission_version: 0, evidence_url: '', evidence_hash: '',
  evaluated_version: 0, evaluated_evidence_hash: '', verdict: 'NONE', settlement_count: 0, ...over,
});
const claim = (over = {}) => ({
  claim_id: 1, milestone_id: 1, claim_type: 'PAYOUT', beneficiary: FREE, recipient_vault: VAULT,
  amount_wei: 100000n, status: 'CLAIMABLE', dispatched_count: 0, ...over,
});

function baseDeps(over = {}) {
  return {
    gateOpen: () => true,
    getWalletChainId: async () => 61999,
    getWalletAccount: async () => CLIENT,
    getBalance: async () => 9_650_000n,
    send: async () => HASH,
    getReceipt: async () => ({ statusName: 'ACCEPTED', consensus_data: { leader_receipt: [{ execution_result: 'SUCCESS' }] } }),
    sleep: async () => {},
    pollIntervalMs: 1,
    timeoutMs: 50,
    ...over,
  };
}
function baseSpec(over = {}) {
  return {
    key: 'k', action: 'test', contract: V2, caller: CLIENT, method: 'create_project',
    args: ['Title', 'Description', '', ''], valueWei: 0n,
    preflight: async () => ({ ok: true }),
    verify: async () => true,
    ...over,
  };
}

// 1. Successful submission + read-back verification (and unverified if read-back fails)
test('[MOCKED] successful transaction requires both consensus acceptance and contract read-back', async () => {
  _resetInFlight();
  const ok = await runTransaction(baseSpec(), baseDeps());
  assert.equal(ok.phase, 'confirmed');
  assert.equal(ok.hash, HASH);

  // If the chain reports ACCEPTED but the expected state is not observed on read-back, never report confirmed.
  const stale = await runTransaction(baseSpec({ verify: async () => false }), baseDeps());
  assert.equal(stale.phase, 'unverified');
});

// 2. User rejection and wrong-chain rejection
test('[MOCKED] user signature rejection (EIP-1193 4001) and wrong chain are reported honestly without false success', async () => {
  _resetInFlight();
  const rej = await runTransaction(baseSpec(), baseDeps({
    send: async () => { const e = new Error('User rejected the request.'); e.code = 4001; throw e; },
  }));
  assert.equal(rej.phase, 'rejected');
  assert.equal(rej.hash, undefined);

  let sent = false;
  const wrong = await runTransaction(baseSpec(), baseDeps({
    getWalletChainId: async () => 1,
    send: async () => { sent = true; return HASH; },
  }));
  assert.equal(wrong.phase, 'wrong_network');
  assert.equal(sent, false);

  const gated = await runTransaction(baseSpec(), baseDeps({ gateOpen: () => false }));
  assert.equal(gated.phase, 'blocked');
});

// 3. Insufficient GEN and invalid amounts
test('[MOCKED] insufficient GEN balance and invalid / partial / over-funding amounts are rejected', async () => {
  for (const bad of ['', '0', '-1', '1.5', 'abc', '100 wei']) {
    assert.equal(parseWeiAmount(bad).ok, false, `should reject "${bad}"`);
  }
  assert.deepEqual(parseWeiAmount('100000'), { ok: true, wei: 100000n });

  assert.equal(canFund(proj(), ms(), CLIENT, 0n).ok, false);
  assert.equal(canFund(proj(), ms(), CLIENT, 99999n).ok, false);  // partial
  assert.equal(canFund(proj(), ms(), CLIENT, 100001n).ok, false); // over
  assert.equal(canFund(proj(), ms(), CLIENT, 100000n).ok, true);

  const lowBal = await runTransaction(baseSpec({ method: 'fund_milestone', args: [1], valueWei: 100000n }), baseDeps({ getBalance: async () => 50000n }));
  assert.equal(lowBal.phase, 'insufficient_funds');
});

// 4. Invalid or unauthorized vaults and callers
test('[MOCKED] unapproved vaults, zero addresses, and unauthorized callers are blocked', () => {
  assert.equal(canWithdraw(claim(), FREE, false).ok, false, 'unapproved vault must block withdraw');
  assert.equal(canWithdraw(claim({ recipient_vault: ZERO }), FREE, true).ok, false);
  assert.equal(canWithdraw(claim(), OTHER, true).ok, false);
  assert.equal(canWithdraw(claim(), FREE, true).ok, true);
  assert.equal(canWithdraw(claim(), VAULT, true).ok, true);

  assert.equal(canAddMilestone(proj(), FREE).ok, false);
  assert.equal(canFund(proj(), ms(), FREE, 100000n).ok, false);
  assert.equal(canSubmitEvidence(ms({ status: 'FUNDED', funded_wei: 100000n }), CLIENT).ok, false);
  assert.equal(canEvaluate(proj(), ms({ status: 'EVIDENCE_SUBMITTED', submission_version: 1, evidence_url: 'https://x' }), OTHER).ok, false);
  assert.equal(canRefund(proj(), ms({ status: 'REJECTED', verdict: 'REJECTED', funded_wei: 100000n, submission_version: 1, evaluated_version: 1, evidence_hash: 'abcdef', evaluated_evidence_hash: 'abcdef' }), FREE).ok, false);

  assert.equal(validateCreateProject({ title: 'ab', description: 'valid desc', refundRecipient: '', arbitrator: '' }).ok, false);
  assert.equal(validateCreateProject({ title: 'ok!', description: 'valid desc', refundRecipient: ZERO, arbitrator: '' }).ok, false);
  assert.equal(validateCriteria([{ id: 'C1', description: 'one', weight: 60, mandatory: true }]).ok, false);
  assert.equal(validateAddMilestone({ title: 'M1!', description: 'desc!', criteria: [{ id: 'C1', description: 'one', weight: 100, mandatory: true }], freelancer: ZERO, recipient: '', amountWei: '100' }).ok, false);
  assert.equal(validateEvidence({ url: 'ftp://x', hash: '123456', notes: 'notes' }).ok, false);
});

// 5. Invalid lifecycle transitions and stale evaluations
test('[MOCKED] invalid lifecycle transitions and stale evaluations are blocked, including mid-review state drift', async () => {
  assert.equal(canFund(proj(), ms({ status: 'FUNDED', funded_wei: 100000n }), CLIENT, 100000n).ok, false);
  assert.equal(canSubmitEvidence(ms({ status: 'CREATED' }), FREE).ok, false);
  assert.equal(canEvaluate(proj(), ms({ status: 'FUNDED', funded_wei: 100000n }), CLIENT).ok, false);

  // Stale evaluation: submission_version bumped to 2 after v1 was APPROVED, or hash mismatch
  const staleVer = ms({ status: 'APPROVED', verdict: 'APPROVED', funded_wei: 100000n, submission_version: 2, evaluated_version: 1, evidence_hash: 'bbbbbb', evaluated_evidence_hash: 'bbbbbb' });
  const staleHash = ms({ status: 'APPROVED', verdict: 'APPROVED', funded_wei: 100000n, submission_version: 1, evaluated_version: 1, evidence_hash: 'bbbbbb', evaluated_evidence_hash: 'aaaaaa' });
  assert.equal(canRelease(proj(), staleVer, CLIENT).ok, false);
  assert.equal(canRelease(proj(), staleHash, CLIENT).ok, false);

  // Already settled
  const settled = ms({ status: 'RELEASED', verdict: 'APPROVED', funded_wei: 100000n, released_wei: 100000n, settlement_count: 1, submission_version: 1, evaluated_version: 1, evidence_hash: 'aaaaaa', evaluated_evidence_hash: 'aaaaaa' });
  assert.equal(canRelease(proj(), settled, CLIENT).ok, false);

  // Preflight catches state that changed between UI render and signing
  const drift = await runTransaction(baseSpec({ preflight: async () => ({ ok: false, reason: 'Milestone state changed since you reviewed it' }) }), baseDeps());
  assert.equal(drift.phase, 'blocked');
});

// 6. INCONCLUSIVE evaluations block settlement
test('[MOCKED] INCONCLUSIVE evaluations cannot release or refund, and expose no settlement option', () => {
  const inc = ms({
    status: 'INCONCLUSIVE', verdict: 'INCONCLUSIVE', funded_wei: 100000n,
    submission_version: 1, evaluated_version: 1, evidence_hash: 'abcdef', evaluated_evidence_hash: 'abcdef',
  });
  assert.equal(canRelease(proj(), inc, CLIENT).ok, false);
  assert.equal(canRefund(proj(), inc, CLIENT).ok, false);
  assert.deepEqual(settlementOptions(inc), {
    release: false, refund: false,
    note: 'INCONCLUSIVE: no settlement permitted. The freelancer may resubmit evidence, or a party may open a dispute.',
  });
  // Resubmission IS allowed from INCONCLUSIVE
  assert.equal(canSubmitEvidence(inc, FREE).ok, true);
});

// 7. Transaction revert and RPC timeout
test('[MOCKED] on-chain revert, send-time RPC failure, and consensus polling timeout are reported accurately', async () => {
  _resetInFlight();
  const rev = await runTransaction(baseSpec(), baseDeps({
    getReceipt: async () => ({ statusName: 'ACCEPTED', consensus_data: { leader_receipt: [{ execution_result: 'ERROR' }] } }),
  }));
  assert.equal(rev.phase, 'reverted');
  assert.equal(rev.hash, HASH);

  let t = 0;
  const to = await runTransaction(baseSpec(), baseDeps({
    getReceipt: async () => ({ statusName: 'PENDING' }),
    now: () => (t += 30),
    timeoutMs: 50,
  }));
  assert.equal(to.phase, 'timeout');
  assert.equal(to.hash, HASH);

  const rpcErr = await runTransaction(baseSpec(), baseDeps({
    send: async () => { throw new Error('fetch failed: RPC unreachable'); },
  }));
  assert.equal(rpcErr.phase, 'rpc_error');
});

// 8. Duplicate submission protection
test('[MOCKED] concurrent submission with the same key is blocked until the first completes', async () => {
  _resetInFlight();
  let releaseFirst;
  const gate = new Promise((r) => { releaseFirst = r; });
  const deps = baseDeps({ send: async () => { await gate; return HASH; } });

  const first = runTransaction(baseSpec({ key: 'fund:1' }), deps);
  const dup = await runTransaction(baseSpec({ key: 'fund:1' }), deps);
  assert.equal(dup.phase, 'blocked');
  assert.match(dup.message, /Duplicate submission prevented/);

  releaseFirst();
  assert.equal((await first).phase, 'confirmed');
});

// 9. Asynchronous transfer remains unverified
test('[MOCKED] withdraw_claim labels DISPATCHED claims as unverified on-chain and blocks repeat withdrawal', () => {
  const dispatched = claim({ status: 'DISPATCHED', dispatched_count: 1 });
  assert.equal(claimDisplayStatus(dispatched), DISPATCHED_LABEL);
  assert.equal(DISPATCHED_LABEL, 'DISPATCHED — Unverified on-chain');
  const again = canWithdraw(dispatched, FREE, true);
  assert.equal(again.ok, false);
  assert.match(again.reason, /Unverified on-chain/);
});
