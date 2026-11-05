// Clases compartidas entre componentes de servidor y de cliente (sin "use client").

export type Variante = "primaria" | "secundaria" | "peligro" | "exito";

const estilos: Record<Variante, string> = {
  primaria: "bg-primary-container text-surface-container-lowest shadow-sm hover:bg-primary",
  secundaria: "bg-surface-container-high text-primary hover:bg-surface-variant",
  peligro: "bg-error-container text-error hover:bg-error-container/70",
  exito: "bg-tertiary text-surface-container-lowest shadow-md hover:bg-tertiary-container",
};

/** Botón píldora del diseño de Stitch (texto en máquina de escribir, mayúsculas). */
export const claseBoton = (v: Variante = "primaria") =>
  `inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-label-md text-label-sm uppercase transition-all active:scale-95 disabled:opacity-50 ${estilos[v]}`;
