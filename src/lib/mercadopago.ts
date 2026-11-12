import "server-only";
import { numeroPedido } from "@/lib/format";
import { sitio } from "@/lib/mails/plantillas";

/**
 * Mercado Pago con Checkout Bricks: la tarjeta se carga dentro de la tienda, en los campos seguros de Mercado Pago
 * (la tienda recibe un token, nunca los datos de la tarjeta) y el cobro sale del servidor (`crearPago`).
 * Tarjetas y efectivo (cupón para Rapipago o Pago Fácil). Dinero en cuenta y Cuotas sin Tarjeta no se ofrecen (pasan por
 * la página de Mercado Pago, que no deja excluir el dinero en cuenta, y quien tiene plata ahí puede transferir sin comisión).
 *
 * Dos juegos de credenciales de la aplicación (Checkout API con la API "Payments"), cada uno con su Access Token (solo
 * servidor) y su Public Key (va al navegador):
 * - "real": MP_ACCESS_TOKEN y MP_PUBLIC_KEY, las de producción de la cuenta que cobra. Las ven todos los clientes.
 * - "prueba": MP_TEST_ACCESS_TOKEN y MP_TEST_PUBLIC_KEY, las de prueba ("TEST-…"). Solo con el link de prueba de la tienda:
 *   nada se cobra y los clientes nunca las ven.
 * Si un juego no tiene el prefijo que corresponde (prueba con "TEST-", real sin él), se toma como no configurado.
 *
 * El pago se confirma solo con lo que devuelve la API de Mercado Pago (`buscarPago`), nunca con lo que trae un aviso
 * o el navegador: así nadie puede marcar un pedido como pagado mandando datos inventados.
 */

// MP_API_URL: solo para pruebas en la compu (un Mercado Pago simulado); en Vercel siempre se usa la API real.
const API = (!process.env.VERCEL && process.env.MP_API_URL) || "https://api.mercadopago.com";
const ZONA = "America/Argentina/Buenos_Aires";

export type EntornoMP = "real" | "prueba";

const credenciales = (e: EntornoMP) =>
  e === "prueba"
    ? { acceso: process.env.MP_TEST_ACCESS_TOKEN?.trim() ?? "", publica: process.env.MP_TEST_PUBLIC_KEY?.trim() ?? "" }
    : { acceso: process.env.MP_ACCESS_TOKEN?.trim() ?? "", publica: process.env.MP_PUBLIC_KEY?.trim() ?? "" };

/** ¿Están las dos credenciales de ese entorno, y son del tipo correcto? (las de prueba nunca cobran de verdad). */
export function mpConfigurado(e: EntornoMP) {
  const { acceso, publica } = credenciales(e);
  if (!acceso || !publica) return false;
  const deMentira = acceso.startsWith("TEST-") && publica.startsWith("TEST-");
  return e === "prueba" ? deMentira : !acceso.startsWith("TEST-") && !publica.startsWith("TEST-");
}
/** Clave pública de la aplicación: la usan los campos de pago en el navegador. */
export const clavePublicaMP = (e: EntornoMP) => (mpConfigurado(e) ? credenciales(e).publica : "");

/** Error de la API de Mercado Pago, con su código HTTP (404: ese pago no es de esta cuenta o no existe). */
export class ErrorMP extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

async function llamar<T>(
  e: EntornoMP,
  ruta: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown; idempotencia?: string; sesion?: string } = {},
): Promise<T> {
  const res = await fetch(API + ruta, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${credenciales(e).acceso}`,
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

/** Adónde avisa Mercado Pago de cada pago; los de prueba, a su propia dirección (se leen con las credenciales de prueba). */
const notificaciones = (e: EntornoMP) => {
  const base = sitio();
  if (!base.startsWith("https://")) return undefined; // Mercado Pago solo avisa a direcciones públicas
  return `${base}/api/mercadopago${e === "prueba" ? "/prueba" : ""}`;
};

/** Lo que devuelven los campos de tarjeta de Mercado Pago (Payment Brick) al tocar "Pagar". */
export type DatosTarjetaMP = {
  token: string;
  payment_method_id: string;
  issuer_id?: string | number | null;
  installments: number;
  payer: { email?: string; identification?: { type: string; number: string } };
};

export type PagoCreado = Pick<PagoMP, "id" | "status" | "status_detail" | "payment_type_id" | "date_of_expiration" | "transaction_details"> & {
  three_ds_info?: { external_resource_url: string; creq: string } | null;
};

/** Medios en efectivo que ofrece la tienda (cupón de Mercado Pago). */
export const EFECTIVO = { rapipago: "Rapipago", pagofacil: "Pago Fácil" } as const;
export type MedioEfectivo = keyof typeof EFECTIVO;

/** Lo que devuelven los campos de Mercado Pago al elegir pagar en efectivo. */
export type DatosEfectivoMP = {
  payment_method_id: MedioEfectivo;
  payer: { email?: string; first_name?: string; last_name?: string; identification?: { type: string; number: string } };
};

/**
 * Cobra un pedido con la tarjeta tokenizada. El monto sale siempre del pedido, nunca del navegador.
 * La clave de idempotencia usa el token de la tarjeta (sirve una sola vez): un doble clic no cobra dos veces.
 * 3DS opcional: si el banco pide validar, vuelve "pending_challenge" con los datos del desafío.
 */
export async function crearPago(e: EntornoMP, p: PedidoACobrar, t: DatosTarjetaMP, sesion?: string): Promise<PagoCreado> {
  const [nombre, ...apellido] = p.nombre.trim().split(/\s+/);
  const email = t.payer.email?.trim() || p.email || undefined;
  return llamar<PagoCreado>(e, "/v1/payments", {
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
      notification_url: notificaciones(e),
      additional_info: {
        items: [{ id: numeroPedido(p.numero), title: `Edén · Pedido ${numeroPedido(p.numero)}`, description: p.productos.join(", ").slice(0, 250), category_id: "others", quantity: 1, unit_price: p.total }],
        payer: { first_name: nombre, last_name: apellido.join(" ") || undefined },
      },
      metadata: { pedido: numeroPedido(p.numero) },
    },
  });
}

/**
 * Cupón para pagar en efectivo: Mercado Pago lo deja "pending" hasta que se paga en el local, y lo cancela solo al vencer.
 * La clave de idempotencia cambia por minuto: un doble clic devuelve el mismo cupón.
 */
export async function crearPagoEfectivo(e: EntornoMP, p: PedidoACobrar, d: DatosEfectivoMP, vence: Date): Promise<PagoCreado> {
  const [nombre, ...apellido] = p.nombre.trim().split(/\s+/);
  return llamar<PagoCreado>(e, "/v1/payments", {
    method: "POST",
    idempotencia: `${p.id}:efectivo:${d.payment_method_id}:${Math.floor(Date.now() / 60_000)}`,
    body: {
      transaction_amount: p.total,
      description: `Edén · Pedido ${numeroPedido(p.numero)}`,
      payment_method_id: d.payment_method_id,
      payer: {
        email: d.payer.email?.trim() || p.email || undefined,
        first_name: d.payer.first_name?.trim() || nombre,
        last_name: d.payer.last_name?.trim() || apellido.join(" ") || undefined,
        identification: d.payer.identification,
      },
      date_of_expiration: fechaMP(vence),
      external_reference: p.id,
      notification_url: notificaciones(e),
      additional_info: {
        items: [{ id: numeroPedido(p.numero), title: `Edén · Pedido ${numeroPedido(p.numero)}`, description: p.productos.join(", ").slice(0, 250), category_id: "others", quantity: 1, unit_price: p.total }],
      },
      metadata: { pedido: numeroPedido(p.numero) },
    },
  });
}

/** Los pagos de un pedido en Mercado Pago, del más nuevo al más viejo. */
export async function pagosDelPedido(e: EntornoMP, pedidoId: string): Promise<PagoMP[]> {
  const q = new URLSearchParams({ external_reference: pedidoId, sort: "date_created", criteria: "desc", limit: "20" });
  const r = await llamar<{ results?: PagoMP[] }>(e, `/v1/payments/search?${q}`);
  return r.results ?? [];
}

/** Cancela un pago pendiente (por ejemplo, un cupón que ya no se va a usar). */
export const cancelarPago = (e: EntornoMP, id: string | number) =>
  llamar<PagoMP>(e, `/v1/payments/${encodeURIComponent(String(id))}`, { method: "PUT", body: { status: "cancelled" } });

export type Cupon = { pagoId: string; url: string; vence: string; medio: string };

/** El cupón de un pago en efectivo que todavía se puede pagar. */
export function cuponDe(pago: Pick<PagoMP, "id" | "status" | "payment_type_id" | "payment_method_id" | "date_of_expiration" | "transaction_details">): Cupon | null {
  const url = pago.transaction_details?.external_resource_url;
  if (pago.payment_type_id !== "ticket" || pago.status !== "pending" || !url) return null;
  if (pago.date_of_expiration && new Date(pago.date_of_expiration) < new Date()) return null;
  const medio = EFECTIVO[pago.payment_method_id as MedioEfectivo] ?? "Rapipago o Pago Fácil";
  return { pagoId: String(pago.id), url, vence: pago.date_of_expiration ?? "", medio };
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
  payment_method_id: string;
  installments: number;
  date_of_expiration: string | null;
  fee_details?: { type: string; amount: number; fee_payer: string }[];
  transaction_details?: { net_received_amount?: number; external_resource_url?: string | null };
};

/** El pago tal como lo tiene Mercado Pago (la única fuente que vale para confirmar). */
export const buscarPago = (e: EntornoMP, id: string) => llamar<PagoMP>(e, `/v1/payments/${encodeURIComponent(id)}`);

/** Lo que se queda Mercado Pago de este pago (comisión con IVA y retenciones), en pesos enteros. */
export function comisionDe(pago: PagoMP): number | null {
  const neto = pago.transaction_details?.net_received_amount;
  if (typeof neto === "number" && neto > 0) return Math.max(0, Math.round(pago.transaction_amount - neto));
  const fees = (pago.fee_details ?? []).filter((f) => f.fee_payer === "collector");
  return fees.length ? Math.round(fees.reduce((s, f) => s + f.amount, 0)) : null;
}

/** Día en que la plata queda disponible en la cuenta de Mercado Pago. */
export const acreditacionDe = (pago: PagoMP) => (pago.money_release_date ? diaArgentina(pago.money_release_date) : null);
