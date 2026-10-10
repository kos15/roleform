import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // F26: the QuickJS sandbox loads its WebAssembly from its own package
  // directory at runtime. Bundling it would sever that path, so it is required
  // from node_modules as-is, and the .wasm is traced into every analysis route
  // (the server actions that run code execute under those routes).
  // word-extractor reads OLE files through Node's fs/stream APIs; it runs as a
  // plain Node module rather than being bundled.
  serverExternalPackages: ["quickjs-emscripten", "quickjs-emscripten-core", "word-extractor"],
  // Server Actions default to a 1 MB body. Résumé uploads (FormData) and JD
  // uploads (base64) are allowed up to 4 MB, so anything over 1 MB used to fail
  // before our own size check could explain why. Vercel's own ceiling is 4.5 MB.
  experimental: {
    serverActions: { bodySizeLimit: "4.5mb" },
  },
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
