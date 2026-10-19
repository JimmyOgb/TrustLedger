import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/lib/wallet';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'TrustLedger | GEN Milestone Escrow on GenLayer StudioNet',
  description: 'Verifiable GEN-denominated milestone escrow with multi-validator AI consensus on GenLayer StudioNet.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-blue-600 selection:text-white">
        <WalletProvider>
          <AppShell>{children}</AppShell>
        </WalletProvider>
      </body>
    </html>
  );
}
