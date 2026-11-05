import { requireAdmin } from "@/lib/auth";
import { novedadesCampana } from "@/lib/novedades";

// GET común (no server action): las server actions comparten cola con la navegación del /admin,
// y una consulta cada 60 s demoraba los clics del menú mientras esperaba la respuesta.
export async function GET() {
  const { supabase } = await requireAdmin();
  return Response.json(await novedadesCampana(supabase), { headers: { "Cache-Control": "no-store" } });
}
