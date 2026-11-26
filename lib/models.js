const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: ['shirts', 'trousers', 'shoes', 'bags'], required: true },
  categoryLabel: { type: String, default: 'Atelier Collection' },
  price: { type: Number, required: true, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 90 },
  sku: { type: String, sparse: true, trim: true },
  stock: { type: Number, default: 20 },
  sizes: { type: [String], default: ['S', 'M', 'L', 'XL'] },
  image: { type: String, required: true },
  frontView: { type: String },
  sideView: { type: String },
  hangerType: { type: String, default: 'master_front_hanger_official.png' },
  hangerDefault: { type: Boolean, default: true },
  orbitImages: { type: [String], default: [] },
  description: { type: String, default: '' },
  badge: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ProductSchema.pre('save', function () {
  if (!this.sku || !this.sku.trim()) {
    const cat = (this.category || 'it').substring(0, 2).toUpperCase();
    this.sku = 'NX-' + cat + '-' + Math.floor(1000 + Math.random() * 9000);
  }
  this.updatedAt = new Date();
});

ProductSchema.virtual('finalPrice').get(function () {
  if (!this.discountPercent || this.discountPercent <= 0) return this.price;
  const savings = this.price * (this.discountPercent / 100);
  return Math.round((this.price - savings) * 100) / 100;
});

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  phone: String,
  address: String,
  items: [
    {
      id: String,
      title: String,
      size: String,
      quantity: Number,
      price: Number,
    },
  ],
  paymentMethod: { type: String, enum: ['cod', 'card', 'bank_receipt'], required: true },
  paymentStatus: { type: String, default: 'Pending' },
  total: { type: Number, required: true },
  slipImage: { type: String },
  status: {
    type: String,
    enum: ['Under Review', 'Processing', 'Dispatched', 'Completed', 'Cancelled'],
    default: 'Under Review',
  },
  createdAt: { type: Date, default: Date.now },
});

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['super_admin', 'store_manager', 'runway_editor'], default: 'store_manager' },
  name: String,
  avatar: String,
  lastLogin: Date,
});

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);
const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', AdminUserSchema);

module.exports = { Product, Order, AdminUser };
