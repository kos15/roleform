import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The palette picker was retired with the single marigold palette. Old links
  // land on the profile, which is where the account's settings live.
  async redirects() {
    return [{ source: "/appearance", destination: "/profile", permanent: true }];
  },
};

export default nextConfig;
