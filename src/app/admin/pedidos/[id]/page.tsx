import Link from "next/link";
import { notFound } from "next/navigation";
import { AccionesPedido } from "@/components/acciones-pedido";
import { EstadoBadge } from "@/components/ui";
import { fotoDe } from "@/lib/fotos";
import { requireAdmin } from "@/lib/auth";
import { ars, fecha, fechaHora, linkWhatsApp, numeroPedido } from "@/lib/format";
import { chipSalida, esSalida, lineasAgrupadas, type PedidoFila } from "@/lib/pedidos";
import { CANALES, ESTADOS, MEDIOS, MOTIVOS_SALIDA, ORIGENES, QUIEN_SALIDA, type Estado } from "@/lib/textos";

type Asignacion = { cantidad: number; costo_unitario: number; lote: { numero: number; fecha: string } | null };
type Item = PedidoFila["items"][number] & {
  id: string;
  precio_unitario: number;
  costo_unitario: number;
  pack: { nombre: string; precio: number } | null;
  asignaciones: Asignacion[];
};

type Detalle = Omit<PedidoFila, "cliente" | "items" | "pagos"> & {
  subtotal: number;
  descuento: number;
  descuento_set: number;
  descuento_cupon: number;
  cupon: string | null;
  envio_cobrado: number;
  cliente: PedidoFila["cliente"] & { id: string; provincia: string | null; origen: keyof typeof ORIGENES | null };
  items: Item[];
  pagos: (PedidoFila["pagos"][number] & { bruto: number; comision: number; neto: number; acreditacion_esperada: string | null })[];
};

type Evento = { id: number; tipo: string; detalle: { a?: Estado; motivo?: string }; actor: string; created_at: string };

const EVENTOS: Record<string, string> = {
  creado: "Pedido creado",
  comprobante_rechazado: "Comprobante rechazado",
  vencimiento_extendido: "Reserva extendida",
  nave_intencion_creada: "Pago con Nave preparado",
  acreditacion_actualizada: "Cambió la fecha de acreditación",
  devolucion: "Devolución registrada",
};

export default async function DetallePedido({ params }: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const [{ data }, { data: eventos }, { data: ajustes }] = await Promise.all([
    supabase
      .from("pedidos")
      .select(
        `id, numero, estado, tipo, salida_motivo, salida_por, canal, medio_pago, subtotal, descuento, descuento_set, descuento_cupon, cupon,
         envio_cobrado, total, grabado, nota, es_regalo, regalo_para, regalo_mensaje, direccion_envio, vence_at, created_at, pagado_at, despachado_at,
         cliente:clientes!inner(id, nombre, whatsapp, email, provincia, origen),
         items:pedido_items(id, cantidad, precio_unitario, costo_unitario, pack_id, producto:productos(nombre), pack:packs(nombre, precio),
           asignaciones(cantidad, costo_unitario, lote:lotes(numero, fecha))),
         pagos(estado, medio, comprobante_path, bruto, comision, neto, acreditacion_esperada),
         envio:envios(empresa, seguimiento, costo_real)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("eventos").select("id, tipo, detalle, actor, created_at").eq("pedido_id", id).order("created_at"),
    supabase.from("ajustes").select("alias_transferencia, envio_estimado").eq("id", 1).single(),
  ]);
  const { count: pedidosCliente } = data
    ? await supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", (data as unknown as Detalle).cliente.id)
        .neq("estado", "cancelado")
    : { count: 0 };
  if (!data) notFound();
  const p = data as unknown as Detalle;
  const pago = p.pagos.find((g) => g.estado === "aprobado");
  const salida = esSalida(p);
  const { sueltos, packs } = lineasAgrupadas(p.items);
  const costoPiezas = p.items.reduce((s, i) => s + i.cantidad * i.costo_unitario, 0);
  const costoEnvio = p.envio?.costo_real ?? null;
  // Lo que descuentan los packs (precio de lista de sus piezas contra el precio del pack); el resto de descuento_set es el Set.
  const descuentoPacks = packs.reduce((s, g) => {
    const lista = g.items.reduce((n, i) => n + i.cantidad * i.precio_unitario, 0);
    return s + Math.max(0, lista - g.cantidad * (g.items[0]?.pack?.precio ?? lista / Math.max(g.cantidad, 1)));
  }, 0);
  const descuentoManual = Math.max(0, p.descuento - (p.descuento_cupon ?? 0));

  const etiquetaEvento = (e: Evento) => {
    if (e.tipo === "estado" && e.detalle.a) return ESTADOS[e.detalle.a].label;
    if (e.tipo === "acreditacion_actualizada" && e.detalle.motivo) return e.detalle.motivo;
    if (e.tipo === "vencimiento_extendido" && e.detalle.motivo) return `Reserva extendida: ${e.detalle.motivo}`;
    return EVENTOS[e.tipo] ?? e.tipo;
  };
  const seccion = "rounded-2xl bg-surface-container-low p-3.5 shadow-sm";
  const cabecera = "mb-2.5 flex items-center justify-between border-b border-primary/10 pb-1.5";
  const rotulo = "font-label-sm text-label-sm uppercase tracking-[0.12em] text-outline";
  const unidades = p.items.reduce((n, i) => n + i.cantidad, 0);
  const pctComision = pago && pago.bruto ? ((pago.comision / pago.bruto) * 100).toFixed(1).replace(".", ",") : null;
  const dato = (iconoNombre: string, etiqueta: string, valor: React.ReactNode) => (
    <div className="flex items-start gap-3">
      <span className="ms mt-0.5 text-[16px] text-outline">{iconoNombre}</span>
      <span className="w-20 pt-0.5 font-label-sm text-label-sm uppercase tracking-wider text-outline">{etiqueta}</span>
      <div className="min-w-0 font-body-md text-body-sm text-primary">{valor}</div>
    </div>
  );

  return (
    <div className="flex w-full flex-col">
      <div className="mb-2">
        <Link href="/admin/pedidos" className="group inline-flex items-center gap-1 font-caption-italic text-caption-italic italic text-outline transition-colors hover:text-primary">
          <span className="font-headline-md text-headline-md leading-none transition-transform group-hover:-translate-x-0.5">←</span>
          <span>Pedidos</span>
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-space-sm border-b border-primary/10 pb-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-label-lg text-headline-lg font-bold uppercase tracking-[0.1em] text-primary">{numeroPedido(p.numero)}</h1>
          <EstadoBadge estado={p.estado} />
          {salida && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary-fixed px-2.5 py-0.5 font-label-sm text-label-sm font-bold uppercase tracking-widest text-secondary">
              <span className="ms text-[14px]">volunteer_activism</span>
              {chipSalida(p)}
            </span>
          )}
          <span className="font-caption-italic text-caption-italic italic text-outline">
            {salida ? "Salida sin cobro" : CANALES[p.canal as keyof typeof CANALES]} · {fechaHora(p.created_at)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
        <div className="flex flex-col gap-3 lg:col-span-8">
          <section className={seccion}>
            <div className={cabecera}>
              <span className={rotulo}>Datos del cliente</span>
              {(pedidosCliente ?? 0) > 1 && (
                <span className="rounded-full bg-tertiary/10 px-2 py-0.5 font-label-sm text-label-sm uppercase tracking-wider text-tertiary">Cliente frecuente</span>
              )}
            </div>
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-12">
              <div className="md:col-span-5">
                <h2 className="font-headline-xl text-headline-lg font-normal leading-tight text-primary">{p.cliente.nombre}</h2>
                {p.nota && <p className="mt-0.5 font-caption-italic text-caption-italic italic text-outline">&quot;{p.nota}&quot;</p>}
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-7">
                {p.cliente.whatsapp &&
                  dato(
                    "phone",
                    "WhatsApp",
                    <a className="font-code-num text-code-num underline decoration-primary/30 transition-colors hover:text-secondary" href={linkWhatsApp(p.cliente.whatsapp, "") ?? "#"} target="_blank" rel="noopener">
                      {p.cliente.whatsapp}
                    </a>,
                  )}
                {p.cliente.email &&
                  dato(
                    "mail",
                    "Mail",
                    <a className="truncate transition-colors hover:text-secondary" href={`mailto:${p.cliente.email}`}>
                      {p.cliente.email}
                    </a>,
                  )}
                {p.direccion_envio &&
                  dato(
                    "location_on",
                    "Dirección",
                    <>
                      {p.direccion_envio.split(", ")[0]}
                      <br />
                      <span className="font-label-sm text-label-sm uppercase text-outline">{p.direccion_envio.split(", ").slice(1).join(", ")}</span>
                    </>,
                  )}
              </div>
            </div>
            {(p.cliente.origen || pedidosCliente) && (
              <div className="mt-2.5 flex items-center justify-between border-t border-primary/10 pt-1.5 text-outline">
                <div className="flex items-center gap-2">
                  <span className="ms text-[16px]">campaign</span>
                  <span className="font-caption-italic text-body-sm italic">Nos conoció por: {p.cliente.origen ? ORIGENES[p.cliente.origen] : "sin dato"}</span>
                </div>
                <span className="font-label-sm text-label-sm text-outline">{(pedidosCliente ?? 0) > 1 ? `${pedidosCliente} pedidos` : "Primer pedido"}</span>
              </div>
            )}
          </section>

          {p.es_regalo && (
            <section className="flex items-start gap-3 rounded-2xl bg-secondary-fixed/30 p-3.5 shadow-sm">
              <span className="ms mt-0.5 text-[22px] text-secondary">redeem</span>
              <div>
                <span className="font-label-sm text-label-sm font-bold uppercase tracking-[0.12em] text-secondary">
                  Es un regalo{p.regalo_para ? ` para ${p.regalo_para}` : ""}
                </span>
                {p.regalo_mensaje ? (
                  <p className="mt-1 font-headline-md text-[18px] italic text-primary">“{p.regalo_mensaje}”</p>
                ) : (
                  <p className="mt-1 font-caption-italic text-caption-italic italic text-outline">Sin mensaje para la tarjeta.</p>
                )}
                <p className="mt-1 font-caption-italic text-[12px] italic text-outline">Incluir la tarjeta con el mensaje y no poner precios en el paquete.</p>
              </div>
            </section>
          )}

          <section className={seccion}>
            <div className={`${cabecera} mb-2`}>
              <span className={rotulo}>Productos en el pedido</span>
              <span className="font-label-sm text-label-sm text-outline">
                {unidades} {unidades === 1 ? "ARTÍCULO" : "ARTÍCULOS"}
              </span>
            </div>
            <div className="flex flex-col divide-y divide-primary/10">
              {packs.map((g) => (
                <div key={g.id} className="py-2">
                  <div className="flex items-center justify-between gap-space-sm">
                    <div className="flex items-center gap-2">
                      <span className="ms text-[18px] text-secondary">package_2</span>
                      <span className="font-headline-md text-headline-md leading-tight text-primary">{g.nombre}</span>
                      <span className="rounded-full bg-secondary-fixed/60 px-2 py-0.5 font-label-sm text-label-sm uppercase text-secondary">Pack</span>
                    </div>
                    <div className="text-right">
                      {!salida && (
                        <span className="font-code-num text-body-lg font-bold text-primary">{ars(g.items.reduce((n, i) => n + i.cantidad * i.precio_unitario, 0))}</span>
                      )}
                      <span className="block font-label-sm text-label-sm text-outline">
                        {g.cantidad} u.{!salida && g.items[0]?.pack ? ` · pack a ${ars(g.cantidad * g.items[0].pack.precio)}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="ml-3 mt-1 flex flex-col border-l-2 border-secondary/20 pl-3">
                    {g.items.map((i) => (
                      <ItemFila key={i.id} item={i} salida={salida} enPack />
                    ))}
                  </div>
                </div>
              ))}
              {sueltos.map((i) => (
                <ItemFila key={i.id} item={i} salida={salida} />
              ))}
              {!salida && p.descuento_set > 0 && (
                <div className="flex items-center justify-between py-1.5 text-tertiary">
                  <div className="flex items-center gap-2">
                    <span className="ms text-[16px]">loyalty</span>
                    <span className="font-body-md text-body-sm font-medium">
                      {descuentoPacks > 0 && descuentoPacks < p.descuento_set ? "Set y packs" : descuentoPacks > 0 ? "Precio de pack" : "Set (Biblia + Journal)"}
                    </span>
                    <span className="rounded-full bg-tertiary/10 px-2 py-0.5 font-label-sm text-label-sm uppercase">Promoción</span>
                  </div>
                  <span className="font-code-num text-code-num font-bold">−{ars(p.descuento_set)}</span>
                </div>
              )}
              {!salida && p.cupon && (
                <div className="flex items-center justify-between py-1.5 text-tertiary">
                  <div className="flex items-center gap-2">
                    <span className="ms text-[16px]">confirmation_number</span>
                    <span className="font-body-md text-body-sm font-medium">Cupón</span>
                    <Link href="/admin/cupones" className="rounded-full bg-tertiary/10 px-2 py-0.5 font-code-num text-label-sm uppercase hover:bg-tertiary/20">
                      {p.cupon}
                    </Link>
                  </div>
                  <span className="font-code-num text-code-num font-bold">−{ars(p.descuento_cupon)}</span>
                </div>
              )}
              {!salida && descuentoManual > 0 && (
                <div className="flex items-center justify-between py-1.5 text-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <span className="ms text-[16px] text-outline">sell</span>
                    <span className="font-body-md text-body-sm">Descuento</span>
                  </div>
                  <span className="font-code-num text-code-num font-bold">−{ars(descuentoManual)}</span>
                </div>
              )}
              {!salida && (
                <div className="flex items-center justify-between py-1.5 text-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <span className="ms text-[16px] text-outline">local_shipping</span>
                    <span className="font-body-md text-body-sm">{p.envio_cobrado ? "Envío" : "Envío a coordinar"}</span>
                  </div>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{p.envio_cobrado ? ars(p.envio_cobrado) : "A coordinar"}</span>
                </div>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-space-sm border-t border-primary/20 pt-2.5">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{salida ? "Costo para Edén" : "Total del pedido"}</span>
              <span className="font-headline-xl text-headline-xl font-bold text-primary">{salida ? ars(costoPiezas + (costoEnvio ?? 0)) : ars(p.total)}</span>
            </div>
            <p className="mt-1 flex items-center justify-end gap-1 text-right font-caption-italic text-[12px] italic text-outline">
              <span className="ms text-[14px]">inventory</span>
              {salida
                ? `Piezas ${ars(costoPiezas)}${costoEnvio !== null ? ` + envío ${ars(costoEnvio)}` : " · el envío se suma al despachar"}`
                : `Costo real de las piezas: ${ars(costoPiezas)} (de la tanda más vieja con lugar)`}
            </p>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {salida ? (
              <div className={`${seccion} flex flex-col justify-between bg-secondary-fixed/25`}>
                <div>
                  <div className={`${cabecera} mb-2`}>
                    <span className={rotulo}>Salida sin cobro</span>
                    <span className="inline-flex items-center rounded-full bg-secondary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase text-secondary">No se cobra</span>
                  </div>
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <span className="font-headline-md text-headline-md font-bold text-primary">{MOTIVOS_SALIDA[p.salida_motivo ?? "otro"]}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 font-body-sm text-body-sm">
                    <div className="flex justify-between">
                      <span className="text-outline">Lo regala:</span>
                      <span className="font-medium text-primary">{p.salida_por ? QUIEN_SALIDA[p.salida_por] : "Sin dato"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-outline">Costo de las piezas:</span>
                      <span className="font-code-num text-code-num font-bold text-primary">{ars(costoPiezas)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-outline">Envío:</span>
                      <span className="font-code-num text-code-num font-bold text-primary">{costoEnvio !== null ? ars(costoEnvio) : "Al despachar"}</span>
                    </div>
                  </div>
                </div>
                <p className="mt-2 border-t border-primary/10 pt-1.5 font-caption-italic text-[12px] italic text-outline">
                  No suma a ventas ni a por cobrar. En Números → Salidas se ve todo lo regalado.
                </p>
              </div>
            ) : (
            <div className={`${seccion} flex flex-col justify-between`}>
              <div>
                <div className={`${cabecera} mb-2`}>
                  <span className={rotulo}>Detalle de pago</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase ${
                      pago ? "bg-tertiary/10 text-tertiary" : "bg-secondary-fixed/40 text-secondary"
                    }`}
                  >
                    {pago ? "Cobrado" : "Por cobrar"}
                  </span>
                </div>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="font-headline-md text-headline-md font-bold text-primary">{MEDIOS[p.medio_pago as keyof typeof MEDIOS]}</span>
                </div>
                <div className="flex flex-col gap-1.5 font-body-sm text-body-sm">
                  <div className="flex justify-between">
                    <span className="text-outline">{pago ? "Monto cobrado:" : "Monto a cobrar:"}</span>
                    <span className="font-code-num text-code-num font-bold text-primary">{ars(pago?.bruto ?? p.total)}</span>
                  </div>
                  {pago && pago.comision > 0 && (
                    <div className="flex justify-between text-secondary">
                      <span className="font-label-sm text-label-sm uppercase">Comisión ({pctComision}%):</span>
                      <span className="font-code-num text-code-num font-bold">−{ars(pago.comision)}</span>
                    </div>
                  )}
                  {pago && (
                    <div className="flex justify-between border-t border-primary/10 pt-1.5 font-medium">
                      <span className="text-primary">Neto:</span>
                      <span className="font-code-num text-code-num font-bold text-primary">{ars(pago.neto)}</span>
                    </div>
                  )}
                </div>
              </div>
              {pago?.acreditacion_esperada && (
                <div className="mt-2 flex items-center gap-2 border-t border-primary/10 pt-1.5 text-outline">
                  <span className="ms text-[16px]">event_available</span>
                  <span className="font-label-sm text-label-sm">Se acredita el {pago.acreditacion_esperada.split("-").reverse().join("/")}</span>
                </div>
              )}
            </div>

            )}

            <div className={`${seccion} flex flex-col justify-between`}>
              <div>
                <div className={`${cabecera} mb-2`}>
                  <span className={rotulo}>Envío</span>
                  {p.envio && (
                    <span className="inline-flex items-center rounded-full bg-secondary-fixed/40 px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase text-secondary">
                      {p.estado === "entregado" ? "Entregado" : "En camino"}
                    </span>
                  )}
                </div>
                {p.envio ? (
                  <>
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <span className="font-headline-md text-headline-md font-bold text-primary">{p.envio.empresa}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 font-body-sm text-body-sm">
                      <div className="flex justify-between">
                        <span className="text-outline">Seguimiento:</span>
                        <span className="select-all rounded-full bg-surface-container px-2 py-0.5 font-code-num text-code-num font-bold text-primary">{p.envio.seguimiento ?? "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-outline">Costo real del envío:</span>
                        <span className="font-code-num text-code-num font-bold text-primary">{ars(p.envio.costo_real)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="font-caption-italic text-caption-italic italic text-outline">Todavía no salió.</p>
                )}
              </div>
              {p.despachado_at && (
                <div className="mt-2 flex items-center gap-1.5 border-t border-primary/10 pt-1.5 text-outline">
                  <span className="ms text-[16px]">schedule_send</span>
                  <span className="font-label-sm text-label-sm">Despachado el {fechaHora(p.despachado_at)}</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:col-span-4">
          <section className={seccion}>
            <div className={cabecera}>
              <span className={rotulo}>Acciones</span>
              <span className="ms text-[16px] text-outline">tune</span>
            </div>
            {["entregado", "cancelado"].includes(p.estado) ? (
              <p className="font-caption-italic text-caption-italic italic text-outline">Este pedido ya está cerrado.</p>
            ) : (
              <AccionesPedido pedido={p} alias={ajustes?.alias_transferencia ?? ""} envioEstimado={ajustes?.envio_estimado ?? 12000} completo />
            )}
          </section>

          <section className={seccion}>
            <div className={`${cabecera} mb-2`}>
              <span className={rotulo}>Historial</span>
              <span className="font-caption-italic text-caption-italic italic text-outline">{(eventos ?? []).filter((e) => e.tipo !== "nave_intencion").length} registros</span>
            </div>
            <ol className="relative ml-3 flex flex-col gap-2 border-l-2 border-primary/10 py-0.5 pl-3">
              {((eventos ?? []) as Evento[])
                .filter((e) => e.tipo !== "nave_intencion") // registro interno: sirve para ubicar el aviso de Nave, no para leer
                .reverse()
                .map((e, i) => (
                  <li key={e.id} className="flex flex-col">
                    <span className={`absolute -left-[5px] mt-1 h-2 w-2 rounded-full ${i === 0 ? "bg-tertiary" : e.tipo === "estado" && e.detalle.a === "pagado" ? "bg-secondary" : "bg-outline"}`} />
                    <span className={`font-body-sm text-body-sm leading-tight ${i === 0 ? "font-medium text-primary" : "text-on-surface"}`}>{etiquetaEvento(e)}</span>
                    <span className="font-label-sm text-label-sm text-outline">
                      {fechaHora(e.created_at)} · {e.actor === "sistema" ? "Sistema" : e.actor.split("@")[0]}
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Una línea del pedido con la tanda de la que salió cada pieza y su costo real. */
function ItemFila({ item: i, salida, enPack = false }: { item: Item; salida: boolean; enPack?: boolean }) {
  const asignaciones = [...(i.asignaciones ?? [])].sort((a, b) => (a.lote?.numero ?? 0) - (b.lote?.numero ?? 0));
  return (
    <div className={`flex items-center justify-between gap-space-sm ${enPack ? "py-1" : "py-2"}`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-container-highest ${enPack ? "h-8 w-8" : "h-11 w-11"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoDe(i.producto.nombre)} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={`leading-tight text-primary ${enPack ? "font-body-md text-body-sm" : "font-headline-md text-headline-md"}`}>{i.producto.nombre}</span>
          {asignaciones.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {asignaciones.map((a, n) => (
                <span
                  key={n}
                  title={a.lote ? `Tanda ${a.lote.numero} del ${fecha(`${a.lote.fecha}T12:00:00`)}` : undefined}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-container px-1.5 py-px font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant"
                >
                  <span className="ms text-[11px] text-outline">layers</span>
                  Tanda {a.lote?.numero ?? "?"} · {a.cantidad} u. · {ars(a.costo_unitario)} c/u
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {salida ? (
          <>
            <span className="font-code-num text-body-sm font-bold text-primary">{ars(i.cantidad * i.costo_unitario)}</span>
            <span className="block font-label-sm text-label-sm text-outline">{i.cantidad} u. · costo</span>
          </>
        ) : enPack ? (
          <span className="font-label-sm text-label-sm text-outline">{i.cantidad} u.</span>
        ) : (
          <>
            <span className="font-code-num text-body-lg font-bold text-primary">{ars(i.cantidad * i.precio_unitario)}</span>
            <span className="block font-label-sm text-label-sm text-outline">{i.cantidad} u.</span>
          </>
        )}
      </div>
    </div>
  );
}
