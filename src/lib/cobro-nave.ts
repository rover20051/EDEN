import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { ars, numeroPedido } from "@/lib/format";
import { avisar, pedidoACobrar, type PedidoFila } from "@/lib/cobro-mp";
import type { EntornoMP as EntornoNave } from "@/lib/mercadopago";
import { notificarPagoConfirmado } from "@/lib/mensajes";
import {
  buscarIntencion,
  buscarPagoNave,
  cancelarIntencion,
  crearIntencion,
  ErrorNave,
  montoDe,
  type Intencion,
} from "@/lib/nave";
import { supabaseServidor } from "@/lib/supabase/servidor";

/**
 * Cobro con Nave. Igual que con Mercado Pago, el pedido queda pagado solo con lo que responde la API de Nave
 * (`procesarPagoNave`), al volver del pago, al consultarlo o por su aviso; da igual cuál llegue primero o si llegan dos.
 *
 * Nave nos avisa con el `external_payment_id` que mandamos al crear la intención. Cada intención lleva uno nuevo
 * (un uuid) y queda registrada en los eventos del pedido: "nave_intencion" antes de crearla (así el aviso nunca llega
 * sin dueño) y "nave_intencion_creada" con el id que le dio Nave.
 */

export type ProcesadoNave =
  | { estado: "aprobado"; pedidoId: string; nuevo: boolean }
  | { estado: "en_revision" | "rechazado" | "revisar"; pedidoId: string }
  | { estado: "ajeno" };

/** Con un pago iniciado y sin resultado, la reserva se estira al menos esto (la intención ya no se cobra sola). */
const MINUTOS_PENDIENTE = 60;

async function pedidoDe(externo: string): Promise<PedidoFila | null> {
  const sb = supabaseServidor();
  const { data: ev } = await sb.from("eventos").select("pedido_id").eq("tipo", "nave_intencion").eq("detalle->>external", externo).limit(1).maybeSingle();
  if (!ev) return null;
  const { data } = await sb.from("pedidos").select("id, numero, token_publico, estado, total, vence_at").eq("id", ev.pedido_id).maybeSingle();
  return (data as PedidoFila | null) ?? null;
}

/** Lee el pago en Nave y deja el pedido como corresponde. `soloToken`: si se pasa, solo procesa un pago de ese pedido. */
export async function procesarPagoNave(e: EntornoNave, idPago: string, soloToken?: string): Promise<ProcesadoNave> {
  if (!/^[\w-]{8,64}$/.test(idPago)) return { estado: "ajeno" };
  let pago;
  try {
    pago = await buscarPagoNave(e, idPago);
  } catch (err) {
    if (err instanceof ErrorNave && err.status === 404) return { estado: "ajeno" };
    throw err;
  }
  if (!pago.external_payment_id) return { estado: "ajeno" };
  const p = await pedidoDe(pago.external_payment_id);
  if (!p || (soloToken && p.token_publico !== soloToken)) return { estado: "ajeno" };
  const sb = supabaseServidor();
  const cobrado = montoDe(pago);
  const cuanto = `${numeroPedido(p.numero)} · ${cobrado ? ars(cobrado.pesos) : "monto desconocido"}`;

  switch (pago.status.name) {
    case "APPROVED": {
      if (!cobrado || cobrado.moneda !== "ARS" || Math.round(cobrado.pesos) !== p.total) {
        await avisar(p, `nave_monto_${pago.id}`, `⚠️ Pago de Nave que no coincide · ${cuanto}\nEl pedido es de ${ars(p.total)}. Revisalo en Nave antes de despachar.`);
        return { estado: "revisar", pedidoId: p.id };
      }
      // Nave no informa la comisión: queda la estimación de Ajustes (comision_nave y dias_acreditacion_nave).
      const { data: r, error } = await sb.rpc("aprobar_pago_externo", { p_token: p.token_publico, p_id_externo: pago.id, p_medio: "nave" });
      if (error) {
        if (!error.message.includes("ya no espera pago")) throw new Error(`aprobar_pago_externo: ${error.message}`);
        await avisar(
          p,
          `nave_tarde_${pago.id}`,
          `⚠️ Cobro de Nave para un pedido ${p.estado === "cancelado" ? "cancelado" : "que ya estaba pagado"} · ${cuanto}\nDevolvé el pago desde Nave o escribile al cliente para rearmar el pedido.`,
        );
        return { estado: "revisar", pedidoId: p.id };
      }
      const nuevo = (r as { nuevo: boolean }).nuevo;
      if (nuevo) after(() => notificarPagoConfirmado(p.id));
      return { estado: "aprobado", pedidoId: p.id, nuevo };
    }
    case "PENDING": {
      if (p.estado === "pendiente_pago") {
        const hasta = new Date(Date.now() + MINUTOS_PENDIENTE * 60_000);
        if (!p.vence_at || new Date(p.vence_at) < hasta) {
          await sb.from("pedidos").update({ vence_at: hasta.toISOString() }).eq("id", p.id).eq("estado", "pendiente_pago");
          await sb.from("eventos").insert({ pedido_id: p.id, tipo: "vencimiento_extendido", detalle: { hasta: hasta.toISOString(), motivo: "pago iniciado en Nave", pago: pago.id } });
        }
      }
      return { estado: "en_revision", pedidoId: p.id };
    }
    case "REFUNDED":
    case "PURCHASE_REVERSED":
    case "CHARGEBACK_REVIEW":
    case "CHARGED_BACK": {
      const que = {
        REFUNDED: "pago devuelto",
        PURCHASE_REVERSED: "pago reversado antes de liquidarse",
        CHARGEBACK_REVIEW: "el cliente disputó el pago (contracargo en revisión)",
        CHARGED_BACK: "contracargo confirmado",
      }[pago.status.name];
      await avisar(
        p,
        `nave_${pago.status.name.toLowerCase()}_${pago.id}`,
        `↩️ Nave: ${que} · ${cuanto}\n${pago.status.name === "REFUNDED" || pago.status.name === "PURCHASE_REVERSED" ? "Si el pedido todavía no salió, frená el envío." : "Respondé desde Nave y frená el envío si todavía no salió."}`,
      );
      return { estado: "revisar", pedidoId: p.id };
    }
    default:
      return { estado: "rechazado", pedidoId: p.id };
  }
}

/** Las intenciones de un pedido, de la más nueva a la más vieja. */
async function intencionesDe(pedidoId: string): Promise<{ id: string; external: string }[]> {
  const { data } = await supabaseServidor()
    .from("eventos")
    .select("detalle")
    .eq("pedido_id", pedidoId)
    .eq("tipo", "nave_intencion_creada")
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((f) => f.detalle as { id: string; external: string }).filter((d) => d?.id);
}

export type PreparadoNave =
  | { ok: true; aprobado: false; total: number; intencion: string; checkoutUrl: string }
  | { ok: true; aprobado: true }
  | { ok: false; error: string };

/**
 * Lo que necesita el checkout de Nave para mostrarse: la intención de pago del pedido. Si ya hay una vigente se reutiliza
 * (recargar la página no crea otra); si la anterior se pagó, se confirma el pago; si venció o se bloqueó, se crea una nueva.
 */
export async function prepararPagoNave(e: EntornoNave, token: string): Promise<PreparadoNave> {
  const c = await pedidoACobrar(token, "nave");
  if (!c.ok) {
    // Si la intención anterior se pagó y el aviso no llegó, la página del pedido lo resuelve acá.
    return c;
  }
  const p = c.pedido;
  for (const previa of await intencionesDe(p.id)) {
    let i: Intencion;
    try {
      i = await buscarIntencion(e, previa.id);
    } catch (err) {
      console.error("[nave] buscarIntencion", err);
      continue;
    }
    const pagos = i.payment_attempts?.payments ?? [];
    const aprobado = pagos.find((x) => x.status === "APPROVED");
    if (aprobado && (await procesarPagoNave(e, aprobado.payment_id, token)).estado === "aprobado") return { ok: true, aprobado: true };
    const vigente = i.status.name === "PENDING" || i.status.name === "PROCESSED";
    const vencida = i.expiration_date ? new Date(i.expiration_date) < new Date() : false;
    if (vigente && !vencida && i.capture_data?.checkout_url) return { ok: true, aprobado: false, total: p.total, intencion: i.id, checkoutUrl: i.capture_data.checkout_url };
  }

  // No hay una vigente: se crea una nueva que dura lo que le queda a la reserva.
  const externo = randomUUID();
  const sb = supabaseServidor();
  const { error } = await sb.from("eventos").insert({ pedido_id: p.id, tipo: "nave_intencion", detalle: { external: externo } });
  if (error) {
    console.error("[nave] no se pudo registrar la intención", error.message);
    return { ok: false, error: "No pudimos preparar el pago. Probá de nuevo en un momento." };
  }
  const segundos = p.vence_at ? (new Date(p.vence_at).getTime() - Date.now()) / 1000 : 3600;
  const inicio = Date.now();
  try {
    const i = await crearIntencion(e, p, externo, segundos);
    await sb.from("eventos").insert({ pedido_id: p.id, tipo: "nave_intencion_creada", detalle: { external: externo, id: i.id } });
    return { ok: true, aprobado: false, total: p.total, intencion: i.id, checkoutUrl: i.checkout_url };
  } catch (err) {
    console.error("[nave] crearIntencion", err);
    // Queda en la historia del pedido con lo que respondió Nave (o el tiempo que tardó), para poder revisarlo después.
    const mensaje = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    await sb.from("eventos").insert({ pedido_id: p.id, tipo: "nave_error", detalle: { external: externo, mensaje: mensaje.slice(0, 500), ms: Date.now() - inicio } });
    return { ok: false, error: "No pudimos preparar el pago con tarjeta. Probá de nuevo en un momento o pagá por transferencia." };
  }
}

export type EstadoNave =
  | { estado: "aprobado" }
  | { estado: "esperando" }
  | { estado: "en_revision" }
  | { estado: "rechazado"; error: string }
  | { estado: "nueva" };

const RECHAZO_NAVE = "No se pudo completar el pago. Probá de nuevo, con otra tarjeta o pagá por transferencia.";

/** Cómo va el pago del pedido (el checkout lo consulta cada pocos segundos después de pagar). */
export async function estadoPagoNave(e: EntornoNave, token: string): Promise<EstadoNave> {
  const sb = supabaseServidor();
  const { data: ped } = await sb.from("pedidos").select("id, estado, medio_pago").eq("token_publico", token).maybeSingle();
  if (!ped) return { estado: "rechazado", error: "No encontramos el pedido." };
  if (ped.estado === "pagado" || ped.estado === "en_preparacion" || ped.estado === "despachado" || ped.estado === "entregado") return { estado: "aprobado" };
  if (ped.estado !== "pendiente_pago") return { estado: "rechazado", error: "Este pedido ya no está esperando el pago." };

  const [ultima] = await intencionesDe(ped.id as string);
  if (!ultima) return { estado: "esperando" };
  let i: Intencion;
  try {
    i = await buscarIntencion(e, ultima.id);
  } catch (err) {
    console.error("[nave] estadoPagoNave", err);
    return { estado: "esperando" };
  }
  const pagos = i.payment_attempts?.payments ?? [];
  // Con un pago aprobado se confirma contra la API de Nave (la intención sola no alcanza: hay que verificar el monto).
  const aprobado = pagos.find((x) => x.status === "APPROVED");
  if (aprobado) {
    const r = await procesarPagoNave(e, aprobado.payment_id, token);
    if (r.estado === "aprobado") return { estado: "aprobado" };
    return { estado: "en_revision" };
  }
  if (pagos.some((x) => x.status === "PENDING")) return { estado: "esperando" };
  switch (i.status.name) {
    case "FAILURE_PROCESSED":
      return { estado: "rechazado", error: RECHAZO_NAVE };
    case "EXPIRED":
    case "BLOCKED":
    case "DISABLED":
      return { estado: "nueva" };
    default:
      return { estado: "esperando" };
  }
}

/** Anula las intenciones sin usar de un pedido (cuando pasa a transferencia), para que no se pueda pagar dos veces. */
export async function anularIntencionesDelPedido(e: EntornoNave, pedidoId: string) {
  try {
    for (const previa of await intencionesDe(pedidoId)) {
      try {
        const i = await buscarIntencion(e, previa.id);
        if (i.status.name === "PENDING") await cancelarIntencion(e, previa.id);
      } catch (err) {
        console.error("[nave] anular intención", previa.id, err);
      }
    }
  } catch (err) {
    console.error("[nave] anularIntencionesDelPedido", err);
  }
}
