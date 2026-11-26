import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ item_count: 1, items: [] });
}
