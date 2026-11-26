import { FormLogin } from "./form";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const aviso = error === "sin-permiso" ? "Ese usuario no tiene acceso al back office" : undefined;

  return (
    <main className="tema-admin flex min-h-screen w-full items-center justify-center bg-surface p-space-md">
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
      />
      <div className="flex w-full flex-col items-center justify-center px-space-md py-space-xl selection:bg-secondary-fixed selection:text-primary">
        <div className="relative flex w-full max-w-[430px] flex-col items-center">
          <div className="pointer-events-none absolute -left-10 -top-12 h-44 w-44 rounded-full bg-secondary-fixed-dim/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -right-8 h-48 w-48 rounded-full bg-tertiary-fixed-dim/30 blur-3xl" />
          <div className="relative flex w-full flex-col items-center rounded-[2rem] bg-[#FBF7F0] px-8 py-10 shadow-xl shadow-primary/5 sm:px-10 sm:py-12">
            <div className="mb-8 flex flex-col items-center space-y-1 text-center">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-primary-container shadow-inner">
                <span className="ms text-[19px]">menu_book</span>
              </div>
              <h1 className="select-none font-headline-xl text-headline-xl font-normal uppercase tracking-[0.22em] text-primary">Edén</h1>
              <p className="-mt-1 font-headline-md text-headline-md font-normal italic tracking-wide text-on-surface-variant/80">Back office</p>
            </div>
            <FormLogin aviso={aviso} />
            <div className="mt-8 flex w-full flex-col items-center pt-6 text-center">
              <div className="mt-4 flex items-center space-x-2 opacity-50">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                <span className="font-label-sm text-[10px] uppercase tracking-widest text-outline">Acceso privado</span>
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
