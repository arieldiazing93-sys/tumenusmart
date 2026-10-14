-- Reserva de canchas: su página pública pasa a ser INDEPENDIENTE de la de la Reserva de turnos.
-- Antes compartían una sola fila (PaginaReservas): guardar una pisaba la otra. Ahora el complejo tiene la suya (PaginaCanchas):
-- su propia portada, nombre, contacto, redes, galería, colores y campos del formulario. Arranca vacía a propósito (no se copia
-- nada de turnos): el dueño la arma en Reserva de canchas → Página de reservas. Se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "PaginaCanchas" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "habilitada" BOOLEAN NOT NULL DEFAULT false,
  "nombre" TEXT NOT NULL,
  "industria" TEXT,
  "descripcion" TEXT,
  "email" TEXT,
  "telefono" TEXT,
  "fotoUrl" TEXT,
  "bannerUrl" TEXT,
  "instagram" TEXT,
  "tiktok" TEXT,
  "facebook" TEXT,
  "whatsapp" TEXT,
  "avisoWhatsapp" BOOLEAN NOT NULL DEFAULT true,
  "entradaCalendario" TEXT NOT NULL DEFAULT 'al_reservar',
  "galeria" JSONB NOT NULL DEFAULT '[]',
  "googleMapsUrl" TEXT,
  "colorPrimario" TEXT NOT NULL DEFAULT '#3B82F6',
  "tema" TEXT NOT NULL DEFAULT 'claro',
  "campos" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaginaCanchas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaginaCanchas_storeId_key" ON "PaginaCanchas"("storeId");
CREATE UNIQUE INDEX IF NOT EXISTS "PaginaCanchas_slug_key" ON "PaginaCanchas"("slug");
ALTER TABLE "PaginaCanchas" DROP CONSTRAINT IF EXISTS "PaginaCanchas_storeId_fkey";
ALTER TABLE "PaginaCanchas" ADD CONSTRAINT "PaginaCanchas_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
