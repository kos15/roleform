import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // F26: the QuickJS sandbox loads its WebAssembly from its own package
  // directory at runtime. Bundling it would sever that path, so it is required
  // from node_modules as-is, and the .wasm is traced into every analysis route
  // (the server actions that run code execute under those routes).
  serverExternalPackages: ["quickjs-emscripten", "quickjs-emscripten-core"],
  outputFileTracingIncludes: {
    "/analysis/**": ["./node_modules/.pnpm/@jitl+quickjs-wasmfile-release-sync@*/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/*.wasm"],
  },
  // The palette picker was retired with the single marigold palette. Old links
  // land on the profile, which is where the account's settings live.
  async redirects() {
    return [{ source: "/appearance", destination: "/profile", permanent: true }];
  },
};

export default nextConfig;
