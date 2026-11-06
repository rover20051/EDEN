import { notificarReservasVencidas } from "@/lib/mensajes";

// Vercel Cron (ver vercel.json) manda CRON_SECRET en el encabezado: nadie más puede dispararlo.
export const maxDuration = 120;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return new Response("No autorizado", { status: 401 });
  return Response.json({ enviados: await notificarReservasVencidas() });
}
