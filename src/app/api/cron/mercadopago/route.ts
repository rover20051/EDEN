import { sincronizarPagosMP } from "@/lib/sync-mp";

// Vercel Cron (ver vercel.json) manda CRON_SECRET en el encabezado: nadie más puede dispararlo.
export const maxDuration = 120;

/** Una vez por día: pone al día comisión y fecha de acreditación de los cobros por acreditar, y avisa devoluciones y contracargos. */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return new Response("No autorizado", { status: 401 });
  return Response.json(await sincronizarPagosMP("real"));
}
