import { NextResponse } from 'next/server';
const { connectToMongo, getMongoStatus } = require('../../../lib/mongodb');

export async function GET() {
  await connectToMongo();
  const status = getMongoStatus();
  return NextResponse.json({
    status: 'ok',
    server: 'NEXUS Haute-Couture Next.js Master Node',
    mongoConnected: status.connected,
    database: status.dbName,
    time: new Date(),
  });
}
