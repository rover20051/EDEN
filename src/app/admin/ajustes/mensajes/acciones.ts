"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { htmlAviso, mandarPrueba } from "@/lib/mails/envio";
import { PLANTILLAS, vistaPrevia, type Plantilla } from "@/lib/mails/plantillas";
import { casillasPrueba } from "@/lib/mails/remitentes";
import { ejemplosAvisos } from "@/lib/mensajes";

/** Manda a las casillas de prueba los mails de ejemplo, cada uno desde su remitente. Nunca le llega nada a un cliente. */
export async function mandarPruebas(cual: string): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const casillas = casillasPrueba();
  if (!casillas.length) return { ok: false, error: "Falta MAIL_PRUEBA_A con las casillas de prueba" };

  const { data: aj } = await supabase.from("ajustes").select("alias_transferencia, email_contacto, whatsapp_contacto, horas_vencimiento_transferencia").eq("id", 1).maybeSingle();
  const contacto = {
    alias: aj?.alias_transferencia ?? "",
    email: aj?.email_contacto ?? "",
    whatsapp: aj?.whatsapp_contacto ?? "",
    horas: aj?.horas_vencimiento_transferencia ?? 48,
  };
  const mails = (Object.keys(PLANTILLAS) as Plantilla[]).map((tipo) => ({ tipo, ...vistaPrevia(tipo, contacto) }));
  const avisos = (await ejemplosAvisos()).map((a) => ({ tipo: a.tipo, asunto: a.titulo, html: htmlAviso(a.texto) }));
  const lista = [...mails, ...avisos].filter((m) => cual === "todas" || m.tipo === cual);
  if (!lista.length) return { ok: false, error: "No encontramos ese mail" };

  let fallos = 0;
  for (const m of lista) fallos += await mandarPrueba(m);
  revalidatePath("/admin/ajustes/mensajes");
  const total = lista.length * casillas.length;
  return fallos ? { ok: false, error: `Fallaron ${fallos} de ${total}. Mirá el detalle en el registro.` } : { ok: true, mensaje: `Salieron ${total} mails de prueba` };
}
