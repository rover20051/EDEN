import Link from "next/link";
import { icono, sombraTarjeta } from "@/components/stitch";
import { TarjetaPedido } from "@/components/tarjeta-pedido";
import { requireAdmin } from "@/lib/auth";
import { ars } from "@/lib/format";
import { SELECT_PEDIDO, esSalida, tieneComprobante, vencido, type PedidoFila } from "@/lib/pedidos";

const HORA = 3600 * 1000;

/** Lunes de la semana (00:00 en Argentina) desplazado `semanas` hacia atrás. */
function lunes(semanas = 0) {
  const ar = new Date(Date.now() - 3 * HORA);
  ar.setUTCDate(ar.getUTCDate() - ((ar.getUTCDay() + 6) % 7) - semanas * 7);
  ar.setUTCHours(3, 0, 0, 0);
  return ar.toISOString();
}

const haceUnaSemana = () => new Date(Date.now() - 7 * 24 * HORA).toISOString();

const hoyLargo = () =>
  new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });

export default async function Hoy() {
  const { supabase, admin } = await requireAdmin();
  const hoy = new Date().toISOString().slice(0, 10);

  const [{ data: pedidos }, { data: entregados }, { data: ajustes }, { data: ventas }, { data: acreditar }, { data: stock }] = await Promise.all([
    supabase
      .from("pedidos")
      .select(SELECT_PEDIDO)
      .in("estado", ["pendiente_pago", "pagado", "en_preparacion", "despachado"])
      .order("created_at"),
    supabase
      .from("pedidos")
      .select(SELECT_PEDIDO)
      .eq("estado", "entregado")
      .gte("entregado_at", haceUnaSemana())
      .order("entregado_at", { ascending: false }),
    supabase.from("ajustes").select("alias_transferencia, envio_estimado").eq("id", 1).single(),
    supabase.from("v_pedidos_validos").select("total, pagado_at, items:pedido_items(cantidad)").gte("pagado_at", lunes(1)),
    supabase.from("pagos").select("neto, acreditacion_esperada").eq("estado", "aprobado").gt("acreditacion_esperada", hoy).order("acreditacion_esperada"),
    supabase.from("v_stock").select("tipo, disponibles"),
  ]);

  const lista = (pedidos ?? []) as unknown as PedidoFila[];
  const alias = ajustes?.alias_transferencia ?? "";
  const envioEstimado = ajustes?.envio_estimado ?? 12000;

  const columnas = [
    {
      titulo: "Por cobrar",
      ayuda: "Confirmá el pago al verificar la cuenta",
      punto: "bg-secondary-fixed-dim",
      cuenta: "text-secondary",
      items: lista
        .filter((p) => p.estado === "pendiente_pago")
        .sort((a, b) => Number(tieneComprobante(b)) - Number(tieneComprobante(a)) || Number(vencido(b)) - Number(vencido(a))),
    },
    { titulo: "Para preparar", ayuda: "Pagados y regalos: armar y empaquetar", punto: "bg-error-container", cuenta: "text-on-surface-variant", items: lista.filter((p) => p.estado === "pagado") },
    { titulo: "Para despachar", ayuda: "Listos para empaquetar y rotular", punto: "bg-tertiary-fixed", cuenta: "text-tertiary", items: lista.filter((p) => p.estado === "en_preparacion") },
    {
      titulo: "Despachados",
      ayuda: "En camino: marcalos cuando lleguen",
      punto: "bg-secondary",
      cuenta: "text-secondary",
      items: lista.filter((p) => p.estado === "despachado").sort((a, b) => (a.despachado_at ?? "").localeCompare(b.despachado_at ?? "")),
    },
  ];
  const pendientes = columnas.reduce((n, c) => n + c.items.length, 0);
  const enMarcha = columnas[1].items.length + columnas[2].items.length + columnas[3].items.length;
  const tablero = [
    ...columnas,
    { titulo: "Entregados", ayuda: "Últimos 7 días", punto: "bg-tertiary", cuenta: "text-tertiary", items: (entregados ?? []) as unknown as PedidoFila[] },
  ];

  type Venta = { total: number; pagado_at: string; items: { cantidad: number }[] };
  const v = (ventas ?? []) as unknown as Venta[];
  const estaSemana = v.filter((x) => x.pagado_at >= lunes());
  const semanaPasada = v.filter((x) => x.pagado_at < lunes());
  const suma = (xs: Venta[]) => xs.reduce((s, x) => s + x.total, 0);
  const piezas = estaSemana.reduce((n, x) => n + x.items.reduce((m, i) => m + i.cantidad, 0), 0);
  const variacion = suma(semanaPasada) ? Math.round(((suma(estaSemana) - suma(semanaPasada)) / suma(semanaPasada)) * 100) : null;

  const porAcreditar = (acreditar ?? []).reduce((s, a) => s + a.neto, 0);
  const proxima = acreditar?.[0]?.acreditacion_esperada;
  const stockDe = (t: string) => (stock ?? []).filter((s) => s.tipo === t).reduce((n, s) => n + s.disponibles, 0);
  const tarjeta = `group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-container-low p-2.5 transition-all hover:bg-surface-container-lowest ${sombraTarjeta}`;

  return (
    <div className="flex w-full flex-col">
      <div className="mb-3 flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-space-xs font-label-sm text-label-sm uppercase tracking-widest text-outline">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            <span>{hoyLargo()}</span>
          </div>
          <h1 className="font-headline-xl text-[28px] uppercase leading-tight tracking-[0.12em] text-primary">Hola, {admin.nombre}</h1>
        </div>
        <Link
          href="/admin/pedidos/nuevo"
          className="group flex items-center gap-space-xs self-start rounded-full bg-primary-container px-3 py-1.5 font-label-md text-label-md uppercase text-surface-container-lowest shadow-md transition-all hover:bg-primary active:scale-95 md:self-auto"
        >
          {icono("add", "text-[16px] transition-transform group-hover:rotate-90")}
          <span>Nuevo pedido</span>
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className={tarjeta}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-outline">Pendientes</span>
            <span className="h-2 w-2 rounded-full bg-secondary-container" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-headline-xl text-[28px] font-normal leading-none text-primary">{pendientes}</span>
            <span className="font-caption-italic text-caption-italic italic text-outline">{enMarcha} en marcha</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div className="h-full rounded-full bg-secondary" style={{ width: `${pendientes ? Math.round((enMarcha / pendientes) * 100) : 0}%` }} />
          </div>
        </div>

        <div className={tarjeta}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-outline">Vendido esta semana</span>
            {icono(variacion !== null && variacion < 0 ? "trending_down" : "trending_up", `text-[16px] ${variacion !== null && variacion < 0 ? "text-error" : "text-tertiary"}`)}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-headline-lg text-[22px] font-medium leading-none tracking-[0.02em] text-primary">{ars(suma(estaSemana))}</span>
            {variacion !== null && (
              <span className={`font-label-sm text-label-sm font-bold ${variacion < 0 ? "text-error" : "text-tertiary"}`}>
                {variacion > 0 ? "+" : ""}
                {variacion}%
              </span>
            )}
          </div>
          <div className="font-caption-italic text-[13px] italic text-outline">
            {piezas} {piezas === 1 ? "pieza" : "piezas"}
            {variacion !== null && " · contra la semana pasada"}
          </div>
        </div>

        <div className={tarjeta}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-outline">Nave por acreditar</span>
            {icono("hourglass_top", "text-[16px] text-secondary")}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-headline-lg text-[22px] font-medium leading-none tracking-[0.02em] text-primary">{ars(porAcreditar)}</span>
            {proxima && <span className="font-label-sm text-label-sm text-outline">próx. {proxima.split("-").reverse().slice(0, 2).join("/")}</span>}
          </div>
          <div className="font-caption-italic text-[13px] italic text-outline">Cobros con tarjeta y QR</div>
        </div>

        <div className={tarjeta}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase text-outline">Stock</span>
            {icono("inventory_2", "text-[16px] text-outline")}
          </div>
          <div className="mt-1">
            <span className="block font-headline-md text-[17px] font-medium leading-tight text-primary">
              {stockDe("biblia")} Biblias · {stockDe("journal")} Journals
              {stockDe("otro") > 0 && ` · ${stockDe("otro")} otros`}
            </span>
            <span className="block font-caption-italic text-[13px] italic text-outline">Disponible para vender</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3 min-[1360px]:grid-cols-5">
        {tablero.map((c) => (
          <div key={c.titulo} className={`flex flex-col gap-2 rounded-2xl bg-surface-container/60 p-2.5 ${c.items.length === 0 ? "hidden lg:flex" : ""}`}>
            <div className="flex flex-col gap-0.5 px-1 pt-0.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${c.punto}`} />
                  <h2 className="font-label-lg text-label-md uppercase tracking-wider text-primary">{c.titulo}</h2>
                  <span className={`font-code-num text-code-num ${c.cuenta}`}>({c.items.length})</span>
                </div>
                {c.items.length > 0 && (
                  <span className="flex items-center gap-1.5 font-label-sm text-label-sm uppercase text-outline">
                    {c.items.some((p) => !esSalida(p)) && <span>{ars(c.items.reduce((s, p) => s + (esSalida(p) ? 0 : p.total), 0))}</span>}
                    {c.items.some(esSalida) && (
                      <span className="flex items-center gap-0.5 rounded-full bg-secondary-fixed/60 px-1.5 text-secondary" title="Salidas sin cobro (regalos de Edén)">
                        {icono("volunteer_activism", "text-[12px]")}
                        {c.items.filter(esSalida).length} sin cobro
                      </span>
                    )}
                  </span>
                )}
              </div>
              <p className="font-caption-italic text-[13px] italic text-outline">{c.ayuda}</p>
            </div>
            {c.items.length === 0 ? (
              <p className="py-6 text-center font-caption-italic text-caption-italic italic text-outline">Nada por acá.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {c.items.map((p) => (
                  <TarjetaPedido key={p.id} pedido={p} alias={alias} envioEstimado={envioEstimado} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {pendientes === 0 && <p className="mt-10 text-center font-caption-italic text-caption-italic italic text-outline lg:hidden">Todo al día.</p>}
    </div>
  );
}
