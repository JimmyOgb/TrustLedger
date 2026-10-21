'use client';
/**
 * Browser bindings for TrustLedger V2 writes.
 *
 * Signing: genlayer-js 1.1.8 with `account` set to the connected ADDRESS (not a
 * key). The SDK then routes `eth_sendTransaction` to the injected EIP-1193
 * provider (MetaMask etc.), which shows the signature prompt. No private keys
 * exist anywhere in browser code. Reads go through the same-origin /api/rpc proxy.
 */
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import {
  V2_DEPLOYMENT_CONFIG,
  isV2Deployed,
  callRpc,
  getOnChainBalance,
  readContractState,
} from './genlayer';
import {
  runTransaction,
  type TxDeps,
  type TxSpec,
  type TxUpdate,
  type ProjectView,
  type MilestoneView,
  type ClaimView,
} from './escrow-core';

/** V2 address for READS (always available). Writes additionally require the gate. */
export const V2_ADDRESS: string | null = V2_DEPLOYMENT_CONFIG.escrowV2Address;

export function writeGateOpen(): boolean {
  return isV2Deployed();
}

function proxiedChain() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    ...studionet,
    rpcUrls: { default: { http: [origin ? origin + '/api/rpc' : 'https://studio.genlayer.com/api'] } },
  };
}

function provider(): any {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No injected wallet provider found.');
  }
  return (window as any).ethereum;
}

function writeClient(account: string) {
  return createClient({ chain: proxiedChain() as any, account: account as `0x${string}`, provider: provider() } as any);
}

function readClient() {
  return createClient({ chain: proxiedChain() as any });
}

// --------------------------------------------------------------------------
// V2 reads (contract is authoritative; errors propagate, never replaced by mock data)
// --------------------------------------------------------------------------
function requireV2(): string {
  if (!V2_ADDRESS) throw new Error('V2 contract address is not configured.');
  return V2_ADDRESS;
}

const isMissing = (e: any) => /does not exist|No claim exists/i.test(String(e?.message || e));

export async function v2Read<T>(functionName: string, args: any[] = []): Promise<T> {
  return readContractState<T>({ address: requireV2(), functionName, args });
}
export const v2ListProjects = () => v2Read<ProjectView[]>('list_projects');
export const v2GetProject = (id: number) => v2Read<ProjectView & Record<string, any>>('get_project', [id]);
export const v2ListMilestones = (pid: number) => v2Read<(MilestoneView & Record<string, any>)[]>('list_milestones', [pid]);
export const v2GetMilestone = (id: number) => v2Read<MilestoneView & Record<string, any>>('get_milestone', [id]);
export const v2Summary = () => v2Read<Record<string, number>>('get_escrow_summary');
export const v2Deployer = () => v2Read<string>('get_deployer');
export const v2IsVaultApproved = (addr: string) => v2Read<boolean>('is_vault_approved', [addr]);
export async function v2GetClaimByMilestone(mid: number): Promise<ClaimView | null> {
  try { return await v2Read<ClaimView>('get_claim_by_milestone', [mid]); } catch (e) { if (isMissing(e)) return null; throw e; }
}
export async function v2GetProjectOrNull(id: number) {
  try { return await v2GetProject(id); } catch (e) { if (isMissing(e)) return null; throw e; }
}

// --------------------------------------------------------------------------
// Transaction execution
// --------------------------------------------------------------------------
export function browserTxDeps(): TxDeps {
  return {
    gateOpen: writeGateOpen,
    getWalletChainId: async () => parseInt(await provider().request({ method: 'eth_chainId' }), 16),
    getWalletAccount: async () => {
      const accts: string[] = await provider().request({ method: 'eth_accounts' });
      return accts?.[0] ?? null;
    },
    getBalance: (a) => getOnChainBalance(a),
    send: async (spec: TxSpec) => {
      const c = writeClient(spec.caller);
      return (await c.writeContract({
        address: spec.contract as `0x${string}`,
        functionName: spec.method,
        args: spec.args as any[],
        value: spec.valueWei,
      })) as string;
    },
    getReceipt: async (hash) => {
      const c = readClient();
      return await c.getTransaction({ hash: hash as any });
    },
    pollIntervalMs: 3000,
    timeoutMs: 6 * 60_000,
  };
}

export function executeV2(spec: TxSpec, onUpdate: (u: TxUpdate) => void) {
  return runTransaction(spec, browserTxDeps(), onUpdate);
}

export async function fetchGasPriceWei(): Promise<bigint> {
  return BigInt((await callRpc('eth_gasPrice')) || '0x0');
}
