/** @type {import('next').NextConfig} */
const nextConfig = {
<<<<<<< HEAD
  allowedDevOrigins: ["127.0.0.1", "**.replit.dev"],

  // Strip console.* from production bundles (keep console.error for real failures).
  compiler: {
    removeConsole: { exclude: ["error"] },
=======
  typescript: {
    ignoreBuildErrors: true,
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
  },

  images: {
    unoptimized: true,
  },

<<<<<<< HEAD
  // Keep production builds within the memory limits of small Replit containers.
  experimental: {
    cpus: 1,
  },

  transpilePackages: ['niimbot-web-bluetooth'],

  // Expose the route-group pages under /crm while keeping their short paths
  // available. Do not redirect those short paths back to /crm.
  async rewrites() {
    return [
      { source: '/manifest.json', destination: '/manifest.webmanifest' },
      { source: '/crm/pos', destination: '/pos' },
      { source: '/crm/showcase', destination: '/showcase' },
      { source: '/crm/inventory', destination: '/inventory' },
      { source: '/crm/customers', destination: '/customers' },
      { source: '/crm/reports', destination: '/reports' },
      { source: '/crm/stores', destination: '/stores' },
      { source: '/crm/notifications', destination: '/notifications' },
      { source: '/crm/suppliers', destination: '/suppliers' },
      { source: '/crm/cabinet', destination: '/cabinet' },
      { source: '/crm/money', destination: '/money' },
    ]
  },

  // async redirects() {
  //   return [
  //     { source: '/', destination: '/crm', permanent: false },
  //   ]
  // },
=======
  allowedDevOrigins: [
    '192.168.1.176',
  ],
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
}

export default nextConfig