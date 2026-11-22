import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

await esbuild.build({
  entryPoints: [path.join(rootDir, "src/server.ts")],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  alias: {
    "next/headers": path.join(rootDir, "src/shims/next-headers.ts"),
    "next/cache": path.join(rootDir, "src/shims/next-cache.ts"),
    "next/server": path.join(rootDir, "src/shims/next-server.ts"),
    "next/navigation": path.join(rootDir, "src/shims/next-navigation.tsx"),
    "next/link": path.join(rootDir, "src/shims/next-link.tsx"),
    "next/dynamic": path.join(rootDir, "src/shims/next-dynamic.tsx"),
    "next/image": path.join(rootDir, "src/shims/next-image.tsx"),
    "@": path.join(rootDir, "src"),
  },
  outfile: path.join(rootDir, "dist/server.mjs"),
  banner: {
    js: `if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}`,
  },
});

console.log("✓ Server bundled successfully to dist/server.mjs");
