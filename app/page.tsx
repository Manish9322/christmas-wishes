import type {Metadata} from 'next';
import ChristmasWishExperience from '@/components/ChristmasWishExperience';
import {HOME_SEO, buildPageMetadata} from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata(HOME_SEO);
}

export default function HomePage() {
  return <ChristmasWishExperience />;
}
