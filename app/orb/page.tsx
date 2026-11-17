import type {Metadata} from 'next';
import OrnamentExperience from '@/components/OrnamentExperience';

export const metadata: Metadata = {
  title: 'Christmas Ornament | A Little Christmas Wish',
  description:
    'A little interactive Christmas greeting ornament to share joy, warmth, peace, and happiness with the people who matter.',
  openGraph: {
    title: 'Merry Christmas!',
    description:
      'A little Christmas surprise, created to share warm wishes and festive happiness.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Merry Christmas!',
    description:
      'A little Christmas surprise, created to share warm wishes and festive happiness.',
  },
};

export default function ChristmasOrnamentPage() {
  return <OrnamentExperience />;
}
