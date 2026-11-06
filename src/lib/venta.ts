import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Si la tienda vende:
 * - "prueba": quien entró con el link privado (/api/prueba?clave=…), o en la compu de desarrollo con PAGOS_PRUEBA=1. Con tarjeta no se cobra nada.
 * - "abierta": TIENDA_ABIERTA=1. Venta real para todos los demás.
 * - "cerrada": sin TIENDA_ABIERTA en Vercel. Ven la tienda pero no pueden hacer pedidos.
 *
 * Sin configurar nada, la web publicada queda cerrada. Para que el link de prueba deje de funcionar, hay que borrar TIENDA_CLAVE_PRUEBA.
 */
export type EstadoVenta = "abierta" | "prueba" | "cerrada";

export const COOKIE_PRUEBA = "eden-prueba";

const huella = (clave: string) => createHash("sha256").update(clave).digest("hex");

/** Valor de la cookie del modo prueba, o null si este entorno no tiene clave. */
export function valorCookiePrueba() {
  const clave = process.env.TIENDA_CLAVE_PRUEBA;
  return clave ? huella(clave) : null;
}

export function claveCorrecta(recibida: string) {
  const esperada = valorCookiePrueba();
  if (!esperada) return false;
  return timingSafeEqual(Buffer.from(huella(recibida)), Buffer.from(esperada));
}

export async function estadoVenta(): Promise<EstadoVenta> {
  const esperada = valorCookiePrueba();
  const recibida = (await cookies()).get(COOKIE_PRUEBA)?.value;
  if (esperada && recibida?.length === esperada.length && timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada))) return "prueba";
  if (process.env.TIENDA_ABIERTA === "1") return "abierta";
  if (process.env.VERCEL_ENV) return "cerrada";
  return process.env.PAGOS_PRUEBA === "1" ? "prueba" : "abierta";
}
