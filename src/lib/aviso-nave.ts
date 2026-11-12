import "server-only";
import { procesarPagoNave } from "@/lib/cobro-nave";
import type { EntornoMP as EntornoNave } from "@/lib/mercadopago";
import { naveConfigurado } from "@/lib/nave";

/**
 * Aviso de Nave: un POST con { payment_id, payment_check_url, external_payment_id } cada vez que cambia el estado de un pago.
 * Los pagos del sandbox avisan a /api/nave/prueba y se leen con las credenciales de prueba.
 *
 * El aviso no está firmado: no se confía en él. Con su payment_id se lee el pago en la API de Nave con la credencial de la
 * tienda (`procesarPagoNave`; la `payment_check_url` que trae no se usa). Un aviso inventado, a lo sumo, hace releer un
 * pago real. Si algo falla se responde 500 y Nave reintenta (5 veces, hasta unas 7 horas después).
 */
export async function recibirAvisoNave(req: Request, e: EntornoNave) {
  if (!naveConfigurado(e)) return new Response("Nave no está configurado", { status: 503 });
  let id: unknown;
  try {
    id = ((await req.json()) as { payment_id?: unknown }).payment_id;
  } catch {
    return new Response("ok");
  }
  if (typeof id !== "string" || !id) return new Response("ok");
  try {
    const r = await procesarPagoNave(e, id);
    return Response.json({ estado: r.estado });
  } catch (err) {
    console.error("[nave] aviso", e, id, err);
    return new Response("Error", { status: 500 });
  }
}
