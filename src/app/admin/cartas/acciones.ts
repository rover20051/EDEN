"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { enviarBroadcast, traerBajas } from "@/lib/cartas";
import { mandarPrueba } from "@/lib/mails/envio";
import { mailCarta } from "@/lib/mails/plantillas";
import { casillasPrueba } from "@/lib/mails/remitentes";

export type ResultadoCarta = (Resultado & { id?: string }) | null;

const schema = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  asunto: z.string().trim().min(1, "Falta el asunto").max(120, "El asunto es muy largo"),
  titulo: z.string().trim().min(1, "Falta el título").max(120, "El título es muy largo"),
  cuerpo: z.string().trim().min(1, "Falta el texto de la carta").max(20000, "La carta es muy larga"),
});

const refrescar = () => revalidatePath("/admin/cartas");

export async function guardarCarta(_prev: ResultadoCarta, form: FormData): Promise<ResultadoCarta> {
  const parsed = schema.safeParse(Object.fromEntries(["id", "asunto", "titulo", "cuerpo"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { id, ...d } = parsed.data;
  const { supabase } = await requireAdmin();
  const r = id
    ? await supabase.from("cartas").update({ ...d, updated_at: new Date().toISOString() }).eq("id", id).eq("estado", "borrador").select("id").maybeSingle()
    : await supabase.from("cartas").insert(d).select("id").single();
  if (r.error) return { ok: false, error: r.error.message };
  if (!r.data) return { ok: false, error: "Esta carta ya se envió: no se puede cambiar" };
  refrescar();
  return { ok: true, mensaje: "Borrador guardado", id: r.data.id };
}

export async function borrarCarta(id: string): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("cartas").delete().eq("id", id).eq("estado", "borrador");
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true, mensaje: "Borrador eliminado" };
}

/** Prueba a las casillas de prueba, desde el mismo remitente. En la prueba, "Darme de baja" lleva a la web. */
export async function probarCarta(id: string): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const { data: carta } = await supabase.from("cartas").select("asunto, titulo, cuerpo").eq("id", id).maybeSingle();
  if (!carta) return { ok: false, error: "No encontramos la carta" };
  if (!casillasPrueba().length) return { ok: false, error: "Falta MAIL_PRUEBA_A con las casillas de prueba" };
  const { asunto, html } = mailCarta(carta, `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/`);
  const fallos = await mandarPrueba({ tipo: "carta", asunto, html });
  return fallos ? { ok: false, error: `Fallaron ${fallos} envíos. Mirá el detalle en Mails y avisos.` } : { ok: true, mensaje: `Prueba enviada a ${casillasPrueba().length} casillas` };
}

export async function enviarCarta(id: string): Promise<Resultado> {
  await requireAdmin();
  const r = await enviarBroadcast(id);
  refrescar();
  return r.ok ? { ok: true, mensaje: `Carta enviada a ${r.destinatarios} ${r.destinatarios === 1 ? "persona" : "personas"}` } : { ok: false, error: r.error };
}

export async function actualizarBajas(): Promise<Resultado> {
  await requireAdmin();
  try {
    const n = await traerBajas();
    refrescar();
    return { ok: true, mensaje: n ? `${n} ${n === 1 ? "baja nueva" : "bajas nuevas"}` : "No hay bajas nuevas" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
