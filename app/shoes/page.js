import NexusPageRenderer from '../../components/NexusPageRenderer';
const { loadPageData } = require('../../lib/load-page');

export const metadata = {
  title: 'NEXUS | Footwear Orbit Experience',
};

export default function ShoesPage() {
  const pageData = loadPageData('shoes');
  return <NexusPageRenderer pageData={pageData} />;
}
