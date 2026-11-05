"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Mensaje } from "@/components/accion";
import { hoyAR } from "@/lib/format";
import { crearCupon } from "./acciones";

const etiqueta = "mb-0.5 block font-label-sm text-[10px] uppercase tracking-wider text-outline";
const campo = "w-full rounded-full bg-surface-container-lowest px-3 py-1.5 text-primary shadow-sm outline-none focus:ring-2 focus:ring-secondary/40";

/** Alta de cupón: código, % o monto fijo, compra mínima, usos máximos, vencimiento y nota. */
export function FormCupon() {
  const [estado, enviar, pendiente] = useActionState(crearCupon, null);
  const [tipo, setTipo] = useState<"porcentaje" | "monto">("porcentaje");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);

  return (
    <form
      ref={form}
      id="nuevo"
      // onSubmit en vez de action: así un error no borra lo que ya escribiste.
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="flex flex-col gap-2.5"
    >
      <label>
        <span className={etiqueta}>Código</span>
        <span className="relative block">
          <span className="ms pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-outline">confirmation_number</span>
          <input
            name="codigo"
            required
            minLength={3}
            maxLength={30}
            onInput={(e) => {
              const el = e.currentTarget;
              el.value = el.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
            }}
            autoComplete="off"
            placeholder="BIENVENIDA10"
            className={`${campo} pl-9 font-code-num text-[13px] uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal placeholder:text-outline/60`}
          />
        </span>
        <span className="mt-0.5 block pl-3 font-caption-italic text-[11px] italic text-outline">Letras, números, - o _. El cliente lo escribe así en la web.</span>
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <span className={etiqueta}>Tipo de descuento</span>
          <div role="radiogroup" aria-label="Tipo de descuento" className="grid grid-cols-2 rounded-full bg-surface-container-high p-0.5">
            {(
              [
                ["porcentaje", "Porcentaje"],
                ["monto", "Monto fijo"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={tipo === k}
                onClick={() => setTipo(k)}
                className={`rounded-full px-2 py-1 font-label-sm text-[11px] uppercase transition-all ${tipo === k ? "bg-primary font-bold text-on-primary shadow-sm" : "text-outline hover:text-primary"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" name="tipo" value={tipo} />
        </div>
        <label>
          <span className={etiqueta}>{tipo === "porcentaje" ? "Descuento (%)" : "Descuento ($)"}</span>
          <span className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-code-num text-[13px] text-outline">{tipo === "porcentaje" ? "%" : "$"}</span>
            <input name="valor" required inputMode="numeric" placeholder={tipo === "porcentaje" ? "10" : "5.000"} className={`${campo} pl-7 font-code-num text-[13px] placeholder:text-outline/60`} />
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label>
          <span className={etiqueta}>Compra mínima</span>
          <span className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-code-num text-[13px] text-outline">$</span>
            <input name="minimo" inputMode="numeric" placeholder="Sin mínimo" className={`${campo} pl-7 font-code-num text-[13px] placeholder:font-caption-italic placeholder:italic placeholder:text-outline/60`} />
          </span>
        </label>
        <label>
          <span className={etiqueta}>Usos máximos</span>
          <input name="usos_max" inputMode="numeric" placeholder="Sin límite" className={`${campo} font-code-num text-[13px] placeholder:font-caption-italic placeholder:italic placeholder:text-outline/60`} />
        </label>
        <label>
          <span className={etiqueta}>Vence</span>
          <input name="vence" type="date" min={hoyAR()} className={`${campo} font-code-num text-[12px]`} />
        </label>
      </div>

      <label>
        <span className={etiqueta}>Nota (interna)</span>
        <input name="nota" maxLength={200} placeholder="Ej. para la feria de diciembre, para la cuenta de @…" className={`${campo} font-caption-italic text-[13px] placeholder:italic placeholder:text-outline/60`} />
      </label>

      <p className="font-caption-italic text-[11px] italic text-outline">Se aplica después del Set y los packs. El vencimiento incluye ese día.</p>

      <button
        disabled={pendiente}
        className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2 font-label-sm text-xs uppercase tracking-[0.1em] text-on-primary shadow-md transition-all hover:bg-primary-container active:scale-[0.99] disabled:opacity-50"
      >
        <span className="ms text-[16px]">add</span>
        <span>{pendiente ? "Creando…" : "Crear cupón"}</span>
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}
