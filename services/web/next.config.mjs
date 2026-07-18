/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // The browser calls a relative "/api" (see lib/api-client.ts) so it always
  // targets its own origin — correct behind a single Ingress that path-routes
  // /api to core-api in K8s (this rewrite never fires there; Ingress
  // intercepts /api before it reaches this container). It DOES matter for
  // any setup with no reverse proxy in front of this Next server — bare
  // `next dev`, or docker-compose where core-api is a separate container —
  // where this proxies /api/* to core-api directly. Server-only config
  // (CORE_API_PROXY_URL, not NEXT_PUBLIC_*), so it's never baked into the
  // client bundle.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.CORE_API_PROXY_URL || "http://localhost:8080"}/api/:path*`,
      },
    ]
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
    ]
  },
}

export default nextConfig
