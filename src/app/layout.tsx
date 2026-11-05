import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Cormorant_Garamond, Courier_Prime, EB_Garamond, Italiana, Literata } from "next/font/google";
import { SCRIPT_BARRA } from "@/components/barra-script";
import "./globals.css";

const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const courier = Courier_Prime({ variable: "--font-courier", subsets: ["latin"], weight: ["400", "700"] });
const italiana = Italiana({ variable: "--font-italiana", subsets: ["latin"], weight: "400" });
// Back office (diseño de Stitch)
const garamond = EB_Garamond({ variable: "--font-garamond", subsets: ["latin"], weight: ["400", "500", "600"] });
const literata = Literata({ variable: "--font-literata", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Edén",
  description: "Biblias artesanales de cuero, hechas a mano en Argentina.",
};

export const viewport: Viewport = {
  themeColor: "#f3ebe0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning className={`${cormorant.variable} ${courier.variable} ${italiana.variable} ${garamond.variable} ${literata.variable} h-full`}>
      <body className="min-h-full">
        {/* Preferencia de la barra lateral del /admin, aplicada antes de pintar (sin parpadeo) */}
        <Script id="barra-lateral" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: SCRIPT_BARRA }} />
        {children}
      </body>
    </html>
  );
}
