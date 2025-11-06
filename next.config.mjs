/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  // Performance optimizations
  swcMinify: true,

  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // Optimize package imports to reduce bundle size
    optimizePackageImports: ['@tensorflow/tfjs', 'exceljs'],
  },

  typescript: {
    // Temporarily ignore TypeScript errors during build for TensorFlow.js compatibility
    ignoreBuildErrors: true,
  },

  // Webpack optimizations for faster compilation
  webpack: (config, { isServer, dev }) => {
    // Optimize TensorFlow.js imports
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }

    // Speed up development compilation
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }

    // Reduce memory usage during compilation
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          // Vendor chunk for node_modules
          vendor: {
            name: 'vendor',
            chunks: 'all',
            test: /node_modules/,
            priority: 20,
          },
          // Separate chunk for large libraries
          tensorflow: {
            name: 'tensorflow',
            test: /@tensorflow/,
            chunks: 'all',
            priority: 30,
          },
          exceljs: {
            name: 'exceljs',
            test: /exceljs/,
            chunks: 'all',
            priority: 30,
          },
        },
      },
    };

    return config;
  },
};

export default nextConfig;
