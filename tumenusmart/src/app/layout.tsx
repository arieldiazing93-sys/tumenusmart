import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TuMenuSmart",
  description: "Menú digital y pedidos por WhatsApp — TuMenuSmart",
};

// El carrito ya no vive acá: pasó al layout de cada local, porque cada
// negocio tiene el suyo y no deben mezclarse.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
