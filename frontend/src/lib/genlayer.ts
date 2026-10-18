export const STUDIONET_CONFIG = {
  id: 61999,
  name: 'GenLayer StudioNet',
  rpcUrl: 'https://studio.genlayer.com/api',
  nativeCurrency: {
    name: 'GEN',
    symbol: 'GEN',
    decimals: 18,
  },
  consensusMainAddress: '0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575',
};

// Authoritative preserved Run 2 deployment on StudioNet
export const RUN_2_CONTRACTS = {
  escrow: '0x02b52a875Aad5aE41b3997725364C00C715A99C4',
  freelancerVault: '0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775',
  clientRefundVault: '0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068',
};

export interface DeploymentConfig {
  isDeployed: boolean;
  escrowV2Address: string | null;
}

// Validate 42-char hex address format (0x + 40 hex chars)
export function isValidContractAddress(address: string | null | undefined): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

// V2 Remediation Deployment Configuration
// Note: V2 is not yet deployed to live testnet. Any deployment must be explicitly authorized.
const envV2Address = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_V2_ESCROW_CONTRACT_ADDRESS
  ? process.env.NEXT_PUBLIC_V2_ESCROW_CONTRACT_ADDRESS.trim()
  : null;
const envV2Deployed = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_V2_DEPLOYED === 'true';

export const V2_DEPLOYMENT_CONFIG: DeploymentConfig = {
  isDeployed: Boolean(envV2Deployed && isValidContractAddress(envV2Address)),
  escrowV2Address: isValidContractAddress(envV2Address) ? envV2Address : null,
};

export function isV2Deployed(config: DeploymentConfig = V2_DEPLOYMENT_CONFIG): boolean {
  return Boolean(config.isDeployed && isValidContractAddress(config.escrowV2Address));
}

// Active contract addresses (Defaulting to preserved Run 2 historical deployment)
export const CONTRACT_ADDRESSES = {
  escrow: RUN_2_CONTRACTS.escrow,
  historicalEscrow: RUN_2_CONTRACTS.escrow,
  freelancerVault: RUN_2_CONTRACTS.freelancerVault,
  clientRefundVault: RUN_2_CONTRACTS.clientRefundVault,
};

/**
 * Returns the authoritative contract address for project operations.
 * Historical projects (e.g., Run 2) always route to the preserved Run 2 contract.
 * New projects require an explicitly authorized V2 deployment.
 */
export function getEscrowContractAddress(
  isNewProject: boolean = false,
  config: DeploymentConfig = V2_DEPLOYMENT_CONFIG
): string {
  if (isNewProject) {
    if (!isV2Deployed(config)) {
      // Do not silently direct new projects to an invalid or placeholder contract
      throw new Error(
        'TrustLedger V2 has not yet been deployed to StudioNet. New project creation is held at the pre-deployment safety gate.'
      );
    }
    return config.escrowV2Address!;
  }
  return RUN_2_CONTRACTS.escrow;
}

/**
 * Returns the contract address for specific project lookups.
 * Project #1 is the canonical historical Run 2 project on StudioNet.
 * All subsequent projects require an authorized V2 deployment.
 */
export function getProjectEscrowAddress(
  projectId: number,
  config: DeploymentConfig = V2_DEPLOYMENT_CONFIG
): string {
  if (projectId === 1) {
    return RUN_2_CONTRACTS.escrow;
  }
  if (!isV2Deployed(config)) {
    throw new Error(
      `Project #${projectId} requires TrustLedger V2, which is not yet deployed or configured.`
    );
  }
  return config.escrowV2Address!;
}

/**
 * Version-aware resolver for dashboard views.
 * Allows toggling between historical Run 2 inspection and V2 active inspection.
 */
export function getDashboardEscrowAddress(
  targetVersion: 'historical' | 'v2' = 'historical',
  config: DeploymentConfig = V2_DEPLOYMENT_CONFIG
): string {
  if (targetVersion === 'v2') {
    if (!isV2Deployed(config)) {
      throw new Error(
        'TrustLedger V2 is not yet deployed or configured on StudioNet. Dashboard cannot switch to unconfigured V2 instance.'
      );
    }
    return config.escrowV2Address!;
  }
  return RUN_2_CONTRACTS.escrow;
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
  weight: number;
  mandatory: boolean;
}

export interface Claim {
  claim_id: number;
  project_id: number;
  milestone_id: number;
  claim_type: 'PAYOUT' | 'REFUND';
  beneficiary: string;
  recipient_vault: string;
  amount_wei: number;
  status: 'CLAIMABLE' | 'DISPATCHED';
  dispatched_count: number;
}

export interface Milestone {
  milestone_id: number;
  project_id: number;
  milestone_index: number;
  title: string;
  description: string;
  acceptance_criteria_json: string;
  freelancer: string;
  recipient: string;
  amount_wei: number;
  funded_wei: number;
  released_wei: number;
  refunded_wei: number;
  available_escrow_wei: number;
  status:
    | 'CREATED'
    | 'FUNDED'
    | 'EVIDENCE_SUBMITTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'INCONCLUSIVE'
    | 'DISPUTED'
    | 'RESOLVED_RELEASE'
    | 'RESOLVED_REFUND'
    | 'RELEASED'
    | 'REFUNDED';
  submission_version: number;
  evidence_url: string;
  evidence_hash: string;
  submission_notes: string;
  evaluated_version: number;
  evaluated_evidence_hash: string;
  verdict: 'NONE' | 'APPROVED' | 'REJECTED' | 'INCONCLUSIVE';
  score: number;
  mandatory_met: boolean;
  met_criteria_json: string;
  evaluation_rationale: string;
  dispute_reason: string;
  dispute_raised_by: string;
  resolution_notes: string;
  settlement_count: number;
}

export interface Project {
  project_id: number;
  client: string;
  refund_recipient: string;
  arbitrator: string;
  title: string;
  description: string;
  total_committed_wei: number;
  total_funded_wei: number;
  total_released_wei: number;
  total_refunded_wei: number;
  available_escrow_wei: number;
  milestone_count: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

export interface EscrowSummary {
  contract_balance_wei: number;
  total_escrow_locked_wei: number;
  total_escrow_claimable_wei: number;
  total_escrow_dispatched_wei: number;
  total_escrow_funded_wei: number;
  total_escrow_released_wei: number;
  total_escrow_refunded_wei: number;
  project_count: number;
  milestone_count: number;
  claim_count?: number;
}

export async function callRpc(method: string, params: any[] = []): Promise<any> {
  const res = await fetch(STUDIONET_CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data.result;
}

export async function getOnChainBalance(address: string): Promise<bigint> {
  try {
    const hexBal = await callRpc('eth_getBalance', [address, 'latest']);
    return BigInt(hexBal || '0x0');
  } catch (err) {
    console.error('Failed to get on-chain balance:', err);
    return 0n;
  }
}

export function formatWeiToGen(wei: number | bigint | string): string {
  const b = BigInt(wei || 0);
  const whole = b / 1000000000000000000n;
  const remainder = b % 1000000000000000000n;
  if (remainder === 0n) return `${whole} GEN`;
  const decimals = remainder.toString().padStart(18, '0').slice(0, 6);
  return `${whole}.${decimals} GEN`;
}

export function formatWeiRaw(wei: number | bigint | string): string {
  const n = BigInt(wei || 0);
  return `${n.toLocaleString()} wei`;
}
