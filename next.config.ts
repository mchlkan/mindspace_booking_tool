import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite ships WebAssembly + data files; load it from node_modules at
  // runtime instead of bundling it. (Only used in local development.)
  serverExternalPackages: ["@electric-sql/pglite"],
  // Uploaded banners/photos: phones resize them first, 3 MB leaves headroom.
  experimental: { serverActions: { bodySizeLimit: "3.2mb" } },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
