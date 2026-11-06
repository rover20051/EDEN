"use server";

import { after } from "next/server";
import { z } from "zod";
import { ars } from "@/lib/format";
import { notificarPedidoNuevo } from "@/lib/mensajes";
import { tarjetaHabilitada } from "@/lib/pagos";
import { esProvincia } from "@/lib/provincias";
import { supabaseServidor } from "@/lib/supabase/servidor";
import { estadoVenta } from "@/lib/venta";
import { PREFIJO_PACK } from "@/lib/pack";
import { OBLIGATORIOS } from "./checkout/validar";

const ORIGENES = ["anuncio", "instagram", "tiktok", "recomendacion", "iglesia", "google", "otro"] as const;

const codigoCupon = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,30}$/, "Ese cupón no existe o ya venció");

const checkoutSchema = z.object({
  nombre: z.string().trim().refine((v) => !OBLIGATORIOS.nombre(v), OBLIGATORIOS.nombre("")!),
  email: z.email("Revisá el mail").max(200).transform((e) => e.toLowerCase()),
  whatsapp: z.string().trim().max(40).refine((v) => !OBLIGATORIOS.whatsapp(v), OBLIGATORIOS.whatsapp("")!),
  direccion: z.string().trim().min(5, "Falta la dirección").max(200),
  ciudad: z.string().trim().min(2, "Falta la ciudad").max(100),
  provincia: z.string().refine(esProvincia, "Elegí tu provincia"),
  codigo_postal: z.string().trim().max(10).refine((v) => !OBLIGATORIOS.codigo_postal(v), OBLIGATORIOS.codigo_postal("")!),
  nota: z.string().trim().max(500).optional(),
  origen: z.enum(ORIGENES).optional(),
  medio_pago: z.enum(["transferencia", "nave"]),
  cupon: codigoCupon.optional(),
  regalo: z
    .object({ para: z.string().trim().max(80).optional(), mensaje: z.string().trim().max(300, "El mensaje puede tener hasta 300 letras").optional() })
    .optional(),
  items: z
    .array(z.object({ slug: z.string().min(1).max(80), cantidad: z.number().int().min(1).max(10) }))
    .min(1, "Tu carrito está vacío")
    .max(20),
  web: z.string().max(0).optional(), // trampa para bots: tiene que llegar vacío
});
export type DatosCheckout = z.input<typeof checkoutSchema>;
export type ResultadoCheckout =
  | { ok: true; token: string; numero: number; total: number; pagarConTarjeta: boolean }
  | { ok: false; error: string };

/** Traduce los errores de la base a algo que el cliente entienda. */
function errorPedido(mensaje: string) {
  const sinStock = mensaje.match(/No hay stock de (.+)/);
  if (sinStock) return `Se acaba de agotar ${sinStock[1]}. Sacalo del carrito para seguir.`;
  // "El cupón X ya se usó todas las veces", "El cupón X es para compras desde $15000", "El cupón X no es válido"
  if (mensaje.startsWith("El cupón")) return mensaje.replace(/\$(\d+)/, (_, n) => ars(Number(n))) + ".";
  if (/Pack inexistente|Producto inexistente/.test(mensaje)) return "Algo del carrito ya no está disponible. Volvé al carrito y revisalo.";
  return "No pudimos registrar el pedido. Probá de nuevo.";
}

export async function confirmarPedido(datos: DatosCheckout): Promise<ResultadoCheckout> {
  const parsed = checkoutSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos" };
  const d = parsed.data;
  if ((await estadoVenta()) === "cerrada") return { ok: false, error: "Todavía no abrimos las ventas. ¡Muy pronto!" };
  if (d.medio_pago === "nave" && !(await tarjetaHabilitada())) {
    return { ok: false, error: "El pago con tarjeta se habilita muy pronto. Por ahora podés pagar por transferencia." };
  }

  const sb = supabaseServidor();

  // Freno para abusos: como mucho 3 pedidos sin pagar por mail.
  const { data: cliente } = await sb.from("clientes").select("id").eq("email", d.email).maybeSingle();
  if (cliente) {
    const { count } = await sb
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", cliente.id)
      .eq("estado", "pendiente_pago");
    if ((count ?? 0) >= 3) return { ok: false, error: "Ya tenés pedidos esperando el pago. Escribinos y lo resolvemos juntos." };
  }

  // El carrito trae slugs; la base quiere ids. Los packs llegan como "pack:<slug>".
  const esPack = (slug: string) => slug.startsWith(PREFIJO_PACK);
  const slugsPack = d.items.filter((i) => esPack(i.slug)).map((i) => i.slug.slice(PREFIJO_PACK.length));
  const slugsProducto = d.items.filter((i) => !esPack(i.slug)).map((i) => i.slug);
  const [{ data: productos }, { data: packs }] = await Promise.all([
    slugsProducto.length ? sb.from("productos").select("id, slug").in("slug", slugsProducto) : Promise.resolve({ data: [] }),
    slugsPack.length ? sb.from("packs").select("id, slug").in("slug", slugsPack) : Promise.resolve({ data: [] }),
  ]);
  const idProducto = new Map((productos ?? []).map((p) => [p.slug as string, p.id as string]));
  const idPack = new Map((packs ?? []).map((p) => [p.slug as string, p.id as string]));
  const items: ({ producto_id: string; cantidad: number } | { pack_id: string; cantidad: number })[] = [];
  for (const i of d.items) {
    if (esPack(i.slug)) {
      const id = idPack.get(i.slug.slice(PREFIJO_PACK.length));
      if (!id) return { ok: false, error: "Un pack del carrito ya no está disponible." };
      items.push({ pack_id: id, cantidad: i.cantidad });
    } else {
      const id = idProducto.get(i.slug);
      if (!id) return { ok: false, error: "Un producto del carrito ya no está disponible." };
      items.push({ producto_id: id, cantidad: i.cantidad });
    }
  }

  // El envío no se manda: la base lo calcula por provincia. Precios, descuentos y total también.
  const { data, error } = await sb.rpc("crear_pedido_web", {
    p: {
      cliente: { nombre: d.nombre, email: d.email, whatsapp: d.whatsapp, provincia: d.provincia, origen: d.origen ?? "" },
      medio_pago: d.medio_pago,
      items,
      cupon: d.cupon,
      direccion_envio: [d.direccion, d.ciudad, d.provincia, d.codigo_postal && `CP ${d.codigo_postal}`].filter(Boolean).join(", "),
      nota: d.nota,
      es_regalo: Boolean(d.regalo),
      regalo_para: d.regalo?.para,
      regalo_mensaje: d.regalo?.mensaje,
    },
  });
  if (error) {
    if (!/^(No hay stock|El cupón)/.test(error.message)) console.error("crear_pedido_web", error.message);
    return { ok: false, error: errorPedido(error.message) };
  }
  const pedido = data as { id: string; token: string; numero: number; total: number };
  after(() => notificarPedidoNuevo(pedido.id));
  return { ok: true, token: pedido.token, numero: pedido.numero, total: pedido.total, pagarConTarjeta: d.medio_pago === "nave" };
}

export type CuponPublico = { codigo: string; tipo: "porcentaje" | "monto"; valor: number; minimo: number };
export type ResultadoCupon = { ok: true; cupon: CuponPublico } | { ok: false; error: string };

/** Valida un cupón para mostrar el descuento antes de confirmar. El descuento final lo calcula la base al crear el pedido. */
export async function validarCupon(codigo: string): Promise<ResultadoCupon> {
  const noExiste = { ok: false as const, error: "Ese cupón no existe o ya venció" };
  const c = codigoCupon.safeParse(codigo);
  if (!c.success) return noExiste;
  const { data, error } = await supabaseServidor().rpc("cupon_publico", { p_codigo: c.data });
  if (error) console.error("cupon_publico", error.message);
  if (error || !data) return noExiste;
  return { ok: true, cupon: data as CuponPublico };
}
