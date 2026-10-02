/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  // Match the tailwind v4 config so classes still sort correctly.
  tailwindStylesheet: "./src/app/globals.css",
};

export default config;
