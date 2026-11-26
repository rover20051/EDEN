// La sesión del /admin solo la lee el servidor (no hay cliente de Supabase en el navegador): la cookie va fuera del
// alcance de JavaScript y, publicada, solo por HTTPS.
export const OPCIONES_COOKIE = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const };
