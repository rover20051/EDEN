import type { ReactNode } from "react";
import { fecha } from "@/lib/format";

export type Paso = { titulo: string; fecha: string | null };

const ANCHO = 1000;
const ALTO = 170;
/** Paradas del camino: suben y bajan, y el rótulo va del lado de afuera de la curva. */
const PARADAS = [
  { x: 90, y: 128 },
  { x: 295, y: 38 },
  { x: 500, y: 134 },
  { x: 705, y: 42 },
  { x: 910, y: 124 },
];

const tramo = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const medio = (b.x - a.x) / 2;
  return `M${a.x} ${a.y} C${a.x + medio} ${a.y} ${b.x - medio} ${b.y} ${b.x} ${b.y}`;
};

/** Seguimiento del pedido: un sendero punteado de izquierda a derecha, con una parada por estado. */
export function Camino({ pasos, actual, detalle }: { pasos: Paso[]; actual: number; detalle?: ReactNode }) {
  return (
    <div className="mt-10">
      <div className="relative my-[4.25rem]" style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} aria-hidden className="absolute inset-0 h-full w-full overflow-visible" fill="none" strokeLinecap="round">
          {PARADAS.slice(1).map((b, i) => (
            <path
              key={b.x}
              d={tramo(PARADAS[i], b)}
              stroke="currentColor"
              strokeWidth="6"
              strokeDasharray="0 17"
              className={i < actual ? "text-tinta" : "text-tenue/40"}
            />
          ))}
        </svg>
        <ol className="absolute inset-0">
          {pasos.map((s, i) => {
            const hecho = i <= actual;
            const arriba = PARADAS[i].y < ALTO / 2;
            return (
              <li
                key={s.titulo}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(PARADAS[i].x / ANCHO) * 100}%`, top: `${(PARADAS[i].y / ALTO) * 100}%` }}
              >
                <span
                  aria-hidden
                  className={`block h-4 w-4 rounded-full border sm:h-5 sm:w-5 ${hecho ? "border-tinta bg-tinta" : "border-tenue/50 bg-papel"} ${
                    i === actual ? "ring-4 ring-oro/30" : ""
                  }`}
                />
                <div className={`absolute left-1/2 w-max -translate-x-1/2 text-center leading-tight ${arriba ? "bottom-full mb-2.5" : "top-full mt-2.5"}`}>
                  <p className={`text-[0.95rem] sm:text-[1.1rem] ${hecho ? "" : "text-tenue"}`}>
                    {s.titulo}
                    {i === actual && <span className="sr-only"> (paso actual)</span>}
                  </p>
                  {hecho && s.fecha && <p className="text-[0.85rem] italic text-tenue sm:text-base">{fecha(s.fecha)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {detalle && <p className="text-center text-base italic text-tenue">{detalle}</p>}
    </div>
  );
}
