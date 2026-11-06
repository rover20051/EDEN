import Link from "next/link";
import { Accion } from "@/components/accion";
import { Encabezado } from "@/components/stitch";
import { requireAdmin } from "@/lib/auth";
import { PLANTILLAS, VARIABLES, vistaPrevia, type Plantilla, type TextosMail } from "@/lib/mails/plantillas";
import { casillasPrueba, direccionDe } from "@/lib/mails/remitentes";
import { mandarPruebas } from "../acciones";
import { volverAlOriginal } from "./acciones";
import { FormTextos } from "./form";

export const metadata = { title: "Editar mails · Edén" };

/** Textos de los mails automáticos. Montos, alias y seguimiento los completa el sistema: acá no se pueden romper. */
export default async function EditarMails({ searchParams }: PageProps<"/admin/ajustes/mensajes/editar">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const tipo = (typeof sp.tipo === "string" && sp.tipo in PLANTILLAS ? sp.tipo : "pedido_recibido") as Plantilla;
  const [{ data: aj }, { data: fila, error }, { data: cambiados }] = await Promise.all([
    supabase.from("ajustes").select("alias_transferencia, email_contacto, whatsapp_contacto, horas_vencimiento_transferencia").eq("id", 1).maybeSingle(),
    supabase.from("textos_mail").select("asunto, titulo, bajada, nota").eq("tipo", tipo).maybeSingle(),
    supabase.from("textos_mail").select("tipo"),
  ]);
  const contacto = { alias: aj?.alias_transferencia ?? "", email: aj?.email_contacto ?? "", whatsapp: aj?.whatsapp_contacto ?? "", horas: aj?.horas_vencimiento_transferencia ?? 48 };
  const textos = (fila ?? undefined) as TextosMail | undefined;
  const original = vistaPrevia(tipo, contacto);
  const vista = vistaPrevia(tipo, contacto, textos);
  const conCambios = new Set((cambiados ?? []).map((c) => c.tipo as string));
  const chip = (activo: boolean) =>
    `rounded-full px-3 py-1 font-label-md text-label-sm uppercase transition-colors ${activo ? "bg-primary text-surface" : "bg-surface-container-high text-primary hover:bg-surface-variant"}`;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4">
      <Link href="/admin/ajustes/mensajes" className="inline-flex items-center gap-space-xs font-label-md text-label-md uppercase text-on-surface-variant transition-colors hover:text-on-surface">
        <span className="ms text-[18px]">arrow_back</span>
        Mails y avisos
      </Link>
      <Encabezado ceja="Mails automáticos" titulo="Editar textos" bajada="Cambiá lo que dice cada mail. Los montos, el alias y el seguimiento los completa el sistema." />

      {error && <p className="rounded-2xl bg-error-container px-3 py-2 font-body-md text-body-sm text-error">Falta correr la migración <b>0010_cartas_y_textos.sql</b> en Supabase.</p>}

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PLANTILLAS) as Plantilla[]).map((k) => (
          <Link key={k} href={`/admin/ajustes/mensajes/editar?tipo=${k}`} className={chip(k === tipo)}>
            {PLANTILLAS[k]}
            {conCambios.has(k) && " •"}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <article className="flex flex-col gap-3 rounded-2xl bg-surface-container-low p-4 shadow-sm lg:col-span-5">
          <p className="font-caption-italic text-[13px] italic text-outline">
            Sale de <b>{direccionDe(tipo)}</b>. Podés usar {VARIABLES[tipo].map((v) => `{${v}}`).join(" y ")}: se completan solos. Un campo vacío usa el texto original.
          </p>
          <FormTextos
            key={`${tipo}-${JSON.stringify(textos ?? {})}`}
            tipo={tipo}
            valores={{ asunto: textos?.asunto ?? "", titulo: textos?.titulo ?? "", bajada: textos?.bajada ?? "", nota: textos?.nota ?? "" }}
            originales={{ asunto: original.asunto, titulo: original.titulo, bajada: original.bajada }}
          />
          <div className="flex flex-wrap gap-2">
            {casillasPrueba().length > 0 && (
              <Accion accion={mandarPruebas.bind(null, tipo)} variante="secundaria">
                <span className="ms text-[15px]">forward_to_inbox</span>
                <span>Mandarme una prueba</span>
              </Accion>
            )}
            {conCambios.has(tipo) && (
              <Accion accion={volverAlOriginal.bind(null, tipo)} variante="secundaria" confirmar="¿Volver a los textos originales de este mail?">
                Volver al original
              </Accion>
            )}
          </div>
        </article>

        <article className="flex min-w-0 flex-col gap-2 rounded-2xl bg-surface-container-low p-3 shadow-sm lg:col-span-7">
          <span className="px-1 font-label-sm text-label-sm uppercase tracking-wider text-outline">Asunto: {vista.asunto}</span>
          <iframe title="Vista previa del mail" srcDoc={vista.html} sandbox="" className="h-[720px] w-full rounded-2xl bg-white" />
        </article>
      </div>
    </div>
  );
}
