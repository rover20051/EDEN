import "server-only";
import { mpConfigurado, type EntornoMP } from "@/lib/mercadopago";
import { naveConfigurado } from "@/lib/nave";
import { supabaseServidor } from "@/lib/supabase/servidor";
import { estadoVenta } from "@/lib/venta";

/**
 * Cómo se cobra con tarjeta (y efectivo) para quien está mirando. La pasarela la elige Ajustes (`ajustes.pasarela`):
 * - "mercadopago": tarjeta y efectivo con Mercado Pago, dentro de la tienda (Checkout Bricks, `src/lib/mercadopago.ts`).
 * - "nave": tarjeta con Nave, dentro de la tienda (checkout embebido, `src/lib/nave.ts`). Nave no tiene efectivo: si
 *   Mercado Pago está configurado, el efectivo se ofrece aparte con Mercado Pago (`efectivoAparte`).
 * - "prueba": con el link de prueba y sin credenciales de prueba de la pasarela elegida. Formulario de tarjeta simulado.
 *   Con el link de prueba nunca se usan las credenciales reales: no se cobra nada.
 * - null: no hay forma de cobrar con tarjeta (en el checkout aparece "Muy pronto").
 *
 * Cada pasarela tiene credenciales reales (para los clientes) y de prueba (solo con el link de prueba): `entornoPago`.
 * El link de prueba sigue funcionando con la tienda abierta, hasta que se borre TIENDA_CLAVE_PRUEBA.
 */
export type Pasarela = "mercadopago" | "nave";
export type ModoPago = Pasarela | "prueba";

export const credencialesListas = (p: Pasarela, e: EntornoMP) => (p === "nave" ? naveConfigurado(e) : mpConfigurado(e));

/** Credenciales para quien está mirando: las de prueba si entró con el link de prueba; si no, las reales. */
export const entornoPago = async (): Promise<EntornoMP> => ((await estadoVenta()) === "prueba" ? "prueba" : "real");

/**
 * Pasarela elegida en Ajustes (migración 0013). Sin la migración, null: la base todavía no acepta pedidos con
 * Mercado Pago, así que la tarjeta queda en "Muy pronto" (la transferencia sigue igual).
 */
export async function pasarelaElegida(): Promise<Pasarela | null> {
  const { data, error } = await supabaseServidor().from("ajustes").select("pasarela").eq("id", 1).maybeSingle();
  if (error) return null;
  return data?.pasarela === "nave" ? "nave" : "mercadopago";
}

export async function modoPago(): Promise<ModoPago | null> {
  const pasarela = await pasarelaElegida();
  if (!pasarela) return null;
  const venta = await estadoVenta();
  if (credencialesListas(pasarela, venta === "prueba" ? "prueba" : "real")) return pasarela;
  return venta === "prueba" ? "prueba" : null;
}

/** Con Nave elegida y Mercado Pago listo, el efectivo se ofrece aparte (Nave no lo tiene). */
export async function efectivoAparte(): Promise<boolean> {
  return (await modoPago()) === "nave" && mpConfigurado(await entornoPago());
}

/**
 * Cómo se muestra el pago de un pedido ya creado, según el medio con que se creó. Un pedido sigue con su medio aunque
 * después se cambie la pasarela (mientras estén sus credenciales). `soloEfectivo`: pedido de Mercado Pago creado desde
 * la opción de efectivo mientras la tarjeta se cobra con Nave.
 */
export async function modoDelPedido(medio: string): Promise<{ modo: ModoPago | null; soloEfectivo: boolean }> {
  const venta = await estadoVenta();
  const e: EntornoMP = venta === "prueba" ? "prueba" : "real";
  const pasarela = await pasarelaElegida();
  if (pasarela && (medio === "mercadopago" || medio === "nave") && credencialesListas(medio, e)) {
    return { modo: medio, soloEfectivo: medio === "mercadopago" && pasarela === "nave" };
  }
  return { modo: pasarela && venta === "prueba" ? "prueba" : null, soloEfectivo: false };
}

/** ¿El cliente puede elegir tarjeta y pagar ahora? */
export const tarjetaHabilitada = async () => (await modoPago()) !== null;
