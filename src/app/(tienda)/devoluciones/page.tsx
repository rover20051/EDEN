import type { Metadata } from "next";
import Link from "next/link";
import { linkWhatsApp } from "@/lib/format";
import { supabaseServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = {
  title: "Cambios y devoluciones · Edén",
  description: "Cómo arrepentirte de una compra, cómo te devolvemos el dinero y qué hacer si tu pieza llegó con un problema.",
};

// El mail y el WhatsApp salen de Ajustes en cada visita (si no, quedan los del momento de publicar).
export const dynamic = "force-dynamic";

const titulo = "mt-10 text-3xl font-light";

export default async function Devoluciones() {
  const { data: aj } = await supabaseServidor().from("ajustes").select("email_contacto, whatsapp_contacto").eq("id", 1).maybeSingle();
  const wa = linkWhatsApp(aj?.whatsapp_contacto as string | null, "Hola, tengo una consulta sobre una devolución.");
  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-maquina text-xs uppercase tracking-[0.14em] text-tenue">Ayuda</p>
      <h1 className="mt-2 text-4xl font-light md:text-5xl">Cambios y devoluciones</h1>

      <h2 className={titulo}>Si te arrepentís</h2>
      <p className="mt-3">
        Tenés 10 días corridos desde que recibís tu compra para arrepentirte, sin explicar el motivo y sin costo. El envío de vuelta corre por nuestra cuenta. La pieza tiene que estar sin usar.
      </p>
      <Link href="/arrepentimiento" className="mt-5 inline-block rounded-full bg-tinta px-6 py-3 text-papel transition-colors hover:bg-raiz">
        Botón de arrepentimiento
      </Link>

      <h2 className={titulo}>Cómo te devolvemos el dinero</h2>
      <p className="mt-3">
        Te lo devolvemos por el mismo medio con el que pagaste, cuando recibimos la pieza. Si pagaste con tarjeta, el banco lo acredita según sus tiempos y lo vas a ver en tu resumen. Si pagaste por transferencia, te lo transferimos a la cuenta que nos indiques.
      </p>

      <h2 className={titulo}>Si tu pieza llegó con un problema</h2>
      <p className="mt-3">Escribinos con una foto y lo resolvemos. Tus piezas tienen la garantía legal de 6 meses desde la entrega.</p>

      <h2 className={titulo}>Dónde escribirnos</h2>
      <p className="mt-3">
        {aj?.email_contacto && (
          <a className="underline underline-offset-4" href={`mailto:${aj.email_contacto}`}>
            {aj.email_contacto as string}
          </a>
        )}
        {aj?.email_contacto && wa && " · "}
        {wa && (
          <a className="underline underline-offset-4" href={wa} target="_blank" rel="noopener">
            WhatsApp
          </a>
        )}
      </p>
    </div>
  );
}
