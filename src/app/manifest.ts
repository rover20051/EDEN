import type { MetadataRoute } from "next";

// Permite instalar el back office como app en el celular.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Edén · Back office",
    short_name: "Edén",
    start_url: "/admin",
    display: "standalone",
    background_color: "#f3ebe0",
    theme_color: "#f3ebe0",
    icons: [
      { src: "/marca/app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/app-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
