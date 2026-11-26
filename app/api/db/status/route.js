import { NextResponse } from 'next/server';
const { connectToMongo, getMongoStatus } = require('../../../../lib/mongodb');
const { Product, Order } = require('../../../../lib/models');

export async function GET() {
  await connectToMongo();
  const status = getMongoStatus();
  let productCount = 0;
  let orderCount = 0;
  if (status.connected) {
    try {
      productCount = await Product.countDocuments();
      orderCount = await Order.countDocuments();
    } catch (e) {}
  }

  const rawUri = process.env.MONGODB_URI || '';
  const maskedUri = rawUri ? rawUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:••••••••@') : '';

  return NextResponse.json({
    connected: status.connected,
    database: status.dbName,
    targetExplorer: 'https://cloud.mongodb.com/v2/69c246367c369ebb761f0548#/explorer/69ec486e6967bafc4dfd115b/nexus',
    counts: {
      products: productCount,
      orders: orderCount,
    },
    maskedUri,
  });
}
