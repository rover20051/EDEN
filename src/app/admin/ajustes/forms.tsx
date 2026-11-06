"use client";

import { startTransition, useActionState, useState } from "react";
import { agregarAdmin, editarAdmin, guardarAjustes, type Resultado } from "@/app/admin/actions";
import { Mensaje } from "@/components/accion";
import { ars } from "@/lib/format";

/** Formulario que no se borra si la acción falla. */
function useForm(accion: (prev: Resultado | null, f: FormData) => Promise<Resultado>) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    startTransition(() => enviar(datos));
  };
  return { estado, onSubmit, pendiente };
}

const rotulo = "font-label-sm text-label-sm uppercase tracking-wider text-outline";
const campo = "w-full rounded-full bg-surface-container-lowest px-3 py-1.5 shadow-sm focus:outline-none focus:ring-1 focus:ring-secondary";

type DatosCliente = { alias_transferencia: string; email_contacto: string; whatsapp_contacto: string; precio_set: number };

/** Datos para el cliente (diseño de Stitch): alias con "Copiar", contacto y el Set. */
export function FormAjustes({ a, precioSueltos }: { a: DatosCliente; precioSueltos: number }) {
  const { estado, onSubmit, pendiente } = useForm(guardarAjustes);
  const [alias, setAlias] = useState(a.alias_transferencia);
  const [copiado, setCopiado] = useState(false);
  const [precioSet, setPrecioSet] = useState(a.precio_set ? a.precio_set.toLocaleString("es-AR") : "");
  const set = Number(precioSet.replace(/\D/g, "")) || 0;

  return (
    <form id="datos-cliente" onSubmit={onSubmit} className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <label htmlFor="alias" className={rotulo}>
          Alias para transferencias
        </label>
        <div className="flex items-center justify-between rounded-full bg-surface-container-lowest px-3 py-1.5 shadow-sm focus-within:ring-1 focus-within:ring-secondary">
          <input
            id="alias"
            name="alias_transferencia"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="eden.biblias"
            className="w-full bg-transparent font-code-num text-code-num uppercase tracking-wider text-primary placeholder:normal-case placeholder:text-outline focus:outline-none"
          />
          <button
            type="button"
            disabled={!alias}
            onClick={() => {
              navigator.clipboard?.writeText(alias);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }}
            className="inline-flex items-center gap-1 pl-2 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:text-primary disabled:opacity-40"
          >
            <span className="ms text-[15px]">{copiado ? "check" : "content_copy"}</span>
            <span>{copiado ? "Copiado" : "Copiar"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Mail para comprobantes</span>
          <input name="email_contacto" type="email" defaultValue={a.email_contacto} placeholder="hola@…" className={`${campo} font-body-sm text-body-sm text-on-surface`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>WhatsApp de Edén</span>
          <input name="whatsapp_contacto" defaultValue={a.whatsapp_contacto} placeholder="11 2345 6789" className={`${campo} font-code-num text-code-num text-on-surface`} />
        </label>
      </div>

      <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-container p-space-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="ms text-[16px] text-secondary">auto_stories</span>
            <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary">Set Biblia + Journal</span>
          </div>
          <span className={`rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm ${set ? "text-secondary" : "text-outline"}`}>{set ? "Activo" : "Apagado"}</span>
        </div>
        <p className="font-caption-italic text-caption-italic text-body-sm italic text-on-surface-variant">Cada Biblia + Journal del carrito se cobra a este precio, en la web y en los pedidos manuales. Con 0 no hay Set.</p>
        <div className="mt-0.5 grid grid-cols-1 gap-space-sm sm:grid-cols-2">
          <label className="flex flex-col justify-between rounded-2xl bg-surface-container-lowest p-2">
            <span className="font-label-sm text-label-sm text-outline">Precio final del Set</span>
            <span className="mt-0.5 flex items-baseline gap-1">
              <span className="font-headline-md text-headline-md font-bold text-primary">$</span>
              <input
                name="precio_set"
                value={precioSet}
                onChange={(e) => setPrecioSet(e.target.value)}
                inputMode="numeric"
                className="w-full bg-transparent font-headline-md text-headline-md font-bold text-primary focus:outline-none"
              />
              <span className="font-label-sm text-label-sm text-outline">ARS</span>
            </span>
          </label>
          <div className="flex flex-col justify-between rounded-2xl bg-surface-container-lowest p-2">
            <span className="font-label-sm text-label-sm text-outline">Descuento aplicado</span>
            <div className="mt-0.5 flex flex-col">
              <span className="font-code-num text-code-num text-secondary">{set && precioSueltos > set ? `−${ars(precioSueltos - set)}` : "—"}</span>
              <span className="font-label-sm text-label-sm text-secondary/70">contra {ars(precioSueltos)} por separado</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <Mensaje estado={estado} />
        <button
          disabled={pendiente}
          className="flex items-center gap-space-xs rounded-full bg-primary px-4 py-2 font-label-md text-label-md uppercase tracking-wider text-surface shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          <span className="ms text-[16px]">save</span>
          <span>{pendiente ? "Guardando…" : "Guardar datos"}</span>
        </button>
      </div>
    </form>
  );
}

const chico = "rounded-full bg-surface-container-lowest px-3 py-1.5 font-body-sm text-body-sm text-on-surface shadow-sm placeholder:italic placeholder:text-outline focus:outline-none";

function OpcionesSocio() {
  return (
    <>
      <option value="nari">Nari</option>
      <option value="mich">Mich</option>
      <option value="fede">Fede</option>
    </>
  );
}

/** Corregir el nombre o a quién corresponde un acceso, desde su fila en "Quiénes entran". */
export function EditarAdmin({ a }: { a: { email: string; nombre: string; socio: string } }) {
  const [abierto, setAbierto] = useState(false);
  const { estado, onSubmit, pendiente } = useForm(editarAdmin);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="font-label-sm text-label-sm text-on-surface-variant underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
      >
        {abierto ? "Cerrar" : "Editar"}
      </button>
      {abierto && (
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-1.5 rounded-2xl bg-surface-container p-space-sm">
          <input type="hidden" name="email" value={a.email} />
          <div className="flex flex-wrap gap-space-sm">
            <input name="nombre" required defaultValue={a.nombre} aria-label="Nombre" placeholder="Nombre" className={`${chico} min-w-0 flex-1`} />
            <select name="socio" defaultValue={a.socio} aria-label="Socia o socio" className={chico}>
              <OpcionesSocio />
            </select>
            <button
              disabled={pendiente}
              className="whitespace-nowrap rounded-full bg-primary px-3 py-1.5 font-label-md text-label-md uppercase tracking-wider text-surface transition-all hover:bg-primary-container disabled:opacity-50"
            >
              {pendiente ? "…" : "Guardar"}
            </button>
          </div>
          <Mensaje estado={estado} />
        </form>
      )}
    </>
  );
}

/** Autorizar a otra persona (diseño de Stitch, con nombre y socio porque el sistema los necesita). */
export function FormAdmin() {
  const { estado, onSubmit, pendiente } = useForm(agregarAdmin);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1.5 rounded-2xl bg-surface-container p-space-sm">
      <span className={rotulo}>Autorizar a otra persona</span>
      <div className="flex flex-wrap gap-space-sm">
        <input name="nombre" required placeholder="Nombre" className={`${chico} w-28 min-w-0`} />
        <input name="email" type="email" required placeholder="mail@…" className={`${chico} min-w-0 flex-1`} />
        <select name="socio" required defaultValue="" aria-label="Socia o socio" className={chico}>
          <option value="" disabled>
            ¿Quién es?
          </option>
          <OpcionesSocio />
        </select>
        <button
          disabled={pendiente}
          className="whitespace-nowrap rounded-full bg-primary px-3 py-1.5 font-label-md text-label-md uppercase tracking-wider text-surface transition-all hover:bg-primary-container disabled:opacity-50"
        >
          {pendiente ? "…" : "+ Autorizar"}
        </button>
      </div>
      <Mensaje estado={estado} />
    </form>
  );
}
