const fs = require('fs');
const path = require('path');

function getUploadsDir() {
  const dir = path.join(process.cwd(), 'public', 'rail_assets', 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function saveBase64Image(dataUri, prefix) {
  if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
    return dataUri || '';
  }
  try {
    const extMatch = dataUri.match(/^data:image\/(\w+);base64,/);
    const ext = extMatch && extMatch[1] === 'jpeg' ? 'jpg' : (extMatch && extMatch[1]) || 'png';
    const base64Data = dataUri.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = (prefix || 'img') + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + ext;
    const filePath = path.join(getUploadsDir(), fileName);
    fs.writeFileSync(filePath, buffer);
    return 'rail_assets/uploads/' + fileName;
  } catch (err) {
    console.error('Error saving base64 image to file:', err);
    return dataUri;
  }
}

module.exports = { getUploadsDir, saveBase64Image };
