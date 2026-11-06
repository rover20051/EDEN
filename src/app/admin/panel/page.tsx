import { Seccion, Tarjeta, Titulo, Vacio } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ars } from "@/lib/format";
import { CANALES, ORIGENES } from "@/lib/textos";

type Metricas = {
  recupero: { invertido: number; recuperado: number; pedidos: number; ventas_faltan: number | null };
  stock: {
    producto: string;
    tipo: "biblia" | "journal" | "otro";
    disponibles: number;
    vendidas_14d: number;
    dias_hasta_agotar: number | null;
    pedir_lote: boolean;
  }[];
  dias_fabricacion_lote: number;
  ganancia_producto: { producto: string; unidades: number; real: number; planificada: number }[];
  set: { pedidos: number; con_set: number; objetivo: number };
  publicidad: { gasto: number; ventas: number; objetivo: number };
  canales: { nombre: keyof typeof CANALES; pedidos: number; total: number }[];
  origenes: { nombre: keyof typeof ORIGENES; pedidos: number; total: number }[];
  envio: { promedio_real: number | null; envios: number; estimado: number };
  por_acreditar: { semana: string; neto: number }[];
};

/** Cada bloque responde una pregunta y dice qué hacer con la respuesta. */
function Bloque({
  pregunta,
  respuesta,
  tono = "neutro",
  children,
}: {
  pregunta: string;
  respuesta: React.ReactNode;
  tono?: "bien" | "alerta" | "neutro";
  children?: React.ReactNode;
}) {
  const color = { bien: "border-l-hierba", alerta: "border-l-oro", neutro: "border-l-borde" }[tono];
  return (
    <Tarjeta className={`border-l-4 ${color}`}>
      <div className="text-sm text-tenue">{pregunta}</div>
      <div className="mt-1 font-medium">{respuesta}</div>
      {children && <div className="mt-3">{children}</div>}
    </Tarjeta>
  );
}

function Barra({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-fondo" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-tinta" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function Panel() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("metricas_panel");
  if (error || !data) return <Vacio>No se pudieron calcular las métricas: {error?.message}</Vacio>;
  const m = data as Metricas;

  const r = m.recupero;
  const pctSet = m.set.pedidos ? m.set.con_set / m.set.pedidos : 0;
  const costoVenta = m.publicidad.ventas ? Math.round(m.publicidad.gasto / m.publicidad.ventas) : null;
  const lotePronto = m.stock.filter((s) => s.pedir_lote);

  return (
    <>
      <Titulo>Panel</Titulo>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque
          pregunta="¿Ya recuperamos lo invertido?"
          tono={r.recuperado >= r.invertido && r.invertido > 0 ? "bien" : "neutro"}
          respuesta={
            r.invertido === 0
              ? "Cargá los gastos en Plata para calcularlo."
              : r.recuperado >= r.invertido
                ? `Sí: recuperamos ${ars(r.recuperado)} de ${ars(r.invertido)}. Desde acá, todo es ganancia.`
                : `${ars(r.recuperado)} de ${ars(r.invertido)}${r.ventas_faltan != null ? ` · faltan ~${r.ventas_faltan} ventas al ritmo actual` : ""}`
          }
        >
          <Barra valor={r.recuperado} max={r.invertido} />
        </Bloque>

        <Bloque
          pregunta="¿Cuándo pedimos el próximo lote?"
          tono={lotePronto.length || m.stock.some((s) => s.disponibles === 0) ? "alerta" : "neutro"}
          respuesta={
            lotePronto.length
              ? `Ahora: ${lotePronto.map((s) => s.producto).join(", ")} se agota antes de lo que tarda en fabricarse un lote (${m.dias_fabricacion_lote} días).`
              : m.stock.some((s) => s.disponibles === 0)
                ? `Sin stock: ${m.stock.filter((s) => s.disponibles === 0).map((s) => s.producto).join(", ")}.`
                : "Todavía no hace falta."
          }
        >
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            {(["biblia", "journal", "otro"] as const).map((t) => {
              const filas = m.stock.filter((s) => s.tipo === t);
              if (t === "otro" && filas.length === 0) return null;
              return (
                <div key={t}>
                  <div className="mb-1 font-maquina text-xs uppercase tracking-wider text-tenue">
                    {t === "biblia" ? "Biblias" : t === "journal" ? "Journals" : "Otros"} · {filas.reduce((n, s) => n + s.disponibles, 0)} en stock
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {filas.map((s) => (
                      <li key={s.producto} className={`flex justify-between gap-3 ${s.pedir_lote || s.disponibles === 0 ? "text-oro" : ""}`}>
                        <span>{s.producto.replace(/^(Biblia|Journal) /, "")}</span>
                        <span className="tabular-nums">
                          {s.disponibles}
                          {s.dias_hasta_agotar != null && <span className="text-tenue"> · ~{s.dias_hasta_agotar} d</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Bloque>

        <Bloque
          pregunta="¿Ganamos lo que planeamos por unidad?"
          respuesta={
            m.ganancia_producto.length === 0
              ? "Aparece con las primeras ventas cobradas."
              : m.ganancia_producto.some((g) => g.real < g.planificada * 0.85)
                ? "Hay productos que dejan bastante menos de lo planeado: revisá precio o costo."
                : "Sí, estamos en línea con lo planeado."
          }
          tono={m.ganancia_producto.some((g) => g.real < g.planificada * 0.85) ? "alerta" : "neutro"}
        >
          {m.ganancia_producto.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-tenue">
                <tr>
                  <th className="font-normal">Producto</th>
                  <th className="text-right font-normal">Real</th>
                  <th className="text-right font-normal">Planeado</th>
                </tr>
              </thead>
              <tbody>
                {m.ganancia_producto.map((g) => (
                  <tr key={g.producto}>
                    <td>
                      {g.producto} <span className="text-tenue">({g.unidades})</span>
                    </td>
                    <td className="text-right tabular-nums">{ars(g.real)}</td>
                    <td className="text-right tabular-nums text-tenue">{ars(g.planificada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Bloque>

        <Bloque
          pregunta="¿El Set está funcionando? (últimos 30 días)"
          tono={m.set.pedidos === 0 ? "neutro" : pctSet >= m.set.objetivo ? "bien" : "alerta"}
          respuesta={
            m.set.pedidos === 0
              ? "Sin pedidos todavía."
              : `${Math.round(pctSet * 100)}% de los pedidos llevan el Set (objetivo ${Math.round(m.set.objetivo * 100)}%).${
                  pctSet < m.set.objetivo ? " Probá destacarlo más o ajustar la diferencia de precio." : ""
                }`
          }
        />

        <Bloque
          pregunta="¿La publicidad se paga sola? (últimos 30 días)"
          tono={costoVenta == null ? "neutro" : costoVenta <= m.publicidad.objetivo ? "bien" : "alerta"}
          respuesta={
            m.publicidad.gasto === 0
              ? "No hay gasto de publicidad cargado."
              : costoVenta == null
                ? `Gastamos ${ars(m.publicidad.gasto)} y ninguna venta vino de un anuncio. Revisá la pauta (y marcá "Anuncio pago" al cargar pedidos).`
                : `Cada venta por anuncio costó ${ars(costoVenta)} (objetivo ${ars(m.publicidad.objetivo)}). ${
                    costoVenta <= m.publicidad.objetivo ? "Se puede subir el presupuesto." : "Bajá o cambiá la pauta."
                  }`
          }
        />

        <Bloque pregunta="¿De dónde vienen las ventas? (últimos 30 días)" respuesta={m.origenes.length ? "Poné el contenido donde más se vende." : "Sin ventas todavía."}>
          {m.origenes.length > 0 && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { titulo: "Cómo nos conocieron", filas: m.origenes.map((o) => ({ k: ORIGENES[o.nombre] ?? o.nombre, ...o })) },
                { titulo: "Por dónde compraron", filas: m.canales.map((c) => ({ k: CANALES[c.nombre] ?? c.nombre, ...c })) },
              ].map((g) => (
                <div key={g.titulo}>
                  <div className="mb-1 text-tenue">{g.titulo}</div>
                  <ul className="flex flex-col gap-0.5">
                    {g.filas.map((f) => (
                      <li key={f.k} className="flex justify-between gap-2">
                        <span>{f.k}</span>
                        <span className="tabular-nums">{f.pedidos}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Bloque>

        <Bloque
          pregunta="¿El envío cuesta lo que estimamos?"
          tono={m.envio.promedio_real != null && m.envio.promedio_real > m.envio.estimado * 1.1 ? "alerta" : "neutro"}
          respuesta={
            m.envio.promedio_real == null
              ? "Aparece con los primeros despachos."
              : `Promedio real ${ars(m.envio.promedio_real)} contra ${ars(m.envio.estimado)} estimado (${m.envio.envios} envíos).${
                  m.envio.promedio_real > m.envio.estimado * 1.1 ? " Cotizá otra empresa o cobrá el envío en los productos sueltos." : ""
                }`
          }
        />
      </div>

      {m.por_acreditar.length > 0 && (
        <Seccion titulo="Plata de Mercado Pago que entra por semana">
          <Tarjeta>
            <ul className="flex flex-col gap-1 text-sm">
              {m.por_acreditar.map((s) => (
                <li key={s.semana} className="flex justify-between">
                  <span>Semana del {s.semana.split("-").reverse().slice(0, 2).join("/")}</span>
                  <span className="font-medium tabular-nums">{ars(s.neto)}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </Seccion>
      )}
    </>
  );
}
