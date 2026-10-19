'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet, shortenAddress } from '@/lib/wallet';
import { STUDIONET_CONFIG, RUN_2_CONTRACTS } from '@/lib/genlayer';
import {
  Shield,
  LayoutDashboard,
  Folder,
  Layers,
  Landmark,
  Settings,
  Plus,
  Menu,
  X,
  Copy,
  Check,
  AlertTriangle,
  Wallet,
  Lock,
  ExternalLink,
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: Folder },
  { name: 'Milestones', href: '/milestones', icon: Layers },
  { name: 'Vaults', href: '/vaults', icon: Landmark },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wallet = useWallet();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard';
    if (pathname === '/projects') return 'Projects';
    if (pathname === '/projects/new') return 'New Project';
    if (pathname.startsWith('/projects/')) return 'Project Details';
    if (pathname === '/milestones') return 'Milestones';
    if (pathname === '/vaults') return 'Recipient Vaults';
    if (pathname === '/settings') return 'Settings & Diagnostics';
    return 'TrustLedger';
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col md:flex-row font-sans selection:bg-blue-600 selection:text-white">
      {/* Toast Feedback */}
      {copiedText && (
        <div className="fixed top-5 right-5 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <span>Copied {copiedText} to clipboard!</span>
        </div>
      )}

      {/* Desktop Left Sidebar */}
      <aside className="w-64 shrink-0 bg-[#090e1c] border-r border-slate-800/80 p-5 hidden md:flex flex-col justify-between sticky top-0 h-screen">
        <div className="space-y-8">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/30 group-hover:scale-105 transition-transform">
              <Shield className="w-6 h-6 text-white font-bold" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-tight">TrustLedger</h1>
              <p className="text-[11px] text-slate-400">Verifiable Milestone Payments</p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="space-y-1.5 text-sm" aria-label="Main Navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* StudioNet Network Badge Box */}
        <div className="bg-[#0e1629] border border-slate-800 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>StudioNet</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">ID: 61999</span>
          </div>
          <div className="text-[11px] text-slate-400 border-t border-slate-800/60 pt-2 flex items-center justify-between">
            <span>Preserved Run 2</span>
            <button
              onClick={() => copyToClipboard(RUN_2_CONTRACTS.escrow, 'Run 2 Address')}
              className="font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
              title="Copy Preserved Run 2 Contract Address"
            >
              <span>{shortenAddress(RUN_2_CONTRACTS.escrow, 3)}</span>
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="md:hidden bg-[#090e1c] border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-600/30">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-base">TrustLedger</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/projects/new"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#090e1c] border-b border-slate-800 px-4 py-4 space-y-2 z-40">
          <nav className="space-y-1 text-sm">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>GenLayer StudioNet (61999)</span>
            </div>
            <Link
              href="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="text-blue-400 hover:underline"
            >
              Diagnostics
            </Link>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="bg-[#090e1c]/80 backdrop-blur border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 py-3.5 hidden md:flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white tracking-tight">{getPageTitle()}</h2>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>StudioNet Live</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* New Project Action */}
            <Link
              href="/projects/new"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </Link>

            {/* Wallet Controls */}
            {wallet.isConnected ? (
              <div className="flex items-center gap-2 bg-[#0e1629] border border-slate-800 rounded-xl px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-mono text-slate-200">
                  {shortenAddress(wallet.address, 4)}
                </span>
                <button
                  onClick={() => copyToClipboard(wallet.address || '', 'Wallet Address')}
                  className="text-slate-400 hover:text-white p-1"
                  title="Copy Wallet Address"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={wallet.disconnectWallet}
                  className="text-[11px] text-rose-400 hover:text-rose-300 ml-1 hover:underline"
                  title="Disconnect Wallet"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={wallet.connectWallet}
                disabled={wallet.isConnecting}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium border border-slate-700 transition disabled:opacity-50"
              >
                <Wallet className="w-3.5 h-3.5 text-blue-400" />
                <span>{wallet.isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
              </button>
            )}

            {/* Network Warning if wrong network */}
            {wallet.isConnected && wallet.isWrongNetwork && (
              <button
                onClick={wallet.switchToStudioNet}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Switch to StudioNet</span>
              </button>
            )}
          </div>
        </header>

        {/* Route Page Container */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">{children}</main>
      </div>
    </div>
  );
}
