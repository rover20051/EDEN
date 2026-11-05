"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { crearGasto } from "@/app/admin/actions";
import { Mensaje } from "@/components/accion";
import { hoyAR } from "@/lib/format";
import { CATEGORIAS, SOCIOS } from "@/lib/textos";

const etiqueta = "mb-0.5 block font-label-sm text-[10px] uppercase tracking-wider text-outline";
const campo = "w-full rounded-full bg-surface-container-lowest px-3 py-1.5 text-primary shadow-sm outline-none focus:ring-2 focus:ring-secondary/40";

/** "Cargar un gasto" del diseño: monto, fecha, concepto, categoría y quién lo pagó. */
export function FormGasto() {
  const [estado, enviar, pendiente] = useActionState(crearGasto, null);
  const [categoria, setCategoria] = useState<keyof typeof CATEGORIAS>("produccion");
  const [pagadoPor, setPagadoPor] = useState<keyof typeof SOCIOS>("nari_mich");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);

  const pildoras = <T extends string>(opciones: [T, string][], valor: T, set: (v: T) => void) => (
    <div className="flex flex-wrap gap-1">
      {opciones.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => set(k)}
          className={`rounded-full px-2.5 py-1 font-label-sm text-[10px] uppercase shadow-sm transition-all ${
            valor === k ? "bg-primary font-bold text-on-primary" : "bg-surface-container-lowest text-primary hover:bg-surface-container"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <form
      ref={form}
      // onSubmit en vez de action: así un error no borra lo que ya escribiste.
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label>
          <span className={etiqueta}>Monto ($ ARS)</span>
          <span className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-code-num text-[13px] text-outline">$</span>
            <input name="monto" inputMode="numeric" required placeholder="0" className={`${campo} pl-7 font-code-num text-[13px] placeholder:text-outline/60`} />
          </span>
        </label>
        <label>
          <span className={etiqueta}>Fecha</span>
          <input name="fecha" type="date" required defaultValue={hoyAR()} className={`${campo} font-code-num text-[12px]`} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr]">
        <label>
          <span className={etiqueta}>Concepto</span>
          <input
            name="descripcion"
            required
            placeholder="ej. Cuero para la tanda 2"
            className={`${campo} font-body-sm text-[13px] placeholder:font-caption-italic placeholder:italic placeholder:text-outline/60`}
          />
        </label>
        <label>
          <span className={etiqueta}>Proveedor</span>
          <input
            name="proveedor"
            placeholder="opcional"
            className={`${campo} font-body-sm text-[13px] placeholder:font-caption-italic placeholder:italic placeholder:text-outline/60`}
          />
        </label>
      </div>
      <div>
        <span className={`${etiqueta} mb-1`}>Categoría del gasto</span>
        {pildoras(Object.entries(CATEGORIAS) as [keyof typeof CATEGORIAS, string][], categoria, setCategoria)}
      </div>
      <div>
        <span className={`${etiqueta} mb-1`}>¿Quién lo pagó?</span>
        {pildoras(
          [
            ["nari_mich", "Nari y Mich (mitad c/u)"],
            ["nari", "Nari"],
            ["mich", "Mich"],
            ["fede", "Fede"],
            ["eden", "Caja de Edén"],
          ] as [keyof typeof SOCIOS, string][],
          pagadoPor,
          setPagadoPor,
        )}
      </div>
      <input type="hidden" name="categoria" value={categoria} />
      <input type="hidden" name="pagado_por" value={pagadoPor} />
      <button
        disabled={pendiente}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-full bg-primary py-2.5 font-label-sm text-[11px] font-bold uppercase tracking-widest text-on-primary shadow-sm transition-all hover:bg-primary-container hover:shadow disabled:opacity-50"
      >
        <span className="ms text-[15px]">draw</span>
        <span>{pendiente ? "Cargando…" : "Cargar gasto"}</span>
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}
