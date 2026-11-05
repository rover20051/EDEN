import { Accion } from "@/components/accion";
import { Encabezado, Indicador, icono, sombraTarjeta } from "@/components/stitch";
import { requireAdmin } from "@/lib/auth";
import { ars, fecha, hoyAR } from "@/lib/format";
import { alternarCupon, borrarCupon } from "./acciones";
import { FormCupon } from "./form-cupon";

export const metadata = { title: "Cupones · Edén" };

type Cupon = {
  codigo: string;
  tipo: "porcentaje" | "monto";
  valor: number;
  minimo: number;
  usos_max: number | null;
  vence: string | null;
  activo: boolean;
  nota: string | null;
  created_at: string;
};
type Uso = { cupon: string; descuento_cupon: number; estado: string };

const ESTADO = {
  activo: { label: "Activo", clase: "bg-tertiary-fixed text-tertiary" },
  pausado: { label: "Pausado", clase: "bg-surface-container-high text-outline" },
  vencido: { label: "Vencido", clase: "bg-error-container text-error" },
  agotado: { label: "Agotado", clase: "bg-secondary-fixed text-secondary" },
} as const;

export default async function Cupones() {
  const { supabase } = await requireAdmin();
  const [{ data: cupones, error }, { data: usos }] = await Promise.all([
    supabase.from("cupones").select("codigo, tipo, valor, minimo, usos_max, vence, activo, nota, created_at").order("created_at", { ascending: false }),
    supabase.from("pedidos").select("cupon, descuento_cupon, estado").not("cupon", "is", null),
  ]);

  const hoy = hoyAR();
  // Usos = pedidos no cancelados con ese cupón (igual que cuenta la base al validar).
  const stats = new Map<string, { usos: number; descontado: number; cancelados: number }>();
  for (const u of (usos ?? []) as Uso[]) {
    const s = stats.get(u.cupon) ?? { usos: 0, descontado: 0, cancelados: 0 };
    if (u.estado === "cancelado") s.cancelados++;
    else {
      s.usos++;
      s.descontado += Number(u.descuento_cupon);
    }
    stats.set(u.cupon, s);
  }
  const lista = ((cupones ?? []) as Cupon[]).map((c) => {
    const s = stats.get(c.codigo) ?? { usos: 0, descontado: 0, cancelados: 0 };
    const estado: keyof typeof ESTADO = !c.activo
      ? "pausado"
      : c.vence && c.vence < hoy
        ? "vencido"
        : c.usos_max != null && s.usos >= c.usos_max
          ? "agotado"
          : "activo";
    return { ...c, ...s, estado };
  });
  const vigentes = lista.filter((c) => c.estado === "activo").length;
  const usosTotal = lista.reduce((n, c) => n + c.usos, 0);
  const descontado = lista.reduce((n, c) => n + c.descontado, 0);

  const descuento = (c: Cupon) => (c.tipo === "porcentaje" ? `${c.valor}%` : ars(c.valor));
  const usosTexto = (c: (typeof lista)[number]) => `${c.usos}${c.usos_max != null ? ` de ${c.usos_max}` : ""}`;
  const chip = (e: keyof typeof ESTADO) => (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-label-sm text-[10px] font-bold uppercase tracking-widest ${ESTADO[e].clase}`}>{ESTADO[e].label}</span>
  );
  const acciones = (c: (typeof lista)[number]) => (
    <div className="flex items-center justify-end gap-1">
      <Accion accion={alternarCupon.bind(null, c.codigo, !c.activo)} variante="secundaria" className="!px-2.5 !py-1 !text-[10px]">
        {icono(c.activo ? "pause" : "play_arrow", "text-[14px]")}
        <span>{c.activo ? "Pausar" : "Activar"}</span>
      </Accion>
      {c.usos + c.cancelados === 0 && (
        <Accion
          accion={borrarCupon.bind(null, c.codigo)}
          variante="secundaria"
          confirmar={`¿Borrar el cupón ${c.codigo}? Nadie lo usó todavía.`}
          className="!bg-transparent !px-1.5 !py-1 text-outline hover:!bg-error-container hover:text-error"
        >
          <span className="ms text-[16px]" aria-label={`Borrar ${c.codigo}`}>
            delete
          </span>
        </Accion>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 pb-4">
      <Encabezado ceja="Promociones" titulo="Cupones" bajada="Códigos de descuento para la web y las ventas manuales." />

      {error ? (
        <p className="rounded-2xl bg-error-container/50 px-4 py-3 font-caption-italic text-[13px] italic text-error">
          No se pudieron leer los cupones. ¿Ya se corrió la migración 0006 en Supabase? ({error.message})
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Indicador titulo="Vigentes" icono="confirmation_number" iconoColor="text-tertiary" valor={vigentes} nota={`de ${lista.length} creados`} />
            <Indicador titulo="Usos" icono="shopping_bag" valor={usosTotal} nota="pedidos no cancelados" />
            <div className="col-span-2 md:col-span-1">
              <Indicador titulo="Descontado" icono="sell" iconoColor="text-secondary" valor={ars(descontado)} nota="en total" />
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
            <section className="flex min-w-0 flex-col gap-2 lg:col-span-8">
              {lista.length === 0 ? (
                <div className={`flex flex-col items-center gap-2 rounded-2xl bg-surface-container-low px-4 py-10 text-center ${sombraTarjeta}`}>
                  <span className="ms text-[32px] text-outline-variant">confirmation_number</span>
                  <h2 className="font-headline-md text-[18px] uppercase tracking-[0.05em] text-primary">Todavía no hay cupones</h2>
                  <p className="max-w-sm font-caption-italic text-[13px] italic text-outline">Creá el primero con el formulario. Se puede usar en la web y en Nuevo pedido.</p>
                </div>
              ) : (
                <>
                  {/* Compu: tabla */}
                  <div className={`hidden overflow-hidden rounded-[2rem] bg-surface-container-lowest md:block ${sombraTarjeta}`}>
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-widest text-outline">
                          <th className="px-4 py-2 pl-6 font-normal">Código</th>
                          <th className="px-3 py-2 text-right font-normal">Descuento</th>
                          <th className="px-3 py-2 text-right font-normal">Mínimo</th>
                          <th className="px-3 py-2 text-right font-normal">Usos</th>
                          <th className="px-3 py-2 text-right font-normal">Descontó</th>
                          <th className="px-3 py-2 font-normal">Vence</th>
                          <th className="px-3 py-2 text-center font-normal">Estado</th>
                          <th className="px-4 py-2 pr-6 font-normal" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-variant/50">
                        {lista.map((c) => (
                          <tr key={c.codigo} className={`transition-colors hover:bg-surface-container-high/50 ${c.estado === "activo" ? "" : "opacity-75"}`}>
                            <td className="px-4 py-2 pl-6">
                              <span className="font-code-num text-code-num font-bold tracking-wider text-primary">{c.codigo}</span>
                              {c.nota && <span className="block max-w-[16rem] truncate font-caption-italic text-[12px] italic text-outline">{c.nota}</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-code-num text-code-num text-primary">{descuento(c)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-code-num text-[13px] text-on-surface-variant">{c.minimo ? ars(c.minimo) : "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-code-num text-[13px] text-primary">{usosTexto(c)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-code-num text-[13px] text-primary">{c.descontado ? ars(c.descontado) : "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-label-sm text-label-sm text-outline">{c.vence ? fecha(`${c.vence}T12:00:00`) : "Sin vencimiento"}</td>
                            <td className="px-3 py-2 text-center">{chip(c.estado)}</td>
                            <td className="px-4 py-2 pr-6">{acciones(c)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Celular: tarjetas */}
                  <div className="flex flex-col gap-2 md:hidden">
                    {lista.map((c) => (
                      <div key={c.codigo} className={`flex flex-col gap-2 rounded-2xl bg-surface-container-low p-3 ${sombraTarjeta}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-code-num text-[15px] font-bold tracking-wider text-primary">{c.codigo}</span>
                            {c.nota && <span className="block truncate font-caption-italic text-[12px] italic text-outline">{c.nota}</span>}
                          </div>
                          {chip(c.estado)}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              ["Descuento", descuento(c)],
                              ["Usos", usosTexto(c)],
                              ["Descontó", c.descontado ? ars(c.descontado) : "—"],
                            ] as const
                          ).map(([k, v]) => (
                            <div key={k} className="flex flex-col">
                              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">{k}</span>
                              <span className="font-code-num text-[13px] font-bold text-primary">{v}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-primary/10 pt-2">
                          <span className="font-caption-italic text-[12px] italic text-outline">
                            {c.minimo ? `Desde ${ars(c.minimo)}` : "Sin mínimo"} · {c.vence ? `vence ${fecha(`${c.vence}T12:00:00`)}` : "sin vencimiento"}
                          </span>
                          {acciones(c)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <aside className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-3 shadow-sm lg:sticky lg:top-20 lg:col-span-4">
              <div className="flex items-center gap-1.5 pb-0.5">
                <span className="ms text-[18px] text-secondary">add_circle</span>
                <h2 className="font-headline-md text-[17px] uppercase tracking-[0.05em] text-primary">Nuevo cupón</h2>
              </div>
              <FormCupon />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
