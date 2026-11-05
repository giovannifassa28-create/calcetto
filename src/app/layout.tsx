import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Calcetto FUT Manager',
  description: 'Gestione partite di calcetto con carte giocatore, algoritmo di bilanciamento e pagelle peer-to-peer.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 flex justify-center selection:bg-emerald-500 selection:text-black">
        <div className="w-full max-w-md min-h-screen flex flex-col relative bg-zinc-950 pb-20 shadow-2xl">
          {children}
        </div>
      </body>
    </html>
  );
}
