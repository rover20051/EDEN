import { requireAdmin } from "@/lib/auth";
import { categoriasDeProductos } from "@/lib/categorias";
import { ars, fecha } from "@/lib/format";
import { urlFotoPublica } from "@/lib/fotos";
import { TablaCatalogo, type ProductoCatalogo } from "./catalogo";
import type { Espera } from "./espera";
import { Packs, type PackAdmin } from "./packs";
import { NuevoProducto } from "./producto";
import { FormTanda } from "./tanda";

const tarjeta = "relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-container-lowest p-3 shadow-sm";

type FilaProducto = Omit<ProductoCatalogo, "stock" | "espera" | "foto_url" | "verbo" | "descripcion" | "foto_path" | "categoria_nombre" | "frase" | "medidas"> &
  Partial<Pick<ProductoCatalogo, "verbo" | "descripcion" | "foto_path">>;

const BASE = "id, nombre, tipo, diseno, precio, precio_anterior, etiqueta, activo";

export default async function Productos({ searchParams }: PageProps<"/admin/productos">) {
  const { tanda } = await searchParams;
  const { supabase } = await requireAdmin();
  const [completo, { data: stock }, { data: lotes }, packsRes, { data: espera }, categorias, { data: fichas }] = await Promise.all([
    supabase.from("productos").select(`${BASE}, verbo, descripcion, foto_path`).order("orden"),
    supabase.from("v_stock").select("producto_id, disponibles"),
    supabase
      .from("lotes")
      .select("id, numero, unidades, merma, costo_unitario, fecha, producto:productos(nombre)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("packs").select("id, slug, nombre, descripcion, precio, precio_anterior, etiqueta, foto_path, activo, orden, pack_items(producto_id, cantidad)").order("orden"),
    supabase.from("lista_espera").select("producto_id, email, nombre, created_at, avisado_at").order("created_at", { ascending: false }).limit(2000),
    categoriasDeProductos(supabase),
    // Aparte: frase y medidas de la ficha llegan con la migración 0012; sin ella, la pantalla anda igual.
    supabase.from("productos").select("id, frase, medidas"),
  ]);
  const fichaDe = new Map((fichas ?? []).map((f) => [f.id as string, { frase: (f.frase as string | null) ?? null, medidas: (f.medidas as string | null) ?? null }]));
  // Sin la migración 0006 (fotos, packs, lista de espera) la pantalla sigue andando con lo de siempre.
  const sinMigracion = !!completo.error || !!packsRes.error;
  const productos = (completo.error ? (await supabase.from("productos").select(BASE).order("orden")).data : completo.data) as FilaProducto[] | null;

  const disp = new Map((stock ?? []).map((s) => [s.producto_id as string, s.disponibles as number]));
  const esperaPor = new Map<string, Espera[]>();
  for (const e of espera ?? []) {
    const l = esperaPor.get(e.producto_id) ?? [];
    l.push({ email: e.email, nombre: e.nombre, created_at: e.created_at, avisado_at: e.avisado_at });
    esperaPor.set(e.producto_id, l);
  }
  const catalogo: ProductoCatalogo[] = (productos ?? []).map((p) => ({
    ...p,
    categoria_nombre: categorias.dePorId.get(p.id)?.nombre ?? null,
    verbo: p.verbo ?? null,
    descripcion: p.descripcion ?? null,
    frase: fichaDe.get(p.id)?.frase ?? null,
    medidas: fichaDe.get(p.id)?.medidas ?? null,
    foto_path: p.foto_path ?? null,
    foto_url: urlFotoPublica(p.foto_path),
    stock: disp.get(p.id) ?? 0,
    espera: esperaPor.get(p.id) ?? [],
  }));
  const packs: PackAdmin[] = packsRes.error
    ? []
    : (packsRes.data ?? []).map(({ foto_path, pack_items, ...k }) => ({ ...k, foto_url: urlFotoPublica(foto_path), items: pack_items ?? [] }));
  const esperanTotal = catalogo.reduce((n, p) => n + p.espera.filter((e) => !e.avisado_at).length, 0);
  const total = (t: string) => catalogo.filter((p) => p.tipo === t).reduce((n, p) => n + p.stock, 0);
  const aLaVenta = catalogo.filter((p) => p.activo).length;
  const agotados = catalogo.filter((p) => p.activo && p.stock === 0);
  const pocos = catalogo.filter((p) => p.activo && p.stock > 0 && p.stock <= 3);
  const ultimoCosto = new Map<string, number>();
  for (const l of lotes ?? []) {
    const nombre = (l.producto as unknown as { nombre: string }).nombre;
    if (!ultimoCosto.has(nombre)) ultimoCosto.set(nombre, l.costo_unitario);
  }
  const valorStock = catalogo.reduce((s, p) => s + p.stock * (ultimoCosto.get(p.nombre) ?? 0), 0);
  const alerta = agotados[0] ?? pocos[0];

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm uppercase tracking-widest text-outline">
            <span>Catálogo</span>
            <span>/</span>
            <span>Stock y tandas</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl leading-tight tracking-wide text-primary">PRODUCTOS &amp; STOCK</h1>
          <p className="font-caption-italic text-caption-italic text-on-surface-variant">Lo que cambies acá se ve en la tienda online.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {!sinMigracion && <NuevoProducto categorias={categorias.lista} puedeCrearCategoria={categorias.disponibles} />}
          <button
            form="catalogo"
            className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-4 py-1.5 font-label-md text-label-md uppercase tracking-widest text-on-surface shadow-sm transition-all hover:bg-surface-dim"
          >
            <span className="ms text-[16px]">save</span>
            <span>Guardar cambios</span>
          </button>
          <a
            href="#tandas"
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 font-label-md text-label-md uppercase tracking-widest text-surface-container-lowest shadow-md transition-all hover:bg-on-surface-variant"
          >
            <span className="ms text-[16px]">add_circle</span>
            <span>Nueva tanda</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className={tarjeta}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">A la venta</span>
            <span className="ms text-[18px] text-outline">menu_book</span>
          </div>
          <div className="mt-1">
            <div className="font-code-num text-headline-lg text-primary">{aLaVenta}</div>
            <div className="mt-0.5 font-label-sm text-label-sm uppercase text-on-surface-variant">de {catalogo.length} productos del catálogo</div>
          </div>
          <div className="mt-1 flex items-center gap-1 pt-1 font-caption-italic text-caption-italic text-tertiary">
            <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
            <span>Visibles en la web</span>
          </div>
        </div>

        <div className={tarjeta}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Stock disponible</span>
            <span className="ms text-[18px] text-outline">shelves</span>
          </div>
          <div className="mt-1">
            <div className="font-code-num text-headline-lg text-primary">
              {total("biblia") + total("journal") + total("otro")} <span className="font-body-sm text-body-sm text-outline">piezas</span>
            </div>
            <div className="mt-0.5 font-label-md text-label-md text-on-surface-variant">
              {total("biblia")} Biblias · {total("journal")} Journals
              {total("otro") > 0 && ` · ${total("otro")} otros`}
            </div>
          </div>
          <div className="mt-1 pt-1 font-caption-italic text-caption-italic text-outline">Descontados los pedidos sin entregar</div>
        </div>

        <div className={tarjeta}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Valor del stock</span>
            <span className="ms text-[18px] text-secondary">payments</span>
          </div>
          <div className="mt-1">
            <div className="font-code-num text-headline-lg text-primary">{ars(valorStock)}</div>
            <div className="mt-0.5 font-label-sm text-label-sm uppercase text-on-surface-variant">A costo de producción</div>
          </div>
          <div className="mt-1 pt-1 font-caption-italic text-caption-italic text-secondary">Según el costo de la última tanda</div>
        </div>

        <div className="relative flex flex-col justify-between rounded-2xl bg-surface-container p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className={`font-label-sm text-label-sm font-bold uppercase tracking-wider ${alerta ? "text-error" : "text-tertiary"}`}>Alerta de stock</span>
            <span className={`ms text-[18px] ${alerta ? "text-error" : "text-tertiary"}`}>{alerta ? "warning" : "check_circle"}</span>
          </div>
          {alerta ? (
            <>
              <div className="mt-1">
                <div className="font-headline-md text-headline-md leading-tight text-error">{alerta.nombre}</div>
                <div className="mt-0.5 font-label-sm text-label-sm text-on-surface-variant">{alerta.stock} unidades</div>
              </div>
              <div className="mt-1 flex items-center justify-between pt-1">
                <span className="font-caption-italic text-caption-italic text-error">{alerta.stock === 0 ? "Sin unidades disponibles" : "Quedan pocas"}</span>
                {agotados.length + pocos.length > 1 && (
                  <span className="rounded-full bg-error-container px-2 py-0.5 font-label-sm text-label-sm uppercase text-on-error-container">+{agotados.length + pocos.length - 1} más</span>
                )}
              </div>
            </>
          ) : (
            <div className="mt-1 font-headline-md text-headline-md leading-tight text-tertiary">Todo con stock</div>
          )}
        </div>
      </div>

      {sinMigracion && (
        <div className="flex items-start gap-2 rounded-2xl bg-error-container px-4 py-2.5 text-on-error-container">
          <span className="ms mt-0.5 text-[18px]">database</span>
          <p className="font-body-sm text-body-sm">
            Falta correr la migración <strong>0006_tienda_completa.sql</strong> en Supabase: hasta entonces no se pueden crear productos con foto, packs ni ver la lista de espera.
          </p>
        </div>
      )}

      <TablaCatalogo productos={catalogo} />
      {esperanTotal > 0 && (
        <p className="-mt-2 flex items-center gap-1.5 font-caption-italic text-caption-italic text-outline">
          <span className="ms text-[16px] text-secondary">notifications</span>
          {esperanTotal} {esperanTotal === 1 ? "persona espera" : "personas esperan"} que vuelva algún producto. Tocá el número de la columna “Esperan” para ver quiénes: cuando cargues una tanda les avisamos por mail.
        </p>
      )}

      {!sinMigracion && (
        <Packs
          packs={packs}
          productos={catalogo.map((p) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, precio: p.precio, stock: Math.max(0, p.stock), activo: p.activo, foto_url: p.foto_url }))}
        />
      )}

      <div className="flex scroll-mt-20 flex-col gap-3" id="tandas">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-headline-lg text-headline-lg leading-tight tracking-wide text-primary">TANDAS DE PRODUCCIÓN</h2>
          <p className="font-label-md text-label-md uppercase tracking-widest text-outline">Cada tanda suma stock y registra su costo</p>
        </div>

        <FormTanda
          key={typeof tanda === "string" ? tanda : ""}
          inicial={typeof tanda === "string" ? tanda : undefined}
          productos={(productos ?? []).map((p) => ({ id: p.id, nombre: p.nombre }))}
        />

        <div className="min-w-0 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm">
          <div className="flex items-center justify-between bg-surface-container-low px-4 py-2">
            <span className="font-headline-md text-headline-md uppercase text-primary">Historial de tandas</span>
            <span className="font-caption-italic text-caption-italic text-outline">Falladas y costos por tanda</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-surface-container-high/60 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  <th className="px-3 py-2">Tanda</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-center">Unidades</th>
                  <th className="px-3 py-2 text-center">Falladas</th>
                  <th className="px-3 py-2">Costo unitario</th>
                  <th className="px-3 py-2 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-variant/40 font-body-md text-body-md text-on-surface">
                {(lotes ?? []).map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-surface-container-low">
                    <td className="px-3 py-1.5 font-code-num text-code-num font-bold text-primary">#{l.numero}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col">
                        <span className="font-headline-md text-headline-md leading-tight text-primary">{(l.producto as unknown as { nombre: string }).nombre}</span>
                        <span className="font-caption-italic text-caption-italic text-outline">{fecha(`${l.fecha}T12:00:00`)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-center font-code-num text-code-num">{l.unidades} u.</td>
                    <td className="px-3 py-1.5 text-center">
                      {l.merma > 0 ? (
                        <span className="rounded-full bg-error-container px-2 py-0.5 font-label-sm text-label-sm text-on-error-container">
                          {l.merma} {l.merma === 1 ? "fallada" : "falladas"}
                        </span>
                      ) : (
                        <span className="font-label-sm text-label-sm text-outline">0 falladas</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-code-num text-code-num text-primary">{ars(l.costo_unitario)} c/u</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className="rounded-full bg-tertiary-fixed px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase text-tertiary">Terminada</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
