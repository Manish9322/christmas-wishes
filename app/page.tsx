import type {Metadata} from 'next';
import ChristmasWishExperience from '@/components/ChristmasWishExperience';

export const metadata: Metadata = {
  title: 'Merry Christmas | A Little Christmas Wish',
  description:
    'A little interactive Christmas greeting to share joy, warmth, peace, and happiness with the people who matter.',
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

export default function HomePage() {
  return <ChristmasWishExperience />;
}
