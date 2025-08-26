/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true, experimental: { serverActions: { bodySizeLimit: '20mb' } } };
export default nextConfig;
