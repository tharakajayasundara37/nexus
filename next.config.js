/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      { source: '/index.html', destination: '/' },
      { source: '/shirts.html', destination: '/shirts' },
      { source: '/trousers.html', destination: '/trousers' },
      { source: '/shoes.html', destination: '/shoes' },
      { source: '/bags.html', destination: '/bags' },
      { source: '/admin.html', destination: '/admin' },
      { source: '/admin/rail_assets/:path*', destination: '/rail_assets/:path*' },
      { source: '/cart/add.js', destination: '/api/cart/add' },
      { source: '/cart/add', destination: '/api/cart/add' },
      { source: '/cart.js', destination: '/api/cart' },
      { source: '/cart', destination: '/api/cart' },
    ];
  },
};

module.exports = nextConfig;
