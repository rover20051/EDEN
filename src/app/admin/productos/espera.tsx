"use client";

import { claseBoton } from "@/components/estilos";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { fecha } from "@/lib/format";
import { ayuda } from "./estilo";

export type Espera = { email: string; nombre: string | null; created_at: string; avisado_at: string | null };

/** Quiénes pidieron "Avisame cuando vuelva" para un producto. */
export function ListaEspera({ producto, lista, onCerrar }: { producto: string; lista: Espera[]; onCerrar: () => void }) {
  const toast = useToast();
  const pendientes = lista.filter((e) => !e.avisado_at);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pendientes.map((e) => e.email).join(", "));
      toast.ok("Mails copiados");
    } catch {
      toast.error("No se pudieron copiar");
    }
  }

  return (
    <Modal etiqueta={`Lista de espera de ${producto}`} onCerrar={onCerrar} alto="arriba" className="flex max-h-[80vh] max-w-lg flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-surface-variant/60 px-5 py-3">
        <div className="flex flex-col">
          <h2 className="font-headline-md text-[20px] uppercase tracking-[0.08em] text-primary">Esperan {producto}</h2>
          <p className={ayuda}>
            {pendientes.length} {pendientes.length === 1 ? "persona espera" : "personas esperan"}
            {lista.length > pendientes.length && ` · ${lista.length - pendientes.length} ya avisadas`}
          </p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1 text-outline hover:bg-surface-container-high hover:text-primary">
          <span className="ms text-[20px]">close</span>
        </button>
      </div>

      <div className="flex items-start gap-2 bg-surface-container-low px-5 py-2.5">
        <span className="ms mt-0.5 text-[18px] text-secondary">mark_email_unread</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Cuando cargues una tanda de este producto les avisamos por mail a todos los que esperan (una sola vez a cada uno). Se anotan desde la web con el botón “Avisame cuando vuelva”.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
        {lista.length === 0 ? (
          <p className="py-6 text-center font-caption-italic text-caption-italic text-outline">Todavía nadie se anotó.</p>
        ) : (
          <ul className="divide-y divide-surface-variant/40">
            {lista.map((e) => (
              <li key={e.email} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-body-md text-body-md text-on-surface">{e.email}</span>
                  <span className={ayuda}>
                    {e.nombre ? `${e.nombre} · ` : ""}se anotó el {fecha(e.created_at)}
                  </span>
                </div>
                {e.avisado_at ? (
                  <span className="shrink-0 rounded-full bg-tertiary-fixed px-2 py-0.5 font-label-sm text-label-sm uppercase text-tertiary" title={`Avisado el ${fecha(e.avisado_at)}`}>
                    Avisado {fecha(e.avisado_at)}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-secondary-container px-2 py-0.5 font-label-sm text-label-sm uppercase text-on-secondary-container">Esperando</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="flex justify-end border-t border-surface-variant/60 px-5 py-2.5">
          <button type="button" onClick={copiar} className={`${claseBoton("secundaria")} px-4 py-2`}>
            <span className="ms text-[16px]">content_copy</span>
            Copiar mails
          </button>
        </div>
      )}
    </Modal>
  );
}
