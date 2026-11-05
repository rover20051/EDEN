import { requireAdmin } from "@/lib/auth";
import { FormNuevoPedido, type CuponVenta, type PackVenta, type ProductoVenta } from "./form";

type Tanda = { producto_id: string; fecha: string; numero: number; disponibles: number; costo_vendible: number };

export default async function NuevoPedido({ searchParams }: PageProps<"/admin/pedidos/nuevo">) {
  const { tipo } = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: productos }, { data: stock }, { data: ajustes }, { data: packs }, { data: tandas }, { data: cupones }, { data: usos }] = await Promise.all([
    supabase.from("productos").select("id, nombre, diseno, tipo, precio, activo").order("orden"),
    supabase.from("v_stock").select("producto_id, disponibles"),
    supabase.from("ajustes").select("precio_set").eq("id", 1).single(),
    supabase.from("packs").select("id, nombre, precio, items:pack_items(producto_id, cantidad)").eq("activo", true).order("orden"),
    supabase.from("v_tandas").select("producto_id, fecha, numero, disponibles, costo_vendible"),
    supabase.from("cupones").select("codigo, tipo, valor, minimo, usos_max, vence, activo").eq("activo", true),
    supabase.from("pedidos").select("cupon").not("cupon", "is", null).neq("estado", "cancelado"),
  ]);

  const disp = new Map((stock ?? []).map((s) => [s.producto_id as string, s.disponibles as number]));

  // Tandas con lugar, de la más vieja a la más nueva: así sale cada pieza (FIFO), igual que en la base.
  const porProducto = new Map<string, { disponibles: number; costo: number }[]>();
  for (const t of ((tandas ?? []) as Tanda[]).slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero)) {
    if (t.disponibles <= 0) continue;
    const lista = porProducto.get(t.producto_id) ?? [];
    lista.push({ disponibles: t.disponibles, costo: t.costo_vendible });
    porProducto.set(t.producto_id, lista);
  }

  const lista: ProductoVenta[] = (productos ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    diseno: p.diseno,
    tipo: p.tipo,
    precio: p.precio,
    activo: p.activo,
    stock: disp.get(p.id) ?? 0,
    tandas: porProducto.get(p.id) ?? [],
  }));

  const cuenta = new Map<string, number>();
  for (const u of usos ?? []) cuenta.set(u.cupon as string, (cuenta.get(u.cupon as string) ?? 0) + 1);
  const listaCupones: CuponVenta[] = (cupones ?? []).map((c) => ({ ...c, usos: cuenta.get(c.codigo) ?? 0 }));

  return (
    <FormNuevoPedido
      productos={lista}
      packs={(packs ?? []) as PackVenta[]}
      cupones={listaCupones}
      precioSet={ajustes?.precio_set ?? 0}
      modoInicial={tipo === "salida" ? "salida" : "venta"}
    />
  );
}
