import NexusPageRenderer from '../../components/NexusPageRenderer';
const { loadPageData } = require('../../lib/load-page');

export const metadata = {
  title: 'NEXUS | Denim & Trousers Atelier',
};

export default function TrousersPage() {
  const pageData = loadPageData('trousers');
  return <NexusPageRenderer pageData={pageData} />;
}
