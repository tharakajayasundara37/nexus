/**
 * NEXUS Haute-Couture Master Catalog Engine
 * Real-time synchronization between Admin Portal, Storefront, Rail, and Category Archives.
 */
(function(window) {
  'use strict';

  const STORAGE_KEY = 'nexus_live_catalog_v1';
  const DISCOUNTS_KEY = 'nexus_live_discounts_v1';
  const ORDERS_KEY = 'nexus_live_orders_v1';
  const SETTINGS_KEY = 'nexus_admin_settings_v1';

  // Master Seed Catalog (Shirts are managed dynamically via Database / Admin)
  const DEFAULT_PRODUCTS = [
    // --- TROUSERS & DENIM (RAIL COMPATIBLE) ---
    {
      id: 'trouser-black-denim',
      title: 'Washed Black Denim Wide-Leg Cargo Jeans',
      category: 'trousers',
      categoryLabel: 'Trousers & Denim',
      price: 145.00,
      discountPercent: 10,
      sku: 'NX-TR-001',
      stock: 40,
      sizes: ['S', 'M', 'L', 'XL'],
      image: 'rail_assets/trousers_cutouts/4_cut.png',
      frontView: 'rail_assets/trousers_cutouts/4_cut.png',
      sideView: 'rail_assets/trousers_cutouts/2_cut.png',
      hangerType: 'master_front_hanger_official.png',
      hangerDefault: true,
      description: '14oz rigid Japanese selvedge denim in mineral-washed black with dual cargo compartments and floor-skimming hem.',
      badge: 'Iconic Fit',
      createdAt: '2026-11-20T11:30:00.000Z'
    },
    {
      id: 'trouser-coffee-pleated',
      title: 'Coffee Brown Korean Pleated Wide Slacks',
      category: 'trousers',
      categoryLabel: 'Trousers & Denim',
      price: 135.00,
      discountPercent: 15,
      sku: 'NX-TR-002',
      stock: 25,
      sizes: ['S', 'M', 'L', 'XL'],
      image: 'rail_assets/trousers_cutouts/3_cut.png',
      frontView: 'rail_assets/trousers_cutouts/3_cut.png',
      sideView: 'rail_assets/trousers_cutouts/14_cut.png',
      hangerType: 'master_front_hanger_official.png',
      hangerDefault: true,
      description: 'High-waisted double front pleats tailored from Italian wool-blend suiting in warm mocha tones.',
      badge: 'Editorial',
      createdAt: '2026-11-20T11:45:00.000Z'
    },
    {
      id: 'trouser-zara-blue',
      title: 'Archive Stonewashed Relaxed Blue Denim',
      category: 'trousers',
      categoryLabel: 'Trousers & Denim',
      price: 165.00,
      discountPercent: 20,
      sku: 'NX-TR-003',
      stock: 35,
      sizes: ['S', 'M', 'L', 'XL'],
      image: 'rail_assets/trousers_cutouts/6_cut.png',
      frontView: 'rail_assets/trousers_cutouts/6_cut.png',
      sideView: 'rail_assets/trousers_cutouts/16_cut.png',
      hangerType: 'master_front_hanger_official.png',
      hangerDefault: true,
      description: 'Authentic 90s wash with subtle distressing, custom antiqued silver hardware, and relaxed knee volume.',
      badge: 'Trending',
      createdAt: '2026-11-20T12:00:00.000Z'
    },
    {
      id: 'trouser-white-silk',
      title: 'LilySilk Timeless Pure Silk Trousers',
      category: 'trousers',
      categoryLabel: 'Trousers & Denim',
      price: 185.00,
      discountPercent: 0,
      sku: 'NX-TR-004',
      stock: 15,
      sizes: ['S', 'M', 'L', 'XL'],
      image: 'rail_assets/trousers_cutouts/11_cut.png',
      frontView: 'rail_assets/trousers_cutouts/11_cut.png',
      sideView: 'rail_assets/trousers_cutouts/15_cut.png',
      hangerType: 'master_front_hanger_official.png',
      hangerDefault: true,
      description: 'Grade 6A Mulberry silk with fluid liquid drape, internal drawstring waistband, and bespoke side piping.',
      badge: 'Luxury Pure Silk',
      createdAt: '2026-11-20T12:15:00.000Z'
    },
    {
      id: 'trouser-y2k-cargo',
      title: 'Y2K Alternative Streetwear Multi-Pocket Cargo',
      category: 'trousers',
      categoryLabel: 'Trousers & Denim',
      price: 155.00,
      discountPercent: 25,
      sku: 'NX-TR-005',
      stock: 22,
      sizes: ['S', 'M', 'L', 'XL'],
      image: 'rail_assets/trousers_cutouts/19_cut.png',
      frontView: 'rail_assets/trousers_cutouts/19_cut.png',
      sideView: 'rail_assets/trousers_cutouts/20_cut.png',
      hangerType: 'master_front_hanger_official.png',
      hangerDefault: true,
      description: 'Tactical cargo pant with modular utility loops, ankle cinch toggles, and reinforced knee articulation.',
      badge: 'Streetwear',
      createdAt: '2026-11-20T12:30:00.000Z'
    },

    // --- FOOTWEAR & SNEAKERS (ORBIT COMPATIBLE) ---
    {
      id: 'shoe-luka-5',
      title: 'Luka 5 Performance Orbit Runner',
      category: 'shoes',
      categoryLabel: 'Footwear & Sneakers',
      price: 149.00,
      discountPercent: 0,
      sku: 'NX-SN-001',
      stock: 60,
      sizes: ['40', '41', '42', '43', '44', '45', '46'],
      image: 'assets/shoes_orbit/1.png',
      orbitImages: [
        'assets/shoes_orbit/1.png',
        'assets/shoes_orbit/2.png',
        'assets/shoes_orbit/3_601e6b64-4e5b-4031-98cc-f63701e92f66.png'
      ],
      description: 'Cushioned responsiveness engineered for on-court agility and high-fashion streetwear velocity.',
      badge: 'Featured Orbit',
      createdAt: '2026-11-20T13:00:00.000Z'
    },
    {
      id: 'shoe-retro-12',
      title: 'Air Jordan 12 Retro High Luxury Edition',
      category: 'shoes',
      categoryLabel: 'Footwear & Sneakers',
      price: 199.00,
      discountPercent: 10,
      sku: 'NX-SN-002',
      stock: 18,
      sizes: ['40', '41', '42', '43', '44', '45', '46'],
      image: 'assets/shoes_orbit/3_601e6b64-4e5b-4031-98cc-f63701e92f66.png',
      orbitImages: [
        'assets/shoes_orbit/3_601e6b64-4e5b-4031-98cc-f63701e92f66.png',
        'assets/shoes_orbit/4.png'
      ],
      description: 'Iconic sunburst stitching on tumbled leather with carbon fiber shank plate and full-length Zoom Air.',
      badge: 'Grail Retro',
      createdAt: '2026-11-20T13:15:00.000Z'
    },
    {
      id: 'shoe-tatum-5',
      title: 'Tatum 5 Orbit Sculptural Sneaker',
      category: 'shoes',
      categoryLabel: 'Footwear & Sneakers',
      price: 165.00,
      discountPercent: 15,
      sku: 'NX-SN-003',
      stock: 24,
      sizes: ['40', '41', '42', '43', '44', '45', '46'],
      image: 'assets/shoes_orbit/4.png',
      orbitImages: [
        'assets/shoes_orbit/4.png',
        'assets/shoes_orbit/7.png'
      ],
      description: 'Lightweight framework with cage containment and precision energy return for effortless motion.',
      badge: 'Runway Sneaker',
      createdAt: '2026-11-20T13:30:00.000Z'
    },
    {
      id: 'shoe-retro-4',
      title: 'Retro 4 Vintage Archive Olive & Black',
      category: 'shoes',
      categoryLabel: 'Footwear & Sneakers',
      price: 180.00,
      discountPercent: 0,
      sku: 'NX-SN-004',
      stock: 14,
      sizes: ['40', '41', '42', '43', '44', '45', '46'],
      image: 'assets/shoes_orbit/7.png',
      orbitImages: [
        'assets/shoes_orbit/7.png',
        'assets/shoes_orbit/8.png'
      ],
      description: 'Vintage nubuck upper with molded eyestays and signature visible air heel cushioning.',
      badge: 'Archive Footwear',
      createdAt: '2026-11-20T13:45:00.000Z'
    },

    // --- BAGS & ACCESSORIES ---
    {
      id: 'bag-vintage-leather',
      title: "Leather Small Vintage Shoulder & Crossbody Bag",
      category: 'bags',
      categoryLabel: 'Bags & Accessories',
      price: 139.00,
      discountPercent: 10,
      sku: 'NX-BG-001',
      stock: 35,
      sizes: ['One Size'],
      image: 'rail_assets/bages/A-QMZL Men\'s Shoulder Bag, Leather Small Vintage Shoulder Bag, Crossbody Bag, Business Bag, Waterproof, Suitable for Leisure, Work, Travel.jpg',
      description: 'Hand-burnished full-grain cowhide leather with water-repellent finish, brass zippers, and quick-adjust webbing strap.',
      badge: 'Handcrafted',
      createdAt: '2026-11-20T14:00:00.000Z'
    },
    {
      id: 'bag-canvas-messenger',
      title: 'Canvas Messenger Bag Men - Atelier Carry',
      category: 'bags',
      categoryLabel: 'Bags & Accessories',
      price: 119.00,
      discountPercent: 0,
      sku: 'NX-BG-002',
      stock: 42,
      sizes: ['One Size'],
      image: 'rail_assets/bages/Canvas messenger bag - Men _ H_E. BY MANGO.jpg',
      description: 'Heavy duty washed canvas with saddle leather trim, magnetic flap closures, and padded 14-inch tablet sleeve.',
      badge: 'Everyday Carry',
      createdAt: '2026-11-20T14:15:00.000Z'
    },
    {
      id: 'bag-satchel-travel',
      title: 'Large Satchel Shoulder Bag for Work & Travel',
      category: 'bags',
      categoryLabel: 'Bags & Accessories',
      price: 159.00,
      discountPercent: 20,
      sku: 'NX-BG-003',
      stock: 19,
      sizes: ['One Size'],
      image: 'rail_assets/bags_processed/bag-satchel-travel_cutout.png',
      description: 'Executive capacity with multi-tier organization pockets, luggage pass-through sleeve, and cushioned shoulder pad.',
      badge: 'Travel Essential',
      createdAt: '2026-11-20T14:30:00.000Z'
    },
    {
      id: 'bag-laptop-duffle',
      title: 'Duffle Bag Mens – Fits 15-inch Laptop & Weekender',
      category: 'bags',
      categoryLabel: 'Bags & Accessories',
      price: 175.00,
      discountPercent: 15,
      sku: 'NX-BG-004',
      stock: 22,
      sizes: ['One Size'],
      image: 'rail_assets/bags_processed/bag-laptop-duffle_cutout.png',
      description: 'Waterproof waxed canvas weekend duffle with separate ventilated shoe compartment and reinforced leather base.',
      badge: 'Weekender',
      createdAt: '2026-11-20T14:45:00.000Z'
    }
  ];

  // Realtime BroadcastChannel for instantaneous multi-tab sync
  let catalogBroadcast = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      catalogBroadcast = new BroadcastChannel('nexus_catalog_channel');
    }
  } catch(e) {}

  // Engine Implementation
  const NexusCatalog = {
    // Cloud API Synchronization
    syncWithCloud: function() {
      if (typeof fetch === 'undefined') return;
      fetch('/api/products')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const current = this.getAll();
            if (JSON.stringify(current) !== JSON.stringify(data)) {
              console.log('[NexusCatalog] Synced ' + data.length + ' pieces from MongoDB Atlas cloud!');
              this.saveAll(data, false); // don't re-post to cloud
            }
          }
        })
        .catch(() => {});
    },

    // Read all products from localStorage or initialize with seed
    getAll: function() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('NexusCatalog: Error reading localStorage, using defaults', e);
      }
      this.saveAll(DEFAULT_PRODUCTS, false);
      return DEFAULT_PRODUCTS;
    },

    // Save full catalog & broadcast
    saveAll: function(items, syncToCloud = false) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        localStorage.setItem('nexus_catalog_sync_time', Date.now().toString());
        window.dispatchEvent(new CustomEvent('nexus_catalog_updated', { detail: { items: items } }));
        if (catalogBroadcast) {
          catalogBroadcast.postMessage({ type: 'catalog_updated', count: items.length, time: Date.now() });
        }
        if (syncToCloud && typeof fetch !== 'undefined') {
          fetch('/api/db/sync-local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: items })
          }).catch(() => {});
        }
      } catch (e) {
        console.error('NexusCatalog: Error saving to localStorage', e);
      }
    },

    // Get products filtered by category
    getByCategory: function(category) {
      const all = this.getAll();
      if (!category || category === 'all') return all;
      return all.filter(p => p.category === category);
    },

    // Alias for getByCategory
    getProductsByCategory: function(category) {
      return this.getByCategory(category);
    },

    // Get single product by ID
    getById: function(id) {
      return this.getAll().find(p => p.id === id) || null;
    },

    // Calculate final discounted price
    calculatePrice: function(regularPrice, discountPercent) {
      const num = parseFloat(regularPrice) || 0;
      const disc = Math.max(0, Math.min(100, parseFloat(discountPercent) || 0));
      if (disc === 0) return { regular: num, discount: 0, final: num, savings: 0 };
      const savings = (num * (disc / 100));
      const finalPrice = Math.max(0, num - savings);
      return {
        regular: num,
        discount: disc,
        final: Math.round(finalPrice * 100) / 100,
        savings: Math.round(savings * 100) / 100
      };
    },

    // Get next sequential 4-digit SKU for a category (NX-BG-0001, NX-BG-0002... NX-BG-0010)
    getNextSku: function(category) {
      const catCode = {
        'shirts': 'SH',
        'trousers': 'TR',
        'shoes': 'SN',
        'bags': 'BG'
      }[category] || (category || 'it').substring(0, 2).toUpperCase();
      const all = this.getAll();
      let maxSeq = 0;
      const regex = new RegExp(`^NX-${catCode}-(\\d{4,})$`, 'i');
      all.forEach(p => {
        if (!p || !p.sku) return;
        const m = p.sku.trim().match(regex);
        if (m) {
          const val = parseInt(m[1], 10);
          if (!isNaN(val) && val > maxSeq) {
            maxSeq = val;
          }
        }
      });
      const nextSeq = maxSeq + 1;
      return `NX-${catCode}-${String(nextSeq).padStart(4, '0')}`;
    },

    // Add new product (Instant Local + Realtime Broadcast + MongoDB Cloud API)
    addProduct: async function(productData) {
      const all = this.getAll();
      const id = productData.id || ('nx-' + (productData.category || 'item') + '-' + Date.now().toString(36));
      
      const priceCalc = this.calculatePrice(productData.price, productData.discountPercent);
      const catCode = {
        'shirts': 'SH',
        'trousers': 'TR',
        'shoes': 'SN',
        'bags': 'BG'
      }[productData.category] || (productData.category || 'it').substring(0, 2).toUpperCase();
      const sku = (productData.sku && productData.sku.trim())
        ? productData.sku.trim()
        : this.getNextSku(productData.category);

      const newProduct = {
        id: id,
        title: productData.title || 'Untitled Nexus Piece',
        category: productData.category || 'shirts',
        categoryLabel: productData.categoryLabel || this.getCategoryLabel(productData.category),
        price: priceCalc.regular,
        discountPercent: priceCalc.discount,
        sku: sku,
        stock: parseInt(productData.stock) || 20,
        sizes: productData.sizes || (productData.category === 'shoes' ? ['40', '41', '42', '43', '44', '45', '46'] : ['S', 'M', 'L', 'XL']),
        image: productData.image || productData.frontView || 'rail_assets/shirts/shirt_beige_utility.jpg',
        frontView: productData.frontView || productData.image || '',
        sideView: (productData.sideView && productData.sideView.trim())
          ? productData.sideView
          : (productData.frontView || productData.image || ''),
        hangerType: productData.hangerType || 'master_front_hanger_official.png',
        hangerDefault: productData.hangerDefault !== false,
        orbitImages: productData.orbitImages || [productData.image],
        description: productData.description || 'Exclusive handcrafted runway piece tailored for contemporary streetwear connoisseurs.',
        badge: productData.badge || (priceCalc.discount > 0 ? `Sale ${priceCalc.discount}%` : 'New In'),
        createdAt: new Date().toISOString()
      };

      // Persist directly to MongoDB Atlas
      if (typeof fetch !== 'undefined') {
        try {
          const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProduct)
          });
          const data = await res.json();
          if (data && data.product) {
            Object.assign(newProduct, data.product);
            console.log('[NexusCatalog] Product successfully saved to MongoDB Atlas:', data.product);
          }
        } catch (err) {
          console.warn('[NexusCatalog] Cloud save error:', err);
        }
      }

      all.unshift(newProduct);
      this.saveAll(all, false);

      return newProduct;
    },

    // Update existing product
    updateProduct: async function(id, updates) {
      const all = this.getAll();
      const idx = all.findIndex(p => p.id === id);
      if (idx === -1) return null;

      if (updates.price !== undefined || updates.discountPercent !== undefined) {
        const reg = updates.price !== undefined ? updates.price : all[idx].price;
        const disc = updates.discountPercent !== undefined ? updates.discountPercent : all[idx].discountPercent;
        const priceCalc = this.calculatePrice(reg, disc);
        updates.price = priceCalc.regular;
        updates.discountPercent = priceCalc.discount;
      }

      if (typeof fetch !== 'undefined') {
        try {
          const res = await fetch('/api/products/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          });
          const data = await res.json();
          if (data && data.product) {
            Object.assign(updates, data.product);
          }
        } catch (err) {
          console.warn('[NexusCatalog] Cloud update error:', err);
        }
      }

      all[idx] = Object.assign({}, all[idx], updates, { updatedAt: new Date().toISOString() });
      this.saveAll(all, false);

      return all[idx];
    },

    // Delete product
    deleteProduct: async function(id) {
      if (typeof fetch !== 'undefined') {
        try {
          await fetch('/api/products/' + id, { method: 'DELETE' });
        } catch (err) {
          console.warn('[NexusCatalog] Cloud delete error:', err);
        }
      }

      const all = this.getAll();
      const filtered = all.filter(p => p.id !== id);
      this.saveAll(filtered, false);

      return true;
    },

    // Set discount percentage for a product
    setDiscount: function(id, discountPercent) {
      return this.updateProduct(id, { discountPercent: discountPercent });
    },

    // Batch apply discount across a category
    applyCategoryDiscount: function(category, discountPercent) {
      const all = this.getAll();
      const updated = all.map(p => {
        if (category === 'all' || p.category === category) {
          const calc = this.calculatePrice(p.price, discountPercent);
          return Object.assign({}, p, { discountPercent: calc.discount });
        }
        return p;
      });
      this.saveAll(updated, true); // sync batch to cloud
      return updated;
    },

    // Reset to defaults
    resetToDefaults: function() {
      this.saveAll(DEFAULT_PRODUCTS);
      return DEFAULT_PRODUCTS;
    },

    getCategoryLabel: function(cat) {
      switch(cat) {
        case 'shirts': return 'Shirts & Tops';
        case 'trousers': return 'Trousers & Denim';
        case 'shoes': return 'Footwear & Sneakers';
        case 'bags': return 'Bags & Accessories';
        default: return 'Atelier Collection';
      }
    },

    // Orders Management
    getOrders: function() {
      try {
        const stored = localStorage.getItem(ORDERS_KEY);
        if (stored) return JSON.parse(stored);
      } catch (e) {
        console.warn('Error reading orders', e);
      }
      return [
        {
          id: 'NX-ORD-98214',
          customerName: 'Kavindu Senanayake',
          customerEmail: 'kavindu.s@gmail.com',
          phone: '+94 77 123 4567',
          address: 'No 45, Flower Road, Colombo 07',
          items: [
            { id: 'shirt-beige-utility', title: 'Beige Double Pocket Casual Utility Shirt', size: 'M', quantity: 1, price: 109.65 }
          ],
          paymentMethod: 'bank_receipt',
          paymentStatus: 'Pending Verification',
          total: 109.65,
          slipImage: 'assets/nexus-logo-true-alpha.png',
          date: '2026-11-22T08:10:00Z',
          status: 'Under Review'
        },
        {
          id: 'NX-ORD-98213',
          customerName: 'Ashan Dilshan',
          customerEmail: 'ashan.dil@outlook.com',
          phone: '+94 71 987 6543',
          address: 'Villa 12, Kandy Road, Kadawatha',
          items: [
            { id: 'shoe-luka-5', title: 'Luka 5 Performance Orbit Runner', size: '42', quantity: 1, price: 149.00 }
          ],
          paymentMethod: 'card',
          paymentStatus: 'Paid (SSL)',
          total: 149.00,
          date: '2026-11-22T07:45:00Z',
          status: 'Processing'
        },
        {
          id: 'NX-ORD-98212',
          customerName: 'Tharaka Perera',
          customerEmail: 'tharaka.p@yahoo.com',
          phone: '+94 76 555 8899',
          address: 'Beach Road, Galle Fort, Galle',
          items: [
            { id: 'trouser-black-denim', title: 'Washed Black Denim Wide-Leg Cargo Jeans', size: 'L', quantity: 1, price: 130.50 }
          ],
          paymentMethod: 'cod',
          paymentStatus: 'COD Scheduled',
          total: 130.50,
          date: '2026-11-22T06:30:00Z',
          status: 'Dispatched'
        }
      ];
    },

    saveOrders: function(orders) {
      try {
        localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
        window.dispatchEvent(new CustomEvent('nexus_orders_updated', { detail: { orders: orders } }));
      } catch (e) {}
    },

    updateOrderStatus: function(orderId, newStatus) {
      const orders = this.getOrders();
      const target = orders.find(o => o.id === orderId);
      if (target) {
        target.status = newStatus;
        this.saveOrders(orders);
        return true;
      }
      return false;
    }
  };

  // Expose globally
  window.NexusCatalog = NexusCatalog;

  // Multi-tab listeners
  if (catalogBroadcast) {
    catalogBroadcast.onmessage = function(ev) {
      if (ev.data && ev.data.type === 'catalog_updated') {
        const fresh = NexusCatalog.getAll();
        window.dispatchEvent(new CustomEvent('nexus_catalog_updated', { detail: { items: fresh } }));
      }
    };
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', function(e) {
      if (e.key === STORAGE_KEY || e.key === 'nexus_catalog_sync_time') {
        const fresh = NexusCatalog.getAll();
        window.dispatchEvent(new CustomEvent('nexus_catalog_updated', { detail: { items: fresh } }));
      }
    });

    // Re-sync with cloud on window focus or visibility change
    window.addEventListener('focus', function() {
      NexusCatalog.syncWithCloud();
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) NexusCatalog.syncWithCloud();
      });
    }

    // Periodic background cloud sync every 5 seconds
    setInterval(function() {
      NexusCatalog.syncWithCloud();
    }, 5000);

    NexusCatalog.syncWithCloud();
    setTimeout(() => NexusCatalog.syncWithCloud(), 800);
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
