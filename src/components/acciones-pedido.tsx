import {
  cancelarPedido,
  confirmarPago,
  extenderVencimiento,
  marcarEntregado,
  pasarAPreparacion,
  rechazarComprobante,
} from "@/app/admin/actions";
import { Accion } from "@/components/accion";
import { claseBoton } from "@/components/estilos";
import { FormDespacho } from "@/components/form-despacho";
import { icono } from "@/components/stitch";
import { linkWhatsApp } from "@/lib/format";
import { esSalida, mensajeWhatsApp, tieneComprobante, vencido, type PedidoFila } from "@/lib/pedidos";

/** Los botones que corresponden al estado del pedido. En "Hoy" van compactos; en el detalle, uno debajo del otro. */
export function AccionesPedido({
  pedido,
  alias,
  envioEstimado,
  completo = false,
}: {
  pedido: PedidoFila;
  alias: string;
  envioEstimado: number;
  completo?: boolean;
}) {
  const id = pedido.id;
  const ancho = completo ? "w-full py-2.5" : "";
  const wa = linkWhatsApp(pedido.cliente.whatsapp, mensajeWhatsApp(pedido, alias));
  const whatsapp = wa && (
    <a href={wa} target="_blank" rel="noopener" className={`${claseBoton("secundaria")} ${ancho}`}>
      {icono("chat", "text-[14px]")}
      <span>{completo ? `WhatsApp a ${pedido.cliente.nombre.split(" ")[0]}` : "WhatsApp"}</span>
    </a>
  );

  let principal: React.ReactNode = null;
  switch (pedido.estado) {
    case "pendiente_pago":
      principal = (
        <Accion accion={confirmarPago.bind(null, id)} className={completo ? ancho : "flex-1"}>
          Confirmar pago
        </Accion>
      );
      break;
    case "pagado":
      principal = (
        <>
          <Accion accion={pasarAPreparacion.bind(null, id)} className={`w-full ${completo ? "py-2.5" : ""}`}>
            {icono(completo ? "build" : "hardware", completo ? "text-[16px]" : "text-[15px]")}
            <span>{completo ? "Preparar pedido" : "Preparar"}</span>
          </Accion>
          {completo && <FormDespacho pedidoId={id} envioEstimado={envioEstimado} variante="detalle" />}
        </>
      );
      break;
    case "en_preparacion":
      principal = <FormDespacho pedidoId={id} envioEstimado={envioEstimado} direccion={pedido.direccion_envio} variante={completo ? "detalle" : "remito"} />;
      break;
    case "despachado":
      principal = (
        <Accion accion={marcarEntregado.bind(null, id)} variante="exito" className={`w-full ${completo ? "py-2.5" : ""}`}>
          {icono("task_alt", "text-[15px]")}
          <span>Entregado</span>
        </Accion>
      );
      break;
  }

  // Una venta ya cobrada se cierra registrando la devolución, para que quede cuánta plata volvió.
  const cancelable = pedido.estado === "pendiente_pago" || (["pagado", "en_preparacion"].includes(pedido.estado) && (esSalida(pedido) || pedido.total === 0));
  const extras = (
    <>
      {pedido.estado === "pendiente_pago" && tieneComprobante(pedido) && (
        <Accion accion={rechazarComprobante.bind(null, id)} variante="secundaria" className={ancho}>
          Rechazar comprobante
        </Accion>
      )}
      {vencido(pedido) && (
        <Accion accion={extenderVencimiento.bind(null, id)} variante="secundaria" className={ancho}>
          Reservar 24 h más
        </Accion>
      )}
      {cancelable && (completo || vencido(pedido)) && (
        <Accion
          accion={cancelarPedido.bind(null, id)}
          variante="peligro"
          className={ancho}
          confirmar={
            esSalida(pedido)
              ? "¿Cancelar esta salida sin cobro? Las piezas vuelven al stock y su costo deja de contarse como regalado."
              : "¿Cancelar el pedido? Se libera el stock."
          }
        >
          {icono("cancel", "text-[15px]")}
          <span>{esSalida(pedido) ? "Cancelar salida" : "Cancelar pedido"}</span>
        </Accion>
      )}
    </>
  );

  if (completo) {
    return (
      <div className="flex flex-col gap-space-sm [&>span]:w-full">
        {principal}
        {whatsapp}
        {extras}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-xs">
      {pedido.estado === "pendiente_pago" ? (
        <div className="flex items-center gap-space-xs [&>span:first-child]:flex-1">
          {principal}
          {whatsapp}
        </div>
      ) : (
        principal
      )}
      {pedido.estado !== "pendiente_pago" && whatsapp && <div className="flex justify-end">{whatsapp}</div>}
      {extras}
    </div>
  );
}
