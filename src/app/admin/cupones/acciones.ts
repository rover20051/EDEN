"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { aPesos } from "@/lib/format";

const fallo = (error: string): Resultado => ({ ok: false, error });
const codigoSchema = z
  .string()
  .trim()
  .transform((c) => c.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9_-]{3,30}$/, "El código va de 3 a 30 letras, números, - o _ (sin espacios)"));

const cuponSchema = z
  .object({
    codigo: codigoSchema,
    tipo: z.enum(["porcentaje", "monto"], { error: "Elegí si es % o monto fijo" }),
    valor: z.number().int().positive("Falta el descuento"),
    minimo: z.number().int().nonnegative(),
    usos_max: z.number().int().positive().nullable(),
    vence: z.iso.date().nullable(),
    nota: z.string().trim().max(200, "La nota es muy larga").nullable(),
  })
  .refine((c) => c.tipo !== "porcentaje" || c.valor <= 100, { message: "Un porcentaje no puede pasar de 100", path: ["valor"] });

export async function crearCupon(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  const texto = (k: string) => String(form.get(k) ?? "").trim();
  const parsed = cuponSchema.safeParse({
    codigo: texto("codigo"),
    tipo: form.get("tipo"),
    valor: aPesos(form.get("valor")) ?? 0,
    minimo: aPesos(form.get("minimo")) ?? 0,
    usos_max: aPesos(form.get("usos_max")) || null,
    vence: texto("vence") || null,
    nota: texto("nota") || null,
  });
  if (!parsed.success) return fallo(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("cupones").insert(parsed.data);
  if (error) return fallo(error.code === "23505" ? `Ya existe un cupón ${parsed.data.codigo}` : error.message);
  revalidatePath("/admin", "layout");
  return { ok: true, mensaje: `Cupón ${parsed.data.codigo} creado` };
}

export async function alternarCupon(codigo: string, activo: boolean): Promise<Resultado> {
  const c = codigoSchema.safeParse(codigo);
  if (!c.success) return fallo("Cupón inválido");
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("cupones").update({ activo }).eq("codigo", c.data);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true, mensaje: activo ? `${c.data} activado` : `${c.data} pausado` };
}

/** Solo se borra si ningún pedido lo usó (ni siquiera uno cancelado: el pedido guarda el código). */
export async function borrarCupon(codigo: string): Promise<Resultado> {
  const c = codigoSchema.safeParse(codigo);
  if (!c.success) return fallo("Cupón inválido");
  const { supabase } = await requireAdmin();
  const { count, error: e } = await supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("cupon", c.data);
  if (e) return fallo(e.message);
  if (count) return fallo(`${c.data} ya se usó en ${count} pedido${count === 1 ? "" : "s"}: pausalo en vez de borrarlo`);
  const { error } = await supabase.from("cupones").delete().eq("codigo", c.data);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true, mensaje: `${c.data} borrado` };
}
