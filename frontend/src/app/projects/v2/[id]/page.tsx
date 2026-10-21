'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWallet, shortenAddress } from '@/lib/wallet';
import { formatWeiToGen } from '@/lib/genlayer';
import {
  V2_ADDRESS, v2GetProjectOrNull, v2ListMilestones, v2GetMilestone, v2Summary, v2GetClaimByMilestone, v2IsVaultApproved,
} from '@/lib/escrow';
import {
  validateAddMilestone, validateEvidence, parseWeiAmount, canAddMilestone, canFund, canSubmitEvidence, canEvaluate,
  canRelease, canRefund, canWithdraw, settlementOptions, claimDisplayStatus, isEvaluationFresh, sameAddress, toBig,
  type Criterion, type MilestoneView, type ProjectView, type ClaimView, type Check, type TxUpdate,
} from '@/lib/escrow-core';
import { TxConfirmDialog, WriteBlockerNotice, useWriteBlocker, type PendingTx } from '@/components/TxDialog';
import { ArrowLeft, AlertTriangle, RefreshCw, Plus, Trash2 } from 'lucide-react';

type M = MilestoneView & Record<string, any>;
type P = ProjectView & Record<string, any>;
const input = 'w-full bg-[#0e1629] border border-slate-800 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-500';
const btn = 'px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed';

/** Re-read milestone and reject if it changed since the user reviewed it (stale-state guard). */
async function freshMilestone(snapshot: M): Promise<{ m: M } | { err: Check }> {
  const m = await v2GetMilestone(snapshot.milestone_id);
  if (m.status !== snapshot.status || m.submission_version !== snapshot.submission_version || m.evaluated_version !== snapshot.evaluated_version) {
    return { err: { ok: false, reason: `Milestone state changed since you reviewed it (now ${m.status}, submission v${m.submission_version}). Refresh and review again.` } };
  }
  return { m };
}

export default function V2ProjectPage() {
  const params = useParams<{ id: string }>();
  const pid = Number(params?.id);
  const wallet = useWallet();
  const blocker = useWriteBlocker();
  const [project, setProject] = useState<P | null>(null);
  const [milestones, setMilestones] = useState<M[]>([]);
  const [claims, setClaims] = useState<Record<number, { claim: ClaimView | null; vaultApproved: boolean | null }>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState<PendingTx | null>(null);

  const refresh = useCallback(async () => {
    if (!Number.isInteger(pid) || pid < 1) { setLoadError('Invalid project id.'); setLoading(false); return; }
    setLoading(true);
    try {
      const p = await v2GetProjectOrNull(pid);
      setProject(p);
      if (!p) { setLoadError(`Project #${pid} does not exist on the V2 contract.`); return; }
      const ms = await v2ListMilestones(pid);
      setMilestones(ms);
      const cl: typeof claims = {};
      for (const m of ms) {
        if (m.settlement_count > 0 || m.status === 'RELEASED' || m.status === 'REFUNDED') {
          const c = await v2GetClaimByMilestone(m.milestone_id);
          cl[m.milestone_id] = { claim: c, vaultApproved: c ? await v2IsVaultApproved(c.recipient_vault) : null };
        }
      }
      setClaims(cl);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(`Failed to read V2 contract state: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { refresh(); }, [refresh]);

  const open = (t: PendingTx) => setTx({ ...t, onFinished: (u: TxUpdate) => { t.onFinished?.(u); refresh(); } });
  const me = wallet.address ?? '';

  return (
    <div className="space-y-5 max-w-5xl mx-auto text-xs">
      <div className="flex items-center justify-between">
        <Link href="/projects" className="inline-flex items-center gap-2 text-slate-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /> Projects</Link>
        <button onClick={refresh} className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white" data-testid="refresh"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh from chain</button>
      </div>

      {loadError && <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-3" data-testid="load-error">{loadError}</div>}

      {project && (
        <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-5 space-y-2" data-testid="project-header">
          <div className="text-[10px] uppercase text-slate-500">V2 · {V2_ADDRESS}</div>
          <h1 className="text-xl font-bold text-white">#{project.project_id} {project.title}</h1>
          <p className="text-slate-400">{project.description}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-slate-300">
            <div>status <span className="text-white">{project.status}</span></div>
            <div>client {shortenAddress(project.client)}</div>
            <div>arbitrator {shortenAddress(project.arbitrator)}</div>
            <div>refund → {shortenAddress(project.refund_recipient)}</div>
            <div>committed {formatWeiToGen(project.total_committed_wei)}</div>
            <div>funded {formatWeiToGen(project.total_funded_wei)}</div>
            <div>released {formatWeiToGen(project.total_released_wei)}</div>
            <div>refunded {formatWeiToGen(project.total_refunded_wei)}</div>
          </div>
        </div>
      )}

      <WriteBlockerNotice />

      {project && <AddMilestone project={project} me={me} blocked={!!blocker} open={open} />}

      {project && milestones.length === 0 && !loading && <div className="text-slate-400">No milestones on-chain yet.</div>}
      {project && milestones.map((m) => (
        <MilestoneCard key={m.milestone_id} project={project} m={m} me={me} blocked={!!blocker} open={open} claimInfo={claims[m.milestone_id]} />
      ))}

      <TxConfirmDialog tx={tx} onClose={() => setTx(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function AddMilestone({ project, me, blocked, open }: { project: P; me: string; blocked: boolean; open: (t: PendingTx) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [freelancer, setFreelancer] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amountWei, setAmountWei] = useState('');
  const [criteria, setCriteria] = useState<Criterion[]>([{ id: 'C1', description: '', weight: 100, mandatory: true }]);
  const baseline = useRef(0);
  const party = canAddMilestone(project, me);
  const check = validateAddMilestone({ title, description, criteria, freelancer, recipient, amountWei });
  const amt = parseWeiAmount(amountWei);

  const setC = (i: number, patch: Partial<Criterion>) => setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const submit = () => {
    if (!check.ok || !party.ok || !V2_ADDRESS || !amt.ok) return;
    const criteriaJson = JSON.stringify(criteria.map((c) => ({ id: c.id.trim(), description: c.description.trim(), weight: c.weight, mandatory: c.mandatory })));
    open({
      key: `add_milestone:${project.project_id}:${title.trim()}`,
      action: `Add milestone to project #${project.project_id}`,
      contract: V2_ADDRESS,
      method: 'add_milestone',
      args: [project.project_id, title.trim(), description.trim(), criteriaJson, freelancer.trim(), recipient.trim(), amt.wei],
      valueWei: 0n,
      preflight: async () => {
        const p = await v2GetProjectOrNull(project.project_id);
        const c = canAddMilestone(p, me);
        if (!c.ok) return c;
        baseline.current = Number((await v2Summary()).milestone_count);
        return { ok: true };
      },
      verify: async () => {
        const ms = await v2ListMilestones(project.project_id);
        return ms.some((m) => m.milestone_id > baseline.current && m.title === title.trim() && toBig(m.amount_wei) === amt.wei && m.status === 'CREATED');
      },
    });
  };

  if (!party.ok) return <div className="text-slate-500 border border-slate-800 rounded-xl p-3">Add milestone: {party.reason}</div>;

  return (
    <details className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-4 space-y-3" data-testid="add-milestone">
      <summary className="cursor-pointer text-sm font-bold text-white">Add milestone (client only)</summary>
      <div className="grid sm:grid-cols-2 gap-3 pt-3">
        <label className="text-slate-300">Title<input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="text-slate-300">Amount (wei, exact funding amount)<input className={`${input} font-mono`} value={amountWei} onChange={(e) => setAmountWei(e.target.value)} placeholder="100000" />
          {amt.ok && <span className="text-[10px] text-slate-500">{formatWeiToGen(amt.wei)}</span>}</label>
        <label className="text-slate-300 sm:col-span-2">Description<textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="text-slate-300">Freelancer address<input className={`${input} font-mono`} value={freelancer} onChange={(e) => setFreelancer(e.target.value)} /></label>
        <label className="text-slate-300">Payout recipient vault (optional; withdrawals require a deployer-approved vault)<input className={`${input} font-mono`} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="default: freelancer" /></label>
      </div>
      <div className="space-y-2">
        <div className="text-slate-300 font-semibold">Acceptance criteria (weights must sum to 100)</div>
        {criteria.map((c, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input className={`${input} col-span-2`} value={c.id} onChange={(e) => setC(i, { id: e.target.value })} />
            <input className={`${input} col-span-6`} value={c.description} placeholder="criterion description" onChange={(e) => setC(i, { description: e.target.value })} />
            <input className={`${input} col-span-2 font-mono`} type="number" value={c.weight} onChange={(e) => setC(i, { weight: Number(e.target.value) })} />
            <label className="col-span-1 text-slate-400 flex items-center gap-1"><input type="checkbox" checked={c.mandatory} onChange={(e) => setC(i, { mandatory: e.target.checked })} />req</label>
            <button className="col-span-1 text-slate-500 hover:text-rose-300" onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))} aria-label="remove"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button className="inline-flex items-center gap-1 text-blue-300" onClick={() => setCriteria((cs) => [...cs, { id: `C${cs.length + 1}`, description: '', weight: 0, mandatory: true }])}><Plus className="w-3.5 h-3.5" /> criterion</button>
      </div>
      {!check.ok && (title || description || freelancer || amountWei) && <div className="text-rose-300 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {check.reason}</div>}
      <button className={`${btn} bg-blue-600 text-white`} disabled={!check.ok || blocked} onClick={submit}>Review add_milestone transaction</button>
    </details>
  );
}

// ---------------------------------------------------------------------------
function MilestoneCard({ project, m, me, blocked, open, claimInfo }: {
  project: P; m: M; me: string; blocked: boolean; open: (t: PendingTx) => void;
  claimInfo?: { claim: ClaimView | null; vaultApproved: boolean | null };
}) {
  const [evUrl, setEvUrl] = useState('');
  const [evHash, setEvHash] = useState('');
  const [evNotes, setEvNotes] = useState('');
  const contract = V2_ADDRESS!;
  const amount = toBig(m.amount_wei);
  const settle = settlementOptions(m);

  const fundCheck = canFund(project, m, me, amount);
  const evCheck = canSubmitEvidence(m, me);
  const evInput = validateEvidence({ url: evUrl, hash: evHash, notes: evNotes });
  const evalCheck = canEvaluate(project, m, me);
  const relCheck = canRelease(project, m, me);
  const refCheck = canRefund(project, m, me);
  const claim = claimInfo?.claim ?? null;
  const wdCheck = canWithdraw(claim, me, !!claimInfo?.vaultApproved);

  const fund = () => open({
    key: `fund:${m.milestone_id}`, action: `Fund milestone #${m.milestone_id} with native GEN`, contract, method: 'fund_milestone',
    args: [m.milestone_id], valueWei: amount,
    preflight: async () => {
      const f = await freshMilestone(m); if ('err' in f) return f.err;
      const p = await v2GetProjectOrNull(m.project_id); if (!p) return { ok: false, reason: 'Project missing.' };
      return canFund(p, f.m, me, amount);
    },
    verify: async () => { const x = await v2GetMilestone(m.milestone_id); return x.status === 'FUNDED' && toBig(x.funded_wei) === amount; },
  });

  const submitEvidence = () => {
    const prevVersion = m.submission_version;
    const hash = evHash.trim();
    open({
      key: `evidence:${m.milestone_id}`, action: `Submit evidence for milestone #${m.milestone_id}`, contract, method: 'submit_evidence',
      args: [m.milestone_id, evUrl.trim(), hash, evNotes.trim()], valueWei: 0n,
      preflight: async () => { const f = await freshMilestone(m); if ('err' in f) return f.err; return canSubmitEvidence(f.m, me); },
      verify: async () => { const x = await v2GetMilestone(m.milestone_id); return x.status === 'EVIDENCE_SUBMITTED' && x.submission_version === prevVersion + 1 && x.evidence_hash === hash; },
    });
  };

  const evaluate = () => {
    const ver = m.submission_version;
    open({
      key: `evaluate:${m.milestone_id}`, action: `Request AI-consensus evaluation of milestone #${m.milestone_id} (submission v${ver})`, contract, method: 'evaluate_milestone',
      args: [m.milestone_id], valueWei: 0n,
      preflight: async () => {
        const f = await freshMilestone(m); if ('err' in f) return f.err;
        const p = await v2GetProjectOrNull(m.project_id); if (!p) return { ok: false, reason: 'Project missing.' };
        return canEvaluate(p, f.m, me);
      },
      verify: async () => { const x = await v2GetMilestone(m.milestone_id); return x.evaluated_version === ver && ['APPROVED', 'REJECTED', 'INCONCLUSIVE'].includes(x.status); },
    });
  };

  const settleTx = (kind: 'release' | 'refund') => open({
    key: `settle:${m.milestone_id}`, action: `${kind === 'release' ? 'Release' : 'Refund'} milestone #${m.milestone_id} (creates a pull claim; no transfer yet)`, contract,
    method: kind === 'release' ? 'release_milestone' : 'refund_milestone', args: [m.milestone_id], valueWei: 0n,
    preflight: async () => {
      const f = await freshMilestone(m); if ('err' in f) return f.err;
      const p = await v2GetProjectOrNull(m.project_id); if (!p) return { ok: false, reason: 'Project missing.' };
      return kind === 'release' ? canRelease(p, f.m, me) : canRefund(p, f.m, me);
    },
    verify: async () => {
      const x = await v2GetMilestone(m.milestone_id);
      const c = await v2GetClaimByMilestone(m.milestone_id);
      return x.status === (kind === 'release' ? 'RELEASED' : 'REFUNDED') && !!c && c.status === 'CLAIMABLE' && toBig(c.amount_wei) === amount;
    },
  });

  const withdraw = () => claim && open({
    key: `withdraw:${claim.claim_id}`, action: `Withdraw claim #${claim.claim_id} to vault ${claim.recipient_vault} (asynchronous dispatch; delivery not verifiable)`, contract,
    method: 'withdraw_claim', args: [claim.claim_id], valueWei: 0n,
    preflight: async () => {
      const c = await v2GetClaimByMilestone(m.milestone_id);
      if (!c || c.claim_id !== claim.claim_id) return { ok: false, reason: 'Claim changed or missing.' };
      return canWithdraw(c, me, await v2IsVaultApproved(c.recipient_vault));
    },
    // Confirms only that the contract recorded the dispatch. It does not prove the vault received funds.
    verify: async () => { const c = await v2GetClaimByMilestone(m.milestone_id); return !!c && c.status === 'DISPATCHED'; },
  });

  const role = [sameAddress(me, project.client) && 'client', sameAddress(me, m.freelancer) && 'freelancer', sameAddress(me, project.arbitrator) && 'arbitrator'].filter(Boolean).join(', ') || 'not a party';

  return (
    <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-4 space-y-3" data-testid={`milestone-${m.milestone_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">Milestone #{m.milestone_id}: {m.title}</h3>
        <span className="px-2 py-0.5 rounded-full border border-slate-700 font-mono text-[11px] text-white" data-testid="ms-status">{m.status}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-slate-300">
        <div>amount {amount.toString()} wei</div>
        <div>funded {toBig(m.funded_wei).toString()} wei</div>
        <div>freelancer {shortenAddress(m.freelancer)}</div>
        <div>recipient {shortenAddress(m.recipient)}</div>
        <div>submission v{m.submission_version}</div>
        <div>evaluated v{m.evaluated_version}</div>
        <div>verdict {m.verdict} {m.verdict !== 'NONE' && `(${m.score})`}</div>
        <div>your role: {role}</div>
      </div>
      {m.evaluation_rationale && <div className="text-slate-400 bg-black/20 rounded p-2">Rationale: {m.evaluation_rationale}{!isEvaluationFresh(m) && m.verdict !== 'NONE' && ' (stale)'}</div>}
      {m.evidence_url && <div className="text-slate-400 break-all">Evidence: <a className="text-blue-300 underline" href={m.evidence_url} target="_blank" rel="noreferrer">{m.evidence_url}</a> · hash {m.evidence_hash}</div>}

      <div className="flex flex-wrap gap-2">
        <Action label={`Fund ${amount} wei`} check={fundCheck} blocked={blocked} onClick={fund} testid="act-fund" />
        <Action label="Request evaluation" check={evalCheck} blocked={blocked} onClick={evaluate} testid="act-evaluate" />
        {settle.release && <Action label="Release to freelancer (claim)" check={relCheck} blocked={blocked} onClick={() => settleTx('release')} testid="act-release" />}
        {settle.refund && <Action label="Refund to client (claim)" check={refCheck} blocked={blocked} onClick={() => settleTx('refund')} testid="act-refund" />}
      </div>
      <div className="text-[11px] text-slate-400" data-testid="settle-note">Settlement: {settle.note}</div>

      {evCheck.ok && (
        <div className="border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="font-semibold text-slate-200">Submit evidence (freelancer)</div>
          <input className={input} placeholder="https://… public evidence URL (fetched by validators)" value={evUrl} onChange={(e) => setEvUrl(e.target.value)} />
          <input className={`${input} font-mono`} placeholder="evidence hash / reference (min 6)" value={evHash} onChange={(e) => setEvHash(e.target.value)} />
          <textarea className={input} rows={2} placeholder="submission notes (min 5)" value={evNotes} onChange={(e) => setEvNotes(e.target.value)} />
          {!evInput.ok && (evUrl || evHash || evNotes) && <div className="text-rose-300">{evInput.reason}</div>}
          <Action label="Review submit_evidence transaction" check={evInput} blocked={blocked} onClick={submitEvidence} testid="act-evidence" />
        </div>
      )}

      {claim && (
        <div className="border border-slate-800 rounded-xl p-3 space-y-1 font-mono text-[11px]" data-testid="claim">
          <div className="font-sans font-semibold text-slate-200">Claim #{claim.claim_id} ({claim.claim_type})</div>
          <div>amount {toBig(claim.amount_wei).toString()} wei · beneficiary {shortenAddress(claim.beneficiary)}</div>
          <div>vault {claim.recipient_vault} · approved: {claimInfo?.vaultApproved === null ? 'unknown' : String(claimInfo?.vaultApproved)}</div>
          <div className={claim.status === 'DISPATCHED' ? 'text-amber-300' : 'text-white'} data-testid="claim-status">status: {claimDisplayStatus(claim)}</div>
          {claim.status === 'DISPATCHED' && <div className="font-sans text-amber-200/80">The contract emitted an asynchronous transfer. Recipient delivery is not proven by this record.</div>}
          <Action label="Withdraw claim" check={wdCheck} blocked={blocked} onClick={withdraw} testid="act-withdraw" />
        </div>
      )}
    </div>
  );
}

function Action({ label, check, blocked, onClick, testid }: { label: string; check: Check; blocked: boolean; onClick: () => void; testid: string }) {
  return (
    <button className={`${btn} ${check.ok ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`} disabled={!check.ok || blocked} onClick={onClick}
      title={check.ok ? (blocked ? 'Writes blocked (see notice)' : '') : check.reason} data-testid={testid}>
      {label}
      {!check.ok && <span className="block font-normal text-[10px] text-slate-500 max-w-[220px]">{check.reason}</span>}
    </button>
  );
}
