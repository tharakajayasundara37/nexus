import NexusPageRenderer from '../../components/NexusPageRenderer';
const { loadPageData } = require('../../lib/load-page');

export const metadata = {
  title: 'NEXUS | Leather Bags & Carry Archive',
};

export default function BagsPage() {
  const pageData = loadPageData('bags');
  return <NexusPageRenderer pageData={pageData} />;
}
