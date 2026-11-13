import Link from "next/link";
import { cerrarSesion } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { ars } from "@/lib/format";
import { configMensajeria } from "@/lib/mails/envio";
import { PROVINCIAS } from "@/lib/provincias";
import { SOCIOS } from "@/lib/textos";
import { mpConfigurado } from "@/lib/mercadopago";
import { naveConfigurado } from "@/lib/nave";
import { pasarelaElegida } from "@/lib/pagos";
import { EditarAdmin, FormAdmin, FormAjustes, FormPasarela } from "./forms";

const PREVIA = "/admin/ajustes/mensajes?plantilla=";
const MAILS = [
  { titulo: "Recibimos tu pedido", cuando: "Al comprar en la web con transferencia (o cargar uno pendiente con mail).", contenido: "Total, alias, 48 h y a dónde mandar el comprobante.", ejemplo: `${PREVIA}pedido_recibido` },
  { titulo: "Confirmamos tu pago", cuando: "Al confirmar el pago (tarjeta o transferencia).", contenido: "Qué compró y que empieza la preparación.", ejemplo: `${PREVIA}pago_confirmado` },
  { titulo: "Tu pedido está en camino", cuando: "Al cargar la empresa de envío y el número de seguimiento.", contenido: "Empresa, número de seguimiento y link para seguir el pedido.", ejemplo: `${PREVIA}en_camino` },
  { titulo: "Volvió un producto", cuando: "Al cargar una tanda de un producto con lista de espera.", contenido: "Aviso por única vez y link a la tienda.", ejemplo: `${PREVIA}lista_espera` },
  { titulo: "Te devolvimos tu dinero", cuando: "Al registrar una devolución en el pedido.", contenido: "Cuánto se devolvió y cómo le llega.", ejemplo: `${PREVIA}devolucion` },
];

const tarjeta = "flex flex-col gap-3 rounded-2xl bg-surface-container-low p-4 shadow-sm";
const cabecera = (rotulo: string, titulo: string, icono: string, ayuda?: string) => (
  <div className="flex items-start justify-between border-b border-primary/10 pb-2">
    <div>
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{rotulo}</span>
      <h2 className="font-headline-lg text-headline-lg uppercase text-primary">{titulo}</h2>
      {ayuda && <p className="mt-0.5 font-caption-italic text-caption-italic text-body-sm italic text-outline">{ayuda}</p>}
    </div>
    <span className="ms text-[20px] text-outline">{icono}</span>
  </div>
);

export default async function Ajustes() {
  const { supabase } = await requireAdmin();
  const [{ data: ajustes }, { data: admins }, { data: productos }, { data: envios }, barra] = await Promise.all([
    supabase.from("ajustes").select("alias_transferencia, email_contacto, whatsapp_contacto, precio_set").eq("id", 1).single(),
    supabase.from("admins").select("email, nombre, socio").order("nombre"),
    supabase.from("productos").select("tipo, precio").eq("activo", true),
    // Aparte: si la migración 0006 no corrió, estas columnas no existen y no tiene que romper el resto.
    supabase.from("ajustes").select("envio_tarifas, envio_gratis_desde").eq("id", 1).maybeSingle(),
    // Aparte: el aviso de la barra llega con la migración 0012. Sin ella el campo no aparece.
    supabase.from("ajustes").select("aviso_barra").eq("id", 1).maybeSingle(),
  ]);
  const pasarelaActual = await pasarelaElegida(); // null: la migración 0013 todavía no corrió
  const pasarelas = [
    {
      id: "mercadopago" as const,
      nombre: "Mercado Pago",
      detalle: "Tarjeta y efectivo (Rapipago, Pago Fácil) dentro de la web. Comisión según el plazo que elija Nari en su cuenta; el dinero en cuenta no se ofrece.",
      real: mpConfigurado("real"),
      prueba: mpConfigurado("prueba"),
    },
    {
      id: "nave" as const,
      nombre: "Nave",
      detalle: "Tarjeta dentro de la web, con la promo de bienvenida de Nave. No tiene efectivo: si Mercado Pago está listo, el efectivo se ofrece aparte con Mercado Pago.",
      real: naveConfigurado("real"),
      prueba: naveConfigurado("prueba"),
    },
  ];
  const avisoBarra = barra.error ? undefined : ((barra.data?.aviso_barra as string | null) ?? "");
  const cfg = configMensajeria();
  const mailsReales = cfg.mails.modo === "real" && cfg.mails.resend && cfg.mails.dominio;
  const avisosOk = cfg.avisos.resend;
  const conTarifa = Object.keys((envios?.envio_tarifas as Record<string, number> | undefined) ?? {}).length;
  const gratisDesde = (envios?.envio_gratis_desde as number | null | undefined) ?? null;
  const minimo = (t: string) => Math.min(...(productos ?? []).filter((p) => p.tipo === t).map((p) => p.precio));
  const precioSueltos = (productos ?? []).length ? minimo("biblia") + minimo("journal") : 0;
  const avatar: Record<string, string> = { fede: "bg-primary text-surface", nari: "bg-secondary text-surface", mich: "bg-surface-variant text-primary" };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4">
      <header className="flex flex-col justify-between gap-space-sm border-b border-primary/10 pb-2.5 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-space-sm">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-outline">Configuración del back office</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl uppercase tracking-[0.04em] text-primary">Ajustes</h1>
        </div>
        <form action={cerrarSesion} className="flex items-center gap-space-sm">
          <button className="group flex items-center gap-space-xs rounded-full px-3 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high">
            <span className="ms text-[16px] text-outline transition-colors group-hover:text-primary">logout</span>
            <span>Cerrar sesión</span>
          </button>
        </form>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-6">
          <article className={tarjeta}>
            {cabecera("Lo que ve quien compra", "Datos para el cliente", "payments")}
            {ajustes && <FormAjustes a={ajustes} precioSueltos={precioSueltos} avisoBarra={avisoBarra} />}
          </article>

          <article className={tarjeta}>
            {cabecera("Cobro en la web", "Pasarela de tarjeta", "credit_card", "Las credenciales de cada una se cargan en Vercel (ver README). Con el link de prueba se usan siempre las de prueba.")}
            {pasarelaActual ? (
              <FormPasarela actual={pasarelaActual} pasarelas={pasarelas} />
            ) : (
              <p className="font-caption-italic text-caption-italic text-body-sm italic text-on-surface-variant">
                Falta correr la migración 0013 en Supabase. Hasta entonces la tarjeta queda como &ldquo;Muy pronto&rdquo; en la web.
              </p>
            )}
          </article>

          <article className={tarjeta}>
            {cabecera("Permisos", "Quiénes entran", "group", "Acceso solo para el equipo de Edén.")}
            <div className="flex flex-col gap-1.5">
              {(admins ?? []).map((a) => (
                <div key={a.email} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-container-lowest p-2.5 shadow-sm transition-colors hover:bg-surface-container-high/40">
                  <div className="flex min-w-0 items-center gap-space-sm">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-headline-md text-[16px] ${avatar[a.socio] ?? avatar.fede}`}>{a.nombre[0]}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-body-md text-body-sm font-bold text-primary">{a.nombre}</span>
                        <span className="font-code-num text-label-sm text-outline">{a.email}</span>
                      </div>
                      <div className="font-caption-italic text-caption-italic text-body-sm italic text-on-surface-variant">
                        {a.socio === "fede" ? "Socio" : "Socia"}: {SOCIOS[a.socio as keyof typeof SOCIOS]}
                      </div>
                    </div>
                  </div>
                  <EditarAdmin a={a} />
                </div>
              ))}
            </div>
            <FormAdmin />
            <p className="font-caption-italic text-[12px] italic text-outline">
              Después de autorizarla, creale el usuario en Supabase → Authentication → Add user.
            </p>
          </article>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-6">
          <article className={tarjeta}>
            {cabecera("Avisos al cliente", "Mails automáticos", "outgoing_mail", "Se mandan solos según el estado del pedido.")}
            <div className="flex flex-col gap-2.5">
              {MAILS.map((m) => (
                <div key={m.titulo} className="flex flex-col gap-1.5 rounded-2xl bg-surface-container-lowest p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-headline-md text-headline-md text-primary">{m.titulo}</div>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 font-label-sm text-label-sm uppercase ${mailsReales ? "bg-tertiary-fixed text-tertiary" : "bg-secondary-fixed/50 text-secondary"}`}
                    >
                      {mailsReales ? "Activo" : "Modo prueba"}
                    </span>
                  </div>
                  <p className="font-caption-italic text-caption-italic text-body-sm italic text-on-surface-variant">{m.cuando}</p>
                  <div className="flex items-center justify-between border-t border-primary/5 pt-1">
                    <span className="font-label-sm text-label-sm text-tertiary">{m.contenido}</span>
                    {m.ejemplo && (
                      <Link
                        href={m.ejemplo}
                        className="whitespace-nowrap font-label-sm text-label-sm text-on-surface-variant underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
                      >
                        Ver mail
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-container-lowest p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-headline-md text-headline-md text-primary">Avisos de venta (mail)</div>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 font-label-sm text-label-sm uppercase ${avisosOk ? "bg-tertiary-fixed text-tertiary" : "bg-secondary-fixed/50 text-secondary"}`}
                >
                  {avisosOk ? "Activos" : "Modo prueba"}
                </span>
              </div>
              <p className="font-caption-italic text-caption-italic text-body-sm italic text-on-surface-variant">Un mail a cada cuenta del back office por cada pedido nuevo, pago y salida sin cobro.</p>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl bg-surface-container px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-caption-italic text-[13px] italic text-on-surface-variant">
                {mailsReales ? "Los mails salen de verdad a los clientes." : "Modo prueba: se arman y se registran, pero no le llegan al cliente hasta verificar el dominio."}
              </p>
              <Link
                href="/admin/ajustes/mensajes"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-label-md text-label-sm uppercase text-surface transition-colors hover:bg-primary-container"
              >
                <span className="ms text-[15px]">inbox</span>
                Mails y avisos
              </Link>
            </div>
          </article>

          <article className={tarjeta}>
            {cabecera("Lo que paga quien compra", "Envíos", "local_shipping", "Precio por provincia en el checkout de la web.")}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-surface-container-lowest p-2.5 shadow-sm">
                <span className="font-label-sm text-label-sm uppercase text-outline">Con precio</span>
                <div className="font-headline-md text-headline-md text-primary">
                  {conTarifa} <span className="font-label-sm text-label-sm text-outline">de {PROVINCIAS.length}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-surface-container-lowest p-2.5 shadow-sm">
                <span className="font-label-sm text-label-sm uppercase text-outline">Gratis desde</span>
                <div className="font-headline-md text-headline-md text-primary">{gratisDesde ? ars(gratisDesde) : "—"}</div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="font-caption-italic text-[13px] italic text-on-surface-variant">Sin precio = “a coordinar”.</p>
              <Link
                href="/admin/ajustes/envios"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1.5 font-label-md text-label-sm uppercase text-primary transition-colors hover:bg-surface-variant"
              >
                <span className="ms text-[15px]">edit</span>
                Editar envíos
              </Link>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
