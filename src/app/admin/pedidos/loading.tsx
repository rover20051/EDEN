import { Bloque, EsqueletoEncabezado, EsqueletoFilas, EsqueletoIndicadores, EsqueletoPagina } from "@/components/esqueleto";

export default function Cargando() {
  return (
    <EsqueletoPagina>
      <EsqueletoEncabezado />
      <EsqueletoIndicadores />
      <Bloque className="mb-3 h-10 w-full max-w-md rounded-full" />
      <EsqueletoFilas n={6} />
    </EsqueletoPagina>
  );
}
