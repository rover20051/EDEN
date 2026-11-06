import { estadoVenta } from "@/lib/venta";

// Separado de /api/catalogo, que se guarda en caché para todos: esto depende de cada visitante.
export async function GET() {
  return Response.json({ estado: await estadoVenta() }, { headers: { "Cache-Control": "private, no-store" } });
}
