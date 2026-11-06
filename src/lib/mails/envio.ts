import "server-only";
import { casillasPrueba, dominioMails, remitenteDe } from "@/lib/mails/remitentes";
import { mandarPush } from "@/lib/push";
import { supabaseServidor } from "@/lib/supabase/servidor";

// Cómo sale cada mensaje (Resend: mails al cliente y avisos de venta a las socias) y su registro en la tabla "mensajes".
// Nunca tira error: devuelve el estado con que quedó registrado.

export type EstadoMensaje = "simulado" | "enviado" | "error";
type Canal = "mail" | "telegram" | "push";

const ESPERA_MS = 8000;

/** Qué está configurado (sin exponer valores). Lo muestra Ajustes → Mails y avisos. */
export function configMensajeria() {
  const real = process.env.MAILS_MODO === "real";
  return {
    mails: {
      modo: real ? ("real" as const) : ("prueba" as const),
      resend: Boolean(process.env.RESEND_API_KEY),
      dominio: Boolean(dominioMails()),
      copiaPrueba: casillasPrueba().length > 0 && Boolean(process.env.RESEND_API_KEY),
    },
    // Los avisos de venta son internos: salen de verdad apenas hay RESEND_API_KEY, sin depender de MAILS_MODO.
    avisos: { resend: Boolean(process.env.RESEND_API_KEY) },
  };
}

async function registrar(r: {
  pedido_id: string | null;
  canal: Canal;
  tipo: string;
  para: string;
  asunto: string | null;
  cuerpo: string;
  estado: EstadoMensaje;
  error: string | null;
}) {
  try {
    const { error } = await supabaseServidor().from("mensajes").insert({ ...r, error: r.error?.slice(0, 500) ?? null });
    if (error) console.error("[mensajes] no se pudo registrar:", error.message);
  } catch (e) {
    console.error("[mensajes] no se pudo registrar:", e);
  }
}

/** ¿Ya salió (o se simuló) este mensaje para este pedido? Evita mandar dos veces el mismo mail si una acción se repite. */
export async function yaRegistrado(pedidoId: string, tipo: string, canal: Canal): Promise<boolean> {
  try {
    const { data, error } = await supabaseServidor()
      .from("mensajes")
      .select("id")
      .eq("pedido_id", pedidoId)
      .eq("tipo", tipo)
      .eq("canal", canal)
      .in("estado", ["enviado", "simulado"])
      .limit(1);
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** ¿Ya salió este aviso interno para este pedido, por push o por mail? */
export async function avisoYaSalio(pedidoId: string, tipo: string): Promise<boolean> {
  return (await yaRegistrado(pedidoId, tipo, "push")) || (await yaRegistrado(pedidoId, tipo, "mail"));
}

/**
 * `clave` evita el duplicado si un mismo envío se repite: durante 24 h, Resend manda una sola vez cada clave.
 */
async function postResend(datos: { from: string; to: string; subject: string; html: string }, clave?: string, reintento = false): Promise<string | null> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(clave ? { "Idempotency-Key": clave } : {}) },
      body: JSON.stringify({ ...datos, to: [datos.to] }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (res.ok) return null;
    // Demasiados envíos por segundo: se espera un momento y se reintenta una vez.
    if (res.status === 429 && !reintento) {
      await new Promise((r) => setTimeout(r, 1100));
      return postResend(datos, clave, true);
    }
    const cuerpo = (await res.json().catch(() => null)) as { message?: string } | null;
    return `Resend ${res.status}: ${cuerpo?.message ?? res.statusText}`;
  } catch (e) {
    return `Resend: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Manda un mail al cliente.
 * - MAILS_MODO=real + RESEND_API_KEY + MAIL_DOMINIO → sale de verdad, desde el remitente de su tipo. Las respuestas llegan a esa casilla.
 * - Cualquier otro caso (default) → modo prueba: no se le manda nada al cliente, queda "simulado".
 *   Si además hay MAIL_PRUEBA_A, se manda una copia a esas casillas para verlo en el celular.
 */
export async function mandarMail(m: {
  pedidoId: string | null;
  tipo: string;
  para: string;
  asunto: string;
  html: string;
}): Promise<EstadoMensaje> {
  const cfg = configMensajeria();
  let estado: EstadoMensaje;
  let error: string | null = null;

  if (cfg.mails.modo === "real") {
    if (!cfg.mails.resend || !cfg.mails.dominio) {
      estado = "error";
      error = `Modo real sin ${!cfg.mails.resend ? "RESEND_API_KEY" : "MAIL_DOMINIO"}`;
    } else {
      error = await postResend({ from: remitenteDe(m.tipo), to: m.para, subject: m.asunto, html: m.html }, m.pedidoId ? `${m.tipo}/${m.pedidoId}/${m.para}` : undefined);
      estado = error ? "error" : "enviado";
    }
  } else {
    estado = "simulado";
    if (cfg.mails.copiaPrueba) {
      for (const casilla of casillasPrueba()) {
        const fallo = await postResend({ from: remitenteDe(m.tipo), to: casilla, subject: `[Prueba] ${m.asunto}`, html: m.html });
        if (fallo) error = `No salió la copia de prueba a ${casilla} · ${fallo}`;
      }
    }
  }

  await registrar({ pedido_id: m.pedidoId, canal: "mail", tipo: m.tipo, para: m.para, asunto: m.asunto, cuerpo: m.html, estado, error });
  return estado;
}

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const aTexto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTIDADES[e]);

/** Manda un ejemplo a cada casilla de prueba y lo registra. Devuelve cuántos fallaron. */
export async function mandarPrueba(m: { tipo: string; asunto: string; html: string }): Promise<number> {
  let fallos = 0;
  for (const para of casillasPrueba()) {
    const asunto = `[Prueba] ${m.asunto}`;
    const error = process.env.RESEND_API_KEY ? await postResend({ from: remitenteDe(m.tipo), to: para, subject: asunto, html: m.html }) : "Falta RESEND_API_KEY";
    if (error) fallos++;
    await registrar({ pedido_id: null, canal: "mail", tipo: m.tipo, para, asunto, cuerpo: m.html, estado: error ? "error" : "enviado", error });
  }
  return fallos;
}

/** El aviso (texto con <b>, <a> y saltos de línea) armado como mail simple. */
export const htmlAviso = (texto: string) =>
  `<div style="background:#f4ede4;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;color:#2c221c">` +
  `<div style="max-width:520px;margin:0 auto;background:#fbf7f0;border:1px solid #e3d8c8;padding:20px 24px;font-size:16px;line-height:1.55">` +
  `${texto.replace(/\n/g, "<br>")}` +
  `<p style="margin:18px 0 0;font-size:13px;color:#7a6a5c;font-style:italic">Aviso automático del back office de Edén.</p></div></div>`;

/**
 * Aviso de venta a las socias: primero por notificación push; a la cuenta que no le llegó, por mail.
 * En modo prueba con MAIL_PRUEBA_A, esos mails van a esas casillas en lugar de a las cuentas.
 * Sin RESEND_API_KEY queda "simulado". Sin dominio verificado en Resend, solo le llega a la dueña de la cuenta de Resend.
 */
export async function mandarAviso(m: { pedidoId: string | null; tipo: string; texto: string }): Promise<EstadoMensaje> {
  const cfg = configMensajeria();
  const { data } = await supabaseServidor().from("admins").select("email");
  const cuentas = (data ?? []).map((a) => a.email as string);
  const asunto = aTexto(m.texto.split("\n")[0]);
  const html = htmlAviso(m.texto);

  // "🛒 Nuevo pedido web EDN-0012 · Ana P. · $75.000" → título hasta el primer "·"; en el cuerpo, el resto y los productos.
  const [titulo, ...detalle] = asunto.split(" · ");
  const entregas = await mandarPush({
    titulo,
    cuerpo: [detalle.join(" · "), ...m.texto.split("\n").slice(1).map(aTexto)].filter(Boolean).join("\n").slice(0, 180),
    url: m.pedidoId ? `/admin/pedidos/${m.pedidoId}` : "/admin",
    tag: m.pedidoId ? `pedido-${m.pedidoId}` : undefined,
  });
  let peor: EstadoMensaje = "simulado";
  for (const e of entregas) {
    if (!e.error) peor = "enviado";
    await registrar({ pedido_id: m.pedidoId, canal: "push", tipo: m.tipo, para: e.email, asunto, cuerpo: m.texto, estado: e.error ? "error" : "enviado", error: e.error });
  }
  const llegaron = new Set(entregas.filter((e) => !e.error).map((e) => e.email));
  const faltan = cuentas.filter((c) => !llegaron.has(c));
  const destinos = !faltan.length ? [] : cfg.mails.modo === "prueba" && casillasPrueba().length ? casillasPrueba() : faltan;

  for (const para of destinos) {
    let estado: EstadoMensaje = "simulado";
    let error: string | null = null;
    if (cfg.avisos.resend) {
      error = await postResend({ from: remitenteDe(m.tipo), to: para, subject: asunto, html }, m.pedidoId ? `${m.tipo}/${m.pedidoId}/${para}` : undefined);
      estado = error ? "error" : "enviado";
    }
    if (estado === "error" || (estado === "enviado" && peor === "simulado")) peor = estado;
    await registrar({ pedido_id: m.pedidoId, canal: "mail", tipo: m.tipo, para, asunto, cuerpo: html, estado, error });
  }
  return peor;
}
