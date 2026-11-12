import "server-only";
import { after } from "next/server";
import { ars, numeroPedido } from "@/lib/format";
import { avisoYaSalio, mandarAviso } from "@/lib/mails/envio";
import { notificarPagoConfirmado } from "@/lib/mensajes";
import { acreditacionDe, buscarPago, comisionDe, crearPago, ErrorMP, type DatosTarjetaMP, type PagoMP, type PedidoACobrar } from "@/lib/mercadopago";
import { supabaseServidor } from "@/lib/supabase/servidor";

/** Mientras Mercado Pago revisa un pago (puede tardar hasta 2 días hábiles), la reserva no se libera. */
const HORAS_EN_REVISION = 72;

export type Procesado =
  | { estado: "aprobado"; pedidoId: string; nuevo: boolean }
  | { estado: "en_revision" | "desafio" | "rechazado" | "revisar"; pedidoId: string }
  | { estado: "ajeno" };

type PedidoFila = { id: string; numero: number; token_publico: string; estado: string; total: number; vence_at: string | null };

/** Aviso a las socias, una sola vez por pago y situación. */
async function avisar(p: PedidoFila, tipo: string, texto: string) {
  if (await avisoYaSalio(p.id, tipo)) return;
  await mandarAviso({ pedidoId: p.id, tipo, texto });
}

/**
 * Lee el pago en Mercado Pago y deja el pedido como corresponde. Lo usan el cobro en la tienda, el desafío del banco y el
 * aviso de Mercado Pago; da igual cuál llegue primero o si llegan dos veces.
 * `soloToken`: si se pasa, solo procesa un pago de ese pedido.
 * Los mails y avisos del pago confirmado salen después de responder.
 */
export async function procesarPagoMP(idPago: string, soloToken?: string): Promise<Procesado> {
  if (!/^\d{1,20}$/.test(idPago)) return { estado: "ajeno" };
  let pago: PagoMP;
  try {
    pago = await buscarPago(idPago);
  } catch (e) {
    if (e instanceof ErrorMP && e.status === 404) return { estado: "ajeno" };
    throw e;
  }
  const ref = pago.external_reference ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(ref)) return { estado: "ajeno" };

  const sb = supabaseServidor();
  const { data } = await sb.from("pedidos").select("id, numero, token_publico, estado, total, vence_at").eq("id", ref).maybeSingle();
  if (!data || (soloToken && data.token_publico !== soloToken)) return { estado: "ajeno" };
  const p = data as PedidoFila;
  const cuanto = `${numeroPedido(p.numero)} · ${ars(pago.transaction_amount)}`;

  switch (pago.status) {
    case "approved": {
      if (pago.currency_id !== "ARS" || Math.round(pago.transaction_amount) !== p.total) {
        await avisar(p, `mp_monto_${pago.id}`, `⚠️ Pago de Mercado Pago que no coincide · ${cuanto}\nEl pedido es de ${ars(p.total)}. Revisalo en Mercado Pago antes de despachar.`);
        return { estado: "revisar", pedidoId: p.id };
      }
      const { data: r, error } = await sb.rpc("aprobar_pago_externo", {
        p_token: p.token_publico,
        p_id_externo: String(pago.id),
        p_medio: "mercadopago",
        p_comision: comisionDe(pago),
        p_acreditacion: acreditacionDe(pago),
      });
      if (error) {
        if (!error.message.includes("ya no espera pago")) throw new Error(`aprobar_pago_externo: ${error.message}`);
        // Pagó después de que venció la reserva, o el pedido ya se había cobrado por otro lado.
        await avisar(
          p,
          `mp_tarde_${pago.id}`,
          `⚠️ Cobro de Mercado Pago para un pedido ${p.estado === "cancelado" ? "cancelado" : "que ya estaba pagado"} · ${cuanto}\nDevolvé el pago desde Mercado Pago o escribile al cliente para rearmar el pedido.`,
        );
        return { estado: "revisar", pedidoId: p.id };
      }
      const nuevo = (r as { nuevo: boolean }).nuevo;
      if (nuevo) after(() => notificarPagoConfirmado(p.id));
      return { estado: "aprobado", pedidoId: p.id, nuevo };
    }
    case "pending":
    case "in_process":
    case "authorized": {
      // Esperando que el cliente valide con su banco (3DS): si no lo hace en segundos, Mercado Pago lo rechaza solo.
      if (pago.status_detail === "pending_challenge") return { estado: "desafio", pedidoId: p.id };
      if (p.estado === "pendiente_pago") {
        const hasta = new Date(Date.now() + HORAS_EN_REVISION * 3600_000);
        if (!p.vence_at || new Date(p.vence_at) < hasta) {
          await sb.from("pedidos").update({ vence_at: hasta.toISOString() }).eq("id", p.id).eq("estado", "pendiente_pago");
          await sb.from("eventos").insert({ pedido_id: p.id, tipo: "vencimiento_extendido", detalle: { horas: HORAS_EN_REVISION, motivo: "pago en revisión en Mercado Pago", pago: pago.id } });
        }
      }
      return { estado: "en_revision", pedidoId: p.id };
    }
    case "refunded":
    case "charged_back":
    case "in_mediation": {
      const que = { refunded: "pago devuelto", charged_back: "contracargo (el cliente desconoció el pago)", in_mediation: "el cliente abrió un reclamo" }[pago.status];
      await avisar(
        p,
        `mp_${pago.status}_${pago.id}`,
        `↩️ Mercado Pago: ${que} · ${cuanto}\n${pago.status === "refunded" ? "Si no lo registraste, cargalo en Devoluciones del pedido." : "Respondé desde Mercado Pago y frená el envío si todavía no salió."}`,
      );
      return { estado: "revisar", pedidoId: p.id };
    }
    default:
      return { estado: "rechazado", pedidoId: p.id };
  }
}

type Cargado = { ok: true; pedido: PedidoACobrar } | { ok: false; error: string };

/** El pedido con tarjeta, solo si sigue esperando el pago y la reserva no venció. */
async function pedidoACobrar(token: string): Promise<Cargado> {
  const sb = supabaseServidor();
  const { data: p } = await sb
    .from("pedidos")
    .select("id, numero, total, estado, medio_pago, vence_at, token_publico, cliente:clientes(nombre, email), items:pedido_items(cantidad, producto:productos(nombre))")
    .eq("token_publico", token)
    .maybeSingle();
  if (!p) return { ok: false, error: "No encontramos el pedido." };
  if (p.estado !== "pendiente_pago") return { ok: false, error: "Este pedido ya no está esperando el pago. Mirá su estado en el link del pedido." };
  if (p.medio_pago !== "mercadopago") return { ok: false, error: "Este pedido se paga por transferencia." };
  if (p.vence_at && new Date(p.vence_at as string) < new Date()) {
    return { ok: false, error: "Pasó el tiempo para pagar y liberamos las piezas. Armá el pedido de nuevo desde la tienda." };
  }
  const cliente = (Array.isArray(p.cliente) ? p.cliente[0] : p.cliente) as { nombre: string; email: string | null } | null;
  const items = (p.items ?? []) as unknown as { cantidad: number; producto: { nombre: string } | null }[];
  return {
    ok: true,
    pedido: {
      id: p.id as string,
      token: p.token_publico as string,
      numero: p.numero as number,
      total: p.total as number,
      vence_at: p.vence_at as string | null,
      nombre: cliente?.nombre ?? "Cliente",
      email: cliente?.email ?? null,
      productos: items.map((i) => `${i.cantidad > 1 ? `${i.cantidad} × ` : ""}${i.producto?.nombre ?? "Pieza"}`),
    },
  };
}

export type Preparado = { ok: true; total: number; email: string | null } | { ok: false; error: string };

/** Lo que necesitan los campos de pago para mostrarse: que el pedido siga esperando el pago, el monto y el mail para precargar. */
export async function prepararPagoMP(token: string): Promise<Preparado> {
  const c = await pedidoACobrar(token);
  if (!c.ok) return c;
  return { ok: true, total: c.pedido.total, email: c.pedido.email };
}

export type ResultadoTarjetaMP =
  | { estado: "aprobado" }
  | { estado: "desafio"; pagoId: string; url: string; creq: string }
  | { estado: "en_revision" }
  | { estado: "rechazado"; error: string };

const RECHAZOS: Record<string, string> = {
  cc_rejected_bad_filled_card_number: "Revisá el número de la tarjeta.",
  cc_rejected_bad_filled_date: "Revisá la fecha de vencimiento.",
  cc_rejected_bad_filled_security_code: "Revisá el código de seguridad.",
  cc_rejected_bad_filled_other: "Revisá los datos de la tarjeta.",
  cc_rejected_insufficient_amount: "La tarjeta no tiene saldo o límite suficiente. Probá con otra.",
  cc_rejected_call_for_authorize: "Tu banco pide que autorices este pago: llamalo y volvé a intentar.",
  cc_rejected_card_disabled: "La tarjeta no está activa. Llamá a tu banco para activarla o probá con otra.",
  cc_rejected_duplicated_payment: "Ya hiciste un pago igual hace un momento. Si tenés que pagar de nuevo, usá otra tarjeta.",
  cc_rejected_max_attempts: "Llegaste al límite de intentos con esta tarjeta. Probá con otra.",
  cc_rejected_invalid_installments: "Tu tarjeta no acepta esa cantidad de cuotas. Elegí otra.",
  cc_rejected_3ds_challenge: "No se pudo validar el pago con tu banco. Probá de nuevo o con otra tarjeta.",
};
const RECHAZO_GENERAL = "Tu banco rechazó el pago. Probá con otra tarjeta o pagá por transferencia.";

/** Cobra el pedido con la tarjeta cargada en los campos de Mercado Pago y deja el pedido como corresponde. */
export async function pagarPedidoMP(token: string, datos: DatosTarjetaMP, sesion?: string): Promise<ResultadoTarjetaMP> {
  const c = await pedidoACobrar(token);
  if (!c.ok) return { estado: "rechazado", error: c.error };
  let pago;
  try {
    pago = await crearPago(c.pedido, datos, sesion);
  } catch (e) {
    console.error("[mercadopago] crearPago", e);
    const datosMal = e instanceof ErrorMP && e.status === 400;
    return { estado: "rechazado", error: datosMal ? "Revisá los datos de la tarjeta y probá de nuevo." : "No pudimos procesar el pago. Probá de nuevo en un momento." };
  }
  if (pago.status === "pending" && pago.status_detail === "pending_challenge" && pago.three_ds_info) {
    return { estado: "desafio", pagoId: String(pago.id), url: pago.three_ds_info.external_resource_url, creq: pago.three_ds_info.creq };
  }
  if (pago.status === "rejected" || pago.status === "cancelled") return { estado: "rechazado", error: RECHAZOS[pago.status_detail] ?? RECHAZO_GENERAL };
  // Aprobado o en revisión: lo confirma lo que diga Mercado Pago al releer el pago (igual que su aviso).
  return resultadoDe(await procesarPagoMP(String(pago.id), token));
}

/** Estado de un pago después del desafío del banco (los campos lo consultan cada pocos segundos). */
export async function estadoPagoMP(token: string, pagoId: string): Promise<ResultadoTarjetaMP | { estado: "esperando" }> {
  const r = await procesarPagoMP(pagoId, token);
  if (r.estado === "ajeno") return { estado: "rechazado", error: "No encontramos ese pago." };
  if (r.estado === "desafio") return { estado: "esperando" };
  if (r.estado === "rechazado") {
    const pago = await buscarPago(pagoId);
    return { estado: "rechazado", error: RECHAZOS[pago.status_detail] ?? RECHAZO_GENERAL };
  }
  return resultadoDe(r);
}

function resultadoDe(r: Procesado): ResultadoTarjetaMP {
  if (r.estado === "aprobado") return { estado: "aprobado" };
  if (r.estado === "en_revision" || r.estado === "revisar" || r.estado === "desafio") return { estado: "en_revision" };
  return { estado: "rechazado", error: RECHAZO_GENERAL };
}
