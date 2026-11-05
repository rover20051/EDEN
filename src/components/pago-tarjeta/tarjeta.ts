// Reglas de una tarjeta, sin estado: las usan el formulario (navegador) y la acción de pago (servidor).
// Nada de esto guarda datos: se valida y se descarta.

/** Tarjetas del modo prueba. Cualquier vencimiento futuro, cualquier CVC. */
export const TARJETAS_PRUEBA = {
  aprobada: "4242424242424242",
  rechazada: "4000000000000002",
} as const;

export const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Algoritmo de Luhn: descarta números mal tipeados antes de mandarlos. */
export function luhn(numero: string) {
  const d = soloDigitos(numero);
  if (d.length < 13 || d.length > 19) return false;
  let suma = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
  }
  return suma % 10 === 0;
}

export type Marca = "visa" | "mastercard" | "amex" | "cabal" | "naranja" | null;

export function marca(numero: string): Marca {
  const d = soloDigitos(numero);
  if (/^589562/.test(d)) return "naranja";
  if (/^(60420[1-9]|6042[1-9]\d|6043\d\d|627170)/.test(d)) return "cabal";
  if (/^3[47]/.test(d)) return "amex";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "mastercard";
  if (/^4/.test(d)) return "visa";
  return null;
}

export const NOMBRE_MARCA: Record<Exclude<Marca, null>, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  cabal: "Cabal",
  naranja: "Naranja",
};

/** "4242424242424242" → "4242 4242 4242 4242" (Amex: 4-6-5). */
export function formatearNumero(valor: string) {
  const d = soloDigitos(valor).slice(0, 19);
  if (marca(d) === "amex") return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "1228" → "12/28". */
export function formatearVencimiento(valor: string) {
  const d = soloDigitos(valor).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** MM/AA con mes válido y que no haya pasado (vale hasta el último día del mes). */
export function vencimientoValido(valor: string, ahora = new Date()) {
  const m = /^(\d{2})\/?(\d{2})$/.exec(valor.trim());
  if (!m) return false;
  const mes = Number(m[1]);
  const anio = 2000 + Number(m[2]);
  if (mes < 1 || mes > 12) return false;
  const finDeMes = new Date(anio, mes, 1); // primer día del mes siguiente
  return finDeMes > ahora && anio <= ahora.getFullYear() + 20;
}

export type DatosTarjeta = { numero: string; vencimiento: string; cvc: string; nombre: string };
export type ErroresTarjeta = Partial<Record<keyof DatosTarjeta, string>>;

/** Errores por campo, en el idioma de la tienda. Vacío = se puede mandar. */
export function validarTarjeta(t: DatosTarjeta): ErroresTarjeta {
  const e: ErroresTarjeta = {};
  if (!soloDigitos(t.numero)) e.numero = "Escribí el número de la tarjeta";
  else if (!luhn(t.numero)) e.numero = "Revisá el número: no parece una tarjeta válida";
  if (!t.vencimiento.trim()) e.vencimiento = "Falta el vencimiento";
  else if (!vencimientoValido(t.vencimiento)) e.vencimiento = "La fecha no es válida o ya pasó";
  const largoCvc = marca(t.numero) === "amex" ? 4 : 3;
  if (soloDigitos(t.cvc).length !== largoCvc || soloDigitos(t.cvc) !== t.cvc.trim()) e.cvc = `Son ${largoCvc} números`;
  if (t.nombre.trim().length < 2) e.nombre = "Escribí el nombre como figura en la tarjeta";
  return e;
}
