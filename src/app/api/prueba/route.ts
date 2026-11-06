import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_PRUEBA, claveCorrecta, valorCookiePrueba } from "@/lib/venta";

/** Link privado para probar la tienda antes de abrirla: /api/prueba?clave=… entra y /api/prueba?salir=1 sale. */
export async function GET(req: NextRequest) {
  const destino = req.nextUrl.clone();
  destino.pathname = "/";
  destino.search = "";
  const respuesta = NextResponse.redirect(destino);
  if (req.nextUrl.searchParams.has("salir")) {
    respuesta.cookies.delete(COOKIE_PRUEBA);
  } else if (claveCorrecta(req.nextUrl.searchParams.get("clave") ?? "")) {
    respuesta.cookies.set(COOKIE_PRUEBA, valorCookiePrueba()!, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 3600,
    });
  }
  return respuesta;
}
