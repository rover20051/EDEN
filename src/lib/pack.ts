// Compartido entre servidor y navegador (sin "server-only").

/** En el carrito y en el checkout un pack se identifica como "pack:<slug>". */
export const PREFIJO_PACK = "pack:";

/** Lo más que se puede pedir de un mismo producto en una compra de la web, contando lo que viene dentro de los sets. */
export const MAXIMO_POR_PERSONA = 10;

type ItemPedido = { producto_id: string; cantidad: number } | { pack_id: string; cantidad: number };

/** ¿Algún producto del pedido, suelto más lo que traen sus sets, pasa el máximo? */
export function superaMaximo(items: ItemPedido[], contenido: Map<string, { producto_id: string; cantidad: number }[]>) {
  const total = new Map<string, number>();
  for (const i of items) {
    const piezas = "pack_id" in i ? (contenido.get(i.pack_id) ?? []) : [{ producto_id: i.producto_id, cantidad: 1 }];
    for (const p of piezas) total.set(p.producto_id, (total.get(p.producto_id) ?? 0) + p.cantidad * i.cantidad);
  }
  return [...total.values()].some((n) => n > MAXIMO_POR_PERSONA);
}
