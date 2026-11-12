"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ars } from "@/lib/format";
import { pagarConTarjetaPrueba, pasarATransferencia } from "./acciones";
import { PagoMercadoPago } from "./mercadopago";
import { PagoNave } from "./nave";
import {
  NOMBRE_MARCA,
  TARJETAS_PRUEBA,
  formatearNumero,
  formatearVencimiento,
  marca,
  soloDigitos,
  validarTarjeta,
  vencimientoValido,
  type DatosTarjeta,
  type ErroresTarjeta,
} from "./tarjeta";

/**
 * Pago con tarjeta de un pedido ya creado. El resto de la tienda solo conoce esta interfaz: `<PagoTarjeta token total modo />`.
 * - "mercadopago": los campos de pago de Mercado Pago, dentro de la tienda (`./mercadopago.tsx`). Con `soloEfectivo`, solo el cupón.
 * - "nave": el checkout embebido de Nave (`./nave.tsx`).
 * - "prueba": formulario de tarjeta simulado, sin pasarela configurada.
 * `clavePublica` es la de la pasarela (la de Mercado Pago o la de Nave); `entorno`, si son las de prueba o las reales.
 */
export function PagoTarjeta({
  token,
  total,
  modo,
  clavePublica = "",
  entorno = "real",
  soloEfectivo = false,
}: {
  token: string;
  total: number;
  modo: "mercadopago" | "nave" | "prueba";
  clavePublica?: string;
  entorno?: "real" | "prueba";
  soloEfectivo?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {modo === "mercadopago" ? (
        <PagoMercadoPago token={token} total={total} clavePublica={clavePublica} soloEfectivo={soloEfectivo} />
      ) : modo === "nave" ? (
        <PagoNave token={token} clavePublica={clavePublica} entorno={entorno} />
      ) : (
        <FormularioPrueba token={token} total={total} />
      )}
      <CambiarATransferencia token={token} />
    </div>
  );
}

/** Salida del paso de tarjeta: el mismo pedido pasa a pagarse por transferencia (sin rearmar el carrito). */
function CambiarATransferencia({ token }: { token: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function cambiar() {
    setError(null);
    iniciar(async () => {
      const r = await pasarATransferencia(token);
      if (!r.ok) return setError(r.error);
      const destino = `/pedido/${token}`;
      if (pathname === destino) router.refresh();
      else router.push(destino);
    });
  }

  return (
    <div className="rounded-lg border border-borde p-4 text-center">
      <p className="italic text-tenue">¿Preferís pagar de otra forma?</p>
      <button
        type="button"
        onClick={cambiar}
        disabled={pendiente}
        className="mt-2 rounded-full border border-tinta px-5 py-2 text-[1.05rem] transition-colors hover:bg-tinta hover:text-papel disabled:opacity-50"
      >
        {pendiente ? "Cambiando…" : "Pagar por transferencia"}
      </button>
      {error && (
        <p role="alert" className="mt-2 italic text-error">
          {error}
        </p>
      )}
    </div>
  );
}

const caja =
  "w-full rounded-md border border-borde bg-fondo-input px-3.5 py-3 text-[1.1rem] tabular-nums outline-none transition-colors placeholder:text-tenue/70 focus:border-tinta focus:ring-2 focus:ring-oro/25 aria-[invalid=true]:border-error";
const rotulo = "mb-1.5 block font-maquina text-[0.7rem] uppercase tracking-[0.12em] text-tenue";

function FormularioPrueba({ token, total }: { token: string; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [t, setT] = useState<DatosTarjeta>({ numero: "", vencimiento: "", cvc: "", nombre: "" });
  const [errores, setErrores] = useState<ErroresTarjeta>({});
  const [tocado, setTocado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aprobado, setAprobado] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const m = marca(t.numero);
  const amex = m === "amex";

  const cambiar = (k: keyof DatosTarjeta, v: string) => {
    const nuevo = { ...t, [k]: v };
    setT(nuevo);
    if (tocado) setErrores(validarTarjeta(nuevo));
  };

  function usar(numero: string) {
    // Completa también vencimiento y CVC si faltan o no sirven, para probar con un clic.
    const nuevo = {
      ...t,
      numero: formatearNumero(numero),
      vencimiento: vencimientoValido(t.vencimiento) ? t.vencimiento : "12/30",
      cvc: t.cvc.length === 3 ? t.cvc : "123",
    };
    setT(nuevo);
    setError(null);
    if (tocado) setErrores(validarTarjeta(nuevo));
  }

  function pagar(e: React.FormEvent) {
    e.preventDefault();
    setTocado(true);
    const errs = validarTarjeta(t);
    setErrores(errs);
    if (Object.keys(errs).length) return;
    setError(null);
    iniciar(async () => {
      const r = await pagarConTarjetaPrueba(token, t);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAprobado(true);
      const destino = `/pedido/${token}`;
      if (pathname === destino) router.refresh();
      else router.push(destino);
    });
  }

  const ocupado = pendiente || aprobado;

  return (
    <div className="overflow-hidden rounded-lg border border-borde bg-nota shadow-[0_18px_28px_-24px_rgba(44,34,28,.45)]">
      <p className="flex items-center justify-center gap-2 bg-chip-oro px-4 py-2 text-center font-maquina text-[0.72rem] uppercase tracking-[0.14em] text-raiz">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-oro" />
        Modo prueba · no se cobra nada
      </p>

      <form onSubmit={pagar} noValidate className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-2xl font-light">Datos de la tarjeta</h3>
          <span className="flex items-center gap-1.5 text-base italic text-tenue">
            <Candado /> Pago seguro
          </span>
        </div>

        <div className="rounded-md border border-dashed border-oro/50 bg-papel/60 p-3.5 text-base">
          <p className="mb-2 italic text-tenue">Tarjetas de prueba (cualquier vencimiento futuro y CVC):</p>
          <ul className="flex flex-col gap-1.5">
            {[
              { n: TARJETAS_PRUEBA.aprobada, t: "aprobada", c: "text-musgo" },
              { n: TARJETAS_PRUEBA.rechazada, t: "rechazada", c: "text-error" },
            ].map((x) => (
              <li key={x.n} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span>
                  <span className="font-maquina text-[0.95rem] tabular-nums">{formatearNumero(x.n)}</span>{" "}
                  <span className={`italic ${x.c}`}>· {x.t}</span>
                </span>
                <button
                  type="button"
                  onClick={() => usar(x.n)}
                  disabled={ocupado}
                  className="font-maquina text-[0.7rem] uppercase tracking-[0.12em] text-tinta underline underline-offset-4 hover:text-oro disabled:opacity-50"
                >
                  Usar
                </button>
              </li>
            ))}
          </ul>
        </div>

        <label className="block">
          <span className={rotulo}>Número de tarjeta</span>
          <span className="relative block">
            <input
              value={t.numero}
              onChange={(e) => cambiar("numero", formatearNumero(e.target.value))}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 5678 9012 3456"
              maxLength={23}
              aria-invalid={Boolean(errores.numero)}
              aria-describedby={errores.numero ? "error-numero" : undefined}
              className={`${caja} pr-28`}
            />
            {m && (
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-maquina text-[0.7rem] uppercase tracking-[0.1em] text-tenue">
                {NOMBRE_MARCA[m]}
              </span>
            )}
          </span>
          {errores.numero && <ErrorCampo id="error-numero">{errores.numero}</ErrorCampo>}
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={rotulo}>Vencimiento</span>
            <input
              value={t.vencimiento}
              onChange={(e) => cambiar("vencimiento", formatearVencimiento(e.target.value))}
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/AA"
              maxLength={5}
              aria-invalid={Boolean(errores.vencimiento)}
              aria-describedby={errores.vencimiento ? "error-vencimiento" : undefined}
              className={caja}
            />
            {errores.vencimiento && <ErrorCampo id="error-vencimiento">{errores.vencimiento}</ErrorCampo>}
          </label>
          <label className="block">
            <span className={rotulo}>Código (CVC)</span>
            <input
              value={t.cvc}
              onChange={(e) => cambiar("cvc", soloDigitos(e.target.value).slice(0, amex ? 4 : 3))}
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder={amex ? "1234" : "123"}
              maxLength={4}
              aria-invalid={Boolean(errores.cvc)}
              aria-describedby={errores.cvc ? "error-cvc" : undefined}
              className={caja}
            />
            {errores.cvc && <ErrorCampo id="error-cvc">{errores.cvc}</ErrorCampo>}
          </label>
        </div>

        <label className="block">
          <span className={rotulo}>Nombre como figura en la tarjeta</span>
          <input
            value={t.nombre}
            onChange={(e) => cambiar("nombre", e.target.value.toUpperCase())}
            autoComplete="cc-name"
            placeholder="ANA PÉREZ"
            maxLength={80}
            aria-invalid={Boolean(errores.nombre)}
            aria-describedby={errores.nombre ? "error-nombre" : undefined}
            className={`${caja} uppercase tabular-nums`}
          />
          {errores.nombre && <ErrorCampo id="error-nombre">{errores.nombre}</ErrorCampo>}
        </label>

        <div aria-live="polite">
          {error && (
            <p role="alert" className="rounded-md border border-error/30 bg-error/5 px-3.5 py-2.5 italic text-error">
              {error}
            </p>
          )}
          {aprobado && <p className="rounded-md border border-musgo/30 bg-chip-hierba px-3.5 py-2.5 italic text-musgo">Pago aprobado. Te llevamos a tu pedido…</p>}
        </div>

        <button
          disabled={ocupado}
          className="rounded-full bg-tinta px-7 py-3.5 text-[1.15rem] text-papel transition-colors hover:bg-raiz disabled:opacity-60"
        >
          {aprobado ? "Pago aprobado" : pendiente ? "Procesando el pago…" : `Pagar ${ars(total)}`}
        </button>
        <p className="-mt-2 text-center text-base italic text-tenue">No guardamos los datos de tu tarjeta.</p>
      </form>
    </div>
  );
}

function ErrorCampo({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} className="mt-1 block text-base italic text-error">
      {children}
    </span>
  );
}

function Candado() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}
