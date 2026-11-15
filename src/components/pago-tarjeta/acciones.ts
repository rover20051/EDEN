"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { notificarPagoConfirmado, notificarPedidoNuevo } from "@/lib/mensajes";
import { anularCuponesDelPedido, anularCuponMP, estadoPagoMP, pagarPedidoMP, prepararPagoMP, type Preparado, type ResultadoTarjetaMP } from "@/lib/cobro-mp";
import { anularIntencionesDelPedido, estadoPagoNave, pagoNaveEnCurso, prepararPagoNave, type EstadoNave, type PreparadoNave } from "@/lib/cobro-nave";
import { mpConfigurado } from "@/lib/mercadopago";
import { naveConfigurado } from "@/lib/nave";
import { entornoPago, modoDelPedido, otrosMediosDelPedido } from "@/lib/pagos";
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
 * (se validan acá y se descartan). La tarjeta aprobada confirma el pago igual que lo haría el aviso de Mercado Pago.
 */
export async function pagarConTarjetaPrueba(token: string, datos: DatosTarjeta): Promise<ResultadoPago> {
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
  if (pedido.medio_pago !== "mercadopago" && pedido.medio_pago !== "nave") return { ok: false, error: "Este pedido se paga por transferencia." };
  if ((await modoDelPedido(pedido.medio_pago)).modo !== "prueba") return { ok: false, error: "El pago con tarjeta todavía no está disponible." };
  if (pedido.vence_at && new Date(pedido.vence_at as string) < new Date()) {
    return { ok: false, error: "Pasó el tiempo para pagar y liberamos las piezas. Armá el pedido de nuevo desde la tienda." };
  }

  // Un respiro como el de un banco de verdad, para que el recorrido se sienta real.
  await new Promise((r) => setTimeout(r, 900));

  const numero = soloDigitos(t.data.numero);
  if (numero === TARJETAS_PRUEBA.rechazada) return { ok: false, error: "Tu banco rechazó el pago. Probá con otra tarjeta." };
  if (numero !== TARJETAS_PRUEBA.aprobada) return { ok: false, error: `En modo prueba usá la tarjeta ${TARJETAS}.` };

  const { data, error } = await sb.rpc("aprobar_pago_externo", { p_token: token, p_id_externo: `prueba-${randomUUID()}`, p_medio: pedido.medio_pago });
  if (error) {
    console.error("aprobar_pago_externo", error.message);
    return { ok: false, error: "No pudimos confirmar el pago. Probá de nuevo en un momento." };
  }
  const r = data as { id: string; nuevo: boolean };
  if (r.nuevo) after(() => notificarPagoConfirmado(r.id));
  return { ok: true };
}

const NO_DISPONIBLE = "El pago con tarjeta no está disponible en este momento. Podés pagar por transferencia.";

/** Mercado Pago listo para quien está mirando (el medio con que se creó cada pedido se revisa al cobrar). */
const mpListo = async () => mpConfigurado(await entornoPago());

/** Datos para mostrar los campos de pago de Mercado Pago en el pedido. */
export async function prepararMercadoPago(token: string): Promise<Preparado> {
  if (!(await mpListo())) return { ok: false, error: NO_DISPONIBLE };
  if (!z.uuid().safeParse(token).success) return { ok: false, error: "No encontramos el pedido." };
  return prepararPagoMP(await entornoPago(), token);
}

const tarjetaMPSchema = z.object({
  token: z.string().min(8).max(200),
  payment_method_id: z.string().min(2).max(40),
  issuer_id: z.union([z.string().max(20), z.number()]).nullish(),
  installments: z.number().int().min(1).max(36),
  payer: z.object({
    email: z.string().max(200).optional(),
    identification: z.object({ type: z.string().max(10), number: z.string().max(20) }).optional(),
  }),
});

const identificacion = z.object({ type: z.string().max(10), number: z.string().max(20) });
const efectivoMPSchema = z.object({
  payment_method_id: z.enum(["rapipago", "pagofacil"]),
  payer: z.object({
    email: z.string().max(200).optional(),
    first_name: z.string().max(80).optional(),
    last_name: z.string().max(80).optional(),
    identification: identificacion.optional(),
  }),
});

/**
 * Cobra con lo elegido en los campos de Mercado Pago: la tarjeta llega tokenizada (la tienda nunca ve sus datos);
 * con efectivo, se genera el cupón para Rapipago o Pago Fácil.
 */
export async function pagarConMercadoPago(token: string, datos: unknown, sesion?: string | null): Promise<ResultadoTarjetaMP> {
  if (!(await mpListo())) return { estado: "rechazado", error: NO_DISPONIBLE };
  if (!z.uuid().safeParse(token).success) return { estado: "rechazado", error: "No encontramos el pedido." };
  const efectivo = efectivoMPSchema.safeParse(datos);
  const e = await entornoPago();
  if (efectivo.success) return pagarPedidoMP(e, token, efectivo.data);
  const d = tarjetaMPSchema.safeParse(datos);
  if (!d.success) return { estado: "rechazado", error: "Revisá los datos de la tarjeta." };
  return pagarPedidoMP(e, token, d.data, typeof sesion === "string" && /^[\w-]{1,100}$/.test(sesion) ? sesion : undefined);
}

/** Anula el cupón en efectivo para elegir otro medio (por ejemplo, tarjeta). */
export async function anularCuponMercadoPago(token: string, pagoId: string): Promise<ResultadoPago> {
  if (!(await mpListo())) return { ok: false, error: NO_DISPONIBLE };
  if (!z.uuid().safeParse(token).success || !/^\d{1,20}$/.test(pagoId)) return { ok: false, error: "No encontramos el cupón." };
  return anularCuponMP(await entornoPago(), token, pagoId);
}

/** Después de validar con el banco (3DS): cómo quedó el pago. */
export async function consultarPagoMercadoPago(token: string, pagoId: string) {
  if (!(await mpListo())) return { estado: "rechazado" as const, error: NO_DISPONIBLE };
  if (!z.uuid().safeParse(token).success || !/^\d{1,20}$/.test(pagoId)) return { estado: "rechazado" as const, error: "No encontramos el pago." };
  return estadoPagoMP(await entornoPago(), token, pagoId);
}

/** Datos para mostrar el checkout de Nave en el pedido: la intención de pago (se reutiliza si sigue vigente). */
export async function prepararNave(token: string): Promise<PreparadoNave> {
  const e = await entornoPago();
  if (!naveConfigurado(e)) return { ok: false, error: NO_DISPONIBLE };
  if (!z.uuid().safeParse(token).success) return { ok: false, error: "No encontramos el pedido." };
  return prepararPagoNave(e, token);
}

/** Cómo va el pago con Nave (el checkout lo consulta después de pagar). */
export async function consultarPagoNave(token: string): Promise<EstadoNave> {
  const e = await entornoPago();
  if (!naveConfigurado(e)) return { estado: "rechazado", error: NO_DISPONIBLE };
  if (!z.uuid().safeParse(token).success) return { estado: "rechazado", error: "No encontramos el pedido." };
  return estadoPagoNave(e, token);
}

/**
 * Cambia el medio de pago del mismo pedido (sin rearmar el carrito ni crear otro): tarjeta ⇄ efectivo, o transferencia.
 * Lo que quedó abierto con el medio anterior (la intención de Nave o el cupón de efectivo) se anula; si ya hay un pago
 * en curso, no se cambia. Cambiar no alarga la reserva: con tarjeta o efectivo vence como mucho a las horas de Ajustes
 * (al sacar el cupón de efectivo se extiende, como siempre).
 */
export async function cambiarMedioPago(token: string, destino: "tarjeta" | "efectivo" | "transferencia"): Promise<ResultadoPago> {
  if (!z.uuid().safeParse(token).success) return { ok: false, error: "No encontramos el pedido." };
  const d = z.enum(["tarjeta", "efectivo", "transferencia"]).safeParse(destino);
  if (!d.success) return { ok: false, error: "Ese medio de pago no está disponible." };
  if (d.data === "transferencia") return pasarATransferencia(token);

  const sb = supabaseServidor();
  const ahora = new Date();
  const { data: actual } = await sb
    .from("pedidos")
    .select("id, medio_pago, vence_at")
    .eq("token_publico", token)
    .eq("estado", "pendiente_pago")
    .gt("vence_at", ahora.toISOString())
    .maybeSingle();
  if (!actual) return { ok: false, error: "Este pedido ya no está esperando el pago. Mirá su estado en el link del pedido." };
  const id = actual.id as string;
  const medio = actual.medio_pago as string;
  if (!(await otrosMediosDelPedido(medio)).includes(d.data)) return { ok: false, error: "Ese medio de pago no está disponible en este momento." };

  const e = await entornoPago();
  if (medio === "nave" && naveConfigurado(e)) {
    const enCurso = await pagoNaveEnCurso(e, id);
    if (enCurso === "si") return { ok: false, error: "Ya hay un pago con tarjeta en curso para este pedido. Esperá unos segundos y recargá la página." };
    if (enCurso === "error") return { ok: false, error: "No pudimos cambiar el medio de pago. Probá de nuevo en un momento." };
    await anularIntencionesDelPedido(e, id);
  }
  if (medio === "mercadopago" && mpConfigurado(e)) await anularCuponesDelPedido(e, id);

  const { data: aj } = await sb.from("ajustes").select("horas_vencimiento_nave").eq("id", 1).single();
  const horas = (aj?.horas_vencimiento_nave as number | undefined) ?? 2;
  const tope = ahora.getTime() + horas * 3600_000;
  const vence = new Date(Math.min(new Date(actual.vence_at as string).getTime(), tope)).toISOString();
  const nuevo = d.data === "efectivo" ? "mercadopago" : "nave";
  const { data: cambiado, error } = await sb
    .from("pedidos")
    .update({ medio_pago: nuevo, vence_at: vence })
    .eq("id", id)
    .eq("estado", "pendiente_pago")
    .eq("medio_pago", medio)
    .select("id")
    .maybeSingle();
  if (error || !cambiado) {
    if (error) console.error("cambiarMedioPago", error.message);
    return { ok: false, error: "No pudimos cambiar el medio de pago. Probá de nuevo." };
  }
  await sb.from("pagos").update({ medio: nuevo }).eq("pedido_id", id).eq("estado", "pendiente");
  return { ok: true };
}

/**
 * El cliente eligió tarjeta o efectivo pero prefiere transferir (por ejemplo, después de un rechazo): el mismo pedido pasa a
 * transferencia, con el plazo de la transferencia para mandar el comprobante. Las piezas siguen reservadas.
 */
export async function pasarATransferencia(token: string): Promise<ResultadoPago> {
  if (!z.uuid().safeParse(token).success) return { ok: false, error: "No encontramos el pedido." };
  const sb = supabaseServidor();
  // Si ya hay un pago con Nave aprobado o en proceso, no se cambia (podría terminar pagando dos veces).
  const { data: previo } = await sb.from("pedidos").select("id, medio_pago").eq("token_publico", token).eq("estado", "pendiente_pago").maybeSingle();
  const ep = await entornoPago();
  if (previo?.medio_pago === "nave" && naveConfigurado(ep)) {
    const enCurso = await pagoNaveEnCurso(ep, previo.id as string);
    if (enCurso === "si") return { ok: false, error: "Ya hay un pago con tarjeta en curso para este pedido. Esperá unos segundos y recargá la página." };
    if (enCurso === "error") return { ok: false, error: "No pudimos cambiar el medio de pago. Probá de nuevo en un momento." };
  }
  const { data: aj } = await sb.from("ajustes").select("horas_vencimiento_transferencia").eq("id", 1).single();
  const horas = (aj?.horas_vencimiento_transferencia as number | undefined) ?? 48;
  // Solo si sigue esperando el pago con tarjeta y no venció: el filtro va en el mismo update.
  const { data: pedido, error } = await sb
    .from("pedidos")
    .update({ medio_pago: "transferencia", vence_at: new Date(Date.now() + horas * 3600_000).toISOString() })
    .eq("token_publico", token)
    .eq("estado", "pendiente_pago")
    .in("medio_pago", ["mercadopago", "nave"])
    .gt("vence_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("pasarATransferencia", error.message);
    return { ok: false, error: "No pudimos cambiar el medio de pago. Probá de nuevo." };
  }
  if (!pedido) return { ok: false, error: "Este pedido ya no está esperando el pago con tarjeta. Mirá su estado en el link del pedido." };
  await sb.from("pagos").update({ medio: "transferencia" }).eq("pedido_id", pedido.id).eq("estado", "pendiente");
  // Si había sacado un cupón para pagar en efectivo, se anula: así no puede pagar dos veces.
  const e = await entornoPago();
  if (mpConfigurado(e)) await anularCuponesDelPedido(e, pedido.id as string);
  // Y si había abierto el pago con Nave, la intención se anula por lo mismo.
  if (naveConfigurado(e)) await anularIntencionesDelPedido(e, pedido.id as string);
  // Le llega el mail con los datos para transferir (con tarjeta no se mandó ninguno).
  after(() => notificarPedidoNuevo(pedido.id as string));
  return { ok: true };
}
