import { recibirAvisoMP } from "@/lib/aviso-mp";

export const maxDuration = 30;

/** Aviso de Mercado Pago de los pagos hechos con el link de prueba (credenciales de prueba; ver `src/lib/aviso-mp.ts`). */
export const POST = (req: Request) => recibirAvisoMP(req, "prueba");
