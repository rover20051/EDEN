import { catalogoPublico } from "@/lib/catalogo";

export async function GET() {
  try {
    return Response.json(await catalogoPublico(), {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
    });
  } catch {
    return Response.json({ error: "No se pudo leer el catálogo" }, { status: 503 });
  }
}
