// Datos obligatorios del checkout. Las mismas reglas corren en el navegador y en el servidor.

export const OBLIGATORIOS = {
  nombre: (v: string) => (/\S+\s+\S+/.test(v.trim()) && v.trim().length <= 120 ? null : "Escribí tu nombre y apellido"),
  email: (v: string) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? null : "Revisá el mail"),
  whatsapp: (v: string) => (v.replace(/\D/g, "").length >= 8 && v.replace(/\D/g, "").length <= 15 ? null : "Revisá el WhatsApp, con característica"),
  direccion: (v: string) => (v.trim().length >= 5 ? null : "Escribí calle y número"),
  provincia: (v: string) => (v ? null : "Elegí tu provincia"),
  ciudad: (v: string) => (v.trim().length >= 2 ? null : "Escribí tu ciudad"),
  codigo_postal: (v: string) => (/^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/.test(v.trim()) ? null : "Revisá el C. P."),
} as const;

export type CampoObligatorio = keyof typeof OBLIGATORIOS;
export const CAMPOS = Object.keys(OBLIGATORIOS) as CampoObligatorio[];
export const esObligatorio = (n: string): n is CampoObligatorio => n in OBLIGATORIOS;
