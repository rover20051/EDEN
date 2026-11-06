"use client";

import { startTransition, useActionState } from "react";
import { Mensaje } from "@/components/accion";
import { guardarTextos } from "./acciones";

const etiqueta = "mb-0.5 block font-label-sm text-[10px] uppercase tracking-wider text-outline";
const campo = "w-full rounded-2xl bg-surface-container-lowest px-3 py-2 font-body-sm text-[14px] text-primary shadow-sm outline-none placeholder:italic placeholder:text-outline/70 focus:ring-2 focus:ring-secondary/40";

type Valores = { asunto: string; titulo: string; bajada: string; nota: string };

/** Campo vacío = texto original, que se ve como ejemplo adentro del campo. */
export function FormTextos({ tipo, valores, originales }: { tipo: string; valores: Valores; originales: { asunto: string; titulo: string; bajada: string } }) {
  const [estado, enviar, pendiente] = useActionState(guardarTextos.bind(null, tipo), null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="flex flex-col gap-3"
    >
      <label>
        <span className={etiqueta}>Asunto</span>
        <input name="asunto" maxLength={120} defaultValue={valores.asunto} placeholder={originales.asunto} className={campo} />
      </label>
      <label>
        <span className={etiqueta}>Título</span>
        <input name="titulo" maxLength={120} defaultValue={valores.titulo} placeholder={originales.titulo} className={campo} />
      </label>
      <label>
        <span className={etiqueta}>Bajada</span>
        <textarea name="bajada" rows={2} maxLength={300} defaultValue={valores.bajada} placeholder={originales.bajada} className={`${campo} resize-y`} />
      </label>
      <label>
        <span className={etiqueta}>Mensaje extra (opcional, va arriba del contenido)</span>
        <textarea name="nota" rows={3} maxLength={800} defaultValue={valores.nota} placeholder="Por ejemplo, un aviso por las fiestas." className={`${campo} resize-y`} />
      </label>
      <button disabled={pendiente} className="rounded-full bg-primary py-2.5 font-label-sm text-[11px] font-bold uppercase tracking-widest text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50">
        {pendiente ? "Guardando…" : "Guardar y ver cómo queda"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}
