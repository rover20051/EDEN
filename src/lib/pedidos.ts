import { etiquetaSalida, type Estado, type MotivoSalida, type QuienSalida } from "@/lib/textos";
import { ars, numeroPedido } from "@/lib/format";

export type PedidoFila = {
  id: string;
  numero: number;
  estado: Estado;
  /** "salida" = sale sin cobrarse (regalo de Edén, influencer, reposición). */
  tipo: "venta" | "salida";
  salida_motivo: MotivoSalida | null;
  salida_por: QuienSalida | null;
  canal: string;
  medio_pago: string;
  total: number;
  grabado: string | null;
  nota: string | null;
  es_regalo: boolean;
  regalo_para: string | null;
  regalo_mensaje: string | null;
  direccion_envio: string | null;
  vence_at: string | null;
  created_at: string;
  pagado_at: string | null;
  despachado_at: string | null;
  entregado_at: string | null;
  cliente: { nombre: string; whatsapp: string | null; email: string | null };
  items: { cantidad: number; pack_id: string | null; producto: { nombre: string }; pack: { nombre: string } | null }[];
  pagos: { estado: string; medio: string; comprobante_path: string | null }[];
  envio: { empresa: string; seguimiento: string | null; costo_real: number } | null;
};

/** Select de Supabase que arma un PedidoFila. */
export const SELECT_PEDIDO = `
  id, numero, estado, tipo, salida_motivo, salida_por, canal, medio_pago, total, grabado, nota, es_regalo, regalo_para, regalo_mensaje, direccion_envio, vence_at, created_at, pagado_at, despachado_at, entregado_at,
  cliente:clientes!inner(nombre, whatsapp, email),
  items:pedido_items(cantidad, pack_id, producto:productos(nombre), pack:packs(nombre)),
  pagos(estado, medio, comprobante_path),
  envio:envios(empresa, seguimiento, costo_real)
`;

type ItemResumen = { cantidad: number; pack_id?: string | null; producto: { nombre: string }; pack?: { nombre: string } | null };

/**
 * Líneas del pedido con los packs agrupados: las piezas de un mismo pack se muestran como una sola línea.
 * La cantidad del pack es la menor de sus piezas (un pack lleva una o más unidades de cada producto).
 */
export function lineasAgrupadas<T extends ItemResumen>(items: T[]) {
  const sueltos: T[] = [];
  const packs = new Map<string, { nombre: string; cantidad: number; items: T[] }>();
  for (const i of items) {
    if (!i.pack_id) {
      sueltos.push(i);
      continue;
    }
    const g = packs.get(i.pack_id) ?? { nombre: i.pack?.nombre ?? "Pack", cantidad: i.cantidad, items: [] };
    g.cantidad = Math.min(g.cantidad, i.cantidad);
    g.items.push(i);
    packs.set(i.pack_id, g);
  }
  return { sueltos, packs: [...packs.entries()].map(([id, g]) => ({ id, ...g })) };
}

export const resumenItems = (p: { items: ItemResumen[] }) => {
  const { sueltos, packs } = lineasAgrupadas(p.items);
  const texto = (cantidad: number, nombre: string) => `${cantidad > 1 ? `${cantidad}× ` : ""}${nombre}`;
  return [...packs.map((g) => texto(g.cantidad, g.nombre)), ...sueltos.map((i) => texto(i.cantidad, i.producto.nombre))].join(" + ");
};

export const esSalida = (p: { tipo?: string | null }) => p.tipo === "salida";

/** Chip de una salida: "Sin cobro · Regalo de Nari". */
export const chipSalida = (p: Pick<PedidoFila, "salida_motivo" | "salida_por">) => `Sin cobro · ${etiquetaSalida(p.salida_motivo, p.salida_por)}`;

export const tieneComprobante = (p: Pick<PedidoFila, "pagos">) => p.pagos.some((g) => g.estado === "comprobante_recibido");

export const vencido = (p: Pick<PedidoFila, "vence_at" | "estado">) =>
  p.estado === "pendiente_pago" && !!p.vence_at && new Date(p.vence_at) < new Date();

/** Despachado hace más de 7 días sin marcar como entregado. */
export const demorado = (p: Pick<PedidoFila, "estado" | "despachado_at">) =>
  p.estado === "despachado" && !!p.despachado_at && Date.now() - new Date(p.despachado_at).getTime() > 7 * 24 * 3600 * 1000;

/** Mensaje de WhatsApp listo para mandar según en qué estado está el pedido. */
export function mensajeWhatsApp(p: PedidoFila, alias: string) {
  const nombre = p.cliente.nombre.split(" ")[0];
  const num = numeroPedido(p.numero);
  if (esSalida(p)) {
    // Una salida no se cobra: nada de montos ni "recibimos el pago".
    if (p.estado === "despachado")
      return `¡Hola ${nombre}! Tu regalo de Edén ya está en camino${p.envio ? ` por ${p.envio.empresa}${p.envio.seguimiento ? `, seguimiento ${p.envio.seguimiento}` : ""}` : ""}. ¡Avisanos cuando te llegue! 🤎`;
    return `¡Hola ${nombre}! Te escribimos de Edén: te estamos preparando un regalo hecho a mano (${resumenItems(p)}). ¿Nos confirmás la dirección de envío? 🤎`;
  }
  switch (p.estado) {
    case "pendiente_pago":
      return p.medio_pago === "transferencia"
        ? `¡Hola ${nombre}! Gracias por tu pedido ${num} en Edén (${resumenItems(p)}). Para confirmarlo, transferí ${ars(p.total)} al alias ${alias || "—"} y mandanos el comprobante por acá. 🙌`
        : `¡Hola ${nombre}! Te escribimos por tu pedido ${num} en Edén (${resumenItems(p)}), total ${ars(p.total)}.`;
    case "pagado":
    case "en_preparacion":
      return `¡Hola ${nombre}! Recibimos el pago de tu pedido ${num}. Ya lo estamos preparando a mano. 🤎`;
    case "despachado":
      return `¡Hola ${nombre}! Tu pedido ${num} ya está en camino${p.envio ? ` por ${p.envio.empresa}${p.envio.seguimiento ? `, seguimiento ${p.envio.seguimiento}` : ""}` : ""}. ¿Te llegó bien?`;
    default:
      return `¡Hola ${nombre}! Te escribimos de Edén por tu pedido ${num}.`;
  }
}
