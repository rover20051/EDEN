import "server-only";
import { estadoVenta } from "@/lib/venta";

/**
 * Cómo se cobra con tarjeta para quien está mirando:
 * - "nave": hay credenciales de Nave (NAVE_CLIENT_ID). TODO fase Nave: crear la intención de pago en Nave,
 *   mostrar su checkout embebido dentro de `src/components/pago-tarjeta/` y confirmar con el webhook
 *   (que llama `aprobar_pago_externo(token, id_de_nave)`). Mientras no esté hecho, la tarjeta sigue "Muy pronto".
 * - "prueba": modo prueba de la tienda (ver `estadoVenta`). Formulario de tarjeta simulado: no se cobra nada.
 * - null: no hay forma de cobrar con tarjeta (en el checkout aparece "Muy pronto").
 *
 * El link de prueba sigue funcionando con la tienda abierta, hasta que se borre TIENDA_CLAVE_PRUEBA.
 */
export async function modoPago(): Promise<"nave" | "prueba" | null> {
  if (process.env.NAVE_CLIENT_ID) return "nave";
  return (await estadoVenta()) === "prueba" ? "prueba" : null;
}

/** ¿El cliente puede elegir tarjeta y pagar ahora? Hoy solo en modo prueba; con Nave hecho pasa a ser `modoPago() !== null`. */
export const tarjetaHabilitada = async () => (await modoPago()) === "prueba";
