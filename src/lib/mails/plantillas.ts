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

export type Mail = { asunto: string; html: string; titulo: string; bajada: string };

/** Lo que se puede cambiar desde el back office. Los datos del pedido (montos, alias, seguimiento) no se tocan. */
export type TextosMail = { asunto?: string | null; titulo?: string | null; bajada?: string | null; nota?: string | null };

/** Qué se puede escribir entre llaves en cada mail. */
export const VARIABLES: Record<Plantilla, string[]> = {
  pedido_recibido: ["nombre", "pedido"],
  cupon_efectivo: ["nombre", "pedido"],
  pago_confirmado: ["nombre", "pedido"],
  en_camino: ["nombre", "pedido"],
  lista_espera: ["nombre", "producto"],
  reserva_vencida: ["nombre", "pedido"],
  devolucion: ["nombre", "pedido", "monto"],
};

const rellenar = (texto: string, vars: Record<string, string>) => texto.replace(/\{(\w+)\}/g, (todo, k: string) => vars[k] ?? todo);

/** Arma el mail aplicando sobre sus textos originales lo que se haya cambiado en el back office. */
function armar(t: TextosMail | undefined, vars: Record<string, string>, m: Parameters<typeof marco>[0]): Mail {
  const asunto = rellenar(t?.asunto?.trim() || m.asunto, vars);
  const titulo = rellenar(t?.titulo?.trim() || m.titulo, vars);
  const bajada = rellenar(t?.bajada?.trim() || m.bajada || "", vars);
  const nota = t?.nota?.trim() ? parrafo(escapar(rellenar(t.nota.trim(), vars)).replace(/\n/g, "<br>")) + espacio(8) : "";
  return { asunto, titulo, bajada, html: marco({ ...m, asunto, titulo, bajada, cuerpo: nota + m.cuerpo }) };
}

export const PLANTILLAS = {
  pedido_recibido: "Recibimos tu pedido (transferencia)",
  cupon_efectivo: "Tu cupón para pagar en efectivo",
  pago_confirmado: "Confirmamos tu pago",
  en_camino: "Tu pedido está en camino",
  lista_espera: "Volvió un producto",
  reserva_vencida: "Venció la reserva (transferencia)",
  devolucion: "Te devolvimos tu dinero",
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

export function mailPedidoRecibido(p: PedidoMail, c: ContactoMail, t?: TextosMail): Mail {
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

  return armar(t, { nombre, pedido: num }, {
      asunto,
      preheader: `Transferí ${ars(p.total)} al alias ${c.alias || "de Edén"} y mandanos el comprobante.`,
      ceja: "Pedido recibido",
      titulo: `¡Gracias, ${nombre}!`,
      bajada: "Tu pedido quedó reservado. Lo confirmamos apenas veamos la transferencia.",
      cuerpo,
      contacto: contactoDe(c, `Hola! Tengo una consulta por el pedido ${num}.`),
      motivo: "Recibiste este mail porque hiciste un pedido en Edén.",
    });
}

// ───────────── Cupón para pagar en efectivo ─────────────

/** Cupón de Mercado Pago para pagar en Rapipago o Pago Fácil. */
export type CuponMail = { medio: string; vence: string };

export function mailCuponEfectivo(p: PedidoMail, cupon: CuponMail, c: ContactoMail, t?: TextosMail): Mail {
  const nombre = primerNombre(p.nombre);
  const num = numeroPedido(p.numero);
  const asunto = `Tu cupón para pagar el pedido ${num} · Edén`;
  const vence = cupon.vence ? fechaHora(cupon.vence) : null;

  const efectivo = caja(
    `${rotulo(`Pagá en efectivo en ${escapar(cupon.medio)}`)}
     <div style="margin:8px 0 16px;font-family:${SERIF};font-size:38px;line-height:1;color:${COLOR.raiz};">${escapar(ars(p.total))}</div>
     ${dato("Cómo", `Mostrá el cupón en cualquier local de ${escapar(cupon.medio)}, en el celular o impreso, y pagá en efectivo.`)}
     ${vence ? dato("Vence", `El ${escapar(vence)}. Después el cupón deja de servir y liberamos las piezas.`) : ""}
     ${dato("Después", "Mercado Pago nos avisa solo y te llega un mail con la confirmación. No hace falta mandarnos el comprobante.")}`,
  );

  const cuerpo = [efectivo, espacio(24), boton(linkSeguimiento(p.token), "Ver el cupón"), espacio(28), regalo(p), resumen(p), espacio(8)].join("");

  return armar(t, { nombre, pedido: num }, {
    asunto,
    preheader: `Pagá ${ars(p.total)} en ${cupon.medio}${vence ? ` antes del ${vence}` : ""}.`,
    ceja: "Pedido recibido",
    titulo: `¡Gracias, ${nombre}!`,
    bajada: "Tu pedido quedó reservado. Lo confirmamos apenas pagues el cupón.",
    cuerpo,
    contacto: contactoDe(c, `Hola! Tengo una consulta por el pedido ${num}.`),
    motivo: "Recibiste este mail porque hiciste un pedido en Edén.",
  });
}

// ───────────── Pago confirmado ─────────────

export function mailPagoConfirmado(p: PedidoMail, c: ContactoMail, t?: TextosMail): Mail {
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

  return armar(t, { nombre, pedido: num }, {
      asunto,
      preheader: "Recibimos tu pago. Ya empezamos a preparar tu pedido.",
      ceja: "Pago confirmado",
      titulo: `Gracias, ${nombre}.`,
      bajada: p.es_regalo
        ? "Recibimos tu pago y ya empezamos a preparar tu regalo."
        : "Recibimos tu pago y ya empezamos a preparar tu pedido.",
      cuerpo,
      automatico: true,
      contacto: contactoDe(c, `Hola! Tengo una consulta por el pedido ${num}.`),
      motivo: "Recibiste este mail porque hiciste una compra en Edén.",
    });
}

// ───────────── En camino ─────────────

export function mailEnCamino(p: PedidoMail, c: ContactoMail, t?: TextosMail): Mail {
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

  return armar(t, { nombre, pedido: num }, {
      asunto,
      preheader: p.envio?.seguimiento ? `Salió por ${p.envio.empresa}. Seguimiento: ${p.envio.seguimiento}` : "Tu pedido ya salió hacia vos.",
      ceja: "Pedido despachado",
      titulo: `Tu pedido está en camino, ${nombre}.`,
      bajada: "Lo preparamos a mano y ya salió hacia vos. Con este número podés seguirlo hasta que llegue.",
      cuerpo,
      automatico: true,
      contacto: contactoDe(c, `Hola! Tengo una consulta por el envío del pedido ${num}.`),
      motivo: "Recibiste este mail porque hiciste una compra en Edén.",
    });
}

// ───────────── Lista de espera ─────────────

export type ListaEsperaMail = { nombre: string | null; producto: string; tipo: string; precio: number };

export function mailListaEspera(d: ListaEsperaMail, c: ContactoMail, t?: TextosMail): Mail {
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

  return armar(t, { nombre: d.nombre ? primerNombre(d.nombre) : "", producto: d.producto }, {
      asunto,
      preheader: `${d.producto} ya está disponible otra vez.`,
      ceja: "Te avisamos",
      titulo: d.nombre ? `Volvió, ${primerNombre(d.nombre)}.` : `Volvió ${d.producto}.`,
      bajada: "Nos pediste que te avisáramos cuando hubiera de nuevo. Ya hay.",
      cuerpo,
      automatico: true,
      contacto: contactoDe(c, `Hola! Quería consultar por ${d.producto}.`),
      motivo: "Recibiste este mail porque te anotaste para que te avisemos cuando volviera. Es un aviso por única vez.",
    });
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
// ───────────── Venció la reserva ─────────────

export function mailReservaVencida(p: PedidoMail, c: ContactoMail, t?: TextosMail): Mail {
  const nombre = primerNombre(p.nombre);
  const num = numeroPedido(p.numero);
  const asunto = `Venció la reserva de tu pedido ${num} · Edén`;
  const cuerpo = [
    parrafo(`Pasaron ${c.horas} horas sin que nos llegue el comprobante, así que cancelamos el pedido y volvimos a poner las piezas a disposición.`),
    parrafo("<b>Si ya hiciste la transferencia,</b> respondé este mail con el comprobante y lo resolvemos enseguida."),
    espacio(8),
    boton(`${sitio()}/#tienda`, "Volver a la tienda"),
    espacio(16),
  ].join("");
  return armar(t, { nombre, pedido: num }, {
    asunto,
    preheader: "Cancelamos el pedido porque no nos llegó el comprobante. Si ya transferiste, respondé este mail.",
    ceja: `Pedido ${num}`,
    titulo: `Venció tu reserva, ${nombre}.`,
    bajada: "Si todavía la querés, podés volver a pedirla cuando quieras.",
    cuerpo,
    contacto: contactoDe(c, `Hola! Tengo una consulta por el pedido ${num}.`),
    motivo: "Recibiste este mail porque hiciste un pedido en Edén.",
  });
}

// ───────────── Devolución ─────────────

export function mailDevolucion(p: PedidoMail, d: { monto: number; completa: boolean }, c: ContactoMail, t?: TextosMail): Mail {
  const nombre = primerNombre(p.nombre);
  const num = numeroPedido(p.numero);
  const monto = ars(d.monto);
  const conTarjeta = p.medio_pago === "nave" || p.medio_pago === "mercadopago";
  const cuerpo = [
    caja(dato("Te devolvimos", `<span style="font-family:${MONO};font-size:20px;">${escapar(monto)}</span>`)),
    espacio(16),
    parrafo(
      conTarjeta
        ? "Lo devolvimos a la tarjeta con la que pagaste. El banco lo acredita según sus tiempos y lo vas a ver en tu resumen."
        : "Si en unos días no lo ves en tu cuenta, escribinos y lo revisamos.",
    ),
    espacio(8),
  ].join("");
  return armar(t, { nombre, pedido: num, monto }, {
    asunto: `Te devolvimos ${monto} del pedido ${num} · Edén`,
    preheader: `Registramos la devolución de ${monto} de tu pedido ${num}.`,
    ceja: `Pedido ${num}`,
    titulo: d.completa ? `Te devolvimos tu dinero, ${nombre}.` : `Te devolvimos una parte, ${nombre}.`,
    bajada: d.completa ? "Gracias por tu paciencia." : "El resto de tu pedido sigue igual.",
    cuerpo,
    contacto: contactoDe(c, `Hola! Tengo una consulta por la devolución del pedido ${num}.`),
    motivo: "Recibiste este mail porque hiciste una compra en Edén.",
  });
}

// ───────────── Cartas del jardín ─────────────

/** Texto de una carta: párrafos separados por una línea en blanco, y los links quedan clickeables. */
function parrafosCarta(texto: string) {
  return texto
    .trim()
    .split(/\n\s*\n/)
    .map((b) =>
      parrafo(
        escapar(b.trim())
          .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:${COLOR.tinta};">${u}</a>`)
          .replace(/\n/g, "<br>"),
        "font-size:16px;",
      ),
    )
    .join("");
}

/** `baja`: el link lo reemplaza Resend al enviar; en las pruebas se pasa otro. */
export function mailCarta(d: { asunto: string; titulo: string; cuerpo: string }, baja = "{{{RESEND_UNSUBSCRIBE_URL}}}"): Mail {
  const html = marco({
    asunto: d.asunto,
    preheader: d.cuerpo.trim().split("\n")[0].slice(0, 120),
    ceja: "Cartas del jardín",
    titulo: d.titulo,
    cuerpo: parrafosCarta(d.cuerpo),
    contacto: { email: "", whatsapp: "", whatsappHref: null },
    baja,
    motivo: "Recibís esta carta porque te suscribiste en casaeden.com.ar.",
  });
  return { asunto: d.asunto, html, titulo: d.titulo, bajada: "" };
}

export function vistaPrevia(plantilla: Plantilla, c: ContactoMail, t?: TextosMail): Mail {
  const p = PEDIDO_EJEMPLO;
  switch (plantilla) {
    case "pedido_recibido":
      return mailPedidoRecibido({ ...p, es_regalo: false }, c, t);
    case "cupon_efectivo":
      return mailCuponEfectivo({ ...p, es_regalo: false, medio_pago: "mercadopago" }, { medio: "Rapipago", vence: p.vence_at ?? "" }, c, t);
    case "pago_confirmado":
      return mailPagoConfirmado(p, c, t);
    case "en_camino":
      return mailEnCamino({ ...p, es_regalo: false }, c, t);
    case "lista_espera":
      return mailListaEspera({ nombre: "Lucía", producto: "Biblia Origen", tipo: "biblia", precio: 75000 }, c, t);
    case "reserva_vencida":
      return mailReservaVencida(p, c, t);
    case "devolucion":
      return mailDevolucion(p, { monto: p.total, completa: true }, c, t);
  }
}
