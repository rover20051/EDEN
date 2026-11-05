"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { CLAVE_BARRA as CLAVE } from "@/components/barra-script";

type Modo = "ancha" | "compacta";
type Item = { href: string; label: string; icono: string };

const oyentes = new Set<() => void>();
const leer = (): Modo => (document.documentElement.dataset.barra === "ancha" ? "ancha" : "compacta");
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => void oyentes.delete(f);
};

function fijarModo(m: Modo) {
  if (m === "ancha") document.documentElement.dataset.barra = "ancha";
  else delete document.documentElement.dataset.barra;
  try {
    localStorage.setItem(CLAVE, m);
  } catch {}
  oyentes.forEach((f) => f());
}

/**
 * Barra lateral de compu: arranca compacta (72px, solo íconos) y se despliega encima del contenido
 * al pasar el mouse o enfocar (todo en CSS, ver globals.css). Se puede fijar abierta (220px).
 */
export function Sidebar({ nombre, items }: { nombre: string; items: Item[] }) {
  const path = usePathname();
  const modo = useSyncExternalStore(suscribir, leer, () => "compacta" as Modo);
  const compacta = modo === "compacta";
  const activo = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  // Si se entró al /admin desde otra página sin recarga, el script del layout no corrió: aplicamos lo guardado.
  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE) === "ancha" && leer() !== "ancha") fijarModo("ancha");
    } catch {}
  }, []);

  const base = "flex items-center gap-space-sm overflow-hidden whitespace-nowrap rounded-full px-space-md py-2.5 transition-colors";

  return (
    <aside
      aria-label="Menú principal"
      onMouseLeave={(e) => delete e.currentTarget.dataset.cerrando}
      className="barra-lateral fixed left-0 top-0 z-50 hidden h-full flex-col justify-between overflow-hidden border-r border-primary/15 bg-surface-container p-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)] md:flex"
    >
      <div className="flex flex-col gap-space-lg">
        <div className="barra-fila flex h-10 items-center justify-between gap-2 px-space-sm pt-space-xs">
          <div className="barra-marca min-w-0">
            <div className="barra-txt font-headline-lg text-headline-lg uppercase leading-none tracking-[0.06em] text-primary">Edén</div>
            <div className="barra-txt mt-0.5 whitespace-nowrap font-caption-italic text-caption-italic italic text-outline">Back office</div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              const aside = e.currentTarget.closest("aside");
              const pasaAChica = leer() !== "compacta";
              // Al achicar, la barra se queda chica aunque el mouse siga encima (hasta que salga y vuelva a entrar).
              if (pasaAChica && aside?.matches(":hover")) aside.dataset.cerrando = "";
              if (pasaAChica) e.currentTarget.blur();
              fijarModo(pasaAChica ? "compacta" : "ancha");
            }}
            aria-label={compacta ? "Fijar la barra abierta" : "Achicar la barra"}
            title={compacta ? "Fijar la barra abierta" : "Achicar la barra"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="ms barra-ico-cerrar text-[18px]">left_panel_close</span>
            <span className="ms barra-ico-abrir text-[18px]">left_panel_open</span>
          </button>
        </div>
        <nav aria-label="Secciones" className="flex flex-col gap-1">
          {items.map((i) => {
            const on = activo(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                title={compacta ? i.label : undefined}
                aria-current={on ? "page" : undefined}
                className={`${base} ${on ? "bg-surface-dim font-bold text-on-surface" : "font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"}`}
              >
                <span className="ms shrink-0 text-[16px]">{i.icono}</span>
                <span className="barra-txt">{i.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="whitespace-nowrap border-t border-primary/10 px-space-sm pb-space-xs pt-space-md">
        <div className="barra-txt font-label-sm text-label-sm tracking-wider text-outline">Fede, Nari &amp; Mich</div>
        <div className="mt-1 flex items-center gap-1.5" title={compacta ? `Sesión: ${nombre}` : undefined}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
          <span className="barra-txt font-label-sm text-label-sm text-on-surface-variant">Sesión: {nombre}</span>
        </div>
      </div>
    </aside>
  );
}
