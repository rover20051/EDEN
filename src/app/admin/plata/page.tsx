import Link from "next/link";
import { borrarGasto, reintegrarSocio } from "@/app/admin/actions";
import { Accion } from "@/components/accion";
import { requireAdmin } from "@/lib/auth";
import { ars, fecha, numeroPedido } from "@/lib/format";
import { CATEGORIAS, MEDIOS, SOCIOS } from "@/lib/textos";
import { EditarGasto, FormGasto } from "./form-gasto";

type Gasto = {
  id: string;
  fecha: string | null;
  categoria: keyof typeof CATEGORIAS;
  descripcion: string;
  monto: number;
  pagado_por: keyof typeof SOCIOS;
  reintegrado: boolean;
  reintegrado_a: string[] | null;
  proveedor: string | null;
};

const ZONA = "America/Argentina/Buenos_Aires";
const ar = () => new Date(Date.now() - 3 * 3600 * 1000);
const mesISO = (desplazamiento = 0) => {
  const d = ar();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + desplazamiento, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

const seccion = "flex flex-col gap-2 rounded-2xl bg-surface-container-low p-3 shadow-sm";
const tituloSeccion = (icon: string, texto: string, extra?: React.ReactNode) => (
  <div className="flex items-center gap-space-xs">
    <span className="ms text-[18px] text-secondary">{icon}</span>
    <h2 className="font-headline-md text-[17px] uppercase tracking-[0.05em] text-primary">
      {texto} {extra}
    </h2>
  </div>
);

export default async function Plata() {
  const { supabase } = await requireAdmin();
  const mes = mesISO();
  const mesAnterior = mesISO(-1);
  const hoy = new Date().toISOString().slice(0, 10);

  const [{ data: cobros }, { data: gastos }, { data: envios }, { data: acreditar }, { data: salidas }] = await Promise.all([
    supabase.from("v_ganancia_pedido").select("neto, pagado_at"),
    supabase
      .from("gastos")
      .select("id, fecha, categoria, descripcion, proveedor, monto, pagado_por, reintegrado, reintegrado_a")
      .order("fecha", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("envios").select("costo_real, despachado_at"),
    supabase
      .from("pagos")
      .select("neto, medio, acreditacion_esperada, pedido:pedidos(numero)")
      .eq("estado", "aprobado")
      .gt("acreditacion_esperada", hoy)
      .order("acreditacion_esperada"),
    supabase.from("v_salidas").select("created_at, piezas, costo_productos, costo_envio"),
  ]);

  const listaGastos = (gastos ?? []) as Gasto[];
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const enRango = (f: string | null, desde?: string, hasta?: string) => !!f && (!desde || f >= desde) && (!hasta || f < hasta);
  const entro = (desde?: string, hasta?: string) => sum((cobros ?? []).filter((c) => (desde ? enRango(c.pagado_at, desde, hasta) : true)), (c) => c.neto);
  const gastosEn = (desde?: string) => listaGastos.filter((g) => !desde || (!!g.fecha && g.fecha >= desde));
  const enviosEn = (desde?: string) => sum((envios ?? []).filter((e) => !desde || e.despachado_at >= desde), (e) => e.costo_real);
  const salio = (desde?: string) => sum(gastosEn(desde), (g) => g.monto) + enviosEn(desde);

  const entroMes = entro(mes);
  const entroAnterior = entro(mesAnterior, mes);
  const salioMes = salio(mes);
  const quedoMes = entroMes - salioMes;
  const variacion = entroAnterior ? Math.round(((entroMes - entroAnterior) / entroAnterior) * 100) : null;
  const produccionMes = sum(gastosEn(mes).filter((g) => g.categoria === "produccion"), (g) => g.monto);
  const restoMes = salioMes - produccionMes;
  const base = Math.max(entroMes, salioMes, 1);

  const porAcreditar = (acreditar ?? []).map((a) => ({ ...a, pedido: a.pedido as unknown as { numero: number } | null }));
  // Lo que cada socio adelantó y Edén todavía no le devolvió. "Nari y Mich" se reparte mitad y mitad.
  const partesDe = (p: string) => (p === "nari_mich" ? ["nari", "mich"] : p === "eden" ? [] : [p]);
  const deuda = (["nari", "mich", "fede"] as const).map((s) => {
    const pendientes = listaGastos.filter((g) => partesDe(g.pagado_por).includes(s) && !(g.reintegrado_a ?? []).includes(s));
    const monto = Math.round(sum(pendientes, (g) => g.monto / partesDe(g.pagado_por).length));
    const compartidos = pendientes.filter((g) => g.pagado_por === "nari_mich").length;
    return { socio: s, monto, ultimo: pendientes[0]?.descripcion, compartidos };
  });
  const avatar: Record<string, string> = { nari_mich: "bg-secondary-container text-primary", nari: "bg-secondary-fixed text-primary", mich: "bg-tertiary-fixed text-tertiary", fede: "bg-surface-variant text-primary" };
  const nombreMes = new Date(`${mes}T12:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const nombreMesAnterior = new Date(`${mesAnterior}T12:00:00`).toLocaleDateString("es-AR", { month: "long" });
  const diasHasta = (f: string) => Math.round((new Date(`${f}T12:00:00`).getTime() - new Date(`${hoy}T12:00:00`).getTime()) / 86400000);
  const ahora = new Date();

  // Salidas sin cobro (regalos de Edén): no entra plata. Las piezas ya se pagaron en Producción y su envío ya está en "Salió".
  const listaSalidas = (salidas ?? []).map((x) => ({ fecha: x.created_at as string, piezas: Number(x.piezas), costo: Number(x.costo_productos), envio: Number(x.costo_envio) }));
  const salidasDe = (desde?: string) => listaSalidas.filter((x) => !desde || x.fecha >= desde);
  const resumenSalidas = (desde?: string) => {
    const xs = salidasDe(desde);
    return { n: xs.length, piezas: sum(xs, (x) => x.piezas), costo: sum(xs, (x) => x.costo), envio: sum(xs, (x) => x.envio) };
  };
  const salidasMes = resumenSalidas(mes);
  const salidasTotal = resumenSalidas();

  return (
    <div className="flex w-full flex-col gap-space-md">
      <div className="flex flex-col justify-between gap-space-sm pb-space-xs md:flex-row md:items-end">
        <div>
          <div className="mb-0.5 flex items-center gap-space-xs font-label-sm text-label-sm uppercase tracking-widest text-secondary">
            <span className="ms text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              account_balance
            </span>
            <span>Caja de Edén</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl uppercase leading-none tracking-[0.06em] text-primary">Plata &amp; Caja</h1>
          <p className="mt-0.5 font-caption-italic text-caption-italic italic text-outline">Lo que entró, lo que salió, lo que falta acreditar y lo que Edén le debe a cada socio.</p>
        </div>
        <div className="flex items-center gap-space-sm self-start rounded-full bg-surface-container px-3 py-1.5 shadow-sm md:self-auto">
          <div className="h-2 w-2 rounded-full bg-secondary" />
          <span className="font-label-md text-label-md font-bold text-primary">
            Corte: {ahora.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: ZONA })}
          </span>
          <span className="font-label-sm text-label-sm text-outline">| {ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: ZONA })} hs</span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-space-md lg:grid-cols-12">
        <div className="flex flex-col gap-space-md lg:col-span-7">
          <section className={seccion}>
            <div className="flex items-center justify-between pb-0.5">
              {tituloSeccion("calendar_today", "Este mes", <span className="font-caption-italic text-body-sm lowercase tracking-normal text-outline">({nombreMes})</span>)}
              <span className="rounded-full bg-surface-container px-2 py-0.5 font-label-sm text-[10px] uppercase tracking-wider text-primary">Período activo</span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-container-lowest p-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">Entró neto</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tertiary-fixed text-tertiary">
                    <span className="ms text-[13px]">arrow_downward</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <div className="font-code-num text-[20px] font-bold leading-tight tracking-tight text-tertiary">{ars(entroMes)}</div>
                  <div className="mt-0.5 font-caption-italic text-[11px] text-tertiary-container">
                    {variacion === null ? "Sin datos del mes anterior" : `${variacion > 0 ? "+" : ""}${variacion}% vs ${nombreMesAnterior}`}
                  </div>
                </div>
              </div>
              <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-container-lowest p-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">Salió en gastos</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-variant text-primary">
                    <span className="ms text-[13px]">arrow_upward</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <div className="font-code-num text-[20px] font-bold leading-tight tracking-tight text-primary">{ars(salioMes)}</div>
                  <div className="mt-0.5 font-caption-italic text-[11px] text-outline">{entroMes ? `${pct(salioMes, entroMes)}% de lo que entró` : "Gastos + envíos"}</div>
                </div>
              </div>
              <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-container-lowest p-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">Quedó en caja</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed">
                    <span className="ms text-[13px]">account_balance_wallet</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <div className={`font-code-num text-[20px] font-bold leading-tight tracking-tight ${quedoMes < 0 ? "text-error" : "text-primary"}`}>{ars(quedoMes)}</div>
                  <div className={`mt-0.5 inline-flex items-center gap-1 font-label-sm text-[10px] font-bold uppercase ${quedoMes < 0 ? "text-error" : "text-secondary"}`}>
                    <span className="ms text-[12px]">{quedoMes < 0 ? "error" : "check_circle"}</span>
                    <span>{quedoMes < 0 ? "Balance negativo" : "Balance positivo"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-0.5 flex flex-col gap-1 rounded-2xl bg-surface-container-highest px-3 py-1.5">
              <div className="flex justify-between font-label-sm text-[11px] text-on-surface-variant">
                <span>Distribución del mes</span>
                <span className="font-code-num">{entroMes ? `${pct(Math.max(quedoMes, 0), entroMes)}% quedó libre` : "Sin ingresos todavía"}</span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-dim">
                <div className="h-full bg-tertiary" style={{ width: `${pct(Math.max(quedoMes, 0), base)}%` }} title={`Quedó: ${ars(Math.max(quedoMes, 0))}`} />
                <div className="h-full bg-secondary-fixed-dim" style={{ width: `${pct(produccionMes, base)}%` }} title={`Producción: ${ars(produccionMes)}`} />
                <div className="h-full bg-primary/40" style={{ width: `${pct(restoMes, base)}%` }} title={`Otros gastos y envíos: ${ars(restoMes)}`} />
              </div>
              <div className="flex flex-wrap gap-3 font-label-sm text-[10px] text-outline">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-tertiary" />Quedó</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-secondary-fixed-dim" />Producción</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary/40" />Otros gastos y envíos</span>
              </div>
            </div>
          </section>

          <section className="flex flex-col items-center justify-between gap-space-sm rounded-2xl bg-surface-container px-3.5 py-2.5 shadow-sm sm:flex-row">
            <div>
              <div className="flex items-center gap-space-xs font-label-sm text-[10px] uppercase tracking-wider text-outline">
                <span className="ms text-[14px]">history_edu</span>
                <span>Histórico acumulado</span>
              </div>
              <div className="mt-0.5 font-headline-md text-[17px] text-primary">Desde el inicio de Edén</div>
            </div>
            <div className="flex flex-wrap items-center gap-space-md rounded-full bg-surface-container-lowest px-3 py-1.5 shadow-sm">
              <div>
                <span className="block font-label-sm text-[10px] uppercase leading-tight text-outline">Entró</span>
                <span className="font-code-num text-[13px] font-bold text-primary">{ars(entro())}</span>
              </div>
              <div className="h-5 w-px bg-surface-variant" />
              <div>
                <span className="block font-label-sm text-[10px] uppercase leading-tight text-outline">Salió</span>
                <span className="font-code-num text-[13px] font-bold text-primary">{ars(salio())}</span>
              </div>
              <div className="h-5 w-px bg-surface-variant" />
              <div>
                <span className="block font-label-sm text-[10px] font-bold uppercase leading-tight text-secondary">Resultado</span>
                <span className={`font-code-num text-[13px] font-bold ${entro() - salio() < 0 ? "text-error" : "text-tertiary"}`}>{ars(entro() - salio())}</span>
              </div>
            </div>
          </section>

          {salidasTotal.n > 0 && (
            <section className="flex flex-col gap-2 rounded-2xl bg-secondary-fixed/25 px-3.5 py-2.5 shadow-sm">
              <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                <div className="flex items-center gap-space-xs font-label-sm text-[10px] uppercase tracking-wider text-secondary">
                  <span className="ms text-[14px]">volunteer_activism</span>
                  <span>Salidas sin cobro</span>
                </div>
                <Link href="/admin/numeros?tab=salidas" className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant underline decoration-primary/30 underline-offset-4 hover:text-primary">
                  Ver detalle en Números
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["Este mes", salidasMes],
                    ["Desde el inicio", salidasTotal],
                  ] as const
                ).map(([titulo, r]) => (
                  <div key={titulo} className="rounded-2xl bg-surface-container-lowest px-3 py-2 shadow-sm">
                    <span className="block font-label-sm text-[10px] uppercase leading-tight text-outline">{titulo}</span>
                    <span className="font-code-num text-[15px] font-bold text-primary">{ars(r.costo + r.envio)}</span>
                    <span className="block font-caption-italic text-[11px] italic text-outline">
                      {r.piezas} pieza{r.piezas === 1 ? "" : "s"} · {ars(r.costo)} en piezas{r.envio ? ` + ${ars(r.envio)} de envío` : ""}
                    </span>
                  </div>
                ))}
              </div>
              <p className="font-caption-italic text-[11px] italic text-outline">
                Lo que Edén regaló a costo. No es plata nueva que salga: las piezas ya se pagaron en Producción y los envíos ya están en «Salió».
              </p>
            </section>
          )}

          <section className={seccion}>
            <div className="flex flex-col justify-between gap-space-xs sm:flex-row sm:items-center">
              <div>
                {tituloSeccion("schedule", "Por acreditar")}
                <p className="mt-0.5 font-caption-italic text-[12px] italic text-outline">Cobros con tarjeta que todavía no llegaron a la cuenta</p>
              </div>
              <div className="flex items-center gap-1.5 self-start rounded-full bg-surface-container-lowest px-2.5 py-1 shadow-sm sm:self-auto">
                <span className="font-label-sm text-[10px] uppercase text-outline">Total a liberar:</span>
                <span className="font-code-num text-[12px] font-bold text-primary">{ars(sum(porAcreditar, (a) => a.neto))}</span>
              </div>
            </div>
            {porAcreditar.length === 0 ? (
              <p className="rounded-2xl bg-surface-container-lowest px-3 py-3 text-center font-caption-italic text-[13px] italic text-outline">No hay cobros pendientes de acreditar.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {porAcreditar.map((a, i) => {
                  const dias = diasHasta(a.acreditacion_esperada);
                  return (
                    <div key={i} className="flex items-center justify-between rounded-2xl bg-surface-container-lowest px-3 py-2 shadow-sm transition-colors hover:bg-surface-container">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary-fixed/50 text-secondary">
                          <span className="ms text-[15px]">credit_card</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-label-md text-[11px] font-bold text-primary">{fecha(`${a.acreditacion_esperada}T12:00:00`)}</span>
                            {a.pedido && <span className="rounded bg-surface-container px-1.5 font-code-num text-[10px] text-outline">{numeroPedido(a.pedido.numero)}</span>}
                          </div>
                          <div className="font-caption-italic text-[12px] italic text-on-surface-variant">{MEDIOS[a.medio as keyof typeof MEDIOS]}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-code-num text-[13px] font-bold text-primary">{ars(a.neto)}</div>
                        <span className={`font-label-sm text-[10px] uppercase tracking-wider ${dias <= 1 ? "font-bold text-secondary" : "text-outline"}`}>
                          {dias <= 1 ? "Mañana en caja" : `En ${dias} días`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className={seccion}>
            <div className="flex items-center justify-between">
              <div>
                {tituloSeccion("handshake", "Edén le debe a")}
                <p className="mt-0.5 font-caption-italic text-[12px] italic text-outline">Lo que adelantaron de su bolsillo. Los gastos de Nari y Mich van mitad y mitad.</p>
              </div>
              <span className="font-label-sm text-[10px] uppercase tracking-widest text-outline">Fede, Nari y Mich</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {deuda.map((d) => (
                <div
                  key={d.socio}
                  className={`flex flex-col justify-between gap-2 rounded-2xl px-3 py-2 shadow-sm transition-all sm:flex-row sm:items-center ${d.monto ? "bg-surface-container-lowest hover:shadow-md" : "bg-surface-container-lowest/60"}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full font-headline-md text-[14px] font-bold uppercase shadow-sm ${avatar[d.socio]}`}>{SOCIOS[d.socio][0]}</div>
                    <div>
                      <div className="flex items-center gap-space-xs">
                        <span className="font-headline-md text-[16px] text-primary">{SOCIOS[d.socio]}</span>
                        <span
                          className={`rounded-full px-1.5 font-label-sm text-[9px] font-bold uppercase ${d.monto ? "bg-secondary-fixed/50 text-secondary" : "bg-tertiary-fixed/60 text-tertiary"}`}
                        >
                          {d.monto ? "Pendiente" : "Al día"}
                        </span>
                      </div>
                      <div className="font-caption-italic text-[12px] italic text-outline">
                        {d.monto ? (d.compartidos ? `${d.compartidos} gastos compartidos (su mitad)` : d.ultimo) : "Todos los reintegros saldados"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      <span className="block font-label-sm text-[9px] uppercase leading-none text-outline">{d.monto ? "Adeudado" : "Saldo pendiente"}</span>
                      <span className={`font-code-num text-[14px] font-bold ${d.monto ? "text-primary" : "text-outline"}`}>{ars(d.monto)}</span>
                    </div>
                    {d.monto > 0 ? (
                      <Accion
                        accion={reintegrarSocio.bind(null, d.socio)}
                        variante="secundaria"
                        confirmar={`¿Edén ya le devolvió ${ars(d.monto)} a ${SOCIOS[d.socio]}?`}
                        className="!bg-surface-container !text-[10px] font-bold tracking-wider hover:!bg-primary hover:!text-on-primary"
                      >
                        <span className="ms text-[13px]">check</span>
                        <span>Ya se lo devolvimos</span>
                      </Accion>
                    ) : (
                      <div className="px-2 py-1 font-label-sm text-[11px] italic text-outline">Sin movimientos</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-space-md lg:col-span-5">
          <section className={seccion}>
            <div className="flex items-center justify-between pb-0.5">
              {tituloSeccion("add_circle", "Cargar un gasto")}
              <span className="font-caption-italic text-[12px] italic text-outline">Producción, publicidad, envíos…</span>
            </div>
            <FormGasto />
          </section>

          <section className={seccion}>
            <div className="flex items-center justify-between pb-0.5">
              {tituloSeccion("receipt_long", "Últimos gastos")}
              <span className="font-label-sm text-[10px] tracking-wider text-outline">{listaGastos.length} movimientos</span>
            </div>
            {listaGastos.length === 0 ? (
              <p className="rounded-2xl bg-surface-container-lowest px-3 py-3 text-center font-caption-italic text-[13px] italic text-outline">Todavía no hay gastos cargados.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {listaGastos.slice(0, 30).map((g) => (
                  <div key={g.id} className="group flex items-center justify-between gap-space-sm rounded-2xl bg-surface-container-lowest px-3 py-2 shadow-sm transition-colors hover:bg-surface-container">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-body-sm text-[13px] font-medium text-primary">
                        {g.descripcion}
                        {g.proveedor && <span className="font-normal text-outline"> · {g.proveedor}</span>}
                      </div>
                      <div className="font-caption-italic text-[11px] italic text-outline">
                        {g.fecha ? fecha(`${g.fecha}T12:00:00`) : "Sin fecha"} · {CATEGORIAS[g.categoria]} · Pagó {SOCIOS[g.pagado_por]}
                        {g.pagado_por === "nari_mich" && " (mitad cada una)"}
                        {g.reintegrado && " · devuelto"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-space-sm">
                      <span className="font-code-num text-[13px] font-bold text-primary">{ars(g.monto)}</span>
                      <EditarGasto gasto={g} />
                      <Accion
                        accion={borrarGasto.bind(null, g.id)}
                        variante="secundaria"
                        confirmar="¿Borrar este gasto?"
                        className="!bg-transparent !p-0.5 text-outline opacity-40 hover:!bg-surface-dim hover:text-error group-hover:opacity-100"
                      >
                        <span className="ms text-[15px]">close</span>
                      </Accion>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
