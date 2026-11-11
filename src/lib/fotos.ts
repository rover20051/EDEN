// Fotos reales de la web (public/img): solo las Biblias que ya existen. El resto queda sin foto hasta que se suba desde Productos.
const FOTOS: Record<string, string> = {
  "Biblia Origen": "/img/54891cba382d.jpg",
  "Biblia Anaj": "/img/4cfd5f11059c.jpg",
  "Biblia Habitación": "/img/df00104fe040.jpg",
};
const SIN_FOTO = "/marca/sin-foto.svg";

/** Foto a partir del nombre del producto ("Biblia Anaj") o del diseño de una Biblia ("Anaj"). */
export const fotoDe = (nombre: string) => FOTOS[nombre] ?? FOTOS[`Biblia ${nombre}`] ?? SIN_FOTO;

/** URL pública de un archivo del bucket "productos" (sirve en el servidor y en el navegador). */
export function urlFotoPublica(path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/productos/${path}`;
}

/** Foto subida desde el back office si existe; si no, la de siempre del diseño. */
export const fotoProducto = (nombre: string, fotoPath?: string | null) => urlFotoPublica(fotoPath) ?? fotoDe(nombre);

/** Fotos de productos y packs: solo imágenes comunes y hasta 5 MB. */
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

/** Mira los primeros bytes (no confía en el nombre ni en el tipo que manda el navegador). */
export function tipoRealFoto(b: Uint8Array): "jpg" | "png" | "webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  return null;
}

export const MIME_FOTO = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
