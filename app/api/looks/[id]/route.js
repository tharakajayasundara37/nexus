import { NextResponse } from 'next/server';
const { connectToMongo, getMongoStatus } = require('../../../../lib/mongodb');
const { RunwayLook } = require('../../../../lib/models');
const { saveBase64Image } = require('../../../../lib/upload-helper');

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

export async function PUT(req, { params }) {
  try {
    const { id: lookId } = await params;
    const updates = await req.json();
    if (updates.image) updates.image = saveBase64Image(updates.image, 'runway_dummy');
    if (Array.isArray(updates.kitItems)) {
      updates.kitItems = normalizeKitItems(updates.kitItems);
    }
    updates.updatedAt = new Date();

    await connectToMongo();
    if (getMongoStatus().connected) {
      const updated = await RunwayLook.findOneAndUpdate({ id: lookId }, { $set: updates }, { new: true });
      return NextResponse.json({ success: true, look: updated });
    }
    return NextResponse.json({ error: 'MongoDB offline' }, { status: 503 });
  } catch (err) {
    console.error('[API Looks PUT Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id: lookId } = await params;
    await connectToMongo();
    if (getMongoStatus().connected) {
      await RunwayLook.findOneAndDelete({ id: lookId });
      return NextResponse.json({ success: true, deleted: lookId });
    }
    return NextResponse.json({ error: 'MongoDB offline' }, { status: 503 });
  } catch (err) {
    console.error('[API Looks DELETE Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
