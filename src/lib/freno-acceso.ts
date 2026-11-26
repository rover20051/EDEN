import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { supabaseServidor } from "@/lib/supabase/servidor";

// Freno a quien prueba contraseñas: hasta MAXIMO intentos cada VENTANA por conexión (migración 0014).
// Se cuenta por conexión y no por mail, para que nadie pueda dejar afuera a una cuenta equivocándose a propósito.
const MAXIMO = 8;
const VENTANA = 15 * 60_000;

export const AVISO_FRENO = "Demasiados intentos. Probá de nuevo en 15 minutos.";

export async function porConexion() {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Anota el intento y dice si hay que frenarlo. Se anota antes de contar para que varios a la vez no pasen juntos.
 * Si la base falla (o falta la migración) deja pasar: es preferible a que nadie pueda entrar.
 */
export async function frenarIntento(quien: string): Promise<boolean> {
  const sb = supabaseServidor();
  const anotado = await sb.from("intentos_acceso").insert({ huella: quien });
  const desde = new Date(Date.now() - VENTANA).toISOString();
  const contado = await sb.from("intentos_acceso").select("*", { count: "exact", head: true }).eq("huella", quien).gte("creado", desde);
  const error = anotado.error ?? contado.error;
  if (error) console.error("freno de acceso:", error.message);
  return (contado.count ?? 0) > MAXIMO;
}

/** Entró bien: sus intentos se olvidan, y de paso se borran los de más de un día. */
export async function olvidarIntentos(quien: string) {
  const sb = supabaseServidor();
  const ayer = new Date(Date.now() - 24 * 3600_000).toISOString();
  const borrados = await Promise.all([
    sb.from("intentos_acceso").delete().eq("huella", quien),
    sb.from("intentos_acceso").delete().lt("creado", ayer),
  ]);
  for (const { error } of borrados) if (error) console.error("freno de acceso:", error.message);
}
