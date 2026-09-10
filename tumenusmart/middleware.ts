import { NextRequest, NextResponse } from "next/server";

// El middleware corre en Edge Runtime, donde no está el módulo "crypto" de
// Node. Sí está la Web Crypto del navegador, que alcanza para verificar la
// firma de la cookie — y eso es justamente lo que conviene hacer acá.
//
// Por qué vale la pena: una cookie inventada queda frenada en la puerta, sin
// llegar a ninguna pantalla ni a ninguna ruta de API. Si alguna vez se agrega
// una ruta nueva y se olvida el control de acceso, esta capa sigue tapando el
// caso más burdo.
//
// Lo que el middleware NO puede hacer es mirar la base: no sabe si el usuario
// sigue activo, ni a qué local pertenece. Eso se resuelve en cada pantalla
// con sesionActual(). Son dos capas distintas y las dos hacen falta.

const COOKIE_NAME = "admin_session";
const DIAS_DE_SESION = 7;

let claveCache: CryptoKey | null = null;

async function claveDeFirma(): Promise<CryptoKey> {
  if (claveCache) return claveCache;
  const secreto = process.env.SESSION_SECRET ?? "dev-secret-cambiar";
  claveCache = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return claveCache;
}

function aHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compara sin cortar en la primera diferencia. */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

async function cookieBienFirmada(valor: string): Promise<boolean> {
  const corte = valor.lastIndexOf(".");
  if (corte <= 0) return false;

  const usuarioId = valor.slice(0, corte);
  const firma = valor.slice(corte + 1);

  const firmada = await crypto.subtle.sign(
    "HMAC",
    await claveDeFirma(),
    new TextEncoder().encode(usuarioId)
  );

  return igualesEnTiempoConstante(firma, aHex(firmada));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    // En producción, sin SESSION_SECRET configurado, las cookies se firman
    // con el literal "dev-secret-cambiar" que está escrito acá arriba y en
    // el código fuente público — cualquiera podría armarse una cookie de
    // administrador válida. `lib/auth.ts` ya corta el INGRESO en este caso
    // (`exigirSecretoDeSesion`), pero eso no invalida una cookie que ya
    // exista; esta es la otra mitad: ninguna cookie se acepta como válida
    // acá tampoco mientras falte la variable, así no queda ninguna puerta
    // abierta con el secreto de ejemplo.
    if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const cookie = request.cookies.get(COOKIE_NAME)?.value;

    if (!cookie || !(await cookieBienFirmada(cookie))) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    // Sesión "deslizante": los 7 días se cuentan desde la ÚLTIMA visita, no
    // desde que entró una vez. Un local que deja la pantalla de pedidos
    // abierta en el mostrador nunca la toca "para volver a entrar" — y el
    // aviso sonoro de pedidos nuevos ya golpea el servidor cada 15 segundos
    // mientras esa pestaña sigue abierta. Aprovechamos ese mismo tráfico
    // para renovar la cookie en cada visita: mientras el panel siga en uso,
    // la sesión no vence. Si el dispositivo queda sin tocar los 7 días
    // completos, ahí sí expira — ese es el límite real, no una fecha fija.
    const respuesta = NextResponse.next();
    respuesta.cookies.set(COOKIE_NAME, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * DIAS_DE_SESION,
      path: "/",
    });
    return respuesta;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
