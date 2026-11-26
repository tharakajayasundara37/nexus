const dns = require('dns');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Product } = require('./models');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {}

const globalForMongoose = globalThis;
if (!globalForMongoose._nexusMongo) {
  globalForMongoose._nexusMongo = { conn: null, promise: null, seeded: false };
}

async function seedDefaultProducts() {
  if (globalForMongoose._nexusMongo.seeded) return;
  try {
    const count = await Product.countDocuments();
    if (count === 0) {
      const catalogPath = path.join(process.cwd(), 'public', 'nexus-catalog.js');
      if (fs.existsSync(catalogPath)) {
        const code = fs.readFileSync(catalogPath, 'utf8');
        const match = code.match(/const DEFAULT_PRODUCTS = (\[[\s\S]*?\]);/);
        if (match) {
          const defaults = JSON.parse(match[1]);
          await Product.insertMany(defaults);
        }
      }
    }
    globalForMongoose._nexusMongo.seeded = true;
  } catch (e) {
    console.warn('[MongoDB Seed Warning]:', e.message);
  }
}

async function connectToMongo(customUri) {
  const uri = customUri || process.env.MONGODB_URI;
  if (!uri) {
    return { success: false, message: 'No MONGODB_URI provided' };
  }

  try {
    if (customUri && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      globalForMongoose._nexusMongo.conn = null;
      globalForMongoose._nexusMongo.promise = null;
    }

    if (globalForMongoose._nexusMongo.conn && mongoose.connection.readyState === 1) {
      return { success: true, dbName: mongoose.connection.name || 'nexus' };
    }

    if (!globalForMongoose._nexusMongo.promise) {
      globalForMongoose._nexusMongo.promise = mongoose.connect(uri, {
        dbName: 'nexus',
        serverSelectionTimeoutMS: 5000,
      });
    }

    globalForMongoose._nexusMongo.conn = await globalForMongoose._nexusMongo.promise;
    await seedDefaultProducts();
    return { success: true, dbName: mongoose.connection.name || 'nexus' };
  } catch (err) {
    globalForMongoose._nexusMongo.promise = null;
    globalForMongoose._nexusMongo.conn = null;
    return { success: false, error: err.message };
  }
}

function getMongoStatus() {
  return {
    connected: mongoose.connection.readyState === 1,
    dbName: mongoose.connection.name || 'nexus',
  };
}

module.exports = { connectToMongo, getMongoStatus };
