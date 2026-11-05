"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

const EVENTO = "eden:navegando";

/** Avisa a la barra de progreso que arrancó una navegación (para router.push hechos a mano). */
export function empezarProgreso() {
  window.dispatchEvent(new Event(EVENTO));
}

function Barra() {
  const path = usePathname();
  const params = useSearchParams().toString();
  const ruta = `${path}?${params}`;
  const rutaInicial = useRef(ruta);
  const [ancho, setAncho] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const salvavidas = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ocultar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const corriendo = useRef(false);
  const terminarRef = useRef<() => void>(() => {});

  // Arranca: por evento propio o por click en un link interno que cambia la ruta.
  useEffect(() => {
    const parar = () => {
      clearInterval(timer.current);
      clearTimeout(salvavidas.current);
    };
    let desde = 0;
    const terminar = () => {
      parar();
      corriendo.current = false;
      // Que se llegue a ver aunque la navegación sea instantánea (mínimo ~350 ms en pantalla).
      const espera = Math.max(0, 350 - (Date.now() - desde));
      ocultar.current = setTimeout(() => {
        setAncho(100);
        ocultar.current = setTimeout(() => {
          setVisible(false);
          setAncho(0);
        }, 250);
      }, espera);
    };
    const empezar = () => {
      if (corriendo.current) return;
      corriendo.current = true;
      desde = Date.now();
      clearTimeout(ocultar.current);
      setVisible(true);
      setAncho(12);
      timer.current = setInterval(() => setAncho((a) => a + (90 - a) * 0.12), 200);
      salvavidas.current = setTimeout(terminar, 8000);
    };
    const alClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      empezar();
    };
    window.addEventListener(EVENTO, empezar);
    document.addEventListener("click", alClick, true); // captura: corre antes de que el Link llame a preventDefault
    terminarRef.current = terminar;
    return () => {
      window.removeEventListener(EVENTO, empezar);
      document.removeEventListener("click", alClick, true);
      parar();
      clearTimeout(ocultar.current);
    };
  }, []);

  // Termina cuando la ruta cambió de verdad.
  useEffect(() => {
    if (rutaInicial.current === ruta) return;
    rutaInicial.current = ruta;
    if (corriendo.current) terminarRef.current();
  }, [ruta]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="h-full rounded-r-full bg-secondary shadow-[0_0_8px_var(--color-secondary)] transition-[width] duration-200 ease-out" style={{ width: `${ancho}%` }} />
    </div>
  );
}

/** Barra finita arriba del todo mientras se navega entre páginas del /admin. */
export function BarraProgreso() {
  return (
    <Suspense fallback={null}>
      <Barra />
    </Suspense>
  );
}
