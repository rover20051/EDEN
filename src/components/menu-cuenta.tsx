"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cerrarSesion, guardarFotoPerfil } from "@/app/admin/actions";
import { achicar } from "@/app/admin/productos/foto";
import { useToast } from "@/components/toasts";
import { MAX_FOTO_BYTES, TIPOS_FOTO } from "@/lib/fotos";

const LADO_FOTO = 512;
const opcion =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left font-body-md text-body-sm text-on-surface transition-colors hover:bg-surface-container-high/60 disabled:opacity-50";

/** Avatar del encabezado: al tocarlo se abre el menú con la foto y cerrar sesión. */
export function MenuCuenta({ nombre, email, foto }: { nombre: string; email: string; foto: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const caja = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (!TIPOS_FOTO.includes(archivo.type)) return toast.error("Tiene que ser JPG, PNG o WebP");
    if (archivo.size > MAX_FOTO_BYTES) return toast.error("La foto pesa más de 5 MB");
    iniciar(async () => {
      const datos = new FormData();
      datos.set("foto", await achicar(archivo, LADO_FOTO).catch(() => archivo));
      const r = await guardarFotoPerfil(datos);
      if (r.ok) {
        toast.ok(r.mensaje);
        setAbierto(false);
      } else toast.error(r.error);
    });
  }

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Tu cuenta, ${nombre}`}
        title={nombre}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary font-headline-md text-[15px] text-on-primary"
      >
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" className="h-full w-full object-cover" />
        ) : (
          nombre[0]?.toUpperCase()
        )}
      </button>

      {abierto && (
        <div
          role="menu"
          aria-label="Tu cuenta"
          className="absolute right-0 top-10 z-50 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-primary/10 bg-surface-container-lowest p-1.5 shadow-[0_16px_40px_-12px_rgba(55,47,42,0.35)]"
        >
          <div className="min-w-0 border-b border-primary/10 px-3 pb-2 pt-1.5">
            <p className="truncate font-body-md text-body-sm font-bold text-primary">{nombre}</p>
            <p className="truncate font-label-sm text-label-sm text-outline">{email}</p>
          </div>
          <div className="pt-1">
            <input ref={input} type="file" accept={TIPOS_FOTO.join(",")} onChange={elegir} className="hidden" aria-label="Elegir foto" />
            <button type="button" role="menuitem" disabled={pendiente} onClick={() => input.current?.click()} className={opcion}>
              <span className="ms text-[18px] text-outline">add_a_photo</span>
              {pendiente ? "Subiendo la foto…" : foto ? "Cambiar foto" : "Agregar foto"}
            </button>
            <form action={cerrarSesion}>
              <button role="menuitem" className={opcion}>
                <span className="ms text-[18px] text-outline">logout</span>
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
