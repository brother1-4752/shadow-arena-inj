import React, { createContext, useContext, useState, useCallback } from 'react';

const CHAIN_ID = 'injective-888';
const CHAIN_NAME = 'Injective Testnet';
const REST_ENDPOINT = 'https://testnet.sentry.lcd.injective.network:443';
const RPC_ENDPOINT = 'https://testnet.sentry.tm.injective.network:443';

const INJECTIVE_TESTNET_CHAIN_INFO = {
  chainId: CHAIN_ID,
  chainName: CHAIN_NAME,
  rpc: RPC_ENDPOINT,
  rest: REST_ENDPOINT,
  bip44: { coinType: 60 },
  bech32Config: {
    bech32PrefixAccAddr: 'inj',
    bech32PrefixAccPub: 'injpub',
    bech32PrefixValAddr: 'injvaloper',
    bech32PrefixValPub: 'injvaloperpub',
    bech32PrefixConsAddr: 'injvalcons',
    bech32PrefixConsPub: 'injvalconspub',
  },
  currencies: [{ coinDenom: 'INJ', coinMinimalDenom: 'inj', coinDecimals: 18 }],
  feeCurrencies: [{ coinDenom: 'INJ', coinMinimalDenom: 'inj', coinDecimals: 18, gasPriceStep: { low: 500000000, average: 1000000000, high: 1500000000 } }],
  stakeCurrency: { coinDenom: 'INJ', coinMinimalDenom: 'inj', coinDecimals: 18 },
};

declare global {
  interface Window {
    keplr?: {
      experimentalSuggestChain(chainInfo: any): Promise<void>;
      enable(chainId: string): Promise<void>;
      getKey(chainId: string): Promise<{ bech32Address: string; pubKey: Uint8Array; name: string }>;
      getOfflineSigner(chainId: string): any;
    };
  }
}

export interface WalletState {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  chainId: string;
  chainName: string;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!window.keplr) {
      setError('Keplr wallet not found. Please install the Keplr extension.');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      await window.keplr.experimentalSuggestChain(INJECTIVE_TESTNET_CHAIN_INFO);
      await window.keplr.enable(CHAIN_ID);
      const key = await window.keplr.getKey(CHAIN_ID);
      setAddress(key.bech32Address);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  return (
    <WalletContext.Provider value={{
      address,
      connected: address !== null,
      connecting,
      chainId: CHAIN_ID,
      chainName: CHAIN_NAME,
      error,
      connect,
      disconnect,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWalletContext must be used within WalletProvider');
  return ctx;
}
