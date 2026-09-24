-- ===========================================================================
--  PARTE 1 — Estructura: las tablas del Comprobante y de sus líneas
-- ===========================================================================

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ventaPosId" TEXT,
    "orderId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'factura',
    "modalidad" TEXT NOT NULL DEFAULT 'autoimpresor',
    "tipoEmision" TEXT NOT NULL DEFAULT 'normal',
    "puntoExpedicionId" TEXT,
    "timbrado" TEXT NOT NULL,
    "timbradoDesde" TIMESTAMP(3),
    "timbradoHasta" TIMESTAMP(3) NOT NULL,
    "establecimiento" TEXT NOT NULL,
    "punto" TEXT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipoTransaccion" TEXT NOT NULL DEFAULT 'venta_mercaderia',
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "emisorRuc" TEXT NOT NULL,
    "emisorRazonSocial" TEXT NOT NULL,
    "receptorTipoIdentificacion" TEXT NOT NULL,
    "receptorNumeroIdentificacion" TEXT NOT NULL,
    "receptorRazonSocial" TEXT,
    "receptorEmail" TEXT,
    "presencia" TEXT NOT NULL DEFAULT 'presencial',
    "condicion" TEXT NOT NULL DEFAULT 'contado',
    "fechaVencimientoCredito" TIMESTAMP(3),
    "gravado10" DECIMAL(18,2) NOT NULL,
    "gravado5" DECIMAL(18,2) NOT NULL,
    "exento" DECIMAL(18,2) NOT NULL,
    "iva10" DECIMAL(18,2) NOT NULL,
    "iva5" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'vigente',
    "anuladoPor" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "motivoAnulacion" TEXT,
    "reemplazaAId" TEXT,
    "emitidoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id"),
    -- Todo comprobante sale de una cuenta: exactamente una de las dos.
    CONSTRAINT "Comprobante_origen_check" CHECK (("ventaPosId" IS NOT NULL)::int + ("orderId" IS NOT NULL)::int = 1)
);

-- CreateTable
CREATE TABLE "ComprobanteItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "codigo" TEXT,
    "descripcion" TEXT NOT NULL,
    "unidadMedida" TEXT NOT NULL DEFAULT 'unidad',
    "cantidad" DECIMAL(18,8) NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "iva" TEXT NOT NULL,

    CONSTRAINT "ComprobanteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_reemplazaAId_key" ON "Comprobante"("reemplazaAId");
CREATE INDEX "Comprobante_storeId_fechaEmision_idx" ON "Comprobante"("storeId", "fechaEmision");
CREATE INDEX "Comprobante_storeId_numero_idx" ON "Comprobante"("storeId", "numero");
CREATE INDEX "Comprobante_ventaPosId_idx" ON "Comprobante"("ventaPosId");
CREATE INDEX "Comprobante_orderId_idx" ON "Comprobante"("orderId");
CREATE INDEX "ComprobanteItem_storeId_idx" ON "ComprobanteItem"("storeId");
CREATE INDEX "ComprobanteItem_comprobanteId_idx" ON "ComprobanteItem"("comprobanteId");

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_ventaPosId_fkey" FOREIGN KEY ("ventaPosId") REFERENCES "VentaPos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_puntoExpedicionId_fkey" FOREIGN KEY ("puntoExpedicionId") REFERENCES "PuntoExpedicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_reemplazaAId_fkey" FOREIGN KEY ("reemplazaAId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComprobanteItem" ADD CONSTRAINT "ComprobanteItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComprobanteItem" ADD CONSTRAINT "ComprobanteItem_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
--  PARTE 2 — Relleno: las facturas que ya existían (todas de prueba) pasan a
--  la tabla nueva, para que no queden afuera cuando los reportes lean de ahí.
--  Se puede correr aparte de la parte 1, y más de una vez sin duplicar nada.
-- ===========================================================================

-- Facturas de ventas del mostrador (la que rige hoy, vigente o anulada).
INSERT INTO "Comprobante" (
    "id", "storeId", "ventaPosId", "orderId", "tipo", "modalidad", "tipoEmision", "puntoExpedicionId",
    "timbrado", "timbradoDesde", "timbradoHasta", "establecimiento", "punto", "correlativo", "numero", "fechaEmision",
    "tipoTransaccion", "moneda", "emisorRuc", "emisorRazonSocial",
    "receptorTipoIdentificacion", "receptorNumeroIdentificacion", "receptorRazonSocial", "receptorEmail",
    "presencia", "condicion", "fechaVencimientoCredito",
    "gravado10", "gravado5", "exento", "iva10", "iva5", "descuento", "total",
    "estado", "anuladoPor", "anuladoEn", "motivoAnulacion", "emitidoPor", "createdAt"
)
SELECT
    'cmp_v_' || v."id", v."storeId", v."id", NULL, 'factura', 'autoimpresor', 'normal', NULL,
    COALESCE(v."facturaTimbrado", ''), NULL, COALESCE(v."facturaVencimiento", v."creadoEn"),
    COALESCE(NULLIF(split_part(v."facturaNumero", '-', 1), ''), '001'),
    COALESCE(NULLIF(split_part(v."facturaNumero", '-', 2), ''), '001'),
    COALESCE(NULLIF(split_part(v."facturaNumero", '-', 3), '')::int, 0),
    v."facturaNumero", v."creadoEn",
    'venta_mercaderia', 'PYG', COALESCE(v."facturaRucEmisor", ''), COALESCE(v."facturaRazonSocialEmisor", ''),
    COALESCE(v."facturaTipoIdentificacion", 'ruc'), COALESCE(v."facturaRuc", ''), v."facturaRazonSocial", NULL,
    'presencial', CASE WHEN v."formaPago" = 'a_credito' THEN 'credito' ELSE 'contado' END, v."fechaVencimientoCredito",
    COALESCE(v."facturaGravado10", 0), COALESCE(v."facturaGravado5", 0), COALESCE(v."facturaExento", 0),
    COALESCE(v."facturaIva10", 0), COALESCE(v."facturaIva5", 0), v."descuento", v."total",
    CASE WHEN v."facturaAnulada" THEN 'anulado' ELSE 'vigente' END,
    v."facturaAnuladaPor", v."facturaAnuladaEn", v."facturaMotivoAnulacion", v."registradoPor", v."creadoEn"
FROM "VentaPos" v
WHERE v."facturaNumero" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Comprobante" c WHERE c."id" = 'cmp_v_' || v."id");

-- Facturas de pedidos online.
INSERT INTO "Comprobante" (
    "id", "storeId", "ventaPosId", "orderId", "tipo", "modalidad", "tipoEmision", "puntoExpedicionId",
    "timbrado", "timbradoDesde", "timbradoHasta", "establecimiento", "punto", "correlativo", "numero", "fechaEmision",
    "tipoTransaccion", "moneda", "emisorRuc", "emisorRazonSocial",
    "receptorTipoIdentificacion", "receptorNumeroIdentificacion", "receptorRazonSocial", "receptorEmail",
    "presencia", "condicion", "fechaVencimientoCredito",
    "gravado10", "gravado5", "exento", "iva10", "iva5", "descuento", "total",
    "estado", "anuladoPor", "anuladoEn", "motivoAnulacion", "emitidoPor", "createdAt"
)
SELECT
    'cmp_o_' || o."id", o."storeId", NULL, o."id", 'factura', 'autoimpresor', 'normal', NULL,
    COALESCE(o."facturaTimbrado", ''), NULL, COALESCE(o."facturaVencimiento", o."createdAt"),
    COALESCE(NULLIF(split_part(o."facturaNumero", '-', 1), ''), '001'),
    COALESCE(NULLIF(split_part(o."facturaNumero", '-', 2), ''), '001'),
    COALESCE(NULLIF(split_part(o."facturaNumero", '-', 3), '')::int, 0),
    o."facturaNumero", o."createdAt",
    'venta_mercaderia', 'PYG', COALESCE(o."facturaRucEmisor", ''), COALESCE(o."facturaRazonSocialEmisor", ''),
    COALESCE(o."facturaTipoIdentificacion", 'ruc'), COALESCE(o."facturaRuc", ''), o."facturaRazonSocial", o."facturaEmail",
    CASE WHEN o."tipoEntrega" = 'delivery' THEN 'domicilio' ELSE 'presencial' END, 'contado', NULL,
    COALESCE(o."facturaGravado10", 0), COALESCE(o."facturaGravado5", 0), COALESCE(o."facturaExento", 0),
    COALESCE(o."facturaIva10", 0), COALESCE(o."facturaIva5", 0), 0, o."total",
    CASE WHEN o."facturaAnulada" THEN 'anulado' ELSE 'vigente' END,
    o."facturaAnuladaPor", o."facturaAnuladaEn", o."facturaMotivoAnulacion", 'sistema', o."createdAt"
FROM "Order" o
WHERE o."facturaNumero" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Comprobante" c WHERE c."id" = 'cmp_o_' || o."id");

-- Facturas que ya fueron reemplazadas por una remisión: quedan como anuladas,
-- con los datos que tenían y los montos de la cuenta (que no cambiaron).
INSERT INTO "Comprobante" (
    "id", "storeId", "ventaPosId", "orderId", "tipo", "modalidad", "tipoEmision", "puntoExpedicionId",
    "timbrado", "timbradoDesde", "timbradoHasta", "establecimiento", "punto", "correlativo", "numero", "fechaEmision",
    "tipoTransaccion", "moneda", "emisorRuc", "emisorRazonSocial",
    "receptorTipoIdentificacion", "receptorNumeroIdentificacion", "receptorRazonSocial", "receptorEmail",
    "presencia", "condicion", "fechaVencimientoCredito",
    "gravado10", "gravado5", "exento", "iva10", "iva5", "descuento", "total",
    "estado", "anuladoPor", "anuladoEn", "motivoAnulacion", "emitidoPor", "createdAt"
)
SELECT
    'cmp_r_' || fr."id", fr."storeId", fr."ventaId", fr."orderId", 'factura', 'autoimpresor', 'normal', NULL,
    COALESCE(fr."facturaTimbrado", ''), NULL, COALESCE(fr."facturaVencimiento", fr."anuladaEn"),
    COALESCE(NULLIF(split_part(fr."facturaNumero", '-', 1), ''), '001'),
    COALESCE(NULLIF(split_part(fr."facturaNumero", '-', 2), ''), '001'),
    COALESCE(NULLIF(split_part(fr."facturaNumero", '-', 3), '')::int, 0),
    fr."facturaNumero", cur."fechaEmision",
    cur."tipoTransaccion", 'PYG', cur."emisorRuc", cur."emisorRazonSocial",
    COALESCE(fr."facturaTipoIdentificacion", 'ruc'), COALESCE(fr."facturaRuc", ''), fr."facturaRazonSocial", NULL,
    cur."presencia", cur."condicion", cur."fechaVencimientoCredito",
    cur."gravado10", cur."gravado5", cur."exento", cur."iva10", cur."iva5", cur."descuento", cur."total",
    'anulado', fr."anuladaPor", fr."anuladaEn", fr."motivoAnulacion", cur."emitidoPor", cur."createdAt"
FROM "FacturaReemplazada" fr
JOIN "Comprobante" cur
  ON cur."id" = CASE WHEN fr."ventaId" IS NOT NULL THEN 'cmp_v_' || fr."ventaId" ELSE 'cmp_o_' || fr."orderId" END
WHERE NOT EXISTS (SELECT 1 FROM "Comprobante" c WHERE c."id" = 'cmp_r_' || fr."id");

-- Cada factura nueva apunta a la que reemplazó (por el número que la reemplazó).
UPDATE "Comprobante" nuevo
SET "reemplazaAId" = 'cmp_r_' || fr."id"
FROM "FacturaReemplazada" fr
WHERE nuevo."storeId" = fr."storeId"
  AND nuevo."numero" = fr."facturaNuevaNumero"
  AND (nuevo."ventaPosId" = fr."ventaId" OR nuevo."orderId" = fr."orderId")
  AND nuevo."reemplazaAId" IS NULL;

-- Las líneas de las ventas del mostrador. El descuento general se reparte en
-- proporción a lo que vale cada línea.
INSERT INTO "ComprobanteItem" (
    "id", "storeId", "comprobanteId", "orden", "codigo", "descripcion", "unidadMedida",
    "cantidad", "precioUnitario", "descuento", "total", "iva"
)
SELECT
    'ci_' || l."cid" || '_' || l."iid", l."storeId", l."cid", (l."rn" - 1)::int, l."codigo", l."descripcion", l."unidad",
    l."cantidad", l."precio", l."dto", l."linea" - l."dto", l."iva"
FROM (
    SELECT
        c."id" AS "cid", c."storeId" AS "storeId", i."id" AS "iid", i."productId" AS "codigo",
        CASE WHEN COALESCE(i."opcionesTexto", '') <> ''
             THEN i."nombreProducto" || ' (' || i."opcionesTexto" || ')'
             ELSE i."nombreProducto" END AS "descripcion",
        COALESCE(p."unidadMedida", 'unidad') AS "unidad",
        i."cantidad" AS "cantidad", i."precioUnitario" AS "precio", i."iva" AS "iva",
        (i."cantidad" * i."precioUnitario") AS "linea",
        COALESCE(
            ROUND(c."descuento" * (i."cantidad" * i."precioUnitario")
                  / NULLIF(SUM(i."cantidad" * i."precioUnitario") OVER (PARTITION BY c."id"), 0), 2),
            0
        ) AS "dto",
        ROW_NUMBER() OVER (PARTITION BY c."id" ORDER BY i."id") AS "rn"
    FROM "Comprobante" c
    JOIN "VentaPosItem" i ON i."ventaPosId" = c."ventaPosId"
    LEFT JOIN "Product" p ON p."id" = i."productId"
    WHERE NOT EXISTS (SELECT 1 FROM "ComprobanteItem" x WHERE x."comprobanteId" = c."id")
) l;

-- Las líneas de los pedidos online.
INSERT INTO "ComprobanteItem" (
    "id", "storeId", "comprobanteId", "orden", "codigo", "descripcion", "unidadMedida",
    "cantidad", "precioUnitario", "descuento", "total", "iva"
)
SELECT
    'ci_' || l."cid" || '_' || l."iid", l."storeId", l."cid", (l."rn" - 1)::int, l."codigo", l."descripcion", l."unidad",
    l."cantidad", l."precio", 0, l."linea", l."iva"
FROM (
    SELECT
        c."id" AS "cid", c."storeId" AS "storeId", i."id" AS "iid", i."productId" AS "codigo",
        CASE WHEN COALESCE(i."opcionesTexto", '') <> ''
             THEN i."nombreProducto" || ' (' || i."opcionesTexto" || ')'
             ELSE i."nombreProducto" END AS "descripcion",
        COALESCE(p."unidadMedida", 'unidad') AS "unidad",
        i."cantidad" AS "cantidad", i."precioUnitario" AS "precio", i."iva" AS "iva",
        (i."cantidad" * i."precioUnitario") AS "linea",
        ROW_NUMBER() OVER (PARTITION BY c."id" ORDER BY i."id") AS "rn"
    FROM "Comprobante" c
    JOIN "OrderItem" i ON i."orderId" = c."orderId"
    LEFT JOIN "Product" p ON p."id" = i."productId"
    WHERE NOT EXISTS (SELECT 1 FROM "ComprobanteItem" x WHERE x."comprobanteId" = c."id")
) l;

-- El costo de envío de los pedidos con delivery, como una línea más (gravada al 10%).
INSERT INTO "ComprobanteItem" (
    "id", "storeId", "comprobanteId", "orden", "codigo", "descripcion", "unidadMedida",
    "cantidad", "precioUnitario", "descuento", "total", "iva"
)
SELECT
    'ci_' || c."id" || '_envio', c."storeId", c."id", 999, NULL, 'Costo de envío', 'unidad',
    1, o."costoEnvio", 0, o."costoEnvio", 'gravado10'
FROM "Comprobante" c
JOIN "Order" o ON o."id" = c."orderId"
WHERE o."costoEnvio" > 0
  AND NOT EXISTS (SELECT 1 FROM "ComprobanteItem" x WHERE x."id" = 'ci_' || c."id" || '_envio');
