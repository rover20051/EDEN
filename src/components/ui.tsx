import Link from "next/link";
import { ESTADOS, type Estado } from "@/lib/textos";

export function EstadoBadge({ estado }: { estado: Estado }) {
  const e = ESTADOS[estado];
  return (
    <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-bold uppercase tracking-widest ${e.color}`}>
      {e.label}
    </span>
  );
}

const sombra = "shadow-[0_4px_16px_-2px_rgba(78,69,64,0.06),0_1px_3px_0_rgba(78,69,64,0.04)]";

/** Panel claro sin borde, con sombra suave (tarjeta base del back office). */
export function Tarjeta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-nota p-5 ${sombra} ${className}`}>{children}</section>;
}

/** Encabezado de tarjeta: etiqueta en máquina de escribir y acción opcional a la derecha. */
export function CabeceraTarjeta({ titulo, extra }: { titulo: string; extra?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-borde pb-3">
      <h2 className="font-maquina text-[11px] uppercase tracking-[0.12em] text-tenue">{titulo}</h2>
      {extra}
    </div>
  );
}

export function Titulo({ children, accion, bajada }: { children: React.ReactNode; accion?: React.ReactNode; bajada?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-titulo text-[34px] uppercase leading-tight tracking-[0.06em]">{children}</h1>
        {bajada && <p className="mt-1 italic text-tenue">{bajada}</p>}
      </div>
      {accion && <div className="flex flex-wrap items-center gap-2">{accion}</div>}
    </div>
  );
}

export function Seccion({ titulo, children, detalle }: { titulo: string; children: React.ReactNode; detalle?: string }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 font-titulo text-[22px] uppercase tracking-[0.05em]">
        {titulo} {detalle && <span className="ml-1 font-serif text-sm normal-case italic tracking-normal text-tenue">{detalle}</span>}
      </h2>
      {children}
    </section>
  );
}

/** Indicador: etiqueta chica, número grande y nota en itálica. */
export function Cifra({ label, valor, nota }: { label: string; valor: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl bg-nota p-4 ${sombra}`}>
      <div className="font-maquina text-[10px] uppercase tracking-[0.12em] text-tenue">{label}</div>
      <div className="mt-1.5 font-titulo text-[26px] leading-tight tabular-nums">{valor}</div>
      {nota && <div className="mt-0.5 text-[13px] italic text-tenue">{nota}</div>}
    </div>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-papel-2/60 p-6 text-center italic text-tenue">{children}</p>;
}

export function Chip({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3.5 py-1.5 font-maquina text-[11px] uppercase tracking-[0.08em] ${
        activo ? "bg-tinta text-papel" : "bg-papel-2 text-tinta hover:bg-[#e9e1d7]"
      }`}
    >
      {children}
    </Link>
  );
}

export const campo =
  "min-h-10 w-full rounded-full bg-fondo-input px-4 text-[15px] shadow-[inset_0_0_0_1px_rgba(55,47,42,0.1)] outline-none placeholder:italic placeholder:text-tenue focus:shadow-[inset_0_0_0_1.5px_#775a06]";
