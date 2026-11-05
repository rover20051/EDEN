const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export const ars = (n: number | null | undefined) => pesos.format(n ?? 0);

export const numeroPedido = (n: number) => `EDN-${String(n).padStart(4, "0")}`;

const zona = "America/Argentina/Buenos_Aires";

export const fecha = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: zona }) : "—";

export const fechaHora = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleString("es-AR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zona,
      })
    : "—";

/** "hace 3 h", "hace 2 días", "en 5 h" */
export function relativo(d: string | Date) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** Link de WhatsApp con el mensaje ya escrito. Asume número argentino si no trae código de país. */
export function linkWhatsApp(numero: string | null | undefined, texto: string) {
  if (!numero) return null;
  let d = numero.replace(/\D/g, "");
  if (!d.startsWith("54")) d = "549" + d.replace(/^0/, "");
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

/** Convierte "75.000" o "75000" en 75000. Devuelve null si no es un número válido. */
export function aPesos(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const limpio = String(v).replace(/[^\d]/g, "");
  return limpio === "" ? null : Number(limpio);
}

/** Fecha de hoy en Argentina (UTC-3) como "AAAA-MM-DD", para inputs de fecha. */
export const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
