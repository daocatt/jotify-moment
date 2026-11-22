import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

function serverActionsPlugin(): Plugin {
  return {
    name: "vite-plugin-server-actions",
    enforce: "pre",
    transform(code, id, options) {
      if (options?.ssr) return null; // Keep server implementation in SSR
      if (!id.includes("/src/app/actions/")) return null;

      const exportNames: string[] = [];
      const regex = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)|export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/g;
      let match;
      while ((match = regex.exec(code)) !== null) {
        const name = match[1] || match[2];
        if (name && !exportNames.includes(name)) {
          exportNames.push(name);
        }
      }

      if (exportNames.length === 0) return null;

      const clientCode = `
import { invokeAction } from "@/shims/client-actions";
${exportNames
  .map(
    (name) =>
      `export const ${name} = (...args) => invokeAction("${name}", args);`
  )
  .join("\n")}
`;
      return { code: clientCode, map: null };
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    serverActionsPlugin(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/link": path.resolve(__dirname, "./src/shims/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "./src/shims/next-navigation.tsx"),
      "next/dynamic": path.resolve(__dirname, "./src/shims/next-dynamic.tsx"),
      "next/image": path.resolve(__dirname, "./src/shims/next-image.tsx"),
      "next/cache": path.resolve(__dirname, "./src/shims/next-cache.ts"),
      "next/headers": path.resolve(__dirname, "./src/shims/next-headers.ts"),
      "next/server": path.resolve(__dirname, "./src/shims/next-server.ts"),
    },
  },
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    target: "esnext",
    minify: true,
    outDir: isSsrBuild ? "dist/server" : "dist/client",
    rollupOptions: isSsrBuild
      ? {
          input: "src/entry-server.tsx",
        }
      : undefined,
  },
}));
