import { NextRequest, NextResponse } from "next/server";

// Nota: el middleware corre en Edge Runtime y no puede usar el helper de
// crypto de src/lib/auth.ts (usa Node "crypto"). Acá solo chequeamos que
// exista la cookie; la validación real de la firma se hace en cada
// server component/action del panel admin vía haySesionAdminValida().
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const cookie = request.cookies.get("admin_session");
    if (!cookie) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
