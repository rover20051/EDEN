import { Bloque, EsqueletoEncabezado, EsqueletoFilas, EsqueletoIndicadores, EsqueletoPagina } from "@/components/esqueleto";

export default function Cargando() {
  return (
    <EsqueletoPagina>
      <EsqueletoEncabezado />
      <EsqueletoIndicadores n={3} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <EsqueletoFilas n={4} alto="h-14" />
        </div>
        <Bloque className="h-80 lg:col-span-4" />
      </div>
    </EsqueletoPagina>
  );
}
