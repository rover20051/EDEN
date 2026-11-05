"use client";

import { startTransition, useActionState, useState } from "react";
import { despachar } from "@/app/admin/actions";
import { Mensaje } from "@/components/accion";
import { claseBoton } from "@/components/estilos";

const EMPRESAS = [
  { valor: "Correo Argentino", corto: "Correo Arg." },
  { valor: "Andreani", corto: "Andreani" },
  { valor: "En mano", corto: "En mano" },
];

const campoChico =
  "w-full rounded-full bg-surface-container-lowest px-2.5 py-1 font-code-num text-[12px] text-primary focus:outline-none focus:ring-1 focus:ring-secondary";

/** "Mini remito" del diseño: empresa, seguimiento, costo real y despachar. */
export function FormDespacho({
  pedidoId,
  envioEstimado,
  direccion,
  variante = "remito",
}: {
  pedidoId: string;
  envioEstimado: number;
  direccion?: string | null;
  variante?: "remito" | "detalle";
}) {
  const [estado, enviar, pendiente] = useActionState(despachar.bind(null, pedidoId), null);
  const [empresa, setEmpresa] = useState(EMPRESAS[0].valor);

  const enviarForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    startTransition(() => enviar(datos));
  };

  // Detalle del pedido: "Despachar a transporte" con selector, como en el diseño.
  if (variante === "detalle") {
    const campoDetalle = "w-full rounded-full bg-surface-container-lowest px-3 py-1 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary";
    return (
      <form onSubmit={enviarForm} className="flex flex-col gap-2 rounded-2xl bg-surface-container p-2.5">
        <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary">Despachar a transporte</span>
        <label className="flex flex-col gap-0.5">
          <span className="font-label-sm text-label-sm uppercase text-outline">Empresa</span>
          <select name="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={campoDetalle}>
            {EMPRESAS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.valor}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="font-label-sm text-label-sm uppercase text-outline">Código de seguimiento</span>
          <input name="seguimiento" placeholder="Ej. TN-9872134" className={`${campoDetalle} font-code-num text-code-num`} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="font-label-sm text-label-sm uppercase text-outline">Costo real del envío</span>
          <input
            name="costo"
            inputMode="numeric"
            key={empresa}
            defaultValue={empresa === "En mano" ? "0" : `$${envioEstimado.toLocaleString("es-AR")}`}
            className={`${campoDetalle} font-code-num text-code-num`}
          />
        </label>
        <button
          disabled={pendiente}
          className="mt-0.5 h-8 w-full rounded-full bg-secondary font-label-sm text-label-sm font-bold uppercase tracking-wider text-surface transition-all hover:bg-on-secondary-container disabled:opacity-50"
        >
          {pendiente ? "…" : "Despachar"}
        </button>
        <Mensaje estado={estado} />
      </form>
    );
  }

  return (
    <form onSubmit={enviarForm} className="flex w-full flex-col gap-2">
      <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-container p-2">
        <span className="font-label-sm text-[11px] uppercase tracking-wider text-outline">Despachar</span>
        <div className="flex flex-col gap-0.5">
          <span className="font-label-sm text-[10px] uppercase text-on-surface-variant">Empresa</span>
          <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-container-high p-0.5">
            {EMPRESAS.map((e) => (
              <button
                key={e.valor}
                type="button"
                onClick={() => setEmpresa(e.valor)}
                className={`rounded-full px-1.5 py-0.5 text-center font-label-sm text-[11px] transition-all ${
                  empresa === e.valor ? "bg-primary text-on-primary" : "text-outline hover:text-on-surface"
                }`}
              >
                {e.corto}
              </button>
            ))}
          </div>
        </div>
        <input type="hidden" name="empresa" value={empresa} />
        <div className="mt-0.5 grid grid-cols-2 gap-1.5">
          <label className="flex flex-col gap-0.5">
            <span className="font-label-sm text-[10px] uppercase text-on-surface-variant">Seguimiento</span>
            <input name="seguimiento" placeholder="N.º" className={campoChico} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="font-label-sm text-[10px] uppercase text-on-surface-variant">Costo real</span>
            <input
              name="costo"
              inputMode="numeric"
              key={empresa}
              defaultValue={empresa === "En mano" ? "0" : `$${envioEstimado.toLocaleString("es-AR")}`}
              className={campoChico}
            />
          </label>
        </div>
        {direccion && (
          <div className="flex items-center gap-1 pt-0.5 text-[12px] text-outline">
            <span className="ms text-[13px]">pin_drop</span>
            <span className="font-label-sm text-label-sm">{direccion}</span>
          </div>
        )}
      </div>
      <button disabled={pendiente} className={`${claseBoton("exito")} w-full py-2`}>
        <span className="ms text-[15px]">local_shipping</span>
        <span>{pendiente ? "…" : "Despachar"}</span>
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}
