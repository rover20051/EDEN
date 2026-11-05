"use client";

import { useEffect, useState, useTransition } from "react";
import type { Resultado } from "@/app/admin/actions";
import { useConfirmar } from "@/components/confirmar";
import { claseBoton, type Variante } from "@/components/estilos";
import { useToast } from "@/components/toasts";

/** Botón de un toque que ejecuta una acción del servidor. Muestra el error al lado si falla. */
export function Accion({
  accion,
  children,
  variante = "primaria",
  confirmar,
  className = "",
}: {
  accion: () => Promise<Resultado>;
  children: React.ReactNode;
  variante?: Variante;
  confirmar?: string;
  className?: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const pedirConfirmacion = useConfirmar();

  return (
    <span className={`inline-flex flex-col gap-1 ${className.includes("w-full") || className.includes("flex-1") ? "w-full" : ""}`}>
      <button
        type="button"
        disabled={pendiente}
        className={`${claseBoton(variante)} ${className}`}
        onClick={async () => {
          if (confirmar && !(await pedirConfirmacion({ mensaje: confirmar }))) return;
          setError(null);
          iniciar(async () => {
            const r = await accion();
            if (r.ok) {
              toast.ok(r.mensaje);
            } else {
              setError(r.error);
              toast.error(r.error);
            }
          });
        }}
      >
        {pendiente ? "…" : children}
      </button>
      {error && <span className="font-caption-italic text-[12px] italic text-error">{error}</span>}
    </span>
  );
}

/** Mensaje de resultado para formularios con useActionState. */
export function Mensaje({ estado }: { estado: Resultado | null }) {
  const toast = useToast();
  useEffect(() => {
    if (!estado) return;
    if (estado.ok) toast.ok(estado.mensaje);
    else toast.error(estado.error);
  }, [estado, toast]);
  if (!estado) return null;
  if (!estado.ok) return <p className="text-sm italic text-error">{estado.error}</p>;
  return estado.mensaje ? <p className="text-sm italic text-musgo">{estado.mensaje}</p> : null;
}
