"use client";

import { useEffect, useRef } from "react";

const FOCALIZABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana modal accesible: role=dialog + aria-modal, foco atrapado, Esc y click afuera cierran,
 * devuelve el foco a quien la abrió y bloquea el scroll del fondo.
 * El primer elemento con data-autofocus (o el primero focalizable) recibe el foco al abrir.
 */
export function Modal({
  onCerrar,
  etiqueta,
  alto = "centro",
  className = "",
  children,
}: {
  onCerrar: () => void;
  etiqueta: string;
  alto?: "centro" | "arriba";
  className?: string;
  children: React.ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  const apretadoAfuera = useRef(false);

  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const nodo = caja.current;
    if (nodo) {
      const inicial = nodo.querySelector<HTMLElement>("[data-autofocus]") ?? nodo.querySelector<HTMLElement>(FOCALIZABLES) ?? nodo;
      inicial.focus();
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, []);

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      cerrar.current();
      return;
    }
    if (e.key !== "Tab" || !caja.current) return;
    const lista = Array.from(caja.current.querySelectorAll<HTMLElement>(FOCALIZABLES)).filter((el) => el.offsetParent !== null);
    if (lista.length === 0) {
      e.preventDefault();
      return;
    }
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || activo === caja.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && activo === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[80] flex justify-center bg-on-surface/30 px-4 backdrop-blur-[2px] ${alto === "arriba" ? "items-start pt-[12vh]" : "items-center"}`}
      onMouseDown={(e) => {
        apretadoAfuera.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (apretadoAfuera.current && e.target === e.currentTarget) cerrar.current();
        apretadoAfuera.current = false;
      }}
    >
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        tabIndex={-1}
        onKeyDown={teclado}
        className={`w-full rounded-2xl border border-primary/15 bg-surface-container-lowest shadow-[0_24px_64px_-12px_rgba(55,47,42,0.35)] outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

/** Tecla dibujada (para atajos). */
export function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded-md border border-primary/20 bg-surface-container px-1.5 py-0.5 font-label-md text-[11px] leading-none text-on-surface-variant">
      {children}
    </kbd>
  );
}
