import type {Metadata, Viewport} from 'next';
import localFont from 'next/font/local';
import {Raleway} from 'next/font/google';
import {HOME_SEO, SITE_NAME, buildPageMetadata} from '@/lib/seo';
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

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata(HOME_SEO);
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'All',
  description: HOME_SEO.description,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData)}}
        />
        {children}
      </body>
    </html>
  );
}
