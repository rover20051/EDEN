import { procesarPagoMP } from "@/lib/cobro-mp";
import { mpConfigurado } from "@/lib/mercadopago";

export const maxDuration = 30;

/**
 * Aviso de Mercado Pago (la notification_url de cada cobro). Llega como webhook (?type=payment&data.id=… y cuerpo JSON)
 * o con el formato viejo (?topic=payment&id=…). Solo importan los pagos; a lo demás se le responde 200 para que no reintente.
 *
 * No se confía en el aviso: con su id se lee el pago en la API de Mercado Pago con la credencial de la tienda
 * (`procesarPagoMP`). Un aviso inventado, a lo sumo, hace releer un pago real de la cuenta.
 * Si algo falla se responde 500 y Mercado Pago reintenta (cada 15 minutos, según su documentación).
 */
export async function POST(req: Request) {
  if (!mpConfigurado()) return new Response("Mercado Pago no está configurado", { status: 503 });
  const url = new URL(req.url);
  let cuerpo: { type?: string; topic?: string; data?: { id?: string | number } } = {};
  try {
    cuerpo = await req.json();
  } catch {}
  const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? cuerpo.type ?? cuerpo.topic ?? "";
  const id =
    url.searchParams.get("data.id") ?? (tipo === "payment" ? url.searchParams.get("id") : null) ?? (cuerpo.data?.id != null ? String(cuerpo.data.id) : null);
  if (tipo !== "payment" || !id) return new Response("ok");
  try {
    const r = await procesarPagoMP(id);
    return Response.json({ estado: r.estado });
  } catch (e) {
    console.error("[mercadopago] aviso", id, e);
    return new Response("Error", { status: 500 });
  }
}
