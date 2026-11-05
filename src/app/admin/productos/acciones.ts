"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { aPesos } from "@/lib/format";
import { MAX_FOTO_BYTES } from "@/lib/fotos";

/** Resultado con el id de lo que se creó (para ofrecer el paso siguiente, ej. cargar su primera tanda). */
export type ResultadoAlta = (Resultado & { id?: string }) | null;

type Supa = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

const ok = (mensaje?: string, id?: string) => ({ ok: true as const, mensaje, id });
const fallo = (error: string) => ({ ok: false as const, error });
const primerError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos";

const texto = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const opcional = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => v || null);

/** "Biblia Jardín" → "biblia-jardin" */
function aSlug(nombre: string) {
  return (
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "producto"
  );
}

/** Slug libre en la tabla: "biblia-jardin", y si ya existe "biblia-jardin-2", "-3"… */
async function slugLibre(supabase: Supa, tabla: "productos" | "packs", nombre: string) {
  const base = aSlug(nombre);
  const { data } = await supabase.from(tabla).select("slug").like("slug", `${base}%`);
  const usados = new Set((data ?? []).map((r) => r.slug as string));
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
}

// ───────────── Fotos ─────────────

/** Mira los primeros bytes (no confía en el nombre ni en el tipo que manda el navegador). */
function tipoReal(b: Uint8Array): "jpg" | "png" | "webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  return null;
}

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/**
 * Sube la foto del formulario (campo "foto") al bucket público "productos".
 * Devuelve el path guardado, null si no vino foto, o un error legible.
 */
async function subirFoto(supabase: Supa, form: FormData, carpeta: "productos" | "packs", slug: string) {
  const archivo = form.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return { path: null };
  if (archivo.size > MAX_FOTO_BYTES) return { error: "La foto pesa más de 5 MB" };
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const ext = tipoReal(bytes);
  if (!ext) return { error: "La foto tiene que ser JPG, PNG o WebP" };
  const path = `${carpeta}/${slug}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("productos")
    .upload(path, bytes, { contentType: MIME[ext], cacheControl: "31536000", upsert: false });
  if (error) return { error: `No se pudo subir la foto: ${error.message}` };
  return { path };
}

/** Borra una foto vieja del bucket (solo las que subimos nosotros). Si falla no corta nada. */
async function borrarFoto(supabase: Supa, path: string | null | undefined) {
  if (!path || !/^(productos|packs)\/[a-z0-9-]+\.(jpg|png|webp)$/.test(path)) return;
  await supabase.storage.from("productos").remove([path]);
}

function refrescar() {
  revalidatePath("/admin", "layout");
}

// ───────────── Productos ─────────────

const camposProducto = {
  nombre: z.string().trim().min(2, "Falta el nombre").max(60, "El nombre es muy largo"),
  verbo: opcional(30, "El verbo puede tener hasta 30 letras"),
  descripcion: opcional(300, "La descripción puede tener hasta 300 letras"),
};

const nuevoProductoSchema = z.object({
  ...camposProducto,
  tipo: z.enum(["biblia", "journal"], "Elegí si es Biblia o Journal"),
  diseno: z.string().trim().min(1, "Falta el diseño").max(40, "El diseño es muy largo"),
  precio: z.number().int().positive("Falta el precio"),
  precio_anterior: z.number().int().positive().nullable(),
  etiqueta: opcional(30, "La etiqueta puede tener hasta 30 letras"),
  activo: z.boolean(),
});

/** Alta de un producto con su foto. Queda con stock 0 hasta que se cargue su primera tanda. */
export async function crearProducto(_prev: ResultadoAlta, form: FormData): Promise<ResultadoAlta> {
  const parsed = nuevoProductoSchema.safeParse({
    nombre: texto(form, "nombre"),
    tipo: texto(form, "tipo"),
    diseno: texto(form, "diseno"),
    precio: aPesos(form.get("precio")) ?? 0,
    precio_anterior: aPesos(form.get("precio_anterior")),
    etiqueta: texto(form, "etiqueta"),
    descripcion: texto(form, "descripcion"),
    verbo: texto(form, "verbo"),
    activo: form.get("activo") === "on",
  });
  if (!parsed.success) return fallo(primerError(parsed.error));
  const d = parsed.data;

  const { supabase } = await requireAdmin();
  // La web une cada producto con su par (Biblia ↔ Journal) y con sus fotos por tipo + diseño: no puede repetirse.
  const { data: mismos } = await supabase.from("productos").select("nombre").eq("tipo", d.tipo).ilike("diseno", d.diseno.replace(/[\\%_]/g, "\\$&"));
  if (mismos?.length) return fallo(`Ya existe ${mismos[0].nombre} con el diseño ${d.diseno}`);

  const slug = await slugLibre(supabase, "productos", d.nombre);
  const foto = await subirFoto(supabase, form, "productos", slug);
  if ("error" in foto) return fallo(foto.error as string);

  const { data: ultimo } = await supabase.from("productos").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("productos")
    .insert({
      slug,
      nombre: d.nombre,
      tipo: d.tipo,
      diseno: d.diseno,
      precio: d.precio,
      precio_anterior: d.precio_anterior && d.precio_anterior > d.precio ? d.precio_anterior : null,
      etiqueta: d.etiqueta,
      descripcion: d.descripcion,
      verbo: d.verbo ? d.verbo.toUpperCase() : null,
      foto_path: foto.path,
      activo: d.activo,
      orden: (ultimo?.orden ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) {
    await borrarFoto(supabase, foto.path);
    return fallo(error.message);
  }
  refrescar();
  return ok(`${d.nombre} creado`, data.id);
}

const editarProductoSchema = z.object({ id: z.uuid("Producto inválido"), ...camposProducto });

/** Edita los textos y la foto de un producto (precio, etiqueta y "en web" se guardan desde la tabla). */
export async function editarProducto(_prev: ResultadoAlta, form: FormData): Promise<ResultadoAlta> {
  const parsed = editarProductoSchema.safeParse({
    id: texto(form, "id"),
    nombre: texto(form, "nombre"),
    descripcion: texto(form, "descripcion"),
    verbo: texto(form, "verbo"),
  });
  if (!parsed.success) return fallo(primerError(parsed.error));
  const d = parsed.data;

  const { supabase } = await requireAdmin();
  const { data: actual, error: e1 } = await supabase.from("productos").select("slug, foto_path").eq("id", d.id).single();
  if (e1 || !actual) return fallo("No encontramos el producto");

  const foto = await subirFoto(supabase, form, "productos", actual.slug);
  if ("error" in foto) return fallo(foto.error as string);
  const quitar = form.get("quitar_foto") === "on";
  const foto_path = foto.path ?? (quitar ? null : actual.foto_path);

  const { error } = await supabase
    .from("productos")
    .update({ nombre: d.nombre, descripcion: d.descripcion, verbo: d.verbo ? d.verbo.toUpperCase() : null, foto_path })
    .eq("id", d.id);
  if (error) {
    await borrarFoto(supabase, foto.path);
    return fallo(error.message);
  }
  if (foto_path !== actual.foto_path) await borrarFoto(supabase, actual.foto_path);
  refrescar();
  return ok("Producto guardado", d.id);
}

// ───────────── Packs ─────────────

const packSchema = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  nombre: z.string().trim().min(2, "Falta el nombre del pack").max(60, "El nombre es muy largo"),
  descripcion: opcional(300, "La descripción puede tener hasta 300 letras"),
  precio: z.number().int().positive("Falta el precio del pack"),
  precio_anterior: z.number().int().positive().nullable(),
  etiqueta: opcional(30, "La etiqueta puede tener hasta 30 letras"),
  activo: z.boolean(),
  orden: z.number().int().min(0).max(9999),
  items: z
    .array(z.object({ producto_id: z.uuid(), cantidad: z.number().int().min(1).max(20) }))
    .min(1, "Elegí al menos un producto para el pack")
    .max(20),
});

function leerItems(form: FormData) {
  try {
    const v = JSON.parse(texto(form, "items") || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Crea o edita un pack (precio propio, su stock sale del de sus productos). */
export async function guardarPack(_prev: ResultadoAlta, form: FormData): Promise<ResultadoAlta> {
  const parsed = packSchema.safeParse({
    id: texto(form, "id"),
    nombre: texto(form, "nombre"),
    descripcion: texto(form, "descripcion"),
    precio: aPesos(form.get("precio")) ?? 0,
    precio_anterior: aPesos(form.get("precio_anterior")),
    etiqueta: texto(form, "etiqueta"),
    activo: form.get("activo") === "on",
    orden: aPesos(form.get("orden")) ?? 0,
    items: leerItems(form),
  });
  if (!parsed.success) return fallo(primerError(parsed.error));
  const { id, items, ...d } = parsed.data;
  if (new Set(items.map((i) => i.producto_id)).size !== items.length) return fallo("Hay un producto repetido en el pack");

  const { supabase } = await requireAdmin();
  const { data: prods } = await supabase.from("productos").select("id").in("id", items.map((i) => i.producto_id));
  if ((prods ?? []).length !== items.length) return fallo("Algún producto del pack ya no existe");

  const anterior = id ? await supabase.from("packs").select("slug, foto_path").eq("id", id).single() : null;
  if (anterior && (anterior.error || !anterior.data)) return fallo("No encontramos el pack");
  const slug = anterior?.data?.slug ?? (await slugLibre(supabase, "packs", d.nombre));

  const foto = await subirFoto(supabase, form, "packs", slug);
  if ("error" in foto) return fallo(foto.error as string);
  const fotoVieja = anterior?.data?.foto_path ?? null;
  const foto_path = foto.path ?? (form.get("quitar_foto") === "on" ? null : fotoVieja);

  const fila = { ...d, precio_anterior: d.precio_anterior && d.precio_anterior > d.precio ? d.precio_anterior : null, foto_path };
  let packId = id;
  if (id) {
    const { error } = await supabase.from("packs").update(fila).eq("id", id);
    if (error) {
      await borrarFoto(supabase, foto.path);
      return fallo(error.message);
    }
  } else {
    const { data, error } = await supabase.from("packs").insert({ ...fila, slug }).select("id").single();
    if (error) {
      await borrarFoto(supabase, foto.path);
      return fallo(error.message);
    }
    packId = data.id;
  }

  // Reemplaza lo que incluye. Si el alta falla, vuelve a dejar lo que tenía.
  const { data: previos } = await supabase.from("pack_items").select("producto_id, cantidad").eq("pack_id", packId);
  const { error: eBorrar } = await supabase.from("pack_items").delete().eq("pack_id", packId);
  if (eBorrar) return fallo(eBorrar.message);
  const { error: eItems } = await supabase.from("pack_items").insert(items.map((i) => ({ ...i, pack_id: packId })));
  if (eItems) {
    if (previos?.length) await supabase.from("pack_items").insert(previos.map((i) => ({ ...i, pack_id: packId })));
    return fallo(eItems.message);
  }

  if (foto_path !== fotoVieja) await borrarFoto(supabase, fotoVieja);
  refrescar();
  return ok(id ? "Pack guardado" : `${d.nombre} creado`, packId);
}

/** Borra un pack. Si ya se vendió alguno, lo deja inactivo (el historial de pedidos lo necesita). */
export async function borrarPack(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return fallo("Pack inválido");
  const { supabase } = await requireAdmin();
  const { data: pack } = await supabase.from("packs").select("foto_path").eq("id", id).single();
  const { error } = await supabase.from("packs").delete().eq("id", id);
  if (error) {
    if (error.code !== "23503") return fallo(error.message);
    const { error: e2 } = await supabase.from("packs").update({ activo: false }).eq("id", id);
    if (e2) return fallo(e2.message);
    refrescar();
    return ok("Ya tiene pedidos: lo dejamos inactivo para no perder el historial");
  }
  await borrarFoto(supabase, pack?.foto_path);
  refrescar();
  return ok("Pack borrado");
}
