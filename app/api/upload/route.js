import { NextResponse } from 'next/server';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getUploadsDir } = require('../../../lib/upload-helper');

export async function POST(req) {
  try {
    const data = await req.json();
    if (!data.image || !data.filename) {
      return NextResponse.json({ error: 'Missing image data or filename' }, { status: 400 });
    }

    const base64Data = data.image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const safeName = Date.now() + '_' + data.filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const uploadsDir = getUploadsDir();
    const targetPath = path.join(uploadsDir, safeName);
    fs.writeFileSync(targetPath, buffer);

    let publicUrl = 'rail_assets/uploads/' + safeName;
    const category = data.category || 'shirts';
    const viewType = data.viewType || 'front';

    // Invoke root Python script remove_garment_bg.py directly for shirts, trousers, bags & runway dummies
    if (category === 'shirts' || category === 'trousers' || category === 'bags' || category === 'dummy' || category === 'runway' || category === 'look') {
      const ext = path.extname(safeName);
      const cutoutName = path.basename(safeName, ext) + '_cutout.png';
      const cutoutPath = path.join(uploadsDir, cutoutName);
      const pyScript = path.join(process.cwd(), 'remove_garment_bg.py');
      const pyTimeout = (category === 'bags' || category === 'dummy' || category === 'runway' || category === 'look') ? 45000 : 15000;
      try {
        execFileSync('py', [pyScript, targetPath, cutoutPath, category, viewType], { timeout: pyTimeout });
        if (fs.existsSync(cutoutPath)) {
          publicUrl = 'rail_assets/uploads/' + cutoutName;
        }
      } catch (pyErr) {
        try {
          execFileSync('python', [pyScript, targetPath, cutoutPath, category, viewType], { timeout: pyTimeout });
          if (fs.existsSync(cutoutPath)) {
            publicUrl = 'rail_assets/uploads/' + cutoutName;
          }
        } catch (pyErr2) {
          console.warn('[Upload API] Python cutout fallback to canvas:', pyErr2.message);
        }
      }
    }

    return NextResponse.json({ success: true, url: publicUrl, filename: safeName });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
