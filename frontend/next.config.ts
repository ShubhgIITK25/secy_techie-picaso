import type { NextConfig } from "next";

const apiProxyUrl = process.env.NEXT_PRIVATE_API_PROXY_URL ?? "http://127.0.0.1:8088";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
