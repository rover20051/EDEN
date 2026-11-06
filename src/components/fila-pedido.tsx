"use client";

import { useIr } from "@/components/ir";

/**
 * Fila de tabla que abre el pedido al tocarla. Va con onClick porque Safari ignora position:relative en <tr>:
 * un enlace estirado con after:inset-0 taparía los filtros y el buscador de toda la página.
 */
export function FilaPedido({ href, children }: { href: string; children: React.ReactNode }) {
  const ir = useIr();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button") || window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else ir(href);
      }}
      className="group cursor-pointer transition-colors duration-150 hover:bg-surface-container-high/60"
    >
      {children}
    </tr>
  );
}
