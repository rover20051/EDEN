"use client";

import { useState } from "react";
import { ars } from "@/lib/format";
import { COMPONENTES, IVA, PASARELAS, TIPOS, type Calculo, type Plan, type Tipo } from "@/lib/plan";
import { CATEGORIAS } from "@/lib/textos";
import { GananciaReal, PlanVsReal, type SalidaFila, type Ventas, type costoRealPorTipo } from "./tandas";

type Real = ReturnType<typeof costoRealPorTipo>;

type SetPlan = React.Dispatch<React.SetStateAction<Plan>>;
type Editable = { plan: Plan; setPlan: SetPlan; c: Calculo };

const NOMBRE: Record<Tipo, string> = { biblia: "Biblia", journal: "Journal" };
const usd = (n: number, tc: number) => `US$${(n / tc).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, dec = 1) => `${(n * 100).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;

/** Cambia un valor dentro del plan siguiendo una ruta ("costos.biblia.cuero"). */
function usarSet(setPlan: SetPlan) {
  return (ruta: string, valor: unknown) =>
    setPlan((p) => {
      const copia = structuredClone(p) as Record<string, unknown>;
      const partes = ruta.split(".");
      let o = copia as Record<string, unknown>;
      for (const k of partes.slice(0, -1)) o = o[k] as Record<string, unknown>;
      o[partes.at(-1)!] = valor;
      return copia as Plan;
    });
}

// ───────── Piezas visuales (mismo lenguaje que el resto del back office) ─────────

const tarjeta = "rounded-2xl bg-surface-container-low p-4 shadow-sm";
const rotulo = "font-label-sm text-label-sm uppercase tracking-wider text-outline";

function Tarjeta({ titulo, icono, ayuda, children, className = "" }: { titulo: string; icono: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${tarjeta} ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-primary/10 pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="ms text-[18px] text-secondary">{icono}</span>
            <h2 className="font-headline-md text-[17px] uppercase tracking-[0.05em] text-primary">{titulo}</h2>
          </div>
          {ayuda && <p className="mt-0.5 font-caption-italic text-[12px] italic text-outline">{ayuda}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Campo de pesos con separador de miles mientras escribís. */
function Pesos({ valor, onChange, ancho = "w-28", etiqueta }: { valor: number; onChange: (n: number) => void; ancho?: string; etiqueta: string }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-surface-container-lowest px-2.5 py-1 shadow-inner focus-within:ring-1 focus-within:ring-secondary ${ancho}`}>
      <span className="font-code-num text-[13px] text-outline">$</span>
      <input
        aria-label={etiqueta}
        inputMode="numeric"
        value={valor ? valor.toLocaleString("es-AR") : "0"}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
        className="w-full bg-transparent text-right font-code-num text-[13px] text-primary focus:outline-none"
      />
    </span>
  );
}

/** Campo de porcentaje (se escribe 2 o 2,5 y guarda 0,02 / 0,025). */
function Porcentaje({ valor, onChange, etiqueta }: { valor: number; onChange: (n: number) => void; etiqueta: string }) {
  const [texto, setTexto] = useState(String(Math.round(valor * 10000) / 100).replace(".", ","));
  return (
    <span className="inline-flex w-24 items-center rounded-full bg-surface-container-lowest px-2.5 py-1 shadow-inner focus-within:ring-1 focus-within:ring-secondary">
      <input
        aria-label={etiqueta}
        inputMode="decimal"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (!Number.isNaN(n)) onChange(n / 100);
        }}
        className="w-full bg-transparent text-right font-code-num text-[13px] text-primary focus:outline-none"
      />
      <span className="font-code-num text-[13px] text-outline">%</span>
    </span>
  );
}

function Entero({ valor, onChange, etiqueta }: { valor: number; onChange: (n: number) => void; etiqueta: string }) {
  return (
    <input
      aria-label={etiqueta}
      inputMode="numeric"
      value={valor}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
      className="w-20 rounded-full bg-surface-container-lowest px-2.5 py-1 text-right font-code-num text-[13px] text-primary shadow-inner focus:outline-none focus:ring-1 focus:ring-secondary"
    />
  );
}

/** Tabla de dos columnas Biblia | Journal (el formato de la planilla). */
function TablaDoble({ filas, cabecera = ["", "Biblia", "Journal"] }: { filas: { label: React.ReactNode; b: React.ReactNode; j: React.ReactNode; fuerte?: boolean; ayuda?: string }[]; cabecera?: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-left">
        <thead>
          <tr className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            {cabecera.map((h, i) => (
              <th key={i} className={`px-2 py-1.5 font-normal ${i ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-variant/50">
          {filas.map((f, i) => (
            <tr key={i} className={f.fuerte ? "bg-surface-container/70" : ""}>
              <td className={`px-2 py-2 font-body-sm text-[13px] ${f.fuerte ? "font-bold text-primary" : "text-on-surface-variant"}`}>
                {f.label}
                {f.ayuda && <span className="block font-caption-italic text-[11px] italic text-outline">{f.ayuda}</span>}
              </td>
              <td className={`px-2 py-2 text-right font-code-num text-[13px] ${f.fuerte ? "font-bold text-primary" : "text-primary"}`}>{f.b}</td>
              <td className={`px-2 py-2 text-right font-code-num text-[13px] ${f.fuerte ? "font-bold text-primary" : "text-primary"}`}>{f.j}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const colorGanancia = (n: number) => (n < 0 ? "text-error" : "");

// ───────── Resumen ─────────

export function Resumen({
  c,
  plan,
  gastado,
  vendidas,
  recuperado,
  real,
  ventas,
  salidas,
  ir,
}: {
  c: Calculo;
  plan: Plan;
  gastado: Record<string, number>;
  vendidas: Record<Tipo, number>;
  recuperado: number;
  real: Real;
  ventas: Ventas;
  salidas: SalidaFila[];
  ir: (p: "supuestos" | "costos" | "precios" | "tandas" | "salidas") => void;
}) {
  const totalGastado = Object.values(gastado).reduce((s, n) => s + n, 0);
  const tc = plan.tipo_cambio;
  const indicador = (titulo: string, icono: string, valor: React.ReactNode, nota: React.ReactNode, color = "text-primary") => (
    <div className="flex flex-col justify-between rounded-2xl bg-surface-container-lowest p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={rotulo}>{titulo}</span>
        <span className="ms text-[18px] text-outline">{icono}</span>
      </div>
      <div className={`mt-1 font-code-num text-headline-lg ${color}`}>{valor}</div>
      <div className="mt-0.5 font-caption-italic text-[13px] italic text-outline">{nota}</div>
    </div>
  );
  const veredicto = (t: Tipo) => {
    const p = c[t];
    if (p.ventasTodo === null) return <span className="text-error">No: cada venta pierde plata</span>;
    return p.ventasTodo <= p.vendibles ? (
      <span className="text-tertiary">
        Sí — con {p.ventasTodo} ventas de {p.vendibles}
      </span>
    ) : (
      <span className="text-error">
        No — harían falta {p.ventasTodo} y hay {p.vendibles}
      </span>
    );
  };
  const progreso = (t: Tipo) => {
    const p = c[t];
    const meta = p.ventasTodo ?? p.vendibles;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between font-label-sm text-[11px] text-on-surface-variant">
          <span>{NOMBRE[t]}s vendidas</span>
          <span className="font-code-num">
            {vendidas[t]} de {meta} para recuperar todo
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-dim">
          <div className="h-full rounded-full bg-tertiary transition-all" style={{ width: `${meta ? Math.min(100, (vendidas[t] / meta) * 100) : 0}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indicador("Gastado hasta hoy", "receipt_long", ars(totalGastado), usd(totalGastado, tc))}
        {indicador("Recuperado con ventas", "savings", ars(recuperado), totalGastado ? `${pct(recuperado / totalGastado, 0)} de lo gastado` : "—", "text-tertiary")}
        {indicador("Ganancia por Biblia", "menu_book", ars(c.biblia.ganancia), `${pct(c.biblia.margen)} de margen`, c.biblia.ganancia < 0 ? "text-error" : "text-primary")}
        {indicador("Ganancia por Journal", "edit_note", ars(c.journal.ganancia), `${pct(c.journal.margen)} de margen`, c.journal.ganancia < 0 ? "text-error" : "text-primary")}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Plan contra real" icono="compare_arrows" ayuda="Costo por unidad vendible (con merma): lo que supone el plan y lo que costó la última tanda.">
          <PlanVsReal c={c} real={real} />
          <button onClick={() => ir("tandas")} className="mt-2 font-label-sm text-label-sm uppercase text-on-surface-variant underline decoration-primary/30 underline-offset-4 hover:text-primary">
            Ver la ganancia por tanda
          </button>
        </Tarjeta>

        <Tarjeta titulo="Ganancia real" icono="savings" ayuda="Lo que dejaron las ventas, menos lo que costaron los regalos de Edén.">
          <GananciaReal ventas={ventas} salidas={salidas} />
          {salidas.length > 0 && (
            <button onClick={() => ir("salidas")} className="mt-2 font-label-sm text-label-sm uppercase text-on-surface-variant underline decoration-primary/30 underline-offset-4 hover:text-primary">
              Ver las salidas sin cobro
            </button>
          )}
        </Tarjeta>

        <Tarjeta titulo="Dónde estamos" icono="account_balance" ayuda="Gastos reales cargados en Plata.">
          <TablaDoble
            cabecera={["Tipo de gasto", "ARS", "USD"]}
            filas={[
              ...Object.entries(CATEGORIAS)
                .filter(([k]) => gastado[k])
                .map(([k, v]) => ({ label: v, b: ars(gastado[k]), j: usd(gastado[k], tc) })),
              { label: "Total gastado", b: ars(totalGastado), j: usd(totalGastado, tc), fuerte: true },
            ]}
          />
        </Tarjeta>

        <Tarjeta titulo="La unidad" icono="inventory_2" ayuda="Precio = el del catálogo (se cambia en Productos).">
          <TablaDoble
            filas={[
              { label: "Costo directo por unidad", b: ars(c.biblia.costoDirecto), j: ars(c.journal.costoDirecto) },
              { label: "Costo total por unidad vendida", ayuda: "Con merma, envío y publicidad", b: ars(c.biblia.costoTotal), j: ars(c.journal.costoTotal) },
              { label: "Precio de venta", b: ars(c.biblia.precio), j: ars(c.journal.precio) },
              { label: "Ganancia por unidad", b: <span className={colorGanancia(c.biblia.ganancia)}>{ars(c.biblia.ganancia)}</span>, j: <span className={colorGanancia(c.journal.ganancia)}>{ars(c.journal.ganancia)}</span>, fuerte: true },
              { label: "Margen neto", b: pct(c.biblia.margen), j: pct(c.journal.margen) },
            ]}
          />
          <button onClick={() => ir("costos")} className="mt-2 font-label-sm text-label-sm uppercase text-on-surface-variant underline decoration-primary/30 underline-offset-4 hover:text-primary">
            Ver el detalle del costo
          </button>
        </Tarjeta>

        <Tarjeta titulo="Primer lote" icono="flag" ayuda="Si vendieran todo el lote al precio actual.">
          <TablaDoble
            filas={[
              { label: "Unidades vendibles", b: c.biblia.vendibles, j: c.journal.vendibles },
              { label: "Inversión total", ayuda: "Desarrollo + producción + publicidad", b: ars(c.biblia.inversion), j: ars(c.journal.inversion) },
              { label: "Ventas para recuperar producción y publicidad", b: c.biblia.ventasProduccion ?? "—", j: c.journal.ventasProduccion ?? "—" },
              { label: "Ventas para recuperar TODO", b: c.biblia.ventasTodo ?? "—", j: c.journal.ventasTodo ?? "—", fuerte: true },
              { label: "Ingreso si se vende todo", b: ars(c.biblia.ingresoBruto), j: ars(c.journal.ingresoBruto) },
              { label: "Ganancia final del lote", b: <span className={colorGanancia(c.biblia.gananciaLote)}>{ars(c.biblia.gananciaLote)}</span>, j: <span className={colorGanancia(c.journal.gananciaLote)}>{ars(c.journal.gananciaLote)}</span>, fuerte: true },
              { label: "¿Alcanza el lote?", b: veredicto("biblia"), j: veredicto("journal") },
            ]}
          />
          <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-surface-container-highest px-3 py-2">
            {progreso("biblia")}
            {progreso("journal")}
          </div>
        </Tarjeta>

        <div className="flex flex-col gap-4">
          <Tarjeta titulo="Precios de referencia" icono="sell">
            <TablaDoble
              filas={[
                { label: "Mínimo (ganancia 0)", b: ars(c.biblia.referencia.minimo), j: ars(c.journal.referencia.minimo) },
                { label: "Recuperar todo con el primer lote", b: ars(c.biblia.referencia.recuperarTodo), j: ars(c.journal.referencia.recuperarTodo) },
                { label: `Margen objetivo (${pct(plan.margen_objetivo, 0)})`, b: ars(c.biblia.referencia.objetivo), j: ars(c.journal.referencia.objetivo) },
                { label: "Regla 3× costo directo", b: ars(c.biblia.referencia.tresX), j: ars(c.journal.referencia.tresX) },
              ]}
            />
          </Tarjeta>
          <Tarjeta titulo="Segundo lote y sostenibilidad" icono="autorenew" ayuda="El segundo lote ya no paga desarrollo.">
            <TablaDoble
              filas={[
                { label: "Ganancia de un segundo lote igual", b: ars(c.biblia.segundoLote), j: ars(c.journal.segundoLote), fuerte: true },
                { label: `Unidades por mes para ganar ${ars(plan.meta_mensual)}`, ayuda: `Con ${ars(c.fijos)} de costos fijos`, b: c.biblia.unidadesMes ?? "—", j: c.journal.unidadesMes ?? "—" },
                { label: "Eso es, por semana", b: c.biblia.unidadesMes ? Math.ceil(c.biblia.unidadesMes / 4.33) : "—", j: c.journal.unidadesMes ? Math.ceil(c.journal.unidadesMes / 4.33) : "—" },
                { label: "Vendiendo un Journal por cada Biblia: de cada uno por mes", b: c.mezcla ?? "—", j: c.mezcla ?? "—" },
              ]}
            />
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

// ───────── Supuestos ─────────

export function Supuestos({ plan, setPlan, c }: Editable) {
  const set = usarSet(setPlan);
  const fila = (label: string, control: React.ReactNode, ayuda?: string) => (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="font-body-sm text-[13px] text-on-surface-variant">
        {label}
        {ayuda && <span className="block font-caption-italic text-[11px] italic text-outline">{ayuda}</span>}
      </span>
      <span className="flex items-center gap-2">{control}</span>
    </div>
  );
  const doble = (label: string, render: (t: Tipo) => React.ReactNode, ayuda?: string) =>
    fila(
      label,
      <>
        {TIPOS.map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className="font-label-sm text-[10px] uppercase text-outline">{NOMBRE[t][0]}</span>
            {render(t)}
          </span>
        ))}
      </>,
      ayuda,
    );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Tarjeta titulo="Lote" icono="inventory" ayuda="B = Biblia · J = Journal">
        <div className="divide-y divide-surface-variant/50">
          {doble("Unidades del lote", (t) => <Entero etiqueta={`Lote ${t}`} valor={plan.lote[t]} onChange={(n) => set(`lote.${t}`, Math.max(1, n))} />)}
          {doble("Merma esperada", (t) => <Porcentaje etiqueta={`Merma ${t}`} valor={plan.merma[t]} onChange={(n) => set(`merma.${t}`, n)} />, "Piezas que salen falladas y no se venden")}
          {fila(
            "Parte del desarrollo que carga la Biblia",
            <Porcentaje etiqueta="Desarrollo Biblia" valor={plan.desarrollo_pct_biblia} onChange={(n) => set("desarrollo_pct_biblia", Math.min(1, n))} />,
            "El resto lo carga el Journal",
          )}
          {fila("Margen neto objetivo", <Porcentaje etiqueta="Margen objetivo" valor={plan.margen_objetivo} onChange={(n) => set("margen_objetivo", n)} />, "Para el precio de referencia")}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Cobro" icono="payments" ayuda="La pasarela se elige en la pestaña Pasarelas.">
        <div className="divide-y divide-surface-variant/50">
          {fila("Pasarela para tarjetas", <span className="font-body-sm text-[13px] text-primary">{PASARELAS.find((p) => p.id === plan.pasarela)?.nombre}</span>)}
          {fila("Transferencias", <span className="font-body-sm text-[13px] text-primary">{PASARELAS.find((p) => p.id === plan.transferencia)?.nombre}</span>)}
          {fila("% de ventas cobradas por la pasarela", <Porcentaje etiqueta="Ventas por pasarela" valor={plan.pct_pasarela} onChange={(n) => set("pct_pasarela", Math.min(1, n))} />, "El resto entra por transferencia")}
          {fila("Descuento por transferencia", <Porcentaje etiqueta="Descuento transferencia" valor={plan.descuento_transferencia} onChange={(n) => set("descuento_transferencia", n)} />)}
          {fila("Comisión de la plataforma web", <Porcentaje etiqueta="Comisión plataforma" valor={plan.comision_plataforma} onChange={(n) => set("comision_plataforma", n)} />)}
          {fila("Costo de cobro promedio", <span className="rounded-full bg-tertiary-fixed px-2.5 py-0.5 font-code-num text-[13px] font-bold text-tertiary">{pct(c.cobro, 2)}</span>, "Calculado")}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Vender y enviar" icono="local_shipping" ayuda="Por unidad vendida, salvo la publicidad (por lote).">
        <div className="divide-y divide-surface-variant/50">
          {doble("Envío que absorbe Edén", (t) => <Pesos etiqueta={`Envío ${t}`} valor={plan.envio[t]} onChange={(n) => set(`envio.${t}`, n)} ancho="w-24" />, "0 = lo paga el cliente")}
          {doble("Material de envío", (t) => <Pesos etiqueta={`Material ${t}`} valor={plan.material_envio[t]} onChange={(n) => set(`material_envio.${t}`, n)} ancho="w-24" />)}
          {doble("Publicidad del lote", (t) => <Pesos etiqueta={`Publicidad ${t}`} valor={plan.publicidad_lote[t]} onChange={(n) => set(`publicidad_lote.${t}`, n)} ancho="w-24" />)}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Fijos, meta y dólar" icono="event_repeat">
        <div className="divide-y divide-surface-variant/50">
          {fila("Web: plataforma + dominio (por mes)", <Pesos etiqueta="Web" valor={plan.fijos.web} onChange={(n) => set("fijos.web", n)} />)}
          {fila("Monotributo / impuestos (por mes)", <Pesos etiqueta="Impuestos" valor={plan.fijos.impuestos} onChange={(n) => set("fijos.impuestos", n)} />)}
          {fila("Otras herramientas (por mes)", <Pesos etiqueta="Otros" valor={plan.fijos.otros} onChange={(n) => set("fijos.otros", n)} />)}
          {fila("Ganancia mensual deseada", <Pesos etiqueta="Meta mensual" valor={plan.meta_mensual} onChange={(n) => set("meta_mensual", n)} ancho="w-32" />)}
          {fila(
            "Tipo de cambio (ARS por US$)",
            <>
              <Pesos etiqueta="Tipo de cambio" valor={plan.tipo_cambio} onChange={(n) => set("tipo_cambio", Math.max(1, n))} ancho="w-24" />
              <input
                type="date"
                aria-label="Fecha del tipo de cambio"
                value={plan.fecha_tc}
                onChange={(e) => set("fecha_tc", e.target.value)}
                className="rounded-full bg-surface-container-lowest px-2.5 py-1 font-code-num text-[12px] text-primary shadow-inner focus:outline-none"
              />
            </>,
            "Solo para ver los montos en dólares",
          )}
        </div>
      </Tarjeta>
    </div>
  );
}

// ───────── Costo por unidad ─────────

export function Costos({ plan, setPlan, c, real }: Editable & { real: Real }) {
  const set = usarSet(setPlan);
  const tc = plan.tipo_cambio;
  const filas: { label: string; ayuda?: string; b: React.ReactNode; j: React.ReactNode; fuerte?: boolean }[] = [
    ...COMPONENTES.map((k) => ({
      label: k.label,
      b: <Pesos etiqueta={`${k.label} Biblia`} valor={plan.costos.biblia[k.clave]} onChange={(n) => set(`costos.biblia.${k.clave}`, n)} />,
      j: <Pesos etiqueta={`${k.label} Journal`} valor={plan.costos.journal[k.clave]} onChange={(n) => set(`costos.journal.${k.clave}`, n)} />,
    })),
    { label: "Costo directo por unidad producida", b: ars(c.biblia.costoDirecto), j: ars(c.journal.costoDirecto), fuerte: true },
    { label: "Unidades vendibles (lote menos merma)", b: `${c.biblia.vendibles} de ${c.biblia.lote}`, j: `${c.journal.vendibles} de ${c.journal.lote}` },
    { label: "Costo por unidad vendible", ayuda: "Las falladas también se pagan", b: ars(c.biblia.costoVendible), j: ars(c.journal.costoVendible) },
    {
      label: "Real: última tanda",
      ayuda: "Lo que costó de verdad (Productos → Nueva tanda)",
      b: <CostoReal plan={c.biblia.costoVendible} real={real.biblia?.costo} />,
      j: <CostoReal plan={c.journal.costoVendible} real={real.journal?.costo} />,
    },
    { label: "Envío + material", b: ars(c.biblia.vender), j: ars(c.journal.vender) },
    { label: "Publicidad por unidad", b: ars(c.biblia.publicidadUnidad), j: ars(c.journal.publicidadUnidad) },
    { label: "Costo total por unidad vendida", ayuda: "Sin el % de cobro", b: ars(c.biblia.costoTotal), j: ars(c.journal.costoTotal), fuerte: true },
    { label: "En dólares", b: usd(c.biblia.costoTotal, tc), j: usd(c.journal.costoTotal, tc) },
    { label: "Costo de cobro", b: pct(c.cobro, 2), j: pct(c.cobro, 2) },
  ];
  return (
    <Tarjeta titulo="Costo por unidad" icono="calculate" ayuda="Lo que cuesta hacer y vender cada pieza. Los componentes se editan acá.">
      <TablaDoble filas={filas} cabecera={["Concepto", "Biblia", "Journal"]} />
      <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-secondary-fixed/30 px-3 py-2 font-caption-italic text-[12px] italic text-on-surface-variant">
        <span className="ms mt-px text-[14px] text-secondary">info</span>
        <span>El costo real se carga en Productos → Nueva tanda; los supuestos de acá son para simular.</span>
      </p>
      <p className="mt-2 rounded-2xl bg-surface-container px-3 py-2 font-caption-italic text-[12px] italic text-on-surface-variant">
        Set Biblia + Journal: costo directo {ars(c.biblia.costoDirecto + c.journal.costoDirecto)} · costo total {ars(c.biblia.costoTotal + c.journal.costoTotal)}.
      </p>
    </Tarjeta>
  );
}

/** Costo real de la última tanda con su diferencia contra el plan (rojo si salió más caro). */
function CostoReal({ plan, real }: { plan: number; real: number | undefined }) {
  if (real == null) return <span className="font-caption-italic text-[12px] italic text-outline">Sin tandas</span>;
  const dif = plan ? (real - plan) / plan : 0;
  const color = Math.abs(dif) < 0.02 ? "text-on-surface-variant" : dif > 0 ? "text-error" : "text-tertiary";
  return (
    <span className="flex flex-col items-end">
      <span>{ars(real)}</span>
      <span className={`text-[11px] font-bold ${color}`}>
        {dif > 0 ? "+" : ""}
        {(dif * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% vs plan
      </span>
    </span>
  );
}

// ───────── Precio y margen ─────────

export function Precios({ plan, setPlan, c }: Editable) {
  const set = usarSet(setPlan);
  return (
    <div className="flex flex-col gap-4">
      {TIPOS.map((t) => {
        const p = c[t];
        const lista = [...plan.precios_tabla[t]];
        const filas = [
          ...lista.map((precio, i) => ({ precio, i, marca: "" })),
          { precio: p.precio, i: -1, marca: "Precio actual" },
          { precio: p.referencia.objetivo, i: -2, marca: "Margen objetivo" },
        ];
        return (
          <Tarjeta key={t} titulo={`${NOMBRE[t]}: precio y margen`} icono="sell" ayuda="Cambiá los precios de la primera columna para probar.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left">
                <thead>
                  <tr className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                    {["Precio", "Costo de cobro", "Costo por unidad", "Ganancia por unidad", "Margen", "Veces el costo", "Ganancia del lote"].map((h, i) => (
                      <th key={h} className={`px-2 py-1.5 font-normal ${i ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant/50 font-code-num text-[13px] text-primary">
                  {filas.map((f) => {
                    const ganancia = f.precio * (1 - c.cobro) - p.costoTotal;
                    return (
                      <tr key={`${f.i}-${f.precio}`} className={f.marca ? "bg-surface-container/70" : "hover:bg-surface-container/40"}>
                        <td className="px-2 py-1.5">
                          {f.i >= 0 ? (
                            <Pesos
                              etiqueta={`Precio de prueba ${f.i + 1}`}
                              valor={f.precio}
                              onChange={(n) => {
                                const nueva = [...lista];
                                nueva[f.i] = n || 1;
                                set(`precios_tabla.${t}`, nueva);
                              }}
                            />
                          ) : (
                            <span className="flex flex-col">
                              <span className="font-bold">{ars(f.precio)}</span>
                              <span className="font-caption-italic text-[11px] italic text-secondary">{f.marca}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">{ars(p.costoCobro(f.precio))}</td>
                        <td className="px-2 py-1.5 text-right">{ars(p.costoTotal)}</td>
                        <td className={`px-2 py-1.5 text-right font-bold ${colorGanancia(ganancia)}`}>{ars(ganancia)}</td>
                        <td className={`px-2 py-1.5 text-right ${colorGanancia(ganancia)}`}>{pct(ganancia / f.precio)}</td>
                        <td className="px-2 py-1.5 text-right">{(f.precio / p.costoDirecto).toLocaleString("es-AR", { maximumFractionDigits: 1 })}×</td>
                        <td className={`px-2 py-1.5 text-right ${colorGanancia(p.gananciaLoteA(f.precio))}`}>{ars(p.gananciaLoteA(f.precio))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        );
      })}
    </div>
  );
}

// ───────── Escenarios ─────────

export function Escenarios({ plan, setPlan, c }: Editable) {
  const set = usarSet(setPlan);
  const [tipo, setTipo] = useState<Tipo>("biblia");
  const p = c[tipo];
  const { lotes, costos, precios } = plan.escenarios;
  const editarLista = (clave: "lotes" | "costos" | "precios", i: number, n: number) => {
    const nueva = [...plan.escenarios[clave]];
    nueva[i] = Math.max(1, n);
    set(`escenarios.${clave}`, nueva);
  };
  const celda = (v: number, esMargen = false) => (
    <td className={`px-2 py-1.5 text-right font-code-num text-[13px] ${v < 0 ? "bg-error-container/40 text-error" : esMargen && v >= plan.margen_objetivo ? "bg-tertiary-fixed/50 text-tertiary" : "text-primary"}`}>
      {esMargen ? pct(v) : ars(v)}
    </td>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {TIPOS.map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`rounded-full px-4 py-1.5 font-label-md text-label-md uppercase tracking-wider ${tipo === t ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
          >
            {NOMBRE[t]}
          </button>
        ))}
      </div>

      <Tarjeta titulo="Ganancia del lote según precio y tamaño de lote" icono="grid_view" ayuda="Incluye desarrollo y publicidad. Editá los encabezados.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left font-label-sm text-label-sm font-normal uppercase text-outline">Precio \ Lote</th>
                {lotes.map((l, i) => (
                  <th key={i} className="px-2 py-1.5 text-right">
                    <Entero etiqueta={`Lote ${i + 1}`} valor={l} onChange={(n) => editarLista("lotes", i, n)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant/50">
              {precios.map((precio, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">
                    <Pesos etiqueta={`Precio ${i + 1}`} valor={precio} onChange={(n) => editarLista("precios", i, n)} />
                  </td>
                  {lotes.map((l, j) => (
                    <Celda key={j} render={() => celda(p.escenarioLote(precio, l))} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Margen por unidad según precio y costo directo" icono="percent" ayuda={`En verde: llega al margen objetivo (${pct(plan.margen_objetivo, 0)}). Sirve para ver cuánto ganan bajando costos.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left font-label-sm text-label-sm font-normal uppercase text-outline">Precio \ Costo</th>
                {costos.map((k, i) => (
                  <th key={i} className="px-2 py-1.5 text-right">
                    <Pesos etiqueta={`Costo ${i + 1}`} valor={k} onChange={(n) => editarLista("costos", i, n)} ancho="w-24" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant/50">
              {precios.map((precio, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5 font-code-num text-[13px] text-primary">{ars(precio)}</td>
                  {costos.map((k, j) => (
                    <Celda key={j} render={() => celda(p.escenarioMargen(precio, k), true)} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}

function Celda({ render }: { render: () => React.ReactNode }) {
  return <>{render()}</>;
}

// ───────── Pasarelas ─────────

export function Pasarelas({ plan, setPlan, c }: Editable) {
  const set = usarSet(setPlan);
  const grupo = (tipo: "tarjeta" | "transferencia") => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <thead>
          <tr className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            {["", "Opción", "Acreditación", "Sin IVA", "Con IVA", "A favor", "En contra", "Fuente"].map((h, i) => (
              <th key={i} className="px-2 py-1.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-variant/50 text-[13px]">
          {PASARELAS.filter((p) => p.tipo === tipo).map((p) => {
            const elegida = tipo === "tarjeta" ? plan.pasarela === p.id : plan.transferencia === p.id;
            return (
              <tr
                key={p.id}
                onClick={() => set(tipo === "tarjeta" ? "pasarela" : "transferencia", p.id)}
                className={`cursor-pointer transition-colors ${elegida ? "bg-tertiary-fixed/40" : "hover:bg-surface-container/60"}`}
              >
                <td className="px-2 py-2">
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full ring-1 ${elegida ? "bg-tertiary ring-tertiary" : "ring-outline"}`}>
                    {elegida && <span className="h-1.5 w-1.5 rounded-full bg-surface" />}
                  </span>
                </td>
                <td className="px-2 py-2 font-body-sm font-medium text-primary">{p.nombre}</td>
                <td className="px-2 py-2 font-label-sm text-label-sm text-outline">{p.acreditacion}</td>
                <td className="px-2 py-2 font-code-num">{pct(p.comision, 2)}</td>
                <td className="px-2 py-2 font-code-num font-bold">{pct(p.comision * IVA, 2)}</td>
                <td className="px-2 py-2 font-caption-italic italic text-on-surface-variant">{p.afavor}</td>
                <td className="px-2 py-2 font-caption-italic italic text-on-surface-variant">{p.contra}</td>
                <td className="px-2 py-2 font-label-sm text-[11px] text-outline">{p.fuente}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-container px-4 py-2.5">
        <span className="ms text-[18px] text-secondary">info</span>
        <span className="font-body-sm text-[13px] text-on-surface-variant">
          Tocá una fila para elegirla. Con lo elegido, el costo de cobro promedio queda en <strong className="font-code-num text-primary">{pct(c.cobro, 2)}</strong> del precio.
          Comisiones de la página oficial de cada pasarela (2-nov-2026).
        </span>
      </div>
      <Tarjeta titulo="Tarjetas y billeteras" icono="credit_card">
        {grupo("tarjeta")}
      </Tarjeta>
      <Tarjeta titulo="Transferencias" icono="account_balance">
        {grupo("transferencia")}
      </Tarjeta>
    </div>
  );
}
