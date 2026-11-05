import { Bloque, EsqueletoEncabezado, EsqueletoIndicadores, EsqueletoPagina } from "@/components/esqueleto";

export default function Cargando() {
  return (
    <EsqueletoPagina>
      <EsqueletoEncabezado />
      <EsqueletoIndicadores n={3} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Bloque key={i} className="h-40" />
        ))}
      </div>
    </EsqueletoPagina>
  );
}
