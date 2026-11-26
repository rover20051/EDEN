import type { NextConfig } from "next";

// Para todo el sitio: nadie de afuera puede meterlo en un marco, ni el link privado de un pedido viaja a otras páginas.
const GENERALES = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];
const NO_INDEXAR = { key: "X-Robots-Tag", value: "noindex, nofollow" };
// El back office y el ingreso: en ningún marco y fuera de los buscadores.
const PRIVADAS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "same-origin" },
  NO_INDEXAR,
];

// El back office es 100% dinámico (datos por usuario), así que usamos el modelo clásico sin Cache Components.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: GENERALES },
      ...["/admin/:path*", "/login", "/api/admin/:path*"].map((source) => ({ source, headers: PRIVADAS })),
      ...["/pedido/:path*", "/checkout"].map((source) => ({ source, headers: [NO_INDEXAR] })),
    ];
  },
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
