import Link from "next/link";
import { Accion } from "@/components/accion";
import { Encabezado, Indicador } from "@/components/stitch";
import { requireAdmin } from "@/lib/auth";
import { cartasConfiguradas } from "@/lib/cartas";
import { fecha, fechaHora } from "@/lib/format";
import { mailCarta } from "@/lib/mails/plantillas";
import { casillasPrueba, direccionDe } from "@/lib/mails/remitentes";
import { actualizarBajas, borrarCarta, enviarCarta, probarCarta } from "./acciones";
import { FormCarta } from "./form-carta";

export const metadata = { title: "Cartas · Edén" };

type Carta = { id: string; asunto: string; titulo: string; cuerpo: string; estado: "borrador" | "enviando" | "enviada"; destinatarios: number | null; enviada_at: string | null; created_at: string };
type Suscriptor = { email: string; created_at: string; baja_at: string | null };

const ETIQUETA = {
  borrador: "bg-surface-container-high text-outline",
  enviando: "bg-secondary-fixed text-secondary",
  enviada: "bg-tertiary-fixed text-tertiary",
} as const;

export default async function Cartas({ searchParams }: PageProps<"/admin/cartas">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const [{ data: dCartas, error }, { data: dSuscriptores }] = await Promise.all([
    supabase.from("cartas").select("id, asunto, titulo, cuerpo, estado, destinatarios, enviada_at, created_at").order("created_at", { ascending: false }),
    supabase.from("suscriptores").select("email, created_at, baja_at").order("created_at", { ascending: false }).limit(5000),
  ]);
  const cartas = (dCartas ?? []) as Carta[];
  const suscriptores = (dSuscriptores ?? []) as Suscriptor[];
  const activos = suscriptores.filter((s) => !s.baja_at);
  const abierta = typeof sp.carta === "string" ? (cartas.find((c) => c.id === sp.carta) ?? null) : null;
  const editable = abierta?.estado === "borrador" ? abierta : null;
  const vista = abierta ? mailCarta(abierta, "#") : null;
  const tarjeta = "flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4 shadow-sm";
  const rotulo = "font-label-sm text-label-sm uppercase tracking-wider text-outline";

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <Encabezado ceja="Para quienes se suscribieron" titulo="Cartas del jardín" bajada={`Salen desde ${direccionDe("carta")}, con su link para darse de baja. No consumen el límite diario de los mails de pedidos.`}>
        <Link href="/admin/cartas" className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 font-label-md text-label-md uppercase tracking-wider text-surface">
          <span className="ms text-[16px]">edit</span>
          Nueva carta
        </Link>
      </Encabezado>

      {error && <p className="rounded-2xl bg-error-container px-3 py-2 font-body-md text-body-sm text-error">Falta correr la migración <b>0010_cartas_y_textos.sql</b> en Supabase.</p>}
      {!cartasConfiguradas() && <p className="rounded-2xl bg-error-container px-3 py-2 font-body-md text-body-sm text-error">Faltan RESEND_API_KEY_CARTAS y RESEND_SEGMENTO_CARTAS para poder enviar.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Indicador titulo="Suscriptores" icono="group" valor={activos.length} nota="Hasta 1.000 es gratis en Resend" />
        <Indicador titulo="Bajas" icono="person_off" valor={suscriptores.length - activos.length} nota="Se actualizan al enviar" />
        <Indicador titulo="Cartas enviadas" icono="drafts" valor={cartas.filter((c) => c.estado === "enviada").length} nota={`${cartas.filter((c) => c.estado === "borrador").length} en borrador`} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          {abierta && abierta.estado !== "borrador" ? (
            <article className={tarjeta}>
              <span className={rotulo}>Enviada</span>
              <p className="font-body-md text-body-md text-primary">{abierta.asunto}</p>
              <p className="font-caption-italic text-[13px] italic text-outline">
                {abierta.enviada_at ? fechaHora(abierta.enviada_at) : "Enviándose…"}
                {abierta.destinatarios != null && ` · ${abierta.destinatarios} personas`}
              </p>
            </article>
          ) : (
            <article className={tarjeta}>
              <span className={rotulo}>{editable ? "Borrador" : "Nueva carta"}</span>
              <FormCarta key={editable?.id ?? "nueva"} carta={editable} />
              {editable && (
                <div className="flex flex-wrap items-center gap-2 border-t border-surface-variant/60 pt-3">
                  {casillasPrueba().length > 0 && (
                    <Accion accion={probarCarta.bind(null, editable.id)} variante="secundaria">
                      <span className="ms text-[15px]">forward_to_inbox</span>
                      <span>Mandarme una prueba</span>
                    </Accion>
                  )}
                  <Accion accion={enviarCarta.bind(null, editable.id)} confirmar={`¿Mandar esta carta a ${activos.length} ${activos.length === 1 ? "persona" : "personas"}? No se puede deshacer.`}>
                    <span className="ms text-[15px]">send</span>
                    <span>Enviar a {activos.length}</span>
                  </Accion>
                  <Accion accion={borrarCarta.bind(null, editable.id)} variante="peligro" confirmar="¿Eliminar este borrador?">
                    Eliminar
                  </Accion>
                </div>
              )}
            </article>
          )}

          <article className={tarjeta}>
            <span className={rotulo}>Cartas</span>
            {cartas.length === 0 ? (
              <p className="py-4 text-center font-caption-italic text-[13px] italic text-outline">Todavía no escribiste ninguna.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {cartas.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/cartas?carta=${c.id}`} className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2 shadow-sm transition-colors ${abierta?.id === c.id ? "bg-surface-container-high" : "bg-surface-container-lowest hover:bg-surface-container"}`}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-body-sm text-[13px] font-medium text-primary">{c.asunto}</span>
                        <span className="font-caption-italic text-[11px] italic text-outline">{fecha(c.enviada_at ?? c.created_at)}{c.destinatarios != null && ` · ${c.destinatarios} personas`}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 font-label-sm text-[10px] uppercase ${ETIQUETA[c.estado]}`}>{c.estado}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className={tarjeta}>
            <div className="flex items-center justify-between gap-2">
              <span className={rotulo}>Suscriptores</span>
              <Accion accion={actualizarBajas} variante="secundaria" className="!px-2 !py-0.5 !text-[10px]">
                Actualizar bajas
              </Accion>
            </div>
            {suscriptores.length === 0 ? (
              <p className="py-4 text-center font-caption-italic text-[13px] italic text-outline">Aparecen acá cuando se anotan en la web.</p>
            ) : (
              <ul className="flex max-h-72 flex-col overflow-y-auto">
                {suscriptores.slice(0, 200).map((s) => (
                  <li key={s.email} className="flex items-center justify-between gap-2 border-b border-surface-variant/50 py-1.5">
                    <span className={`truncate font-body-sm text-[13px] ${s.baja_at ? "text-outline line-through" : "text-primary"}`}>{s.email}</span>
                    <span className="shrink-0 font-label-sm text-[11px] text-outline">{s.baja_at ? "Baja" : fecha(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>

        <article className="flex min-w-0 flex-col gap-2 rounded-2xl bg-surface-container-low p-3 shadow-sm lg:sticky lg:top-20 lg:col-span-7">
          {vista ? (
            <>
              <span className="px-1 font-label-sm text-label-sm uppercase tracking-wider text-outline">Asunto: {vista.asunto}</span>
              <iframe title="Vista previa de la carta" srcDoc={vista.html} sandbox="" className="h-[720px] w-full rounded-2xl bg-white" />
            </>
          ) : (
            <p className="py-20 text-center font-caption-italic text-caption-italic italic text-outline">Guardá el borrador para ver cómo queda.</p>
          )}
        </article>
      </div>
    </div>
  );
}
