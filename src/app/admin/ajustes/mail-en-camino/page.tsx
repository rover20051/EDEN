import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ars, numeroPedido } from "@/lib/format";
import { fotoDe } from "@/lib/fotos";

type Muestra = {
  numero: number;
  nombre: string;
  direccion: string | null;
  empresa: string;
  seguimiento: string | null;
  items: { nombre: string; cantidad: number; precio: number }[];
  subtotal: number;
  descuento_set: number;
  envio_cobrado: number;
  total: number;
};

const EJEMPLO: Muestra = {
  numero: 13,
  nombre: "Lucía Gómez",
  direccion: "Av. Coronel Díaz 2145, 4° B, CABA",
  empresa: "Correo Argentino",
  seguimiento: "0012345",
  items: [
    { nombre: "Biblia Origen", cantidad: 1, precio: 75000 },
    { nombre: "Journal Anaj", cantidad: 1, precio: 65000 },
  ],
  subtotal: 140000,
  descuento_set: 20000,
  envio_cobrado: 0,
  total: 120000,
};

/** Vista previa del mail "Tu pedido está en camino" (diseño de Stitch). Usa el último pedido despachado si hay. */
export default async function MailEnCamino() {
  const { supabase } = await requireAdmin();
  const [{ data: ultimo }, { data: ajustes }] = await Promise.all([
    supabase
      .from("pedidos")
      .select(
        "numero, subtotal, descuento_set, envio_cobrado, total, direccion_envio, cliente:clientes(nombre), envio:envios(empresa, seguimiento), items:pedido_items(cantidad, precio_unitario, producto:productos(nombre))",
      )
      .in("estado", ["despachado", "entregado"])
      .order("despachado_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("ajustes").select("email_contacto, whatsapp_contacto").eq("id", 1).single(),
  ]);

  type Fila = {
    numero: number;
    subtotal: number;
    descuento_set: number;
    envio_cobrado: number;
    total: number;
    direccion_envio: string | null;
    cliente: { nombre: string };
    envio: { empresa: string; seguimiento: string | null } | null;
    items: { cantidad: number; precio_unitario: number; producto: { nombre: string } }[];
  };
  const f = ultimo as unknown as Fila | null;
  const m: Muestra = f
    ? {
        numero: f.numero,
        nombre: f.cliente.nombre,
        direccion: f.direccion_envio,
        empresa: f.envio?.empresa ?? "—",
        seguimiento: f.envio?.seguimiento ?? null,
        items: f.items.map((i) => ({ nombre: i.producto.nombre, cantidad: i.cantidad, precio: i.precio_unitario })),
        subtotal: f.subtotal,
        descuento_set: f.descuento_set,
        envio_cobrado: f.envio_cobrado,
        total: f.total,
      }
    : EJEMPLO;
  const nombre = m.nombre.split(" ")[0];
  const piezas = m.items.reduce((n, i) => n + i.cantidad, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col py-space-md">
      <div className="mb-space-lg flex flex-col justify-between gap-space-md rounded-[1.5rem] bg-surface-container px-space-lg py-space-md shadow-sm md:flex-row md:items-center">
        <div className="flex items-center gap-space-md">
          <Link href="/admin/ajustes" className="flex items-center gap-space-xs font-label-md text-label-md uppercase text-on-surface-variant transition-colors hover:text-on-surface">
            <span className="ms text-[18px]">arrow_back</span>
            Volver a Ajustes
          </Link>
          <span className="h-1 w-1 rounded-full bg-outline opacity-40" />
          <span className="rounded-full bg-secondary-container px-space-sm py-[2px] font-label-sm text-label-sm font-bold uppercase tracking-widest text-on-secondary-container">Mail 3 de 3</span>
          <span className="font-body-md text-body-sm font-medium text-on-surface">
            Aviso de despacho · <span className="font-code-num text-code-num text-on-surface-variant">{numeroPedido(m.numero)}</span>
          </span>
        </div>
        <span className="font-caption-italic text-caption-italic italic text-outline">{f ? "Con los datos del último pedido despachado" : "Ejemplo: todavía no hay pedidos despachados"}</span>
      </div>

      <div className="mx-auto w-full max-w-[600px] overflow-hidden rounded-[2rem] bg-surface-container-lowest text-on-surface shadow-xl">
        <div className="relative flex flex-col items-center bg-surface-container-low px-space-xl pb-space-lg pt-space-xl text-center">
          <div className="relative mb-space-md flex h-14 w-14 items-center justify-center rounded-full bg-surface-container shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-secondary">
              <span className="ms text-[22px]">auto_stories</span>
            </div>
            <div className="absolute -inset-1 rounded-full bg-secondary opacity-20" />
          </div>
          <h1 className="font-headline-xl text-headline-xl uppercase leading-none tracking-[0.14em] text-primary">Edén</h1>
          <p className="mt-space-xs font-label-sm text-label-sm uppercase tracking-[0.22em] text-outline">Biblias y journals de cuero</p>
          <div className="my-space-md h-[2px] w-12 bg-surface-variant" />
        </div>

        <div className="flex flex-col gap-space-lg px-space-xl py-space-lg">
          <div className="flex flex-col items-center gap-space-xs text-center">
            <span className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-secondary">Pedido despachado</span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">Tu pedido está en camino, {nombre}.</h2>
            <p className="mt-space-xs max-w-[480px] font-caption-italic text-caption-italic leading-relaxed text-on-surface-variant">
              “Lo preparamos a mano y ya salió hacia vos. Con este número podés seguirlo hasta que llegue.”
            </p>
          </div>

          <div className="relative h-44 w-full overflow-hidden rounded-[2rem] shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoDe(m.items[0]?.nombre ?? "Origen")} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent" />
            <div className="absolute bottom-space-sm left-space-md right-space-md text-surface">
              <span className="font-label-sm text-label-sm uppercase tracking-widest opacity-80">Colección 1</span>
              <p className="font-headline-md text-headline-md leading-none">{m.items.map((i) => i.nombre).join(" + ")}</p>
            </div>
          </div>

          <div className="flex flex-col gap-space-md rounded-[2rem] bg-surface-container-low p-space-lg shadow-sm">
            <div className="flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="ms text-[18px] text-secondary">local_shipping</span>
                <span className="font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface-variant">Pedido {numeroPedido(m.numero)}</span>
              </div>
              <span className="rounded-full bg-secondary-fixed px-space-sm py-[2px] font-label-sm text-label-sm uppercase tracking-widest text-on-secondary-fixed">En tránsito</span>
            </div>
            <div className="grid grid-cols-1 gap-space-md pt-space-xs sm:grid-cols-2">
              <div>
                <p className="font-label-sm text-label-sm uppercase text-outline">Empresa de envío</p>
                <p className="mt-[2px] font-body-md text-body-md font-medium text-on-surface">{m.empresa}</p>
              </div>
              <div>
                <p className="font-label-sm text-label-sm uppercase text-outline">Número de seguimiento</p>
                <p className="mt-[2px] font-code-num text-code-num tracking-widest text-primary">{m.seguimiento ?? "—"}</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-space-sm pt-space-xs">
              <span className="flex w-full items-center justify-center gap-space-xs rounded-full bg-primary-container px-space-lg py-space-sm text-center font-label-md text-label-md uppercase tracking-[0.14em] text-surface shadow-md">
                <span>Seguir mi pedido</span>
                <span className="ms text-[16px]">arrow_forward</span>
              </span>
            </div>
            {m.direccion && (
              <div className="flex items-start gap-space-sm rounded-2xl bg-surface-container p-space-md">
                <span className="ms mt-[1px] text-[20px] text-outline">place</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase text-outline">Dirección de entrega</span>
                  <span className="font-body-md text-body-md font-medium text-on-surface">{m.direccion}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between pb-space-xs">
              <h3 className="font-headline-md text-headline-md text-primary">Resumen de tu pedido</h3>
              <span className="font-label-sm text-label-sm uppercase text-outline">
                {piezas} {piezas === 1 ? "pieza" : "piezas"}
              </span>
            </div>
            {m.items.map((i) => (
              <div key={i.nombre} className="flex items-center justify-between rounded-2xl bg-surface-container-low px-space-md py-space-sm">
                <div className="flex items-center gap-space-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoDe(i.nombre)} alt="" className="h-14 w-12 shrink-0 rounded-2xl object-cover" />
                  <span className="font-body-md text-body-md font-semibold text-on-surface">
                    {i.cantidad}× {i.nombre}
                  </span>
                </div>
                <span className="font-code-num text-code-num text-on-surface">{ars(i.cantidad * i.precio)}</span>
              </div>
            ))}
            <div className="flex flex-col gap-space-xs px-space-md pt-space-xs">
              <div className="flex justify-between text-body-sm text-on-surface-variant">
                <span>Subtotal</span>
                <span className="font-code-num text-code-num">{ars(m.subtotal)}</span>
              </div>
              {m.descuento_set > 0 && (
                <div className="flex justify-between text-body-sm text-secondary">
                  <span>Set Biblia + Journal</span>
                  <span className="font-code-num text-code-num">−{ars(m.descuento_set)}</span>
                </div>
              )}
              <div className="flex justify-between text-body-sm text-on-surface-variant">
                <span>Envío</span>
                <span className="font-label-sm text-label-sm font-bold uppercase text-tertiary">{m.envio_cobrado ? ars(m.envio_cobrado) : "A coordinar"}</span>
              </div>
              <div className="mt-space-xs flex items-baseline justify-between rounded-2xl bg-surface-container px-space-md py-space-sm pt-space-sm">
                <span className="font-headline-md text-headline-md font-bold text-primary">Total</span>
                <span className="font-code-num text-headline-md text-primary">{ars(m.total)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-space-md rounded-[2rem] bg-surface-container-high p-space-md">
            <div className="mt-[2px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
              <span className="ms text-[18px]">spa</span>
            </div>
            <div>
              <h4 className="font-label-md text-label-md font-bold uppercase tracking-wider text-primary">Cuidados del cuero</h4>
              <p className="mt-[2px] font-caption-italic text-caption-italic leading-relaxed text-on-surface-variant">
                Guardala lejos del sol directo y la humedad. Con el uso, el cuero va tomando su propio carácter.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-space-md bg-surface-container px-space-xl py-space-lg text-center">
          <div className="flex flex-col items-center">
            <span className="font-headline-lg text-headline-lg tracking-wide text-primary">“De regreso al Jardín.”</span>
            <span className="my-space-xs h-[1px] w-8 bg-outline opacity-30" />
          </div>
          {(ajustes?.whatsapp_contacto || ajustes?.email_contacto) && (
            <div className="flex flex-wrap items-center justify-center gap-space-md pt-space-xs font-label-md text-label-md text-on-surface-variant">
              {ajustes?.whatsapp_contacto && (
                <span className="flex items-center gap-space-xs rounded-full bg-surface-container-lowest px-space-md py-space-xs shadow-sm">
                  <span className="ms text-[16px] text-tertiary">chat</span>
                  <span>WhatsApp: {ajustes.whatsapp_contacto}</span>
                </span>
              )}
              {ajustes?.email_contacto && (
                <span className="flex items-center gap-space-xs rounded-full bg-surface-container-lowest px-space-md py-space-xs shadow-sm">
                  <span className="ms text-[16px] text-secondary">mail</span>
                  <span>{ajustes.email_contacto}</span>
                </span>
              )}
            </div>
          )}
          <p className="mt-space-xs max-w-[420px] text-center font-body-sm text-body-sm text-outline">Recibiste este mail porque hiciste una compra en Edén.</p>
        </div>
      </div>
    </div>
  );
}
