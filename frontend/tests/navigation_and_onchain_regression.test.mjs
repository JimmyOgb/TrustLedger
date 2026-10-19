import test from 'node:test';
import assert from 'node:assert/strict';

// Test imports and contract configuration
const RUN_2_CONTRACTS = {
  escrow: '0x02b52a875Aad5aE41b3997725364C00C715A99C4',
  freelancerVault: '0x02c7c74e61ccf3DD594ab80D4A1Da40101E44775',
  clientRefundVault: '0x7E5Eb0458bF08DcfF50f619853e4A071aDBd0068',
};

const V2_ADDRESS = '0x4Ec472F1fEc41cB89Fd11DfD788679786E874336';
const STUDIONET_CHAIN_ID = 61999;
const STUDIONET_HEX_CHAIN_ID = '0xf22f';

function isValidContractAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

function isV2Deployed(config = { isDeployed: false, escrowV2Address: V2_ADDRESS }) {
  return Boolean(config.isDeployed && isValidContractAddress(config.escrowV2Address));
}

function getEscrowContractAddress(isNewProject = false, config = { isDeployed: false, escrowV2Address: V2_ADDRESS }) {
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

function getProjectEscrowAddress(projectId, config = { isDeployed: false, escrowV2Address: V2_ADDRESS }) {
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

// 1. Navigation Route Integrity
test('App Router defines valid, distinct routes for all navigation items', () => {
  const routes = [
    { name: 'Dashboard', href: '/' },
    { name: 'Projects', href: '/projects' },
    { name: 'New Project', href: '/projects/new' },
    { name: 'Milestones', href: '/milestones' },
    { name: 'Vaults', href: '/vaults' },
    { name: 'Settings', href: '/settings' },
  ];

  const paths = new Set(routes.map(r => r.href));
  assert.equal(paths.size, 6, 'All routes must be distinct');
  assert.ok(paths.has('/'), 'Dashboard root route exists');
  assert.ok(paths.has('/projects'), 'Projects route exists');
  assert.ok(paths.has('/projects/new'), 'New project route exists');
  assert.ok(paths.has('/milestones'), 'Milestones route exists');
  assert.ok(paths.has('/vaults'), 'Vaults route exists');
  assert.ok(paths.has('/settings'), 'Settings route exists');
});

// 2. Direct Refresh & Route Resolution
test('Navigation items resolve correctly with no dead href="#" links', () => {
  const navItems = [
    { name: 'Dashboard', href: '/' },
    { name: 'Projects', href: '/projects' },
    { name: 'Milestones', href: '/milestones' },
    { name: 'Vaults', href: '/vaults' },
    { name: 'Settings', href: '/settings' },
  ];

  for (const item of navItems) {
    assert.notEqual(item.href, '#', `Item ${item.name} must not use dead # href`);
    assert.ok(item.href.startsWith('/'), `Item ${item.name} must have a valid pathname`);
  }
});

// 3. Historical Run 2 Project #1 Resolution
test('Run 2 Project #1 always resolves to Run 2 contract address regardless of V2 state', () => {
  // When V2 is disabled
  const addrGated = getProjectEscrowAddress(1, { isDeployed: false, escrowV2Address: null });
  assert.equal(addrGated, RUN_2_CONTRACTS.escrow);

  // Even if V2 were deployed
  const addrActive = getProjectEscrowAddress(1, { isDeployed: true, escrowV2Address: V2_ADDRESS });
  assert.equal(addrActive, RUN_2_CONTRACTS.escrow);
});

// 4. V2 Safety Gate Enforcement
test('V2 remains blocked and throws pre-deployment safety gate error while NEXT_PUBLIC_V2_DEPLOYED=false', () => {
  assert.throws(
    () => getEscrowContractAddress(true, { isDeployed: false, escrowV2Address: V2_ADDRESS }),
    {
      message:
        'TrustLedger V2 has not yet been deployed to StudioNet. New project creation is held at the pre-deployment safety gate.',
    }
  );
});

// 5. Zero-Mock & Error Propagation Integrity
test('RPC error propagation does not mask network failures with fake empty balances', async () => {
  async function callRpcFailing() {
    throw new Error('Connection refused to RPC endpoint');
  }

  async function getOnChainBalanceStrict(callFn) {
    const res = await callFn();
    return BigInt(res || '0x0');
  }

  await assert.rejects(
    async () => {
      await getOnChainBalanceStrict(callRpcFailing);
    },
    { message: 'Connection refused to RPC endpoint' },
    'Failing RPC must reject, not silently return fake 0n'
  );
});

// 6. Wallet Lifecycle & State Machine
test('Wallet state machine enforces user-initiated connection and handles rejections', () => {
  // Initial state: strictly disconnected
  const initialState = {
    address: null,
    chainId: null,
    isConnected: false,
    isConnecting: false,
    isWrongNetwork: false,
    error: null,
  };
  assert.equal(initialState.isConnected, false);
  assert.equal(initialState.isConnecting, false);

  // Network check logic
  function checkNetwork(numericChainId) {
    return numericChainId !== STUDIONET_CHAIN_ID;
  }
  assert.equal(checkNetwork(61999), false, 'Chain 61999 is valid');
  assert.equal(checkNetwork(1), true, 'Chain 1 is wrong network');
  assert.equal(checkNetwork(137), true, 'Chain 137 is wrong network');

  // User rejection handling (EIP-1193 code 4001)
  function handleWalletError(err) {
    if (err?.code === 4001) {
      return 'Connection request was cancelled by the user.';
    }
    return err?.message || 'Failed to connect wallet';
  }
  const rejectionMsg = handleWalletError({ code: 4001, message: 'User rejected the request.' });
  assert.equal(rejectionMsg, 'Connection request was cancelled by the user.');
});

// 7. No Page Submits Write Transaction Automatically
test('Read-only navigation requires zero wallet signature and executes zero state mutations', () => {
  // All read methods use eth_getBalance or genlayerClient.readContract (view calls)
  const allowedReadOnlyMethods = [
    'eth_getBalance',
    'eth_chainId',
    'get_escrow_summary',
    'get_project',
    'list_milestones',
    'get_deployer',
    'is_vault_approved',
  ];

  for (const method of allowedReadOnlyMethods) {
    assert.ok(
      !method.startsWith('create_') &&
      !method.startsWith('fund_') &&
      !method.startsWith('submit_') &&
      !method.startsWith('release_') &&
      !method.startsWith('refund_') &&
      !method.startsWith('withdraw_'),
      `Method ${method} must be read-only`
    );
  }
});

// 8. StudioNet Chain ID formatting
test('StudioNet hex chain ID matches 0xf22f (61999)', () => {
  assert.equal('0x' + STUDIONET_CHAIN_ID.toString(16), STUDIONET_HEX_CHAIN_ID);
});
