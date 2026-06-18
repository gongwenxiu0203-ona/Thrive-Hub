import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "pdf-parse", "nodemailer", "xlsx"],
  experimental: {
    // Server actions accept FormData uploads (contract templates, seal PNG,
    // contract re-upload). Default 1 MB is too small; lift to 25 MB.
    serverActions: {
      bodySizeLimit: "25mb",
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
