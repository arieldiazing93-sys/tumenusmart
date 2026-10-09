-- Facturación electrónica (SIFEN), primera etapa: el certificado digital del contribuyente (con su clave privada CIFRADA), la
-- configuración (ambiente y código de seguridad CSC) y los documentos electrónicos firmados.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

-- El certificado (.p12) con el que se firman las facturas. La clave privada nunca queda en claro: va cifrada (AES-256-GCM).
CREATE TABLE IF NOT EXISTS "CertificadoFirma" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "sujeto" TEXT NOT NULL,
  "emisor" TEXT NOT NULL,
  "ruc" TEXT,
  "dv" TEXT,
  "validoDesde" TIMESTAMP(3) NOT NULL,
  "validoHasta" TIMESTAMP(3) NOT NULL,
  "huellaSha256" TEXT NOT NULL,
  "bitsClave" INTEGER NOT NULL,
  "usoFirmaDigital" BOOLEAN NOT NULL,
  "usoAutenticacionCliente" BOOLEAN,
  "avisos" JSONB,
  "certificadoBase64" TEXT NOT NULL,
  "cadenaPem" JSONB,
  "clavePrivadaCifrada" TEXT,
  "subidoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificadoFirma_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CertificadoFirma_storeId_activo_idx" ON "CertificadoFirma"("storeId", "activo");
ALTER TABLE "CertificadoFirma" DROP CONSTRAINT IF EXISTS "CertificadoFirma_storeId_fkey";
ALTER TABLE "CertificadoFirma" ADD CONSTRAINT "CertificadoFirma_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La configuración de la facturación electrónica del local (uno por local).
CREATE TABLE IF NOT EXISTS "ConfigFacturacionElectronica" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "ambiente" TEXT NOT NULL DEFAULT 'pruebas',
  "idCsc" TEXT,
  "cscCifrado" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfigFacturacionElectronica_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConfigFacturacionElectronica_storeId_key" ON "ConfigFacturacionElectronica"("storeId");
ALTER TABLE "ConfigFacturacionElectronica" DROP CONSTRAINT IF EXISTS "ConfigFacturacionElectronica_storeId_fkey";
ALTER TABLE "ConfigFacturacionElectronica" ADD CONSTRAINT "ConfigFacturacionElectronica_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los documentos electrónicos firmados (uno por comprobante): el XML tal como se firmó y su estado ante la DNIT.
CREATE TABLE IF NOT EXISTS "DocumentoElectronico" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "comprobanteId" TEXT NOT NULL,
  "cdc" TEXT NOT NULL,
  "ambiente" TEXT NOT NULL,
  "vistaPrevia" BOOLEAN NOT NULL DEFAULT true,
  "estado" TEXT NOT NULL DEFAULT 'firmado',
  "xmlFirmado" TEXT NOT NULL,
  "digestValue" TEXT NOT NULL,
  "urlQr" TEXT NOT NULL,
  "huellaCertificado" TEXT NOT NULL,
  "firmadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firmadoPor" TEXT NOT NULL,
  "enviadoEn" TIMESTAMP(3),
  "respuestaCodigo" TEXT,
  "respuestaMensaje" TEXT,
  "intentos" INTEGER NOT NULL DEFAULT 0,
  "proximoIntentoEn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentoElectronico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoElectronico_comprobanteId_key" ON "DocumentoElectronico"("comprobanteId");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoElectronico_cdc_key" ON "DocumentoElectronico"("cdc");
CREATE INDEX IF NOT EXISTS "DocumentoElectronico_storeId_estado_idx" ON "DocumentoElectronico"("storeId", "estado");
CREATE INDEX IF NOT EXISTS "DocumentoElectronico_storeId_createdAt_idx" ON "DocumentoElectronico"("storeId", "createdAt");
ALTER TABLE "DocumentoElectronico" DROP CONSTRAINT IF EXISTS "DocumentoElectronico_storeId_fkey";
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoElectronico" DROP CONSTRAINT IF EXISTS "DocumentoElectronico_comprobanteId_fkey";
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_comprobanteId_fkey"
  FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
