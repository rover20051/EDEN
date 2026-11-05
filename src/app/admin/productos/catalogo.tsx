"use client";

import { startTransition, useActionState, useCallback, useState } from "react";
import { guardarCatalogo } from "@/app/admin/actions";
import { Mensaje } from "@/components/accion";
import { fotoProducto } from "@/lib/fotos";
import { ListaEspera, type Espera } from "./espera";
import { EditarProducto } from "./producto";

export type ProductoCatalogo = {
  id: string;
  nombre: string;
  tipo: "biblia" | "journal";
  diseno: string;
  precio: number;
  precio_anterior: number | null;
  etiqueta: string | null;
  activo: boolean;
  stock: number;
  verbo: string | null;
  descripcion: string | null;
  foto_path: string | null;
  foto_url: string | null;
  espera: Espera[];
};

const SUGERIDAS = ["Más vendido", "Oferta imperdible", "Nuevo", "Edición limitada", "Ideal para regalar", "Últimas unidades"];
const miles = (n: number) => n.toLocaleString("es-AR");

/** Color del chip según la etiqueta, como en el diseño. */
const colorEtiqueta = (e: string) =>
  /vendido|oferta/i.test(e)
    ? "bg-secondary-container text-on-secondary-container font-bold"
    : /últimas|agotado/i.test(e)
      ? "bg-error-container text-error font-bold"
      : e
        ? "bg-surface-dim text-on-surface-variant"
        : "bg-transparent text-outline ring-1 ring-outline-variant/60";

function Fila({ p, onEditar, onEspera }: { p: ProductoCatalogo; onEditar: () => void; onEspera: () => void }) {
  const [precio, setPrecio] = useState(miles(p.precio));
  const [antes, setAntes] = useState(p.precio_anterior ? miles(p.precio_anterior) : "");
  const [etiqueta, setEtiqueta] = useState(p.etiqueta ?? "");
  const [activo, setActivo] = useState(p.activo);
  const n = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  const off = n(antes) > n(precio) && n(precio) ? Math.round((1 - n(precio) / n(antes)) * 100) : 0;
  const agotado = p.stock === 0;
  const esperan = p.espera.filter((e) => !e.avisado_at).length;

  return (
    <tr className={`transition-colors hover:bg-surface-container-low/80 ${agotado ? "bg-surface-container-low/60" : ""}`}>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onEditar}
            title="Editar foto y textos"
            aria-label={`Editar foto y textos de ${p.nombre}`}
            className="group relative h-8 w-8 shrink-0 overflow-hidden rounded-2xl bg-cover bg-center shadow-inner focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
            style={{ backgroundImage: `url(${p.foto_url ?? fotoProducto(p.nombre)})` }}
          >
            <span className="ms absolute inset-0 flex items-center justify-center bg-primary/45 text-[16px] text-surface-container-lowest opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              edit
            </span>
          </button>
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="whitespace-nowrap font-headline-md text-headline-md leading-tight text-primary">{p.nombre}</span>
              <button
                type="button"
                onClick={onEditar}
                aria-label={`Editar ${p.nombre}`}
                className="rounded-full p-0.5 text-outline transition-colors hover:bg-surface-container-high hover:text-primary"
              >
                <span className="ms text-[15px]">edit</span>
              </button>
            </span>
            {agotado && <span className="font-caption-italic text-caption-italic text-error">Sin stock</span>}
          </div>
        </div>
      </td>
      <td className="px-3 py-1.5 font-body-sm text-body-sm text-on-surface-variant">{p.tipo === "biblia" ? "Biblia" : "Journal"} · Colección 1</td>
      <td className="px-3 py-1.5">
        <div className="inline-flex items-center rounded-2xl bg-surface-container-lowest px-2 py-0.5 shadow-inner">
          <span className="font-code-num text-code-num text-primary">$</span>
          <input
            name={`precio_${p.id}`}
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            inputMode="numeric"
            aria-label={`Precio ${p.nombre}`}
            className="w-20 bg-transparent text-right font-code-num text-code-num text-primary focus:outline-none"
          />
        </div>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center rounded-2xl bg-surface-container-lowest px-2 py-0.5 shadow-inner">
            <span className="font-code-num text-code-num text-outline">$</span>
            <input
              name={`anterior_${p.id}`}
              value={antes}
              onChange={(e) => setAntes(e.target.value)}
              inputMode="numeric"
              placeholder="—"
              aria-label={`Precio anterior ${p.nombre}`}
              className={`w-16 bg-transparent text-right font-code-num text-code-num focus:outline-none ${off ? "text-outline line-through" : "text-outline"}`}
            />
          </div>
          {off > 0 && <span className="rounded-full bg-tertiary-fixed px-1.5 py-0.5 font-label-sm text-label-sm uppercase text-tertiary">−{off}%</span>}
        </div>
      </td>
      <td className="px-3 py-1.5">
        <input
          name={`etiqueta_${p.id}`}
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          list="etiquetas"
          maxLength={30}
          placeholder="Sin etiqueta"
          aria-label={`Etiqueta ${p.nombre}`}
          className={`w-40 rounded-full px-2 py-0.5 font-label-sm text-label-sm uppercase placeholder:normal-case placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary ${colorEtiqueta(etiqueta)}`}
        />
      </td>
      <td className="px-3 py-1.5 text-center">
        <span
          className={`inline-block w-12 rounded-2xl py-0.5 text-center font-code-num text-code-num shadow-inner ${
            agotado ? "bg-error-container text-error" : "bg-surface-container-lowest text-primary"
          }`}
        >
          {p.stock}
        </span>
      </td>
      <td className="px-3 py-1.5 text-center">
        <button
          type="button"
          onClick={onEspera}
          title={p.espera.length ? "Ver quiénes esperan" : "Nadie en espera"}
          aria-label={`Lista de espera de ${p.nombre}: ${esperan} ${esperan === 1 ? "persona" : "personas"}`}
          className={`inline-flex min-w-12 items-center justify-center gap-1 rounded-full px-2 py-0.5 font-code-num text-code-num transition-colors ${
            esperan ? "bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed-dim" : "text-outline hover:bg-surface-container-high"
          }`}
        >
          <span className="ms text-[14px]">notifications</span>
          {esperan}
        </button>
      </td>
      <td className="px-3 py-1.5 text-center">
        <label className="relative inline-flex cursor-pointer">
          <input type="checkbox" name={`activo_${p.id}`} checked={activo} onChange={(e) => setActivo(e.target.checked)} className="peer sr-only" aria-label={`${p.nombre} en la web`} />
          <span className="inline-flex h-5 w-9 items-center rounded-full bg-surface-dim p-0.5 transition-colors peer-checked:bg-tertiary peer-focus-visible:ring-2 peer-focus-visible:ring-secondary">
            <span className={`h-4 w-4 rounded-full bg-surface-container-lowest transition-transform ${activo ? "translate-x-4" : ""}`} />
          </span>
        </label>
      </td>
    </tr>
  );
}

/** Tabla editable del catálogo (diseño de Stitch). El botón "Guardar cambios" del encabezado envía este formulario. */
export function TablaCatalogo({ productos }: { productos: ProductoCatalogo[] }) {
  const [estado, enviar, pendiente] = useActionState(guardarCatalogo, null);
  const [editando, setEditando] = useState<string | null>(null);
  const [viendoEspera, setViendoEspera] = useState<string | null>(null);
  const cerrarEdicion = useCallback(() => setEditando(null), []);
  const editado = productos.find((p) => p.id === editando);
  const enEspera = productos.find((p) => p.id === viendoEspera);

  return (
    <>
    <form
      id="catalogo"
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm"
    >
      <datalist id="etiquetas">
        {SUGERIDAS.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <div className="flex flex-col justify-between gap-2 bg-surface-container-low px-4 py-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="font-headline-md text-headline-md uppercase text-primary">Catálogo</span>
          <span className="rounded-full bg-surface-dim px-2 py-0.5 font-label-sm text-label-sm uppercase text-on-surface-variant">{productos.length} productos</span>
        </div>
        <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-outline">
          <span className="ms text-[16px]">language</span>
          <span>Lo que guardes se ve en la web</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-surface-container-high/60 font-label-sm text-label-sm uppercase tracking-wider text-outline">
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Tipo / Colección</th>
              <th className="px-3 py-2">Precio actual</th>
              <th className="px-3 py-2" title="Si lo completás, la web muestra el precio tachado y el % de descuento">
                Anterior / Promo
              </th>
              <th className="px-3 py-2">Etiqueta comercial</th>
              <th className="px-3 py-2 text-center">Stock</th>
              <th className="px-3 py-2 text-center" title="Personas que pidieron que les avisemos cuando vuelva">
                Esperan
              </th>
              <th className="px-3 py-2 text-center">En web</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-variant/40 font-body-md text-body-md text-on-surface">
            {productos.map((p) => (
              <Fila key={p.id} p={p} onEditar={() => setEditando(p.id)} onEspera={() => setViendoEspera(p.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col justify-between gap-2 bg-surface-container px-4 py-2 font-label-sm text-label-sm text-outline sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="ms text-[16px] text-tertiary">check_circle</span>
          <span>
            Mostrando {productos.length} de {productos.length} productos · el precio &quot;anterior&quot; tiene que ser uno que de verdad cobraron
          </span>
        </div>
        <div className="flex items-center gap-3">
          {pendiente ? <span>Guardando…</span> : <Mensaje estado={estado} />}
        </div>
      </div>
    </form>
    {editado && (
      <EditarProducto
        p={{ id: editado.id, nombre: editado.nombre, tipo: editado.tipo, diseno: editado.diseno, verbo: editado.verbo, descripcion: editado.descripcion, foto_url: editado.foto_url }}
        onCerrar={cerrarEdicion}
      />
    )}
    {enEspera && <ListaEspera producto={enEspera.nombre} lista={enEspera.espera} onCerrar={() => setViendoEspera(null)} />}
    </>
  );
}
