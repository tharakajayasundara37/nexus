import { NextResponse } from 'next/server';
const { connectToMongo, getMongoStatus } = require('../../../lib/mongodb');
const { Product } = require('../../../lib/models');
const { saveBase64Image } = require('../../../lib/upload-helper');

export async function GET() {
  try {
    await connectToMongo();
    if (getMongoStatus().connected) {
      const products = await Product.find().sort({ createdAt: -1 });
      return NextResponse.json(products);
    }
    return NextResponse.json({ offline: true, message: 'MongoDB offline, using local store' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function getNextSequentialSku(catCode) {
  try {
    const regex = new RegExp(`^NX-${catCode}-(\\d{4,})$`, 'i');
    const existingProds = await Product.find({ sku: regex }).select('sku').lean();
    let maxSeq = 0;
    existingProds.forEach((p) => {
      if (p && p.sku) {
        const m = p.sku.trim().match(regex);
        if (m) {
          const val = parseInt(m[1], 10);
          if (!isNaN(val) && val > maxSeq) maxSeq = val;
        }
      }
    });
    return `NX-${catCode}-${String(maxSeq + 1).padStart(4, '0')}`;
  } catch (e) {
    return `NX-${catCode}-0001`;
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    await connectToMongo();
    if (getMongoStatus().connected) {
      const id = data.id || 'nx-' + (data.category || 'item') + '-' + Date.now().toString(36);
      const catCode =
        {
          shirts: 'SH',
          trousers: 'TR',
          shoes: 'SN',
          bags: 'BG',
        }[data.category] || (data.category || 'it').substring(0, 2).toUpperCase();

      let sku = data.sku && data.sku.trim() ? data.sku.trim() : null;
      if (!sku) {
        sku = await getNextSequentialSku(catCode);
      }

      const frontView = saveBase64Image(data.frontView, 'hanger_front');
      let sideView = saveBase64Image(data.sideView, 'hanger_side');
      const image = saveBase64Image(data.image, 'garment');
      const rawFrontView = saveBase64Image(data.rawFrontView, 'raw_front');
      const rawSideView = saveBase64Image(data.rawSideView, 'raw_side');

      const defaultSide =
        data.category === 'trousers'
          ? 'rail_assets/trousers_cutouts/2_cut.png'
          : 'rail_assets/scene_rail_cdn/custom_shirt_beige_utility_side.webp';
      if (!sideView || !sideView.trim()) {
        sideView = defaultSide;
      }

      const productData = Object.assign({}, data, {
        id,
        sku,
        frontView,
        sideView,
        image,
        rawFrontView,
        rawSideView,
      });

      let newProduct;
      try {
        newProduct = await Product.create(productData);
      } catch (createErr) {
        if (createErr.code === 11000) {
          productData.sku = await getNextSequentialSku(catCode);
          newProduct = await Product.create(productData);
        } else {
          throw createErr;
        }
      }

      return NextResponse.json({ success: true, product: newProduct }, { status: 201 });
    }

    return NextResponse.json({ success: true, product: data, offline: true });
  } catch (err) {
    console.error('[API Products POST Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
