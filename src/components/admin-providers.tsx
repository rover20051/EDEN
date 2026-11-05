"use client";

import { Atajos } from "@/components/atajos";
import { ConfirmarProvider } from "@/components/confirmar";
import { PaletaProvider } from "@/components/paleta";
import { BarraProgreso } from "@/components/progreso";
import { ToastProvider } from "@/components/toasts";

/** Todo lo "premium" del /admin que necesita contexto de cliente: avisos, confirmaciones, paleta, atajos y progreso. */
export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmarProvider>
        <PaletaProvider>
          <BarraProgreso />
          <Atajos />
          {children}
        </PaletaProvider>
      </ConfirmarProvider>
    </ToastProvider>
  );
}
