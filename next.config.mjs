/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverActions: { bodySizeLimit: '20mb' }
  },
  typescript: {
    // Temporarily ignore TypeScript errors during build for TensorFlow.js compatibility
    ignoreBuildErrors: true,
  }
};
export default nextConfig;
