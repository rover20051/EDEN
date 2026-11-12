import { recibirAvisoNave } from "@/lib/aviso-nave";

export const maxDuration = 30;

/** Aviso de Nave de los pagos hechos con el link de prueba (sandbox; ver `src/lib/aviso-nave.ts`). */
export const POST = (req: Request) => recibirAvisoNave(req, "prueba");
