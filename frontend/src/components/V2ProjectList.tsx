'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { shortenAddress } from '@/lib/wallet';
import { formatWeiToGen } from '@/lib/genlayer';
import { V2_ADDRESS, v2ListProjects, writeGateOpen } from '@/lib/escrow';
import type { ProjectView } from '@/lib/escrow-core';
import { Plus, RefreshCw } from 'lucide-react';

/** Live V2 project registry read from list_projects. No fallback data. */
export function V2ProjectList() {
  const [projects, setProjects] = useState<(ProjectView & Record<string, any>)[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setProjects(await v2ListProjects()); setError(null); }
    catch (e: any) { setError(e?.message || String(e)); setProjects(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-3 text-xs" data-testid="v2-registry">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">TrustLedger V2 projects</div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${writeGateOpen() ? 'text-emerald-300 border-emerald-500/30' : 'text-amber-300 border-amber-500/30'}`}>
            writes {writeGateOpen() ? 'ENABLED (preview)' : 'GATED'}
          </span>
          <button onClick={load} aria-label="refresh"><RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      <div className="font-mono text-[11px] text-slate-500 break-all">contract {V2_ADDRESS ?? 'unconfigured'}, read live via list_projects</div>
      {error && <div className="text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">RPC/contract read failed: {error}</div>}
      {projects && projects.length === 0 && <div className="text-slate-400" data-testid="v2-empty">No projects exist on the V2 contract yet.</div>}
      {projects && projects.length > 0 && (
        <ul className="divide-y divide-slate-800">
          {projects.map((p) => (
            <li key={p.project_id} className="py-2 flex items-center justify-between gap-2">
              <Link href={`/projects/v2/${p.project_id}`} className="text-blue-300 hover:underline">#{p.project_id} {p.title}</Link>
              <span className="font-mono text-[11px] text-slate-400">{p.status} · {p.milestone_count} ms · client {shortenAddress(p.client)} · funded {formatWeiToGen(p.total_funded_wei)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/projects/new" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700">
        <Plus className="w-3.5 h-3.5" /> New V2 project
      </Link>
    </div>
  );
}
