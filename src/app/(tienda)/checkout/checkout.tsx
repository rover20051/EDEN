"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { PagoTarjeta } from "@/components/pago-tarjeta/pago-tarjeta";
import type { CatalogoPublico, PackPublico, ProductoPublico } from "@/lib/catalogo";
import { ars, numeroPedido } from "@/lib/format";
import { PROVINCIAS } from "@/lib/provincias";
import { confirmarPedido, validarCupon, type CuponPublico, type DatosCheckout } from "../acciones";
import { PREFIJO_PACK } from "@/lib/pack";


type Linea = { slug: string; cantidad: number };
type LineaProducto = Linea & { tipo: "producto"; p: ProductoPublico };
type LineaPack = Linea & { tipo: "pack"; k: PackPublico; lista: number; contenido: string };

// El carrito vive en el navegador (lo arma la web). Se lee sin efectos para que no haya parpadeos.
const leerCarrito = () => {
  try {
    return localStorage.getItem("eden-checkout") ?? "[]";
  } catch {
    return "[]";
  }
};
const leerRegalo = () => {
  try {
    return localStorage.getItem("eden-regalo") === "true";
  } catch {
    return false;
  }
};
const suscribir = (cb: () => void) => {
  addEventListener("storage", cb);
  return () => removeEventListener("storage", cb);
};

const ORIGENES: [string, string][] = [
  ["instagram", "Instagram"],
  ["recomendacion", "Me lo recomendaron"],
  ["iglesia", "En mi iglesia"],
  ["anuncio", "Un anuncio"],
  ["tiktok", "TikTok"],
  ["google", "Google"],
  ["otro", "Otro"],
];

/** Origen que dejó la web si la visita vino de un link con ?utm_source=… */
function origenGuardado() {
  try {
    return localStorage.getItem("eden-origen") ?? "";
  } catch {
    return "";
  }
}

const campo =
  "w-full border-0 border-b border-tinta/70 bg-transparent px-0 py-2 text-[1.15rem] outline-none placeholder:italic placeholder:text-tenue focus:border-oro";
const Etiqueta = ({ children }: { children: React.ReactNode }) => (
  <span className="font-maquina text-[0.7rem] uppercase tracking-[0.12em] text-tenue">{children}</span>
);

/** Dónde está la persona: Carrito → Datos y pago → Listo. */
function Pasos({ volver = true }: { volver?: boolean }) {
  const pasos = ["Carrito", "Datos y pago", "Listo"];
  return (
    <nav aria-label="Pasos de la compra" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* La web es HTML estático: link común, no <Link>. */}
      {volver && (
        <a href="/#carrito" className="mr-3 italic text-tenue underline underline-offset-4 hover:text-tinta">
          ← Volver al carrito
        </a>
      )}
      <ol className="flex items-center gap-1.5 whitespace-nowrap font-maquina sm:gap-2 text-[0.7rem] uppercase tracking-[0.12em]">
        {pasos.map((p, i) => (
          <li key={p} className="flex items-center gap-1.5 sm:gap-2">
            {i > 0 && <span aria-hidden className="h-px w-3 bg-borde sm:w-5" />}
            <span aria-current={i === 1 ? "step" : undefined} className={i === 1 ? "text-tinta" : i === 0 ? "text-musgo" : "text-tenue"}>
              {i === 0 ? "✓ " : `${i + 1}. `}
              {p}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Capitulo({ num, titulo, children }: { num: string; titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-borde pt-6">
      <p className="mb-1 italic text-tenue">{num}</p>
      <h2 className="mb-5 text-3xl font-light">{titulo}</h2>
      {children}
    </section>
  );
}

/** Envío: undefined = falta elegir provincia, null = a coordinar, 0 = gratis. */
function textoEnvio(envio: number | null | undefined) {
  if (envio === undefined) return "según tu provincia";
  if (envio === null) return "a coordinar";
  if (envio === 0) return "Gratis";
  return ars(envio);
}

type PedidoCreado = { token: string; numero: number; total: number };

export function Checkout({ catalogo, modoTarjeta }: { catalogo: CatalogoPublico; modoTarjeta: "nave" | "prueba" | null }) {
  const crudo = useSyncExternalStore(suscribir, leerCarrito, () => "[]");
  const regaloGuardado = useSyncExternalStore(suscribir, leerRegalo, () => false);
  const [regaloElegido, setRegalo] = useState<boolean | null>(null);
  const regalo = regaloElegido ?? regaloGuardado;
  const router = useRouter();
  const [medio, setMedio] = useState<"nave" | "transferencia">(modoTarjeta ? "nave" : "transferencia");
  const [provincia, setProvincia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  // Pedido con tarjeta ya creado: la misma página pasa a mostrar el formulario de pago.
  const [creado, setCreado] = useState<PedidoCreado | null>(null);

  // Cupón
  const [cuponAbierto, setCuponAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [cupon, setCupon] = useState<CuponPublico | null>(null);
  const [errorCupon, setErrorCupon] = useState<string | null>(null);
  const [validando, iniciarCupon] = useTransition();

  if (creado && modoTarjeta) {
    return (
      <div className="mx-auto max-w-xl">
        <Pasos volver={false} />
        <p className="font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Pedido {numeroPedido(creado.numero)}</p>
        <h1 className="mt-2 text-4xl font-light md:text-5xl">Último paso: el pago</h1>
        <p className="mb-8 mt-2 italic text-tenue">Ya reservamos tus piezas. Completá el pago y empezamos a prepararlas.</p>
        <PagoTarjeta token={creado.token} total={creado.total} modo={modoTarjeta} />
        <p className="mt-6 text-center text-base italic text-tenue">
          ¿Preferís pagar más tarde?{" "}
          <Link href={`/pedido/${creado.token}`} className="text-tinta underline underline-offset-4">
            Guardá el link de tu pedido
          </Link>
          : desde ahí también podés pagar.
        </p>
      </div>
    );
  }

  let carrito: Linea[] = [];
  try {
    const leido: unknown = JSON.parse(crudo);
    if (Array.isArray(leido)) carrito = leido.filter((l): l is Linea => typeof l?.slug === "string" && Number(l?.cantidad) > 0);
  } catch {}

  const porSlug = new Map(catalogo.productos.map((p) => [p.slug, p]));
  const lineas: (LineaProducto | LineaPack)[] = [];
  for (const l of carrito) {
    if (l.slug.startsWith(PREFIJO_PACK)) {
      const k = catalogo.packs.find((x) => x.slug === l.slug.slice(PREFIJO_PACK.length));
      if (!k) continue;
      const lista = k.items.reduce((s, i) => s + (porSlug.get(i.slug)?.precio ?? 0) * i.cantidad, 0);
      const contenido = k.items.map((i) => `${i.cantidad > 1 ? `${i.cantidad} × ` : ""}${porSlug.get(i.slug)?.nombre ?? i.slug}`).join(" + ");
      lineas.push({ ...l, tipo: "pack", k, lista, contenido });
    } else {
      const p = porSlug.get(l.slug);
      if (p) lineas.push({ ...l, tipo: "producto", p });
    }
  }
  const sueltos = lineas.filter((l): l is LineaProducto => l.tipo === "producto");
  const packs = lineas.filter((l): l is LineaPack => l.tipo === "pack");

  // Estimación para mostrar; el total de verdad lo calcula la base al crear el pedido.
  const subtotalSueltos = sueltos.reduce((s, l) => s + l.p.precio * l.cantidad, 0);
  const cuenta = (t: ProductoPublico["tipo"]) => sueltos.filter((l) => l.p.tipo === t).reduce((s, l) => s + l.cantidad, 0);
  const minimo = (t: ProductoPublico["tipo"]) => Math.min(...sueltos.filter((l) => l.p.tipo === t).map((l) => l.p.precio));
  const pares = Math.min(cuenta("biblia"), cuenta("journal"));
  const ahorroSet = pares && catalogo.precio_set ? Math.max(0, pares * (minimo("biblia") + minimo("journal") - catalogo.precio_set)) : 0;
  const totalPacks = packs.reduce((s, l) => s + l.k.precio * l.cantidad, 0);
  const base = subtotalSueltos - ahorroSet + totalPacks;
  const cuponFaltaMinimo = cupon ? base < cupon.minimo : false;
  const descCupon =
    cupon && !cuponFaltaMinimo ? (cupon.tipo === "porcentaje" ? Math.round((base * cupon.valor) / 100) : Math.min(cupon.valor, base)) : 0;
  const neto = base - descCupon;
  const gratisDesde = catalogo.envio.gratis_desde;
  const envio: number | null | undefined = !provincia
    ? undefined
    : gratisDesde !== null && neto >= gratisDesde
      ? 0
      : (catalogo.envio.tarifas[provincia] ?? null);
  const total = neto + (envio ?? 0);
  const faltaParaGratis = gratisDesde !== null && neto < gratisDesde ? gratisDesde - neto : 0;

  const sinStock = new Set(
    lineas
      .filter((l) => (l.tipo === "producto" ? l.p.stock < l.cantidad || !l.p.activo : l.k.stock < l.cantidad || !l.k.activo))
      .map((l) => l.slug),
  );

  if (lineas.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="mb-4 text-4xl font-light">Tu carrito está vacío</h1>
        <p className="mb-8 italic text-tenue">La primera colección te espera.</p>
        <a href="/#tienda" className="inline-block rounded-full bg-tinta px-7 py-3 text-papel hover:bg-raiz">
          Ver la colección
        </a>
      </div>
    );
  }

  function aplicarCupon() {
    const c = codigo.trim();
    if (!c) return setErrorCupon("Escribí el código del cupón");
    setErrorCupon(null);
    iniciarCupon(async () => {
      const r = await validarCupon(c);
      if (!r.ok) {
        setCupon(null);
        setErrorCupon(r.error);
        return;
      }
      setCupon(r.cupon);
      setCodigo(r.cupon.codigo);
    });
  }

  function quitarCupon() {
    setCupon(null);
    setCodigo("");
    setErrorCupon(null);
  }

  function enviar(form: FormData) {
    const texto = (k: string) => String(form.get(k) ?? "");
    const origen = texto("origen") || origenGuardado();
    const datos: DatosCheckout = {
      nombre: texto("nombre"),
      email: texto("email"),
      whatsapp: texto("whatsapp"),
      direccion: texto("direccion"),
      ciudad: texto("ciudad"),
      provincia,
      codigo_postal: texto("codigo_postal"),
      nota: texto("nota"),
      origen: (origen || undefined) as DatosCheckout["origen"],
      medio_pago: medio,
      cupon: cupon && !cuponFaltaMinimo ? cupon.codigo : undefined,
      regalo: regalo ? { para: texto("regalo_para"), mensaje: texto("regalo_mensaje") } : undefined,
      items: lineas.map((l) => ({ slug: l.slug, cantidad: l.cantidad })),
      web: texto("web"),
    };
    setError(null);
    iniciar(async () => {
      const r = await confirmarPedido(datos);
      if (!r.ok) return setError(r.error);
      // El pedido ya existe: el carrito se vacía aunque falte pagar (desde el link del pedido se puede pagar después).
      try {
        localStorage.removeItem("eden-checkout");
        localStorage.removeItem("eden-carrito");
        localStorage.removeItem("eden-regalo");
      } catch {}
      if (r.pagarConTarjeta) {
        setCreado({ token: r.token, numero: r.numero, total: r.total });
        scrollTo({ top: 0 });
      } else router.push(`/pedido/${r.token}`);
    });
  }

  const resumen = (
    <>
      <ul className="flex flex-col gap-3">
        {lineas.map((l) => {
          const nombre = l.tipo === "producto" ? l.p.nombre : l.k.nombre;
          const precio = (l.tipo === "producto" ? l.p.precio : l.k.precio) * l.cantidad;
          return (
            <li key={l.slug} className="flex items-baseline justify-between gap-4">
              <span className="min-w-0">
                {nombre}
                {l.cantidad > 1 && <span className="text-tenue"> × {l.cantidad}</span>}
                {l.tipo === "pack" && <span className="block text-base italic text-tenue">{l.contenido}</span>}
                {sinStock.has(l.slug) && <span className="block text-base italic text-error">Sin stock suficiente</span>}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {l.tipo === "pack" && l.lista > l.k.precio && (
                  <span className="block text-base text-tenue line-through">{ars(l.lista * l.cantidad)}</span>
                )}
                {ars(precio)}
              </span>
            </li>
          );
        })}
      </ul>
      <dl className="mt-5 flex flex-col gap-2 border-t border-borde pt-4 text-base">
        {ahorroSet > 0 && (
          <div className="flex justify-between text-musgo">
            <dt>Set Biblia + Journal</dt>
            <dd className="tabular-nums">−{ars(ahorroSet)}</dd>
          </div>
        )}
        {cupon && (
          <div className={`flex justify-between gap-4 ${cuponFaltaMinimo ? "text-tenue" : "text-musgo"}`}>
            <dt>
              Cupón <span className="font-maquina text-[0.85rem]">{cupon.codigo}</span>
              {cupon.tipo === "porcentaje" && <span> ({cupon.valor}%)</span>}
              {cuponFaltaMinimo && <span className="block italic">Es para compras desde {ars(cupon.minimo)}</span>}
            </dt>
            <dd className="shrink-0 tabular-nums">{cuponFaltaMinimo ? "—" : `−${ars(descCupon)}`}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 text-tenue">
          <dt>
            Envío
            {provincia && <span className="block text-[0.9rem] italic">a {provincia}</span>}
          </dt>
          <dd className={`shrink-0 tabular-nums ${envio === 0 ? "text-musgo" : envio === undefined || envio === null ? "italic" : ""}`}>
            {textoEnvio(envio)}
          </dd>
        </div>
        {faltaParaGratis > 0 && <p className="text-[0.95rem] italic text-tenue">Te faltan {ars(faltaParaGratis)} para el envío gratis.</p>}
        <div className="mt-2 flex justify-between text-xl">
          <dt>Total</dt>
          <dd className="tabular-nums">{ars(total)}</dd>
        </div>
      </dl>
    </>
  );

  const bloqueado = sinStock.size > 0;

  return (
    <form action={enviar} className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-16">
      <div className="flex min-w-0 flex-col gap-10">
        <header>
          <Pasos />
          <h1 className="text-4xl font-light md:text-5xl">Tu pedido</h1>
          <p className="mt-2 italic text-tenue">Un paso más y empezamos a prepararlo a mano.</p>
        </header>

        {/* Celular: resumen plegable arriba */}
        <details className="border border-borde bg-nota p-4 lg:hidden">
          <summary className="flex cursor-pointer justify-between">
            <span className="italic">Ver tu pedido</span>
            <span className="tabular-nums">{ars(total)}</span>
          </summary>
          <div className="mt-4">{resumen}</div>
        </details>

        <Capitulo num="I." titulo="Tus datos">
          <div className="grid gap-6 md:grid-cols-2">
            <label className="md:col-span-2">
              <Etiqueta>Nombre y apellido</Etiqueta>
              <input name="nombre" autoComplete="name" required maxLength={120} className={campo} />
            </label>
            <label>
              <Etiqueta>Mail</Etiqueta>
              <input name="email" type="email" autoComplete="email" required maxLength={200} className={campo} />
            </label>
            <label>
              <Etiqueta>WhatsApp</Etiqueta>
              <input name="whatsapp" type="tel" autoComplete="tel" required maxLength={40} placeholder="11 2345 6789" className={campo} />
            </label>
          </div>
        </Capitulo>

        <Capitulo num="II." titulo="Envío">
          <div className="grid gap-6 md:grid-cols-6">
            <label className="md:col-span-6">
              <Etiqueta>Dirección</Etiqueta>
              <input name="direccion" autoComplete="street-address" required maxLength={200} placeholder="Calle, número, piso" className={campo} />
            </label>
            <label className="md:col-span-3">
              <Etiqueta>Provincia</Etiqueta>
              <select
                name="provincia"
                autoComplete="address-level1"
                required
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                className={`${campo} cursor-pointer ${provincia ? "" : "italic text-tenue"}`}
              >
                <option value="" disabled>
                  Elegí tu provincia
                </option>
                {PROVINCIAS.map((p) => (
                  <option key={p} value={p} className="not-italic text-tinta">
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              <Etiqueta>Ciudad</Etiqueta>
              <input name="ciudad" autoComplete="address-level2" required maxLength={100} className={campo} />
            </label>
            <label>
              <Etiqueta>C. P.</Etiqueta>
              <input name="codigo_postal" autoComplete="postal-code" inputMode="numeric" maxLength={10} className={campo} />
            </label>
          </div>
          <p className="mt-4 text-base italic text-tenue">
            {!provincia
              ? "Enviamos a todo el país. Elegí tu provincia y te mostramos el costo del envío."
              : envio === null
                ? "El envío a tu provincia lo coordinamos por WhatsApp antes de despacharlo."
                : envio === 0
                  ? "Tu envío es gratis. Te escribimos por WhatsApp cuando salga."
                  : `El envío a ${provincia} cuesta ${ars(envio)}. Te escribimos por WhatsApp cuando salga.`}
          </p>
        </Capitulo>

        <section className="border-t border-borde pt-6">
          <label className={`flex cursor-pointer gap-4 border p-4 transition-colors ${regalo ? "border-tinta bg-nota" : "border-borde hover:border-tinta"}`}>
            <input type="checkbox" checked={regalo} onChange={(e) => setRegalo(e.target.checked)} className="mt-1.5 h-4 w-4 accent-tinta" />
            <span>
              <span className="block">Es para regalar</span>
              <span className="block text-base italic text-tenue">Sumamos una tarjeta escrita con tu mensaje y el paquete va sin precios.</span>
            </span>
          </label>
          {regalo && (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <label>
                <Etiqueta>¿Para quién es? (opcional)</Etiqueta>
                <input name="regalo_para" maxLength={80} placeholder="Su nombre" className={campo} />
              </label>
              <label className="md:col-span-2">
                <Etiqueta>Mensaje para la tarjeta (opcional)</Etiqueta>
                <textarea name="regalo_mensaje" maxLength={300} rows={3} placeholder="Unas palabras que acompañen el regalo…" className={`${campo} resize-none`} />
              </label>
              <p className="-mt-3 text-base italic text-tenue md:col-span-2">Si lo mandamos directo a esa persona, poné su dirección en Envío.</p>
            </div>
          )}
        </section>

        <Capitulo num="III." titulo="Pago">
          <div className="mb-6">
            {cupon ? (
              <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border border-musgo/30 bg-chip-hierba px-4 py-3">
                <span>
                  Cupón <span className="font-maquina">{cupon.codigo}</span>{" "}
                  <span className="italic text-tenue">
                    · {cupon.tipo === "porcentaje" ? `${cupon.valor}% de descuento` : `${ars(cupon.valor)} de descuento`}
                    {cupon.minimo > 0 && ` en compras desde ${ars(cupon.minimo)}`}
                  </span>
                </span>
                <button type="button" onClick={quitarCupon} className="italic text-tenue underline underline-offset-4 hover:text-tinta">
                  Quitar
                </button>
              </p>
            ) : !cuponAbierto ? (
              <button type="button" onClick={() => setCuponAbierto(true)} className="italic text-tenue underline underline-offset-4 hover:text-tinta">
                ¿Tenés un cupón?
              </button>
            ) : (
              <div>
                <label htmlFor="cupon">
                  <Etiqueta>¿Tenés un cupón?</Etiqueta>
                </label>
                <div className="flex items-end gap-4">
                  <input
                    id="cupon"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        aplicarCupon();
                      }
                    }}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="characters"
                    maxLength={30}
                    placeholder="Escribí el código"
                    aria-invalid={Boolean(errorCupon)}
                    aria-describedby={errorCupon ? "error-cupon" : undefined}
                    className={`${campo} min-w-0 flex-1 font-maquina uppercase placeholder:normal-case`}
                  />
                  <button
                    type="button"
                    onClick={aplicarCupon}
                    disabled={validando}
                    className="shrink-0 rounded-full border border-tinta px-5 py-2 transition-colors hover:bg-tinta hover:text-papel disabled:opacity-50"
                  >
                    {validando ? "Revisando…" : "Aplicar"}
                  </button>
                </div>
                {errorCupon && (
                  <p id="error-cupon" role="alert" className="mt-2 text-base italic text-error">
                    {errorCupon}
                  </p>
                )}
              </div>
            )}
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Medio de pago</legend>
            {[
              {
                v: "nave" as const,
                titulo: "Tarjeta de crédito, débito o MODO",
                texto: modoTarjeta ? "Pagás acá mismo, sin salir de la página." : "Muy pronto.",
                deshabilitado: !modoTarjeta,
              },
              {
                v: "transferencia" as const,
                titulo: "Transferencia bancaria",
                texto: "Te mostramos los datos y nos mandás el comprobante. Reservamos tu pedido durante 48 horas.",
                deshabilitado: false,
              },
            ].map((o) => (
              <label
                key={o.v}
                className={`flex cursor-pointer gap-4 border p-4 transition-colors ${
                  medio === o.v ? "border-tinta bg-nota" : "border-borde"
                } ${o.deshabilitado ? "cursor-not-allowed opacity-50" : "hover:border-tinta"}`}
              >
                <input
                  type="radio"
                  name="medio"
                  checked={medio === o.v}
                  disabled={o.deshabilitado}
                  onChange={() => setMedio(o.v)}
                  className="mt-1.5 h-4 w-4 accent-tinta"
                />
                <span>
                  <span className="block">
                    {o.titulo}
                    {o.v === "nave" && modoTarjeta === "prueba" && (
                      <span className="ml-2 inline-block bg-chip-oro px-1.5 py-0.5 align-middle font-maquina text-[0.62rem] uppercase tracking-[0.12em] text-raiz">
                        Modo prueba
                      </span>
                    )}
                  </span>
                  <span className="block text-base italic text-tenue">{o.texto}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </Capitulo>

        <section className="grid gap-6 border-t border-borde pt-6 md:grid-cols-2">
          <label>
            <Etiqueta>¿Cómo nos conociste? (opcional)</Etiqueta>
            <select name="origen" defaultValue="" className={`${campo} cursor-pointer`}>
              <option value="">Elegí una opción</option>
              {ORIGENES.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Etiqueta>¿Algo que debamos saber? (opcional)</Etiqueta>
            <input name="nota" maxLength={500} placeholder="Horario de entrega, timbre…" className={campo} />
          </label>
          {/* Trampa para bots: invisible para las personas */}
          <input name="web" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        </section>

        <div className="flex flex-col gap-3 border-t border-borde pt-6 lg:hidden">
          <p className="flex justify-between text-xl">
            <span>Total</span>
            <span className="tabular-nums">{ars(total)}</span>
          </p>
          {error && (
            <p role="alert" className="italic text-error">
              {error}
            </p>
          )}
          <BotonConfirmar medio={medio} total={total} pendiente={pendiente} bloqueado={bloqueado} />
        </div>
      </div>

      {/* Compu: resumen fijo a la derecha */}
      <aside className="hidden lg:block">
        <div className="sticky top-8 border border-borde bg-nota p-6 shadow-[0_18px_28px_-24px_rgba(44,34,28,.45)]">
          <h2 className="mb-5 font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Tu pedido</h2>
          {resumen}
          {error && (
            <p role="alert" className="mt-4 italic text-error">
              {error}
            </p>
          )}
          <div className="mt-6 grid">
            <BotonConfirmar medio={medio} total={total} pendiente={pendiente} bloqueado={bloqueado} />
          </div>
          <p className="mt-4 text-center text-base italic text-tenue">De regreso al Jardín.</p>
        </div>
      </aside>
    </form>
  );
}

function BotonConfirmar({ medio, total, pendiente, bloqueado }: { medio: string; total: number; pendiente: boolean; bloqueado: boolean }) {
  return (
    <button
      disabled={pendiente || bloqueado}
      className="rounded-full bg-tinta px-7 py-3.5 text-[1.15rem] text-papel transition-colors hover:bg-raiz disabled:opacity-50"
    >
      {pendiente ? "Confirmando…" : medio === "nave" ? `Ir a pagar ${ars(total)}` : "Confirmar pedido"}
    </button>
  );
}
