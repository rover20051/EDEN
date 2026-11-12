import type { Metadata } from "next";
import { connection } from "next/server";
import { catalogoPublico } from "@/lib/catalogo";
import { clavePublicaMP } from "@/lib/mercadopago";
import { modoPago, tarjetaHabilitada } from "@/lib/pagos";
import { estadoVenta } from "@/lib/venta";
import { Checkout } from "./checkout";

export const metadata: Metadata = { title: "Tu pedido · Edén" };

export default async function PaginaCheckout() {
  await connection(); // stock, precios y modo de pago siempre del momento, nunca del build
  if ((await estadoVenta()) === "cerrada") {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-4xl font-light">Muy pronto</h1>
        <p className="mt-4 italic text-tenue">Todavía no abrimos las ventas. Estamos terminando los últimos detalles.</p>
        <a href="/" className="mt-6 inline-block underline underline-offset-4">
          Volver al jardín
        </a>
      </div>
    );
  }
  const catalogo = await catalogoPublico();
  const modo = await modoPago();
  return <Checkout catalogo={catalogo} modoTarjeta={(await tarjetaHabilitada()) && modo ? modo : null} clavePublicaMP={modo === "mercadopago" ? clavePublicaMP() : ""} />;
}
