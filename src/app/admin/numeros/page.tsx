import { requireAdmin } from "@/lib/auth";
import { planSchema, type Tipo } from "@/lib/plan";
import { Numeros } from "./numeros";
import type { SalidaFila, TandaFila } from "./tandas";

export const metadata = { title: "Números · Edén" };

export default async function PaginaNumeros({ searchParams }: PageProps<"/admin/numeros">) {
  const { tab } = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: ajustes }, { data: gastos }, { data: productos }, { data: vendidos }, { data: cobros }, { data: tandas }, { data: salidas }] = await Promise.all([
    supabase.from("ajustes").select("plan").eq("id", 1).single(),
    supabase.from("gastos").select("categoria, monto"),
    supabase.from("productos").select("id, tipo, precio, activo"),
    supabase
      .from("pedido_items")
      .select("cantidad, producto:productos(tipo), pedido:pedidos!inner(estado, tipo)")
      .in("pedido.estado", ["pagado", "en_preparacion", "despachado", "entregado"])
      .eq("pedido.tipo", "venta"),
    supabase.from("v_ganancia_pedido").select("neto, costo_envio, costo_productos"),
    supabase.from("v_tandas").select("*").order("fecha").order("numero"),
    supabase.from("v_salidas").select("*").order("created_at", { ascending: false }),
  ]);

  const plan = planSchema.safeParse(ajustes?.plan);
  if (!plan.success) {
    return <p className="font-caption-italic italic text-error">Falta correr el SQL de Números en Supabase (instalar-numeros.sql).</p>;
  }

  const porCategoria: Record<string, number> = {};
  for (const g of gastos ?? []) porCategoria[g.categoria] = (porCategoria[g.categoria] ?? 0) + g.monto;
  const activos = (productos ?? []).filter((p) => p.activo);
  const minimo = (t: Tipo) => Math.min(...activos.filter((p) => p.tipo === t).map((p) => p.precio));
  // Solo ventas: las salidas sin cobro no recuperan la inversión.
  const vendidas: Record<Tipo, number> = { biblia: 0, journal: 0 };
  for (const v of (vendidos ?? []) as unknown as { cantidad: number; producto: { tipo: Tipo } }[]) vendidas[v.producto.tipo] += v.cantidad;

  const num = (n: unknown) => Number(n ?? 0);
  const lista = cobros ?? [];
  const ventas = {
    pedidos: lista.length,
    neto: lista.reduce((s, c) => s + num(c.neto), 0),
    costoEnvio: lista.reduce((s, c) => s + num(c.costo_envio), 0),
    costoProductos: lista.reduce((s, c) => s + num(c.costo_productos), 0),
  };
  const filasSalidas: SalidaFila[] = ((salidas ?? []) as SalidaFila[]).map((s) => ({
    ...s,
    piezas: num(s.piezas),
    costo_productos: num(s.costo_productos),
    costo_envio: num(s.costo_envio),
  }));

  return (
    <Numeros
      planGuardado={plan.data}
      reales={{
        desarrolloGastado: porCategoria.desarrollo ?? 0,
        precio: { biblia: minimo("biblia") || 0, journal: minimo("journal") || 0 },
      }}
      gastado={porCategoria}
      vendidas={vendidas}
      recuperado={ventas.neto - ventas.costoEnvio}
      ventas={ventas}
      tandas={(tandas ?? []) as TandaFila[]}
      salidas={filasSalidas}
      precios={Object.fromEntries((productos ?? []).map((p) => [p.id as string, p.precio as number]))}
      pestanaInicial={typeof tab === "string" ? tab : undefined}
    />
  );
}
