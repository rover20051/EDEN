import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PagoTarjeta } from "@/components/pago-tarjeta/pago-tarjeta";
import { clavePublicaMP } from "@/lib/mercadopago";
import { clavePublicaNave } from "@/lib/nave";
import { ars, fechaHora, linkWhatsApp, numeroPedido } from "@/lib/format";
import { entornoPago, modoDelPedido } from "@/lib/pagos";
import { supabaseServidor } from "@/lib/supabase/servidor";
import { Camino } from "./camino";

export const metadata: Metadata = { title: "Tu pedido · Edén", robots: { index: false } };

type Item = { nombre: string; cantidad: number; precio: number; pack?: string | null };
type Publico = {
  numero: number;
  estado: "pendiente_pago" | "pagado" | "en_preparacion" | "despachado" | "entregado" | "cancelado";
  medio_pago: string;
  subtotal: number;
  descuento_set: number;
  descuento?: number;
  cupon?: string | null;
  envio_cobrado: number;
  total: number;
  devuelto?: number;
  created_at: string;
  pagado_at: string | null;
  preparacion_at: string | null;
  despachado_at: string | null;
  entregado_at: string | null;
  vence_at: string | null;
  nombre: string;
  es_regalo?: boolean;
  regalo_para?: string | null;
  items: Item[] | null;
  envio: { empresa: string; seguimiento: string | null } | null;
  alias: string;
  email_contacto: string;
  whatsapp_contacto: string;
};

const ORDEN = ["pendiente_pago", "pagado", "en_preparacion", "despachado", "entregado"] as const;

/** Agrupa las líneas que vinieron de un mismo pack para mostrarlas juntas. */
function agrupar(items: Item[]) {
  const grupos: { pack: string | null; items: Item[] }[] = [];
  for (const i of items) {
    const pack = i.pack ?? null;
    const g = pack ? grupos.find((x) => x.pack === pack) : undefined;
    if (g) g.items.push(i);
    else grupos.push({ pack, items: [i] });
  }
  return grupos;
}

export default async function Seguimiento({ params }: PageProps<"/pedido/[token]">) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const sb = supabaseServidor();
  const [{ data }, { data: ajustes }] = await Promise.all([
    sb.rpc("pedido_publico", { p_token: token }),
    sb.from("ajustes").select("envio_gratis_desde").eq("id", 1).maybeSingle(),
  ]);
  if (!data) notFound();
  const p = data as Publico;
  const { modo, soloEfectivo } = await modoDelPedido(p.medio_pago);
  const entorno = await entornoPago();

  const paso = p.estado === "cancelado" ? -1 : ORDEN.indexOf(p.estado);
  const pasos = [
    { titulo: "Recibido", fecha: p.created_at },
    { titulo: "Pagado", fecha: p.pagado_at },
    { titulo: "Preparando", fecha: p.preparacion_at },
    { titulo: "Enviado", fecha: p.despachado_at },
    { titulo: "Entregado", fecha: p.entregado_at },
  ];
  const pendiente = p.estado === "pendiente_pago";
  const esperandoTransferencia = pendiente && p.medio_pago === "transferencia";
  const esperandoTarjeta = pendiente && (p.medio_pago === "mercadopago" || p.medio_pago === "nave");
  const vencido = Boolean(p.vence_at && new Date(p.vence_at) < new Date());
  const puedePagar = esperandoTarjeta && !vencido && modo !== null;
  const wa = linkWhatsApp(p.whatsapp_contacto, `Hola, les mando el comprobante del pedido ${numeroPedido(p.numero)}.`);
  const waAyuda = linkWhatsApp(p.whatsapp_contacto, `Hola, quiero completar el pago del pedido ${numeroPedido(p.numero)}.`);

  const items = p.items ?? [];
  const grupos = agrupar(items);
  const hayPacks = items.some((i) => i.pack);
  const descuentoCupon = p.descuento ?? 0;
  const gratisDesde = (ajustes?.envio_gratis_desde as number | null | undefined) ?? null;
  const envioGratis = !p.envio_cobrado && gratisDesde !== null && p.subtotal - p.descuento_set - descuentoCupon >= gratisDesde;

  const devuelto = p.devuelto ?? 0;
  const bajada =
    p.estado === "cancelado" && devuelto > 0
      ? `Te devolvimos ${ars(devuelto)}. Si pagaste con tarjeta, tu banco lo acredita según sus tiempos.`
      : p.estado === "cancelado"
      ? "No recibimos el pago a tiempo, así que liberamos las piezas. Si querés, armá el pedido de nuevo o escribinos."
      : esperandoTransferencia
        ? "Tu pedido está reservado. Apenas recibamos el comprobante, empezamos a prepararlo."
        : esperandoTarjeta
          ? vencido
            ? "Pasó el tiempo para pagar, así que las piezas se van a liberar. Si querés, armá el pedido de nuevo o escribinos."
            : "Tu pedido está reservado. Completá el pago y empezamos a prepararlo."
          : "Guardá este link: acá vas a ver cada paso de tu pedido.";

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <p className="font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Pedido {numeroPedido(p.numero)}</p>
        <h1 className="mt-2 text-4xl font-light md:text-5xl">
          {p.estado === "cancelado" ? "Este pedido se canceló" : `Gracias, ${p.nombre}.`}
        </h1>
        <p className="mt-3 max-w-xl italic text-tenue">{bajada}</p>

        {p.estado === "pagado" && (
          <section className="mt-8 flex gap-4 border border-musgo/30 bg-chip-hierba p-5 sm:p-6">
            <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-musgo text-papel">
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            </span>
            <div>
              <h2 className="text-2xl font-light text-musgo">Recibimos tu pago</h2>
              <p className="mt-1">
                {ars(p.total)}
                {p.medio_pago === "mercadopago" ? " con Mercado Pago" : p.medio_pago === "nave" ? " con tarjeta" : p.medio_pago === "transferencia" ? " por transferencia" : ""}
                {p.pagado_at && <span className="italic text-tenue"> · {fechaHora(p.pagado_at)}</span>}
              </p>
              <p className="mt-2 italic text-tenue">Te mandamos la confirmación por mail. Ahora lo preparamos a mano y te avisamos cuando salga.</p>
            </div>
          </section>
        )}

        {esperandoTransferencia && (
          <section className="mt-8 border border-borde bg-nota p-6 shadow-[0_18px_28px_-24px_rgba(44,34,28,.45)]">
            <h2 className="mb-4 font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Datos para transferir</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-base italic text-tenue">Alias</dt>
                <dd className="break-all text-2xl">{p.alias || "Te lo enviamos por mail"}</dd>
              </div>
              <div>
                <dt className="text-base italic text-tenue">Monto</dt>
                <dd className="text-2xl tabular-nums">{ars(p.total)}</dd>
              </div>
            </dl>
            <p className="mt-5">
              Después de transferir, mandanos el comprobante
              {p.email_contacto && (
                <>
                  {" "}a{" "}
                  <a className="break-all underline underline-offset-4" href={`mailto:${p.email_contacto}?subject=Comprobante ${numeroPedido(p.numero)}`}>
                    {p.email_contacto}
                  </a>
                </>
              )}
              {wa && (
                <>
                  {" "}o por{" "}
                  <a className="underline underline-offset-4" href={wa} target="_blank" rel="noopener">
                    WhatsApp
                  </a>
                </>
              )}
              {!p.email_contacto && !wa && " respondiendo el mail que te mandamos"}
              , con el número de pedido <strong className="font-medium">{numeroPedido(p.numero)}</strong>.
            </p>
            {p.vence_at && <p className="mt-3 text-base italic text-tenue">Reservamos tus piezas hasta el {fechaHora(p.vence_at)}.</p>}
          </section>
        )}

        {esperandoTarjeta && !vencido && (
          <section className="mt-8">
            <h2 className="mb-4 text-3xl font-light">Completar el pago</h2>
            {puedePagar && modo ? (
              <>
                <PagoTarjeta
                  token={token}
                  total={p.total}
                  modo={modo}
                  clavePublica={modo === "mercadopago" ? clavePublicaMP(entorno) : modo === "nave" ? clavePublicaNave(entorno) : ""}
                  entorno={entorno}
                  soloEfectivo={soloEfectivo}
                />
                {p.vence_at && (
                  <p className="mt-4 text-base italic text-tenue">Reservamos tus piezas hasta el {fechaHora(p.vence_at)}.</p>
                )}
              </>
            ) : (
              <p className="border border-borde bg-nota p-6">
                El pago con tarjeta o efectivo no está disponible en este momento.
                {waAyuda && (
                  <>
                    {" "}
                    <a className="underline underline-offset-4" href={waAyuda} target="_blank" rel="noopener">
                      Escribinos por WhatsApp
                    </a>{" "}
                    y lo resolvemos juntos.
                  </>
                )}
              </p>
            )}
          </section>
        )}

        {p.estado !== "cancelado" && (
          <Camino
            pasos={pasos}
            actual={paso}
            detalle={
              p.estado === "en_preparacion" ? (
                "Lo armamos a mano, con tiempo."
              ) : paso >= ORDEN.indexOf("despachado") && p.envio ? (
                <>
                  {p.envio.empresa}
                  {p.envio.seguimiento && <> · seguimiento <span className="font-maquina not-italic">{p.envio.seguimiento}</span></>}
                </>
              ) : undefined
            }
          />
        )}
      </div>

      <aside>
        <div className="border border-borde bg-nota p-6">
          <h2 className="mb-4 font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Tu pedido</h2>
          <ul className="flex flex-col gap-3">
            {grupos.map((g, gi) =>
              g.pack ? (
                <li key={`pack-${g.pack}`}>
                  <p>{g.pack}</p>
                  <ul className="mt-1 flex flex-col gap-1 border-l border-borde pl-3 text-base">
                    {g.items.map((i, n) => (
                      <li key={n} className="flex justify-between gap-4 text-tenue">
                        <span className="min-w-0">
                          {i.nombre}
                          {i.cantidad > 1 && <span> × {i.cantidad}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums">{ars(i.precio * i.cantidad)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                g.items.map((i, n) => (
                  <li key={`${gi}-${n}`} className="flex justify-between gap-4">
                    <span className="min-w-0">
                      {i.nombre}
                      {i.cantidad > 1 && <span className="text-tenue"> × {i.cantidad}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums">{ars(i.precio * i.cantidad)}</span>
                  </li>
                ))
              ),
            )}
          </ul>
          <dl className="mt-4 flex flex-col gap-1 border-t border-borde pt-3 text-base">
            {p.descuento_set > 0 && (
              <div className="flex justify-between gap-4 text-musgo">
                <dt>{hayPacks ? "Precio especial de pack y Set" : "Set Biblia + Journal"}</dt>
                <dd className="shrink-0 tabular-nums">−{ars(p.descuento_set)}</dd>
              </div>
            )}
            {descuentoCupon > 0 && (
              <div className="flex justify-between gap-4 text-musgo">
                <dt>{p.cupon ? <>Cupón <span className="font-maquina text-[0.85rem]">{p.cupon}</span></> : "Descuento"}</dt>
                <dd className="shrink-0 tabular-nums">−{ars(descuentoCupon)}</dd>
              </div>
            )}
            <div className="flex justify-between text-tenue">
              <dt>Envío</dt>
              <dd className={p.envio_cobrado ? "tabular-nums" : envioGratis ? "text-musgo" : "italic"}>
                {p.envio_cobrado ? ars(p.envio_cobrado) : envioGratis ? "Gratis" : "a coordinar"}
              </dd>
            </div>
            <div className="mt-1 flex justify-between text-xl">
              <dt>Total</dt>
              <dd className="tabular-nums">{ars(p.total)}</dd>
            </div>
            {devuelto > 0 && (
              <div className="flex justify-between gap-4 text-musgo">
                <dt>Te devolvimos</dt>
                <dd className="shrink-0 tabular-nums">{ars(devuelto)}</dd>
              </div>
            )}
          </dl>
          {p.es_regalo && (
            <p className="mt-4 border-t border-borde pt-3 text-base italic">
              Es un regalo{p.regalo_para ? ` para ${p.regalo_para}` : ""}. Va con tarjeta escrita y sin precios.
            </p>
          )}
        </div>
        <a href="/" className="mt-6 block text-center italic text-tenue underline-offset-4 hover:underline">
          Volver al jardín
        </a>
      </aside>
    </div>
  );
}
