"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect } from "react";
import { Mensaje } from "@/components/accion";
import { guardarCarta } from "./acciones";

const etiqueta = "mb-0.5 block font-label-sm text-[10px] uppercase tracking-wider text-outline";
const campo = "w-full rounded-2xl bg-surface-container-lowest px-3 py-2 font-body-sm text-[14px] text-primary shadow-sm outline-none placeholder:italic placeholder:text-outline/70 focus:ring-2 focus:ring-secondary/40";

export function FormCarta({ carta }: { carta: { id: string; asunto: string; titulo: string; cuerpo: string } | null }) {
  const [estado, enviar, pendiente] = useActionState(guardarCarta, null);
  const router = useRouter();
  const creada = estado?.ok ? estado.id : undefined;

  // Una carta nueva recién guardada pasa a ser la abierta, con sus botones de prueba y envío.
  useEffect(() => {
    if (creada && creada !== carta?.id) router.replace(`/admin/cartas?carta=${creada}`);
  }, [creada, carta?.id, router]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="id" value={carta?.id ?? ""} />
      <label>
        <span className={etiqueta}>Asunto (lo que se ve en la bandeja)</span>
        <input name="asunto" required maxLength={120} defaultValue={carta?.asunto} placeholder="Carta de diciembre: volver a casa" className={campo} data-autofocus />
      </label>
      <label>
        <span className={etiqueta}>Título</span>
        <input name="titulo" required maxLength={120} defaultValue={carta?.titulo} placeholder="Volver a casa" className={campo} />
      </label>
      <label>
        <span className={etiqueta}>Carta (dejá una línea en blanco entre párrafos)</span>
        <textarea name="cuerpo" required rows={14} maxLength={20000} defaultValue={carta?.cuerpo} placeholder="Escribí acá la carta. Los links que pegues quedan clickeables." className={`${campo} resize-y leading-relaxed`} />
      </label>
      <button disabled={pendiente} className="rounded-full bg-primary py-2.5 font-label-sm text-[11px] font-bold uppercase tracking-widest text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50">
        {pendiente ? "Guardando…" : "Guardar borrador y ver cómo queda"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}
