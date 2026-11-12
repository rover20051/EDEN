import { recibirAvisoMP } from "@/lib/aviso-mp";

export const maxDuration = 30;

/** Aviso de Mercado Pago de los cobros reales (ver `src/lib/aviso-mp.ts`). */
export const POST = (req: Request) => recibirAvisoMP(req, "real");
