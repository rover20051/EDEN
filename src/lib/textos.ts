// Etiquetas en castellano para los enums de la base. Mantener sincronizado con supabase/migrations.

export const ESTADOS = {
  pendiente_pago: { label: "Por cobrar", color: "bg-secondary-fixed text-secondary" },
  pagado: { label: "Pagado", color: "bg-tertiary-fixed text-tertiary" },
  en_preparacion: { label: "Preparando", color: "bg-secondary-container text-on-secondary-container" },
  despachado: { label: "Despachado", color: "bg-tertiary text-inverse-on-surface shadow-sm" },
  entregado: { label: "Entregado", color: "bg-surface-variant text-on-surface-variant" },
  cancelado: { label: "Cancelado", color: "bg-surface-container-high text-error" },
} as const;
export type Estado = keyof typeof ESTADOS;

/** Punto de color de cada estado (primera columna de la tabla de pedidos). */
export const PUNTO_ESTADO: Record<Estado, string> = {
  pendiente_pago: "bg-secondary",
  pagado: "bg-tertiary",
  en_preparacion: "bg-secondary-fixed-dim",
  despachado: "bg-tertiary",
  entregado: "bg-outline-variant",
  cancelado: "bg-error",
};

/** Ícono de Material Symbols para cada canal de venta. */
export const ICONO_CANAL: Record<string, string> = {
  web: "language",
  instagram: "photo_camera",
  whatsapp: "smartphone",
  feria: "storefront",
  iglesia: "church",
  otro: "more_horiz",
};

export const CANALES = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  web: "Web",
  feria: "Feria",
  iglesia: "Iglesia",
  otro: "Otro",
} as const;

export const MEDIOS = {
  transferencia: "Transferencia",
  nave: "Nave",
  mercadopago: "Mercado Pago",
  efectivo: "Efectivo",
  otro: "Otro",
} as const;

export const ORIGENES = {
  anuncio: "Anuncio pago",
  instagram: "Instagram",
  tiktok: "TikTok",
  recomendacion: "Recomendación",
  iglesia: "Iglesia",
  google: "Google",
  otro: "Otro",
  sin_dato: "Sin dato",
} as const;

export const CATEGORIAS = {
  produccion: "Producción",
  publicidad: "Publicidad",
  envios: "Material de envío",
  desarrollo: "Desarrollo",
  operativo: "Operativo",
  otro: "Otro",
} as const;

export const SOCIOS = {
  eden: "Edén",
  fede: "Fede",
  nari: "Nari",
  mich: "Mich",
  nari_mich: "Nari y Mich",
} as const;

/** Por qué sale un pedido sin cobrarse (pedidos.salida_motivo). */
export const MOTIVOS_SALIDA = {
  regalo: "Regalo",
  influencer: "Influencer",
  reposicion: "Reposición por falla",
  muestra: "Muestra",
  otro: "Otro",
} as const;
export type MotivoSalida = keyof typeof MOTIVOS_SALIDA;

/** Quién regala (pedidos.salida_por). */
export const QUIEN_SALIDA = {
  nari: "Nari",
  mich: "Mich",
  fede: "Fede",
  eden: "Edén",
} as const;
export type QuienSalida = keyof typeof QUIEN_SALIDA;

/** "Regalo de Nari", "Influencer · Mich", "Muestra". */
export function etiquetaSalida(motivo: string | null | undefined, por: string | null | undefined) {
  const m = MOTIVOS_SALIDA[(motivo ?? "otro") as MotivoSalida] ?? "Salida";
  const q = por ? QUIEN_SALIDA[por as QuienSalida] : null;
  if (!q) return m;
  return motivo === "regalo" ? `Regalo de ${q}` : `${m} · ${q}`;
}
