"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export const ITEMS_NAV = [
  { href: "/admin", label: "Hoy", icono: "radio_button_checked" },
  { href: "/admin/pedidos", label: "Pedidos", icono: "inventory_2" },
  { href: "/admin/productos", label: "Productos", icono: "menu_book" },
  { href: "/admin/plata", label: "Plata", icono: "account_balance_wallet" },
  { href: "/admin/numeros", label: "Números", icono: "query_stats" },
  { href: "/admin/ajustes", label: "Ajustes", icono: "settings" },
];

/** La barra lateral suma Cupones, Cartas y Devoluciones (la de celular tiene lugar para 6: esas quedan en el buscador ⌘K). */
const ITEMS_BARRA = [...ITEMS_NAV.slice(0, 3), { href: "/admin/cupones", label: "Cupones", icono: "confirmation_number" }, { href: "/admin/cartas", label: "Cartas", icono: "drafts" }, { href: "/admin/devoluciones", label: "Devoluciones", icono: "undo" }, ...ITEMS_NAV.slice(3)];

/** Barra lateral colapsable (compu) y barra inferior (celular). */
export function Nav({ nombre }: { nombre: string }) {
  const path = usePathname();
  const activo = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  return (
    <>
      <Sidebar nombre={nombre} items={ITEMS_BARRA} />

      {/* Celular */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-primary/15 bg-surface-container/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {ITEMS_NAV.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={activo(i.href) ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2 font-label-sm text-[9px] uppercase tracking-normal ${activo(i.href) ? "text-on-surface" : "text-outline"}`}
          >
            <span className="ms text-[20px]">{i.icono}</span>
            <span className="max-w-full truncate">{i.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
