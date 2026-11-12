import Link from "next/link";
import { Accion } from "@/components/accion";
import { Encabezado } from "@/components/stitch";
import { requireAdmin } from "@/lib/auth";
import { fechaHora } from "@/lib/format";
import { configMensajeria, htmlAviso } from "@/lib/mails/envio";
import { PLANTILLAS, vistaPrevia, type Plantilla } from "@/lib/mails/plantillas";
import { casillasPrueba, direccionDe } from "@/lib/mails/remitentes";
import { ejemplosAvisos } from "@/lib/mensajes";
import { mandarPruebas } from "./acciones";

export const metadata = { title: "Mails y avisos · Edén" };

const TIPOS: Record<string, string> = {
  pedido_recibido: "Pedido recibido",
  cupon_efectivo: "Cupón en efectivo",
  reserva_vencida: "Venció la reserva",
  pago_confirmado: "Pago confirmado",
  en_camino: "En camino",
  lista_espera: "Lista de espera",
  aviso_pedido: "Aviso: pedido nuevo",
  aviso_pago: "Aviso: pago",
  aviso_salida: "Aviso: salida sin cobro",
};

const ESTADO: Record<string, { label: string; clase: string }> = {
  simulado: { label: "Simulado", clase: "bg-secondary-fixed/60 text-secondary" },
  enviado: { label: "Enviado", clase: "bg-tertiary-fixed text-tertiary" },
  error: { label: "Error", clase: "bg-error-container text-error" },
};

type Fila = {
  id: string;
  pedido_id: string | null;
  canal: "mail" | "telegram";
  tipo: string;
  para: string;
  asunto: string | null;
  cuerpo: string;
  estado: string;
  error: string | null;
  created_at: string;
};

const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function Estado({ ok, titulo, detalle, icono }: { ok: boolean; titulo: string; detalle: React.ReactNode; icono: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-container-low p-3 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ok ? "bg-tertiary-fixed text-tertiary" : "bg-secondary-fixed/60 text-secondary"}`}>
        <span className="ms text-[18px]">{icono}</span>
      </span>
      <div className="min-w-0">
        <div className="font-body-md text-body-sm font-bold text-primary">{titulo}</div>
        <div className="font-caption-italic text-[13px] italic leading-snug text-on-surface-variant">{detalle}</div>
      </div>
    </div>
  );
}

export default async function Mensajes({ searchParams }: PageProps<"/admin/ajustes/mensajes">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const canal = sp.canal === "cliente" || sp.canal === "aviso" ? sp.canal : null;
  const verId = typeof sp.ver === "string" ? sp.ver : null;
  const celular = sp.ancho === "cel";
  const plantillaPedida = typeof sp.plantilla === "string" ? sp.plantilla : null;

  let consulta = supabase
    .from("mensajes")
    .select("id, pedido_id, canal, tipo, para, asunto, cuerpo, estado, error, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (canal === "aviso") consulta = consulta.like("tipo", "aviso_%");
  if (canal === "cliente") consulta = consulta.not("tipo", "like", "aviso_%");
  const [{ data, error }, { data: aj }, avisos, { data: cuentas }, { data: dispositivos }] = await Promise.all([
    consulta,
    supabase.from("ajustes").select("alias_transferencia, email_contacto, whatsapp_contacto, horas_vencimiento_transferencia").eq("id", 1).maybeSingle(),
    ejemplosAvisos(),
    supabase.from("admins").select("email").order("nombre"),
    supabase.from("suscripciones_push").select("admin_email"),
  ]);
  const filas = (data ?? []) as Fila[];
  const admins = (cuentas ?? []).map((a) => a.email as string);
  const sinTabla = Boolean(error);
  const cfg = configMensajeria();
  const casillas = casillasPrueba();
  const conPush = [...new Set((dispositivos ?? []).map((d) => d.admin_email as string))];
  const contacto = {
    alias: aj?.alias_transferencia ?? "",
    email: aj?.email_contacto ?? "",
    whatsapp: aj?.whatsapp_contacto ?? "",
    horas: aj?.horas_vencimiento_transferencia ?? 48,
  };

  // Qué se muestra a la derecha: un mensaje del registro, una plantilla o un aviso de ejemplo.
  const elegido = verId ? filas.find((f) => f.id === verId) : undefined;
  const aviso = avisos.find((a) => a.tipo === plantillaPedida);
  const plantilla: Plantilla | null =
    !elegido && !aviso ? (plantillaPedida && plantillaPedida in PLANTILLAS ? (plantillaPedida as Plantilla) : "pedido_recibido") : null;
  const vista = elegido
    ? { titulo: elegido.asunto ?? TIPOS[elegido.tipo] ?? elegido.tipo, html: elegido.canal === "mail" ? elegido.cuerpo : htmlAviso(elegido.cuerpo), fila: elegido }
    : aviso
      ? { titulo: aviso.titulo, html: htmlAviso(aviso.texto), fila: null }
      : (() => {
          const m = vistaPrevia(plantilla!, contacto);
          return { titulo: m.asunto, html: m.html, fila: null };
        })();
  const esMail = true;

  const href = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base = { canal, ancho: celular ? "cel" : null, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/ajustes/mensajes${s ? `?${s}` : ""}`;
  };
  const seleccion = { ver: verId, plantilla: plantillaPedida };

  const chip = (activo: boolean) =>
    `shrink-0 rounded-full px-3 py-1 font-label-md text-label-sm uppercase transition-colors ${
      activo ? "bg-primary text-surface" : "bg-surface-container-high text-primary hover:bg-surface-variant"
    }`;

  const faltaMail = [
    !cfg.mails.resend && "RESEND_API_KEY (la clave de Resend)",
    !cfg.mails.dominio && "MAIL_DOMINIO (el dominio verificado en Resend)",
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4">
      <Link
        href="/admin/ajustes"
        className="inline-flex items-center gap-space-xs font-label-md text-label-md uppercase text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <span className="ms text-[18px]">arrow_back</span>
        Ajustes
      </Link>
      <Encabezado ceja="Lo que el sistema manda solo" titulo="Mails y avisos" bajada="Mails al cliente y avisos de venta por mail a las cuentas del back office. Todo queda registrado acá." />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Estado
          ok={cfg.mails.modo === "real" && faltaMail.length === 0}
          icono="outgoing_mail"
          titulo={cfg.mails.modo === "real" ? (faltaMail.length ? "Mails: modo real, mal configurado" : "Mails: modo real") : "Mails: modo prueba (no se manda nada a clientes)"}
          detalle={
            cfg.mails.modo === "real" ? (
              faltaMail.length ? (
                <>Falta {faltaMail.join(" y ")}. Mientras tanto los mails quedan con error.</>
              ) : (
                <>Los mails salen de verdad a cada cliente, cada uno desde su remitente.</>
              )
            ) : (
              <>
                Se arman y quedan registrados como “simulado”.
                {cfg.mails.copiaPrueba ? ` Además llega una copia a ${casillas.join(" y ")}.` : ""} Para activarlos: verificar el dominio en Resend y
                poner MAILS_MODO=real{faltaMail.length ? `, ${faltaMail.join(" y ")}` : ""} en Vercel.
              </>
            )
          }
        />
        <Estado
          ok={cfg.avisos.resend || conPush.length > 0}
          icono="notifications_active"
          titulo={conPush.length ? `Avisos de venta: push en ${conPush.length} de ${admins.length} cuentas` : cfg.avisos.resend ? "Avisos de venta: por mail" : "Avisos de venta: modo prueba"}
          detalle={
            conPush.length ? (
              <>Notificación en {conPush.join(", ")}. Si no le llega a una cuenta, va por mail. Se activa desde la campanita, en cada dispositivo.</>
            ) : cfg.avisos.resend ? (
              <>Cada venta, pago y salida sin cobro manda un mail a {(cfg.mails.modo === "prueba" && casillas.length ? casillas : admins).join(", ")}. Para recibirlos como notificación, activalos desde la campanita.</>
            ) : (
              <>
                Se arman para {admins.join(", ") || "las cuentas del back office"} y quedan como “simulado”. Para que lleguen: cargar RESEND_API_KEY. Sin dominio
                verificado, Resend solo entrega a la casilla dueña de la cuenta.
              </>
            )
          }
        />
      </div>

      <article className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Remitentes y pruebas ·{" "}
              <Link href="/admin/ajustes/mensajes/editar" className="underline underline-offset-4 hover:text-primary">
                Editar textos
              </Link>
            </h2>
            <p className="font-caption-italic text-caption-italic italic text-outline">
              {casillas.length ? `Las pruebas van a ${casillas.join(" y ")}. Nunca le llegan a un cliente.` : "Cargá MAIL_PRUEBA_A para mandar pruebas."}
            </p>
          </div>
          {cfg.mails.copiaPrueba && (
            <Accion accion={mandarPruebas.bind(null, "todas")} variante="secundaria" confirmar={`¿Mandar los ${(Object.keys(PLANTILLAS).length + avisos.length) * casillas.length} mails de prueba?`}>
              <span className="ms text-[15px]">forward_to_inbox</span>
              <span>Mandar todas las pruebas</span>
            </Accion>
          )}
        </div>
        <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Object.entries(PLANTILLAS), ...avisos.map((a) => [a.tipo, a.titulo] as const)].map(([tipo, titulo]) => (
            <li key={tipo} className="flex items-center justify-between gap-2 border-b border-surface-variant/50 py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-body-sm text-[13px] text-primary">{titulo}</span>
                <span className="truncate font-code-num text-[11px] text-outline">{direccionDe(tipo)}</span>
              </span>
              {cfg.mails.copiaPrueba && (
                <Accion accion={mandarPruebas.bind(null, tipo)} variante="secundaria" className="!px-2 !py-0.5 !text-[10px]">
                  Probar
                </Accion>
              )}
            </li>
          ))}
        </ul>
      </article>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <article className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4 shadow-sm">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Vista previa con datos de ejemplo</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PLANTILLAS) as Plantilla[]).map((k) => (
                <Link key={k} href={`${href({ plantilla: k })}#vista`} className={chip(!elegido && plantilla === k)}>
                  {PLANTILLAS[k]}
                </Link>
              ))}
              {avisos.map((a) => (
                <Link key={a.tipo} href={`${href({ plantilla: a.tipo })}#vista`} className={chip(!elegido && aviso?.tipo === a.tipo)}>
                  <span className="ms mr-1 align-[-3px] text-[14px]">notifications</span>
                  {a.titulo.replace("Aviso: ", "")}
                </Link>
              ))}
            </div>
          </article>

          <article className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Registro · últimos 100</span>
              <div className="flex gap-1.5">
                <Link href={href({ ...seleccion, canal: null })} className={chip(!canal)}>
                  Todo
                </Link>
                <Link href={href({ ...seleccion, canal: "cliente" })} className={chip(canal === "cliente")}>
                  Al cliente
                </Link>
                <Link href={href({ ...seleccion, canal: "aviso" })} className={chip(canal === "aviso")}>
                  Avisos
                </Link>
              </div>
            </div>
            {sinTabla ? (
              <p className="rounded-2xl bg-error-container px-3 py-2 font-body-md text-body-sm text-error">
                Falta correr la migración <b>0006_tienda_completa.sql</b> en Supabase: ahí se crea el registro de mensajes.
              </p>
            ) : filas.length === 0 ? (
              <p className="rounded-2xl bg-surface-container px-3 py-6 text-center font-caption-italic text-caption-italic italic text-outline">
                Todavía no salió nada{canal ? " por este canal" : ""}. Cuando entre un pedido, aparece acá.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {filas.map((f) => {
                  const e = ESTADO[f.estado] ?? ESTADO.simulado;
                  const activo = elegido?.id === f.id;
                  return (
                    <li key={f.id}>
                      <Link
                        href={`${href({ ver: f.id })}#vista`}
                        className={`flex items-start gap-2.5 rounded-2xl p-2.5 shadow-sm transition-colors ${activo ? "bg-surface-container-high ring-1 ring-secondary" : "bg-surface-container-lowest hover:bg-surface-container-high/40"}`}
                      >
                        <span className="ms mt-0.5 shrink-0 text-[18px] text-outline">{f.tipo.startsWith("aviso_") ? "notifications" : "mail"}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-body-md text-body-sm font-bold text-primary">{TIPOS[f.tipo] ?? f.tipo}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 font-label-sm text-[10px] uppercase ${e.clase}`}>{e.label}</span>
                          </span>
                          <span className="truncate font-body-md text-[13px] text-on-surface-variant">{f.asunto ?? sinEtiquetas(f.cuerpo).split("\n")[0]}</span>
                          <span className="flex items-center justify-between gap-2 font-label-sm text-label-sm text-outline">
                            <span className="truncate">{f.para}</span>
                            <span className="shrink-0">{fechaHora(f.created_at)}</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </div>

        <article id="vista" className="flex min-w-0 scroll-mt-20 flex-col gap-2 rounded-2xl bg-surface-container-low p-3 shadow-sm lg:sticky lg:top-20 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-2 px-1">
            <div className="min-w-0">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                {vista.fila ? `${vista.fila.tipo.startsWith("aviso_") ? "Aviso" : "Mail"} · ${fechaHora(vista.fila.created_at)}` : "Vista previa · datos de ejemplo"}
              </span>
              <h2 className="truncate font-headline-md text-headline-md text-primary">{vista.titulo}</h2>
              {vista.fila && (
                <p className="flex flex-wrap items-center gap-x-3 font-label-sm text-label-sm text-on-surface-variant">
                  <span className="truncate">Para: {vista.fila.para}</span>
                  {vista.fila.pedido_id && (
                    <Link href={`/admin/pedidos/${vista.fila.pedido_id}`} className="underline decoration-primary/30 underline-offset-4 hover:text-primary">
                      Ver pedido
                    </Link>
                  )}
                </p>
              )}
            </div>
            {esMail && (
              <div className="flex shrink-0 gap-1.5">
                <Link href={`${href({ ...seleccion, ancho: null })}#vista`} className={chip(!celular)} aria-label="Ver a ancho de computadora">
                  <span className="ms align-[-3px] text-[15px]">computer</span>
                </Link>
                <Link href={`${href({ ...seleccion, ancho: "cel" })}#vista`} className={chip(celular)} aria-label="Ver a ancho de celular">
                  <span className="ms align-[-3px] text-[15px]">smartphone</span>
                </Link>
              </div>
            )}
          </div>
          {vista.fila?.error && <p className="rounded-2xl bg-error-container px-3 py-2 font-body-md text-[13px] text-error">{vista.fila.error}</p>}
          {vista.fila?.estado === "simulado" && (
            <p className="rounded-2xl bg-surface-container px-3 py-2 font-caption-italic text-[13px] italic text-on-surface-variant">
              Simulado: {vista.fila.tipo.startsWith("aviso_") ? "falta RESEND_API_KEY para que el aviso llegue." : "no se le mandó al cliente (modo prueba)."}
            </p>
          )}
          <div className={`mx-auto w-full overflow-hidden rounded-2xl bg-surface shadow-inner ${esMail && celular ? "max-w-[390px]" : ""}`}>
            <iframe
              key={`${vista.titulo}-${celular}`}
              title={vista.titulo}
              srcDoc={vista.html}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className={`block w-full border-0 ${esMail ? "h-[75vh] min-h-[520px]" : "h-64"}`}
            />
          </div>
        </article>
      </div>
    </div>
  );
}
