import { Bloque, EsqueletoEncabezado, EsqueletoFilas, EsqueletoIndicadores, EsqueletoPagina } from "@/components/esqueleto";

export default function Cargando() {
  return (
    <EsqueletoPagina>
      <EsqueletoEncabezado />
      <EsqueletoIndicadores />
      <div className="grid gap-3 lg:grid-cols-2">
        <Bloque className="h-56" />
        <Bloque className="h-56" />
      </div>
      <div className="mt-3">
        <EsqueletoFilas n={4} alto="h-14" />
      </div>
    </EsqueletoPagina>
  );
}
