/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // This is the CRITICAL missing piece for Railway
  experimental: {
    trustHostHeader: true,
  },
}

export default nextConfig