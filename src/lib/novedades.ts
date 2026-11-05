import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Novedad } from "@/components/campana";
import { MEDIOS } from "@/lib/textos";

const HORAS_CAMPANA = 72;

/** Para la campanita: pedidos web nuevos y pagos confirmados de las últimas 72 h (sin salidas sin cobro). */
export async function novedadesCampana(supabase: SupabaseClient): Promise<Novedad[]> {
  const desde = new Date(Date.now() - HORAS_CAMPANA * 3600 * 1000).toISOString();
  const consulta = (columnas: string) =>
    supabase
      .from("pedidos")
      .select(columnas)
      .or(`and(canal.eq.web,created_at.gte.${desde}),pagado_at.gte.${desde}`)
      .neq("estado", "cancelado")
      .order("created_at", { ascending: false })
      .limit(40);
  const base = "id, numero, canal, medio_pago, total, created_at, pagado_at, cliente:clientes(nombre)";
  // "tipo" existe desde la migración 0006: si todavía no corrió, se consulta sin esa columna.
  let { data, error } = await consulta(`${base}, tipo`);
  if (error) ({ data, error } = await consulta(base));
  if (error || !data) return [];

  type Fila = {
    id: string;
    numero: number;
    canal: string;
    medio_pago: string;
    total: number;
    created_at: string;
    pagado_at: string | null;
    tipo?: string;
    cliente: { nombre: string } | null;
  };
  const medio = (m: string) => (m === "nave" ? "Tarjeta" : (MEDIOS[m as keyof typeof MEDIOS] ?? m));
  return (data as unknown as Fila[])
    .filter((p) => p.tipo !== "salida")
    .flatMap((p) => {
      const comun = { pedidoId: p.id, numero: p.numero, nombre: p.cliente?.nombre ?? "", total: p.total, medio: medio(p.medio_pago) };
      const lista: Novedad[] = [];
      if (p.canal === "web" && p.created_at >= desde) lista.push({ ...comun, clave: `${p.id}:nuevo`, tipo: "nuevo", cuando: p.created_at });
      if (p.pagado_at && p.pagado_at >= desde) lista.push({ ...comun, clave: `${p.id}:pagado`, tipo: "pagado", cuando: p.pagado_at });
      return lista;
    })
    .sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando))
    .slice(0, 20);
}
