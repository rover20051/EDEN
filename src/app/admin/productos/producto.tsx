"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Mensaje } from "@/components/accion";
import { claseBoton } from "@/components/estilos";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { CATEGORIA_NUEVA, nombreTipo, type Categoria, type TipoProducto } from "@/lib/categorias";
import { crearProducto, editarProducto } from "./acciones";
import { area, ayuda, campo, campoNum, miles, numero, rotulo } from "./estilo";
import { CampoFoto } from "./foto";

export type ProductoEditable = {
  id: string;
  nombre: string;
  tipo: TipoProducto;
  categoria_nombre: string | null;
  diseno: string;
  verbo: string | null;
  descripcion: string | null;
  frase: string | null;
  medidas: string | null;
  foto_url: string | null;
};

const SUGERIDAS = ["Más vendido", "Oferta imperdible", "Nuevo", "Edición limitada", "Ideal para regalar", "Últimas unidades"];

function Cabecera({ titulo, bajada, onCerrar }: { titulo: string; bajada: string; onCerrar: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-surface-variant/60 px-5 py-3">
      <div className="flex flex-col">
        <h2 className="font-headline-md text-[20px] uppercase tracking-[0.08em] text-primary">{titulo}</h2>
        <p className={ayuda}>{bajada}</p>
      </div>
      <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1 text-outline hover:bg-surface-container-high hover:text-primary">
        <span className="ms text-[20px]">close</span>
      </button>
    </div>
  );
}

/** Textos que la web muestra en la tarjeta: verbo arriba del nombre y la descripción corta. */
function CamposWeb({ verbo, descripcion }: { verbo?: string | null; descripcion?: string | null }) {
  const [desc, setDesc] = useState(descripcion ?? "");
  return (
    <>
      <label className="flex flex-col gap-0.5">
        <span className={rotulo}>Verbo (arriba del nombre)</span>
        <input name="verbo" defaultValue={verbo ?? ""} maxLength={30} placeholder="FLORECER" className={`${campo} uppercase placeholder:normal-case`} />
        <span className={ayuda}>Una palabra, como VOLVER o PERMANECER. Opcional.</span>
      </label>
      <label className="flex flex-col gap-0.5 sm:col-span-2">
        <span className={rotulo}>Descripción corta</span>
        <textarea
          name="descripcion"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Lo que crece despacio, cuando tiene raíz."
          className={area}
        />
        <span className={ayuda}>{desc.length}/300 · en la tarjeta se ven unas dos líneas</span>
      </label>
    </>
  );
}

/** Textos de la ficha de cada Biblia (la página que se abre al tocarla): la frase debajo del nombre y las medidas. */
function CamposFicha({ frase, medidas }: { frase?: string | null; medidas?: string | null }) {
  const [texto, setTexto] = useState(frase ?? "");
  return (
    <>
      <label className="flex flex-col gap-0.5 sm:col-span-2">
        <span className={rotulo}>Frase de la ficha</span>
        <textarea
          name="frase"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Volver al origen es regresar al diseño inicial de Dios…"
          className={area}
        />
        <span className={ayuda}>{texto.length}/600 · va debajo del nombre en la ficha; cada Enter empieza un párrafo. Vacía, se ve la descripción corta.</span>
      </label>
      <label className="flex flex-col gap-0.5 sm:col-span-2">
        <span className={rotulo}>Medidas</span>
        <textarea
          name="medidas"
          defaultValue={medidas ?? ""}
          maxLength={200}
          rows={3}
          placeholder={"23 cm de largo\n15 cm de ancho\n2,3 cm de grosor"}
          className={area}
        />
        <span className={ayuda}>Una por línea. Vacías, la ficha dice “Por confirmar”.</span>
      </label>
    </>
  );
}

function enviarCon(enviar: (f: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    startTransition(() => enviar(datos));
  };
}

/** Botón "Nuevo producto" del encabezado: abre el alta y, al terminar, ofrece cargar su primera tanda. */
export function NuevoProducto({ categorias, puedeCrearCategoria }: { categorias: Categoria[]; puedeCrearCategoria: boolean }) {
  const [categoria, setCategoria] = useState("biblia");
  const esParDelSet = categoria === "biblia" || categoria === "journal";
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(crearProducto, null);
  const [precio, setPrecio] = useState("");
  const [antes, setAntes] = useState("");
  const [creado, setCreado] = useState<{ id: string; nombre: string } | null>(null);
  const nombre = useRef("");
  const toast = useToast();

  useEffect(() => {
    if (estado?.ok && estado.id) {
      toast.ok(estado.mensaje);
      setCreado({ id: estado.id, nombre: nombre.current });
      setPrecio("");
      setAntes("");
    }
  }, [estado, toast]);

  const off = numero(antes) > numero(precio) && numero(precio) ? Math.round((1 - numero(precio) / numero(antes)) * 100) : 0;
  const cerrar = () => {
    setAbierto(false);
    setCreado(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-4 py-1.5 font-label-md text-label-md uppercase tracking-widest text-on-surface shadow-sm transition-all hover:bg-surface-dim"
      >
        <span className="ms text-[16px]">library_add</span>
        <span>Nuevo producto</span>
      </button>
      {abierto && (
        <Modal etiqueta="Nuevo producto" onCerrar={cerrar} alto="arriba" className="max-h-[84vh] max-w-2xl overflow-y-auto">
          <Cabecera titulo={creado ? "Producto creado" : "Nuevo producto"} bajada="Aparece en la web dentro de su categoría" onCerrar={cerrar} />
          {creado ? (
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="ms mt-0.5 text-[22px] text-tertiary">check_circle</span>
                <div className="flex flex-col gap-1">
                  <p className="font-body-md text-body-md text-on-surface">
                    <strong>{creado.nombre}</strong> ya está en el catálogo, con stock 0.
                  </p>
                  <p className={ayuda}>Hasta que cargues su primera tanda la web lo muestra como agotado, con el botón “Avisame cuando vuelva”.</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setCreado(null)} className={`${claseBoton("secundaria")} px-4 py-2`}>
                  Crear otro
                </button>
                <Link href={`/admin/productos?tanda=${creado.id}#tandas`} onClick={cerrar} className={`${claseBoton("primaria")} px-4 py-2`}>
                  <span className="ms text-[16px]">add_box</span>
                  Cargar su primera tanda
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                nombre.current = String(new FormData(e.currentTarget).get("nombre") ?? "").trim();
                enviarCon(enviar)(e);
              }}
              className="flex flex-col gap-3 px-5 py-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-0.5">
                  <span className={rotulo}>Nombre</span>
                  <input name="nombre" required minLength={2} maxLength={60} placeholder="Biblia Jardín" className={campo} data-autofocus />
                </label>
                <div className={`grid gap-2 ${esParDelSet ? "grid-cols-2" : "grid-cols-1"}`}>
                  <label className="flex flex-col gap-0.5">
                    <span className={rotulo}>Categoría</span>
                    <select name="categoria" required value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
                      <option value="biblia">Biblia</option>
                      <option value="journal">Journal</option>
                      {categorias.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.nombre}
                        </option>
                      ))}
                      {puedeCrearCategoria && <option value={CATEGORIA_NUEVA}>+ Nueva categoría…</option>}
                    </select>
                  </label>
                  {esParDelSet && (
                    <label className="flex flex-col gap-0.5">
                      <span className={rotulo}>Diseño</span>
                      <input name="diseno" required maxLength={40} placeholder="Jardín" className={campo} />
                    </label>
                  )}
                  {categoria === CATEGORIA_NUEVA && (
                    <label className="flex flex-col gap-0.5">
                      <span className={rotulo}>Nombre de la categoría</span>
                      <input name="categoria_nueva" required maxLength={40} placeholder="Ej. Separadores" className={campo} autoFocus />
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-0.5">
                    <span className={rotulo}>Precio</span>
                    <input
                      name="precio"
                      required
                      inputMode="numeric"
                      value={precio}
                      onChange={(e) => setPrecio(numero(e.target.value) ? miles(numero(e.target.value)) : "")}
                      placeholder="$75.000"
                      className={campoNum}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className={rotulo}>Precio anterior {off > 0 && <span className="text-tertiary">−{off}%</span>}</span>
                    <input
                      name="precio_anterior"
                      inputMode="numeric"
                      value={antes}
                      onChange={(e) => setAntes(numero(e.target.value) ? miles(numero(e.target.value)) : "")}
                      placeholder="Opcional"
                      className={campoNum}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-0.5">
                  <span className={rotulo}>Etiqueta</span>
                  <input name="etiqueta" list="etiquetas-nuevo" maxLength={30} placeholder="Opcional, ej. Nuevo" className={campo} />
                  <datalist id="etiquetas-nuevo">
                    {SUGERIDAS.map((e) => (
                      <option key={e} value={e} />
                    ))}
                  </datalist>
                </label>
                <CamposWeb />
                {categoria === "biblia" && <CamposFicha />}
                <div className="sm:col-span-2">
                  <CampoFoto />
                </div>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input type="checkbox" name="activo" defaultChecked className="h-4 w-4 accent-primary" />
                  <span className="font-body-sm text-body-sm text-on-surface">Mostrar en la web</span>
                  {esParDelSet && <span className={ayuda}>· con el diseño, la web lo une con su Biblia o Journal para el Set</span>}
                </label>
              </div>
              <div className="flex flex-col-reverse items-stretch justify-between gap-2 border-t border-surface-variant/60 pt-3 sm:flex-row sm:items-center">
                <div className="min-h-5">{!pendiente && estado && !estado.ok && <Mensaje estado={estado} />}</div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={cerrar} className={`${claseBoton("secundaria")} px-4 py-2`}>
                    Cancelar
                  </button>
                  <button disabled={pendiente} className={`${claseBoton("primaria")} px-4 py-2`}>
                    <span className="ms text-[16px]">library_add</span>
                    {pendiente ? "Creando…" : "Crear producto"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

/** Ventana para editar textos y foto de un producto que ya existe. */
export function EditarProducto({ p, onCerrar }: { p: ProductoEditable; onCerrar: () => void }) {
  const [estado, enviar, pendiente] = useActionState(editarProducto, null);
  const toast = useToast();
  useEffect(() => {
    if (!estado?.ok) return;
    toast.ok(estado.mensaje);
    onCerrar();
  }, [estado, onCerrar, toast]);

  return (
    <Modal etiqueta={`Editar ${p.nombre}`} onCerrar={onCerrar} alto="arriba" className="max-h-[84vh] max-w-2xl overflow-y-auto">
      <Cabecera titulo={`Editar ${p.nombre}`} bajada="Textos y foto que se ven en la web. El precio y la etiqueta se cambian en la tabla." onCerrar={onCerrar} />
      <form onSubmit={enviarCon(enviar)} className="flex flex-col gap-3 px-5 py-4">
        <input type="hidden" name="id" value={p.id} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5">
            <span className={rotulo}>Nombre</span>
            <input name="nombre" required minLength={2} maxLength={60} defaultValue={p.nombre} className={campo} data-autofocus />
          </label>
          <div className="flex flex-col gap-0.5">
            <span className={rotulo}>Tipo y diseño</span>
            <span className="flex h-9 items-center rounded-full bg-surface-container px-3 font-body-sm text-body-sm text-on-surface-variant">
              {nombreTipo(p.tipo, p.categoria_nombre)} · {p.diseno}
            </span>
            <span className={ayuda}>No se cambia: la web y el Set usan el diseño para unir Biblia y Journal.</span>
          </div>
          <CamposWeb verbo={p.verbo} descripcion={p.descripcion} />
          {p.tipo === "biblia" && <CamposFicha frase={p.frase} medidas={p.medidas} />}
          <div className="sm:col-span-2">
            <CampoFoto actual={p.foto_url} etiqueta={p.foto_url ? "Foto" : "Foto (hoy usa la de siempre de la web)"} />
          </div>
        </div>
        <div className="flex flex-col-reverse items-stretch justify-between gap-2 border-t border-surface-variant/60 pt-3 sm:flex-row sm:items-center">
          <div className="min-h-5">{!pendiente && estado && !estado.ok && <Mensaje estado={estado} />}</div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className={`${claseBoton("secundaria")} px-4 py-2`}>
              Cancelar
            </button>
            <button disabled={pendiente} className={`${claseBoton("primaria")} px-4 py-2`}>
              <span className="ms text-[16px]">save</span>
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
