import "server-only";
import { mpConfigurado } from "@/lib/mercadopago";
import { supabaseServidor } from "@/lib/supabase/servidor";
import { estadoVenta } from "@/lib/venta";

/**
 * Cómo se cobra con tarjeta para quien está mirando:
 * - "mercadopago": la pasarela elegida en Ajustes es Mercado Pago y están MP_ACCESS_TOKEN y MP_PUBLIC_KEY.
 *   La tarjeta se carga dentro de la tienda (Checkout Bricks, ver `src/lib/mercadopago.ts`). Con las credenciales
 *   de prueba ("TEST-…") el cobro es simulado, también con el link de prueba.
 * - "prueba": sin pasarela lista, en modo prueba de la tienda (ver `estadoVenta`). Formulario de tarjeta simulado.
 * - null: no hay forma de cobrar con tarjeta (en el checkout aparece "Muy pronto").
 *
 * Nave todavía no está conectada: con "nave" elegida en Ajustes, la tarjeta queda como si no hubiera pasarela.
 * El link de prueba sigue funcionando con la tienda abierta, hasta que se borre TIENDA_CLAVE_PRUEBA.
 */
export async function modoPago(): Promise<"mercadopago" | "prueba" | null> {
  const pasarela = await pasarelaElegida();
  if (!pasarela) return null;
  if (pasarela === "mercadopago" && mpConfigurado()) return "mercadopago";
  return (await estadoVenta()) === "prueba" ? "prueba" : null;
}

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
