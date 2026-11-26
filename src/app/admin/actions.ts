"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { MAX_FOTO_BYTES, MIME_FOTO, tipoRealFoto } from "@/lib/fotos";
import { aPesos } from "@/lib/format";
import { credencialesListas } from "@/lib/pagos";
import { avisarListaEspera, notificarDespacho, notificarPagoConfirmado, notificarPedidoNuevo } from "@/lib/mensajes";
import { createClient } from "@/lib/supabase/server";

export type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string };

const ok = (mensaje?: string): Resultado => ({ ok: true, mensaje });
const fallo = (error: string): Resultado => ({ ok: false, error });

/** Corre una operación de la base: valida el admin, traduce el error y refresca el /admin. */
async function rpc(nombre: string, args: Record<string, unknown>): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc(nombre, args);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return ok();
}

// ───────────── Pedidos ─────────────

const pedidoSchema = z.object({
  cliente: z.object({
    nombre: z.string().trim().min(1, "Falta el nombre"),
    whatsapp: z.string().trim().optional(),
    email: z.union([z.literal(""), z.email("Mail inválido")]).optional(),
    provincia: z.string().trim().optional(),
    origen: z.string().optional(),
  }),
  canal: z.enum(["whatsapp", "instagram", "web", "feria", "iglesia", "otro"]),
  medio_pago: z.enum(["transferencia", "nave", "mercadopago", "efectivo", "otro"]),
  ya_pagado: z.boolean(),
  items: z
    .array(
      z.union([
        z.object({ producto_id: z.uuid(), cantidad: z.number().int().positive() }),
        z.object({ pack_id: z.uuid(), cantidad: z.number().int().positive() }),
      ]),
    )
    .min(1, "Elegí al menos un producto"),
  /** "salida" = sale sin cobrarse (regalo de Edén, influencer, reposición): tiene costo y no ingresa plata. */
  tipo: z.enum(["venta", "salida"]).default("venta"),
  salida_motivo: z.enum(["regalo", "influencer", "reposicion", "muestra", "otro"]).optional(),
  salida_por: z.enum(["fede", "nari", "mich", "eden"]).optional(),
  cupon: z.string().trim().max(30).optional(),
  descuento: z.number().int().nonnegative().default(0),
  envio_cobrado: z.number().int().nonnegative().default(0),
  grabado: z.string().optional(),
  nota: z.string().optional(),
  es_regalo: z.boolean().optional(),
  regalo_para: z.string().trim().max(80).optional(),
  regalo_mensaje: z.string().trim().max(300).optional(),
  direccion_envio: z.string().optional(),
});
export type NuevoPedido = z.input<typeof pedidoSchema>;

export async function crearPedido(datos: NuevoPedido): Promise<Resultado> {
  const parsed = pedidoSchema.safeParse(datos);
  if (!parsed.success) return fallo(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const { supabase } = await requireAdmin();
  const { data: id, error } = await supabase.rpc("crear_pedido", { p: parsed.data });
  if (error) return fallo(error.message);

  // Mail al cliente (si corresponde) y aviso a las socias, después de responder: no demora la carga.
  after(() => notificarPedidoNuevo(id as string));
  revalidatePath("/admin", "layout");
  redirect(`/admin/pedidos/${id}`);
}

export async function confirmarPago(pedidoId: string) {
  const r = await rpc("confirmar_pago", { p_pedido: pedidoId });
  if (r.ok) after(() => notificarPagoConfirmado(pedidoId));
  return r;
}

export async function rechazarComprobante(pedidoId: string) {
  return rpc("rechazar_comprobante", { p_pedido: pedidoId });
}

export async function pasarAPreparacion(pedidoId: string) {
  return rpc("pasar_a_preparacion", { p_pedido: pedidoId });
}

export async function marcarEntregado(pedidoId: string) {
  return rpc("marcar_entregado", { p_pedido: pedidoId });
}

export async function cancelarPedido(pedidoId: string) {
  return rpc("cancelar_pedido", { p_pedido: pedidoId });
}

export async function extenderVencimiento(pedidoId: string) {
  return rpc("extender_vencimiento", { p_pedido: pedidoId, p_horas: 24 });
}

export async function despachar(pedidoId: string, _prev: Resultado | null, form: FormData): Promise<Resultado> {
  const empresa = String(form.get("empresa") ?? "").trim();
  const costo = aPesos(form.get("costo"));
  if (!empresa) return fallo("Falta la empresa de envío");
  if (costo == null) return fallo("Falta el costo real del envío");
  const r = await rpc("despachar", {
    p_pedido: pedidoId,
    p_empresa: empresa,
    p_seguimiento: String(form.get("seguimiento") ?? ""),
    p_costo: costo,
  });
  if (r.ok) after(() => notificarDespacho(pedidoId));
  return r;
}

// ───────────── Plata ─────────────

const gastoSchema = z.object({
  monto: z.number().int().positive("Falta el monto"),
  categoria: z.enum(["produccion", "publicidad", "envios", "desarrollo", "operativo", "otro"]),
  descripcion: z.string().trim().min(1, "Falta qué fue"),
  proveedor: z.string().trim().max(80).optional().transform((v) => v || null),
  pagado_por: z.enum(["eden", "fede", "nari", "mich", "nari_mich"]),
  fecha: z.iso.date(),
});

export async function crearGasto(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  const parsed = gastoSchema.safeParse({
    monto: aPesos(form.get("monto")) ?? 0,
    categoria: form.get("categoria"),
    descripcion: form.get("descripcion"),
    proveedor: String(form.get("proveedor") ?? ""),
    pagado_por: form.get("pagado_por"),
    fecha: form.get("fecha"),
  });
  if (!parsed.success) return fallo(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("gastos").insert(parsed.data);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return ok("Gasto cargado");
}

const gastoEditadoSchema = gastoSchema.extend({
  // Los gastos que vinieron de la planilla pueden no tener fecha.
  fecha: z.union([z.iso.date(), z.literal("").transform(() => null)]),
});

/** Corrige un gasto ya cargado. Si cambia quién lo pagó, solo queda como devuelta la parte de quien sigue en el gasto. */
export async function editarGasto(id: string, _prev: Resultado | null, form: FormData): Promise<Resultado> {
  const parsed = gastoEditadoSchema.safeParse({
    monto: aPesos(form.get("monto")) ?? 0,
    categoria: form.get("categoria"),
    descripcion: form.get("descripcion"),
    proveedor: String(form.get("proveedor") ?? ""),
    pagado_por: form.get("pagado_por"),
    fecha: form.get("fecha") ?? "",
  });
  if (!parsed.success) return fallo(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const { supabase } = await requireAdmin();
  const { data: actual, error: e1 } = await supabase.from("gastos").select("moneda, reintegrado_a").eq("id", id).single();
  if (e1 || !actual) return fallo("No encontramos ese gasto");

  const partes = partesDe(parsed.data.pagado_por);
  const reintegrado_a = ((actual.reintegrado_a ?? []) as string[]).filter((s) => partes.includes(s));
  const { error } = await supabase
    .from("gastos")
    .update({
      ...parsed.data,
      ...(actual.moneda === "ARS" ? { monto_original: parsed.data.monto } : {}),
      reintegrado_a,
      reintegrado: partes.length > 0 && partes.every((s) => reintegrado_a.includes(s)),
    })
    .eq("id", id);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return ok("Gasto actualizado");
}

export async function borrarGasto(id: string): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return ok();
}

/** Quiénes pusieron la plata de un gasto. "Nari y Mich" = mitad cada una. "Edén" = salió de la caja, nadie lo adelantó. */
const partesDe = (pagadoPor: string) => (pagadoPor === "nari_mich" ? ["nari", "mich"] : pagadoPor === "eden" ? [] : [pagadoPor]);

/** Marca como devuelto todo lo que un socio puso de su bolsillo (en los gastos compartidos, solo su mitad). */
export async function reintegrarSocio(socio: "fede" | "nari" | "mich"): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const { data: gastos, error } = await supabase
    .from("gastos")
    .select("id, pagado_por, reintegrado_a")
    .in("pagado_por", [socio, "nari_mich"]);
  if (error) return fallo(error.message);
  for (const g of gastos ?? []) {
    const ya = (g.reintegrado_a ?? []) as string[];
    if (ya.includes(socio)) continue;
    const nuevo = [...ya, socio];
    const { error: e } = await supabase
      .from("gastos")
      .update({ reintegrado_a: nuevo, reintegrado: partesDe(g.pagado_por).every((x) => nuevo.includes(x)) })
      .eq("id", g.id);
    if (e) return fallo(e.message);
  }
  revalidatePath("/admin", "layout");
  return ok("Reintegro registrado");
}

// ───────────── Ajustes ─────────────

/** Guarda precios y "a la venta" de todo el catálogo en un solo paso. */
export async function guardarCatalogo(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  const { supabase } = await requireAdmin();
  const { data: productos, error: e1 } = await supabase.from("productos").select("id, precio, activo, etiqueta, precio_anterior");
  if (e1) return fallo(e1.message);

  const cambios = (productos ?? []).flatMap((p) => {
    const precio = aPesos(form.get(`precio_${p.id}`));
    const activo = form.get(`activo_${p.id}`) === "on";
    const etiqueta = String(form.get(`etiqueta_${p.id}`) ?? "").trim().slice(0, 30) || null;
    const antes = aPesos(form.get(`anterior_${p.id}`));
    // El precio anterior solo tiene sentido si es mayor al actual (si no, no hay descuento que mostrar).
    const precio_anterior = antes && precio && antes > precio ? antes : null;
    if (precio == null || precio <= 0) return [];
    const nuevo = { precio, activo, etiqueta, precio_anterior };
    const igual = precio === p.precio && activo === p.activo && etiqueta === p.etiqueta && precio_anterior === p.precio_anterior;
    return igual ? [] : [{ id: p.id, ...nuevo }];
  });
  for (const { id, ...c } of cambios) {
    const { error } = await supabase.from("productos").update(c).eq("id", id);
    if (error) return fallo(error.message);
  }
  revalidatePath("/admin", "layout");
  return ok(cambios.length ? `Guardado (${cambios.length} cambio${cambios.length > 1 ? "s" : ""})` : "No había cambios");
}

const loteSchema = z.object({
  producto_id: z.uuid("Elegí el producto"),
  unidades: z.number().int().positive("Faltan las unidades"),
  merma: z.number().int().nonnegative(),
  costo_unitario: z.number().int().positive("Falta el costo por unidad"),
  fecha: z.iso.date(),
});

export async function crearLote(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  const parsed = loteSchema.safeParse({
    producto_id: form.get("producto_id"),
    unidades: aPesos(form.get("unidades")) ?? 0,
    merma: aPesos(form.get("merma")) ?? 0,
    costo_unitario: aPesos(form.get("costo_unitario")) ?? 0,
    fecha: form.get("fecha"),
  });
  if (!parsed.success) return fallo(parsed.error.issues[0]?.message ?? "Datos inválidos");
  if (parsed.data.merma >= parsed.data.unidades) return fallo("La merma no puede ser mayor que el lote");

  const { supabase } = await requireAdmin();
  const { data: ultimo } = await supabase
    .from("lotes")
    .select("numero")
    .eq("producto_id", parsed.data.producto_id)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("lotes").insert({ ...parsed.data, numero: (ultimo?.numero ?? 0) + 1 });
  if (error) return fallo(error.message);
  after(() => avisarListaEspera(parsed.data.producto_id));
  revalidatePath("/admin", "layout");
  return ok("Lote cargado");
}

export async function guardarAjustes(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  const email = String(form.get("email_contacto") ?? "").trim().toLowerCase();
  if (email && !z.email().safeParse(email).success) return fallo("Revisá el mail de contacto");
  // El aviso de la barra de la web llega con la migración 0012: sin el campo en el formulario no se toca
  const aviso = form.has("aviso_barra") ? String(form.get("aviso_barra") ?? "").replace(/\s+/g, " ").trim() : undefined;
  if (aviso && aviso.length > 120) return fallo("El aviso de la barra puede tener hasta 120 letras");
  const datos = {
    alias_transferencia: String(form.get("alias_transferencia") ?? "").trim(),
    email_contacto: email,
    whatsapp_contacto: String(form.get("whatsapp_contacto") ?? "").trim(),
    precio_set: aPesos(form.get("precio_set")) ?? 0,
    ...(aviso !== undefined ? { aviso_barra: aviso || null } : {}),
    updated_at: new Date().toISOString(),
  };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("ajustes").update(datos).eq("id", 1);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return ok("Guardado");
}

/**
 * Con qué pasarela se cobra la tarjeta en la web (Mercado Pago o Nave). No deja elegir una cuyas credenciales reales no
 * estén cargadas en Vercel: los clientes verían "Muy pronto" en vez de poder pagar.
 */
export async function guardarPasarela(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  const pasarela = String(form.get("pasarela") ?? "");
  if (pasarela !== "mercadopago" && pasarela !== "nave") return fallo("Elegí con qué pasarela cobrar");
  if (!credencialesListas(pasarela, "real")) {
    return fallo(`Faltan las credenciales de ${pasarela === "nave" ? "Nave" : "Mercado Pago"} en Vercel. Con ellas cargadas (y publicado de nuevo) se puede elegir.`);
  }
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("ajustes").update({ pasarela, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return ok(`Desde ahora la tarjeta se cobra con ${pasarela === "nave" ? "Nave" : "Mercado Pago"}`);
}

const adminSchema = z.object({
  email: z.email("Mail inválido").transform((e) => e.toLowerCase()),
  nombre: z.string().trim().min(1, "Falta el nombre"),
  socio: z.enum(["fede", "nari", "mich"]),
});

/** Corrige el nombre o a quién corresponde un acceso. El mail no se cambia: es con el que entra a su usuario. */
export async function editarAdmin(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  const parsed = adminSchema.safeParse({
    email: form.get("email"),
    nombre: form.get("nombre"),
    socio: form.get("socio"),
  });
  if (!parsed.success) return fallo(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const { supabase } = await requireAdmin();
  const { email, nombre, socio } = parsed.data;
  const { error } = await supabase.from("admins").update({ nombre, socio }).eq("email", email);
  if (error) return fallo(error.message);
  revalidatePath("/admin", "layout");
  return ok("Guardado");
}

/** Foto de quien está logueado (se ve en el encabezado). Va en el bucket público de fotos, con un nombre imposible de adivinar. */
export async function guardarFotoPerfil(form: FormData): Promise<Resultado> {
  const archivo = form.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return fallo("Falta la foto");
  if (archivo.size > MAX_FOTO_BYTES) return fallo("La foto pesa más de 5 MB");
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const ext = tipoRealFoto(bytes);
  if (!ext) return fallo("La foto tiene que ser JPG, PNG o WebP");
  const { supabase, admin } = await requireAdmin();
  const { data: antes } = await supabase.from("admins").select("foto_path").eq("email", admin.email).maybeSingle();
  const path = `equipo/${randomUUID()}.${ext}`;
  const subida = await supabase.storage.from("productos").upload(path, bytes, { contentType: MIME_FOTO[ext], cacheControl: "31536000", upsert: false });
  if (subida.error) return fallo(`No se pudo subir la foto: ${subida.error.message}`);
  const { error } = await supabase.from("admins").update({ foto_path: path }).eq("email", admin.email);
  if (error) {
    await supabase.storage.from("productos").remove([path]);
    return fallo(error.message);
  }
  if (antes?.foto_path) await supabase.storage.from("productos").remove([antes.foto_path as string]);
  revalidatePath("/admin", "layout");
  return ok("Foto guardada");
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ───────────── Números (lo que era el Excel) ─────────────

export async function guardarPlan(plan: unknown): Promise<Resultado> {
  const { planSchema } = await import("@/lib/plan");
  const parsed = planSchema.safeParse(plan);
  if (!parsed.success) return fallo("Hay un valor inválido: " + (parsed.error.issues[0]?.path.join(" › ") ?? ""));
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("ajustes").update({ plan: parsed.data, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return fallo(error.message);
  revalidatePath("/admin/numeros");
  return ok("Supuestos guardados");
}
