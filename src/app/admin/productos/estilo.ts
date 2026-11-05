// Clases de los formularios de Productos (mismo estilo que "Cargar nueva tanda").

export const campo =
  "h-9 w-full min-w-0 rounded-full bg-surface-container-low px-3 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary";
export const campoNum = campo.replace("font-body-sm text-body-sm text-on-surface", "font-code-num text-code-num text-primary");
export const area =
  "min-h-16 w-full min-w-0 rounded-2xl bg-surface-container-low px-3 py-2 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary";
export const rotulo = "font-label-sm text-label-sm uppercase text-outline";
export const ayuda = "font-caption-italic text-caption-italic text-outline";

export const miles = (n: number) => n.toLocaleString("es-AR");
/** "75.000" → 75000 (0 si está vacío). */
export const numero = (v: string) => Number(v.replace(/\D/g, "")) || 0;
