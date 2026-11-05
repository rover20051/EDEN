"use client";

import { useEffect, useRef, useState } from "react";
import { useIr } from "@/components/ir";
import { Modal, Tecla } from "@/components/modal";
import { usePaleta } from "@/components/paleta";

const IR_A: Record<string, string> = {
  h: "/admin",
  p: "/admin/pedidos",
  r: "/admin/productos",
  l: "/admin/plata",
  u: "/admin/numeros",
  c: "/admin/cupones",
  a: "/admin/ajustes",
};

const LISTA: { titulo: string; filas: { texto: string; teclas: string[] }[] }[] = [
  {
    titulo: "General",
    filas: [
      { texto: "Abrir el buscador", teclas: ["⌘K"] },
      { texto: "Abrir el buscador (alternativa)", teclas: ["/"] },
      { texto: "Nuevo pedido", teclas: ["n"] },
      { texto: "Ver esta lista", teclas: ["?"] },
    ],
  },
  {
    titulo: "Ir a… (apretá g y después)",
    filas: [
      { texto: "Hoy", teclas: ["g", "h"] },
      { texto: "Pedidos", teclas: ["g", "p"] },
      { texto: "Productos", teclas: ["g", "r"] },
      { texto: "Plata", teclas: ["g", "l"] },
      { texto: "Números", teclas: ["g", "u"] },
      { texto: "Cupones", teclas: ["g", "c"] },
      { texto: "Ajustes", teclas: ["g", "a"] },
    ],
  },
];

const esEditable = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
const hayModal = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');

/** Atajos globales del /admin + el modal con la lista ("?"). */
export function Atajos() {
  const ir = useIr();
  const { abrir, cerrar, abierta, alternar } = usePaleta();
  const [ayuda, setAyuda] = useState(false);
  const esperandoG = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const limpiarG = () => {
      if (esperandoG.current) clearTimeout(esperandoG.current);
      esperandoG.current = null;
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      // ⌘K / Ctrl+K funciona incluso escribiendo en un campo.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        if (abierta) {
          e.preventDefault();
          cerrar();
        } else if (!hayModal()) {
          e.preventDefault();
          alternar();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || esEditable(e.target) || hayModal()) return;

      if (esperandoG.current) {
        limpiarG();
        const destino = IR_A[e.key.toLowerCase()];
        if (destino) {
          e.preventDefault();
          ir(destino);
        }
        return;
      }
      switch (e.key) {
        case "g":
          esperandoG.current = setTimeout(limpiarG, 1500);
          break;
        case "n":
          e.preventDefault();
          ir("/admin/pedidos/nuevo");
          break;
        case "/":
          e.preventDefault();
          if (e.shiftKey) setAyuda(true);
          else abrir();
          break;
        case "?":
          e.preventDefault();
          setAyuda(true);
          break;
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      limpiarG();
    };
  }, [ir, abrir, cerrar, alternar, abierta]);

  if (!ayuda) return null;
  return (
    <Modal etiqueta="Atajos de teclado" onCerrar={() => setAyuda(false)} className="max-w-md p-space-lg">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-headline-md text-[20px] uppercase tracking-[0.08em] text-primary">Atajos de teclado</h2>
        <button
          type="button"
          data-autofocus
          aria-label="Cerrar"
          onClick={() => setAyuda(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <span className="ms text-[18px]">close</span>
        </button>
      </div>
      <p className="mt-0.5 font-caption-italic text-caption-italic italic text-on-surface-variant">Andan cuando no estás escribiendo en un campo.</p>
      <div className="mt-space-md flex flex-col gap-space-md">
        {LISTA.map((g) => (
          <section key={g.titulo}>
            <h3 className="mb-1 font-label-sm text-label-sm uppercase tracking-widest text-outline">{g.titulo}</h3>
            <ul className="divide-y divide-primary/10">
              {g.filas.map((f) => (
                <li key={f.texto} className="flex items-center justify-between py-1.5 font-body-md text-body-md text-on-surface">
                  <span>{f.texto}</span>
                  <span className="flex items-center gap-1">
                    {f.teclas.map((k, i) => (
                      <Tecla key={i}>{k}</Tecla>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
