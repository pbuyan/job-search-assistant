import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // pdf.js loads its worker from a file next to itself; bundled, that file
  // is missing and every PDF fails. Load these from node_modules instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  experimental: {
    serverActions: {
      // Default is 1 MB. Kept under Vercel's 4.5 MB request-body cap; resume
      // files are capped at 4 MB (src/features/profile/upload-limits.ts).
      bodySizeLimit: "4mb",
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
