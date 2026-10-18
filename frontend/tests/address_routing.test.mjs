import test from 'node:test';
import assert from 'node:assert/strict';

// Test historical Run 2 addresses and V2 routing logic
const RUN_2_CONTRACTS = {
  escrow: '0x02b52a875Aad5aE41b3997725364C00C715A99C4',
  freelancerVault: '0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775',
  clientRefundVault: '0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068',
};

const V2_DEPLOYMENT_CONFIG = {
  isDeployed: false,
  escrowV2Address: null,
};

function isValidContractAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

function isV2Deployed(config = V2_DEPLOYMENT_CONFIG) {
  return Boolean(config.isDeployed && isValidContractAddress(config.escrowV2Address));
}

function getEscrowContractAddress(isNewProject = false, config = V2_DEPLOYMENT_CONFIG) {
  if (isNewProject) {
    if (!isV2Deployed(config)) {
      throw new Error(
        'TrustLedger V2 has not yet been deployed to StudioNet. New project creation is held at the pre-deployment safety gate.'
      );
    }
    return config.escrowV2Address;
  }
  return RUN_2_CONTRACTS.escrow;
}

function getProjectEscrowAddress(projectId, config = V2_DEPLOYMENT_CONFIG) {
  if (projectId === 1) {
    return RUN_2_CONTRACTS.escrow;
  }
  if (!isV2Deployed(config)) {
    throw new Error(
      `Project #${projectId} requires TrustLedger V2, which is not yet deployed or configured.`
    );
  }
  return config.escrowV2Address;
}

function getDashboardEscrowAddress(targetVersion = 'historical', config = V2_DEPLOYMENT_CONFIG) {
  if (targetVersion === 'v2') {
    if (!isV2Deployed(config)) {
      throw new Error(
        'TrustLedger V2 is not yet deployed or configured on StudioNet. Dashboard cannot switch to unconfigured V2 instance.'
      );
    }
    return config.escrowV2Address;
  }
  return RUN_2_CONTRACTS.escrow;
}

function formatWeiToGen(wei) {
  const b = BigInt(wei || 0);
  const whole = b / 1000000000000000000n;
  const remainder = b % 1000000000000000000n;
  if (remainder === 0n) return `${whole} GEN`;
  const decimals = remainder.toString().padStart(18, '0').slice(0, 6);
  return `${whole}.${decimals} GEN`;
}

function formatWeiRaw(wei) {
  const n = BigInt(wei || 0);
  return `${n.toLocaleString()} wei`;
}

// 1. Preserved Run 2 checks
test('Historical Run 2 addresses are preserved and immutable', () => {
  assert.equal(RUN_2_CONTRACTS.escrow, '0x02b52a875Aad5aE41b3997725364C00C715A99C4');
  assert.equal(RUN_2_CONTRACTS.freelancerVault, '0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775');
  assert.equal(RUN_2_CONTRACTS.clientRefundVault, '0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068');
});

// 2. Historical reads
test('Historical project reads (project #1) always route to Run 2 deployment', () => {
  const addr = getProjectEscrowAddress(1);
  assert.equal(addr, RUN_2_CONTRACTS.escrow);
});

test('Historical project reads (project #1) stay on Run 2 even when V2 is active', () => {
  const mockV2 = '0x1234567890123456789012345678901234567890';
  const addr = getProjectEscrowAddress(1, { isDeployed: true, escrowV2Address: mockV2 });
  assert.equal(addr, RUN_2_CONTRACTS.escrow);
});

// 3. Dashboard reads
test('Dashboard default read routes to preserved Run 2 contract', () => {
  const addr = getDashboardEscrowAddress('historical');
  assert.equal(addr, RUN_2_CONTRACTS.escrow);
});

test('Dashboard switching to V2 fails closed when V2 is unconfigured or not deployed', () => {
  assert.throws(
    () => getDashboardEscrowAddress('v2', { isDeployed: false, escrowV2Address: null }),
    { message: /TrustLedger V2 is not yet deployed or configured on StudioNet/ }
  );
});

test('Dashboard switching to V2 routes to V2 address when configured and deployed', () => {
  const validV2 = '0x1234567890123456789012345678901234567890';
  const addr = getDashboardEscrowAddress('v2', { isDeployed: true, escrowV2Address: validV2 });
  assert.equal(addr, validV2);
});

// 4. New project creation
test('New project creation is held at pre-deployment safety gate until authorized deployment', () => {
  assert.throws(
    () => getEscrowContractAddress(true, { isDeployed: false, escrowV2Address: null }),
    { message: /TrustLedger V2 has not yet been deployed to StudioNet/ }
  );
});

test('New project creation rejects invalid or malformed V2 address', () => {
  assert.throws(
    () => getEscrowContractAddress(true, { isDeployed: true, escrowV2Address: 'invalid_address' }),
    { message: /TrustLedger V2 has not yet been deployed to StudioNet/ }
  );
  assert.throws(
    () => getEscrowContractAddress(true, { isDeployed: true, escrowV2Address: '0x123' }),
    { message: /TrustLedger V2 has not yet been deployed to StudioNet/ }
  );
});

test('Authorized V2 deployment cleanly routes new projects when configured', () => {
  const mockV2 = '0x9999999999999999999999999999999999999999';
  const addr = getEscrowContractAddress(true, { isDeployed: true, escrowV2Address: mockV2 });
  assert.equal(addr, mockV2);
});

// 5. Project-specific reads for subsequent projects
test('Project #2+ requires V2 deployment and fails closed if missing', () => {
  assert.throws(
    () => getProjectEscrowAddress(2, { isDeployed: false, escrowV2Address: null }),
    { message: /Project #2 requires TrustLedger V2, which is not yet deployed or configured/ }
  );
});

test('Project #2 routes to V2 when V2 is active', () => {
  const validV2 = '0x1234567890123456789012345678901234567890';
  const addr = getProjectEscrowAddress(2, { isDeployed: true, escrowV2Address: validV2 });
  assert.equal(addr, validV2);
});

// 6. Formatting utilities
test('Currency formatting handles exact and fractional GEN correctly', () => {
  assert.equal(formatWeiToGen(1000000000000000000n), '1 GEN');
  assert.equal(formatWeiToGen(2500000000000000000n), '2.500000 GEN');
  assert.equal(formatWeiRaw(1500000), '1,500,000 wei');
});
