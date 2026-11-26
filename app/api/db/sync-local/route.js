import { NextResponse } from 'next/server';
const { connectToMongo, getMongoStatus } = require('../../../../lib/mongodb');
const { Product } = require('../../../../lib/models');

export async function POST(req) {
  try {
    await connectToMongo();
    if (!getMongoStatus().connected) {
      return NextResponse.json({ error: 'MongoDB is not connected yet.' }, { status: 400 });
    }

    const data = await req.json();
    const items = Array.isArray(data) ? data : data.items || [];
    let upsertedCount = 0;

    for (const item of items) {
      if (!item.id || !item.title) continue;
      await Product.findOneAndUpdate(
        { id: item.id },
        { $set: Object.assign({}, item, { updatedAt: new Date() }) },
        { upsert: true, new: true }
      );
      upsertedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${upsertedCount} pieces into MongoDB Atlas!`,
      count: upsertedCount,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
