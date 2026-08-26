import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Las tipografías se sirven desde tu propio dominio, no desde Google.
 *
 * Next las descarga al construir y las publica junto con el sitio. Eso quita
 * una conexión a otro servidor en cada visita —que es de lo más lento que hay
 * al abrir una página— y además evita el parpadeo de texto que se ve cuando la
 * fuente llega tarde.
 *
 * Instrument Sans es variable: un solo archivo cubre todos los grosores.
 */
const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--fuente-sans",
  display: "swap",
});

/** Monoespaciada, solo para números, precios y etiquetas. */
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TuMenuSmart — Pedidos por WhatsApp para restaurantes",
  description:
    "Carta digital propia para cada restaurante, con reservas de mesa y pedidos que llegan por WhatsApp. Sin comisiones por venta.",
};

// El carrito ya no vive acá: pasó al layout de cada local, porque cada
// negocio tiene el suyo y no deben mezclarse.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
