import Link from "next/link";
import { resolverArrepentimiento } from "@/app/admin/actions";
import { Accion } from "@/components/accion";
import { Encabezado } from "@/components/stitch";
import { requireAdmin } from "@/lib/auth";
import { ars, fechaHora, numeroPedido } from "@/lib/format";

export const metadata = { title: "Devoluciones · Edén" };

type Arrepentimiento = {
  id: string;
  codigo: string;
  nombre: string;
  email: string;
  numero_pedido: string | null;
  motivo: string | null;
  estado: "pendiente" | "resuelto";
  resuelto_por: string | null;
  created_at: string;
  pedido: { id: string; numero: number } | null;
};
type Devolucion = {
  id: string;
  monto: number;
  motivo: string;
  referencia: string | null;
  created_by: string;
  created_at: string;
  pedido: { id: string; numero: number } | null;
};

const seccion = "flex flex-col gap-2 rounded-2xl bg-surface-container-low p-3 shadow-sm";
const titulo = "font-headline-md text-[17px] uppercase tracking-[0.05em] text-primary";
const fila = "rounded-2xl bg-surface-container-lowest p-3 shadow-sm";

const LinkPedido = ({ pedido }: { pedido: { id: string; numero: number } }) => (
  <Link href={`/admin/pedidos/${pedido.id}`} className="underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
    {numeroPedido(pedido.numero)}
  </Link>
);

/** Pedidos de arrepentimiento de la web y devoluciones registradas. */
export default async function Devoluciones() {
  const { supabase } = await requireAdmin();
  const [{ data: pedidos, error }, { data: hechas }] = await Promise.all([
    supabase
      .from("arrepentimientos")
      .select("id, codigo, nombre, email, numero_pedido, motivo, estado, resuelto_por, created_at, pedido:pedidos(id, numero)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("devoluciones").select("id, monto, motivo, referencia, created_by, created_at, pedido:pedidos(id, numero)").order("created_at", { ascending: false }).limit(100),
  ]);
  const lista = (pedidos ?? []) as unknown as Arrepentimiento[];
  const pendientes = lista.filter((a) => a.estado === "pendiente");
  const resueltos = lista.filter((a) => a.estado === "resuelto");
  const devoluciones = (hechas ?? []) as unknown as Devolucion[];

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4">
      <Encabezado ceja="Pedidos" titulo="Devoluciones" bajada="Quienes usaron el botón de arrepentimiento y la plata que ya se devolvió." />
      {error && <p className="rounded-2xl bg-error-container px-3 py-2 font-body-md text-body-sm text-error">Falta correr la migración <b>0011_devoluciones_y_arrepentimiento.sql</b> en Supabase.</p>}

      <section className={seccion}>
        <h2 className={titulo}>Para resolver ({pendientes.length})</h2>
        {pendientes.length === 0 && <p className="font-caption-italic text-caption-italic italic text-outline">No hay pedidos de arrepentimiento pendientes.</p>}
        {pendientes.map((a) => (
          <article key={a.id} className={`${fila} flex flex-col gap-1.5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-code-num text-code-num font-bold text-primary">{a.codigo}</span>
              <span className="font-label-sm text-label-sm text-outline">{fechaHora(a.created_at)}</span>
            </div>
            <p className="font-body-md text-body-sm text-on-surface">
              {a.nombre} · <a href={`mailto:${a.email}?subject=Tu arrepentimiento ${a.codigo}`} className="underline underline-offset-4">{a.email}</a>
            </p>
            <p className="font-body-md text-body-sm text-on-surface-variant">
              {a.pedido ? (
                <>Pedido <LinkPedido pedido={a.pedido} /></>
              ) : (
                <>Sin compras con ese mail{a.numero_pedido ? ` · escribió “${a.numero_pedido}”` : ""}. Revisalo antes de responder.</>
              )}
            </p>
            {a.motivo && <p className="font-caption-italic text-caption-italic italic text-on-surface-variant">{a.motivo}</p>}
            <div className="flex justify-end pt-1">
              <Accion accion={resolverArrepentimiento.bind(null, a.id)} variante="secundaria" confirmar={`¿Ya resolviste ${a.codigo}? La plata se registra aparte, en el pedido.`}>
                Marcar resuelto
              </Accion>
            </div>
          </article>
        ))}
      </section>

      <section className={seccion}>
        <h2 className={titulo}>Plata devuelta</h2>
        {devoluciones.length === 0 && <p className="font-caption-italic text-caption-italic italic text-outline">Todavía no se registró ninguna devolución. Se cargan desde cada pedido.</p>}
        {devoluciones.map((d) => (
          <article key={d.id} className={`${fila} flex flex-wrap items-baseline justify-between gap-2`}>
            <div className="min-w-0">
              <p className="font-body-md text-body-sm text-on-surface">
                {d.pedido && <><LinkPedido pedido={d.pedido} /> · </>}
                {d.motivo}
              </p>
              <p className="font-label-sm text-label-sm text-outline">
                {fechaHora(d.created_at)} · {d.created_by.split("@")[0]}
                {d.referencia ? ` · ${d.referencia}` : ""}
              </p>
            </div>
            <span className="font-code-num text-code-num font-bold text-primary">{ars(d.monto)}</span>
          </article>
        ))}
      </section>

      {resueltos.length > 0 && (
        <section className={seccion}>
          <h2 className={titulo}>Arrepentimientos resueltos</h2>
          {resueltos.map((a) => (
            <p key={a.id} className={`${fila} font-body-md text-body-sm text-on-surface-variant`}>
              <span className="font-code-num text-primary">{a.codigo}</span> · {a.nombre}
              {a.pedido && <> · <LinkPedido pedido={a.pedido} /></>}
              {a.resuelto_por ? ` · ${a.resuelto_por.split("@")[0]}` : ""}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
