"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { PROVINCIAS } from "@/lib/provincias";

const pesos = z.number().int().nonnegative().max(10_000_000, "El precio parece demasiado alto");

const enviosSchema = z.object({
  /** Provincia → precio. Sin precio (null) = "a coordinar" (no se guarda la clave). 0 = sin cargo. */
  tarifas: z.partialRecord(z.enum(PROVINCIAS), pesos.nullable()),
  gratis_desde: pesos.positive("El envío gratis tiene que ser desde un monto mayor a 0").nullable(),
});
export type DatosEnvios = z.input<typeof enviosSchema>;

/** Guarda la tabla de envíos por provincia y el "envío gratis desde". */
export async function guardarEnvios(datos: DatosEnvios): Promise<Resultado> {
  const parsed = enviosSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  // Se guardan solo las provincias con precio, en el orden de la lista.
  const tarifas: Record<string, number> = {};
  for (const p of PROVINCIAS) {
    const v = parsed.data.tarifas[p];
    if (v != null) tarifas[p] = v;
  }

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("ajustes")
    .update({ envio_tarifas: tarifas, envio_gratis_desde: parsed.data.gratis_desde, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin", "layout");
  const n = Object.keys(tarifas).length;
  return { ok: true, mensaje: `Envíos guardados (${n} de ${PROVINCIAS.length} provincias con precio)` };
}
