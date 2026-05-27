// HABA AI Commerce · Next.js config.
// i18n via next-intl (locale negotiated at request time, see src/lib/i18n/request.ts).
// `output: "standalone"` → minimal runtime image; matches netstars/token/console/Dockerfile.

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
