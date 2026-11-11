import type { Metadata } from "next";
import { AdminProviders } from "@/components/admin-providers";
import { Campana } from "@/components/campana";
import { Nav } from "@/components/nav";
import { MenuCuenta } from "@/components/menu-cuenta";
import { BotonPaleta } from "@/components/paleta";
import { requireAdmin } from "@/lib/auth";
import { urlFotoPublica } from "@/lib/fotos";

export const metadata: Metadata = {
  title: "Edén · Back office",
  // En el iPhone, "Agregar a inicio" instala esto como app: sin eso Safari no permite notificaciones.
  appleWebApp: { capable: true, title: "Edén", statusBarStyle: "default" },
  icons: { apple: "/marca/app-180.png" },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { admin, supabase } = await requireAdmin();
  // Aparte de requireAdmin: si la columna todavía no existe, se ve la inicial y nadie se queda afuera.
  const { data: yo } = await supabase.from("admins").select("foto_path").eq("email", admin.email).maybeSingle();
  return (
    <div className="tema-admin min-h-screen bg-surface font-body-md text-body-md text-on-surface selection:bg-surface-variant">
      {/* Íconos del diseño (Material Symbols) */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
      />
      <AdminProviders>
        <Nav nombre={admin.nombre} />
        <div className="md:pl-[var(--barra)] md:transition-[padding] md:duration-200 md:ease-out">
          <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between gap-space-sm bg-surface/85 px-space-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-md md:left-[var(--barra)] md:px-space-xl md:transition-[left] md:duration-200 md:ease-out">
            <div className="flex min-w-0 items-center gap-space-sm font-label-sm text-label-sm uppercase tracking-widest text-outline">
              <span className="ms text-[16px]">auto_stories</span>
              <span className="hidden truncate min-[480px]:inline">Biblias y journals de cuero</span>
            </div>
            <div className="flex items-center gap-space-sm md:gap-space-md">
              <BotonPaleta />
              <Campana />
              <MenuCuenta nombre={admin.nombre} email={admin.email} foto={urlFotoPublica(yo?.foto_path as string | null | undefined)} />
            </div>
          </header>
          <main className="relative min-h-screen bg-surface px-4 pb-28 pt-20 md:px-space-lg md:pb-10">{children}</main>
        </div>
      </AdminProviders>
    </div>
  );
}
