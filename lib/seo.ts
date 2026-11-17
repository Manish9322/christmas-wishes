import type {Metadata} from 'next';
import {headers} from 'next/headers';

export const SITE_NAME = 'A Little Christmas Wish';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

function normalizeBaseUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === 'MY_APP_URL') return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const isLocal =
    trimmed.startsWith('localhost') ||
    trimmed.startsWith('127.0.0.1') ||
    trimmed.startsWith('[::1]');
  return `${isLocal ? 'http' : 'https'}://${trimmed}`;
}

export async function resolveSiteUrl(): Promise<string> {
  try {
    const reqHeaders = await headers();
    const forwardedHost = reqHeaders.get('x-forwarded-host');
    const host = (forwardedHost ?? reqHeaders.get('host') ?? '')
      .split(',')[0]
      .trim();

    if (host && !host.startsWith('0.0.0.0')) {
      const forwardedProto = reqHeaders
        .get('x-forwarded-proto')
        ?.split(',')[0]
        .trim();
      const isLocal =
        host.startsWith('localhost') ||
        host.startsWith('127.0.0.1') ||
        host.startsWith('[::1]');
      const proto = forwardedProto || (isLocal ? 'http' : 'https');
      return `${proto}://${host}`;
    }
  } catch {
    // Fallback when evaluated outside an active request context.
  }

  return (
    normalizeBaseUrl(process.env.APP_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    'http://localhost:3000'
  );
}

export interface PageSeoConfig {
  path: '/' | '/orb';
  title: string;
  socialTitle: string;
  imagePath: '/og-image.png' | '/og-orb.png';
  imageAlt: string;
}

export const HOME_SEO: PageSeoConfig = {
  path: '/',
  title: 'Merry Christmas! | A Little Christmas Wish',
  socialTitle: 'Merry Christmas! | A Little Christmas Wish',
  imagePath: '/og-image.png',
  imageAlt: 'Merry Christmas! monochrome 3D faceted Christmas sculpture',
};

export const ORB_SEO: PageSeoConfig = {
  path: '/orb',
  title: 'Christmas Ornament | A Little Christmas Wish',
  socialTitle: 'Merry Christmas! | A Little Christmas Wish',
  imagePath: '/og-orb.png',
  imageAlt: 'Merry Christmas! monochrome 3D spiral Christmas ornament',
};

export async function buildPageMetadata(
  config: PageSeoConfig,
): Promise<Metadata> {
  const siteUrl = await resolveSiteUrl();
  const pageUrl = new URL(config.path, `${siteUrl}/`).toString();
  const imageUrl = new URL(config.imagePath, `${siteUrl}/`).toString();

  return {
    metadataBase: new URL(siteUrl),
    title: config.title,
    applicationName: SITE_NAME,
    alternates: {
      canonical: pageUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: config.socialTitle,
      url: pageUrl,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
      images: [
        {
          url: imageUrl,
          secureUrl: imageUrl.startsWith('https://') ? imageUrl : undefined,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          type: 'image/png',
          alt: config.imageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: config.socialTitle,
      images: [
        {
          url: imageUrl,
          alt: config.imageAlt,
        },
      ],
    },
  };
}
