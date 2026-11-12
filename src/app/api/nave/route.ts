import { recibirAvisoNave } from "@/lib/aviso-nave";

export const maxDuration = 30;

/** Aviso de Nave de los cobros reales (ver `src/lib/aviso-nave.ts`). */
export const POST = (req: Request) => recibirAvisoNave(req, "real");
