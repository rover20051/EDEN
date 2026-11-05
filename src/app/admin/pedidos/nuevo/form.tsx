"use client";

import { useRef, useState, useTransition } from "react";
import { crearPedido, type NuevoPedido } from "@/app/admin/actions";
import { ars, hoyAR } from "@/lib/format";
import { CANALES, MEDIOS, MOTIVOS_SALIDA, ORIGENES, QUIEN_SALIDA, type MotivoSalida, type QuienSalida } from "@/lib/textos";

export type ProductoVenta = {
  id: string;
  nombre: string;
  diseno: string;
  tipo: "biblia" | "journal";
  precio: number;
  activo: boolean;
  stock: number;
  /** Tandas con lugar, de la más vieja a la más nueva (de ahí sale cada pieza). */
  tandas: { disponibles: number; costo: number }[];
};
export type PackVenta = { id: string; nombre: string; precio: number; items: { producto_id: string; cantidad: number }[] };
export type CuponVenta = {
  codigo: string;
  tipo: "porcentaje" | "monto";
  valor: number;
  minimo: number;
  usos_max: number | null;
  vence: string | null;
  activo: boolean;
  usos: number;
};

type Canal = NuevoPedido["canal"];
type Medio = NuevoPedido["medio_pago"];
type Modo = "venta" | "salida";

// Medios que se usan hoy (Mercado Pago queda solo para pedidos viejos).
const MEDIOS_MANUALES: [Medio, string][] = [
  ["transferencia", MEDIOS.transferencia],
  ["nave", MEDIOS.nave],
  ["efectivo", MEDIOS.efectivo],
];
const CANALES_MANUALES: [Canal, string][] = (["whatsapp", "instagram", "web", "feria", "iglesia", "otro"] as const).map((c) => [c, CANALES[c]]);
const MOTIVOS: [MotivoSalida, string][] = Object.entries(MOTIVOS_SALIDA) as [MotivoSalida, string][];
const QUIENES: [QuienSalida, string][] = Object.entries(QUIEN_SALIDA) as [QuienSalida, string][];

const etiquetaChica = "font-label-sm text-[10px] uppercase tracking-wider text-outline";
const campoPanel = "w-full rounded-full bg-surface-container-lowest px-3 py-1.5 font-body-sm text-body-sm text-primary shadow-xs focus:outline-none focus:ring-1 focus:ring-secondary";
const campoChico = "rounded-lg bg-surface-container-lowest px-2.5 py-1 font-body-sm text-xs text-primary shadow-xs focus:outline-none focus:ring-1 focus:ring-secondary";

function Pildoras<T extends string>({ opciones, valor, onChange, etiqueta }: { opciones: [T, string][]; valor: T | ""; onChange: (v: T) => void; etiqueta: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={etiqueta}>
      {opciones.map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={valor === k}
          onClick={() => onChange(k)}
          className={`rounded-full px-2.5 py-0.5 font-label-sm text-[11px] transition-colors ${
            valor === k ? "bg-primary font-bold text-on-primary shadow-xs" : "bg-surface-container text-outline hover:text-primary"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Contador({ valor, max, nombre, onCambiar }: { valor: number; max: number; nombre: string; onCambiar: (delta: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-container-lowest/80 p-0.5 shadow-xs">
      <button
        type="button"
        aria-label={`Restar ${nombre}`}
        disabled={valor === 0}
        onClick={() => onCambiar(-1)}
        className={`flex h-6 w-6 items-center justify-center rounded-full font-code-num text-xs transition-colors hover:bg-surface-dim ${valor > 0 ? "text-primary" : "text-outline"}`}
      >
        −
      </button>
      <span className={`w-4 text-center font-code-num text-xs ${valor > 0 ? "text-primary" : "text-outline"}`}>{valor}</span>
      <button
        type="button"
        aria-label={`Sumar ${nombre}`}
        disabled={valor >= max}
        onClick={() => onCambiar(1)}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-code-num text-xs text-on-primary transition-colors hover:bg-primary-container disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

/** Costo de sacar `unidades` de un producto: tanda por tanda, la más vieja primero (igual que la base). */
function costoFIFO(p: ProductoVenta | undefined, unidades: number) {
  let falta = unidades;
  let costo = 0;
  for (const t of p?.tandas ?? []) {
    if (falta <= 0) break;
    const toma = Math.min(falta, t.disponibles);
    costo += toma * t.costo;
    falta -= toma;
  }
  return { costo, sinTanda: falta };
}

/** Lo que descontaría el cupón, o por qué no aplica. Es una vista previa: el descuento final lo calcula la base. */
function evaluarCupon(codigo: string, cupones: CuponVenta[], base: number): { descuento: number; aviso: string | null; cupon: CuponVenta | null } {
  const c = cupones.find((x) => x.codigo === codigo);
  if (!c) return { descuento: 0, aviso: "No existe o está pausado", cupon: null };
  if (c.vence && c.vence < hoyAR()) return { descuento: 0, aviso: "Ya venció", cupon: c };
  if (c.usos_max != null && c.usos >= c.usos_max) return { descuento: 0, aviso: "Ya se usó todas las veces", cupon: c };
  if (base < c.minimo) return { descuento: 0, aviso: `Es para compras desde ${ars(c.minimo)}`, cupon: c };
  const descuento = c.tipo === "porcentaje" ? Math.round((base * c.valor) / 100) : Math.min(c.valor, base);
  return { descuento, aviso: null, cupon: c };
}

/** Carga manual (diseño de Stitch): productos a la izquierda, datos y total en el panel de la derecha. También salidas sin cobro. */
export function FormNuevoPedido({
  productos,
  packs,
  cupones,
  precioSet,
  modoInicial,
}: {
  productos: ProductoVenta[];
  packs: PackVenta[];
  cupones: CuponVenta[];
  precioSet: number;
  modoInicial: Modo;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [cantPacks, setCantPacks] = useState<Record<string, number>>({});
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [medio, setMedio] = useState<Medio>("transferencia");
  const [yaPagado, setYaPagado] = useState(true);
  const [origen, setOrigen] = useState<string>("");
  const [regalo, setRegalo] = useState(false);
  const [motivo, setMotivo] = useState<MotivoSalida>("regalo");
  const [quien, setQuien] = useState<QuienSalida | "">("");
  const [cupon, setCupon] = useState("");
  const [descuentoManual, setDescuentoManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const salida = modo === "salida";

  const limpiar = () => {
    setCantidades({});
    setCantPacks({});
    setOrigen("");
    setRegalo(false);
    setQuien("");
    setMotivo("regalo");
    setCupon("");
    setDescuentoManual("");
    setError(null);
    formRef.current?.reset();
  };
  const cambiarModo = (m: Modo) => {
    setModo(m);
    setError(null);
    history.replaceState(null, "", m === "salida" ? "?tipo=salida" : location.pathname);
  };

  // En una venta solo se ofrece lo que está a la venta; en una salida, también lo que quedó en stock fuera del catálogo.
  const visibles = productos.filter((p) => p.activo || (salida && p.stock > 0));
  const porId = new Map(productos.map((p) => [p.id, p]));
  const packsElegidos = packs.filter((k) => (cantPacks[k.id] ?? 0) > 0);
  const elegidos = visibles.filter((p) => (cantidades[p.id] ?? 0) > 0);

  /** Unidades de cada producto que usa el pedido (sueltas + dentro de packs). */
  const usadas = (id: string) =>
    (cantidades[id] ?? 0) + packsElegidos.reduce((n, k) => n + cantPacks[k.id] * (k.items.find((i) => i.producto_id === id)?.cantidad ?? 0), 0);
  const cambiar = (id: string, delta: number) => setCantidades((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }));
  const cambiarPack = (id: string, delta: number) => setCantPacks((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }));
  const listaPack = (k: PackVenta) => k.items.reduce((s, i) => s + i.cantidad * (porId.get(i.producto_id)?.precio ?? 0), 0);
  const packDisponible = (k: PackVenta) =>
    k.items.length > 0 && k.items.every((i) => (porId.get(i.producto_id)?.activo || salida) && usadas(i.producto_id) + i.cantidad <= (porId.get(i.producto_id)?.stock ?? 0));
  const nombresPack = (k: PackVenta) =>
    k.items.map((i) => `${i.cantidad > 1 ? `${i.cantidad}× ` : ""}${porId.get(i.producto_id)?.nombre ?? "?"}`).join(" + ");

  // ── Venta: vista previa del total (la base lo recalcula al crear) ──
  const subtotalSueltos = elegidos.reduce((s, p) => s + cantidades[p.id] * p.precio, 0);
  const subtotalPacks = packsElegidos.reduce((s, k) => s + cantPacks[k.id] * listaPack(k), 0);
  const subtotal = subtotalSueltos + subtotalPacks;
  const descuentoPacks = packsElegidos.reduce((s, k) => s + cantPacks[k.id] * Math.max(0, listaPack(k) - k.precio), 0);
  // Set: cada Biblia + Journal sueltos (fuera de packs) sale al precio del Set.
  const cuenta = (t: ProductoVenta["tipo"]) => elegidos.filter((p) => p.tipo === t).reduce((s, p) => s + cantidades[p.id], 0);
  const minimo = (t: ProductoVenta["tipo"]) => Math.min(...elegidos.filter((p) => p.tipo === t).map((p) => p.precio));
  const pares = Math.min(cuenta("biblia"), cuenta("journal"));
  const descuentoSet = pares > 0 && precioSet > 0 ? Math.max(0, pares * (minimo("biblia") + minimo("journal") - precioSet)) : 0;
  const base = subtotal - descuentoSet - descuentoPacks;
  const codigo = cupon.trim().toUpperCase();
  const evaluado = codigo ? evaluarCupon(codigo, cupones, base) : null;
  const manual = Number(descuentoManual.replace(/\D/g, "")) || 0;
  const descuentoFinal = Math.min(manual + (evaluado?.descuento ?? 0), Math.max(0, base));
  const total = base - descuentoFinal;

  // ── Salida: costo para Edén (piezas de la tanda más vieja con lugar) ──
  const idsUsados = [...new Set([...elegidos.map((p) => p.id), ...packsElegidos.flatMap((k) => k.items.map((i) => i.producto_id))])];
  const costos = idsUsados.map((id) => ({ id, unidades: usadas(id), ...costoFIFO(porId.get(id), usadas(id)) }));
  const costoSalida = costos.reduce((s, c) => s + c.costo, 0);
  const faltaTanda = costos.some((c) => c.sinTanda > 0);
  const hayAlgo = elegidos.length > 0 || packsElegidos.length > 0;

  function enviar(form: FormData) {
    const texto = (k: string) => String(form.get(k) ?? "");
    if (salida && !quien) {
      setError("Elegí quién lo regala");
      return;
    }
    if (!salida && codigo && evaluado?.aviso) {
      setError(`El cupón ${codigo} no aplica: ${evaluado.aviso.toLowerCase()}`);
      return;
    }
    const items: NuevoPedido["items"] = [
      ...elegidos.map((p) => ({ producto_id: p.id, cantidad: cantidades[p.id] })),
      ...packsElegidos.map((k) => ({ pack_id: k.id, cantidad: cantPacks[k.id] })),
    ];
    const comun = {
      cliente: { nombre: texto("nombre"), whatsapp: texto("whatsapp"), email: texto("email"), origen: origen || undefined },
      items,
      nota: texto("nota"),
      direccion_envio: texto("direccion_envio"),
      es_regalo: regalo,
      regalo_para: regalo ? texto("regalo_para") : undefined,
      regalo_mensaje: regalo ? texto("regalo_mensaje") : undefined,
    };
    const datos: NuevoPedido = salida
      ? { ...comun, tipo: "salida", salida_motivo: motivo, salida_por: quien || undefined, canal: "otro", medio_pago: "otro", ya_pagado: false }
      : { ...comun, tipo: "venta", canal, medio_pago: medio, ya_pagado: yaPagado, descuento: manual, cupon: codigo || undefined };
    setError(null);
    iniciar(async () => {
      const r = await crearPedido(datos);
      if (r && !r.ok) setError(r.error);
    });
  }

  const bloque = (tipo: ProductoVenta["tipo"]) => {
    const lista = visibles.filter((p) => p.tipo === tipo);
    if (lista.length === 0) return null;
    return (
      <div className="relative flex flex-col gap-1.5 overflow-hidden rounded-2xl bg-surface-container-low p-2.5 shadow-sm">
        <div className="flex items-center justify-between pb-0.5">
          <div>
            <span className="block font-label-sm text-[10px] uppercase tracking-[0.14em] text-outline">Colección 1</span>
            <h2 className="font-headline-md text-[17px] tracking-wide text-primary">{tipo === "biblia" ? "Biblias" : "Journals"}</h2>
          </div>
          {!salida && lista[0] && <div className="rounded-full bg-surface-container px-2 py-0.5 font-code-num text-xs text-primary">{ars(lista[0].precio)}</div>}
        </div>
        {lista.map((p) => {
          const c = cantidades[p.id] ?? 0;
          const libres = p.stock - usadas(p.id) + c;
          const proximo = p.tandas[0]?.costo;
          return (
            <div key={p.id} className={`group flex items-center justify-between rounded-lg p-1.5 transition-all ${c > 0 ? "bg-surface-container-highest/70 shadow-xs" : "hover:bg-surface-container"}`}>
              <div className="flex min-w-0 flex-col pr-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-headline-md text-[15px] leading-tight text-primary">{p.diseno}</span>
                  {c > 0 && <span className="rounded-full bg-tertiary-fixed px-1.5 font-label-sm text-[9px] uppercase tracking-wider text-tertiary">{c} en el pedido</span>}
                  {!p.activo && <span className="rounded-full bg-surface-container-high px-1.5 font-label-sm text-[9px] uppercase tracking-wider text-outline">Fuera de catálogo</span>}
                </div>
                <span className={`font-body-sm text-xs italic ${p.stock === 0 ? "text-error" : "text-outline"}`}>
                  {p.stock === 0 ? "Sin stock" : `Quedan ${p.stock}`}
                  {salida ? (proximo != null ? ` · costo ${ars(proximo)}` : "") : p.precio !== lista[0]?.precio && ` · ${ars(p.precio)}`}
                </span>
              </div>
              <Contador valor={c} max={libres} nombre={p.nombre} onCambiar={(d) => cambiar(p.id, d)} />
            </div>
          );
        })}
      </div>
    );
  };

  const bloquePacks = packs.length > 0 && (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-container-low p-2.5 shadow-sm md:col-span-2">
      <div className="flex items-center justify-between pb-0.5">
        <div>
          <span className="block font-label-sm text-[10px] uppercase tracking-[0.14em] text-outline">Combinados</span>
          <h2 className="font-headline-md text-[17px] tracking-wide text-primary">Packs</h2>
        </div>
        <span className="ms text-[18px] text-secondary">package_2</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {packs.map((k) => {
          const c = cantPacks[k.id] ?? 0;
          const lista = listaPack(k);
          return (
            <div key={k.id} className={`flex items-center justify-between gap-2 rounded-lg p-1.5 transition-all ${c > 0 ? "bg-surface-container-highest/70 shadow-xs" : "hover:bg-surface-container"}`}>
              <div className="flex min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-headline-md text-[15px] leading-tight text-primary">{k.nombre}</span>
                  {c > 0 && <span className="rounded-full bg-tertiary-fixed px-1.5 font-label-sm text-[9px] uppercase tracking-wider text-tertiary">{c} en el pedido</span>}
                </div>
                <span className="truncate font-body-sm text-xs italic text-outline">{nombresPack(k) || "Sin productos"}</span>
                {!salida && (
                  <span className="font-code-num text-xs text-primary">
                    {ars(k.precio)}
                    {lista > k.precio && <span className="ml-1.5 text-outline line-through">{ars(lista)}</span>}
                  </span>
                )}
              </div>
              <Contador valor={c} max={packDisponible(k) ? c + 1 : c} nombre={k.nombre} onCambiar={(d) => cambiarPack(k.id, d)} />
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <form ref={formRef} action={enviar} className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 pb-4">
      <header className="flex flex-col justify-between gap-2 pb-1 md:flex-row md:items-end">
        <div className="flex flex-col">
          <div className="mb-0.5 flex items-center gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-[0.14em] text-secondary">{salida ? "Regalo de Edén" : "Carga manual"}</span>
            <span className="inline-block h-1 w-1 rounded-full bg-outline-variant" />
            <span className="font-label-sm text-label-sm tracking-wider text-outline">{salida ? "Sale sin cobrarse: tiene costo, no ingresa plata" : "WhatsApp, Instagram o en persona"}</span>
          </div>
          <h1 className="font-headline-xl text-[28px] uppercase leading-none tracking-[0.08em] text-primary md:text-headline-xl">{salida ? "Nueva salida" : "Nuevo pedido"}</h1>
          <p className="mt-0.5 font-caption-italic text-caption-italic italic text-on-surface-variant">
            {salida ? "Elegí las piezas, el motivo y a quién va." : "Elegí los productos y completá los datos del cliente."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <div role="radiogroup" aria-label="Tipo de pedido" className="flex rounded-full bg-surface-container p-0.5 shadow-inner">
            {(
              [
                ["venta", "Venta", "payments"],
                ["salida", "Salida sin cobro", "volunteer_activism"],
              ] as const
            ).map(([m, label, ico]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modo === m}
                onClick={() => cambiarModo(m)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-label-sm text-label-sm uppercase tracking-wider transition-all ${
                  modo === m ? (m === "salida" ? "bg-secondary text-on-secondary shadow-sm" : "bg-primary text-on-primary shadow-sm") : "text-outline hover:text-primary"
                }`}
              >
                <span className="ms text-[15px]">{ico}</span>
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={limpiar}
            className="flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-dim"
          >
            <span className="ms text-[14px]">refresh</span>
            <span>Limpiar</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:col-span-7">
          {bloque("biblia")}
          {bloque("journal")}
          {bloquePacks}
        </section>

        <aside
          className={`flex flex-col gap-2.5 rounded-2xl p-3 shadow-md lg:sticky lg:top-20 lg:col-span-5 ${
            salida ? "bg-secondary-fixed/25 ring-1 ring-inset ring-secondary/20" : "bg-surface-container-low"
          }`}
        >
          <div className="flex items-center justify-between pb-1">
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] uppercase tracking-[0.14em] text-outline">{salida ? "Sin cobro" : "Pedido manual"}</span>
              <h2 className="font-label-lg text-label-md uppercase tracking-[0.1em] text-primary">{salida ? "Datos de la salida" : "Datos del pedido"}</h2>
            </div>
            <span className={`ms text-[18px] ${salida ? "text-secondary" : "text-outline"}`}>{salida ? "volunteer_activism" : "assignment_turned_in"}</span>
          </div>

          <div className="flex flex-col gap-2">
            {salida && (
              <>
                <div className="flex flex-col gap-1">
                  <span className={etiquetaChica}>Motivo</span>
                  <Pildoras etiqueta="Motivo" opciones={MOTIVOS} valor={motivo} onChange={setMotivo} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className={etiquetaChica}>¿Quién lo regala?</span>
                  <Pildoras etiqueta="¿Quién lo regala?" opciones={QUIENES} valor={quien} onChange={setQuien} />
                </div>
              </>
            )}

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="flex flex-col gap-0.5">
                <span className={etiquetaChica}>{salida ? "Para quién" : "Cliente"}</span>
                <input name="nombre" required autoComplete="off" placeholder="Nombre y apellido" className={campoPanel} />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquetaChica}>WhatsApp</span>
                <span className="flex items-center rounded-full bg-surface-container-lowest px-3 py-1.5 shadow-xs">
                  <span className="mr-1.5 whitespace-nowrap font-code-num text-xs text-outline">+54 9</span>
                  <input name="whatsapp" type="tel" autoComplete="off" placeholder="11 0000 0000" className="w-full bg-transparent font-code-num text-xs text-primary focus:outline-none" />
                </span>
              </label>
            </div>

            {!salida && (
              <>
                <div className="flex flex-col gap-1">
                  <span className={etiquetaChica}>Canal de venta</span>
                  <Pildoras etiqueta="Canal de venta" opciones={CANALES_MANUALES} valor={canal} onChange={setCanal} />
                </div>

                <div className="flex flex-col gap-1">
                  <span className={etiquetaChica}>Método de cobro</span>
                  <Pildoras etiqueta="Método de cobro" opciones={MEDIOS_MANUALES} valor={medio} onChange={setMedio} />
                </div>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-surface-container-high/60 p-1.5 transition-colors hover:bg-surface-container-high">
                  <input type="checkbox" checked={yaPagado} onChange={(e) => setYaPagado(e.target.checked)} className="h-4 w-4 rounded accent-primary" />
                  <span className="flex flex-col">
                    <span className="font-label-sm text-xs font-bold text-primary">Cobrado · Pago verificado</span>
                    <span className="font-body-sm text-[11px] text-outline">Lo viste en la cuenta o te pagaron en mano</span>
                  </span>
                </label>

                <label className="flex flex-col gap-0.5">
                  <span className={etiquetaChica}>Cupón (opcional)</span>
                  <span className="flex items-center gap-2">
                    <span className="flex flex-1 items-center rounded-full bg-surface-container-lowest px-3 py-1.5 shadow-xs focus-within:ring-1 focus-within:ring-secondary">
                      <span className="ms mr-1.5 text-[14px] text-outline">confirmation_number</span>
                      <input
                        value={cupon}
                        onChange={(e) => setCupon(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30))}
                        list="cupones-activos"
                        autoComplete="off"
                        placeholder="Ej. BIENVENIDA10"
                        className="w-full bg-transparent font-code-num text-xs uppercase text-primary focus:outline-none"
                      />
                    </span>
                    {codigo && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 font-label-sm text-[10px] font-bold uppercase ${
                          evaluado?.aviso ? "bg-error-container text-error" : "bg-tertiary-fixed text-tertiary"
                        }`}
                      >
                        {evaluado?.aviso ? "No aplica" : `−${ars(evaluado?.descuento ?? 0)}`}
                      </span>
                    )}
                  </span>
                  {codigo && evaluado?.aviso && <span className="pl-3 font-caption-italic text-[11px] italic text-error">{evaluado.aviso}</span>}
                  <datalist id="cupones-activos">
                    {cupones.map((c) => (
                      <option key={c.codigo} value={c.codigo} />
                    ))}
                  </datalist>
                </label>
              </>
            )}

            <div className={`rounded-lg p-1.5 transition-colors ${regalo ? "bg-secondary-fixed/30" : "bg-surface-container-high/60 hover:bg-surface-container-high"}`}>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={regalo} onChange={(e) => setRegalo(e.target.checked)} className="h-4 w-4 rounded accent-primary" />
                <span className="flex items-center gap-1 font-label-sm text-xs font-bold text-primary">
                  <span className="ms text-[15px] text-secondary">redeem</span>
                  {salida ? "Lleva tarjeta con mensaje" : "Es un regalo"}
                </span>
              </label>
              {regalo && (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  <input name="regalo_para" maxLength={80} placeholder="¿Para quién? (opcional)" className={campoChico} />
                  <textarea name="regalo_mensaje" maxLength={300} rows={2} placeholder="Mensaje para la tarjeta" className={`${campoChico} resize-none font-caption-italic`} />
                </div>
              )}
            </div>

            <details className="group rounded-lg bg-surface-container/50 p-2 transition-all">
              <summary className="flex cursor-pointer list-none select-none items-center justify-between font-label-sm text-xs text-primary">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                  <span className="ms text-[15px] text-secondary">local_shipping</span>
                  Datos de entrega y notas
                </span>
                <span className="ms text-[15px] transition-transform group-open:rotate-180">expand_more</span>
              </summary>
              <div className="flex flex-col gap-1.5 pt-2">
                <label className="flex flex-col gap-0.5">
                  <span className="font-label-sm text-[9px] uppercase text-outline">Mail</span>
                  <input name="email" type="email" className={campoChico} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="font-label-sm text-[9px] uppercase text-outline">Dirección de envío</span>
                  <input name="direccion_envio" className={campoChico} />
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {!salida && (
                    <label className="flex flex-col gap-0.5">
                      <span className="font-label-sm text-[9px] uppercase text-outline">Descuento ($)</span>
                      <input value={descuentoManual} onChange={(e) => setDescuentoManual(e.target.value)} inputMode="numeric" className={campoChico} />
                    </label>
                  )}
                  <label className={`flex flex-col gap-0.5 ${salida ? "col-span-2" : ""}`}>
                    <span className="font-label-sm text-[9px] uppercase text-outline">¿Cómo nos conoció?</span>
                    <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={campoChico}>
                      <option value="">Sin dato</option>
                      {Object.entries(ORIGENES)
                        .filter(([k]) => k !== "sin_dato")
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-0.5">
                  <span className="font-label-sm text-[9px] uppercase text-outline">Indicaciones</span>
                  <textarea
                    name="nota"
                    rows={1}
                    placeholder={salida ? "Ej. para el sorteo de Instagram, reponer la que vino fallada…" : "Ej. entregar por la tarde…"}
                    className={`${campoChico} resize-none font-caption-italic placeholder:text-outline/70`}
                  />
                </label>
              </div>
            </details>
          </div>

          <div className="mt-0.5 flex flex-col gap-1.5 rounded-lg bg-surface-container-high/70 p-2.5">
            {!hayAlgo && <span className="font-caption-italic text-xs italic text-outline">Todavía no elegiste productos.</span>}
            {packsElegidos.map((k) => (
              <div key={k.id} className="flex items-center justify-between font-body-sm text-xs text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="ms text-[13px] text-secondary">package_2</span>
                  {cantPacks[k.id]}× {k.nombre}
                </span>
                {!salida && <span className="font-code-num text-xs">{ars(cantPacks[k.id] * listaPack(k))}</span>}
              </div>
            ))}
            {elegidos.map((p) => (
              <div key={p.id} className="flex items-center justify-between font-body-sm text-xs text-on-surface-variant">
                <span>
                  {cantidades[p.id]}× {p.nombre}
                </span>
                {!salida && <span className="font-code-num text-xs">{ars(cantidades[p.id] * p.precio)}</span>}
              </div>
            ))}

            {salida ? (
              <>
                {costos.length > 0 && (
                  <div className="flex flex-col gap-0.5 border-t border-primary/10 pt-1.5">
                    {costos.map((c) => (
                      <div key={c.id} className="flex items-center justify-between font-body-sm text-[11px] text-outline">
                        <span>
                          Costo {c.unidades}× {porId.get(c.id)?.nombre}
                        </span>
                        <span className="font-code-num">{c.sinTanda ? "sin tanda" : ars(c.costo)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-0.5 flex items-baseline justify-between border-t border-primary/10 pt-1.5">
                  <span className="font-label-sm text-xs font-bold uppercase tracking-widest text-secondary">Costo para Edén</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-headline-xl text-[24px] leading-none tracking-tight text-primary">{ars(costoSalida)}</span>
                    <span className="font-label-sm text-[10px] text-outline">ARS</span>
                  </div>
                </div>
                <p className="font-caption-italic text-[11px] italic text-outline">
                  {faltaTanda
                    ? "Hay piezas sin tanda cargada: cargala en Productos → Nueva tanda para saber su costo."
                    : "Aproximado: cada pieza sale de la tanda más vieja con lugar. El envío se suma al despacharla. No se cobra ni suma a ventas."}
                </p>
              </>
            ) : (
              <>
                {descuentoSet > 0 && (
                  <div className="flex items-center justify-between font-body-sm text-xs text-tertiary">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="ms text-[13px]">auto_awesome</span>
                      Promoción Set (Biblia + Journal)
                    </span>
                    <span className="font-code-num text-xs font-bold">−{ars(descuentoSet)}</span>
                  </div>
                )}
                {descuentoPacks > 0 && (
                  <div className="flex items-center justify-between font-body-sm text-xs text-tertiary">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="ms text-[13px]">package_2</span>
                      Precio de pack
                    </span>
                    <span className="font-code-num text-xs font-bold">−{ars(descuentoPacks)}</span>
                  </div>
                )}
                {evaluado && !evaluado.aviso && evaluado.descuento > 0 && (
                  <div className="flex items-center justify-between font-body-sm text-xs text-tertiary">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="ms text-[13px]">confirmation_number</span>
                      Cupón {codigo}
                      {evaluado.cupon?.tipo === "porcentaje" && ` (${evaluado.cupon.valor}%)`}
                    </span>
                    <span className="font-code-num text-xs font-bold">−{ars(evaluado.descuento)}</span>
                  </div>
                )}
                {manual > 0 && (
                  <div className="flex items-center justify-between font-body-sm text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <span className="ms text-[13px] text-outline">sell</span>
                      Descuento
                    </span>
                    <span className="font-code-num text-xs font-bold">−{ars(Math.min(manual, descuentoFinal))}</span>
                  </div>
                )}
                <div className="mt-0.5 flex items-baseline justify-between border-t border-primary/10 pt-1.5">
                  <span className="font-label-sm text-xs font-bold uppercase tracking-widest text-primary">Total</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-headline-xl text-[24px] leading-none tracking-tight text-primary">{ars(total)}</span>
                    <span className="font-label-sm text-[10px] text-outline">ARS</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {error && <p className="font-caption-italic text-[13px] italic text-error">{error}</p>}
          <button
            disabled={pendiente || !hayAlgo}
            className={`flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 font-label-sm text-xs uppercase tracking-[0.1em] shadow-md transition-all active:scale-[0.99] disabled:opacity-50 ${
              salida ? "bg-secondary text-on-secondary hover:bg-on-secondary-container" : "bg-primary text-on-primary hover:bg-primary-container"
            }`}
          >
            <span>{pendiente ? "Creando…" : salida ? "Registrar salida sin cobro" : "Crear pedido"}</span>
            <span className="ms text-[16px]">arrow_forward</span>
          </button>
        </aside>
      </div>
    </form>
  );
}
