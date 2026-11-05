"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_FOTO_BYTES, TIPOS_FOTO } from "@/lib/fotos";

// Next corta los formularios de más de ~1 MB y la foto se ve en tarjetas chicas: la achicamos en el navegador.
const LADO_MAX = 1600;
const OBJETIVO = 900 * 1024;

async function achicar(archivo: File): Promise<File> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d")?.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();
  const aBlob = (tipo: string, calidad: number) => new Promise<Blob | null>((r) => lienzo.toBlob(r, tipo, calidad));
  // WebP si el navegador lo sabe generar (si no devuelve PNG), si no JPG.
  let tipo = "image/webp";
  let calidad = 0.86;
  let blob = await aBlob(tipo, calidad);
  if (!blob || blob.type !== "image/webp") {
    tipo = "image/jpeg";
    blob = await aBlob(tipo, calidad);
  }
  while (blob && blob.size > OBJETIVO && calidad > 0.5) {
    calidad -= 0.1;
    blob = await aBlob(tipo, calidad);
  }
  if (!blob) throw new Error("No se pudo procesar la foto");
  return new File([blob], `foto.${tipo === "image/webp" ? "webp" : "jpg"}`, { type: tipo });
}

/**
 * Campo de foto con vista previa. Deja en el input "foto" la versión achicada, lista para mandar con el formulario.
 * Con `actual` muestra la foto que ya tiene y permite quitarla (campo "quitar_foto").
 */
export function CampoFoto({ actual, etiqueta = "Foto" }: { actual?: string | null; etiqueta?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [quitar, setQuitar] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (vista && URL.revokeObjectURL(vista)), [vista]);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    setError(null);
    if (!elegido) return setVista(null);
    if (!TIPOS_FOTO.includes(elegido.type)) {
      e.target.value = "";
      return setError("Tiene que ser JPG, PNG o WebP");
    }
    if (elegido.size > MAX_FOTO_BYTES) {
      e.target.value = "";
      return setError("La foto pesa más de 5 MB");
    }
    setEstado("Preparando la foto…");
    try {
      const chica = await achicar(elegido);
      const dt = new DataTransfer();
      dt.items.add(chica);
      if (input.current) input.current.files = dt.files;
      setVista(URL.createObjectURL(chica));
      setQuitar(false);
    } catch {
      // Si el navegador no la puede leer, la mandamos como está (el servidor igual la valida).
      if (elegido.size > OBJETIVO) {
        e.target.value = "";
        setError("No pudimos achicar esta foto: probá con otra o exportala más chica");
      } else setVista(URL.createObjectURL(elegido));
    } finally {
      setEstado(null);
    }
  }

  const mostrada = vista ?? (quitar ? null : actual);

  return (
    <div className="flex flex-col gap-1">
      <span className="font-label-sm text-label-sm uppercase text-outline">{etiqueta}</span>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-container-low shadow-inner">
          {mostrada ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mostrada} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="ms text-[22px] text-outline">add_photo_alternate</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1.5 font-label-md text-label-sm uppercase text-primary transition-all hover:bg-surface-variant focus-within:ring-2 focus-within:ring-secondary">
            <span className="ms text-[16px]">upload</span>
            <span>{mostrada ? "Cambiar foto" : "Subir foto"}</span>
            <input ref={input} type="file" name="foto" accept={TIPOS_FOTO.join(",")} onChange={elegir} className="sr-only" />
          </label>
          {actual && !vista && (
            <label className="inline-flex items-center gap-1.5 font-caption-italic text-caption-italic text-outline">
              <input type="checkbox" name="quitar_foto" checked={quitar} onChange={(e) => setQuitar(e.target.checked)} className="accent-primary" />
              Quitar la foto (la web vuelve a la de siempre)
            </label>
          )}
          <span className="font-caption-italic text-caption-italic text-outline">
            {estado ?? (error ? <span className="text-error">{error}</span> : "JPG, PNG o WebP, hasta 5 MB. Vertical 4:5 queda mejor.")}
          </span>
        </div>
      </div>
    </div>
  );
}
