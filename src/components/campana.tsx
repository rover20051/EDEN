"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AvisosPush } from "@/components/avisos-push/avisos-push";
import { useToast } from "@/components/toasts";
import { ars, numeroPedido, relativo } from "@/lib/format";

/** Un pedido web nuevo o un pago confirmado de las últimas 72 h. */
export type Novedad = {
  clave: string;
  pedidoId: string;
  numero: number;
  tipo: "nuevo" | "pagado";
  nombre: string;
  total: number;
  medio: string;
  /** ISO: cuándo pasó (creación o pago). */
  cuando: string;
};

const CLAVE_VISTO = "eden.campana.visto";
const CADA_MS = 60_000;

const leerVisto = () => {
  try {
    return Number(localStorage.getItem(CLAVE_VISTO)) || 0;
  } catch {
    return 0;
  }
};
const AL_CAMBIAR = "eden:campana-visto";
const guardarVisto = (t: number) => {
  try {
    localStorage.setItem(CLAVE_VISTO, String(t));
  } catch {}
  window.dispatchEvent(new Event(AL_CAMBIAR));
};
/** "Visto" vive en localStorage (y se sincroniza entre pestañas). */
const suscribirVisto = (avisar: () => void) => {
  const otraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE_VISTO) avisar();
  };
  window.addEventListener("storage", otraPestana);
  window.addEventListener(AL_CAMBIAR, avisar);
  return () => {
    window.removeEventListener("storage", otraPestana);
    window.removeEventListener(AL_CAMBIAR, avisar);
  };
};

const nombreCorto = (n: string) => {
  const [a, b] = n.trim().split(/\s+/);
  return b ? `${a} ${b[0].toUpperCase()}.` : a || "Sin nombre";
};
const titulo = (n: Novedad) => (n.tipo === "nuevo" ? `Pedido web ${numeroPedido(n.numero)}` : `Pagado ${numeroPedido(n.numero)}`);

/** Campanita del header: pedidos web y pagos nuevos desde la última vez que se abrió. Consulta cada 60 s con la pestaña visible. */
async function cargar(): Promise<Novedad[]> {
  const r = await fetch("/api/admin/novedades", { cache: "no-store" });
  if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw new Error("sin novedades");
  return r.json();
}

export function Campana() {
  const [lista, setLista] = useState<Novedad[]>([]);
  const visto = useSyncExternalStore(suscribirVisto, leerVisto, () => 0);
  const [vistoAntes, setVistoAntes] = useState(0);
  const [abierta, setAbierta] = useState(false);
  const conocidas = useRef<Set<string> | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const actualizar = useCallback(async () => {
    let datos: Novedad[];
    try {
      datos = await cargar();
    } catch {
      return; // sin conexión o servidor caído: se reintenta en el próximo ciclo
    }
    const antes = conocidas.current;
    if (antes) {
      // Lo que llegó mientras la página estaba abierta: avisar con un toast.
      for (const n of datos) {
        if (!antes.has(n.clave) && Date.parse(n.cuando) > leerVisto()) toast.ok(`${n.tipo === "nuevo" ? "🛒" : "💳"} ${titulo(n)} · ${nombreCorto(n.nombre)} · ${ars(n.total)}`);
      }
    }
    conocidas.current = new Set(datos.map((n) => n.clave));
    setLista(datos);
  }, [toast]);

  useEffect(() => {
    // Suscripción a un sistema externo (el servidor): el setState ocurre después del await, no en el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void actualizar();
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") void actualizar();
    }, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void actualizar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [actualizar]);

  useEffect(() => {
    if (!abierta) return;
    const afuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierta]);

  const nuevas = lista.filter((n) => Date.parse(n.cuando) > visto).length;

  const alternar = () => {
    if (abierta) return setAbierta(false);
    const ahora = Date.now();
    setVistoAntes(visto);
    guardarVisto(ahora);
    setAbierta(true);
  };

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={abierta}
        aria-label={nuevas ? `Novedades: ${nuevas} sin ver` : "Novedades"}
        title="Pedidos y pagos nuevos"
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
      >
        <span className="ms text-[18px]">{nuevas ? "notifications_active" : "notifications"}</span>
        {nuevas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-secondary px-1 font-label-sm text-[10px] font-bold leading-none text-surface shadow-sm">
            {nuevas > 9 ? "9+" : nuevas}
          </span>
        )}
      </button>

      {abierta && (
        <div
          role="dialog"
          aria-label="Pedidos y pagos nuevos"
          className="fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-primary/10 bg-surface-container-lowest shadow-[0_16px_40px_-12px_rgba(55,47,42,0.35)] md:absolute md:inset-x-auto md:right-0 md:top-10 md:w-[360px]"
        >
          <div className="flex items-center justify-between border-b border-primary/10 px-4 py-2.5">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Últimas 72 h</span>
            <span className="font-caption-italic text-[12px] italic text-outline">pedidos web y pagos</span>
          </div>
          {lista.length === 0 ? (
            <p className="px-4 py-6 text-center font-caption-italic text-caption-italic italic text-outline">Nada nuevo en las últimas 72 h.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {lista.map((n) => {
                const nueva = Date.parse(n.cuando) > vistoAntes;
                return (
                  <li key={n.clave}>
                    <Link
                      href={`/admin/pedidos/${n.pedidoId}`}
                      onClick={() => setAbierta(false)}
                      className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-container-high/50"
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.tipo === "nuevo" ? "bg-secondary-fixed/60 text-secondary" : "bg-tertiary-fixed text-tertiary"}`}
                      >
                        <span className="ms text-[16px]">{n.tipo === "nuevo" ? "shopping_bag" : "payments"}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-body-md text-body-sm font-bold text-primary">{titulo(n)}</span>
                          {nueva && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" aria-label="sin ver" />}
                        </span>
                        <span className="truncate font-body-md text-[13px] text-on-surface-variant">
                          {nombreCorto(n.nombre)} · {ars(n.total)} · {n.medio}
                        </span>
                      </span>
                      <span className="shrink-0 font-label-sm text-label-sm text-outline">{relativo(n.cuando)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-primary/10 px-4 py-2.5">
            <AvisosPush />
          </div>
        </div>
      )}
    </div>
  );
}
