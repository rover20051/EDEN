"use client";

import { initMercadoPago, Payment, StatusScreen } from "@mercadopago/sdk-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fechaHora } from "@/lib/format";
import type { Cupon } from "@/lib/mercadopago";
import { anularCuponMercadoPago, consultarPagoMercadoPago, pagarConMercadoPago, prepararMercadoPago } from "./acciones";

/**
 * Pago con Mercado Pago dentro de la tienda (Checkout Bricks), con los colores y la letra de Edén.
 * - Tarjeta (crédito, débito y prepaga): se carga en los campos seguros de Mercado Pago; la tienda recibe un token y
 *   cobra desde el servidor. Si el banco pide validar (3DS), el desafío se muestra acá mismo.
 * - Efectivo: cupón para pagar en Rapipago o Pago Fácil. Queda a la vista (y llega por mail) hasta que se paga o vence.
 * Dinero en cuenta no: quien tiene plata en Mercado Pago puede transferir sin comisión.
 */

// Colores de la web (src/app/globals.css). Mercado Pago no lee variables CSS: van los valores.
const ESTILO = {
  theme: "flat" as const,
  customVariables: {
    textPrimaryColor: "#2c221c",
    textSecondaryColor: "#76665e",
    inputBackgroundColor: "#fbf7f0",
    formBackgroundColor: "#fbf7f0",
    baseColor: "#2c221c",
    baseColorFirstVariant: "#4e4540",
    baseColorSecondVariant: "#76665e",
    errorColor: "#9b3b32",
    successColor: "#39432a",
    outlinePrimaryColor: "#2c221c",
    outlineSecondaryColor: "#d6cabb",
    buttonTextColor: "#f3ebe0",
    fontSizeSmall: "15px",
    fontSizeMedium: "17px",
    fontSizeLarge: "20px",
    inputFocusedBoxShadow: "0 0 0 3px rgba(178, 143, 60, 0.25)",
    borderRadiusSmall: "4px",
    borderRadiusMedium: "6px",
    borderRadiusLarge: "24px",
  },
};
const LETRA = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&display=swap";
const EFECTIVO = ["rapipago", "pagofacil"] as ("rapipago" | "pagofacil")[];
const VISUAL = { style: ESTILO, font: LETRA, hideFormTitle: true };
const PERSONALIZACION = {
  paymentMethods: { creditCard: "all" as const, debitCard: "all" as const, prepaidCard: "all" as const, ticket: EFECTIVO },
  visual: VISUAL,
};
// Con la tarjeta cobrada por Nave, Mercado Pago solo ofrece efectivo.
const SOLO_EFECTIVO = { paymentMethods: { ticket: EFECTIVO }, visual: VISUAL };

let claveIniciada = "";
function iniciar(clave: string) {
  if (claveIniciada === clave) return;
  initMercadoPago(clave, { locale: "es-AR" });
  claveIniciada = clave;
}

type Fase =
  | { tipo: "cargando" }
  | { tipo: "formulario"; email: string | null }
  | { tipo: "desafio"; pagoId: string; url: string; creq: string }
  | { tipo: "cupon"; cupon: Cupon }
  | { tipo: "revision" }
  | { tipo: "sin_pago"; error: string };

export function PagoMercadoPago({ token, total, clavePublica, soloEfectivo = false }: { token: string; total: number; clavePublica: string; soloEfectivo?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [fase, setFase] = useState<Fase>({ tipo: "cargando" });
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0); // cambia para volver a montar los campos después de un rechazo
  const preparado = useRef<{ email: string | null } | null>(null);

  const irAlPedido = useCallback(() => {
    const destino = `/pedido/${token}`;
    if (pathname === destino) router.refresh();
    else router.push(destino);
  }, [pathname, router, token]);

  useEffect(() => {
    iniciar(clavePublica);
    let vivo = true;
    prepararMercadoPago(token).then((r) => {
      if (!vivo) return;
      if (!r.ok) return setFase({ tipo: "sin_pago", error: r.error });
      preparado.current = { email: r.email };
      // Ya hay un pago en marcha para este pedido: se muestra eso en vez del formulario.
      if (r.pendiente?.tipo === "aprobado") return irAlPedido();
      if (r.pendiente?.tipo === "cupon") return setFase({ tipo: "cupon", cupon: r.pendiente.cupon });
      if (r.pendiente?.tipo === "revision") return setFase({ tipo: "revision" });
      setFase({ tipo: "formulario", ...preparado.current });
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- irAlPedido cambia con la ruta; esto corre una vez por pedido
  }, [clavePublica, token]);

  // Después del desafío del banco: se consulta el pago cada 3 segundos, hasta 3 minutos.
  useEffect(() => {
    if (fase.tipo !== "desafio") return;
    let vueltas = 0;
    const id = setInterval(async () => {
      vueltas++;
      const r = await consultarPagoMercadoPago(token, fase.pagoId);
      if (r.estado === "esperando" && vueltas < 60) return;
      clearInterval(id);
      if (r.estado === "aprobado") return irAlPedido();
      if (r.estado === "cupon") return setFase({ tipo: "cupon", cupon: r.cupon });
      if (r.estado === "en_revision" || r.estado === "esperando" || r.estado === "desafio") return setFase({ tipo: "revision" });
      setError(r.error);
      volverAlFormulario();
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando arranca un desafío nuevo
  }, [fase.tipo === "desafio" ? fase.pagoId : null]);

  function volverAlFormulario() {
    setIntento((i) => i + 1);
    setFase(preparado.current ? { tipo: "formulario", ...preparado.current } : { tipo: "cargando" });
  }

  const email = fase.tipo === "formulario" ? fase.email : null;
  const inicializacion = useMemo(() => ({ amount: total, ...(email ? { payer: { email } } : {}) }), [total, email]);

  const alEnviar = useCallback(
    async ({ formData }: { formData: unknown }) => {
      setError(null);
      const sesion = (window as unknown as { MP_DEVICE_SESSION_ID?: string }).MP_DEVICE_SESSION_ID ?? null;
      const r = await pagarConMercadoPago(token, formData, sesion);
      if (r.estado === "aprobado") return irAlPedido();
      if (r.estado === "desafio") return setFase({ tipo: "desafio", pagoId: r.pagoId, url: r.url, creq: r.creq });
      if (r.estado === "cupon") return setFase({ tipo: "cupon", cupon: r.cupon });
      if (r.estado === "en_revision") return setFase({ tipo: "revision" });
      setError(r.error);
      volverAlFormulario();
    },
    [token, irAlPedido],
  );
  const alFallar = useCallback((e: { type: string; message: string }) => {
    console.error("[mercadopago] campos de pago", e);
    if (e.type === "critical") setFase({ tipo: "sin_pago", error: "No pudimos mostrar el pago con tarjeta. Recargá la página o pagá por transferencia." });
  }, []);

  if (fase.tipo === "sin_pago") {
    return (
      <p role="alert" className="border border-borde bg-nota p-6 italic text-error">
        {fase.error}
      </p>
    );
  }
  if (fase.tipo === "cupon") {
    return (
      <CuponEfectivo
        cupon={fase.cupon}
        error={error}
        conTarjeta={!soloEfectivo}
        anular={async () => {
          setError(null);
          const r = await anularCuponMercadoPago(token, fase.cupon.pagoId);
          if (!r.ok) return setError(r.error);
          volverAlFormulario();
        }}
      />
    );
  }
  if (fase.tipo === "revision") {
    return (
      <div className="border border-borde bg-nota p-6">
        <p className="text-xl">Mercado Pago está revisando tu pago.</p>
        <p className="mt-2 italic text-tenue">Apenas lo apruebe te llega un mail. Tus piezas siguen reservadas mientras tanto.</p>
        <button type="button" onClick={irAlPedido} className="mt-4 underline underline-offset-4">
          Ver mi pedido
        </button>
      </div>
    );
  }
  if (fase.tipo === "desafio") {
    return (
      <div className="flex flex-col gap-3">
        <p className="italic text-tenue">Tu banco pide confirmar que sos vos. Seguí los pasos y no cierres esta página.</p>
        <StatusScreen
          initialization={{ paymentId: fase.pagoId, additionalInfo: { externalResourceURL: fase.url, creq: fase.creq } }}
          customization={{ visual: { style: ESTILO, font: LETRA, hideStatusDetails: true, hideTransactionDate: true } }}
          locale="es-AR"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {clavePublica.startsWith("TEST-") && <AyudaPrueba />}
      {error && (
        <p role="alert" className="border border-error/40 p-4 italic text-error">
          {error}
        </p>
      )}
      {fase.tipo === "cargando" ? (
        <div className="border border-borde bg-nota p-6 italic text-tenue" aria-busy>
          Preparando el pago…
        </div>
      ) : (
        <Payment key={intento} initialization={inicializacion} customization={soloEfectivo ? SOLO_EFECTIVO : PERSONALIZACION} onSubmit={alEnviar} onError={alFallar} locale="es-AR" />
      )}
    </div>
  );
}

function CuponEfectivo({ cupon, error, anular, conTarjeta }: { cupon: Cupon; error: string | null; anular: () => Promise<void>; conTarjeta: boolean }) {
  const [anulando, setAnulando] = useState(false);
  return (
    <div className="border border-borde bg-nota p-6 shadow-[0_18px_28px_-24px_rgba(44,34,28,.45)]">
      <h3 className="font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Pagá en efectivo en {cupon.medio}</h3>
      <p className="mt-3">Mostrá el cupón en cualquier local de {cupon.medio}, en el celular o impreso, y pagá en efectivo.</p>
      {cupon.vence && <p className="mt-2 italic text-tenue">El cupón vence el {fechaHora(cupon.vence)}.</p>}
      <a
        href={cupon.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-block rounded-full bg-tinta px-7 py-3.5 text-[1.1rem] text-papel transition-colors hover:bg-raiz"
      >
        Ver e imprimir el cupón
      </a>
      <p className="mt-4 text-base italic text-tenue">
        Cuando pagues, Mercado Pago nos avisa solo y te llega un mail con la confirmación. También te mandamos este cupón por mail.
      </p>
      {error && (
        <p role="alert" className="mt-3 italic text-error">
          {error}
        </p>
      )}
      {conTarjeta && (
        <button
          type="button"
          disabled={anulando}
          onClick={async () => {
            setAnulando(true);
            await anular();
            setAnulando(false);
          }}
          className="mt-4 text-base underline underline-offset-4 hover:text-oro disabled:opacity-50"
        >
          {anulando ? "Anulando el cupón…" : "Prefiero pagar con tarjeta"}
        </button>
      )}
    </div>
  );
}

/**
 * Solo con las credenciales de prueba (link de prueba): datos de las tarjetas de prueba de Mercado Pago.
 * Fuente: mercadopago.com.ar/developers/es/docs/checkout-bricks/integration-test/test-cards
 */
function AyudaPrueba() {
  const fila = "flex flex-wrap justify-between gap-x-3";
  const num = "font-maquina text-[0.9rem] tabular-nums";
  return (
    <div className="overflow-hidden rounded-lg border border-dashed border-oro/50 bg-papel/60 text-base">
      <p className="flex items-center justify-center gap-2 bg-chip-oro px-4 py-2 text-center font-maquina text-[0.72rem] uppercase tracking-[0.14em] text-raiz">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-oro" />
        Mercado Pago de prueba · no se cobra nada
      </p>
      <div className="flex flex-col gap-1.5 p-3.5">
        <p className={fila}>
          <span>Mastercard crédito</span>
          <span className={num}>5031 7557 3453 0604</span>
        </p>
        <p className={fila}>
          <span>Visa débito</span>
          <span className={num}>4002 7686 9439 5619</span>
        </p>
        <p className={fila}>
          <span>Con desafío del banco</span>
          <span className={num}>5483 9281 6457 4623</span>
        </p>
        <p className="italic text-tenue">Vencimiento 11/30, código 123, DNI 12345678.</p>
        <p className="italic text-tenue">
          En el nombre del titular: <span className="not-italic">APRO</span> aprueba, <span className="not-italic">OTHE</span> rechaza,{" "}
          <span className="not-italic">CONT</span> queda en revisión.
        </p>
        <p className="italic text-tenue">Mail: cualquiera que no sea el de la cuenta de Mercado Pago. En efectivo sale un cupón de prueba.</p>
      </div>
    </div>
  );
}
