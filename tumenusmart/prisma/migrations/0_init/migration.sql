-- Migración "baseline": describe el schema tal como ya existe en la base de
-- producción (Supabase). Este archivo NO se ejecuta contra esa base — se
-- marca como ya aplicada (ver prisma/migrations/0_init/NOTAS_SUPABASE.sql).
-- Sirve para que, de acá en adelante, `prisma migrate` tenga un punto de
-- partida real y cualquier reconstrucción desde cero (un entorno nuevo)
-- pueda recrear las mismas 18 tablas.

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "whatsappNumero" TEXT NOT NULL,
    "logoUrl" TEXT,
    "direccion" TEXT,
    "mensajeSaludo" TEXT,
    "mensajeSaludoReserva" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "envioModo" TEXT NOT NULL DEFAULT 'zonas',
    "estiloCarta" TEXT NOT NULL DEFAULT 'lista',
    "pedidosPausados" BOOLEAN NOT NULL DEFAULT false,
    "mensajePausa" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "vencimiento" TIMESTAMP(3),
    "plan" TEXT NOT NULL DEFAULT 'basico',
    "contadorPedidos" INTEGER NOT NULL DEFAULT 0,
    "contadorReservas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlugAnterior" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "SlugAnterior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorReportado" (
    "id" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "storeId" TEXT,
    "nombreLocal" TEXT,
    "ruta" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "detalle" TEXT,
    "usuario" TEXT,
    "ocurrencias" INTEGER NOT NULL DEFAULT 1,
    "primeraVez" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "ultimaVez" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "avisadoEn" TIMESTAMP(3),
    "resuelto" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ErrorReportado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "cubreHasta" TIMESTAMP(3) NOT NULL,
    "meses" INTEGER NOT NULL DEFAULT 1,
    "nota" TEXT,
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaSemanal" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "semana" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "dato" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "confianza" TEXT NOT NULL,
    "detalle" TEXT,
    "vistaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "IdeaSemanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT,
    "rol" TEXT NOT NULL DEFAULT 'local',
    "storeId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "ultimoIngreso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioAtencion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "abre" TEXT NOT NULL,
    "cierra" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "HorarioAtencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(10,2) NOT NULL,
    "costo" DECIMAL(10,2),
    "imagenUrl" TEXT,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "ingredientes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mitadYMitadGrupo" TEXT,
    "mitadYMitadModo" TEXT NOT NULL DEFAULT 'mayor',
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "precioExtra" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "radioKm" DECIMAL(6,2) NOT NULL,
    "costoEnvio" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repartidor" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "Repartidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "customerId" TEXT,
    "clienteNombre" TEXT NOT NULL,
    "clienteTelefono" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "tipoEntrega" TEXT NOT NULL,
    "deliveryZoneId" TEXT,
    "repartidorId" TEXT,
    "direccion" TEXT,
    "clienteLat" DOUBLE PRECISION,
    "clienteLng" DOUBLE PRECISION,
    "metodoPagoReferencia" TEXT NOT NULL,
    "cobroMetodo" TEXT,
    "entregadoEn" TIMESTAMP(3),
    "rendicionId" TEXT,
    "comprobanteTipo" TEXT NOT NULL DEFAULT 'ticket',
    "facturaRazonSocial" TEXT,
    "facturaRuc" TEXT,
    "facturaEmail" TEXT,
    "notas" TEXT,
    "enviadoWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "costoEnvio" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "nombreProducto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "opcionesTexto" TEXT,
    "ingredientesQuitadosTexto" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioReserva" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "turno" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "capacidadPersonas" INTEGER,

    CONSTRAINT "HorarioReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "turno" TEXT NOT NULL,
    "horario" TEXT NOT NULL,
    "personas" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "clienteTelefono" TEXT NOT NULL,
    "clienteEmail" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "nota" TEXT,
    "enviadoWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rendicion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "repartidorId" TEXT NOT NULL,
    "cantidadPedidos" INTEGER NOT NULL,
    "totalEfectivo" DECIMAL(10,2) NOT NULL,
    "totalOtros" DECIMAL(10,2) NOT NULL,
    "recibidoPor" TEXT NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT "Rendicion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SlugAnterior_slug_key" ON "SlugAnterior"("slug");

-- CreateIndex
CREATE INDEX "SlugAnterior_storeId_idx" ON "SlugAnterior"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorReportado_huella_key" ON "ErrorReportado"("huella");

-- CreateIndex
CREATE INDEX "ErrorReportado_resuelto_ultimaVez_idx" ON "ErrorReportado"("resuelto", "ultimaVez");

-- CreateIndex
CREATE INDEX "ErrorReportado_storeId_idx" ON "ErrorReportado"("storeId");

-- CreateIndex
CREATE INDEX "Pago_storeId_idx" ON "Pago"("storeId");

-- CreateIndex
CREATE INDEX "Pago_storeId_fecha_idx" ON "Pago"("storeId", "fecha");

-- CreateIndex
CREATE INDEX "IdeaSemanal_storeId_idx" ON "IdeaSemanal"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaSemanal_storeId_semana_key" ON "IdeaSemanal"("storeId", "semana");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_storeId_idx" ON "Usuario"("storeId");

-- CreateIndex
CREATE INDEX "HorarioAtencion_storeId_idx" ON "HorarioAtencion"("storeId");

-- CreateIndex
CREATE INDEX "Category_storeId_idx" ON "Category"("storeId");

-- CreateIndex
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "ProductOption_storeId_idx" ON "ProductOption"("storeId");

-- CreateIndex
CREATE INDEX "ProductOption_productId_idx" ON "ProductOption"("productId");

-- CreateIndex
CREATE INDEX "DeliveryZone_storeId_idx" ON "DeliveryZone"("storeId");

-- CreateIndex
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_storeId_telefono_key" ON "Customer"("storeId", "telefono");

-- CreateIndex
CREATE INDEX "Repartidor_storeId_idx" ON "Repartidor"("storeId");

-- CreateIndex
CREATE INDEX "Order_rendicionId_idx" ON "Order"("rendicionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_numero_key" ON "Order"("storeId", "numero");

-- CreateIndex
CREATE INDEX "Order_storeId_idx" ON "Order"("storeId");

-- CreateIndex
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_storeId_idx" ON "OrderItem"("storeId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "HorarioReserva_storeId_idx" ON "HorarioReserva"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioReserva_storeId_turno_hora_key" ON "HorarioReserva"("storeId", "turno", "hora");

-- CreateIndex
CREATE INDEX "Reservation_storeId_idx" ON "Reservation"("storeId");

-- CreateIndex
CREATE INDEX "Reservation_storeId_fecha_idx" ON "Reservation"("storeId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_storeId_numero_key" ON "Reservation"("storeId", "numero");

-- CreateIndex
CREATE INDEX "Rendicion_storeId_idx" ON "Rendicion"("storeId");

-- CreateIndex
CREATE INDEX "Rendicion_repartidorId_idx" ON "Rendicion"("repartidorId");

-- AddForeignKey
ALTER TABLE "SlugAnterior" ADD CONSTRAINT "SlugAnterior_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaSemanal" ADD CONSTRAINT "IdeaSemanal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioAtencion" ADD CONSTRAINT "HorarioAtencion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repartidor" ADD CONSTRAINT "Repartidor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_rendicionId_fkey" FOREIGN KEY ("rendicionId") REFERENCES "Rendicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioReserva" ADD CONSTRAINT "HorarioReserva_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rendicion" ADD CONSTRAINT "Rendicion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rendicion" ADD CONSTRAINT "Rendicion_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
