import NexusPageRenderer from '../../components/NexusPageRenderer';
const { loadPageData } = require('../../lib/load-page');

export const metadata = {
  title: 'NEXUS | Shirts & Tops Atelier',
};

export default function ShirtsPage() {
  const pageData = loadPageData('shirts');
  return <NexusPageRenderer pageData={pageData} />;
}
