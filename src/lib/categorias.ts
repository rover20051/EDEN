import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoProducto = "biblia" | "journal" | "otro";
export type Categoria = { slug: string; nombre: string };

/** Valor del selector de "Nuevo producto" para crear una categoría en el momento. */
export const CATEGORIA_NUEVA = "nueva";

/** Nombre para mostrar: "Biblia", "Journal" o el de su categoría. */
export function nombreTipo(tipo: TipoProducto, categoria?: string | null) {
  return tipo === "biblia" ? "Biblia" : tipo === "journal" ? "Journal" : categoria || "Otros";
}

/**
 * Categorías y a cuál pertenece cada producto. Va aparte de la consulta de productos:
 * sin la migración 0007 devuelve todo vacío y el resto del back office y la tienda siguen andando.
 */
export async function categoriasDeProductos(sb: SupabaseClient) {
  const [{ data: categorias, error }, { data: productos }] = await Promise.all([
    sb.from("categorias").select("slug, nombre").order("orden"),
    sb.from("productos").select("id, categoria"),
  ]);
  const lista = (categorias ?? []) as Categoria[];
  const porSlug = new Map(lista.map((c) => [c.slug, c]));
  const dePorId = new Map<string, Categoria>();
  for (const p of (productos ?? []) as { id: string; categoria: string | null }[]) {
    const c = p.categoria ? porSlug.get(p.categoria) : undefined;
    if (c) dePorId.set(p.id, c);
  }
  return { disponibles: !error, lista, dePorId };
}
