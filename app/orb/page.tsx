import type {Metadata, Viewport} from 'next';
import OrnamentExperience from '@/components/OrnamentExperience';
import {ORB_SEO, buildPageMetadata} from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata(ORB_SEO);
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ffffff',
};

export default function OrbPage() {
  return <OrnamentExperience />;
}
