"use client";

import { useState } from "react";

const caja =
  "w-full rounded-md border border-borde bg-fondo-input px-3.5 py-3 text-[1.1rem] outline-none transition-colors placeholder:text-tenue/70 focus:border-tinta focus:ring-2 focus:ring-oro/25 focus-visible:outline-none!";
const rotulo = "mb-1.5 block font-maquina text-[0.7rem] uppercase tracking-[0.12em] text-tenue";

export function FormArrepentimiento({ pedidoInicial }: { pedidoInicial: string }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/arrepentimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.codigo) setCodigo(d.codigo);
      else setError(d?.error ?? "No pudimos registrarlo. Probá de nuevo o escribinos.");
    } catch {
      setError("No pudimos registrarlo. Revisá tu conexión y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (codigo) {
    return (
      <section role="status" className="border border-musgo/30 bg-chip-hierba p-6">
        <h2 className="text-3xl font-light text-musgo">Recibimos tu pedido</h2>
        <p className="mt-4 font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Tu código</p>
        <p className="mt-1 font-maquina text-2xl tracking-wide">{codigo}</p>
        <p className="mt-4">Guardalo por cualquier consulta. Te vamos a escribir para coordinar cómo vuelve la pieza y la devolución de tu dinero.</p>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5 border border-borde bg-nota p-5 sm:p-6">
      <label className="block">
        <span className={rotulo}>Nombre y apellido</span>
        <input name="nombre" required maxLength={120} autoComplete="name" className={caja} />
      </label>
      <label className="block">
        <span className={rotulo}>Mail de la compra</span>
        <input name="email" type="email" required maxLength={160} autoComplete="email" className={caja} />
      </label>
      <label className="block">
        <span className={rotulo}>Número de pedido (si lo tenés)</span>
        <input name="pedido" maxLength={20} defaultValue={pedidoInicial} placeholder="EDN-0001" className={caja} />
      </label>
      <label className="block">
        <span className={rotulo}>¿Querés contarnos algo? (opcional)</span>
        <textarea name="motivo" rows={3} maxLength={500} className={caja} />
      </label>
      <input name="sitio" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {error && (
        <p role="alert" className="rounded-md border border-error/30 bg-error/5 px-3.5 py-2.5 italic text-error">
          {error}
        </p>
      )}
      <button disabled={enviando} className="rounded-full bg-tinta px-7 py-3.5 text-[1.15rem] text-papel transition-colors hover:bg-raiz disabled:opacity-60">
        {enviando ? "Enviando…" : "Quiero arrepentirme de mi compra"}
      </button>
    </form>
  );
}
