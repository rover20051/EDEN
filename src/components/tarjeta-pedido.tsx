import Link from "next/link";
import { AccionesPedido } from "@/components/acciones-pedido";
import { icono, sombraTarjeta } from "@/components/stitch";
import { EstadoBadge } from "@/components/ui";
import { ars, fechaHora, numeroPedido, relativo } from "@/lib/format";
import { fotoDe } from "@/lib/fotos";
import { chipSalida, demorado, esSalida, resumenItems, vencido, type PedidoFila } from "@/lib/pedidos";
import { CANALES, ICONO_CANAL, MEDIOS } from "@/lib/textos";

/** Tarjeta de "Hoy" (diseño de Stitch): número, cliente, productos, canal, reserva y acciones. */
export function TarjetaPedido({ pedido, alias, envioEstimado }: { pedido: PedidoFila; alias: string; envioEstimado: number }) {
  const primero = pedido.items[0]?.producto.nombre ?? "";
  const salida = esSalida(pedido);
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl p-2.5 transition-all hover:bg-surface-container-lowest ${sombraTarjeta} ${
        salida ? "bg-secondary-fixed/25 ring-1 ring-inset ring-secondary/25" : "bg-surface-container-low"
      }`}
    >
      <div className="flex items-center justify-between">
        <Link href={`/admin/pedidos/${pedido.id}`} className="flex items-center gap-space-xs">
          <span className="font-label-sm text-label-sm font-bold tracking-widest text-primary">{numeroPedido(pedido.numero)}</span>
          <span className="text-outline/40">·</span>
          <span className="font-label-sm text-label-sm text-outline">{relativo(pedido.entregado_at ?? pedido.despachado_at ?? pedido.pagado_at ?? pedido.created_at)}</span>
        </Link>
        <EstadoBadge estado={pedido.estado} />
      </div>

      <Link href={`/admin/pedidos/${pedido.id}`} className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoDe(primero)} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-surface-container object-cover" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between gap-1">
            <span className="truncate font-headline-md text-[16px] font-medium leading-tight text-primary">{pedido.cliente.nombre}</span>
            {salida ? (
              <span className="shrink-0 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Sin cobro</span>
            ) : (
              <span className="font-code-num text-[13px] text-primary">{ars(pedido.total)}</span>
            )}
          </div>
          <span className="truncate font-caption-italic text-[13px] italic text-on-surface-variant">{resumenItems(pedido)}</span>
        </div>
      </Link>

      {salida ? (
        <div className="flex items-center gap-1.5 self-start rounded-full bg-secondary-fixed px-2.5 py-0.5 font-label-sm text-[11px] font-bold uppercase tracking-wider text-secondary">
          {icono("volunteer_activism", "text-[14px]")}
          <span>{chipSalida(pedido)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 font-label-sm text-label-sm uppercase text-outline">
          {icono(ICONO_CANAL[pedido.canal] ?? "more_horiz", "text-[13px]")}
          <span>
            {CANALES[pedido.canal as keyof typeof CANALES]} · {MEDIOS[pedido.medio_pago as keyof typeof MEDIOS]}
          </span>
        </div>
      )}

      {pedido.estado === "pendiente_pago" && pedido.vence_at && (
        <div
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-label-sm text-[11px] ${
            vencido(pedido) ? "bg-error-container text-error" : "bg-secondary-fixed/20 text-on-secondary-container"
          }`}
        >
          {icono("alarm", "text-[14px]")}
          <span>{vencido(pedido) ? "Venció la reserva" : `Reservado hasta ${fechaHora(pedido.vence_at)}`}</span>
        </div>
      )}

      {demorado(pedido) && (
        <div className="flex items-center gap-1.5 rounded-lg bg-secondary-fixed/20 px-2 py-1 font-label-sm text-[11px] text-on-secondary-container">
          {icono("schedule", "text-[14px]")}
          <span>Salió hace más de 7 días. ¿Ya llegó?</span>
        </div>
      )}

      {pedido.es_regalo && (
        <div className="flex flex-col gap-0.5 rounded-lg bg-secondary-fixed/30 px-2.5 py-1.5">
          <span className="flex items-center gap-1 font-label-sm text-[11px] font-bold uppercase text-secondary">
            {icono("redeem", "text-[14px]")}
            Regalo{pedido.regalo_para ? ` para ${pedido.regalo_para}` : ""}
          </span>
          {pedido.regalo_mensaje && <span className="font-caption-italic text-[13px] italic text-primary">“{pedido.regalo_mensaje}”</span>}
        </div>
      )}

      {pedido.nota && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container px-2.5 py-1.5">
          <span className="font-label-sm text-[11px] uppercase text-outline">Nota:</span>
          <span className="truncate font-caption-italic text-[13px] font-medium italic text-primary">{pedido.nota}</span>
        </div>
      )}

      <AccionesPedido pedido={pedido} alias={alias} envioEstimado={envioEstimado} />
    </div>
  );
}
