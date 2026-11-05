import { EsqueletoEncabezado, EsqueletoFilas, EsqueletoIndicadores, EsqueletoPagina } from "@/components/esqueleto";

export default function Cargando() {
  return (
    <EsqueletoPagina>
      <EsqueletoEncabezado />
      <EsqueletoIndicadores />
      <EsqueletoFilas n={4} alto="h-28" />
    </EsqueletoPagina>
  );
}
