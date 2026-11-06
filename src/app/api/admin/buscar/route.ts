import { requireAdmin } from "@/lib/auth";
import { clientesBuscados, numeroBuscado } from "@/lib/buscar-pedidos";

export type PedidoEncontrado = { id: string; numero: number; nombre: string; total: number; estado: string };

const SIN_CACHE = { headers: { "Cache-Control": "no-store" } };

/** Pedidos que coinciden con lo que se escribe en la paleta (⌘K). Busca en todos los estados. */
export async function GET(req: Request) {
  const { supabase } = await requireAdmin();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!q) return Response.json([], SIN_CACHE);

  let consulta = supabase.from("pedidos").select("id, numero, total, estado, cliente:clientes!inner(nombre)").order("created_at", { ascending: false }).limit(6);
  const n = numeroBuscado(q);
  consulta = n ? consulta.eq("numero", n) : consulta.in("cliente_id", await clientesBuscados(supabase, q));
  const { data } = await consulta;

  const lista: PedidoEncontrado[] = (data ?? []).map((p) => ({
    id: p.id,
    numero: p.numero,
    total: p.total,
    estado: p.estado,
    nombre: (p.cliente as unknown as { nombre: string }).nombre,
  }));
  return Response.json(lista, SIN_CACHE);
}
