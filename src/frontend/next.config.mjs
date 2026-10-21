/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep local builds within the shared development machine's memory budget.
  experimental: { cpus: 2 },
};

export default nextConfig;
