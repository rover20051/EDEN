import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cliente con la clave secreta, solo para el servidor de la tienda (checkout, seguimiento, catálogo público). */
export const supabaseServidor = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
