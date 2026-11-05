// Piezas visuales del diseño de Stitch que se repiten en varias pantallas.

export const sombraTarjeta = "shadow-[0_4px_16px_-2px_rgba(78,69,64,0.05),0_1px_3px_0_rgba(78,69,64,0.03)]";

/** Encabezado de página: línea chica con punto dorado, título grande y acciones a la derecha. */
export function Encabezado({ ceja, titulo, bajada, children }: { ceja: string; titulo: string; bajada?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-space-md pt-1 sm:flex-row sm:items-end">
      <div className="flex flex-col">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
          <span className="font-label-sm text-label-sm uppercase tracking-widest text-outline">{ceja}</span>
        </div>
        <h1 className="font-headline-xl text-headline-xl font-normal uppercase tracking-[0.12em] text-primary">{titulo}</h1>
        {bajada && <p className="font-caption-italic text-caption-italic italic text-on-surface-variant">{bajada}</p>}
      </div>
      {children && <div className="flex items-center justify-end gap-space-sm self-stretch sm:self-auto">{children}</div>}
    </div>
  );
}

/** Indicador chico de la franja superior. */
export function Indicador({
  titulo,
  icono,
  iconoColor = "text-outline",
  valor,
  valorColor = "text-primary",
  nota,
  notaClase = "font-caption-italic text-caption-italic italic text-outline",
  children,
}: {
  titulo: string;
  icono?: string;
  iconoColor?: string;
  valor: React.ReactNode;
  valorColor?: string;
  nota?: React.ReactNode;
  notaClase?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-container-low px-4 py-2.5 ${sombraTarjeta}`}>
      <div className="flex items-center justify-between text-outline">
        <span className="font-label-sm text-label-sm uppercase tracking-wider">{titulo}</span>
        {icono && <span className={`ms text-[16px] ${iconoColor}`}>{icono}</span>}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className={`font-headline-lg text-[22px] font-medium leading-none tracking-[0.02em] ${valorColor}`}>{valor}</span>
        {nota && <span className={notaClase}>{nota}</span>}
      </div>
      {children}
    </div>
  );
}

export const icono = (nombre: string, clase = "text-[16px]") => <span className={`ms ${clase}`}>{nombre}</span>;
