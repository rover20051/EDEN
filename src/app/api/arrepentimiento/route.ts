import { randomInt } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { notificarArrepentimiento } from "@/lib/mensajes";
import { controlPublico, respuesta } from "@/lib/publico";
import { supabaseServidor } from "@/lib/supabase/servidor";

// Botón de arrepentimiento (Disposición 954/2025): sin registro ni trámites, y con un código de seguimiento.
const schema = z.object({
  nombre: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().max(160).pipe(z.email()),
  pedido: z.string().trim().max(20).optional(),
  motivo: z.string().trim().max(500).optional(),
  /** Honeypot: un campo invisible que solo llenan los bots. */
  sitio: z.string().max(200).optional(),
});

const LETRAS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const nuevoCodigo = () => `ARR-${Array.from({ length: 6 }, () => LETRAS[randomInt(LETRAS.length)]).join("")}`;

export async function POST(req: Request) {
  const rechazo = controlPublico(req);
  if (rechazo) return rechazo;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return respuesta({ error: "Revisá tu nombre y tu mail" }, 400);
  const { nombre, email, pedido, motivo, sitio } = parsed.data;
  if (sitio) return respuesta({ ok: true, codigo: nuevoCodigo() }); // bot: respondemos como si nada

  const sb = supabaseServidor();
  // El pedido se asocia solo si es de ese mail. La respuesta es la misma en todos los casos: acá no se revela quién compró.
  const { data: clientes } = await sb.from("clientes").select("id").eq("email", email);
  const ids = (clientes ?? []).map((c) => c.id as string);
  const { data: pedidos } = ids.length
    ? await sb.from("pedidos").select("id, numero").in("cliente_id", ids).eq("tipo", "venta").order("created_at", { ascending: false })
    : { data: [] };
  const numero = Number((pedido ?? "").replace(/\D/g, "")) || null;
  const elegido = (pedidos ?? []).find((p) => p.numero === numero) ?? pedidos?.[0] ?? null;

  let codigo = nuevoCodigo();
  const fila = { nombre, email, numero_pedido: pedido || null, motivo: motivo || null, pedido_id: elegido?.id ?? null };
  let { error } = await sb.from("arrepentimientos").insert({ ...fila, codigo });
  if (error?.code === "23505") {
    codigo = nuevoCodigo();
    ({ error } = await sb.from("arrepentimientos").insert({ ...fila, codigo }));
  }
  if (error) {
    console.error("[arrepentimiento]", error.message);
    return respuesta({ error: "No pudimos registrarlo. Probá de nuevo o escribinos." }, 503);
  }

  after(() =>
    notificarArrepentimiento({
      codigo,
      nombre,
      email,
      pedidoId: (elegido?.id as string | undefined) ?? null,
      numero: (elegido?.numero as number | undefined) ?? null,
      esCliente: ids.length > 0,
    }),
  );
  return respuesta({ ok: true, codigo });
}
