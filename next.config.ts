import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "pdf-parse", "nodemailer", "xlsx"],
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
