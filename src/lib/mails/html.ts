// Piezas para armar mails que se vean bien en Gmail, Outlook y el celular: tablas, estilos en línea, 560 px de ancho.
// Estética de la web pública: papel, tinta, Cormorant. Sin imágenes obligatorias (el logo es texto).

export const COLOR = {
  papel: "#F3EBE0",
  nota: "#FBF7F0",
  tinta: "#4E4540",
  raiz: "#2C221C",
  suave: "#76665E",
  oro: "#B28F3C",
  musgo: "#39432A",
  hierba: "#8A9A5E",
  linea: "#E6DCCD",
} as const;

export const SERIF = "'Cormorant Garamond', 'Cormorant', Georgia, 'Times New Roman', serif";
export const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const MONO = "'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace";

/** Escapa texto para meterlo en HTML. Todo dato que venga del cliente o de la base pasa por acá. */
export function escapar(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Solo deja pasar links http(s) y mailto (nada de javascript:). */
export function urlSegura(url: string): string {
  return /^(https?:|mailto:)/i.test(url) ? escapar(url) : "#";
}

/** Rótulo chico en mayúsculas (la "ceja" de los títulos). */
export const rotulo = (texto: string, color: string = COLOR.oro) =>
  `<div style="font-family:${SANS};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${color};font-weight:600;">${escapar(texto)}</div>`;

/** Botón "a prueba de clientes de mail" (tabla + link). */
export function boton(href: string, texto: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr><td align="center" bgcolor="${COLOR.raiz}" style="border-radius:999px;">
    <a href="${urlSegura(href)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${SANS};font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${COLOR.nota};text-decoration:none;border-radius:999px;font-weight:600;">${escapar(texto)} &rarr;</a>
  </td></tr>
</table>`;
}

/** Caja de color papel con padding (para datos importantes). */
export function caja(contenido: string, fondo: string = COLOR.papel) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${fondo};border-radius:18px;">
  <tr><td class="caja" style="padding:20px 22px;">${contenido}</td></tr>
</table>`;
}

/** Par rótulo/valor apilado. */
export const dato = (label: string, valorHtml: string) =>
  `<div style="margin:0 0 12px;">${rotulo(label, COLOR.suave)}<div style="margin-top:4px;font-family:${SANS};font-size:15px;line-height:1.45;color:${COLOR.raiz};">${valorHtml}</div></div>`;

export const espacio = (alto = 24) => `<div style="height:${alto}px;line-height:${alto}px;font-size:1px;">&nbsp;</div>`;

export const parrafo = (html: string, estilo = "") =>
  `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:${COLOR.tinta};${estilo}">${html}</p>`;

type Marco = {
  asunto: string;
  /** Texto que se ve en la bandeja de entrada al lado del asunto. */
  preheader: string;
  ceja: string;
  titulo: string;
  bajada?: string;
  cuerpo: string;
  contacto: { email: string; whatsappHref: string | null; whatsapp: string };
  /** Mail informativo: el pie aclara que no hace falta responderlo y deriva las consultas al contacto. */
  automatico?: boolean;
  /** Por qué le llega este mail (pie). */
  motivo: string;
};

/** Esqueleto común de todos los mails de Edén. */
export function marco(m: Marco) {
  const contacto = [
    m.contacto.whatsappHref
      ? `<a href="${urlSegura(m.contacto.whatsappHref)}" target="_blank" style="color:${COLOR.tinta};text-decoration:underline;">WhatsApp ${escapar(m.contacto.whatsapp)}</a>`
      : "",
    m.contacto.email
      ? `<a href="mailto:${escapar(m.contacto.email)}" style="color:${COLOR.tinta};text-decoration:underline;">${escapar(m.contacto.email)}</a>`
      : "",
  ]
    .filter(Boolean)
    .join(`&nbsp;&nbsp;·&nbsp;&nbsp;`);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapar(m.asunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${COLOR.tinta}; }
  @media (max-width:600px) {
    .exterior { padding:12px 8px !important; }
    .px { padding-left:22px !important; padding-right:22px !important; }
    .titulo { font-size:30px !important; }
    .caja { padding:16px 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLOR.papel};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapar(m.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.papel}" style="background:${COLOR.papel};">
<tr><td align="center" class="exterior" style="padding:28px 12px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${COLOR.nota};border-radius:28px;border:1px solid ${COLOR.linea};">
    <tr><td align="center" class="px" style="padding:36px 40px 8px;">
      <div style="font-family:${SERIF};font-size:34px;letter-spacing:10px;text-transform:uppercase;color:${COLOR.raiz};line-height:1;">Edén</div>
      <div style="margin-top:8px;font-family:${SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${COLOR.suave};">Biblias y journals de cuero</div>
      <div style="width:44px;height:2px;background:${COLOR.oro};margin:20px auto 0;line-height:2px;font-size:1px;">&nbsp;</div>
    </td></tr>
    <tr><td align="center" class="px" style="padding:24px 40px 4px;text-align:center;">
      ${rotulo(m.ceja)}
      <h1 class="titulo" style="margin:10px 0 0;font-family:${SERIF};font-weight:500;font-size:34px;line-height:1.15;color:${COLOR.raiz};">${escapar(m.titulo)}</h1>
      ${m.bajada ? `<p style="margin:14px auto 0;max-width:440px;font-family:${SERIF};font-style:italic;font-size:19px;line-height:1.45;color:${COLOR.suave};">${escapar(m.bajada)}</p>` : ""}
    </td></tr>
    <tr><td class="px" style="padding:28px 40px 12px;">
      ${m.cuerpo}
    </td></tr>
    <tr><td align="center" class="px" style="padding:12px 40px 32px;background:${COLOR.nota};border-radius:0 0 28px 28px;">
      <div style="width:100%;height:1px;background:${COLOR.linea};line-height:1px;font-size:1px;margin-bottom:22px;">&nbsp;</div>
      <div style="font-family:${SERIF};font-style:italic;font-size:21px;color:${COLOR.raiz};">“De regreso al Jardín.”</div>
      ${m.automatico ? `<div style="margin-top:12px;font-family:${SANS};font-size:13px;line-height:1.6;color:${COLOR.tinta};">Este es un mail automático, no hace falta responderlo.${contacto ? " Si necesitás algo, escribinos a:" : ""}</div>` : ""}
      ${contacto ? `<div style="margin-top:12px;font-family:${SANS};font-size:13px;line-height:1.6;color:${COLOR.tinta};">${contacto}</div>` : ""}
      <div style="margin-top:14px;font-family:${SANS};font-size:11px;line-height:1.5;color:${COLOR.suave};">${escapar(m.motivo)}</div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
