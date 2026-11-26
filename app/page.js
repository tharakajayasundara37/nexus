import NexusPageRenderer from '../components/NexusPageRenderer';
const { loadPageData } = require('../lib/load-page');

export default function HomePage() {
  const pageData = loadPageData('home');
  return <NexusPageRenderer pageData={pageData} />;
}
