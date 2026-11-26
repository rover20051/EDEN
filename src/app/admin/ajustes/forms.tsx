"use client";

import { startTransition, useActionState, useState } from "react";
import { editarAdmin, guardarAjustes, guardarPasarela, type Resultado } from "@/app/admin/actions";
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

/** Datos para el cliente (diseño de Stitch): alias con "Copiar", contacto, aviso de la barra de la web y el Set. */
export function FormAjustes({ a, precioSueltos, avisoBarra }: { a: DatosCliente; precioSueltos: number; avisoBarra?: string }) {
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

      {avisoBarra !== undefined && (
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Aviso de la barra de arriba de la web</span>
          <input
            name="aviso_barra"
            defaultValue={avisoBarra}
            maxLength={120}
            placeholder="Envíos gratis en Buenos Aires"
            className={`${campo} font-body-sm text-body-sm text-on-surface`}
          />
          <span className="font-caption-italic text-caption-italic text-body-sm italic text-on-surface-variant">
            Una línea corta, arriba de todo en la web. Vacío, la barra queda sin texto.
          </span>
        </label>
      )}

      <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-container p-space-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="ms text-[16px] text-secondary">auto_stories</span>
            <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary">Set Biblia + Journal</span>
          </div>
          <span className={`rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm ${set ? "text-secondary" : "text-outline"}`}>{set ? "Activo" : "Apagado"}</span>
        </div>
        <p className="font-caption-italic text-caption-italic text-body-sm italic text-on-surface-variant">Cada Biblia + Journal del carrito se cobra a este precio, en la web y en los pedidos manuales. Es el precio de “Armá tu set” en la web. Con 0 no hay Set y esa sección no aparece.</p>
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

type EstadoPasarela = { id: "mercadopago" | "nave"; nombre: string; detalle: string; real: boolean; prueba: boolean };

/** Con qué pasarela se cobra la tarjeta en la web. Solo deja elegir una con sus credenciales reales cargadas. */
export function FormPasarela({ actual, pasarelas }: { actual: "mercadopago" | "nave"; pasarelas: EstadoPasarela[] }) {
  const { estado, onSubmit, pendiente } = useForm(guardarPasarela);
  const [elegida, setElegida] = useState(actual);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
      {pasarelas.map((p) => (
        <label
          key={p.id}
          className={`flex cursor-pointer gap-3 rounded-2xl bg-surface-container-lowest p-3 shadow-sm ${elegida === p.id ? "ring-1 ring-secondary" : ""} ${p.real ? "" : "opacity-70"}`}
        >
          <input type="radio" name="pasarela" value={p.id} checked={elegida === p.id} onChange={() => setElegida(p.id)} className="mt-1 accent-secondary" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-headline-md text-headline-md text-primary">
                {p.nombre}
                {actual === p.id && <span className="ml-2 font-label-sm text-label-sm uppercase text-secondary">En uso</span>}
              </span>
              <span className="flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2 py-0.5 font-label-sm text-label-sm uppercase ${p.real ? "bg-tertiary-fixed text-tertiary" : "bg-error-container text-error"}`}>
                  {p.real ? "Cobro real listo" : "Sin credenciales reales"}
                </span>
                <span className={`rounded-full px-2 py-0.5 font-label-sm text-label-sm uppercase ${p.prueba ? "bg-secondary-fixed/50 text-secondary" : "bg-surface-container-high text-outline"}`}>
                  {p.prueba ? "Prueba lista" : "Sin credenciales de prueba"}
                </span>
              </span>
            </span>
            <span className="font-caption-italic text-caption-italic text-body-sm italic text-on-surface-variant">{p.detalle}</span>
          </span>
        </label>
      ))}
      <div className="flex items-center justify-end gap-3">
        <Mensaje estado={estado} />
        <button
          disabled={pendiente || elegida === actual}
          className="flex items-center gap-space-xs rounded-full bg-primary px-4 py-2 font-label-md text-label-md uppercase tracking-wider text-surface shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          <span className="ms text-[16px]">swap_horiz</span>
          <span>{pendiente ? "Cambiando…" : "Cambiar pasarela"}</span>
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
