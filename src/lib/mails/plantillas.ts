// Plantillas de los mails al cliente. Funciones puras: reciben los datos y devuelven { asunto, html }.
// Las usa src/lib/mensajes.ts para mandar y la página Ajustes → Mails y avisos para la vista previa.

import { ars, fechaHora, linkWhatsApp, numeroPedido } from "@/lib/format";
import { COLOR, MONO, SANS, SERIF, boton, caja, dato, escapar, espacio, marco, parrafo, rotulo } from "./html";

export type ItemMail = { nombre: string; cantidad: number; precio: number; pack: string | null };

export type PedidoMail = {
  numero: number;
  nombre: string;
  token: string;
  medio_pago: string;
  items: ItemMail[];
  subtotal: number;
  descuento_set: number;
  descuento: number;
  cupon: string | null;
  envio_cobrado: number;
  /** Envío en 0 porque superó el "gratis desde" (si no, 0 = a coordinar). */
  envio_gratis: boolean;
  total: number;
  es_regalo: boolean;
  regalo_para: string | null;
  vence_at: string | null;
  direccion_envio: string | null;
  envio: { empresa: string; seguimiento: string | null } | null;
};

export type ContactoMail = { alias: string; email: string; whatsapp: string; horas: number };

export type Mail = { asunto: string; html: string };

export const PLANTILLAS = {
  pedido_recibido: "Recibimos tu pedido (transferencia)",
  pedido_tarjeta: "Terminá el pago (tarjeta pendiente)",
  pago_confirmado: "Confirmamos tu pago",
  en_camino: "Tu pedido está en camino",
  lista_espera: "Volvió un producto",
} as const;
export type Plantilla = keyof typeof PLANTILLAS;

/** Dirección pública del sitio, sin barra final. */
export const sitio = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const linkSeguimiento = (token: string) => `${sitio()}/pedido/${encodeURIComponent(token)}`;

const primerNombre = (n: string) => n.trim().split(/\s+/)[0] || n;

const contactoDe = (c: ContactoMail, texto: string) => ({
  email: c.email,
  whatsapp: c.whatsapp,
  whatsappHref: linkWhatsApp(c.whatsapp, texto),
});

/** Tabla con lo que compró y los totales. */
function resumen(p: PedidoMail, conPrecios = true) {
  const piezas = p.items.reduce((n, i) => n + i.cantidad, 0);
  const filas = p.items
    .map(
      (i) => `<tr>
  <td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-family:${SANS};font-size:15px;color:${COLOR.raiz};">
    ${i.cantidad}&times; ${escapar(i.nombre)}
    ${i.pack ? `<div style="font-size:12px;color:${COLOR.suave};margin-top:2px;">Parte de ${escapar(i.pack)}</div>` : ""}
  </td>
  ${conPrecios ? `<td align="right" style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-family:${MONO};font-size:14px;color:${COLOR.raiz};white-space:nowrap;">${escapar(ars(i.cantidad * i.precio))}</td>` : ""}
</tr>`,
    )
    .join("");

  const linea = (label: string, valor: string, color: string = COLOR.tinta) =>
    `<tr><td style="padding:5px 0;font-family:${SANS};font-size:14px;color:${color};">${label}</td><td align="right" style="padding:5px 0;font-family:${MONO};font-size:14px;color:${color};white-space:nowrap;">${valor}</td></tr>`;

  const totales = conPrecios
    ? [
        linea("Subtotal", escapar(ars(p.subtotal))),
        p.descuento_set > 0 ? linea("Set / packs", `&minus;${escapar(ars(p.descuento_set))}`, COLOR.musgo) : "",
        p.descuento > 0 ? linea(p.cupon ? `Cupón ${escapar(p.cupon)}` : "Descuento", `&minus;${escapar(ars(p.descuento))}`, COLOR.musgo) : "",
        linea("Envío", p.envio_cobrado ? escapar(ars(p.envio_cobrado)) : p.envio_gratis ? "Sin cargo" : "A coordinar"),
        `<tr><td style="padding:12px 0 0;font-family:${SERIF};font-size:22px;color:${COLOR.raiz};border-top:1px solid ${COLOR.linea};">Total</td><td align="right" style="padding:12px 0 0;font-family:${MONO};font-size:18px;font-weight:600;color:${COLOR.raiz};border-top:1px solid ${COLOR.linea};white-space:nowrap;">${escapar(ars(p.total))}</td></tr>`,
      ].join("")
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding-bottom:6px;font-family:${SERIF};font-size:22px;color:${COLOR.raiz};">Tu pedido ${escapar(numeroPedido(p.numero))}</td>
    <td align="right" style="padding-bottom:6px;font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${COLOR.suave};white-space:nowrap;">${piezas} ${piezas === 1 ? "pieza" : "piezas"}</td>
  </tr>
  <tr><td colspan="2">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>
    ${totales ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">${totales}</table>` : ""}
  </td></tr>
</table>`;
}

const regalo = (p: PedidoMail) =>
  p.es_regalo
    ? caja(
        `${rotulo("Es un regalo")}<div style="margin-top:6px;font-family:${SERIF};font-size:19px;line-height:1.4;color:${COLOR.raiz};">${
          p.regalo_para ? `Para ${escapar(p.regalo_para)}. ` : ""
        }Lo vamos a preparar con un cuidado especial para que llegue listo para regalar.</div>`,
        "#EFE6D6",
      ) + espacio(20)
    : "";

// ───────────── Pedido recibido: transferencia ─────────────

export function mailPedidoRecibido(p: PedidoMail, c: ContactoMail): Mail {
  const nombre = primerNombre(p.nombre);
  const num = numeroPedido(p.numero);
  const asunto = `Recibimos tu pedido ${num} · Edén`;
  const vence = p.vence_at ? ` Te guardamos las piezas hasta el ${fechaHora(p.vence_at)}.` : "";
  const waComprobante = linkWhatsApp(c.whatsapp, `Hola! Les mando el comprobante del pedido ${num}.`);

  const transferencia = caja(
    `${rotulo("Para confirmarlo, transferí")}
     <div style="margin:8px 0 16px;font-family:${SERIF};font-size:38px;line-height:1;color:${COLOR.raiz};">${escapar(ars(p.total))}</div>
     ${
       c.alias
         ? dato("Alias", `<span style="font-family:${MONO};font-size:17px;letter-spacing:1px;color:${COLOR.raiz};">${escapar(c.alias)}</span>`)
         : dato("Alias", "Escribinos y te pasamos los datos para transferir.")
     }
     ${dato("Plazo", `Tenés ${c.horas}&nbsp;h para transferir.${escapar(vence)} Después el pedido se libera.`)}
     ${dato(
       "Después, mandanos el comprobante",
       [
         c.email ? `por mail a <a href="mailto:${escapar(c.email)}?subject=${encodeURIComponent(`Comprobante ${num}`)}" style="color:${COLOR.raiz};">${escapar(c.email)}</a>` : "",
         waComprobante ? `por <a href="${escapar(waComprobante)}" target="_blank" style="color:${COLOR.raiz};">WhatsApp</a>` : "",
       ]
         .filter(Boolean)
         .join(" o ") || "respondiendo este mail",
     )}`,
  );

  const cuerpo = [
    transferencia,
    espacio(24),
    boton(linkSeguimiento(p.token), "Ver mi pedido"),
    espacio(28),
    regalo(p),
    resumen(p),
    espacio(8),
  ].join("");

  return {
    asunto,
    html: marco({
      asunto,
      preheader: `Transferí ${ars(p.total)} al alias ${c.alias || "de Edén"} y mandanos el comprobante.`,
      ceja: "Pedido recibido",
      titulo: `¡Gracias, ${nombre}!`,
      bajada: "Tu pedido quedó reservado. Lo confirmamos apenas veamos la transferencia.",
      cuerpo,
      contacto: contactoDe(c, `Hola! Tengo una consulta por el pedido ${num}.`),
      motivo: "Recibiste este mail porque hiciste un pedido en Edén.",
    }),
  };
}

// ───────────── Pedido recibido: tarjeta sin terminar ─────────────

export function mailPedidoTarjeta(p: PedidoMail, c: ContactoMail): Mail {
  const nombre = primerNombre(p.nombre);
  const num = numeroPedido(p.numero);
  const asunto = `Tu pedido ${num} está esperando el pago · Edén`;
  const cuerpo = [
    caja(
      `${rotulo("Pago con tarjeta")}
       <div style="margin:8px 0 10px;font-family:${SERIF};font-size:34px;line-height:1;color:${COLOR.raiz};">${escapar(ars(p.total))}</div>
       ${parrafo("Si el pago no se completó, podés terminarlo desde el link de tu pedido. Si ya pagaste, no hagas nada: en unos minutos te llega la confirmación.", "margin:0;")}`,
    ),
    espacio(24),
    boton(linkSeguimiento(p.token), "Terminar el pago"),
    espacio(28),
    regalo(p),
    resumen(p),
    espacio(8),
  ].join("");

  return {
    asunto,
    html: marco({
      asunto,
      preheader: "Guardamos tu pedido. Terminá el pago desde este link.",
      ceja: "Pedido recibido",
      titulo: `Te falta un paso, ${nombre}.`,
      bajada: "Guardamos tu pedido mientras terminás el pago.",
      cuerpo,
      contacto: contactoDe(c, `Hola! Tengo una consulta por el pago del pedido ${num}.`),
      motivo: "Recibiste este mail porque empezaste una compra en Edén.",
    }),
  };
}

// ───────────── Pago confirmado ─────────────

export function mailPagoConfirmado(p: PedidoMail, c: ContactoMail): Mail {
  const nombre = primerNombre(p.nombre);
  const num = numeroPedido(p.numero);
  const asunto = `Confirmamos tu pago · Pedido ${num}`;
  const cuerpo = [
    caja(
      `${rotulo("Qué sigue")}
       <div style="margin-top:8px;font-family:${SANS};font-size:15px;line-height:1.6;color:${COLOR.tinta};">
         <b style="color:${COLOR.raiz};">1.</b> Preparamos tu pedido a mano, pieza por pieza.<br>
         <b style="color:${COLOR.raiz};">2.</b> Cuando salga, te mandamos la empresa de envío y el número de seguimiento.<br>
         <b style="color:${COLOR.raiz};">3.</b> Mientras tanto, podés ver en qué etapa está desde tu link.
       </div>`,
    ),
    espacio(24),
    boton(linkSeguimiento(p.token), "Seguir mi pedido"),
    espacio(28),
    regalo(p),
    resumen(p),
    espacio(8),
  ].join("");

  return {
    asunto,
    html: marco({
      asunto,
      preheader: "Recibimos tu pago. Ya empezamos a preparar tu pedido.",
      ceja: "Pago confirmado",
      titulo: `Gracias, ${nombre}.`,
      bajada: p.es_regalo
        ? "Recibimos tu pago y ya empezamos a preparar tu regalo."
        : "Recibimos tu pago y ya empezamos a preparar tu pedido.",
      cuerpo,
      contacto: contactoDe(c, `Hola! Tengo una consulta por el pedido ${num}.`),
      motivo: "Recibiste este mail porque hiciste una compra en Edén.",
    }),
  };
}

// ───────────── En camino ─────────────

export function mailEnCamino(p: PedidoMail, c: ContactoMail): Mail {
  const nombre = primerNombre(p.nombre);
  const num = numeroPedido(p.numero);
  const asunto = `Tu pedido ${num} está en camino · Edén`;
  const envio = caja(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding-bottom:14px;">${rotulo(`Pedido ${num}`, COLOR.suave)}</td>
        <td align="right" style="padding-bottom:14px;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${COLOR.hierba};color:${COLOR.nota};font-family:${SANS};font-size:10px;letter-spacing:2px;text-transform:uppercase;">En tránsito</span></td>
      </tr>
    </table>
    ${dato("Empresa de envío", escapar(p.envio?.empresa ?? "—"))}
    ${dato(
      "Número de seguimiento",
      p.envio?.seguimiento
        ? `<span style="font-family:${MONO};font-size:18px;letter-spacing:2px;color:${COLOR.raiz};">${escapar(p.envio.seguimiento)}</span>`
        : "Te lo pasamos por WhatsApp apenas lo tengamos.",
    )}
    ${p.direccion_envio ? dato("Dirección de entrega", escapar(p.direccion_envio)) : ""}`,
  );
  const cuidados = caja(
    `${rotulo("Cuidados del cuero", COLOR.musgo)}<div style="margin-top:6px;font-family:${SERIF};font-style:italic;font-size:18px;line-height:1.45;color:${COLOR.tinta};">Guardala lejos del sol directo y la humedad. Con el uso, el cuero va tomando su propio carácter.</div>`,
    "#EFE6D6",
  );
  const cuerpo = [envio, espacio(24), boton(linkSeguimiento(p.token), "Seguir mi pedido"), espacio(28), resumen(p, false), espacio(24), cuidados, espacio(8)].join("");

  return {
    asunto,
    html: marco({
      asunto,
      preheader: p.envio?.seguimiento ? `Salió por ${p.envio.empresa}. Seguimiento: ${p.envio.seguimiento}` : "Tu pedido ya salió hacia vos.",
      ceja: "Pedido despachado",
      titulo: `Tu pedido está en camino, ${nombre}.`,
      bajada: "Lo preparamos a mano y ya salió hacia vos. Con este número podés seguirlo hasta que llegue.",
      cuerpo,
      contacto: contactoDe(c, `Hola! Tengo una consulta por el envío del pedido ${num}.`),
      motivo: "Recibiste este mail porque hiciste una compra en Edén.",
    }),
  };
}

// ───────────── Lista de espera ─────────────

export type ListaEsperaMail = { nombre: string | null; producto: string; tipo: string; precio: number };

export function mailListaEspera(d: ListaEsperaMail, c: ContactoMail): Mail {
  const asunto = `Volvió ${d.producto} · Edén`;
  const ancla = d.tipo === "journal" ? "#journals" : d.tipo === "biblia" ? "#biblias" : "#tienda";
  const cuerpo = [
    caja(
      `<div style="text-align:center;">
        ${rotulo("De nuevo en la tienda")}
        <div style="margin:10px 0 6px;font-family:${SERIF};font-size:30px;line-height:1.15;color:${COLOR.raiz};">${escapar(d.producto)}</div>
        ${d.precio > 0 ? `<div style="font-family:${MONO};font-size:16px;color:${COLOR.tinta};">${escapar(ars(d.precio))}</div>` : ""}
      </div>`,
    ),
    espacio(20),
    parrafo("Son pocas unidades y cada una está hecha a mano, así que si la estabas esperando, este es el momento.", "text-align:center;"),
    espacio(8),
    boton(`${sitio()}/${ancla}`, "Ir a la tienda"),
    espacio(16),
  ].join("");

  return {
    asunto,
    html: marco({
      asunto,
      preheader: `${d.producto} ya está disponible otra vez.`,
      ceja: "Te avisamos",
      titulo: d.nombre ? `Volvió, ${primerNombre(d.nombre)}.` : `Volvió ${d.producto}.`,
      bajada: "Nos pediste que te avisáramos cuando hubiera de nuevo. Ya hay.",
      cuerpo,
      contacto: contactoDe(c, `Hola! Quería consultar por ${d.producto}.`),
      motivo: "Recibiste este mail porque te anotaste para que te avisemos cuando volviera. Es un aviso por única vez.",
    }),
  };
}

// ───────────── Datos de ejemplo para la vista previa ─────────────

export const PEDIDO_EJEMPLO: PedidoMail = {
  numero: 12,
  nombre: "Lucía Gómez",
  token: "00000000-0000-0000-0000-000000000000",
  medio_pago: "transferencia",
  items: [
    { nombre: "Biblia Origen", cantidad: 1, precio: 75000, pack: null },
    { nombre: "Journal Anaj", cantidad: 1, precio: 65000, pack: null },
  ],
  subtotal: 140000,
  descuento_set: 20000,
  descuento: 0,
  cupon: null,
  envio_cobrado: 9500,
  envio_gratis: false,
  total: 129500,
  es_regalo: true,
  regalo_para: "Sofi",
  vence_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  direccion_envio: "Av. Coronel Díaz 2145, 4° B, CABA",
  envio: { empresa: "Correo Argentino", seguimiento: "CP123456789AR" },
};

/** Arma una plantilla con datos de ejemplo (para ver cómo queda sin necesitar pedidos reales). */
export function vistaPrevia(plantilla: Plantilla, c: ContactoMail): Mail {
  const p = PEDIDO_EJEMPLO;
  switch (plantilla) {
    case "pedido_recibido":
      return mailPedidoRecibido({ ...p, es_regalo: false }, c);
    case "pedido_tarjeta":
      return mailPedidoTarjeta({ ...p, medio_pago: "nave", es_regalo: false, vence_at: null }, c);
    case "pago_confirmado":
      return mailPagoConfirmado(p, c);
    case "en_camino":
      return mailEnCamino({ ...p, es_regalo: false }, c);
    case "lista_espera":
      return mailListaEspera({ nombre: "Lucía", producto: "Biblia Origen", tipo: "biblia", precio: 75000 }, c);
  }
}
