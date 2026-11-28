import { NextResponse } from 'next/server';
const { connectToMongo, getMongoStatus } = require('../../../lib/mongodb');
const { RunwayLook } = require('../../../lib/models');
const { saveBase64Image } = require('../../../lib/upload-helper');

function normalizeKitItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .filter((it) => it && String(it.title || '').trim())
    .map((it, idx) => ({
      id: String(it.id || 'kit-' + Date.now().toString(36) + '-' + idx),
      title: String(it.title).trim(),
      categoryLabel: String(it.categoryLabel || 'SHIRTS').trim().toUpperCase(),
      price: Math.max(0, Number(it.price) || 0),
      image: it.image ? saveBase64Image(it.image, 'kit_piece') : '',
      sizes: Array.isArray(it.sizes) && it.sizes.length ? it.sizes : ['S', 'M', 'L', 'XL'],
      pinLeft: String(it.pinLeft || '48%'),
      pinTop: String(it.pinTop || (idx === 0 ? '34%' : idx === 1 ? '62%' : '88%')),
    }));
}

export async function GET() {
  try {
    await connectToMongo();
    if (getMongoStatus().connected) {
      const looks = await RunwayLook.find({ active: { $ne: false } }).sort({ createdAt: 1 });
      return NextResponse.json(looks);
    }
    return NextResponse.json([]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    if (!data.name || !data.image) {
      return NextResponse.json({ error: 'Dummy name and transparent cutout image are required' }, { status: 400 });
    }
    await connectToMongo();
    if (getMongoStatus().connected) {
      const id = data.id || 'nx-look-' + Date.now().toString(36);
      const image = saveBase64Image(data.image, 'runway_dummy');
      const kitItems = normalizeKitItems(data.kitItems);
      const created = await RunwayLook.create({
        id,
        name: String(data.name).trim(),
        subtitle: String(data.subtitle || 'Custom Runway Dummy').trim(),
        image,
        linkedProductIds: Array.isArray(data.linkedProductIds) ? data.linkedProductIds : [],
        kitItems,
        active: true,
      });
      return NextResponse.json({ success: true, look: created }, { status: 201 });
    }
    return NextResponse.json({ error: 'MongoDB offline' }, { status: 503 });
  } catch (err) {
    console.error('[API Looks POST Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
