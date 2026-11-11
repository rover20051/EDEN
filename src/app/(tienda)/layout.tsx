import Link from "next/link";

/** Marco de las páginas públicas de la tienda: mismo papel, letra y logo que la web. */
export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col text-[1.15rem] leading-relaxed">
      <header className="border-b border-borde">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-10">
          <Link href="/" aria-label="Edén, volver al inicio" className="block">
            <span
              className="block aspect-[1140/520] w-24 bg-tinta [mask:url(/marca/logo.png)_center/contain_no-repeat] [-webkit-mask:url(/marca/logo.png)_center/contain_no-repeat]"
              aria-hidden
            />
          </Link>
          <Link href="/#tienda" className="italic text-tenue underline-offset-4 hover:underline">
            ← Volver al jardín
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 md:px-10 md:py-14">{children}</main>
      <footer className="border-t border-borde py-6 text-center text-base italic text-tenue">
        Edén · Biblias artesanales de cuero, hechas a mano en Argentina.
        <p className="mt-1 flex flex-wrap justify-center gap-x-4 text-[0.95rem] not-italic">
          <Link href="/arrepentimiento" className="underline underline-offset-4">
            Botón de arrepentimiento
          </Link>
          <Link href="/devoluciones" className="underline underline-offset-4">
            Cambios y devoluciones
          </Link>
        </p>
      </footer>
    </div>
  );
}
