import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Devuelve el cliente de Supabase y el admin logueado, o manda al login. Usar en cada página y acción del /admin. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  // La tabla admins solo devuelve filas si el usuario es admin (RLS), así que esto valida el permiso.
  const { data: admin } = await supabase
    .from("admins")
    .select("email, nombre, socio")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!admin) redirect("/login?error=sin-permiso");

  return { supabase, admin };
}
