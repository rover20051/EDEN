import { after } from "next/server";
import { z } from "zod";
import { sincronizarContacto } from "@/lib/cartas";
import { controlPublico, respuesta } from "@/lib/publico";
import { supabaseServidor } from "@/lib/supabase/servidor";

// Suscripción a las Cartas del jardín desde la web. Se guarda acá siempre; a Resend se copia aparte.
const schema = z.object({
  email: z.string().trim().toLowerCase().max(160).pipe(z.email()),
  acepto: z.literal(true),
  /** Honeypot: un campo invisible que solo llenan los bots. */
  sitio: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const rechazo = controlPublico(req);
  if (rechazo) return rechazo;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return respuesta({ error: "Revisá el correo y aceptá recibir las cartas" }, 400);
  const { email, sitio } = parsed.data;
  if (sitio) return respuesta({ ok: true }); // bot: respondemos como si nada

  // Si se había dado de baja y vuelve a anotarse, queda activa otra vez.
  const { error } = await supabaseServidor()
    .from("suscriptores")
    .upsert({ email, baja_at: null, consentimiento_at: new Date().toISOString(), origen: "web", sincronizado_at: null }, { onConflict: "email" });
  if (error) return respuesta({ error: "No pudimos registrar tu correo" }, 503);

  after(() => sincronizarContacto(email));
  return respuesta({ ok: true });
}
