"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { PLANTILLAS } from "@/lib/mails/plantillas";

const texto = (max: number) => z.string().trim().max(max, "Es demasiado largo").transform((v) => v || null);
const schema = z.object({ asunto: texto(120), titulo: texto(120), bajada: texto(300), nota: texto(800) });

/** Guarda los textos cambiados de un mail. Si quedan todos vacíos, vuelve a los originales. */
export async function guardarTextos(tipo: string, _prev: Resultado | null, form: FormData): Promise<Resultado> {
  if (!(tipo in PLANTILLAS)) return { ok: false, error: "Ese mail no existe" };
  const parsed = schema.safeParse(Object.fromEntries(["asunto", "titulo", "bajada", "nota"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { supabase, admin } = await requireAdmin();
  const vacio = Object.values(parsed.data).every((v) => !v);
  const { error } = vacio
    ? await supabase.from("textos_mail").delete().eq("tipo", tipo)
    : await supabase.from("textos_mail").upsert({ tipo, ...parsed.data, updated_by: admin.email, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/ajustes/mensajes", "layout");
  return { ok: true, mensaje: vacio ? "Volvió a los textos originales" : "Textos guardados" };
}

export async function volverAlOriginal(tipo: string): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("textos_mail").delete().eq("tipo", tipo);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/ajustes/mensajes", "layout");
  return { ok: true, mensaje: "Volvió a los textos originales" };
}
