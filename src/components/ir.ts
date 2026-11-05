"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { empezarProgreso } from "@/components/progreso";

/** Lleva hasta el bloque "Cargar un gasto" de /admin/plata (la página no tiene ancla propia). */
function irAGasto() {
  let intentos = 0;
  const buscar = () => {
    let el: HTMLElement | null = document.getElementById("gasto");
    if (!el) {
      const titulo = Array.from(document.querySelectorAll("main section h2, main section h3")).find((h) => h.textContent?.includes("Cargar un gasto"));
      el = (titulo?.closest("section") as HTMLElement | null) ?? null;
      if (el) el.id = "gasto";
    }
    if (el) {
      el.style.scrollMarginTop = "5rem";
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
      return;
    }
    if (++intentos < 30) setTimeout(buscar, 100);
  };
  buscar();
}

/** Navegación del /admin: muestra la barra de progreso y resuelve el ancla #gasto. */
export function useIr() {
  const router = useRouter();
  const path = usePathname();
  return useCallback(
    (href: string) => {
      const [ruta, hash] = href.split("#");
      const actual = window.location.pathname + window.location.search;
      if (ruta !== actual) empezarProgreso();
      router.push(href);
      if (hash === "gasto") setTimeout(irAGasto, ruta === path ? 0 : 150);
    },
    [router, path],
  );
}

/** Si se entra directo a /admin/plata#gasto, también lleva al bloque. */
export function useAnclaGasto() {
  useEffect(() => {
    if (window.location.hash === "#gasto") irAGasto();
  }, []);
}
