import "server-only";
import webpush from "web-push";
import { supabaseServidor } from "@/lib/supabase/servidor";

// Avisos a las socias por notificación push. Nunca tira error: quien no lo reciba, recibe el aviso por mail.

export type Notificacion = { titulo: string; cuerpo: string; url: string; tag?: string };
export type EntregaPush = { email: string; error: string | null };
type Suscripcion = { endpoint: string; p256dh: string; auth: string; admin_email: string };

const claves = () => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
};

export const pushConfigurado = () => claves() !== null;

/** Solo los servicios de push de los navegadores: el back office nunca le pega a una dirección que venga de un formulario. */
export function endpointValido(url: string) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

/**
 * Manda la notificación a cada dispositivo activado (o solo a los de `soloEmail`) y devuelve el resultado por cuenta:
 * con que le llegue a uno de sus dispositivos, la cuenta queda sin error. Da de baja los dispositivos que ya no existen.
 */
export async function mandarPush(n: Notificacion, soloEmail?: string): Promise<EntregaPush[]> {
  const vapidDetails = claves();
  if (!vapidDetails) return [];
  try {
    const sb = supabaseServidor();
    let consulta = sb.from("suscripciones_push").select("endpoint, p256dh, auth, admin_email");
    if (soloEmail) consulta = consulta.eq("admin_email", soloEmail);
    // Sin la migración 0008 la consulta falla y los avisos siguen saliendo por mail.
    const { data } = await consulta;
    const resultado = new Map<string, string | null>();
    await Promise.all(
      ((data ?? []) as Suscripcion[]).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(n), {
            vapidDetails,
            TTL: 24 * 3600,
            urgency: "high",
            timeout: 8000,
          });
          resultado.set(s.admin_email, null);
        } catch (e) {
          const codigo = (e as { statusCode?: number }).statusCode;
          if (codigo === 404 || codigo === 410) await sb.from("suscripciones_push").delete().eq("endpoint", s.endpoint);
          if (!resultado.has(s.admin_email)) resultado.set(s.admin_email, `Push ${codigo ?? ""}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
        }
      }),
    );
    return [...resultado].map(([email, error]) => ({ email, error }));
  } catch (e) {
    console.error("[push] no se pudo mandar:", e);
    return [];
  }
}
