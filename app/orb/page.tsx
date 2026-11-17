import type {Metadata} from 'next';
import OrnamentExperience from '@/components/OrnamentExperience';

export const metadata: Metadata = {
  title: 'Holiday Ornament | Faceted Holiday Egg',
  description:
    'An interactive monochromatic 3D Christmas ornament that opens to reveal a festive celebration.',
};

export default function LightOrnamentPage() {
  return <OrnamentExperience />;
}
