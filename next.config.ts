import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "pdf-parse", "nodemailer", "xlsx"],
  experimental: {
    // Allow API route FormData up to the 100 MB contract limit plus multipart overhead.
    middlewareClientMaxBodySize: "110mb",
    // Server actions accept FormData uploads (contract templates, seal PNG,
    // contract re-upload). Keep the same proxy-safe ceiling.
    serverActions: {
      bodySizeLimit: "110mb",
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type checking runs in CI; don't block production builds on TS errors
    // (the affiliate page stub in .next/types has a pre-existing false-positive).
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
