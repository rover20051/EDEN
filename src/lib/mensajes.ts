import "server-only";
import { ars, numeroPedido } from "@/lib/format";
import { avisoYaSalio, mandarAviso, mandarMail, yaRegistrado } from "@/lib/mails/envio";
import { escapar } from "@/lib/mails/html";
import {
  mailEnCamino,
  mailListaEspera,
  mailPagoConfirmado,
  mailPedidoRecibido,
  PEDIDO_EJEMPLO,
  sitio,
  type ContactoMail,
  type PedidoMail,
} from "@/lib/mails/plantillas";
import { supabaseServidor } from "@/lib/supabase/servidor";
import { CANALES, MEDIOS, SOCIOS } from "@/lib/textos";

// Mails al cliente y avisos de venta a las socias (también por mail). Todo queda registrado en la tabla "mensajes".
// Ninguna función tira error: si algo falla se registra y el flujo de compra sigue.
// Son idempotentes: si la misma acción se repite (ej. el webhook de Nave llega dos veces), no se manda dos veces.

type Pedido = PedidoMail & {
  id: string;
  tipo: "venta" | "salida";
  estado: string;
  canal: string;
  email: string | null;
  salida_motivo: string | null;
  salida_por: string | null;
  created_by: string;
};

const SELECT = `id, numero, tipo, estado, canal, medio_pago, subtotal, descuento_set, descuento, cupon, envio_cobrado, total,
  es_regalo, regalo_para, vence_at, direccion_envio, token_publico, salida_motivo, salida_por, created_by,
  cliente:clientes(nombre, email),
  envio:envios(empresa, seguimiento),
  items:pedido_items(cantidad, precio_unitario, producto:productos(nombre), pack:packs(nombre))`;

type EnvioFila = { empresa: string; seguimiento: string | null };
type Fila = Omit<Pedido, "nombre" | "email" | "token" | "items" | "envio" | "envio_gratis"> & {
  token_publico: string;
  cliente: { nombre: string; email: string | null } | null;
  envio: EnvioFila | EnvioFila[] | null;
  items: { cantidad: number; precio_unitario: number; producto: { nombre: string } | null; pack: { nombre: string } | null }[];
};

const AJUSTES = "alias_transferencia, email_contacto, whatsapp_contacto, horas_vencimiento_transferencia";

function contactoDe(aj: Record<string, unknown> | null): ContactoMail {
  return {
    alias: String(aj?.alias_transferencia ?? ""),
    email: String(aj?.email_contacto ?? ""),
    whatsapp: String(aj?.whatsapp_contacto ?? ""),
    horas: Number(aj?.horas_vencimiento_transferencia ?? 48),
  };
}

async function cargar(pedidoId: string): Promise<{ p: Pedido; c: ContactoMail } | null> {
  const sb = supabaseServidor();
  const [{ data, error }, { data: aj }] = await Promise.all([
    sb.from("pedidos").select(SELECT).eq("id", pedidoId).maybeSingle(),
    sb.from("ajustes").select(`${AJUSTES}, envio_gratis_desde`).eq("id", 1).maybeSingle(),
  ]);
  if (error || !data) {
    console.error("[mensajes] no se pudo leer el pedido", pedidoId, error?.message);
    return null;
  }
  const { cliente, envio, items, token_publico, ...f } = data as unknown as Fila;
  const gratisDesde = (aj?.envio_gratis_desde as number | null | undefined) ?? null;
  const p: Pedido = {
    ...f,
    tipo: f.tipo ?? "venta",
    nombre: cliente?.nombre ?? "",
    email: cliente?.email ?? null,
    token: token_publico,
    items: (items ?? []).map((i) => ({ nombre: i.producto?.nombre ?? "Producto", cantidad: i.cantidad, precio: i.precio_unitario, pack: i.pack?.nombre ?? null })),
    envio: Array.isArray(envio) ? (envio[0] ?? null) : envio,
    envio_gratis: f.envio_cobrado === 0 && gratisDesde != null && f.subtotal - f.descuento_set - f.descuento >= gratisDesde,
  };
  return { p, c: contactoDe(aj) };
}

// ───────────── Textos de los avisos a las socias ─────────────

/** "Ana Pérez" → "Ana P." */
const nombreCorto = (n: string) => {
  const [a, b] = n.trim().split(/\s+/);
  return b ? `${a} ${b[0].toUpperCase()}.` : a || "Sin nombre";
};

const linkAdmin = (p: Pedido) => `<a href="${escapar(`${sitio()}/admin/pedidos/${p.id}`)}">${escapar(numeroPedido(p.numero))}</a>`;

/** "1× Set Origen, 2× Journal Anaj" (los packs se guardan como sus productos: se muestran una vez por pack). */
const lineaItems = (p: Pedido) => {
  const packs = new Map<string, number>();
  const sueltos: string[] = [];
  for (const i of p.items) {
    if (i.pack) packs.set(i.pack, Math.max(packs.get(i.pack) ?? 0, i.cantidad));
    else sueltos.push(`${i.cantidad}× ${i.nombre}`);
  }
  return escapar([...[...packs].map(([n, c]) => `${c}× ${n}`), ...sueltos].join(", "));
};

const medio = (m: string) => (m === "nave" ? "Tarjeta" : (MEDIOS[m as keyof typeof MEDIOS] ?? m));

const MOTIVOS: Record<string, string> = { regalo: "Regalo", influencer: "Influencer", reposicion: "Reposición", muestra: "Muestra", otro: "Salida" };

const avisoRegalo = (p: Pedido) => (p.es_regalo ? `\n🎀 Es regalo${p.regalo_para ? ` para ${escapar(p.regalo_para)}` : ""}` : "");

function textoAvisoSalida(p: Pedido) {
  const por = p.salida_por ? ` de ${SOCIOS[p.salida_por as keyof typeof SOCIOS] ?? p.salida_por}` : "";
  return `🎁 <b>Salida sin cobro</b> ${linkAdmin(p)} · ${escapar(`${MOTIVOS[p.salida_motivo ?? "otro"] ?? "Salida"}${por}`)} · para ${escapar(nombreCorto(p.nombre))}\n${lineaItems(p)}`;
}

function textoAvisoPedido(p: Pedido, cargo: string | null) {
  const pendiente = p.estado === "pendiente_pago";
  const estadoPago = pendiente ? (p.medio_pago === "nave" ? "pago en curso" : "esperando pago") : "pagado";
  const cabeza =
    p.canal === "web"
      ? `🛒 <b>Nuevo pedido web</b> ${linkAdmin(p)}`
      : `📝 <b>Pedido cargado</b> ${linkAdmin(p)} · ${escapar(CANALES[p.canal as keyof typeof CANALES] ?? p.canal)}`;
  return (
    `${cabeza} · ${escapar(nombreCorto(p.nombre))} · ${escapar(ars(p.total))} · ${escapar(medio(p.medio_pago))} (${estadoPago})` +
    `\n${lineaItems(p)}${avisoRegalo(p)}${cargo ? `\nCargó ${escapar(cargo)}` : ""}`
  );
}

const textoAvisoPago = (p: Pedido) =>
  `💳 <b>Pagado</b> ${linkAdmin(p)} · ${escapar(nombreCorto(p.nombre))} · ${escapar(ars(p.total))} · ${escapar(medio(p.medio_pago))} · a preparar\n${lineaItems(p)}${avisoRegalo(p)}`;

/** Avisos a las socias con datos de ejemplo (vista previa en Ajustes → Mails y avisos). */
export async function ejemplosAvisos(): Promise<{ tipo: string; titulo: string; texto: string }[]> {
  const base: Pedido = {
    ...PEDIDO_EJEMPLO,
    id: "00000000-0000-0000-0000-000000000000",
    tipo: "venta",
    estado: "pendiente_pago",
    canal: "web",
    email: null,
    salida_motivo: null,
    salida_por: null,
    created_by: "sistema",
  };
  return [
    { tipo: "aviso_pedido", titulo: "Aviso: pedido web nuevo", texto: textoAvisoPedido(base, null) },
    { tipo: "aviso_pago", titulo: "Aviso: pago confirmado", texto: textoAvisoPago({ ...base, estado: "pagado" }) },
    {
      tipo: "aviso_salida",
      titulo: "Aviso: salida sin cobro",
      texto: textoAvisoSalida({ ...base, numero: 13, tipo: "salida", estado: "pagado", nombre: "Juan Pérez", salida_motivo: "regalo", salida_por: "nari", es_regalo: false }),
    },
  ];
}

async function quienCargo(email: string): Promise<string | null> {
  if (!email || email === "sistema") return null;
  const { data } = await supabaseServidor().from("admins").select("nombre").eq("email", email.toLowerCase()).maybeSingle();
  return (data?.nombre as string | undefined) ?? null;
}

// ───────────── Contrato ─────────────

/** Pedido nuevo (web o carga manual): mail al cliente según el medio de pago + aviso a las socias. */
export async function notificarPedidoNuevo(pedidoId: string): Promise<void> {
  try {
    const d = await cargar(pedidoId);
    if (!d) return;
    const { p, c } = d;

    // Salida sin cobro: solo aviso interno, nunca mail al cliente.
    if (p.tipo === "salida") {
      if (await avisoYaSalio(p.id, "aviso_salida")) return;
      await mandarAviso({ pedidoId: p.id, tipo: "aviso_salida", texto: textoAvisoSalida(p) });
      return;
    }

    const pendiente = p.estado === "pendiente_pago";
    const web = p.canal === "web";

    // Mail al cliente solo para transferencia pendiente (web o manual). Con tarjeta el pago se hace en el momento:
    // el mail que llega es el de "pago confirmado" (mandar también "terminá el pago" serían dos mails en un minuto).
    if (p.email && pendiente && p.medio_pago === "transferencia" && !(await yaRegistrado(p.id, "pedido_recibido", "mail"))) {
      const mail = mailPedidoRecibido(p, c);
      await mandarMail({ pedidoId: p.id, tipo: "pedido_recibido", para: p.email, asunto: mail.asunto, html: mail.html });
    }

    if (await avisoYaSalio(p.id, "aviso_pedido")) return;
    const cargo = web ? null : await quienCargo(p.created_by);
    await mandarAviso({ pedidoId: p.id, tipo: "aviso_pedido", texto: textoAvisoPedido(p, cargo) });
  } catch (e) {
    console.error("[mensajes] notificarPedidoNuevo", e);
  }
}

/** Pago confirmado (tarjeta aprobada o transferencia confirmada): mail al cliente + aviso a las socias. */
export async function notificarPagoConfirmado(pedidoId: string): Promise<void> {
  try {
    const d = await cargar(pedidoId);
    if (!d || d.p.tipo === "salida") return;
    const { p, c } = d;

    if (p.email && !(await yaRegistrado(p.id, "pago_confirmado", "mail"))) {
      const mail = mailPagoConfirmado(p, c);
      await mandarMail({ pedidoId: p.id, tipo: "pago_confirmado", para: p.email, asunto: mail.asunto, html: mail.html });
    }
    if (!(await avisoYaSalio(p.id, "aviso_pago"))) {
      await mandarAviso({ pedidoId: p.id, tipo: "aviso_pago", texto: textoAvisoPago(p) });
    }
  } catch (e) {
    console.error("[mensajes] notificarPagoConfirmado", e);
  }
}

/** Pedido despachado: mail "va en camino" con el seguimiento. */
export async function notificarDespacho(pedidoId: string): Promise<void> {
  try {
    const d = await cargar(pedidoId);
    if (!d || d.p.tipo === "salida" || !d.p.email) return;
    const { p, c } = d;
    if (await yaRegistrado(p.id, "en_camino", "mail")) return;
    const mail = mailEnCamino(p, c);
    await mandarMail({ pedidoId: p.id, tipo: "en_camino", para: d.p.email, asunto: mail.asunto, html: mail.html });
  } catch (e) {
    console.error("[mensajes] notificarDespacho", e);
  }
}

/**
 * Volvió el stock de un producto: mail a su lista de espera (una sola vez por persona).
 * Solo se marca "avisado" si el mail salió de verdad: en modo prueba queda simulado y la persona sigue en la lista,
 * así cuando se activen los mails reales nadie se queda sin su aviso.
 */
export async function avisarListaEspera(productoId: string): Promise<void> {
  try {
    const sb = supabaseServidor();
    const [{ data: prod }, { data: stock }, { data: aj }] = await Promise.all([
      sb.from("productos").select("nombre, tipo, precio, activo").eq("id", productoId).maybeSingle(),
      sb.from("v_stock").select("disponibles").eq("producto_id", productoId).maybeSingle(),
      sb.from("ajustes").select(AJUSTES).eq("id", 1).maybeSingle(),
    ]);
    const disponibles = Number(stock?.disponibles ?? 0);
    if (!prod?.activo || disponibles <= 0) return;

    const { data: filas, error } = await sb
      .from("lista_espera")
      .select("id, email, nombre")
      .eq("producto_id", productoId)
      .is("avisado_at", null)
      .order("created_at")
      .limit(300);
    if (error) {
      console.error("[mensajes] lista de espera:", error.message);
      return;
    }
    const c = contactoDe(aj);
    for (const f of filas ?? []) {
      const mail = mailListaEspera({ nombre: f.nombre as string | null, producto: prod.nombre as string, tipo: prod.tipo as string, precio: prod.precio as number }, c);
      const estado = await mandarMail({ pedidoId: null, tipo: "lista_espera", para: f.email as string, asunto: mail.asunto, html: mail.html });
      if (estado === "enviado") await sb.from("lista_espera").update({ avisado_at: new Date().toISOString() }).eq("id", f.id);
    }
  } catch (e) {
    console.error("[mensajes] avisarListaEspera", e);
  }
}
