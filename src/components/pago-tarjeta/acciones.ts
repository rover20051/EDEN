"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { notificarPagoConfirmado, notificarPedidoNuevo } from "@/lib/mensajes";
import { modoPago } from "@/lib/pagos";
import { supabaseServidor } from "@/lib/supabase/servidor";
import { TARJETAS_PRUEBA, soloDigitos, validarTarjeta, type DatosTarjeta } from "./tarjeta";

export type ResultadoPago = { ok: true } | { ok: false; error: string };

const tarjetaSchema = z.object({
  numero: z.string().max(30),
  vencimiento: z.string().max(7),
  cvc: z.string().max(6),
  nombre: z.string().trim().max(80),
});

const TARJETAS = `${TARJETAS_PRUEBA.aprobada.replace(/(\d{4})(?=\d)/g, "$1 ")} (aprobada) o ${TARJETAS_PRUEBA.rechazada.replace(/(\d{4})(?=\d)/g, "$1 ")} (rechazada)`;

/**
 * Pago con tarjeta del modo prueba: no se cobra nada y los datos de la tarjeta no se guardan ni se registran
 * (se validan acá y se descartan). La tarjeta aprobada confirma el pago igual que lo haría el webhook de Nave.
 */
export async function pagarConTarjetaPrueba(token: string, datos: DatosTarjeta): Promise<ResultadoPago> {
  if (modoPago() !== "prueba") return { ok: false, error: "El pago con tarjeta todavía no está disponible." };
  if (!z.uuid().safeParse(token).success) return { ok: false, error: "No encontramos el pedido." };
  const t = tarjetaSchema.safeParse(datos);
  if (!t.success) return { ok: false, error: "Revisá los datos de la tarjeta." };
  const errores = Object.values(validarTarjeta(t.data));
  if (errores.length) return { ok: false, error: errores[0]! };

  const sb = supabaseServidor();
  const { data: pedido } = await sb
    .from("pedidos")
    .select("id, estado, medio_pago, vence_at")
    .eq("token_publico", token)
    .maybeSingle();
  if (!pedido) return { ok: false, error: "No encontramos el pedido." };
  if (pedido.estado !== "pendiente_pago") {
    // Ya pagado (por ejemplo, doble clic): la página del pedido lo muestra.
    if (pedido.estado !== "cancelado") return { ok: true };
    return { ok: false, error: "Este pedido se canceló porque pasó el tiempo para pagar. Armalo de nuevo desde la tienda." };
  }
  if (pedido.medio_pago !== "nave") return { ok: false, error: "Este pedido se paga por transferencia." };
  if (pedido.vence_at && new Date(pedido.vence_at as string) < new Date()) {
    return { ok: false, error: "Pasó el tiempo para pagar y liberamos las piezas. Armá el pedido de nuevo desde la tienda." };
  }

  // Un respiro como el de un banco de verdad, para que el recorrido se sienta real.
  await new Promise((r) => setTimeout(r, 900));

  const numero = soloDigitos(t.data.numero);
  if (numero === TARJETAS_PRUEBA.rechazada) return { ok: false, error: "Tu banco rechazó el pago. Probá con otra tarjeta." };
  if (numero !== TARJETAS_PRUEBA.aprobada) return { ok: false, error: `En modo prueba usá la tarjeta ${TARJETAS}.` };

  const { data, error } = await sb.rpc("aprobar_pago_externo", { p_token: token, p_id_externo: `prueba-${randomUUID()}` });
  if (error) {
    console.error("aprobar_pago_externo", error.message);
    return { ok: false, error: "No pudimos confirmar el pago. Probá de nuevo en un momento." };
  }
  const r = data as { id: string; nuevo: boolean };
  if (r.nuevo) after(() => notificarPagoConfirmado(r.id));
  return { ok: true };
}

/**
 * El cliente eligió tarjeta pero prefiere transferir (por ejemplo, después de un rechazo): el mismo pedido pasa a
 * transferencia, con el plazo de la transferencia para mandar el comprobante. Las piezas siguen reservadas.
 */
export async function pasarATransferencia(token: string): Promise<ResultadoPago> {
  if (!z.uuid().safeParse(token).success) return { ok: false, error: "No encontramos el pedido." };
  const sb = supabaseServidor();
  const { data: aj } = await sb.from("ajustes").select("horas_vencimiento_transferencia").eq("id", 1).single();
  const horas = (aj?.horas_vencimiento_transferencia as number | undefined) ?? 48;
  // Solo si sigue esperando el pago con tarjeta y no venció: el filtro va en el mismo update.
  const { data: pedido, error } = await sb
    .from("pedidos")
    .update({ medio_pago: "transferencia", vence_at: new Date(Date.now() + horas * 3600_000).toISOString() })
    .eq("token_publico", token)
    .eq("estado", "pendiente_pago")
    .eq("medio_pago", "nave")
    .gt("vence_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("pasarATransferencia", error.message);
    return { ok: false, error: "No pudimos cambiar el medio de pago. Probá de nuevo." };
  }
  if (!pedido) return { ok: false, error: "Este pedido ya no está esperando el pago con tarjeta. Mirá su estado en el link del pedido." };
  await sb.from("pagos").update({ medio: "transferencia" }).eq("pedido_id", pedido.id).eq("estado", "pendiente");
  // Le llega el mail con los datos para transferir (con tarjeta no se mandó ninguno).
  after(() => notificarPedidoNuevo(pedido.id as string));
  return { ok: true };
}
