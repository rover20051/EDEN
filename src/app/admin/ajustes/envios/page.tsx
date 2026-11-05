import Link from "next/link";
import { Encabezado } from "@/components/stitch";
import { requireAdmin } from "@/lib/auth";
import { FormEnvios } from "./form";

export const metadata = { title: "Envíos · Edén" };

export default async function Envios() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("ajustes").select("envio_tarifas, envio_gratis_desde").eq("id", 1).maybeSingle();
  const sinMigracion = Boolean(error);

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4">
      <Link
        href="/admin/ajustes"
        className="inline-flex items-center gap-space-xs font-label-md text-label-md uppercase text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <span className="ms text-[18px]">arrow_back</span>
        Ajustes
      </Link>
      <Encabezado ceja="Lo que paga quien compra en la web" titulo="Envíos" bajada="El checkout suma el envío según la provincia que elige el cliente." />

      {sinMigracion && (
        <p className="rounded-2xl bg-error-container px-4 py-3 font-body-md text-body-sm text-error">
          Falta correr la migración <b>0006_tienda_completa.sql</b> en Supabase: hasta entonces no se pueden guardar las tarifas.
        </p>
      )}

      <article className="flex flex-col gap-3 rounded-2xl bg-surface-container-low p-4 shadow-sm">
        <FormEnvios
          tarifas={(data?.envio_tarifas as Record<string, number> | undefined) ?? {}}
          gratisDesde={(data?.envio_gratis_desde as number | null | undefined) ?? null}
          deshabilitado={sinMigracion}
        />
      </article>

      <p className="flex items-start gap-2 rounded-2xl bg-surface-container px-4 py-3 font-caption-italic text-[13px] italic text-on-surface-variant">
        <span className="ms mt-px text-[16px] not-italic text-outline">info</span>
        Por ahora es una tabla por provincia; cuando tengan cuenta en Correo Argentino o Andreani se puede cotizar en vivo.
      </p>
    </div>
  );
}
