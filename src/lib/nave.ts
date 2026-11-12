import "server-only";
import { numeroPedido } from "@/lib/format";
import type { EntornoMP as EntornoNave, PedidoACobrar } from "@/lib/mercadopago";
import { sitio } from "@/lib/mails/plantillas";

/**
 * Nave (Galicia) con su checkout embebido: la tienda crea una "intención de pago" desde el servidor y el cliente paga
 * dentro de la página con el SDK de Nave (`@ranty/ranty-sdk`, ver `src/components/pago-tarjeta/nave.tsx`).
 * Documentación: developer-portal-doc-mfe-website-mfe.ranty.io → Cobros online → Checkout.
 *
 * Cada entorno tiene su juego de credenciales (las entrega Nave en el ticket de "Alta de integraciones"):
 * - "real": NAVE_CLIENT_ID, NAVE_CLIENT_SECRET, NAVE_AUDIENCE, NAVE_POS_ID y NAVE_PUBLIC_KEY. Las ven todos los clientes.
 * - "prueba" (sandbox): las mismas con prefijo NAVE_TEST_. Solo con el link de prueba de la tienda: no se cobra nada.
 *
 * El pago se confirma solo con lo que devuelve la API de Nave (`buscarPagoNave`), nunca con lo que traiga el aviso o el
 * navegador: el aviso de Nave no está firmado.
 */

// NAVE_API_URL / NAVE_AUTH_URL: solo para pruebas en la compu (un Nave simulado); en Vercel siempre se usan las reales.
const local = !process.env.VERCEL;
const API = {
  real: (local && process.env.NAVE_API_URL) || "https://api.ranty.io/integrations",
  prueba: (local && process.env.NAVE_API_URL) || "https://api-sandbox.ranty.io/integrations",
};
const AUTH = {
  real: (local && process.env.NAVE_AUTH_URL) || "https://services.apinaranja.com/security-ms/api/security/auth0/b2b/m2msPrivate",
  prueba: (local && process.env.NAVE_AUTH_URL) || "https://homoservices.apinaranja.com/security-ms/api/security/auth0/b2b/m2msPrivate",
};

const credenciales = (e: EntornoNave) => {
  const v = (k: string) => process.env[`NAVE_${e === "prueba" ? "TEST_" : ""}${k}`]?.trim() ?? "";
  return { id: v("CLIENT_ID"), secreto: v("CLIENT_SECRET"), audiencia: v("AUDIENCE"), pos: v("POS_ID"), publica: v("PUBLIC_KEY") };
};

/** ¿Están las cinco credenciales de ese entorno? */
export function naveConfigurado(e: EntornoNave) {
  const c = credenciales(e);
  return Boolean(c.id && c.secreto && c.audiencia && c.pos && c.publica);
}
/** Llave pública que usa el checkout embebido en el navegador. */
export const clavePublicaNave = (e: EntornoNave) => (naveConfigurado(e) ? credenciales(e).publica : "");

/** Error de la API de Nave, con su código HTTP (404: ese pago no es de esta cuenta o no existe). */
export class ErrorNave extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

// El token dura 24 h: se reutiliza hasta unos minutos antes de que venza.
const tokens = new Map<EntornoNave, { token: string; hasta: number }>();

async function pedirToken(e: EntornoNave): Promise<string> {
  const c = credenciales(e);
  const res = await fetch(AUTH[e], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: c.id, client_secret: c.secreto, audience: c.audiencia }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new ErrorNave(res.status, `Nave no dio el token de acceso (${res.status})`);
  const d = (await res.json()) as { access_token?: string; expires_in?: string | number };
  if (!d.access_token) throw new ErrorNave(502, "Nave respondió sin token de acceso");
  const segundos = Number(d.expires_in) || 3600;
  tokens.set(e, { token: d.access_token, hasta: Date.now() + Math.max(60, segundos - 300) * 1000 });
  return d.access_token;
}

async function token(e: EntornoNave, renovar = false) {
  const t = tokens.get(e);
  return !renovar && t && t.hasta > Date.now() ? t.token : pedirToken(e);
}

async function llamar<T>(e: EntornoNave, ruta: string, init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}, reintento = true): Promise<T> {
  const res = await fetch(API[e] + ruta, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await token(e, !reintento)}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  // Token vencido o revocado: se pide uno nuevo y se repite una sola vez.
  if (res.status === 401 && reintento) return llamar<T>(e, ruta, init, false);
  if (!res.ok) throw new ErrorNave(res.status, `Nave respondió ${res.status} en ${init.method ?? "GET"} ${ruta.split("?")[0]}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/** Nave pide los montos como texto con dos decimales ("67500.00"). */
const monto = (pesos: number) => pesos.toFixed(2);

export type IntencionCreada = { id: string; external_payment_id: string; checkout_url: string; qr_data?: string };

/**
 * Crea la intención de pago de un pedido. `externo` (36 caracteres como máximo) es el identificador con que Nave nos
 * avisa del pago; `segundos` es lo que dura la intención. El monto sale siempre del pedido, nunca del navegador.
 */
export async function crearIntencion(e: EntornoNave, p: PedidoACobrar, externo: string, segundos: number): Promise<IntencionCreada> {
  const titulo = `Edén · Pedido ${numeroPedido(p.numero)}`;
  const volver = `${sitio()}/pedido/${p.token}`;
  return llamar<IntencionCreada>(e, "/payment_requests/ecommerce", {
    method: "POST",
    body: {
      external_payment_id: externo,
      seller: { pos_id: credenciales(e).pos },
      transactions: [
        {
          amount: { currency: "ARS", value: monto(p.total) },
          products: [{ name: titulo, description: p.productos.join(", ").slice(0, 250), quantity: 1, unit_price: { currency: "ARS", value: monto(p.total) } }],
        },
      ],
      buyer: { name: p.nombre, ...(p.email ? { user_email: p.email } : {}) },
      // El cliente vuelve acá al terminar (https) y ve el estado de su pedido.
      ...(volver.startsWith("https://") ? { additional_info: { callback_url: volver } } : {}),
      duration_time: Math.max(300, Math.floor(segundos)),
    },
  });
}

export type EstadoIntencion = "PENDING" | "PROCESSED" | "DISABLED" | "SUCCESS_PROCESSED" | "FAILURE_PROCESSED" | "EXPIRED" | "BLOCKED";

export type Intencion = {
  id: string;
  status: { name: EstadoIntencion };
  expiration_date?: string;
  external_payment_id?: string;
  payment_attempts?: { attempts?: number; payments?: { payment_id: string; status: string }[] };
  capture_data?: { checkout_url?: string };
};

export const buscarIntencion = (e: EntornoNave, id: string) => llamar<Intencion>(e, `/payment_requests/${encodeURIComponent(id)}`);

/** Anula una intención que todavía no se usó (por ejemplo, cuando el pedido pasa a transferencia). */
export const cancelarIntencion = (e: EntornoNave, id: string) =>
  llamar<{ message: string }>(e, `/payment_requests/${encodeURIComponent(id)}`, { method: "DELETE" });

export type EstadoPagoNave = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REFUNDED" | "PURCHASE_REVERSED" | "CHARGEBACK_REVIEW" | "CHARGED_BACK";

export type PagoNave = {
  id: string;
  external_payment_id: string | null;
  status: { name: EstadoPagoNave; reason_code?: string; reason_name?: string };
  transactions?: { amount?: { value: string; currency: string }; total_amount?: { value: string; currency: string } }[];
};

/** El pago tal como lo tiene Nave (la única fuente que vale para confirmar). */
export const buscarPagoNave = (e: EntornoNave, id: string) => llamar<PagoNave>(e, `/payments/${encodeURIComponent(id)}`);

/** Lo que cobró Nave, en pesos (el monto de la transacción; la propina, si hubiera, no cuenta). */
export function montoDe(p: PagoNave): { pesos: number; moneda: string } | null {
  const t = p.transactions?.[0];
  const m = t?.amount ?? t?.total_amount;
  const pesos = m ? Number(m.value) : NaN;
  return Number.isFinite(pesos) && m ? { pesos, moneda: m.currency } : null;
}
