"use client";

import { startTransition, useActionState, useCallback, useEffect, useState } from "react";
import { Accion, Mensaje } from "@/components/accion";
import { claseBoton } from "@/components/estilos";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { ars } from "@/lib/format";
import { fotoProducto } from "@/lib/fotos";
import { borrarPack, guardarPack } from "./acciones";
import { area, ayuda, campo, campoNum, miles, numero, rotulo } from "./estilo";
import { CampoFoto } from "./foto";

export type ProductoPack = { id: string; nombre: string; tipo: "biblia" | "journal"; precio: number; stock: number; activo: boolean; foto_url: string | null };
export type PackAdmin = {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  precio_anterior: number | null;
  etiqueta: string | null;
  foto_url: string | null;
  activo: boolean;
  orden: number;
  items: { producto_id: string; cantidad: number }[];
};

type Items = Record<string, number>;

/** Suma de lista, ahorro y stock que alcanza (mínimo entre sus productos). */
function cuentas(items: Items, productos: ProductoPack[], precio: number) {
  const elegidos = productos.filter((p) => (items[p.id] ?? 0) > 0);
  const lista = elegidos.reduce((s, p) => s + p.precio * items[p.id], 0);
  const stock = elegidos.length ? Math.max(0, Math.min(...elegidos.map((p) => Math.floor(p.stock / items[p.id])))) : 0;
  return { elegidos, lista, ahorro: Math.max(0, lista - precio), caro: precio > 0 && lista > 0 && precio > lista, stock };
}

const fotoPack = (k: PackAdmin, productos: ProductoPack[]) => {
  if (k.foto_url) return k.foto_url;
  const ps = k.items.map((i) => productos.find((p) => p.id === i.producto_id)).filter((p): p is ProductoPack => !!p);
  const base = ps.find((p) => p.tipo === "biblia") ?? ps[0];
  return base ? (base.foto_url ?? fotoProducto(base.nombre)) : fotoProducto("Origen");
};

function Editor({ pack, productos, onCerrar }: { pack: PackAdmin | null; productos: ProductoPack[]; onCerrar: () => void }) {
  const [estado, enviar, pendiente] = useActionState(guardarPack, null);
  const toast = useToast();
  const [items, setItems] = useState<Items>(() => Object.fromEntries((pack?.items ?? []).map((i) => [i.producto_id, i.cantidad])));
  const [precio, setPrecio] = useState(pack ? miles(pack.precio) : "");
  const [antes, setAntes] = useState(pack?.precio_anterior ? miles(pack.precio_anterior) : "");
  const c = cuentas(items, productos, numero(precio));

  useEffect(() => {
    if (!estado?.ok) return;
    toast.ok(estado.mensaje);
    onCerrar();
  }, [estado, onCerrar, toast]);

  const poner = (id: string, n: number) => setItems((x) => ({ ...x, [id]: Math.max(0, Math.min(20, n)) }));

  return (
    <Modal etiqueta={pack ? `Editar ${pack.nombre}` : "Nuevo pack"} onCerrar={onCerrar} alto="arriba" className="max-h-[86vh] max-w-3xl overflow-y-auto">
      <div className="flex items-start justify-between gap-3 border-b border-surface-variant/60 px-5 py-3">
        <div className="flex flex-col">
          <h2 className="font-headline-md text-[20px] uppercase tracking-[0.08em] text-primary">{pack ? `Editar ${pack.nombre}` : "Nuevo pack"}</h2>
          <p className={ayuda}>Precio propio; el stock sale del de sus productos. En la web aparece en la fila “Sets”.</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1 text-outline hover:bg-surface-container-high hover:text-primary">
          <span className="ms text-[20px]">close</span>
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const datos = new FormData(e.currentTarget);
          datos.set("items", JSON.stringify(c.elegidos.map((p) => ({ producto_id: p.id, cantidad: items[p.id] }))));
          startTransition(() => enviar(datos));
        }}
        className="flex flex-col gap-4 px-5 py-4"
      >
        <input type="hidden" name="id" value={pack?.id ?? ""} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5">
            <span className={rotulo}>Nombre</span>
            <input name="nombre" required minLength={2} maxLength={60} defaultValue={pack?.nombre} placeholder="Set Origen" className={campo} data-autofocus />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className={rotulo}>Etiqueta</span>
            <input name="etiqueta" maxLength={30} defaultValue={pack?.etiqueta ?? ""} placeholder="Opcional, ej. Ideal para regalar" className={campo} />
          </label>
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span className={rotulo}>Descripción corta</span>
            <textarea name="descripcion" maxLength={300} rows={2} defaultValue={pack?.descripcion ?? ""} placeholder="La Biblia y su Journal, para empezar juntos." className={area} />
          </label>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={`${rotulo} mb-1`}>Qué incluye</legend>
          <div className="overflow-hidden rounded-2xl bg-surface-container-low">
            <ul className="max-h-64 divide-y divide-surface-variant/40 overflow-y-auto">
              {productos.map((p) => {
                const n = items[p.id] ?? 0;
                return (
                  <li key={p.id} className={`flex items-center justify-between gap-2 px-3 py-1.5 ${n ? "bg-surface-container-lowest" : ""}`}>
                    <div className="flex min-w-0 flex-col">
                      <span className={`truncate font-body-md text-body-md ${n ? "text-primary" : "text-on-surface"}`}>{p.nombre}</span>
                      <span className={ayuda}>
                        {ars(p.precio)} · stock {p.stock}
                        {!p.activo && " · no está en la web"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => poner(p.id, n - 1)} disabled={!n} aria-label={`Uno menos de ${p.nombre}`} className="h-7 w-7 rounded-full bg-surface-container-high text-primary disabled:opacity-40">
                        −
                      </button>
                      <span className="w-6 text-center font-code-num text-code-num text-primary" aria-live="polite">
                        {n}
                      </span>
                      <button type="button" onClick={() => poner(p.id, n + 1)} aria-label={`Uno más de ${p.nombre}`} className="h-7 w-7 rounded-full bg-surface-container-high text-primary">
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-0.5">
            <span className={rotulo}>Precio del pack</span>
            <input
              name="precio"
              required
              inputMode="numeric"
              value={precio}
              onChange={(e) => setPrecio(numero(e.target.value) ? miles(numero(e.target.value)) : "")}
              placeholder="$125.000"
              className={campoNum}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className={rotulo}>Precio anterior</span>
            <input
              name="precio_anterior"
              inputMode="numeric"
              value={antes}
              onChange={(e) => setAntes(numero(e.target.value) ? miles(numero(e.target.value)) : "")}
              placeholder="Opcional"
              className={campoNum}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className={rotulo}>Orden</span>
            <input name="orden" inputMode="numeric" defaultValue={pack?.orden ?? 0} className={campoNum} />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" name="activo" defaultChecked={pack?.activo ?? true} className="h-4 w-4 accent-primary" />
            <span className="font-body-sm text-body-sm text-on-surface">Activo en la web</span>
          </label>
        </div>

        <div className={`flex flex-col gap-1 rounded-2xl px-4 py-2.5 ${c.caro ? "bg-error-container" : "bg-surface-container"}`} aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-label-md text-label-md uppercase text-on-surface-variant">
              Suma de lista <strong className="font-code-num text-code-num text-primary">{ars(c.lista)}</strong>
            </span>
            <span className="font-label-md text-label-md uppercase text-on-surface-variant">
              Ahorro <strong className="font-code-num text-code-num text-tertiary">{ars(c.ahorro)}</strong>
              {c.lista > 0 && c.ahorro > 0 && <span className="text-tertiary"> (−{Math.round((c.ahorro / c.lista) * 100)}%)</span>}
            </span>
            <span className="font-label-md text-label-md uppercase text-on-surface-variant">
              Alcanza para <strong className="font-code-num text-code-num text-primary">{c.stock}</strong>
            </span>
          </div>
          {c.caro && (
            <p className="font-body-sm text-body-sm text-error">
              El precio del pack supera la suma de sus productos: la tienda cobra igual la suma de lista ({ars(c.lista)}). Bajalo o sacá el pack.
            </p>
          )}
          {!c.elegidos.length && <p className={ayuda}>Sumá al menos un producto con el +.</p>}
          {!numero(antes) && c.ahorro > 0 && <p className={ayuda}>Sin precio anterior, la web muestra tachada la suma de lista.</p>}
        </div>

        <CampoFoto actual={pack?.foto_url} etiqueta={pack?.foto_url ? "Foto" : "Foto (si no subís una, la web usa la de la Biblia del pack)"} />

        <div className="flex flex-col-reverse items-stretch justify-between gap-2 border-t border-surface-variant/60 pt-3 sm:flex-row sm:items-center">
          <div className="min-h-5">{!pendiente && estado && !estado.ok && <Mensaje estado={estado} />}</div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className={`${claseBoton("secundaria")} px-4 py-2`}>
              Cancelar
            </button>
            <button disabled={pendiente || !c.elegidos.length} className={`${claseBoton("primaria")} px-4 py-2`}>
              <span className="ms text-[16px]">save</span>
              {pendiente ? "Guardando…" : pack ? "Guardar pack" : "Crear pack"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Sección "Packs": sets con precio propio (ej. Set Origen = Biblia + Journal). */
export function Packs({ packs, productos }: { packs: PackAdmin[]; productos: ProductoPack[] }) {
  const [editando, setEditando] = useState<PackAdmin | "nuevo" | null>(null);
  const cerrar = useCallback(() => setEditando(null), []);
  const nombreDe = (id: string) => productos.find((p) => p.id === id)?.nombre ?? "Producto borrado";

  return (
    <div className="flex scroll-mt-20 flex-col gap-3" id="packs">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-headline-lg text-headline-lg leading-tight tracking-wide text-primary">PACKS</h2>
          <p className="font-label-md text-label-md uppercase tracking-widest text-outline">Sets con precio propio · el stock sale de sus productos</p>
        </div>
        <button type="button" onClick={() => setEditando("nuevo")} className={`${claseBoton("primaria")} self-start px-4 py-1.5 sm:self-auto`}>
          <span className="ms text-[16px]">add_circle</span>
          Nuevo pack
        </button>
      </div>

      {packs.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface-container-lowest px-4 py-6 text-center shadow-sm">
          <span className="ms text-[24px] text-outline">redeem</span>
          <p className="font-body-md text-body-md text-on-surface">Todavía no hay packs.</p>
          <p className={ayuda}>Por ejemplo “Set Origen”: Biblia Origen + Journal Origen a un precio especial.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {packs.map((k) => {
            const c = cuentas(Object.fromEntries(k.items.map((i) => [i.producto_id, i.cantidad])), productos, k.precio);
            const tachado = k.precio_anterior && k.precio_anterior > k.precio ? k.precio_anterior : c.lista > k.precio ? c.lista : null;
            return (
              <article key={k.id} className={`flex gap-3 rounded-2xl bg-surface-container-lowest p-3 shadow-sm ${k.activo ? "" : "opacity-70"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoPack(k, productos)} alt="" className="h-24 w-20 shrink-0 rounded-2xl object-cover shadow-inner" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-headline-md text-headline-md leading-tight text-primary">{k.nombre}</span>
                    {k.etiqueta && <span className="rounded-full bg-secondary-container px-2 py-0.5 font-label-sm text-label-sm uppercase text-on-secondary-container">{k.etiqueta}</span>}
                    {!k.activo && <span className="rounded-full bg-surface-dim px-2 py-0.5 font-label-sm text-label-sm uppercase text-on-surface-variant">Inactivo</span>}
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {k.items.map((i) => `${i.cantidad > 1 ? `${i.cantidad} × ` : ""}${nombreDe(i.producto_id)}`).join(" + ")}
                  </p>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-code-num text-code-num font-bold text-primary">{ars(k.precio)}</span>
                    {tachado && <s className="font-code-num text-code-num text-outline">{ars(tachado)}</s>}
                    {c.ahorro > 0 && <span className="font-label-sm text-label-sm uppercase text-tertiary">Ahorra {ars(c.ahorro)}</span>}
                  </div>
                  {c.caro && <span className="font-caption-italic text-caption-italic text-error">El precio supera la suma de lista</span>}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className={`rounded-full px-2 py-0.5 font-label-sm text-label-sm uppercase ${c.stock ? "bg-surface-container text-on-surface-variant" : "bg-error-container text-error"}`}>
                      {c.stock ? `Alcanza para ${c.stock}` : "Sin stock"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setEditando(k)} className={claseBoton("secundaria")}>
                        <span className="ms text-[14px]">edit</span>
                        Editar
                      </button>
                      <Accion accion={() => borrarPack(k.id)} variante="peligro" confirmar={`¿Borrar ${k.nombre}? Si ya se vendió, queda inactivo.`}>
                        <span className="ms text-[14px]">delete</span>
                        <span className="sr-only">Borrar {k.nombre}</span>
                      </Accion>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editando && <Editor key={editando === "nuevo" ? "nuevo" : editando.id} pack={editando === "nuevo" ? null : editando} productos={productos} onCerrar={cerrar} />}
    </div>
  );
}
