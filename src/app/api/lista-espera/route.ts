import { z } from "zod";
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

// Límite por IP en memoria (por instancia): suficiente para frenar a alguien apretando el botón sin parar.
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_VENTANA = 8;
const intentos = new Map<string, number[]>();

function demasiados(ip: string) {
  const ahora = Date.now();
  const lista = (intentos.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  lista.push(ahora);
  intentos.set(ip, lista);
  if (intentos.size > 5000) for (const [k, v] of intentos) if (ahora - v[v.length - 1] > VENTANA_MS) intentos.delete(k);
  return lista.length > MAX_POR_VENTANA;
}

const respuesta = (cuerpo: Record<string, unknown>, status = 200) => Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const origen = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origen && URL.parse(origen)?.host !== host) return respuesta({ error: "Origen no permitido" }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > 2048) return respuesta({ error: "Pedido muy grande" }, 413);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (demasiados(ip)) return respuesta({ error: "Muchos intentos seguidos. Probá de nuevo en unos minutos." }, 429);

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
