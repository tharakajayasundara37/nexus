const fs = require('fs');
const path = require('path');

function loadPageData(name) {
  const filePath = path.join(process.cwd(), 'lib', 'pages', `${name}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

module.exports = { loadPageData };
