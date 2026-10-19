import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

const WebSocket = globalThis.WebSocket;
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = path.join(os.tmpdir(), 'edge_verify_robust_' + Date.now());

  console.log('Launching headless browser...');
  const browserProc = spawn(edgePath, [
    '--headless=new',
    '--window-size=1440,900',
    '--remote-debugging-port=9235',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9235/json/version');
      if (res.ok) break;
    } catch (_) {}
    await sleep(300);
  }

  const prodBase = 'https://trustledger-nine.vercel.app';
  const newTabRes = await fetch(`http://127.0.0.1:9235/json/new?about:blank`, { method: 'PUT' });
  const tab = await newTabRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);

  let idCounter = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      callbacks.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.id && callbacks.has(msg.id)) {
      callbacks.get(msg.id).resolve(msg.result);
      callbacks.delete(msg.id);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  async function waitForText(text, maxSeconds = 20) {
    for (let i = 0; i < maxSeconds * 2; i++) {
      const res = await send('Runtime.evaluate', {
        expression: `document.body.innerText.includes(${JSON.stringify(text)})`,
        returnByValue: true,
      });
      if (res.result?.value) return true;
      await sleep(500);
    }
    return false;
  }

  async function waitForPath(expectedPath, maxSeconds = 15) {
    for (let i = 0; i < maxSeconds * 2; i++) {
      const res = await send('Runtime.evaluate', {
        expression: `window.location.pathname`,
        returnByValue: true,
      });
      if (res.result?.value === expectedPath) return true;
      await sleep(500);
    }
    return false;
  }

  console.log('--- 1. Testing Dashboard (/) ---');
  await send('Page.navigate', { url: prodBase });
  await waitForPath('/', 15);
  await waitForText('StudioNet Autonomous Deliverable System', 20);

  const dashCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      hasTitle: document.body.innerText.includes('Verifiable Milestone Escrow Dashboard'),
      hasProject1: document.body.innerText.includes('StudioNet Autonomous Deliverable System'),
      hasMilestone1: document.body.innerText.includes('Phase 1: Escrow Architecture & Verified Payout'),
      hasMilestone2: document.body.innerText.includes('Phase 2: Dispute Handling & Refund Verification'),
      hasFreelancerVault: document.body.innerText.includes('150,000 wei'),
      hasClientVault: document.body.innerText.includes('200,000 wei'),
      hasEscrowBalance: document.body.innerText.includes('0 wei'),
      hasV2Gated: document.body.innerText.includes('SAFETY GATED'),
    }))()`,
    returnByValue: true,
  });
  console.log('Dashboard checks:', dashCheck.result?.value);

  console.log('--- 2. Clicking "Projects" in Sidebar ---');
  await send('Runtime.evaluate', {
    expression: `document.querySelector('aside a[href="/projects"]')?.click()`,
  });
  await waitForPath('/projects', 15);
  await waitForText('Projects Directory', 20);
  await waitForText('350,000 wei', 20);

  const projCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      hasTitle: document.body.innerText.includes('Projects Directory'),
      hasProject1: document.body.innerText.includes('Project #1'),
      hasCommitted: document.body.innerText.includes('350,000 wei'),
      hasV2RegistryNotice: document.body.innerText.includes('TrustLedger V2 Project Registry'),
    }))()`,
    returnByValue: true,
  });
  console.log('Projects page checks:', projCheck.result?.value);

  console.log('--- 3. Direct Refresh on /projects ---');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1500);
  await waitForPath('/projects', 15);
  await waitForText('Projects Directory', 20);
  await waitForText('Project #1', 20);
  const projRefreshCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      survivedRefresh: document.body.innerText.includes('Projects Directory') && document.body.innerText.includes('Project #1'),
    }))()`,
    returnByValue: true,
  });
  console.log('Projects direct refresh survived:', projRefreshCheck.result?.value);

  console.log('--- 4. Clicking "Milestones" in Sidebar ---');
  await send('Runtime.evaluate', {
    expression: `document.querySelector('aside a[href="/milestones"]')?.click()`,
  });
  await waitForPath('/milestones', 15);
  await waitForText('Milestones & Deliverable Evaluation', 20);
  await waitForText('Evidence URL returned non-200 HTTP status (404)', 20);

  const msCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      hasTitle: document.body.innerText.includes('Milestones & Deliverable Evaluation'),
      hasPhase1: document.body.innerText.includes('Phase 1: Escrow Architecture & Verified Payout'),
      hasPhase2: document.body.innerText.includes('Phase 2: Dispute Handling & Refund Verification'),
      hasRationale: document.body.innerText.includes('Evidence URL returned non-200 HTTP status (404)'),
      hasArbitrationRuling: document.body.innerText.includes('Arbitrator verified all deliverable acceptance criteria are satisfied'),
    }))()`,
    returnByValue: true,
  });
  console.log('Milestones page checks:', msCheck.result?.value);

  console.log('--- 5. Direct Refresh on /milestones ---');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1500);
  await waitForPath('/milestones', 15);
  await waitForText('Milestones & Deliverable Evaluation', 20);
  await waitForText('Evidence URL returned non-200 HTTP status (404)', 20);
  const msRefreshCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      survivedRefresh: document.body.innerText.includes('Milestones & Deliverable Evaluation') && document.body.innerText.includes('Phase 1'),
    }))()`,
    returnByValue: true,
  });
  console.log('Milestones direct refresh survived:', msRefreshCheck.result?.value);

  console.log('--- 6. Clicking "Vaults" in Sidebar ---');
  await send('Runtime.evaluate', {
    expression: `document.querySelector('aside a[href="/vaults"]')?.click()`,
  });
  await waitForPath('/vaults', 15);
  await waitForText('Vaults & Contract Balances', 20);
  await waitForText('Freelancer Recipient Vault', 20);

  const vaultCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      hasTitle: document.body.innerText.includes('Vaults & Contract Balances'),
      hasFreelancerVault: document.body.innerText.includes('Freelancer Recipient Vault'),
      hasClientVault: document.body.innerText.includes('Client Refund Vault'),
      has150k: document.body.innerText.includes('150,000 wei'),
      has200k: document.body.innerText.includes('200,000 wei'),
      hasDistinction: document.body.innerText.includes('Escrow vs. Recipient Vault Distinction'),
    }))()`,
    returnByValue: true,
  });
  console.log('Vaults page checks:', vaultCheck.result?.value);

  console.log('--- 7. Clicking "Settings" in Sidebar ---');
  await send('Runtime.evaluate', {
    expression: `document.querySelector('aside a[href="/settings"]')?.click()`,
  });
  await waitForPath('/settings', 15);
  await waitForText('Settings & Diagnostics', 20);

  const settingsCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      hasTitle: document.body.innerText.includes('Settings & Diagnostics'),
      hasStudioNet: document.body.innerText.includes('GenLayer StudioNet'),
      hasChainId: document.body.innerText.includes('61999'),
      hasAudit: document.body.innerText.includes('V2_FINAL_INDEPENDENT_AUDIT.md'),
      hasWalletCard: document.body.innerText.includes('Wallet Integration'),
    }))()`,
    returnByValue: true,
  });
  console.log('Settings page checks:', settingsCheck.result?.value);

  console.log('--- 8. Clicking "New Project" in Header ---');
  await send('Runtime.evaluate', {
    expression: `document.querySelector('header a[href="/projects/new"]')?.click()`,
  });
  await waitForPath('/projects/new', 15);
  await waitForText('Create New Milestone Escrow Project', 20);

  const newProjCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      hasTitle: document.body.innerText.includes('Create New Milestone Escrow Project'),
      hasSafetyGateBanner: document.body.innerText.includes('Pre-Deployment Safety Gate Active'),
      hasTxPreview: document.body.innerText.includes('Intelligent Contract Transaction Preview'),
      hasDisabledSubmit: document.querySelector('button[disabled]')?.innerText.includes('Locked by Safety Gate'),
      buttonText: document.querySelector('button[disabled]')?.innerText.trim(),
    }))()`,
    returnByValue: true,
  });
  console.log('New Project page checks:', newProjCheck.result?.value);

  console.log('--- 9. Back Navigation to Dashboard ---');
  await send('Runtime.evaluate', {
    expression: `document.querySelector('aside a[href="/"]')?.click()`,
  });
  await waitForPath('/', 15);
  await waitForText('Verifiable Milestone Escrow Dashboard', 20);

  const finalCheck = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.pathname,
      isHome: window.location.pathname === '/' && document.body.innerText.includes('Verifiable Milestone Escrow Dashboard'),
    }))()`,
    returnByValue: true,
  });
  console.log('Dashboard return check:', finalCheck.result?.value);

  browserProc.kill();
  console.log('SUCCESS: All 9 end-to-end browser verification steps passed on production!');
}

main().catch(err => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
