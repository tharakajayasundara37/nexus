import { NextResponse } from 'next/server';
const fs = require('fs');
const path = require('path');
const { connectToMongo } = require('../../../../lib/mongodb');

export async function POST(req) {
  try {
    const data = await req.json();
    if (!data.uri) {
      return NextResponse.json({ error: 'Connection string URI is required.' }, { status: 400 });
    }

    const result = await connectToMongo(data.uri);
    if (result.success) {
      try {
        const envPath = path.join(process.cwd(), '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        if (envContent.includes('MONGODB_URI=')) {
          envContent = envContent.replace(/MONGODB_URI=.*(\r?\n|$)/, `MONGODB_URI=${data.uri}$1`);
        } else {
          envContent += `\nMONGODB_URI=${data.uri}\n`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
      } catch (err) {
        console.warn('Failed to update .env:', err.message);
      }

      return NextResponse.json({
        success: true,
        message: `Connected successfully to database "${result.dbName}"!`,
        database: result.dbName,
      });
    }

    return NextResponse.json(
      { success: false, error: result.error || 'Failed to connect to MongoDB cluster' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
