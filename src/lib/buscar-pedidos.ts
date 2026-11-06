import type { SupabaseClient } from "@supabase/supabase-js";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "EDN-0012", "edn 12" o "12" → número de pedido; si no, null. */
export function numeroBuscado(q: string): number | null {
  const m = /^(?:edn)?[\s-]*0*(\d{1,6})$/i.exec(q.trim());
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/** Clientes cuyo nombre, mail o WhatsApp coinciden, sin importar tildes ni mayúsculas. */
export async function clientesBuscados(sb: SupabaseClient, q: string): Promise<string[]> {
  const t = norm(q.trim());
  const digitos = q.replace(/\D/g, "");
  const { data } = await sb.from("clientes").select("id, nombre, email, whatsapp");
  return ((data ?? []) as { id: string; nombre: string; email: string | null; whatsapp: string | null }[])
    .filter(
      (c) =>
        norm(c.nombre).includes(t) ||
        norm(c.email ?? "").includes(t) ||
        (digitos.length >= 6 && digitos === q.replace(/[\s()+-]/g, "") && (c.whatsapp ?? "").replace(/\D/g, "").includes(digitos)),
    )
    .map((c) => c.id);
}
