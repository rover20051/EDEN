import "server-only";
import { numeroPedido } from "@/lib/format";
import { sitio } from "@/lib/mails/plantillas";

/**
 * Mercado Pago con Checkout Bricks: la tarjeta se carga dentro de la tienda, en los campos seguros de Mercado Pago
 * (la tienda recibe un token, nunca los datos de la tarjeta) y el cobro sale del servidor (`crearPago`).
 * Solo tarjetas: dinero en cuenta y Cuotas sin Tarjeta no se ofrecen (pasan por la página de Mercado Pago, que no deja
 * excluir el dinero en cuenta, y quien tiene plata ahí puede transferir sin comisión).
 *
 * - MP_ACCESS_TOKEN (solo servidor) y MP_PUBLIC_KEY (va al navegador): credenciales de la aplicación de la cuenta que cobra.
 *   Con las de prueba ("TEST-…") todo es simulado; con las de producción se cobra de verdad.
 *
 * El pago se confirma solo con lo que devuelve la API de Mercado Pago (`buscarPago`), nunca con lo que trae un aviso
 * o el navegador: así nadie puede marcar un pedido como pagado mandando datos inventados.
 */

// MP_API_URL: solo para pruebas en la compu (un Mercado Pago simulado); en Vercel siempre se usa la API real.
const API = (!process.env.VERCEL && process.env.MP_API_URL) || "https://api.mercadopago.com";
const ZONA = "America/Argentina/Buenos_Aires";

export const mpConfigurado = () => Boolean(process.env.MP_ACCESS_TOKEN && process.env.MP_PUBLIC_KEY);
/** Clave pública de la aplicación: la usan los campos de tarjeta en el navegador. */
export const clavePublicaMP = () => process.env.MP_PUBLIC_KEY ?? "";

/** Error de la API de Mercado Pago, con su código HTTP (404: ese pago no es de esta cuenta o no existe). */
export class ErrorMP extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

async function llamar<T>(
  ruta: string,
  init: { method?: "GET" | "POST"; body?: unknown; idempotencia?: string; sesion?: string } = {},
): Promise<T> {
  const res = await fetch(API + ruta, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.idempotencia ? { "X-Idempotency-Key": init.idempotencia } : {}),
      ...(init.sesion ? { "X-meli-session-id": init.sesion } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new ErrorMP(res.status, `Mercado Pago respondió ${res.status} en ${ruta.split("?")[0]}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/** Fecha con la zona horaria de Argentina, como la pide Mercado Pago (2026-11-11T18:30:00.000-03:00). */
export function fechaMP(d: Date) {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().replace("Z", "-03:00");
}

/** "2026-12-16" en Argentina. */
const diaArgentina = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));

export type PedidoACobrar = {
  id: string;
  token: string;
  numero: number;
  total: number;
  vence_at: string | null;
  nombre: string;
  email: string | null;
  productos: string[];
};

const notificaciones = () => {
  const base = sitio();
  return base.startsWith("https://") ? `${base}/api/mercadopago` : undefined; // Mercado Pago solo avisa a direcciones públicas
};

/** Lo que devuelven los campos de tarjeta de Mercado Pago (Payment Brick) al tocar "Pagar". */
export type DatosTarjetaMP = {
  token: string;
  payment_method_id: string;
  issuer_id?: string | number | null;
  installments: number;
  payer: { email?: string; identification?: { type: string; number: string } };
};

export type PagoCreado = Pick<PagoMP, "id" | "status" | "status_detail"> & {
  three_ds_info?: { external_resource_url: string; creq: string } | null;
};

/**
 * Cobra un pedido con la tarjeta tokenizada. El monto sale siempre del pedido, nunca del navegador.
 * La clave de idempotencia usa el token de la tarjeta (sirve una sola vez): un doble clic no cobra dos veces.
 * 3DS opcional: si el banco pide validar, vuelve "pending_challenge" con los datos del desafío.
 */
export async function crearPago(p: PedidoACobrar, t: DatosTarjetaMP, sesion?: string): Promise<PagoCreado> {
  const [nombre, ...apellido] = p.nombre.trim().split(/\s+/);
  const email = t.payer.email?.trim() || p.email || undefined;
  return llamar<PagoCreado>("/v1/payments", {
    method: "POST",
    idempotencia: `${p.id}:${t.token}`,
    sesion,
    body: {
      transaction_amount: p.total,
      token: t.token,
      description: `Edén · Pedido ${numeroPedido(p.numero)}`,
      installments: t.installments,
      payment_method_id: t.payment_method_id,
      ...(t.issuer_id ? { issuer_id: Number(t.issuer_id) } : {}),
      payer: { email, identification: t.payer.identification, first_name: nombre, last_name: apellido.join(" ") || undefined },
      external_reference: p.id,
      statement_descriptor: "EDEN",
      three_d_secure_mode: "optional",
      notification_url: notificaciones(),
      additional_info: {
        items: [{ id: numeroPedido(p.numero), title: `Edén · Pedido ${numeroPedido(p.numero)}`, description: p.productos.join(", ").slice(0, 250), category_id: "others", quantity: 1, unit_price: p.total }],
        payer: { first_name: nombre, last_name: apellido.join(" ") || undefined },
      },
      metadata: { pedido: numeroPedido(p.numero) },
    },
  });
}

export type PagoMP = {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  status_detail: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
  money_release_date: string | null;
  payment_type_id: string;
  installments: number;
  fee_details?: { type: string; amount: number; fee_payer: string }[];
  transaction_details?: { net_received_amount?: number };
};

/** El pago tal como lo tiene Mercado Pago (la única fuente que vale para confirmar). */
export const buscarPago = (id: string) => llamar<PagoMP>(`/v1/payments/${encodeURIComponent(id)}`);

/** Lo que se queda Mercado Pago de este pago (comisión con IVA y retenciones), en pesos enteros. */
export function comisionDe(pago: PagoMP): number | null {
  const neto = pago.transaction_details?.net_received_amount;
  if (typeof neto === "number" && neto > 0) return Math.max(0, Math.round(pago.transaction_amount - neto));
  const fees = (pago.fee_details ?? []).filter((f) => f.fee_payer === "collector");
  return fees.length ? Math.round(fees.reduce((s, f) => s + f.amount, 0)) : null;
}

/** Día en que la plata queda disponible en la cuenta de Mercado Pago. */
export const acreditacionDe = (pago: PagoMP) => (pago.money_release_date ? diaArgentina(pago.money_release_date) : null);
