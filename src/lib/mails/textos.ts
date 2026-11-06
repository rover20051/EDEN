import "server-only";
import type { TextosMail } from "@/lib/mails/plantillas";
import { supabaseServidor } from "@/lib/supabase/servidor";

/** Textos cambiados desde el back office. Si la tabla todavía no existe, los mails salen con sus textos originales. */
export async function textosDeMail(tipo: string): Promise<TextosMail | undefined> {
  try {
    const { data } = await supabaseServidor().from("textos_mail").select("asunto, titulo, bajada, nota").eq("tipo", tipo).maybeSingle();
    return data ?? undefined;
  } catch {
    return undefined;
  }
}
