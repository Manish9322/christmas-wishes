import type {Metadata} from 'next';
import OrnamentExperience from '@/components/OrnamentExperience';
import {ORB_SEO, buildPageMetadata} from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata(ORB_SEO);
}

export default function ChristmasOrnamentPage() {
  return <OrnamentExperience />;
}
