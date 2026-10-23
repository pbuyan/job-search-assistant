import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // pdf.js loads its worker from a file next to itself; bundled, that file
  // is missing and every PDF fails. Load these from node_modules instead.
  // @napi-rs/canvas is native and provides pdf.js's DOM polyfills on the server.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // The PDF export reads its font files from disk at runtime, which the
  // bundler can't see; ship them with the routes that render PDFs.
  outputFileTracingIncludes: {
    "/api/resumes/[id]/export": ["./src/features/export/fonts/*"],
    "/api/profile/export": ["./src/features/export/fonts/*"],
    // Attaching a resume to an application keeps a PDF of it (server action).
    "/[locale]/tracker/[id]": ["./src/features/export/fonts/*"],
  },
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
