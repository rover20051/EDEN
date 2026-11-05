"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Tipo = "ok" | "error";
type Toast = { id: number; tipo: Tipo; texto: string };
type Api = { ok: (texto?: string) => void; error: (texto: string) => void };

const DURACION_MS = 3500;
const Contexto = createContext<Api | null>(null);

/** Avisos chicos abajo a la derecha (éxito / error). Se van solos a los ~3,5 s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const contador = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const quitar = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setLista((l) => l.filter((x) => x.id !== id));
  }, []);

  const agregar = useCallback(
    (tipo: Tipo, texto: string) => {
      const id = ++contador.current;
      setLista((l) => [...l.slice(-3), { id, tipo, texto }]);
      timers.current.set(id, setTimeout(() => quitar(id), tipo === "error" ? DURACION_MS + 1500 : DURACION_MS));
    },
    [quitar],
  );

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const api = useMemo<Api>(() => ({ ok: (texto) => agregar("ok", texto || "Listo"), error: (texto) => agregar("error", texto) }), [agregar]);

  return (
    <Contexto.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-[90] flex flex-col items-end gap-2 md:inset-x-auto md:bottom-6 md:right-6"
      >
        {lista.map((t) => (
          <div
            key={t.id}
            role={t.tipo === "error" ? "alert" : "status"}
            className="toast-entra pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border border-primary/15 bg-surface-container-lowest py-2.5 pl-3 pr-2 shadow-[0_12px_32px_-8px_rgba(55,47,42,0.3)] md:w-auto md:min-w-[240px]"
          >
            <span className={`ms mt-px text-[18px] ${t.tipo === "ok" ? "text-tertiary" : "text-error"}`}>{t.tipo === "ok" ? "check_circle" : "error"}</span>
            <p className="flex-1 font-body-md text-[14px] leading-snug text-on-surface">{t.texto}</p>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => quitar(t.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <span className="ms text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

const sinProvider: Api = { ok: () => {}, error: () => {} };

export function useToast(): Api {
  return useContext(Contexto) ?? sinProvider;
}
