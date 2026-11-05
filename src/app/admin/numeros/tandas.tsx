"use client";

// Ganancia real por tanda (lote), salidas sin cobro y plan contra real. Todo sale de la base: v_tandas y v_salidas.

import Link from "next/link";
import { useState } from "react";
import { ars, fecha, numeroPedido } from "@/lib/format";
import { TIPOS, type Calculo, type Plan, type Tipo } from "@/lib/plan";
import { MOTIVOS_SALIDA, QUIEN_SALIDA, etiquetaSalida, type MotivoSalida, type QuienSalida } from "@/lib/textos";

export type TandaFila = {
  lote_id: string;
  producto_id: string;
  producto: string;
  tipo: Tipo;
  numero: number;
  fecha: string;
  unidades: number;
  merma: number;
  costo_unitario: number;
  costo_vendible: number;
  costo_tanda: number;
  vendidas: number;
  reservadas: number;
  regaladas: number;
  disponibles: number;
  ingreso_neto: number;
  costo_regalado: number;
};

export type SalidaFila = {
  pedido_id: string;
  numero: number;
  created_at: string;
  estado: string;
  salida_motivo: MotivoSalida;
  salida_por: QuienSalida | null;
  destinatario: string;
  piezas: number;
  costo_productos: number;
  costo_envio: number;
};

export type Ventas = { pedidos: number; neto: number; costoEnvio: number; costoProductos: number };

const PLURAL: Record<Tipo, string> = { biblia: "Biblias", journal: "Journals" };
const pct = (n: number) => `${Math.round(n * 100).toLocaleString("es-AR")}%`;
const signo = (n: number) => (n > 0 ? "+" : "");
const fechaTanda = (f: string) => fecha(`${f}T12:00:00`);

const tarjeta = "rounded-2xl bg-surface-container-low p-4 shadow-sm";
const rotulo = "font-label-sm text-label-sm uppercase tracking-wider text-outline";

function Cabecera({ titulo, icono, ayuda, extra }: { titulo: string; icono: string; ayuda?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-col justify-between gap-2 border-b border-primary/10 pb-2 sm:flex-row sm:items-start">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="ms text-[18px] text-secondary">{icono}</span>
          <h2 className="font-headline-md text-[17px] uppercase tracking-[0.05em] text-primary">{titulo}</h2>
        </div>
        {ayuda && <p className="mt-0.5 font-caption-italic text-[12px] italic text-outline">{ayuda}</p>}
      </div>
      {extra}
    </div>
  );
}

function Vacio({ icono, titulo, children }: { icono: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className={`${tarjeta} flex flex-col items-center gap-2 py-10 text-center`}>
      <span className="ms text-[32px] text-outline-variant">{icono}</span>
      <h2 className="font-headline-md text-[18px] uppercase tracking-[0.05em] text-primary">{titulo}</h2>
      <p className="max-w-md font-caption-italic text-[13px] italic text-outline">{children}</p>
    </div>
  );
}

function Dato({ label, valor, nota, color = "text-primary" }: { label: string; valor: React.ReactNode; nota?: React.ReactNode; color?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">{label}</span>
      <span className={`font-code-num text-[14px] font-bold leading-tight ${color}`}>{valor}</span>
      {nota && <span className="font-caption-italic text-[11px] italic text-outline">{nota}</span>}
    </div>
  );
}

// ───────── Cuentas ─────────

/** Ganancia que deja cada unidad que queda, según el plan: precio actual menos el cobro y el envío. */
const netoPorUnidad = (t: TandaFila, c: Calculo, precios: Record<string, number>) => (precios[t.producto_id] ?? 0) * (1 - c.cobro) - c[t.tipo].vender;

type Totales = {
  unidades: number;
  merma: number;
  vendidas: number;
  reservadas: number;
  regaladas: number;
  disponibles: number;
  costo: number;
  ingreso: number;
  costoRegalado: number;
  proyectado: number;
};

function sumar(lista: TandaFila[], c: Calculo, precios: Record<string, number>): Totales {
  const t: Totales = { unidades: 0, merma: 0, vendidas: 0, reservadas: 0, regaladas: 0, disponibles: 0, costo: 0, ingreso: 0, costoRegalado: 0, proyectado: 0 };
  for (const x of lista) {
    t.unidades += x.unidades;
    t.merma += x.merma;
    t.vendidas += x.vendidas;
    t.reservadas += x.reservadas;
    t.regaladas += x.regaladas;
    t.disponibles += x.disponibles;
    t.costo += Number(x.costo_tanda);
    t.ingreso += Number(x.ingreso_neto);
    t.costoRegalado += Number(x.costo_regalado);
    t.proyectado += Number(x.ingreso_neto) + (x.disponibles + x.reservadas) * Math.max(0, netoPorUnidad(x, c, precios));
  }
  return t;
}

/**
 * Costo real por unidad vendible de la última tanda de cada producto, promediado por tipo (pesa más la tanda más grande).
 * null si todavía no hay tandas de ese tipo.
 */
export function costoRealPorTipo(tandas: TandaFila[]): Record<Tipo, { costo: number; tandas: number; fecha: string } | null> {
  const ultima = new Map<string, TandaFila>();
  for (const t of tandas) {
    const u = ultima.get(t.producto_id);
    if (!u || t.fecha > u.fecha || (t.fecha === u.fecha && t.numero > u.numero)) ultima.set(t.producto_id, t);
  }
  const res = { biblia: null, journal: null } as Record<Tipo, { costo: number; tandas: number; fecha: string } | null>;
  for (const tipo of TIPOS) {
    const lista = [...ultima.values()].filter((t) => t.tipo === tipo);
    const peso = lista.reduce((s, t) => s + (t.unidades - t.merma), 0);
    if (!lista.length || !peso) continue;
    res[tipo] = {
      costo: Math.round(lista.reduce((s, t) => s + t.costo_vendible * (t.unidades - t.merma), 0) / peso),
      tandas: lista.length,
      fecha: lista.map((t) => t.fecha).sort().at(-1)!,
    };
  }
  return res;
}

// ───────── Barra de una tanda ─────────

const SEGMENTOS = [
  { clave: "vendidas", label: "Vendidas", color: "bg-tertiary" },
  { clave: "reservadas", label: "Reservadas", color: "bg-secondary-fixed-dim" },
  { clave: "regaladas", label: "Regaladas", color: "bg-secondary" },
  { clave: "disponibles", label: "Disponibles", color: "bg-surface-dim" },
  { clave: "merma", label: "Merma", color: "bg-error/50" },
] as const;

function Barra({ t, alto = "h-2.5" }: { t: Pick<Totales, "vendidas" | "reservadas" | "regaladas" | "disponibles" | "merma" | "unidades">; alto?: string }) {
  const total = Math.max(t.unidades, 1);
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-surface-container-highest ${alto}`} role="img" aria-label={SEGMENTOS.map((s) => `${t[s.clave]} ${s.label.toLowerCase()}`).join(", ")}>
      {SEGMENTOS.map((s) =>
        t[s.clave] > 0 ? <div key={s.clave} className={`h-full ${s.color}`} style={{ width: `${(t[s.clave] / total) * 100}%` }} title={`${s.label}: ${t[s.clave]}`} /> : null,
      )}
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 font-label-sm text-[10px] uppercase tracking-wider text-outline">
      {SEGMENTOS.map((s) => (
        <span key={s.clave} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${s.color}`} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Recuperado({ ingreso, costo }: { ingreso: number; costo: number }) {
  const r = costo ? ingreso / costo : 0;
  const color = r >= 1 ? "bg-tertiary text-on-tertiary" : r >= 0.5 ? "bg-tertiary-fixed text-tertiary" : "bg-secondary-fixed text-secondary";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 font-code-num text-[12px] font-bold ${color}`}>{costo ? `${pct(r)} recuperado` : "—"}</span>;
}

// ───────── Tarjetas ─────────

function TarjetaTanda({ t, c, precios, titulo }: { t: TandaFila; c: Calculo; precios: Record<string, number>; titulo: string }) {
  const realizada = Number(t.ingreso_neto) - Number(t.costo_tanda);
  const neto = netoPorUnidad(t, c, precios);
  const proyectada = realizada + (t.disponibles + t.reservadas) * Math.max(0, neto);
  const partes = [
    t.vendidas && `${t.vendidas} vendida${t.vendidas === 1 ? "" : "s"}`,
    t.reservadas && `${t.reservadas} reservada${t.reservadas === 1 ? "" : "s"}`,
    t.regaladas && `${t.regaladas} regalada${t.regaladas === 1 ? "" : "s"}`,
    `${t.disponibles} disponible${t.disponibles === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-lowest p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-headline-md text-[16px] leading-tight text-primary">{titulo}</span>
            <span className="font-label-sm text-[11px] uppercase tracking-wider text-outline">{fechaTanda(t.fecha)}</span>
          </div>
          <span className="font-caption-italic text-[12px] italic text-on-surface-variant">
            {t.unidades} u.{t.merma ? ` · ${t.merma} de merma` : " · sin merma"} · {partes.join(" · ")}
          </span>
        </div>
        <Recuperado ingreso={Number(t.ingreso_neto)} costo={Number(t.costo_tanda)} />
      </div>
      <Barra t={t} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-0.5 sm:grid-cols-3 lg:grid-cols-5">
        <Dato label="Costo unitario real" valor={ars(t.costo_vendible)} nota={t.merma ? `${ars(t.costo_unitario)} sin repartir merma` : undefined} />
        <Dato label="Costo de la tanda" valor={ars(t.costo_tanda)} nota={t.costo_regalado ? `${ars(t.costo_regalado)} regalado` : undefined} />
        <Dato label="Ingreso neto" valor={ars(t.ingreso_neto)} nota="Cobrado sin comisión ni envío" />
        <Dato label="Ganancia realizada" valor={ars(realizada)} color={realizada < 0 ? "text-error" : "text-tertiary"} />
        <Dato
          label="Si se vende lo que queda"
          valor={ars(proyectada)}
          color={proyectada < 0 ? "text-error" : "text-primary"}
          nota={t.disponibles + t.reservadas ? `${t.disponibles + t.reservadas} × ${ars(Math.max(0, neto))}` : "No queda nada"}
        />
      </div>
    </div>
  );
}

function FilaTotales({ titulo, t, destacado = false }: { titulo: string; t: Totales; destacado?: boolean }) {
  const realizada = t.ingreso - t.costo;
  const proyectada = t.proyectado - t.costo;
  return (
    <div className={`flex flex-col gap-2 rounded-2xl p-3 ${destacado ? "bg-primary text-on-primary shadow-md" : "bg-surface-container-highest/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`font-label-sm text-label-sm font-bold uppercase tracking-widest ${destacado ? "text-on-primary" : "text-primary"}`}>{titulo}</span>
        <span className={`font-caption-italic text-[12px] italic ${destacado ? "text-on-primary/80" : "text-outline"}`}>
          {t.unidades} u. · {t.vendidas} vendidas · {t.regaladas} regaladas · {t.disponibles} disponibles
        </span>
      </div>
      {!destacado && <Barra t={t} alto="h-1.5" />}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ["Costo total", ars(t.costo), ""],
            ["Ingreso neto", ars(t.ingreso), ""],
            ["Recuperado", t.costo ? pct(t.ingreso / t.costo) : "—", ""],
            ["Ganancia realizada", ars(realizada), realizada < 0 ? "neg" : "pos"],
            ["Si se vende lo que queda", ars(proyectada), proyectada < 0 ? "neg" : ""],
          ] as const
        ).map(([label, valor, tono]) => (
          <div key={label} className="flex flex-col">
            <span className={`font-label-sm text-[10px] uppercase tracking-wider ${destacado ? "text-on-primary/70" : "text-outline"}`}>{label}</span>
            <span
              className={`font-code-num text-[15px] font-bold leading-tight ${
                destacado ? (tono === "neg" ? "text-error-container" : "text-on-primary") : tono === "neg" ? "text-error" : tono === "pos" ? "text-tertiary" : "text-primary"
              }`}
            >
              {valor}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────── Pestaña Tandas ─────────

export function Tandas({ tandas, c, precios, plan }: { tandas: TandaFila[]; c: Calculo; precios: Record<string, number>; plan: Plan }) {
  const [agrupar, setAgrupar] = useState<"producto" | "numero">("producto");
  if (tandas.length === 0) {
    return (
      <Vacio icono="layers" titulo="Todavía no hay tandas">
        Cada tanda se carga en{" "}
        <Link href="/admin/productos" className="underline decoration-primary/30 underline-offset-4 hover:text-primary">
          Productos → Nueva tanda
        </Link>{" "}
        con sus unidades, merma y costo real. Acá vas a ver cuánto recuperó cada una.
      </Vacio>
    );
  }
  const sinVentas = tandas.every((t) => !t.vendidas && !t.regaladas && !t.reservadas);
  const general = sumar(tandas, c, precios);
  const numeros = [...new Set(tandas.map((t) => t.numero))].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4">
      <section className={tarjeta}>
        <Cabecera
          titulo="Ganancia real por tanda"
          icono="layers"
          ayuda={
            <>
              Cada pieza vendida o regalada sale de la tanda más vieja con lugar. Ingreso neto = lo cobrado sin comisión ni envío. La proyección usa el precio actual, el cobro del
              plan ({(c.cobro * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%) y su envío por pieza (Biblia {ars(plan.envio.biblia + plan.material_envio.biblia)} · Journal{" "}
              {ars(plan.envio.journal + plan.material_envio.journal)}).
            </>
          }
          extra={
            <div role="radiogroup" aria-label="Agrupar tandas" className="flex shrink-0 self-start rounded-full bg-surface-container p-0.5">
              {(
                [
                  ["producto", "Por producto"],
                  ["numero", "Por tanda"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={agrupar === k}
                  onClick={() => setAgrupar(k)}
                  className={`rounded-full px-3 py-1 font-label-sm text-[11px] uppercase tracking-wider transition-all ${
                    agrupar === k ? "bg-surface-dim font-bold text-on-surface shadow-sm" : "text-outline hover:text-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        {sinVentas && (
          <p className="mb-3 flex items-center gap-2 rounded-2xl bg-surface-container px-3 py-2 font-caption-italic text-[13px] italic text-on-surface-variant">
            <span className="ms text-[16px] text-outline">info</span>
            Todavía no salió ninguna pieza: el recuperado arranca en 0% y la ganancia realizada es el costo de las tandas en negativo.
          </p>
        )}
        <div className="mb-3">
          <Leyenda />
        </div>
        <FilaTotales titulo="Total general" t={general} destacado />
      </section>

      {agrupar === "producto"
        ? TIPOS.filter((tipo) => tandas.some((t) => t.tipo === tipo)).map((tipo) => {
            const delTipo = tandas.filter((t) => t.tipo === tipo).sort((a, b) => a.producto.localeCompare(b.producto, "es") || a.numero - b.numero);
            const productos = [...new Set(delTipo.map((t) => t.producto))];
            return (
              <section key={tipo} className={`${tarjeta} flex flex-col gap-3`}>
                <Cabecera titulo={PLURAL[tipo]} icono={tipo === "biblia" ? "menu_book" : "edit_note"} ayuda={`${delTipo.length} tanda${delTipo.length === 1 ? "" : "s"} de ${productos.length} diseño${productos.length === 1 ? "" : "s"}`} />
                <FilaTotales titulo={`Total ${PLURAL[tipo]}`} t={sumar(delTipo, c, precios)} />
                <div className="flex flex-col gap-2">
                  {delTipo.map((t) => (
                    <TarjetaTanda key={t.lote_id} t={t} c={c} precios={precios} titulo={`${t.producto} · Tanda ${t.numero}`} />
                  ))}
                </div>
              </section>
            );
          })
        : numeros.map((n) => {
            const deEsta = tandas.filter((t) => t.numero === n).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.producto.localeCompare(b.producto, "es"));
            return (
              <section key={n} className={`${tarjeta} flex flex-col gap-3`}>
                <Cabecera titulo={`Tanda ${n}`} icono="layers" ayuda={`${deEsta.length} producto${deEsta.length === 1 ? "" : "s"}`} />
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {TIPOS.filter((tipo) => deEsta.some((t) => t.tipo === tipo)).map((tipo) => (
                    <FilaTotales key={tipo} titulo={`${PLURAL[tipo]} de la tanda ${n}`} t={sumar(deEsta.filter((t) => t.tipo === tipo), c, precios)} />
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {deEsta.map((t) => (
                    <TarjetaTanda key={t.lote_id} t={t} c={c} precios={precios} titulo={t.producto} />
                  ))}
                </div>
              </section>
            );
          })}
    </div>
  );
}

// ───────── Pestaña Salidas ─────────

export function Salidas({ salidas }: { salidas: SalidaFila[] }) {
  if (salidas.length === 0) {
    return (
      <Vacio icono="volunteer_activism" titulo="Todavía no hubo salidas sin cobro">
        Los regalos, envíos a influencers, reposiciones por falla y muestras se cargan en{" "}
        <Link href="/admin/pedidos/nuevo?tipo=salida" className="underline decoration-primary/30 underline-offset-4 hover:text-primary">
          Nuevo pedido → Salida sin cobro
        </Link>
        . Acá vas a ver cuánto le costaron a Edén.
      </Vacio>
    );
  }
  const costo = (s: SalidaFila) => s.costo_productos + s.costo_envio;
  const total = salidas.reduce((n, s) => n + costo(s), 0);
  const piezas = salidas.reduce((n, s) => n + s.piezas, 0);
  const productos = salidas.reduce((n, s) => n + s.costo_productos, 0);
  const envios = salidas.reduce((n, s) => n + s.costo_envio, 0);
  const sinEnvio = salidas.filter((s) => !s.costo_envio && !["despachado", "entregado"].includes(s.estado)).length;

  const agrupar = <K extends string>(clave: (s: SalidaFila) => K, nombres: Record<K, string>) =>
    (Object.keys(nombres) as K[])
      .map((k) => {
        const de = salidas.filter((s) => clave(s) === k);
        return { k, nombre: nombres[k], salidas: de.length, piezas: de.reduce((n, s) => n + s.piezas, 0), costo: de.reduce((n, s) => n + costo(s), 0) };
      })
      .filter((g) => g.salidas > 0)
      .sort((a, b) => b.costo - a.costo);

  const porMotivo = agrupar((s) => s.salida_motivo, MOTIVOS_SALIDA);
  const porQuien = agrupar((s) => (s.salida_por ?? "sin_dato") as QuienSalida | "sin_dato", { ...QUIEN_SALIDA, sin_dato: "Sin dato" });

  const bloque = (titulo: string, icono: string, grupos: ReturnType<typeof agrupar>) => (
    <section className={tarjeta}>
      <Cabecera titulo={titulo} icono={icono} />
      <div className="flex flex-col gap-2.5">
        {grupos.map((g) => (
          <div key={g.k} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-body-sm text-[13px] font-medium text-primary">{g.nombre}</span>
              <span className="font-code-num text-[13px] font-bold text-primary">{ars(g.costo)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
              <div className="h-full rounded-full bg-secondary" style={{ width: `${total ? (g.costo / total) * 100 : 0}%` }} />
            </div>
            <span className="font-caption-italic text-[11px] italic text-outline">
              {g.salidas} salida{g.salidas === 1 ? "" : "s"} · {g.piezas} pieza{g.piezas === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Piezas regaladas", String(piezas), `${salidas.length} salida${salidas.length === 1 ? "" : "s"}`, "volunteer_activism"],
            ["Costo de las piezas", ars(productos), "De la tanda de la que salieron", "inventory_2"],
            ["Envíos", ars(envios), sinEnvio ? `${sinEnvio} sin despachar todavía` : "Costo real al despachar", "local_shipping"],
            ["Total regalado", ars(total), "Piezas + envío", "redeem"],
          ] as const
        ).map(([titulo, valor, nota, ico]) => (
          <div key={titulo} className="flex flex-col justify-between rounded-2xl bg-surface-container-lowest p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className={rotulo}>{titulo}</span>
              <span className="ms text-[18px] text-secondary">{ico}</span>
            </div>
            <div className="mt-1 font-code-num text-headline-lg text-primary">{valor}</div>
            <div className="mt-0.5 font-caption-italic text-[13px] italic text-outline">{nota}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {bloque("Por motivo", "category", porMotivo)}
        {bloque("Por quién", "group", porQuien)}
        <section className={`${tarjeta} lg:row-span-2`}>
          <Cabecera titulo="Todas las salidas" icono="list" ayuda="Las canceladas no cuentan: sus piezas volvieron al stock." />
          <ul className="flex flex-col divide-y divide-primary/10">
            {salidas.map((s) => (
              <li key={s.pedido_id}>
                <Link href={`/admin/pedidos/${s.pedido_id}`} className="-mx-2 flex items-center justify-between gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-surface-container">
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-code-num text-[12px] text-outline">{numeroPedido(s.numero)}</span>
                      <span className="truncate font-body-sm text-[13px] font-medium text-primary">{s.destinatario}</span>
                    </span>
                    <span className="truncate font-caption-italic text-[11px] italic text-outline">
                      {etiquetaSalida(s.salida_motivo, s.salida_por)} · {fecha(s.created_at)} · {s.piezas} pieza{s.piezas === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-code-num text-[13px] font-bold text-primary">{ars(costo(s))}</span>
                    {!s.costo_envio && <span className="block font-label-sm text-[9px] uppercase tracking-wider text-outline">sin envío aún</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ───────── Plan contra real ─────────

/** Costo por unidad vendible: supuesto del plan contra la última tanda real, con la diferencia en % y color. */
export function PlanVsReal({ c, real, compacto = false }: { c: Calculo; real: ReturnType<typeof costoRealPorTipo>; compacto?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TIPOS.map((t) => {
          const plan = c[t].costoVendible;
          const r = real[t];
          const dif = r && plan ? (r.costo - plan) / plan : null;
          const color = dif === null ? "text-outline" : Math.abs(dif) < 0.02 ? "text-on-surface-variant" : dif > 0 ? "text-error" : "text-tertiary";
          return (
            <div key={t} className="flex flex-col gap-1.5 rounded-2xl bg-surface-container-lowest p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className={rotulo}>{PLURAL[t]}</span>
                {dif !== null && (
                  <span className={`flex items-center gap-0.5 font-code-num text-[12px] font-bold ${color}`}>
                    <span className="ms text-[14px]">{dif > 0.02 ? "trending_up" : dif < -0.02 ? "trending_down" : "trending_flat"}</span>
                    {signo(dif)}
                    {(dif * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Dato label="Plan" valor={ars(plan)} nota={compacto ? undefined : "Supuesto, con merma"} />
                <Dato
                  label="Real"
                  valor={r ? ars(r.costo) : "—"}
                  color={r ? color.replace("text-on-surface-variant", "text-primary") : "text-outline"}
                  nota={r ? `Última tanda · ${fechaTanda(r.fecha)}` : "Sin tandas cargadas"}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="flex items-start gap-1.5 font-caption-italic text-[12px] italic text-outline">
        <span className="ms mt-px text-[14px]">info</span>
        <span>
          El costo real se carga en{" "}
          <Link href="/admin/productos" className="underline decoration-primary/30 underline-offset-4 hover:text-primary">
            Productos → Nueva tanda
          </Link>
          ; los supuestos de acá son para simular. Rojo = la tanda salió más cara que el plan.
        </span>
      </p>
    </div>
  );
}

/** Ganancia real de todo lo vendido, menos lo que costaron las salidas sin cobro. */
export function GananciaReal({ ventas, salidas }: { ventas: Ventas; salidas: SalidaFila[] }) {
  const deVentas = ventas.neto - ventas.costoProductos - ventas.costoEnvio;
  const regalado = salidas.reduce((n, s) => n + s.costo_productos + s.costo_envio, 0);
  const neta = deVentas - regalado;
  const fila = (label: string, valor: number, nota?: string, fuerte = false) => (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${fuerte ? "border-t border-primary/15 pt-2" : ""}`}>
      <span className={`font-body-sm text-[13px] ${fuerte ? "font-bold text-primary" : "text-on-surface-variant"}`}>
        {label}
        {nota && <span className="block font-caption-italic text-[11px] italic text-outline">{nota}</span>}
      </span>
      <span className={`font-code-num text-[13px] ${fuerte ? "text-[16px] font-bold" : ""} ${valor < 0 ? "text-error" : fuerte ? "text-tertiary" : "text-primary"}`}>{ars(valor)}</span>
    </div>
  );
  return (
    <div className="flex flex-col">
      {fila("Cobrado neto", ventas.neto, `${ventas.pedidos} venta${ventas.pedidos === 1 ? "" : "s"}, sin comisiones`)}
      {fila("Costo de las piezas vendidas", -ventas.costoProductos, "Costo real de su tanda")}
      {fila("Envíos de las ventas", -ventas.costoEnvio, "Real si ya salió; si no, el estimado")}
      {fila("Ganancia de las ventas", deVentas)}
      {fila("Salidas sin cobro", -regalado, `${salidas.length} salida${salidas.length === 1 ? "" : "s"}: piezas + envío`)}
      {fila("Ganancia real acumulada", neta, undefined, true)}
    </div>
  );
}
