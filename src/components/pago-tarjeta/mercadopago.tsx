"use client";

import { initMercadoPago, Payment, StatusScreen } from "@mercadopago/sdk-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { consultarPagoMercadoPago, pagarConMercadoPago, prepararMercadoPago } from "./acciones";

/**
 * Pago con tarjeta de Mercado Pago dentro de la tienda (Checkout Bricks). La tarjeta se carga en los campos seguros de
 * Mercado Pago, con los colores y la letra de Edén; la tienda recibe un token y cobra desde el servidor.
 * Solo tarjetas (crédito, débito y prepaga): dinero en cuenta no, porque quien tiene plata en Mercado Pago puede
 * transferir sin comisión. Si el banco pide validar (3DS), el desafío se muestra acá mismo.
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
const PERSONALIZACION = {
  paymentMethods: { creditCard: "all" as const, debitCard: "all" as const, prepaidCard: "all" as const },
  visual: { style: ESTILO, font: LETRA, hideFormTitle: true },
};

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
  | { tipo: "revision" }
  | { tipo: "sin_pago"; error: string };

export function PagoMercadoPago({ token, total, clavePublica }: { token: string; total: number; clavePublica: string }) {
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
      setFase({ tipo: "formulario", ...preparado.current });
    });
    return () => {
      vivo = false;
    };
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
        <Payment key={intento} initialization={inicializacion} customization={PERSONALIZACION} onSubmit={alEnviar} onError={alFallar} locale="es-AR" />
      )}
    </div>
  );
}
