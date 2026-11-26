import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ status: 'ok', items: [{ id: 1, quantity: 1 }] });
}

export async function GET() {
  return NextResponse.json({ status: 'ok', items: [{ id: 1, quantity: 1 }] });
}
