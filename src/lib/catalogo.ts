import "server-only";
import { urlFotoPublica } from "@/lib/fotos";
import { supabaseServidor } from "@/lib/supabase/servidor";

export type ProductoPublico = {
  slug: string;
  nombre: string;
  tipo: "biblia" | "journal";
  diseno: string;
  precio: number;
  precio_anterior: number | null;
  etiqueta: string | null;
  descripcion: string | null;
  verbo: string | null;
  /** Foto subida desde el back office (null = la web usa sus fotos de siempre). */
  foto_url: string | null;
  activo: boolean;
  stock: number;
};

/** Pack: precio propio, sin stock propio (alcanza mientras alcancen sus productos). En el carrito se identifica como "pack:<slug>". */
export type PackPublico = {
  slug: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  precio_anterior: number | null;
  etiqueta: string | null;
  foto_url: string | null;
  activo: boolean;
  stock: number;
  items: { slug: string; cantidad: number }[];
};

export type CatalogoPublico = {
  precio_set: number;
  productos: ProductoPublico[];
  packs: PackPublico[];
  /** Envío por provincia (null = a coordinar) y desde qué monto es gratis. */
  envio: { tarifas: Record<string, number>; gratis_desde: number | null };
};

export { PREFIJO_PACK } from "@/lib/pack";

/** URL pública de una foto del bucket "productos". */
export const urlFoto = (path: string | null) => urlFotoPublica(path);

type FilaProducto = {
  id: string;
  slug: string;
  nombre: string;
  tipo: "biblia" | "journal";
  diseno: string;
  precio: number;
  precio_anterior: number | null;
  etiqueta: string | null;
  activo: boolean;
  descripcion?: string | null;
  verbo?: string | null;
  foto_path?: string | null;
};

type FilaPack = {
  slug: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  precio_anterior: number | null;
  etiqueta: string | null;
  foto_path: string | null;
  activo: boolean;
  pack_items: { cantidad: number; producto_id: string }[] | null;
};

/**
 * Stock que alcanza para armar un pack: el mínimo entre sus productos (según cuántas unidades lleva de cada uno).
 * Sin productos no hay pack.
 */
export function stockDePack(items: { producto_id: string; cantidad: number }[], disponibles: Map<string, number>) {
  if (!items.length) return 0;
  return Math.max(0, Math.min(...items.map((i) => Math.floor((disponibles.get(i.producto_id) ?? 0) / i.cantidad))));
}

const COLUMNAS_BASE = "id, slug, nombre, tipo, diseno, precio, precio_anterior, etiqueta, activo";

/** Lo que la web pública puede saber del catálogo: precio, stock y si está a la venta. Nunca costos. */
export async function catalogoPublico(): Promise<CatalogoPublico> {
  const sb = supabaseServidor();
  const [completo, { data: stock }, { data: ajustes }, packsRes] = await Promise.all([
    sb.from("productos").select(`${COLUMNAS_BASE}, descripcion, verbo, foto_path`).order("orden"),
    sb.from("v_stock").select("producto_id, disponibles"),
    sb.from("ajustes").select("*").eq("id", 1).single(),
    sb
      .from("packs")
      .select("slug, nombre, descripcion, precio, precio_anterior, etiqueta, foto_path, activo, orden, pack_items(cantidad, producto_id)")
      .order("orden"),
  ]);
  let productos = completo.data as FilaProducto[] | null;
  if (completo.error) {
    // Mientras no se corra la migración 0006 la tienda sigue andando con los datos de siempre (sin fotos ni packs).
    const base = await sb.from("productos").select(COLUMNAS_BASE).order("orden");
    if (base.error) throw new Error(base.error.message);
    productos = base.data as FilaProducto[];
  }
  const disp = new Map((stock ?? []).map((s) => [s.producto_id as string, Math.max(0, s.disponibles as number)]));
  const porId = new Map((productos ?? []).map((p) => [p.id, p]));
  const packs = (packsRes.error ? [] : (packsRes.data ?? [])) as FilaPack[];

  return {
    precio_set: (ajustes?.precio_set as number) ?? 0,
    productos: (productos ?? []).map(({ id, foto_path, descripcion, verbo, ...p }) => ({
      ...p,
      descripcion: descripcion ?? null,
      verbo: verbo ?? null,
      foto_url: urlFoto(foto_path ?? null),
      stock: disp.get(id) ?? 0,
    })),
    packs: packs.map(({ foto_path, pack_items, ...k }) => {
      const items = pack_items ?? [];
      const todosActivos = items.every((i) => porId.get(i.producto_id)?.activo);
      return {
        slug: k.slug,
        nombre: k.nombre,
        descripcion: k.descripcion,
        precio: k.precio,
        precio_anterior: k.precio_anterior,
        etiqueta: k.etiqueta,
        activo: k.activo && todosActivos && items.length > 0,
        foto_url: urlFoto(foto_path),
        stock: stockDePack(items, disp),
        items: items.map((i) => ({ slug: porId.get(i.producto_id)?.slug as string, cantidad: i.cantidad })),
      };
    }),
    envio: {
      tarifas: (ajustes?.envio_tarifas as Record<string, number> | undefined) ?? {},
      gratis_desde: (ajustes?.envio_gratis_desde as number | null | undefined) ?? null,
    },
  };
}
