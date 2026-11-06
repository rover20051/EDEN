import "server-only";

// Controles de los formularios públicos de la web (lista de espera, suscripción).

// Límite por IP en memoria (por instancia): suficiente para frenar a alguien apretando el botón sin parar.
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_VENTANA = 8;
const intentos = new Map<string, number[]>();

function demasiados(ip: string) {
  const ahora = Date.now();
  const lista = (intentos.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  lista.push(ahora);
  intentos.set(ip, lista);
  if (intentos.size > 5000) for (const [k, v] of intentos) if (ahora - v[v.length - 1] > VENTANA_MS) intentos.delete(k);
  return lista.length > MAX_POR_VENTANA;
}

export const respuesta = (cuerpo: Record<string, unknown>, status = 200) => Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

/** Rechaza pedidos de otro sitio, demasiado grandes o repetidos. Devuelve la respuesta de error, o null si está todo bien. */
export function controlPublico(req: Request): Response | null {
  const origen = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origen && URL.parse(origen)?.host !== host) return respuesta({ error: "Origen no permitido" }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > 2048) return respuesta({ error: "Pedido muy grande" }, 413);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (demasiados(ip)) return respuesta({ error: "Muchos intentos seguidos. Probá de nuevo en unos minutos." }, 429);
  return null;
}
