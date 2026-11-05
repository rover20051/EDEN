import type { Metadata } from "next";
import { connection } from "next/server";
import { catalogoPublico } from "@/lib/catalogo";
import { modoPago, tarjetaHabilitada } from "@/lib/pagos";
import { Checkout } from "./checkout";

export const metadata: Metadata = { title: "Tu pedido · Edén" };

export default async function PaginaCheckout() {
  await connection(); // stock, precios y modo de pago siempre del momento, nunca del build
  const catalogo = await catalogoPublico();
  const modo = modoPago();
  return <Checkout catalogo={catalogo} modoTarjeta={tarjetaHabilitada() && modo ? modo : null} />;
}
