import "server-only";
import { supabaseServidor } from "@/lib/supabase/servidor";

// Cómo sale cada mensaje (Resend: mails al cliente y avisos de venta a las socias) y su registro en la tabla "mensajes".
// Nunca tira error: devuelve el estado con que quedó registrado.

export type EstadoMensaje = "simulado" | "enviado" | "error";
type Canal = "mail" | "telegram";

const ESPERA_MS = 8000;

/** Qué está configurado (sin exponer valores). Lo muestra Ajustes → Mails y avisos. */
export function configMensajeria() {
  const real = process.env.MAILS_MODO === "real";
  return {
    mails: {
      modo: real ? ("real" as const) : ("prueba" as const),
      resend: Boolean(process.env.RESEND_API_KEY),
      remitente: Boolean(process.env.MAIL_REMITENTE),
      copiaPrueba: Boolean(process.env.MAIL_PRUEBA_A && process.env.RESEND_API_KEY),
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

async function postResend(datos: { from: string; to: string; subject: string; html: string; reply_to?: string }): Promise<string | null> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...datos, to: [datos.to] }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (res.ok) return null;
    const cuerpo = (await res.json().catch(() => null)) as { message?: string } | null;
    return `Resend ${res.status}: ${cuerpo?.message ?? res.statusText}`;
  } catch (e) {
    return `Resend: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Manda un mail al cliente.
 * - MAILS_MODO=real + RESEND_API_KEY + MAIL_REMITENTE → sale de verdad.
 * - Cualquier otro caso (default) → modo prueba: no se le manda nada al cliente, queda "simulado".
 *   Si además hay MAIL_PRUEBA_A, se manda una copia a esa dirección para verlo en el celular.
 */
export async function mandarMail(m: {
  pedidoId: string | null;
  tipo: string;
  para: string;
  asunto: string;
  html: string;
  responderA?: string;
}): Promise<EstadoMensaje> {
  const cfg = configMensajeria();
  const responder = m.responderA && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.responderA) ? m.responderA : undefined;
  let estado: EstadoMensaje;
  let error: string | null = null;

  if (cfg.mails.modo === "real") {
    if (!cfg.mails.resend || !cfg.mails.remitente) {
      estado = "error";
      error = `Modo real sin ${!cfg.mails.resend ? "RESEND_API_KEY" : "MAIL_REMITENTE"}`;
    } else {
      error = await postResend({ from: process.env.MAIL_REMITENTE!, to: m.para, subject: m.asunto, html: m.html, reply_to: responder });
      estado = error ? "error" : "enviado";
    }
  } else {
    estado = "simulado";
    if (cfg.mails.copiaPrueba) {
      const fallo = await postResend({
        from: process.env.MAIL_REMITENTE || "Edén (prueba) <onboarding@resend.dev>",
        to: process.env.MAIL_PRUEBA_A!,
        subject: `[Prueba] ${m.asunto}`,
        html: m.html,
      });
      if (fallo) error = `No salió la copia de prueba · ${fallo}`;
    }
  }

  await registrar({ pedido_id: m.pedidoId, canal: "mail", tipo: m.tipo, para: m.para, asunto: m.asunto, cuerpo: m.html, estado, error });
  return estado;
}

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const aTexto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTIDADES[e]);

/** El aviso (texto con <b>, <a> y saltos de línea) armado como mail simple. */
export const htmlAviso = (texto: string) =>
  `<div style="background:#f4ede4;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;color:#2c221c">` +
  `<div style="max-width:520px;margin:0 auto;background:#fbf7f0;border:1px solid #e3d8c8;padding:20px 24px;font-size:16px;line-height:1.55">` +
  `${texto.replace(/\n/g, "<br>")}` +
  `<p style="margin:18px 0 0;font-size:13px;color:#7a6a5c;font-style:italic">Aviso automático del back office de Edén.</p></div></div>`;

/**
 * Aviso de venta a las socias: un mail a cada cuenta del back office (tabla admins).
 * Sin RESEND_API_KEY queda "simulado". Sin dominio verificado en Resend, solo le llega a la dueña de la cuenta de Resend.
 */
export async function mandarAviso(m: { pedidoId: string | null; tipo: string; texto: string }): Promise<EstadoMensaje> {
  const cfg = configMensajeria();
  const { data } = await supabaseServidor().from("admins").select("email");
  const destinos = (data ?? []).map((a) => a.email as string);
  const asunto = aTexto(m.texto.split("\n")[0]);
  const html = htmlAviso(m.texto);

  let peor: EstadoMensaje = "simulado";
  for (const para of destinos) {
    let estado: EstadoMensaje = "simulado";
    let error: string | null = null;
    if (cfg.avisos.resend) {
      error = await postResend({ from: process.env.MAIL_REMITENTE || "Edén ventas <onboarding@resend.dev>", to: para, subject: asunto, html });
      estado = error ? "error" : "enviado";
    }
    if (estado === "error" || (estado === "enviado" && peor === "simulado")) peor = estado;
    await registrar({ pedido_id: m.pedidoId, canal: "mail", tipo: m.tipo, para, asunto, cuerpo: html, estado, error });
  }
  return peor;
}
