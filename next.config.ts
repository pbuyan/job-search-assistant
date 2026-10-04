import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // pdf.js loads its worker from a file next to itself; bundled, that file
  // is missing and every PDF fails. Load these from node_modules instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
