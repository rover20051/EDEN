// Cálculos de la planilla Finanzas_FEDE (Supuestos, Costo Unitario, Precio y Margen, Punto de Equilibrio, Escenarios),
// ahora dentro del back office. Mismas fórmulas que el Excel; los supuestos viven en ajustes.plan.
import { z } from "zod";

export type Tipo = "biblia" | "journal";
export const TIPOS: Tipo[] = ["biblia", "journal"];

const porTipo = <T extends z.ZodType>(t: T) => z.object({ biblia: t, journal: t });
const componentes = z.object({ interior: z.number(), trabajo: z.number(), packaging: z.number(), cuero: z.number(), otro: z.number() });

export const planSchema = z.object({
  tipo_cambio: z.number().positive(),
  fecha_tc: z.string(),
  lote: porTipo(z.number().int().positive()),
  merma: porTipo(z.number().min(0).max(0.9)),
  desarrollo_pct_biblia: z.number().min(0).max(1),
  margen_objetivo: z.number().min(0).max(0.9),
  pasarela: z.string(),
  transferencia: z.string(),
  pct_pasarela: z.number().min(0).max(1),
  descuento_transferencia: z.number().min(0).max(0.5),
  comision_plataforma: z.number().min(0).max(0.3),
  costos: porTipo(componentes),
  envio: porTipo(z.number().min(0)),
  material_envio: porTipo(z.number().min(0)),
  publicidad_lote: porTipo(z.number().min(0)),
  fijos: z.object({ web: z.number().min(0), impuestos: z.number().min(0), otros: z.number().min(0) }),
  meta_mensual: z.number().min(0),
  precios_tabla: porTipo(z.array(z.number().positive())),
  escenarios: z.object({ lotes: z.array(z.number().int().positive()), costos: z.array(z.number().positive()), precios: z.array(z.number().positive()) }),
});
export type Plan = z.infer<typeof planSchema>;

export const COMPONENTES: { clave: keyof Plan["costos"]["biblia"]; label: string }[] = [
  { clave: "interior", label: "Biblia impresa / hojas del journal" },
  { clave: "trabajo", label: "Trabajo artesanal (cuero, grabado, encuadernación)" },
  { clave: "packaging", label: "Packaging (caja, inserts, tarjeta, stickers)" },
  { clave: "cuero", label: "Cuero" },
  { clave: "otro", label: "Otro" },
];

/** Pasarelas comparadas (hoja Pasarelas). Comisión sin IVA, tomada de la página oficial de cada una el 2-nov-2026. */
export const PASARELAS = [
  { id: "mp-0", nombre: "Mercado Pago · al instante", acreditacion: "Al instante", comision: 0.0629, tipo: "tarjeta", afavor: "Máxima confianza y todos los medios de pago", contra: "La más cara", fuente: "mercadopago.com.ar/ayuda/33399" },
  { id: "mp-10", nombre: "Mercado Pago · 10 días", acreditacion: "10 días", comision: 0.0439, tipo: "tarjeta", afavor: "Confianza de MP", contra: "Sigue cara", fuente: "mercadopago.com.ar/ayuda/33399" },
  { id: "mp-18", nombre: "Mercado Pago · 18 días", acreditacion: "18 días", comision: 0.0339, tipo: "tarjeta", afavor: "Confianza de MP", contra: "", fuente: "mercadopago.com.ar/ayuda/33399" },
  { id: "mp-35", nombre: "Mercado Pago · 35 días", acreditacion: "35 días", comision: 0.0149, tipo: "tarjeta", afavor: "La más barata de MP", contra: "La plata llega a los 35 días", fuente: "mercadopago.com.ar/ayuda/33399" },
  { id: "nave-0", nombre: "Nave · crédito al instante (Galicia)", acreditacion: "Al instante", comision: 0.058, tipo: "tarjeta", afavor: "Bienvenida 90 días: 4,8%", contra: "Requiere cuenta Galicia", fuente: "navenegocios.ar/home/comisiones---nave" },
  { id: "nave-8", nombre: "Nave · crédito 8 días hábiles (Galicia)", acreditacion: "8 días hábiles", comision: 0.018, tipo: "tarjeta", afavor: "Casi tan barata como MP a 35 días y cobrás antes", contra: "Requiere cuenta Galicia; plazo según categoría", fuente: "navenegocios.ar/home/comisiones---nave" },
  { id: "nave-nx", nombre: "Nave · crédito al instante (Naranja X)", acreditacion: "Al instante", comision: 0.045, tipo: "tarjeta", afavor: "No hace falta ser cliente Galicia", contra: "Solo acreditación al instante", fuente: "navenegocios.ar/home/comisiones---nave" },
  { id: "uala", nombre: "Ualá Bis · al instante", acreditacion: "Al instante", comision: 0.049, tipo: "tarjeta", afavor: "Simple, se integra con Tiendanube", contra: "No publica plazos más baratos", fuente: "ualabis.com.ar/link-de-pago" },
  { id: "modo", nombre: "MODO (vía Payway) · crédito 8 días", acreditacion: "8 días", comision: 0.028, tipo: "tarjeta", afavor: "Promos bancarias", contra: "Necesita gateway; otra FAQ dice 1,8%", fuente: "modo.com.ar" },
  { id: "pagonube-30", nombre: "Pago Nube · 30 días (Plan Inicial)", acreditacion: "30 días", comision: 0.0299, tipo: "tarjeta", afavor: "Integrada con Tiendanube", contra: "Solo con Tiendanube", fuente: "ayuda.tiendanube.com" },
  { id: "talo", nombre: "Talo (solo transferencias)", acreditacion: "Al instante", comision: 0.01, tipo: "transferencia", afavor: "Confirma el pago solo, sin comprobantes falsos", contra: "No cobra tarjetas; 0,8% a 1% según volumen", fuente: "talo.com.ar/pricing.md" },
  { id: "pagonube-transf", nombre: "Pago Nube · transferencia", acreditacion: "Según Tiendanube", comision: 0.015, tipo: "transferencia", afavor: "Confirma sola dentro de Tiendanube", contra: "Solo con Tiendanube", fuente: "ayuda.tiendanube.com" },
  { id: "manual", nombre: "Transferencia manual (alias + comprobante)", acreditacion: "Al instante", comision: 0, tipo: "transferencia", afavor: "Gratis", contra: "Trabajo manual: confirmar siempre en el banco", fuente: "—" },
] as const;

export const IVA = 1.21;
const comisionConIva = (id: string) => (PASARELAS.find((p) => p.id === id)?.comision ?? 0) * IVA;
const arriba = (n: number, paso: number) => Math.ceil(n / paso) * paso;

/** Datos reales que vienen de la base (no se cargan a mano). */
export type Reales = {
  desarrolloGastado: number; // gastos con categoría desarrollo
  precio: Record<Tipo, number>; // precio actual del catálogo (el más bajo de cada tipo)
};

export function calcular(plan: Plan, reales: Reales) {
  const cobro =
    plan.pct_pasarela * comisionConIva(plan.pasarela) +
    (1 - plan.pct_pasarela) * (plan.descuento_transferencia + comisionConIva(plan.transferencia)) +
    plan.comision_plataforma;
  const fijos = plan.fijos.web + plan.fijos.impuestos + plan.fijos.otros;

  const porProducto = (t: Tipo) => {
    const costoDirecto = Object.values(plan.costos[t]).reduce((s, n) => s + n, 0);
    const lote = plan.lote[t];
    const vendibles = Math.floor(lote * (1 - plan.merma[t]));
    const costoVendible = vendibles ? (costoDirecto * lote) / vendibles : 0;
    const publicidadUnidad = vendibles ? plan.publicidad_lote[t] / vendibles : 0;
    const vender = plan.envio[t] + plan.material_envio[t];
    const costoTotal = costoVendible + vender + publicidadUnidad;
    const precio = reales.precio[t];
    const netoPorVenta = precio * (1 - cobro) - vender; // lo que recupera la inversión
    const ganancia = precio * (1 - cobro) - costoTotal;
    const desarrollo = reales.desarrolloGastado * (t === "biblia" ? plan.desarrollo_pct_biblia : 1 - plan.desarrollo_pct_biblia);
    const produccion = lote * costoDirecto;
    const inversion = desarrollo + produccion + plan.publicidad_lote[t];
    const ventasProduccion = netoPorVenta > 0 ? Math.ceil((produccion + plan.publicidad_lote[t]) / netoPorVenta) : null;
    const ventasTodo = netoPorVenta > 0 ? Math.ceil(inversion / netoPorVenta) : null;
    const gananciaLote = vendibles * netoPorVenta - inversion;

    /** Ganancia final del lote a otro precio (tabla Precio y Margen). */
    const gananciaLoteA = (p: number) => vendibles * (p * (1 - cobro) - vender) - inversion;
    /** Escenario: precio × tamaño de lote. */
    const escenarioLote = (p: number, l: number) => {
      const v = Math.floor(l * (1 - plan.merma[t]));
      return v * (p * (1 - cobro) - vender) - (desarrollo + l * costoDirecto + plan.publicidad_lote[t]);
    };
    /** Escenario: margen por unidad según precio × costo directo. */
    const escenarioMargen = (p: number, c: number) => {
      const total = vendibles ? (c * lote) / vendibles + vender + publicidadUnidad : 0;
      return (p * (1 - cobro) - total) / p;
    };

    return {
      tipo: t,
      costoDirecto,
      lote,
      vendibles,
      costoVendible,
      publicidadUnidad,
      vender,
      costoTotal,
      precio,
      netoPorVenta,
      ganancia,
      margen: precio ? ganancia / precio : 0,
      desarrollo,
      produccion,
      publicidad: plan.publicidad_lote[t],
      inversion,
      ventasProduccion,
      ventasTodo,
      ingresoBruto: vendibles * precio,
      gananciaLote,
      segundoLote: gananciaLote + desarrollo,
      referencia: {
        minimo: arriba(costoTotal / (1 - cobro), 100),
        recuperarTodo: vendibles ? arriba((inversion / vendibles + vender) / (1 - cobro), 100) : 0,
        objetivo: arriba(costoTotal / (1 - cobro - plan.margen_objetivo), 500),
        tresX: arriba(3 * costoDirecto, 500),
      },
      unidadesMes: ganancia > 0 ? Math.ceil((plan.meta_mensual + fijos) / ganancia) : null,
      gananciaLoteA,
      escenarioLote,
      escenarioMargen,
      costoCobro: (p: number) => p * cobro,
    };
  };

  const biblia = porProducto("biblia");
  const journal = porProducto("journal");
  const mezcla = biblia.ganancia + journal.ganancia > 0 ? Math.ceil((plan.meta_mensual + fijos) / (biblia.ganancia + journal.ganancia)) : null;

  return { cobro, fijos, biblia, journal, mezcla, porTipo: { biblia, journal } };
}
export type Calculo = ReturnType<typeof calcular>;
