import { sincronizarPagosMP } from "@/lib/sync-mp";

// Vercel Cron (ver vercel.json) manda CRON_SECRET en el encabezado: nadie más puede dispararlo.
export const maxDuration = 120;

/** Dos veces por día, a las 10 y las 16 hs de Argentina (13 y 19 UTC, que es lo que usa Vercel; Mercado Pago libera a media mañana y a media tarde): pone al día comisión y fecha de acreditación de los cobros por acreditar, y avisa devoluciones y contracargos. */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return new Response("No autorizado", { status: 401 });
  return Response.json(await sincronizarPagosMP("real"));
}
