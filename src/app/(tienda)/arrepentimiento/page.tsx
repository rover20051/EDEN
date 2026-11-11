import type { Metadata } from "next";
import Link from "next/link";
import { FormArrepentimiento } from "./form";

export const metadata: Metadata = {
  title: "Botón de arrepentimiento · Edén",
  description: "Arrepentite de tu compra en Edén dentro de los 10 días corridos, sin registrarte y sin costo.",
};

export default async function Arrepentimiento({ searchParams }: PageProps<"/arrepentimiento">) {
  const { pedido } = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <p className="font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Tu derecho</p>
      <h1 className="mt-2 text-4xl font-light md:text-5xl">Botón de arrepentimiento</h1>
      <p className="mt-4">
        Tenés <strong className="font-medium">10 días corridos</strong> desde que recibís tu compra para arrepentirte. No hace falta registrarte ni explicar el motivo, y el envío de vuelta corre por nuestra cuenta.
      </p>
      <p className="mt-3 mb-8 italic text-tenue">
        Te damos un código en el momento. Más detalles en{" "}
        <Link href="/devoluciones" className="underline underline-offset-4">
          cambios y devoluciones
        </Link>
        .
      </p>
      <FormArrepentimiento pedidoInicial={typeof pedido === "string" ? pedido.slice(0, 20) : ""} />
    </div>
  );
}
