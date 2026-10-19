'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { STUDIONET_CONFIG } from './genlayer';

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  isWrongNetwork: boolean;
  error: string | null;
  providerAvailable: boolean;
}

export interface WalletContextType extends WalletState {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchToStudioNet: () => Promise<void>;
}

const STUDIONET_HEX_CHAIN_ID = '0xf22f'; // 61999

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    isConnected: false,
    isConnecting: false,
    isWrongNetwork: false,
    error: null,
    providerAvailable: true,
  });

  // Verify whether window.ethereum is present without triggering any popup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasProvider = Boolean((window as any).ethereum);
      setWallet((prev) => ({ ...prev, providerAvailable: hasProvider }));
    }
  }, []);

  // Sync chain ID and account if wallet is already connected or on account/chain change
  const handleAccountsChanged = useCallback((accounts: string[]) => {
    if (!accounts || accounts.length === 0) {
      setWallet((prev) => ({
        ...prev,
        address: null,
        isConnected: false,
        isConnecting: false,
        error: null,
      }));
    } else {
      setWallet((prev) => ({
        ...prev,
        address: accounts[0],
        isConnected: true,
        isConnecting: false,
        error: null,
      }));
    }
  }, []);

  const handleChainChanged = useCallback((hexChainId: string) => {
    const numericChainId = parseInt(hexChainId, 16);
    const isWrong = numericChainId !== STUDIONET_CONFIG.id;
    setWallet((prev) => ({
      ...prev,
      chainId: numericChainId,
      isWrongNetwork: isWrong,
    }));
  }, []);

  const handleDisconnect = useCallback(() => {
    setWallet({
      address: null,
      chainId: null,
      isConnected: false,
      isConnecting: false,
      isWrongNetwork: false,
      error: null,
      providerAvailable: typeof window !== 'undefined' && Boolean((window as any).ethereum),
    });
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return;
    const eth = (window as any).ethereum;

    eth.on?.('accountsChanged', handleAccountsChanged);
    eth.on?.('chainChanged', handleChainChanged);
    eth.on?.('disconnect', handleDisconnect);

    return () => {
      eth.removeListener?.('accountsChanged', handleAccountsChanged);
      eth.removeListener?.('chainChanged', handleChainChanged);
      eth.removeListener?.('disconnect', handleDisconnect);
    };
  }, [handleAccountsChanged, handleChainChanged, handleDisconnect]);

  // Connect Wallet — strictly user-initiated action
  const connectWallet = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setWallet((prev) => ({
        ...prev,
        providerAvailable: false,
        error: 'No compatible Web3 wallet detected. Please install MetaMask, Rabby, or a browser wallet extension.',
      }));
      return;
    }

    try {
      setWallet((prev) => ({ ...prev, isConnecting: true, error: null }));
      const eth = (window as any).ethereum;

      const accounts: string[] = await eth.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts authorized by wallet.');
      }

      const hexChainId: string = await eth.request({
        method: 'eth_chainId',
      });
      const numericChainId = parseInt(hexChainId, 16);
      const isWrong = numericChainId !== STUDIONET_CONFIG.id;

      setWallet({
        address: accounts[0],
        chainId: numericChainId,
        isConnected: true,
        isConnecting: false,
        isWrongNetwork: isWrong,
        error: null,
        providerAvailable: true,
      });
    } catch (err: any) {
      console.warn('Wallet connection error:', err);
      let userMessage = err?.message || 'Failed to connect wallet';
      if (err?.code === 4001) {
        userMessage = 'Connection request was cancelled by the user.';
      }
      setWallet((prev) => ({
        ...prev,
        isConnecting: false,
        error: userMessage,
      }));
    }
  };

  // Switch to GenLayer StudioNet network
  const switchToStudioNet = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return;
    const eth = (window as any).ethereum;

    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: STUDIONET_HEX_CHAIN_ID }],
      });
      setWallet((prev) => ({ ...prev, isWrongNetwork: false, error: null }));
    } catch (switchError: any) {
      // Code 4902 means the network needs to be added
      if (switchError.code === 4902 || switchError.data?.originalError?.code === 4902) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: STUDIONET_HEX_CHAIN_ID,
                chainName: STUDIONET_CONFIG.name,
                rpcUrls: [STUDIONET_CONFIG.rpcUrl],
                nativeCurrency: STUDIONET_CONFIG.nativeCurrency,
                blockExplorerUrls: [],
              },
            ],
          });
          setWallet((prev) => ({ ...prev, isWrongNetwork: false, error: null }));
        } catch (addError: any) {
          console.error('Failed to add StudioNet to wallet:', addError);
          setWallet((prev) => ({
            ...prev,
            error: addError?.message || 'Failed to add StudioNet network to wallet.',
          }));
        }
      } else {
        setWallet((prev) => ({
          ...prev,
          error: switchError?.message || 'Failed to switch network in wallet.',
        }));
      }
    }
  };

  // Disconnect local state
  const disconnectWallet = () => {
    handleDisconnect();
  };

  const value: WalletContextType = {
    ...wallet,
    connectWallet,
    disconnectWallet,
    switchToStudioNet,
  };

  return React.createElement(WalletContext.Provider, { value }, children);
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context) return context;

  // Fallback if rendered outside of WalletProvider
  return {
    address: null,
    chainId: null,
    isConnected: false,
    isConnecting: false,
    isWrongNetwork: false,
    error: null,
    providerAvailable: typeof window !== 'undefined' && Boolean((window as any).ethereum),
    connectWallet: async () => {},
    disconnectWallet: () => {},
    switchToStudioNet: async () => {},
  };
}

export function shortenAddress(address: string | null | undefined, chars: number = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
