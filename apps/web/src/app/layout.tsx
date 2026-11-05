import type { Metadata } from 'next';
import { Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import { SessionProvider } from '@/components/SessionProvider';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

const sans = Source_Sans_3({ subsets: ['latin'], variable: '--font-sans' });
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'Digi Capsule',
  description: 'A private place to keep letters, photos, videos, audio, and documents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} font-sans text-ink antialiased`}>
        <SessionProvider>
          <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
            Skip to content
          </a>
          <SiteHeader />
          <main id="content" className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
            {children}
          </main>
        </SessionProvider>
      </body>
    </html>
  );
}
