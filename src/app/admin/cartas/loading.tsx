import { Bloque, EsqueletoEncabezado, EsqueletoIndicadores, EsqueletoPagina } from "@/components/esqueleto";

export default function Cargando() {
  return (
    <EsqueletoPagina>
      <EsqueletoEncabezado />
      <EsqueletoIndicadores n={3} />
      <div className="grid gap-4 lg:grid-cols-12">
        <Bloque className="h-96 lg:col-span-5" />
        <Bloque className="h-96 lg:col-span-7" />
      </div>
    </EsqueletoPagina>
  );
}
