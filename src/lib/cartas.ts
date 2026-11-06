import "server-only";
import { mailCarta } from "@/lib/mails/plantillas";
import { remitenteDe } from "@/lib/mails/remitentes";
import { supabaseServidor } from "@/lib/supabase/servidor";

// Cartas del jardín: salen como "broadcast" de Resend, que no cuenta contra el límite diario de los mails de pedidos
// y maneja el link de baja. Usa su propia clave con acceso completo; la de los mails de pedidos solo puede enviar.

const ESPERA_MS = 15000;

export const cartasConfiguradas = () => Boolean(process.env.RESEND_API_KEY_CARTAS && process.env.RESEND_SEGMENTO_CARTAS);

async function api(ruta: string, init?: { method: string; body?: unknown }) {
  const res = await fetch(`https://api.resend.com${ruta}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY_CARTAS}`, "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const datos = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, status: res.status, datos };
}

const ruta = (email: string) => `/contacts/${encodeURIComponent(email)}`;

/** Deja a la persona en la lista de Resend, activa y dentro del segmento. Nunca tira error: se reintenta al enviar la carta. */
export async function sincronizarContacto(email: string): Promise<boolean> {
  if (!cartasConfiguradas()) return false;
  const segmento = process.env.RESEND_SEGMENTO_CARTAS!;
  try {
    const creado = await api("/contacts", { method: "POST", body: { email, unsubscribed: false, segments: [{ id: segmento }] } });
    if (!creado.ok) {
      // Ya existía: se reactiva y se suma al segmento.
      const actualizado = await api(ruta(email), { method: "PATCH", body: { unsubscribed: false } });
      if (!actualizado.ok) return false;
      await api(`${ruta(email)}/segments/${segmento}`, { method: "POST" });
    }
    await supabaseServidor().from("suscriptores").update({ sincronizado_at: new Date().toISOString() }).eq("email", email);
    return true;
  } catch (e) {
    console.error("[cartas] no se pudo sincronizar un contacto:", e);
    return false;
  }
}

/** Pasa a nuestra lista las bajas hechas con el link de los mails. Devuelve cuántas hubo. */
export async function traerBajas(): Promise<number> {
  if (!cartasConfiguradas()) return 0;
  const sb = supabaseServidor();
  let despues: string | null = null;
  let total = 0;
  for (let pagina = 0; pagina < 50; pagina++) {
    const r = await api(`/contacts?limit=100${despues ? `&after=${despues}` : ""}`);
    if (!r.ok) throw new Error(`Resend ${r.status}: no pudimos leer los contactos`);
    const lista = (r.datos?.data ?? []) as { id: string; email: string; unsubscribed: boolean }[];
    const bajas = lista.filter((c) => c.unsubscribed).map((c) => c.email.toLowerCase());
    if (bajas.length) {
      const { data } = await sb.from("suscriptores").update({ baja_at: new Date().toISOString() }).in("email", bajas).is("baja_at", null).select("email");
      total += data?.length ?? 0;
    }
    if (!r.datos?.has_more || !lista.length) break;
    despues = lista[lista.length - 1].id;
  }
  return total;
}

/**
 * Manda la carta a todas las personas activas. Marca "enviando" solo si seguía en borrador: dos clics no mandan dos veces.
 * Si algo falla antes de mandar, vuelve a borrador para poder reintentar.
 */
export async function enviarBroadcast(cartaId: string): Promise<{ ok: true; destinatarios: number } | { ok: false; error: string }> {
  if (!cartasConfiguradas()) return { ok: false, error: "Faltan las claves de Resend para las cartas" };
  const sb = supabaseServidor();
  const { data: carta } = await sb.from("cartas").update({ estado: "enviando" }).eq("id", cartaId).eq("estado", "borrador").select("asunto, titulo, cuerpo").maybeSingle();
  if (!carta) return { ok: false, error: "Esta carta ya se envió o se está enviando" };
  const volver = async (error: string) => {
    await sb.from("cartas").update({ estado: "borrador" }).eq("id", cartaId);
    return { ok: false as const, error };
  };
  try {
    await traerBajas();
    const { data: pendientes } = await sb.from("suscriptores").select("email").is("baja_at", null).is("sincronizado_at", null).limit(300);
    for (const p of pendientes ?? []) await sincronizarContacto(p.email as string);
    const { count } = await sb.from("suscriptores").select("email", { count: "exact", head: true }).is("baja_at", null).not("sincronizado_at", "is", null);
    if (!count) return await volver("Todavía no hay suscriptores para mandarle la carta");

    const { html } = mailCarta(carta);
    const r = await api("/broadcasts", {
      method: "POST",
      body: { segment_id: process.env.RESEND_SEGMENTO_CARTAS, from: remitenteDe("carta"), subject: carta.asunto, html, name: carta.asunto.slice(0, 80), send: true },
    });
    if (!r.ok) return await volver(`Resend ${r.status}: ${String(r.datos?.message ?? "no se pudo enviar")}`);
    await sb.from("cartas").update({ estado: "enviada", destinatarios: count, resend_id: String(r.datos?.id ?? ""), enviada_at: new Date().toISOString() }).eq("id", cartaId);
    return { ok: true, destinatarios: count };
  } catch (e) {
    return await volver(e instanceof Error ? e.message : String(e));
  }
}
