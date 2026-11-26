import NexusPageRenderer from '../../components/NexusPageRenderer';
const { loadPageData } = require('../../lib/load-page');

export const metadata = {
  title: 'NEXUS Atelier | Haute-Couture Master Administration',
};

export default function AdminPage() {
  const pageData = loadPageData('admin');
  return <NexusPageRenderer pageData={pageData} />;
}
