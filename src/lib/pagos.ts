import "server-only";

/**
 * Cómo se cobra con tarjeta en este entorno:
 * - "nave": hay credenciales de Nave (NAVE_CLIENT_ID). TODO fase Nave: crear la intención de pago en Nave,
 *   mostrar su checkout embebido dentro de `src/components/pago-tarjeta/` y confirmar con el webhook
 *   (que llama `aprobar_pago_externo(token, id_de_nave)`). Mientras no esté hecho, la tarjeta sigue "Muy pronto".
 * - "prueba": PAGOS_PRUEBA=1 fuera de producción. Formulario de tarjeta simulado: no se cobra nada.
 * - null: no hay forma de cobrar con tarjeta (en el checkout aparece "Muy pronto").
 *
 * El modo prueba nunca se activa en la producción de Vercel, aunque alguien deje PAGOS_PRUEBA=1 cargado ahí.
 */
export function modoPago(): "nave" | "prueba" | null {
  if (process.env.NAVE_CLIENT_ID) return "nave";
  if (process.env.PAGOS_PRUEBA === "1" && process.env.VERCEL_ENV !== "production") return "prueba";
  return null;
}

/** ¿El cliente puede elegir tarjeta y pagar ahora? Hoy solo en modo prueba; con Nave hecho pasa a ser `modoPago() !== null`. */
export const tarjetaHabilitada = () => modoPago() === "prueba";
