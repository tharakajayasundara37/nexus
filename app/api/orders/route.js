import { NextResponse } from 'next/server';
const { connectToMongo, getMongoStatus } = require('../../../lib/mongodb');
const { Order } = require('../../../lib/models');

export async function GET() {
  try {
    await connectToMongo();
    if (getMongoStatus().connected) {
      const orders = await Order.find().sort({ createdAt: -1 });
      return NextResponse.json(orders);
    }
    return NextResponse.json([]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    await connectToMongo();
    if (getMongoStatus().connected) {
      const newOrder = await Order.create(data);
      return NextResponse.json({ success: true, order: newOrder }, { status: 201 });
    }
    return NextResponse.json({ success: true, offline: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
