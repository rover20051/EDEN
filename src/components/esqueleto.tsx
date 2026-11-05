// Bloques de carga (sin "use client": se usan desde los loading.tsx).

export function Bloque({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-container ${className}`} />;
}

/** Encabezado de página en esqueleto (ceja, título y bajada). */
export function EsqueletoEncabezado() {
  return (
    <div className="mb-4 flex flex-col gap-2 pt-1">
      <Bloque className="h-3 w-24 rounded-full" />
      <Bloque className="h-8 w-56 rounded-xl" />
      <Bloque className="h-3 w-72 max-w-full rounded-full" />
    </div>
  );
}

/** Franja de indicadores (4 por fila en compu). */
export function EsqueletoIndicadores({ n = 4 }: { n?: number }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <Bloque key={i} className="h-[72px]" />
      ))}
    </div>
  );
}

/** Lista de filas (pedidos, gastos, productos). */
export function EsqueletoFilas({ n = 6, alto = "h-20" }: { n?: number; alto?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: n }, (_, i) => (
        <Bloque key={i} className={alto} />
      ))}
    </div>
  );
}

/** Contenedor accesible para los loading.tsx. */
export function EsqueletoPagina({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando">
      {children}
    </div>
  );
}
