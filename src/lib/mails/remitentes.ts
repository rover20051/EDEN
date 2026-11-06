// Quién firma cada mail automático. El dominio sale de MAIL_DOMINIO; cada dirección tiene que existir como casilla,
// porque las respuestas de los clientes llegan ahí. Para cambiar un remitente alcanza con editar esta tabla.

type Firma = { nombre: string; usuario: string };

export const REMITENTES = {
  pedido_recibido: { nombre: "Edén Pagos", usuario: "pagos" },
  pedido_tarjeta: { nombre: "Edén Pagos", usuario: "pagos" },
  pago_confirmado: { nombre: "Edén Pedidos", usuario: "pedidos" },
  en_camino: { nombre: "Edén Envíos", usuario: "envios" },
  lista_espera: { nombre: "Edén", usuario: "hola" },
  aviso: { nombre: "Edén Ventas", usuario: "ventas" },
} satisfies Record<string, Firma>;

const firmaDe = (tipo: string): Firma =>
  tipo.startsWith("aviso_") ? REMITENTES.aviso : (REMITENTES[tipo as keyof typeof REMITENTES] ?? REMITENTES.lista_espera);

export const dominioMails = () => (process.env.MAIL_DOMINIO ?? "").trim().toLowerCase();

/** Dirección de un remitente, para mostrarla. Sin dominio configurado, solo el usuario. */
export function direccionDe(tipo: string) {
  const { usuario } = firmaDe(tipo);
  return dominioMails() ? `${usuario}@${dominioMails()}` : `${usuario}@…`;
}

/** Campo "from" del mail. Sin dominio verificado, el remitente de pruebas de Resend (solo entrega a la dueña de la cuenta). */
export function remitenteDe(tipo: string) {
  const { nombre, usuario } = firmaDe(tipo);
  return dominioMails() ? `${nombre} <${usuario}@${dominioMails()}>` : `${nombre} <onboarding@resend.dev>`;
}

/** Casillas de prueba: MAIL_PRUEBA_A admite varias, separadas por coma. */
export const casillasPrueba = () =>
  (process.env.MAIL_PRUEBA_A ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m));
