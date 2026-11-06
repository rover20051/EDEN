import Link from "next/link";
import { Encabezado, Indicador, icono, sombraTarjeta } from "@/components/stitch";
import { FilaPedido } from "@/components/fila-pedido";
import { EstadoBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { clientesBuscados, numeroBuscado } from "@/lib/buscar-pedidos";
import { ars, fechaHora, numeroPedido } from "@/lib/format";
import { SELECT_PEDIDO, chipSalida, esSalida, resumenItems, type PedidoFila } from "@/lib/pedidos";
import { CANALES, ICONO_CANAL, MEDIOS, PUNTO_ESTADO, type Estado } from "@/lib/textos";

const POR_PAGINA = 20;

const FILTROS: { clave: string; label: string; estados: Estado[]; tipo?: "salida" }[] = [
  { clave: "activos", label: "Activos", estados: ["pendiente_pago", "pagado", "en_preparacion", "despachado"] },
  { clave: "cobrar", label: "Por cobrar", estados: ["pendiente_pago"] },
  { clave: "preparar", label: "Para preparar", estados: ["pagado", "en_preparacion"] },
  { clave: "despachados", label: "Despachados", estados: ["despachado"] },
  { clave: "entregados", label: "Entregados", estados: ["entregado"] },
  { clave: "salidas", label: "Salidas", estados: [], tipo: "salida" },
  { clave: "cancelados", label: "Cancelados", estados: ["cancelado"] },
  { clave: "todos", label: "Todos", estados: [] },
];

const inicioMes = () => {
  const ar = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1, 3)).toISOString();
};

export default async function Pedidos({ searchParams }: PageProps<"/admin/pedidos">) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  // Una búsqueda mira todos los estados, salvo que después se elija un filtro: el pedido buscado puede estar entregado o cancelado.
  const filtro = FILTROS.find((f) => f.clave === params.f) ?? (q ? FILTROS.find((f) => f.clave === "todos")! : FILTROS[0]);
  const pagina = Math.max(1, Number(params.p) || 1);

  let consulta = supabase
    .from("pedidos")
    .select(SELECT_PEDIDO, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (filtro.estados.length) consulta = consulta.in("estado", filtro.estados);
  if (filtro.tipo) consulta = consulta.eq("tipo", filtro.tipo);
  if (q) {
    const n = numeroBuscado(q);
    consulta = n ? consulta.eq("numero", n) : consulta.in("cliente_id", await clientesBuscados(supabase, q));
  }

  const [{ data, count }, { data: resumen }] = await Promise.all([
    consulta,
    supabase.from("pedidos").select("estado, tipo, canal, total, created_at").neq("estado", "cancelado"),
  ]);
  const pedidos = (data ?? []) as unknown as PedidoFila[];
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const r = resumen ?? [];
  const activos = r.filter((x) => ["pendiente_pago", "pagado", "en_preparacion", "despachado"].includes(x.estado));
  const porCobrar = r.filter((x) => x.estado === "pendiente_pago");
  const paraDespachar = r.filter((x) => x.estado === "en_preparacion");
  const delMes = r.filter((x) => x.created_at >= inicioMes() && x.estado !== "pendiente_pago" && x.tipo !== "salida");
  const salidasActivas = activos.filter((x) => x.tipo === "salida").length;
  const suma = (xs: { total: number }[]) => xs.reduce((s, x) => s + x.total, 0);

  const url = (cambios: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const v = { f: filtro.clave, q, p: undefined as string | number | undefined, ...cambios };
    Object.entries(v).forEach(([k, x]) => x !== undefined && x !== "" && u.set(k, String(x)));
    return `/admin/pedidos?${u}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 pb-4">
      <Encabezado ceja="Todas las ventas" titulo="Pedidos">
        <Link
          href="/admin/pedidos/nuevo"
          className="group flex items-center justify-center gap-2 rounded-full bg-primary px-space-lg py-2.5 font-label-md text-label-md uppercase tracking-[0.1em] text-surface shadow-sm transition-all hover:bg-on-surface-variant"
        >
          {icono("add", "text-[16px] transition-transform group-hover:rotate-90")}
          <span>Nuevo pedido</span>
        </Link>
      </Encabezado>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Indicador
          titulo="Activos"
          icono="brush"
          valor={activos.length}
          nota={`${activos.filter((x) => x.canal === "web").length} por la web${salidasActivas ? ` · ${salidasActivas} sin cobro` : ""}`}
        />
        <Indicador
          titulo="Por cobrar"
          icono="hourglass_empty"
          iconoColor="text-secondary"
          valor={ars(suma(porCobrar))}
          valorColor="text-secondary"
          nota={`${porCobrar.length} ${porCobrar.length === 1 ? "pendiente" : "pendientes"}`}
          notaClase="font-label-sm text-label-sm text-outline"
        />
        <Indicador titulo="Para despachar" icono="markunread_mailbox" valor={paraDespachar.length} nota="listos para salir" />
        <Indicador
          titulo="Volumen del mes"
          icono="inventory"
          iconoColor="text-tertiary"
          valor={ars(suma(delMes))}
          nota={`${delMes.length} pedidos`}
          notaClase="font-label-sm text-label-sm font-bold tracking-wider text-tertiary"
        />
      </div>

      <div className="flex flex-col items-stretch justify-between gap-space-md 2xl:flex-row 2xl:items-center">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 2xl:pb-0">
          {FILTROS.map((f) => (
            <Link
              key={f.clave}
              href={url({ f: f.clave })}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 font-label-md text-label-md uppercase tracking-wider transition-all ${
                f.clave === filtro.clave ? "bg-surface-dim text-on-surface shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {f.tipo === "salida" && <span className="ms mr-1 align-[-2px] text-[14px]">volunteer_activism</span>}
              {f.label}
            </Link>
          ))}
        </div>
        <form className="relative min-w-[280px] md:w-[340px] md:self-end 2xl:self-auto">
          <span className="ms pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Buscar por nombre o número..."
            className="w-full rounded-full bg-surface-container-low py-2 pl-10 pr-4 font-body-sm text-body-sm text-primary shadow-[inset_0_1px_2px_rgba(78,69,64,0.06)] transition-all placeholder:font-caption-italic placeholder:italic placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none"
          />
        </form>
      </div>

      <div className={`min-w-0 overflow-hidden rounded-[2rem] bg-surface-container-lowest ${sombraTarjeta}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="select-none bg-surface-container-low font-label-sm text-label-sm uppercase tracking-widest text-outline">
                <th className="px-4 py-2 pl-6 font-normal">Pedido</th>
                <th className="px-4 py-2 font-normal">Cliente</th>
                <th className="px-4 py-2 font-normal">Productos</th>
                <th className="px-4 py-2 font-normal">Fecha</th>
                <th className="px-4 py-2 font-normal">Canal</th>
                <th className="px-4 py-2 font-normal">Pago</th>
                <th className="px-4 py-2 text-center font-normal">Estado</th>
                <th className="px-4 py-2 pr-6 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="text-on-surface">
              {pedidos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center font-caption-italic text-caption-italic italic text-outline">
                    {q
                      ? `No encontramos pedidos de «${q}»${filtro.clave === "todos" ? "" : ` en ${filtro.label}`}.`
                      : filtro.tipo === "salida"
                        ? "Todavía no hubo salidas sin cobro. Se cargan desde Nuevo pedido → Salida sin cobro."
                        : "No hay pedidos acá."}
                  </td>
                </tr>
              )}
              {pedidos.map((p) => (
                <FilaPedido key={p.id} href={`/admin/pedidos/${p.id}`}>
                  <td className="whitespace-nowrap px-4 py-2 pl-6 font-code-num text-code-num text-primary">
                    <Link href={`/admin/pedidos/${p.id}`} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${PUNTO_ESTADO[p.estado]}`} />
                      <span>{numeroPedido(p.numero)}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-body-md text-body-md font-medium text-primary">
                    <span className="flex flex-col">
                      <span>{p.cliente.nombre}</span>
                      {esSalida(p) && (
                        <span className="inline-flex items-center gap-1 self-start rounded-full bg-secondary-fixed px-2 font-label-sm text-[10px] font-bold uppercase tracking-wider text-secondary">
                          <span className="ms text-[12px]">volunteer_activism</span>
                          {chipSalida(p)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-caption-italic text-caption-italic italic text-on-surface-variant">{resumenItems(p)}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-label-sm text-label-sm text-outline">{fechaHora(p.created_at)}</td>
                  <td className="px-4 py-2">
                    {esSalida(p) ? (
                      <span className="font-label-sm text-label-sm text-outline">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-label-sm text-label-sm uppercase tracking-wider text-outline">
                        {icono(ICONO_CANAL[p.canal] ?? "more_horiz", "text-[14px]")}
                        {CANALES[p.canal as keyof typeof CANALES]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-label-md text-label-md text-on-surface-variant">{esSalida(p) ? "—" : MEDIOS[p.medio_pago as keyof typeof MEDIOS]}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-center">
                    <EstadoBadge estado={p.estado} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 pr-6 text-right font-code-num text-code-num text-primary">
                    {esSalida(p) ? <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Sin cobro</span> : ars(p.total)}
                  </td>
                </FilaPedido>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-center justify-between gap-space-md bg-surface-container-low px-6 py-2.5 sm:flex-row">
          <div className="flex items-center gap-4 font-label-sm text-label-sm text-outline">
            <span>{pedidos.length} REGISTROS MOSTRADOS</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-outline">Subtotal página:</span>
            <span className="font-headline-md text-headline-md font-normal text-primary">{ars(suma(pedidos))}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-space-md px-2 pt-1 sm:flex-row">
        <div className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Página <span className="font-bold text-primary">{pagina}</span> de {paginas} — Total {total} pedidos
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={url({ p: Math.max(1, pagina - 1) })}
            aria-disabled={pagina === 1}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-outline transition-colors hover:bg-surface-container-high ${pagina === 1 ? "pointer-events-none opacity-40" : ""}`}
            title="Anterior"
          >
            {icono("chevron_left")}
          </Link>
          <div className="flex items-center gap-1 font-label-sm text-label-sm">
            {Array.from({ length: paginas }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === paginas || Math.abs(n - pagina) <= 1)
              .map((n, i, arr) => (
                <span key={n} className="flex items-center gap-1">
                  {i > 0 && n - arr[i - 1] > 1 && <span className="px-1 text-outline">...</span>}
                  <Link
                    href={url({ p: n })}
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${n === pagina ? "bg-primary font-bold text-surface" : "text-on-surface-variant transition-colors hover:bg-surface-container"}`}
                  >
                    {n}
                  </Link>
                </span>
              ))}
          </div>
          <Link
            href={url({ p: Math.min(paginas, pagina + 1) })}
            aria-disabled={pagina === paginas}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high ${pagina === paginas ? "pointer-events-none opacity-40" : ""}`}
            title="Siguiente"
          >
            {icono("chevron_right")}
          </Link>
        </div>
      </div>
    </div>
  );
}
