import type {Metadata, Viewport} from 'next';
import localFont from 'next/font/local';
import {Raleway} from 'next/font/google';
import './globals.css';

const magnoliaSky = localFont({
  src: './fonts/magnolia_sky.ttf',
  weight: '400',
  style: 'normal',
  variable: '--font-display',
  display: 'swap',
  fallback: ['Brush Script MT', 'Segoe Script', 'cursive'],
});

const raleway = Raleway({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Faceted Holiday Egg',
  description:
    'An interactive monochromatic 3D polygon-faceted egg that cracks open to reveal a festive celebration.',
  openGraph: {
    title: 'Faceted Holiday Egg',
    description:
      'An interactive monochromatic 3D polygon-faceted egg that cracks open to reveal a festive celebration.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Faceted Holiday Egg',
    description:
      'An interactive monochromatic 3D polygon-faceted egg that cracks open to reveal a festive celebration.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      className={`${magnoliaSky.variable} ${raleway.variable}`}
    >
      <body
        className="bg-[#09090b] text-zinc-100 antialiased overflow-hidden select-none font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
