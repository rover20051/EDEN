import "server-only";
import { mpConfigurado, type EntornoMP } from "@/lib/mercadopago";
import { supabaseServidor } from "@/lib/supabase/servidor";
import { estadoVenta } from "@/lib/venta";

/**
 * Cómo se cobra con tarjeta para quien está mirando:
 * - "mercadopago": la pasarela elegida en Ajustes es Mercado Pago y están sus credenciales para quien mira (`entornoMP`):
 *   las de prueba con el link de prueba, las reales para los clientes. Tarjeta o efectivo dentro de la tienda
 *   (Checkout Bricks, ver `src/lib/mercadopago.ts`).
 * - "prueba": con el link de prueba y sin credenciales de prueba de Mercado Pago. Formulario de tarjeta simulado.
 *   Con el link de prueba nunca se usan las credenciales reales: no se cobra nada.
 * - null: no hay forma de cobrar con tarjeta (en el checkout aparece "Muy pronto").
 *
 * Nave todavía no está conectada: con "nave" elegida en Ajustes, la tarjeta queda como si no hubiera pasarela.
 * El link de prueba sigue funcionando con la tienda abierta, hasta que se borre TIENDA_CLAVE_PRUEBA.
 */
export async function modoPago(): Promise<"mercadopago" | "prueba" | null> {
  const pasarela = await pasarelaElegida();
  if (!pasarela) return null;
  const venta = await estadoVenta();
  if (pasarela === "mercadopago" && mpConfigurado(venta === "prueba" ? "prueba" : "real")) return "mercadopago";
  return venta === "prueba" ? "prueba" : null;
}

/** Credenciales de Mercado Pago para quien está mirando: las de prueba si entró con el link de prueba; si no, las reales. */
export const entornoMP = async (): Promise<EntornoMP> => ((await estadoVenta()) === "prueba" ? "prueba" : "real");

/**
 * Pasarela elegida en Ajustes (migración 0013). Sin la migración, null: la base todavía no acepta pedidos con
 * Mercado Pago, así que la tarjeta queda en "Muy pronto" (la transferencia sigue igual).
 */
async function pasarelaElegida(): Promise<"mercadopago" | "nave" | null> {
  const { data, error } = await supabaseServidor().from("ajustes").select("pasarela").eq("id", 1).maybeSingle();
  if (error) return null;
  return data?.pasarela === "nave" ? "nave" : "mercadopago";
}

/** ¿El cliente puede elegir tarjeta y pagar ahora? */
export const tarjetaHabilitada = async () => (await modoPago()) !== null;
