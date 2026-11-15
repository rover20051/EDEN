"use client";

import { usePathname, useRouter } from "next/navigation";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { consultarPagoNave, prepararNave } from "./acciones";

/**
 * Pago con Nave dentro de la tienda: el checkout embebido de Nave (`@ranty/ranty-sdk`, un web component) se muestra
 * en la página con la intención de pago que crea el servidor. El diseño del formulario es de Nave: solo se puede mostrar
 * u ocultar alguna parte, no cambiarle los colores. El resultado se confirma siempre en el servidor, contra la API de
 * Nave: lo que avisa el navegador solo sirve para saber cuándo preguntar.
 * "Abrir el pago en otra pestaña" lleva al mismo checkout alojado en Nave, por si el embebido no carga.
 */

type Fase =
  | { tipo: "cargando" }
  | { tipo: "pago"; intencion: string; checkoutUrl: string }
  | { tipo: "confirmando" }
  | { tipo: "revision" }
  | { tipo: "sin_pago"; error: string };

export function PagoNave({ token, clavePublica, entorno }: { token: string; clavePublica: string; entorno: "real" | "prueba" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [fase, setFase] = useState<Fase>({ tipo: "cargando" });
  const [aviso, setAviso] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [listo, setListo] = useState(false);
  // La misma consulta se comparte entre los dos montajes de desarrollo (Strict Mode): una sola intención por intento.
  const consulta = useRef<{ intento: number; promesa: ReturnType<typeof prepararNave> } | null>(null);

  const irAlPedido = useCallback(() => {
    const destino = `/pedido/${token}`;
    if (pathname === destino) router.refresh();
    else router.push(destino);
  }, [pathname, router, token]);

  // La intención de pago (el servidor reutiliza la vigente; si venció o se usó, crea otra).
  useEffect(() => {
    let vivo = true;
    if (consulta.current?.intento !== intento) consulta.current = { intento, promesa: prepararNave(token) };
    consulta.current.promesa.then((r) => {
      if (!vivo) return;
      if (!r.ok) return setFase({ tipo: "sin_pago", error: r.error });
      if (r.aprobado) return irAlPedido();
      setFase({ tipo: "pago", intencion: r.intencion, checkoutUrl: r.checkoutUrl });
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- irAlPedido cambia con la ruta; esto corre una vez por intento
  }, [token, intento]);

  // El checkout de Nave es un web component: se registra una sola vez, solo en el navegador.
  useEffect(() => {
    let vivo = true;
    import("@ranty/ranty-sdk").then(
      () => vivo && setListo(true),
      (e) => {
        console.error("[nave] no se pudo cargar el checkout", e);
        if (vivo) setFase({ tipo: "sin_pago", error: "No pudimos mostrar el pago con tarjeta. Recargá la página o pagá por transferencia." });
      },
    );
    return () => {
      vivo = false;
    };
  }, []);

  // Eventos del checkout: al terminar (bien o mal) se le pregunta al servidor cómo quedó el pago.
  useEffect(() => {
    if (fase.tipo !== "pago") return;
    const alMensaje = (ev: MessageEvent) => {
      const tipo = (ev.data as { type?: unknown } | null)?.type;
      if (typeof tipo !== "string") return;
      if (tipo === "SUCCESS_PROCESSED") setFase({ tipo: "confirmando" });
      else if (tipo === "BLOCKED") {
        setAviso("Nave bloqueó este intento de pago. Probá de nuevo o pagá por transferencia.");
        setIntento((i) => i + 1);
        setFase({ tipo: "cargando" });
      }
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, [fase.tipo]);

  // Confirmación: cada 2 segundos, hasta 1 minuto. Si el pago aprobado todavía no figura, queda "en revisión" y el aviso de Nave lo cierra.
  useEffect(() => {
    if (fase.tipo !== "confirmando") return;
    let vueltas = 0;
    const id = setInterval(async () => {
      vueltas++;
      const r = await consultarPagoNave(token);
      if (r.estado === "esperando" && vueltas < 30) return;
      clearInterval(id);
      if (r.estado === "aprobado") return irAlPedido();
      if (r.estado === "rechazado") {
        setAviso(r.error);
        setIntento((i) => i + 1);
        return setFase({ tipo: "cargando" });
      }
      if (r.estado === "nueva") {
        setIntento((i) => i + 1);
        return setFase({ tipo: "cargando" });
      }
      setFase({ tipo: "revision" });
    }, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando empieza una confirmación
  }, [fase.tipo === "confirmando"]);

  if (fase.tipo === "sin_pago") {
    return (
      <p role="alert" className="border border-borde bg-nota p-6 italic text-error">
        {fase.error}
      </p>
    );
  }
  if (fase.tipo === "confirmando") {
    return (
      <div className="border border-borde bg-nota p-6" aria-busy>
        <p className="text-xl">Confirmando tu pago…</p>
        <p className="mt-2 italic text-tenue">Un momento, no cierres esta página.</p>
      </div>
    );
  }
  if (fase.tipo === "revision") {
    return (
      <div className="border border-borde bg-nota p-6">
        <p className="text-xl">Estamos confirmando tu pago.</p>
        <p className="mt-2 italic text-tenue">Apenas Nave lo confirme te llega un mail. Tus piezas siguen reservadas mientras tanto.</p>
        <button type="button" onClick={irAlPedido} className="mt-4 underline underline-offset-4">
          Ver mi pedido
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {clavePublica.length > 0 && entorno === "prueba" && <AyudaPruebaNave />}
      {aviso && (
        <p role="alert" className="border border-error/40 p-4 italic text-error">
          {aviso}
        </p>
      )}
      {fase.tipo === "cargando" || !listo ? (
        <div className="border border-borde bg-nota p-6 italic text-tenue" aria-busy>
          Preparando el pago…
        </div>
      ) : (
        <>
          <div style={{ minHeight: 640, height: "min(94vh, 900px)", background: "#F4F4F4" }}>
            {createElement("payfac-sdk", {
              key: fase.intencion,
              paymentRequestId: fase.intencion,
              publicKey: clavePublica,
              // "sandbox" (no figura en el README del SDK) apunta a api-sandbox.ranty.io, donde se crean las intenciones de
              // prueba; "staging" es otro ambiente de Nave y ahí la intención no existe (responde not_found).
              env: entorno === "prueba" ? "sandbox" : "production",
            })}
          </div>
          <p className="text-center text-base italic text-tenue">
            ¿No ves el pago?{" "}
            <a href={fase.checkoutUrl} target="_blank" rel="noopener noreferrer" className="text-tinta underline underline-offset-4">
              Abrirlo en otra pestaña
            </a>
          </p>
        </>
      )}
    </div>
  );
}

/** Solo con las credenciales de sandbox (link de prueba): las tarjetas de prueba de Nave. Fuente: doc oficial de Nave, Soporte → Simulador de cobros. */
function AyudaPruebaNave() {
  const fila = "flex flex-wrap justify-between gap-x-3";
  const num = "font-maquina text-[0.9rem] tabular-nums";
  return (
    <div className="overflow-hidden rounded-lg border border-dashed border-oro/50 bg-papel/60 text-base">
      <p className="flex items-center justify-center gap-2 bg-chip-oro px-4 py-2 text-center font-maquina text-[0.72rem] uppercase tracking-[0.14em] text-raiz">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-oro" />
        Nave de prueba · no se cobra nada
      </p>
      <div className="flex flex-col gap-1.5 p-3.5">
        <p className={fila}>
          <span>Visa crédito (aprobada)</span>
          <span className={num}>4025 2200 0000 0139</span>
        </p>
        <p className={fila}>
          <span>Mastercard crédito (aprobada)</span>
          <span className={num}>5239 3782 7376 2445</span>
        </p>
        <p className={fila}>
          <span>Visa crédito (rechazada)</span>
          <span className={num}>4025 2200 0000 0127</span>
        </p>
        <p className="italic text-tenue">Con esas tarjetas sirven cualquier vencimiento y código. La tienda de Nave pide ingreso manual solo si lo habilitaron.</p>
      </div>
    </div>
  );
}
