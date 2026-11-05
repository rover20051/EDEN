"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { claseBoton } from "@/components/estilos";
import { Modal } from "@/components/modal";

type Opciones = { mensaje: string; titulo?: string; confirmar?: string; cancelar?: string };
type Pedido = Opciones & { resolver: (si: boolean) => void };

const Contexto = createContext<((o: Opciones) => Promise<boolean>) | null>(null);

/** Diálogo de confirmación del back office (reemplaza a window.confirm). */
export function ConfirmarProvider({ children }: { children: React.ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const actual = useRef<Pedido | null>(null);

  const pedir = useCallback(
    (o: Opciones) =>
      new Promise<boolean>((resolver) => {
        const p = { ...o, resolver };
        actual.current = p;
        setPedido(p);
      }),
    [],
  );

  function cerrar(si: boolean) {
    actual.current?.resolver(si);
    actual.current = null;
    setPedido(null);
  }

  return (
    <Contexto.Provider value={pedir}>
      {children}
      {pedido && (
        <Modal etiqueta={pedido.titulo ?? "Confirmar"} onCerrar={() => cerrar(false)} className="max-w-md p-space-lg">
          <div className="flex items-start gap-3">
            <span className="ms mt-0.5 text-[22px] text-secondary">help</span>
            <div className="flex-1">
              <h2 className="font-headline-md text-[20px] uppercase tracking-[0.08em] text-primary">{pedido.titulo ?? "¿Confirmás?"}</h2>
              <p className="mt-1.5 font-body-md text-body-md text-on-surface-variant">{pedido.mensaje}</p>
            </div>
          </div>
          <div className="mt-space-lg flex justify-end gap-space-sm">
            <button type="button" onClick={() => cerrar(false)} className={`${claseBoton("secundaria")} px-4 py-2`}>
              {pedido.cancelar ?? "Cancelar"}
            </button>
            <button type="button" data-autofocus onClick={() => cerrar(true)} className={`${claseBoton("primaria")} px-4 py-2`}>
              {pedido.confirmar ?? "Confirmar"}
            </button>
          </div>
        </Modal>
      )}
    </Contexto.Provider>
  );
}

/** Devuelve una función que muestra el diálogo y resuelve true/false. Sin provider cae a window.confirm. */
export function useConfirmar() {
  const pedir = useContext(Contexto);
  return pedir ?? (async (o: Opciones) => window.confirm(o.mensaje));
}
