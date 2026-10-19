'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet, shortenAddress } from '@/lib/wallet';
import {
  STUDIONET_CONFIG,
  RUN_2_CONTRACTS,
  CONTRACT_ADDRESSES,
  checkRpcHealth,
} from '@/lib/genlayer';
import {
  Settings,
  Share2,
  Wallet,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  FileText,
  Activity,
} from 'lucide-react';

export default function SettingsPage() {
  const wallet = useWallet();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [rpcStatus, setRpcStatus] = useState<{
    ok: boolean;
    latencyMs: number;
    chainIdHex?: string;
    error?: string;
  } | null>(null);
  const [testingRpc, setTestingRpc] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const runRpcDiagnostic = useCallback(async () => {
    setTestingRpc(true);
    try {
      const res = await checkRpcHealth();
      setRpcStatus(res);
    } catch (e: any) {
      setRpcStatus({
        ok: false,
        latencyMs: 0,
        error: e?.message || 'Failed to ping RPC',
      });
    } finally {
      setTestingRpc(false);
    }
  }, []);

  useEffect(() => {
    runRpcDiagnostic();
  }, [runRpcDiagnostic]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Toast Feedback */}
      {copiedText && (
        <div className="fixed top-5 right-5 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <span>Copied {copiedText} to clipboard!</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
              System Configuration
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Network Active
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
            Settings & Diagnostics
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Network connectivity diagnostics, Web3 wallet integration, and authoritative deployment telemetry.
          </p>
        </div>

        <button
          onClick={runRpcDiagnostic}
          disabled={testingRpc}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${testingRpc ? 'animate-spin text-blue-400' : ''}`} />
          <span>{testingRpc ? 'Testing...' : 'Run RPC Diagnostics'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Network & RPC Status Card */}
        <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Share2 className="w-4 h-4 text-blue-400" />
              <span>StudioNet Network Specifications</span>
            </div>
            {rpcStatus && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                  rpcStatus.ok
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {rpcStatus.ok ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>RPC Online ({rpcStatus.latencyMs}ms)</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>RPC Unreachable</span>
                  </>
                )}
              </span>
            )}
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-slate-800/60">
              <span className="text-slate-400">Network Name</span>
              <span className="font-semibold text-white">{STUDIONET_CONFIG.name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800/60">
              <span className="text-slate-400">Chain ID</span>
              <span className="font-mono font-medium text-white">
                {STUDIONET_CONFIG.id} (0x{STUDIONET_CONFIG.id.toString(16)})
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800/60">
              <span className="text-slate-400">Currency</span>
              <span className="font-semibold text-emerald-400">
                {STUDIONET_CONFIG.nativeCurrency.name} ({STUDIONET_CONFIG.nativeCurrency.decimals} decimals)
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800/60">
              <span className="text-slate-400">Consensus Contract</span>
              <button
                onClick={() => copyToClipboard(STUDIONET_CONFIG.consensusMainAddress, 'Consensus Address')}
                className="font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px]"
              >
                <span>{shortenAddress(STUDIONET_CONFIG.consensusMainAddress, 4)}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">RPC Endpoint</span>
              <button
                onClick={() => copyToClipboard(STUDIONET_CONFIG.rpcUrl, 'RPC URL')}
                className="font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px]"
              >
                <span>{STUDIONET_CONFIG.rpcUrl}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Web3 Wallet Card */}
        <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Wallet className="w-4 h-4 text-blue-400" />
              <span>Wallet Integration</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                wallet.isConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {wallet.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {wallet.isConnected ? (
              <>
                <div className="space-y-1">
                  <span className="text-slate-400">Connected Public Address</span>
                  <div className="flex items-center justify-between bg-[#0e1629] p-2.5 rounded-xl border border-slate-800">
                    <span className="font-mono text-white text-xs truncate max-w-[280px]">
                      {wallet.address}
                    </span>
                    <button
                      onClick={() => copyToClipboard(wallet.address || '', 'Wallet Address')}
                      className="text-slate-400 hover:text-white p-1"
                      title="Copy Address"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">Wallet Network Chain ID</span>
                  <span className="font-mono font-medium text-white">
                    {wallet.chainId ? `${wallet.chainId} (0x${wallet.chainId.toString(16)})` : '---'}
                  </span>
                </div>

                {wallet.isWrongNetwork && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start justify-between gap-3 text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block">Wrong Network Detected</span>
                        <p className="text-[11px] text-amber-300/80">
                          Wallet is connected to chain {wallet.chainId}. StudioNet requires chain ID 61999.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={wallet.switchToStudioNet}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold text-[11px] border border-amber-500/40 shrink-0"
                    >
                      Switch Network
                    </button>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={wallet.disconnectWallet}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-slate-700 hover:border-rose-500/40 transition"
                  >
                    Disconnect Wallet
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3 py-2">
                <p className="text-slate-400 leading-relaxed text-xs">
                  Read-only navigation and on-chain state inspection function without a connected wallet. Connecting a wallet is only required for signing future transactions.
                </p>

                {wallet.error && (
                  <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl text-rose-300 text-xs">
                    {wallet.error}
                  </div>
                )}

                <button
                  onClick={wallet.connectWallet}
                  disabled={wallet.isConnecting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition disabled:opacity-50"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>{wallet.isConnecting ? 'Connecting...' : 'Connect Web3 Wallet'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Deployment & Safety Architecture */}
      <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>On-Chain Deployment Registry & Security Clearance</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#0e1629] p-3.5 rounded-xl border border-slate-800/60 space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Run 2 Escrow</span>
            <div className="font-mono text-blue-400 truncate">{RUN_2_CONTRACTS.escrow}</div>
            <span className="text-[10px] text-emerald-400 block">● Preserved (Project #1)</span>
          </div>

          <div className="bg-[#0e1629] p-3.5 rounded-xl border border-slate-800/60 space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Freelancer Vault</span>
            <div className="font-mono text-emerald-400 truncate">{CONTRACT_ADDRESSES.freelancerVault}</div>
            <span className="text-[10px] text-slate-400 block">Settled (150,000 wei)</span>
          </div>

          <div className="bg-[#0e1629] p-3.5 rounded-xl border border-slate-800/60 space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Client Refund Vault</span>
            <div className="font-mono text-indigo-400 truncate">{CONTRACT_ADDRESSES.clientRefundVault}</div>
            <span className="text-[10px] text-slate-400 block">Settled (200,000 wei)</span>
          </div>

          <div className="bg-[#0e1629] p-3.5 rounded-xl border border-slate-800/60 space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">V2 Escrow Address</span>
            <div className="font-mono text-amber-300 truncate">0x4Ec472F1fEc41cB89Fd11DfD788679786E874336</div>
            <span className="text-[10px] text-amber-400 block">● Safety Gate Active</span>
          </div>
        </div>

        <div className="bg-[#0e1629] border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Pre-Deployment Safety Gate Status & Audit Assurance</span>
          </div>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Security Audit: <code className="text-slate-300">V2_FINAL_INDEPENDENT_AUDIT.md</code> — Verdict: <strong>READY WITH EXPLICIT LIMITATIONS</strong>.
            The environment variable <code className="text-slate-300 font-mono">NEXT_PUBLIC_V2_DEPLOYED=false</code> is intentionally maintained until operator authorization.
            Zero private keys or sensitive credentials are ever held or accessed by this frontend.
          </p>
        </div>
      </div>
    </div>
  );
}
