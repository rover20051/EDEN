"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Modal, Tecla } from "@/components/modal";
import { useAnclaGasto, useIr } from "@/components/ir";

type Api = { abierta: boolean; abrir: () => void; cerrar: () => void; alternar: () => void };
const Contexto = createContext<Api | null>(null);

export function usePaleta(): Api {
  const c = useContext(Contexto);
  if (!c) throw new Error("usePaleta fuera de PaletaProvider");
  return c;
}

type Opcion = { id: string; grupo: string; label: string; icono: string; href: string; claves?: string; atajo?: string[] };

const OPCIONES: Opcion[] = [
  { id: "hoy", grupo: "Ir a", label: "Hoy", icono: "radio_button_checked", href: "/admin", claves: "inicio panel resumen", atajo: ["g", "h"] },
  { id: "pedidos", grupo: "Ir a", label: "Pedidos", icono: "inventory_2", href: "/admin/pedidos", claves: "ventas ordenes", atajo: ["g", "p"] },
  { id: "nuevo", grupo: "Ir a", label: "Nuevo pedido", icono: "add_circle", href: "/admin/pedidos/nuevo", claves: "crear alta cargar venta", atajo: ["n"] },
  { id: "productos", grupo: "Ir a", label: "Productos", icono: "menu_book", href: "/admin/productos", claves: "catalogo stock tanda biblias journals", atajo: ["g", "r"] },
  { id: "plata", grupo: "Ir a", label: "Plata", icono: "account_balance_wallet", href: "/admin/plata", claves: "cobros finanzas caja", atajo: ["g", "l"] },
  { id: "numeros", grupo: "Ir a", label: "Números", icono: "query_stats", href: "/admin/numeros", claves: "metricas estadisticas ganancia ventas", atajo: ["g", "u"] },
  { id: "cupones", grupo: "Ir a", label: "Cupones", icono: "confirmation_number", href: "/admin/cupones", claves: "descuento codigo promocion promo", atajo: ["g", "c"] },
  { id: "ajustes", grupo: "Ir a", label: "Ajustes", icono: "settings", href: "/admin/ajustes", claves: "configuracion precios mail alias", atajo: ["g", "a"] },
  { id: "mensajes", grupo: "Ir a", label: "Mails y avisos", icono: "mail", href: "/admin/ajustes/mensajes", claves: "mail correo aviso notificacion enviados venta" },
  { id: "envios", grupo: "Ir a", label: "Envíos por provincia", icono: "local_shipping", href: "/admin/ajustes/envios", claves: "envio tarifa provincia correo andreani gratis" },
  { id: "salida", grupo: "Acciones", label: "Registrar una salida sin cobro", icono: "volunteer_activism", href: "/admin/pedidos/nuevo?tipo=salida", claves: "regalo regalar influencer reposicion muestra gratis sin cobro" },
  { id: "cupon", grupo: "Acciones", label: "Crear un cupón", icono: "add_circle", href: "/admin/cupones#nuevo", claves: "cupon descuento codigo promocion" },
  { id: "gasto", grupo: "Acciones", label: "Cargar un gasto", icono: "add_card", href: "/admin/plata#gasto", claves: "gasto egreso producir publicidad envio plata" },
  { id: "tandas", grupo: "Números", label: "Ganancia por tanda", icono: "layers", href: "/admin/numeros?tab=tandas", claves: "lote tanda costo real recuperado ganancia" },
  { id: "salidas", grupo: "Números", label: "Salidas sin cobro (regalos)", icono: "redeem", href: "/admin/numeros?tab=salidas", claves: "regalado regalos influencer costo salidas" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** "EDN-0012", "edn 12" o "12" → número de pedido; si no, null. */
function comoNumeroPedido(q: string): number | null {
  const m = /^(?:edn)?[\s-]*0*(\d{1,6})$/i.exec(q.trim());
  return m ? Number(m[1]) : null;
}

function armarOpciones(q: string): Opcion[] {
  const t = norm(q.trim());
  const base = t ? OPCIONES.filter((o) => norm(`${o.label} ${o.claves ?? ""}`).includes(t)) : OPCIONES;
  if (!q.trim()) return base;
  const n = comoNumeroPedido(q);
  const buscar: Opcion =
    n && n > 0
      ? {
          id: "buscar",
          grupo: "Pedidos",
          label: `Ir al pedido EDN-${String(n).padStart(4, "0")}`,
          icono: "search",
          href: `/admin/pedidos?q=${encodeURIComponent(`EDN-${String(n).padStart(4, "0")}`)}`,
        }
      : { id: "buscar", grupo: "Pedidos", label: `Buscar pedidos de «${q.trim()}»`, icono: "person_search", href: `/admin/pedidos?q=${encodeURIComponent(q.trim())}` };
  return n ? [buscar, ...base] : [...base, buscar];
}

function Lista({ onCerrar }: { onCerrar: () => void }) {
  const ir = useIr();
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const opciones = useMemo(() => armarOpciones(q), [q]);
  const actual = Math.min(activo, Math.max(opciones.length - 1, 0));

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${actual}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actual]);

  function ejecutar(o: Opcion | undefined) {
    if (!o) return;
    onCerrar();
    ir(o.href);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    const n = opciones.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo(n ? (actual + 1) % n : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo(n ? (actual - 1 + n) % n : 0);
    } else if (e.key === "Home" && n) {
      e.preventDefault();
      setActivo(0);
    } else if (e.key === "End" && n) {
      e.preventDefault();
      setActivo(n - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      ejecutar(opciones[actual]);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-primary/10 px-4 py-3">
        <span className="ms text-[20px] text-outline">search</span>
        <input
          data-autofocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="paleta-lista"
          aria-activedescendant={opciones.length ? `paleta-op-${actual}` : undefined}
          aria-label="Buscar o ir a…"
          autoComplete="off"
          spellCheck={false}
          placeholder="Ir a… o buscar un pedido (EDN-0012, 12 o nombre)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActivo(0);
          }}
          onKeyDown={teclado}
          className="min-w-0 flex-1 bg-transparent font-body-md text-body-md text-on-surface outline-none placeholder:text-outline"
        />
        <Tecla>esc</Tecla>
      </div>
      <ul id="paleta-lista" ref={lista} role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-y-auto p-2">
        {opciones.length === 0 && <li className="px-3 py-6 text-center font-caption-italic text-caption-italic italic text-outline">Nada por acá.</li>}
        {opciones.map((o, i) => {
          const cabecera = o.grupo !== opciones[i - 1]?.grupo;
          return (
            <li key={o.id} role="presentation">
              {cabecera && <div className="px-3 pb-1 pt-2 font-label-sm text-label-sm uppercase tracking-widest text-outline">{o.grupo}</div>}
              <div
                id={`paleta-op-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === actual}
                onMouseMove={() => i !== actual && setActivo(i)}
                onClick={() => ejecutar(o)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 font-body-md text-body-md ${i === actual ? "bg-surface-dim text-on-surface" : "text-on-surface-variant"}`}
              >
                <span className="ms text-[18px]">{o.icono}</span>
                <span className="flex-1 truncate">{o.label}</span>
                {o.atajo && (
                  <span className="flex items-center gap-1">
                    {o.atajo.map((k, j) => (
                      <Tecla key={j}>{k}</Tecla>
                    ))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-4 border-t border-primary/10 px-4 py-2 font-label-sm text-label-sm text-outline">
        <span className="flex items-center gap-1"><Tecla>↑</Tecla><Tecla>↓</Tecla> moverse</span>
        <span className="flex items-center gap-1"><Tecla>↵</Tecla> abrir</span>
        <span className="ml-auto flex items-center gap-1"><Tecla>?</Tecla> atajos</span>
      </div>
    </>
  );
}

/** Paleta de comandos (⌘K / Ctrl+K): ir a una sección, cargar un gasto o buscar pedidos. */
export function PaletaProvider({ children }: { children: React.ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  useAnclaGasto();
  const api = useMemo<Api>(
    () => ({ abierta, abrir: () => setAbierta(true), cerrar: () => setAbierta(false), alternar: () => setAbierta((a) => !a) }),
    [abierta],
  );
  return (
    <Contexto.Provider value={api}>
      {children}
      {abierta && (
        <Modal etiqueta="Paleta de comandos" alto="arriba" onCerrar={api.cerrar} className="max-w-xl overflow-hidden">
          <Lista onCerrar={api.cerrar} />
        </Modal>
      )}
    </Contexto.Provider>
  );
}

const sinSuscripcion = () => () => {};
const textoAtajo = () => (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K");

/** Botón del header: "Buscar… ⌘K". */
export function BotonPaleta() {
  const { abrir } = usePaleta();
  const tecla = useSyncExternalStore(sinSuscripcion, textoAtajo, () => "⌘K");
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Buscar o ir a… (atajo: ⌘K o Ctrl+K)"
      aria-haspopup="dialog"
      className="flex h-8 items-center gap-2 rounded-full bg-surface-container px-2.5 font-label-md text-label-md text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface sm:min-w-[210px] sm:px-3"
    >
      <span className="ms text-[16px]">search</span>
      <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
      <span className="hidden sm:inline-flex"><Tecla>{tecla}</Tecla></span>
    </button>
  );
}
