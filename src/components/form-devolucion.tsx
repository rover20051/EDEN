"use client";

import { startTransition, useActionState, useState } from "react";
import { registrarDevolucion, type Resultado } from "@/app/admin/actions";
import { Mensaje } from "@/components/accion";
import { useConfirmar } from "@/components/confirmar";
import { claseBoton } from "@/components/estilos";
import { icono } from "@/components/stitch";
import { aPesos, ars } from "@/lib/format";

const DONDE: Record<string, string> = {
  transferencia: "Primero transferile desde el banco y guardá el comprobante.",
  nave: "Primero devolvelo desde Nave: Comercios > Nave > Cobrar o Detalles > Devolver pago.",
  mercadopago: "Primero devolvelo desde Mercado Pago, con “Devolver dinero” en ese cobro.",
};
const rotulo = "font-label-sm text-label-sm uppercase tracking-wider text-outline";
const campo = "w-full rounded-xl bg-surface-container-lowest px-3 py-2 font-body-md text-body-sm text-on-surface shadow-sm focus:outline-none focus:ring-1 focus:ring-secondary";

/** Registra plata ya devuelta. Si completa el total, cancela el pedido y se elige si la pieza vuelve al stock. */
export function FormDevolucion({ pedidoId, restante, medio, nombre }: { pedidoId: string; restante: number; medio: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(String(restante));
  const [estado, enviar, pendiente] = useActionState((prev: Resultado | null, f: FormData) => registrarDevolucion(pedidoId, prev, f), null);
  const confirmar = useConfirmar();
  const valor = aPesos(monto) ?? 0;
  const completa = valor === restante;

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`${claseBoton("secundaria")} w-full py-2.5`}>
        {icono("undo", "text-[15px]")}
        <span>Registrar devolución</span>
      </button>
    );
  }

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const aviso = completa
      ? `¿Ya le devolviste ${ars(valor)} a ${nombre}? El pedido se cancela y le avisamos por mail.`
      : `¿Ya le devolviste ${ars(valor)} a ${nombre}? El pedido sigue igual y le avisamos por mail.`;
    if (!(await confirmar({ mensaje: aviso }))) return;
    startTransition(() => enviar(datos));
  }

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-2.5 rounded-2xl bg-surface-container p-3">
      <p className="font-caption-italic text-caption-italic italic text-on-surface-variant">
        {DONDE[medio] ?? "Primero devolvele la plata."} Acá queda registrado: esto no mueve plata.
      </p>
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Monto (quedan {ars(restante)})</span>
        <input name="monto" inputMode="numeric" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${campo} font-code-num`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Motivo</span>
        <input name="motivo" required maxLength={200} placeholder="Arrepentimiento, llegó dañada…" className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Operación o comprobante (opcional)</span>
        <input name="referencia" maxLength={120} className={campo} />
      </label>
      {completa && (
        <label className="flex items-start gap-2 font-body-md text-body-sm text-on-surface">
          <input type="checkbox" name="vuelve_al_stock" value="si" defaultChecked className="mt-1" />
          <span>Las piezas vuelven al stock para vender. Destildalo si no vuelven o llegaron dañadas: se descuentan de su tanda.</span>
        </label>
      )}
      <div className="flex gap-2">
        <button disabled={pendiente || valor <= 0 || valor > restante} className={`${claseBoton("primaria")} flex-1 py-2 disabled:opacity-50`}>
          {pendiente ? "…" : "Registrar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className={`${claseBoton("secundaria")} py-2`}>
          Cerrar
        </button>
      </div>
      <Mensaje estado={estado} />
    </form>
  );
}
