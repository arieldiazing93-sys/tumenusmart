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
    const cookie = request.cookies.get(COOKIE_NAME)?.value;

    if (!cookie || !(await cookieBienFirmada(cookie))) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
