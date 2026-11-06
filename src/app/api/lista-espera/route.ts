import { z } from "zod";
import { controlPublico, respuesta } from "@/lib/publico";
import { supabaseServidor } from "@/lib/supabase/servidor";

// "Avisame cuando vuelva" de la web: anota el mail en la lista de espera del producto.
// El aviso lo manda el back office cuando se carga una tanda nueva (una sola vez por persona).

const schema = z.object({
  producto: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  email: z.string().trim().toLowerCase().max(160).pipe(z.email("Revisá el mail")),
  nombre: z.string().trim().max(80).optional(),
  /** Honeypot: un campo invisible que solo llenan los bots. */
  sitio: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const rechazo = controlPublico(req);
  if (rechazo) return rechazo;

  const cuerpo = await req.json().catch(() => null);
  const parsed = schema.safeParse(cuerpo);
  if (!parsed.success) return respuesta({ error: parsed.error.issues.some((i) => i.path[0] === "email") ? "Revisá el mail, por ejemplo nombre@gmail.com." : "Datos inválidos" }, 400);
  const { producto, email, nombre, sitio } = parsed.data;
  if (sitio) return respuesta({ ok: true }); // bot: respondemos como si nada

  const sb = supabaseServidor();
  const { data: prod } = await sb.from("productos").select("id").eq("slug", producto).maybeSingle();
  if (!prod) return respuesta({ error: "No encontramos ese producto" }, 404);

  // Si ya estaba anotada (aunque ya la hayamos avisado), vuelve a quedar esperando.
  const { error } = await sb
    .from("lista_espera")
    .upsert({ producto_id: prod.id, email, nombre: nombre || null, avisado_at: null }, { onConflict: "producto_id,email" });
  if (error) return respuesta({ error: "No pudimos anotarte. Probá de nuevo en un rato." }, 503);

  return respuesta({ ok: true });
}
