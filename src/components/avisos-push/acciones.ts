"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { endpointValido, mandarPush } from "@/lib/push";

const suscripcionSchema = z.object({
  endpoint: z.string().max(1000).refine(endpointValido, "Dirección de avisos inválida"),
  p256dh: z.string().min(1).max(300),
  auth: z.string().min(1).max(300),
  dispositivo: z.string().max(200).nullable(),
});

/** Guarda este dispositivo para recibir avisos. Si ya estaba, pasa a la cuenta con la que se entró ahora. */
export async function guardarSuscripcion(datos: z.input<typeof suscripcionSchema>): Promise<Resultado> {
  const parsed = suscripcionSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("suscripciones_push").upsert({ ...parsed.data, admin_email: admin.email }, { onConflict: "endpoint" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/ajustes/mensajes");
  return { ok: true, mensaje: "Avisos activados en este dispositivo" };
}

export async function quitarSuscripcion(endpoint: string): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("suscripciones_push").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/ajustes/mensajes");
  return { ok: true, mensaje: "Avisos desactivados en este dispositivo" };
}

/** Manda un aviso de prueba a los dispositivos de la cuenta con la que se entró. */
export async function probarPush(): Promise<Resultado> {
  const { admin } = await requireAdmin();
  const entregas = await mandarPush(
    { titulo: "🛒 Así llega un aviso de venta", cuerpo: "Prueba del back office de Edén. Al tocarlo se abre el pedido.", url: "/admin" },
    admin.email,
  );
  if (!entregas.length) return { ok: false, error: "No hay dispositivos activados en tu cuenta" };
  const fallo = entregas.find((e) => e.error);
  return fallo ? { ok: false, error: fallo.error! } : { ok: true, mensaje: "Aviso de prueba enviado" };
}
