import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";

export const metadata: Metadata = {
  title: "TuMenuSmart",
  description: "Menú digital y pedidos por WhatsApp — TuMenuSmart",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
