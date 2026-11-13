import "server-only";
import { procesarPagoMP } from "@/lib/cobro-mp";
import { acreditacionDe, buscarPago, comisionDe, ErrorMP, mpConfigurado, type EntornoMP } from "@/lib/mercadopago";
import { supabaseServidor } from "@/lib/supabase/servidor";

/**
 * Puesta al día diaria de los cobros de Mercado Pago que todavía no se acreditaron (los que aparecen en "Por acreditar").
 * Al aprobarse un pago se guarda lo que informaba Mercado Pago en ese momento; hasta que se libera puede cambiar:
 * la fecha de liberación (por ejemplo, si Nari cambia el plazo en su cuenta), la comisión o los impuestos, o el pago
 * puede devolverse o tener un contracargo. Acá se vuelve a leer cada uno y se corrige lo que cambió:
 * - comisión y fecha de acreditación del pago (con un registro en el historial del pedido cuando cambia la fecha);
 * - un pago devuelto, en reclamo o con contracargo: aviso a las socias, igual que cuando llega el aviso de Mercado Pago.
 * Los pagos que no son de esta cuenta (los de prueba, leídos con las credenciales reales) se saltean.
 */

export type ResultadoSync = { revisados: number; actualizados: number; avisos: number; ajenos: number; errores: number };

const DIAS_ATRAS = 2; // un par de días después de la fecha de acreditación, por si llegó tarde
const MAXIMO = 200;

type Fila = { id: string; pedido_id: string; id_externo: string; comision: number; bruto: number; acreditacion_esperada: string | null };

export async function sincronizarPagosMP(e: EntornoMP): Promise<ResultadoSync> {
  const r: ResultadoSync = { revisados: 0, actualizados: 0, avisos: 0, ajenos: 0, errores: 0 };
  if (!mpConfigurado(e)) return r;
  const sb = supabaseServidor();
  const desde = new Date(Date.now() - DIAS_ATRAS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("pagos")
    .select("id, pedido_id, id_externo, comision, bruto, acreditacion_esperada")
    .eq("medio", "mercadopago")
    .eq("estado", "aprobado")
    .not("id_externo", "is", null)
    .gte("acreditacion_esperada", desde)
    .order("acreditacion_esperada")
    .limit(MAXIMO);
  if (error) throw new Error(`sincronizarPagosMP: ${error.message}`);

  const filas = ((data ?? []) as Fila[]).filter((f) => /^\d{1,20}$/.test(f.id_externo));
  // De a 5 a la vez: alcanza para el volumen de la tienda sin pasarse del límite de Mercado Pago.
  for (let i = 0; i < filas.length; i += 5) {
    await Promise.all(
      filas.slice(i, i + 5).map(async (f) => {
        r.revisados++;
        try {
          const pago = await buscarPago(e, f.id_externo);
          if (pago.status !== "approved") {
            // Devuelto, en reclamo o con contracargo: el mismo aviso que si hubiera llegado la notificación.
            const antes = await procesarPagoMP(e, f.id_externo);
            if (antes.estado === "revisar") r.avisos++;
            return;
          }
          const comision = comisionDe(pago);
          const fecha = acreditacionDe(pago);
          const cambios: { comision?: number; acreditacion_esperada?: string } = {};
          if (comision !== null && comision !== f.comision) cambios.comision = Math.min(Math.max(comision, 0), f.bruto);
          if (fecha && fecha !== f.acreditacion_esperada) cambios.acreditacion_esperada = fecha;
          if (!Object.keys(cambios).length) return;
          const { error: errUpd } = await sb.from("pagos").update(cambios).eq("id", f.id);
          if (errUpd) throw new Error(errUpd.message);
          r.actualizados++;
          if (cambios.acreditacion_esperada) {
            await sb.from("eventos").insert({
              pedido_id: f.pedido_id,
              tipo: "acreditacion_actualizada",
              detalle: { motivo: `Mercado Pago cambió la fecha de acreditación: ${f.acreditacion_esperada ?? "—"} → ${fecha}`, pago: f.id_externo },
            });
          }
        } catch (err) {
          if (err instanceof ErrorMP && err.status === 404) r.ajenos++;
          else {
            r.errores++;
            console.error("[sync-mp]", f.id_externo, err);
          }
        }
      }),
    );
  }
  return r;
}
