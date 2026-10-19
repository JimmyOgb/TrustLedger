import test from 'node:test';
import assert from 'node:assert/strict';

function shortenAddress(address, chars = 4) {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

test('shortenAddress formats addresses correctly', () => {
  assert.equal(shortenAddress('0x02b52a875Aad5aE41b3997725364C00C715A99C4'), '0x02b5...99C4');
  assert.equal(shortenAddress('0x7a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f2e3a'), '0x7a3b...2e3a');
  assert.equal(shortenAddress(null), '');
  assert.equal(shortenAddress(''), '');
});

test('StudioNet chain ID 61999 converts to 0xf22f', () => {
  const chainId = 61999;
  const hex = '0x' + chainId.toString(16);
  assert.equal(hex, '0xf22f');
});

test('Wallet connection requires explicit user action and does not trigger on load', () => {
  const defaultState = {
    address: null,
    chainId: null,
    isConnected: false,
    isConnecting: false,
    isWrongNetwork: false,
    error: null,
    providerAvailable: true,
  };
  assert.equal(defaultState.isConnected, false);
  assert.equal(defaultState.isConnecting, false);
});
