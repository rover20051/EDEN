import type { NextConfig } from "next";

// El back office es 100% dinámico (datos por usuario), así que usamos el modelo clásico sin Cache Components.
const nextConfig: NextConfig = {
  // La web pública sigue siendo el HTML original (public/index.html) hasta migrarla a componentes.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/index.html" }], afterFiles: [], fallback: [] };
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
