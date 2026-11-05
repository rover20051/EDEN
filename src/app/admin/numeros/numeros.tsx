"use client";

import { useMemo, useState, useTransition } from "react";
import { guardarPlan } from "@/app/admin/actions";
import { calcular, type Plan, type Reales } from "@/lib/plan";
import { Costos, Escenarios, Pasarelas, Precios, Resumen, Supuestos } from "./secciones";
import { Salidas, Tandas, costoRealPorTipo, type SalidaFila, type TandaFila, type Ventas } from "./tandas";

const PESTANAS = [
  { id: "resumen", label: "Resumen", icono: "dashboard" },
  { id: "tandas", label: "Tandas", icono: "layers" },
  { id: "salidas", label: "Salidas", icono: "volunteer_activism" },
  { id: "supuestos", label: "Supuestos", icono: "tune" },
  { id: "costos", label: "Costo por unidad", icono: "calculate" },
  { id: "precios", label: "Precio y margen", icono: "sell" },
  { id: "escenarios", label: "Escenarios", icono: "grid_view" },
  { id: "pasarelas", label: "Pasarelas", icono: "credit_card" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

export type Props = {
  planGuardado: Plan;
  reales: Reales;
  gastado: Record<string, number>;
  vendidas: Record<"biblia" | "journal", number>;
  recuperado: number;
  /** Ventas cobradas (v_ganancia_pedido): neto, costo real de las piezas y envíos. */
  ventas: Ventas;
  tandas: TandaFila[];
  salidas: SalidaFila[];
  /** Precio actual de cada producto (para proyectar lo que queda de cada tanda). */
  precios: Record<string, number>;
  pestanaInicial?: string;
};

/** "Números": lo que era la planilla Finanzas_FEDE. Los cambios se ven al instante; "Guardar" los deja fijos. */
export function Numeros(props: Props) {
  const [plan, setPlan] = useState(props.planGuardado);
  const [pestana, setPestana] = useState<Pestana>((PESTANAS.find((p) => p.id === props.pestanaInicial)?.id ?? "resumen") as Pestana);
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const c = useMemo(() => calcular(plan, props.reales), [plan, props.reales]);
  const cambiado = JSON.stringify(plan) !== JSON.stringify(props.planGuardado);
  const real = useMemo(() => costoRealPorTipo(props.tandas), [props.tandas]);

  const ir = (p: Pestana) => {
    setPestana(p);
    history.replaceState(null, "", `?tab=${p}`);
  };
  const guardar = () =>
    iniciar(async () => {
      const r = await guardarPlan(plan);
      setEstado(r.ok ? { ok: true, texto: r.mensaje ?? "Guardado" } : { ok: false, texto: r.error });
    });

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-outline">Lo que era el Excel de finanzas</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl font-normal uppercase tracking-[0.12em] text-primary">Números</h1>
          <p className="font-caption-italic text-caption-italic italic text-on-surface-variant">
            Costos, precios y punto de equilibrio. Probá valores: todo se recalcula al instante.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {estado && !cambiado && <span className={`font-caption-italic text-[13px] italic ${estado.ok ? "text-tertiary" : "text-error"}`}>{estado.texto}</span>}
          {cambiado && (
            <>
              <span className="flex items-center gap-1 rounded-full bg-secondary-fixed/50 px-2.5 py-1 font-label-sm text-label-sm uppercase text-secondary">
                <span className="ms text-[14px]">edit</span>Sin guardar
              </span>
              <button
                onClick={() => setPlan(props.planGuardado)}
                className="rounded-full bg-surface-container-high px-4 py-1.5 font-label-md text-label-md uppercase tracking-widest text-on-surface transition-all hover:bg-surface-dim"
              >
                Descartar
              </button>
            </>
          )}
          <button
            onClick={guardar}
            disabled={!cambiado || guardando}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 font-label-md text-label-md uppercase tracking-widest text-surface-container-lowest shadow-md transition-all hover:bg-on-surface-variant disabled:opacity-40"
          >
            <span className="ms text-[16px]">save</span>
            <span>{guardando ? "Guardando…" : "Guardar supuestos"}</span>
          </button>
        </div>
      </div>

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" aria-label="Secciones de Números">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => ir(p.id)}
            aria-current={pestana === p.id ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 font-label-md text-label-md uppercase tracking-wider transition-all ${
              pestana === p.id ? "bg-surface-dim text-on-surface shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <span className="ms text-[15px]">{p.icono}</span>
            {p.label}
          </button>
        ))}
      </nav>

      {pestana === "resumen" && (
        <Resumen
          c={c}
          plan={plan}
          gastado={props.gastado}
          vendidas={props.vendidas}
          recuperado={props.recuperado}
          real={real}
          ventas={props.ventas}
          salidas={props.salidas}
          ir={ir}
        />
      )}
      {pestana === "tandas" && <Tandas tandas={props.tandas} c={c} precios={props.precios} plan={plan} />}
      {pestana === "salidas" && <Salidas salidas={props.salidas} />}
      {pestana === "supuestos" && <Supuestos plan={plan} setPlan={setPlan} c={c} />}
      {pestana === "costos" && <Costos plan={plan} setPlan={setPlan} c={c} real={real} />}
      {pestana === "precios" && <Precios plan={plan} setPlan={setPlan} c={c} />}
      {pestana === "escenarios" && <Escenarios plan={plan} setPlan={setPlan} c={c} />}
      {pestana === "pasarelas" && <Pasarelas plan={plan} setPlan={setPlan} c={c} />}
    </div>
  );
}
