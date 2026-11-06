"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/toasts";
import { guardarSuscripcion, probarPush, quitarSuscripcion } from "./acciones";

type Estado = "cargando" | "no-disponible" | "instalar-iphone" | "bloqueado" | "apagado" | "prendido";

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const ALCANCE = "/admin";

const esIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const hayPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function aBytes(base64: string) {
  const normal = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normal), (c) => c.charCodeAt(0));
}

async function estadoActual(): Promise<Estado> {
  if (esIphone() && !instalada()) return "instalar-iphone";
  if (!hayPush() || !CLAVE_PUBLICA) return "no-disponible";
  if (Notification.permission === "denied") return "bloqueado";
  const registro = await navigator.serviceWorker.getRegistration(ALCANCE);
  return (await registro?.pushManager.getSubscription()) ? "prendido" : "apagado";
}

const claseBoton = "rounded-full bg-surface-container-high px-3 py-1 font-label-sm text-[11px] uppercase tracking-wider text-primary transition-colors hover:bg-surface-dim disabled:opacity-50";

/** Activar o apagar las notificaciones de venta en este dispositivo. El iPhone las permite solo con la app agregada a la pantalla de inicio. */
export function AvisosPush() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [pendiente, iniciar] = useTransition();
  const toast = useToast();

  useEffect(() => {
    estadoActual().then(setEstado, () => setEstado("no-disponible"));
  }, []);

  function activar() {
    iniciar(async () => {
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          setEstado(permiso === "denied" ? "bloqueado" : "apagado");
          return;
        }
        await navigator.serviceWorker.register("/sw-avisos.js", { scope: ALCANCE });
        const registro = await navigator.serviceWorker.ready;
        const suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(CLAVE_PUBLICA) });
        const { endpoint, keys } = suscripcion.toJSON();
        const r = await guardarSuscripcion({ endpoint: endpoint ?? "", p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "", dispositivo: navigator.userAgent.slice(0, 200) });
        if (!r.ok) {
          await suscripcion.unsubscribe();
          toast.error(r.error);
          return;
        }
        setEstado("prendido");
        toast.ok(r.mensaje ?? "Avisos activados");
      } catch (e) {
        toast.error(`No se pudieron activar: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function apagar() {
    iniciar(async () => {
      const registro = await navigator.serviceWorker.getRegistration(ALCANCE);
      const suscripcion = await registro?.pushManager.getSubscription();
      if (suscripcion) {
        const r = await quitarSuscripcion(suscripcion.endpoint);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        await suscripcion.unsubscribe();
      }
      setEstado("apagado");
    });
  }

  function probar() {
    iniciar(async () => {
      const r = await probarPush();
      if (r.ok) toast.ok(r.mensaje ?? "Aviso enviado");
      else toast.error(r.error);
    });
  }

  if (estado === "cargando") return null;
  const nota = "font-caption-italic text-[12px] italic leading-snug text-outline";

  if (estado === "instalar-iphone") {
    return (
      <p className={nota}>
        Para recibir avisos en el iPhone: tocá Compartir → <b>Agregar a inicio</b>, abrí Edén desde ese ícono, iniciá sesión y activalos desde acá.
      </p>
    );
  }
  if (estado === "no-disponible") return <p className={nota}>Este navegador no admite avisos, o falta configurar las claves del servidor.</p>;
  if (estado === "bloqueado") return <p className={nota}>Las notificaciones están bloqueadas. Permitilas para Edén en los ajustes del dispositivo.</p>;
  if (estado === "apagado") {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className={nota}>Recibí un aviso cuando se vende algo.</span>
        <button type="button" onClick={activar} disabled={pendiente} className={`${claseBoton} shrink-0 !bg-primary !text-on-primary`}>
          {pendiente ? "Activando…" : "Activar avisos"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={nota}>Avisos activos en este dispositivo.</span>
      <span className="flex shrink-0 gap-1">
        <button type="button" onClick={probar} disabled={pendiente} className={claseBoton}>
          Probar
        </button>
        <button type="button" onClick={apagar} disabled={pendiente} className={claseBoton}>
          Apagar
        </button>
      </span>
    </div>
  );
}
