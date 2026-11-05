"use client";

import { useActionState, useState } from "react";
import { iniciarSesion } from "./actions";

const campo =
  "w-full rounded-full bg-[#FBF7F0] py-3 pl-5 pr-11 font-body-md text-body-md text-on-surface transition-all duration-200 placeholder:font-caption-italic placeholder:text-caption-italic placeholder:text-outline/70 focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px_#775a06] focus:outline-none";

export function FormLogin({ aviso }: { aviso?: string }) {
  const [error, enviar, pendiente] = useActionState(iniciarSesion, aviso ?? null);
  const [ver, setVer] = useState(false);

  return (
    <form action={enviar} className="flex w-full flex-col space-y-5">
      <div className="flex flex-col space-y-2">
        <label htmlFor="email" className="font-label-sm text-label-sm uppercase tracking-[0.14em] text-on-surface-variant">
          Mail
        </label>
        <div className="relative flex items-center">
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@mail.com" className={campo} />
          <span className="ms pointer-events-none absolute right-4 text-[18px] text-outline/60">alternate_email</span>
        </div>
      </div>
      <div className="flex flex-col space-y-2">
        <label htmlFor="password" className="font-label-sm text-label-sm uppercase tracking-[0.14em] text-on-surface-variant">
          Contraseña
        </label>
        <div className="relative flex items-center">
          <input
            id="password"
            name="password"
            type={ver ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••••••"
            className={`${campo} tracking-widest`}
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            aria-label="Mostrar u ocultar contraseña"
            className="absolute right-4 text-outline/70 transition-colors hover:text-primary focus:outline-none"
          >
            <span className="ms text-[19px]">{ver ? "visibility_off" : "visibility"}</span>
          </button>
        </div>
      </div>
      {error && <p className="text-center font-caption-italic text-caption-italic italic text-error">{error}</p>}
      <div className="pt-3">
        <button
          disabled={pendiente}
          className="group flex w-full items-center justify-center space-x-2 rounded-full bg-primary-container px-6 py-3.5 font-label-md text-label-md uppercase tracking-[0.16em] text-[#FBF7F0] shadow-md transition-all duration-200 hover:bg-primary hover:shadow-lg active:bg-[#211a16] disabled:opacity-60"
        >
          <span>{pendiente ? "Entrando…" : "Entrar"}</span>
          <span className="ms text-[17px] transition-transform duration-200 group-hover:translate-x-1">arrow_forward</span>
        </button>
      </div>
    </form>
  );
}
