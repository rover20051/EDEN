"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/toasts";
import { ars } from "@/lib/format";
import { PROVINCIAS } from "@/lib/provincias";
import { guardarEnvios } from "./acciones";

const rotulo = "font-label-sm text-label-sm uppercase tracking-wider text-outline";
const aTexto = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("es-AR"));
const aNumero = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d === "" ? null : Number(d);
};
/** Al salir del campo: "9500" → "9.500". */
const prolijo = (s: string) => aTexto(aNumero(s));
const CORTO: Record<string, string> = { "Ciudad Autónoma de Buenos Aires": "CABA" };

/** Precio de envío para cada una de las 24 jurisdicciones + envío gratis desde cierto monto. */
export function FormEnvios({ tarifas, gratisDesde, deshabilitado }: { tarifas: Record<string, number>; gratisDesde: number | null; deshabilitado: boolean }) {
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(PROVINCIAS.map((p) => [p, aTexto(tarifas[p])])));
  const [gratis, setGratis] = useState(aTexto(gratisDesde));
  const [todas, setTodas] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const conPrecio = PROVINCIAS.filter((p) => aNumero(valores[p]) != null).length;

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await guardarEnvios({
        tarifas: Object.fromEntries(PROVINCIAS.map((p) => [p, aNumero(valores[p])])),
        gratis_desde: aNumero(gratis),
      });
      if (r.ok) toast.ok(r.mensaje);
      else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  };

  const aplicarATodas = () => {
    const n = aNumero(todas);
    setValores(Object.fromEntries(PROVINCIAS.map((p) => [p, aTexto(n)])));
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-container p-3">
          <span className={rotulo}>Aplicar este precio a todas</span>
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-surface-container-lowest px-3 py-1.5 shadow-sm focus-within:ring-1 focus-within:ring-secondary">
              <span className="font-code-num text-code-num text-outline">$</span>
              <input
                value={todas}
                onChange={(e) => setTodas(e.target.value)}
                onBlur={() => setTodas(prolijo)}
                inputMode="numeric"
                placeholder="9.500"
                aria-label="Precio para todas las provincias"
                className="w-full min-w-0 bg-transparent font-code-num text-code-num text-primary placeholder:text-outline focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={aplicarATodas}
              className="whitespace-nowrap rounded-full bg-surface-container-high px-3 py-1.5 font-label-md text-label-sm uppercase text-primary transition-colors hover:bg-surface-variant"
            >
              Aplicar
            </button>
          </div>
          <span className="font-caption-italic text-[12px] italic text-outline">Vacío y “Aplicar” deja todas en “a coordinar”.</span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-container p-3">
          <span className={rotulo}>Envío gratis desde</span>
          <label className="flex items-center gap-1 rounded-full bg-surface-container-lowest px-3 py-1.5 shadow-sm focus-within:ring-1 focus-within:ring-secondary">
            <span className="font-code-num text-code-num text-outline">$</span>
            <input
              value={gratis}
              onChange={(e) => setGratis(e.target.value)}
              onBlur={() => setGratis(prolijo)}
              inputMode="numeric"
              placeholder="Sin envío gratis"
              aria-label="Envío gratis desde"
              className="w-full min-w-0 bg-transparent font-code-num text-code-num text-primary placeholder:font-body-sm placeholder:italic placeholder:text-outline focus:outline-none"
            />
          </label>
          <span className="font-caption-italic text-[12px] italic text-outline">
            {aNumero(gratis) ? `Compras desde ${ars(aNumero(gratis))} (después de descuentos) no pagan envío.` : "Vacío = nunca es gratis."}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className={rotulo}>Precio por provincia</span>
        <span className="font-label-sm text-label-sm text-outline">
          {conPrecio} de {PROVINCIAS.length} con precio
        </span>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {PROVINCIAS.map((p) => {
          const n = aNumero(valores[p]);
          return (
            <label key={p} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-container-lowest py-1.5 pl-3 pr-1.5 shadow-sm">
              <span className="min-w-0 truncate font-body-md text-body-sm text-on-surface" title={p}>
                {CORTO[p] ?? p}
              </span>
              <span className="flex w-[132px] shrink-0 items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 focus-within:ring-1 focus-within:ring-secondary">
                <span className="font-code-num text-[13px] text-outline">$</span>
                <input
                  value={valores[p]}
                  onChange={(e) => setValores((v) => ({ ...v, [p]: e.target.value }))}
                  onBlur={() => setValores((v) => ({ ...v, [p]: prolijo(v[p]) }))}
                  inputMode="numeric"
                  placeholder="a coordinar"
                  aria-label={`Envío a ${p}`}
                  className="w-full min-w-0 bg-transparent text-right font-code-num text-[13px] text-primary placeholder:font-body-sm placeholder:italic placeholder:text-outline focus:outline-none"
                />
                {n === 0 && <span className="font-label-sm text-[10px] uppercase text-tertiary">gratis</span>}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-col items-stretch gap-2 border-t border-primary/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-caption-italic text-[12px] italic text-outline">Vacío = “a coordinar” (se arregla por WhatsApp). 0 = sin cargo.</p>
        <div className="flex items-center justify-end gap-3">
          {error && <span className="font-caption-italic text-[12px] italic text-error">{error}</span>}
          <button
            disabled={pendiente || deshabilitado}
            className="flex items-center gap-space-xs rounded-full bg-primary px-4 py-2 font-label-md text-label-md uppercase tracking-wider text-surface shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
          >
            <span className="ms text-[16px]">save</span>
            <span>{pendiente ? "Guardando…" : "Guardar envíos"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
