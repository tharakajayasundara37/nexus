import { NextResponse } from 'next/server';
const { connectToMongo, getMongoStatus } = require('../../../../lib/mongodb');
const { Product } = require('../../../../lib/models');
const { saveBase64Image } = require('../../../../lib/upload-helper');

export async function PUT(req, { params }) {
  try {
    const { id: prodId } = await params;
    const updates = await req.json();
    if (updates.frontView) updates.frontView = saveBase64Image(updates.frontView, 'hanger_front');
    if (updates.sideView) updates.sideView = saveBase64Image(updates.sideView, 'hanger_side');
    if (updates.image) updates.image = saveBase64Image(updates.image, 'garment');
    if (updates.rawFrontView) updates.rawFrontView = saveBase64Image(updates.rawFrontView, 'raw_front');
    if (updates.rawSideView) updates.rawSideView = saveBase64Image(updates.rawSideView, 'raw_side');
    if (updates.sku && !updates.sku.trim()) {
      delete updates.sku;
    }

    await connectToMongo();
    if (getMongoStatus().connected) {
      const updated = await Product.findOneAndUpdate({ id: prodId }, { $set: updates }, { new: true, upsert: true });
      return NextResponse.json({ success: true, product: updated });
    }
    return NextResponse.json({ success: true, offline: true });
  } catch (err) {
    console.error('[API Products PUT Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id: prodId } = await params;
    await connectToMongo();
    if (getMongoStatus().connected) {
      await Product.findOneAndDelete({ id: prodId });
      return NextResponse.json({ success: true, deleted: prodId });
    }
    return NextResponse.json({ success: true, offline: true });
  } catch (err) {
    console.error('[API Products DELETE Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
