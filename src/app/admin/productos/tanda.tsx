"use client";

import { startTransition, useActionState, useRef, useEffect } from "react";
import { crearLote } from "@/app/admin/actions";
import { Mensaje } from "@/components/accion";
import { hoyAR } from "@/lib/format";

const campoTanda = "h-9 rounded-full bg-surface-container-low px-3 focus:outline-none focus:ring-1 focus:ring-secondary";
const etiqueta = "font-label-sm text-label-sm uppercase text-outline";

/** "Cargar nueva tanda" del diseño: suma stock al producto. */
export function FormTanda({ productos, inicial }: { productos: { id: string; nombre: string }[]; inicial?: string }) {
  const [estado, enviar, pendiente] = useActionState(crearLote, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest p-3 shadow-sm"
    >
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span className="ms text-[20px] text-secondary">precision_manufacturing</span>
          <span className="font-headline-md text-headline-md text-primary">Cargar nueva tanda</span>
        </div>
        <span className="font-caption-italic text-caption-italic text-outline">Suma stock apenas la cargás</span>
      </div>
      <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-2 lg:grid-cols-7">
        <label className="flex flex-col gap-0.5 lg:col-span-2">
          <span className={etiqueta}>Producto</span>
          <select name="producto_id" required defaultValue={productos.some((p) => p.id === inicial) ? inicial : ""} className={`${campoTanda} font-body-sm text-body-sm text-on-surface`}>
            <option value="" disabled>
              Elegí el producto
            </option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={etiqueta}>Fecha</span>
          <input name="fecha" type="date" required defaultValue={hoyAR()} className={`${campoTanda} font-label-md text-label-md text-on-surface-variant`} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={etiqueta}>U. fabricadas</span>
          <input name="unidades" inputMode="numeric" required placeholder="25" className={`${campoTanda} font-code-num text-code-num text-primary`} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={etiqueta}>U. falladas</span>
          <input name="merma" inputMode="numeric" placeholder="0" className={`${campoTanda} font-code-num text-code-num text-error`} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={etiqueta}>Costo c/u</span>
          <input name="costo_unitario" inputMode="numeric" required placeholder="$28.500" className={`${campoTanda} font-code-num text-code-num text-primary`} />
        </label>
        <button
          disabled={pendiente}
          className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-4 font-label-md text-label-md uppercase tracking-wider text-surface-container-lowest shadow-sm transition-all hover:bg-on-surface-variant disabled:opacity-50"
        >
          <span className="ms text-[16px]">add_box</span>
          <span>{pendiente ? "…" : "Cargar tanda"}</span>
        </button>
      </div>
      <Mensaje estado={estado} />
    </form>
  );
}
