-- Canchas: un solo campo de precio. La «tarifa de noche» ya no se carga en la ficha: todo lo que cambia según el día o la hora va en
-- «Precios de promoción» (los mismos de los productos). Para que NINGÚN precio cambie, cada cancha que tenía tarifa de noche pasa a tener,
-- en su producto del punto de venta, una promoción por día (de lunes a domingo) desde la hora en que regía la noche hasta las 23:59:59, al
-- precio de noche; y se le quita la tarifa de noche vieja.
--
-- Solo se convierte una cancha que ya tiene su producto y que todavía no tiene promociones cargadas (si ya tenía, se deja como está: la
-- tarifa vieja se sigue cobrando y la ficha avisa para pasarla a mano). Se puede correr de nuevo sin romper nada: lo ya convertido no
-- tiene más tarifa de noche, así que no vuelve a tocarse.

WITH convertibles AS (
  SELECT c."id" AS "canchaId", c."storeId", c."productId", c."nocheDesde", c."precioNocturnoHora"
  FROM "Cancha" c
  WHERE c."precioNocturnoHora" IS NOT NULL
    AND c."precioNocturnoHora" > 0
    AND c."productId" IS NOT NULL
    AND c."nocheDesde" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND NOT EXISTS (SELECT 1 FROM "PrecioPromocion" p WHERE p."productId" = c."productId")
),
insertadas AS (
  INSERT INTO "PrecioPromocion" ("id", "storeId", "productId", "diaInicio", "horaInicio", "diaFin", "horaFin", "precio", "createdAt", "updatedAt")
  SELECT
    md5(random()::text || clock_timestamp()::text || cv."canchaId" || d.dia::text),
    cv."storeId",
    cv."productId",
    d.dia,
    cv."nocheDesde" || ':00',
    d.dia,
    '23:59:59',
    cv."precioNocturnoHora",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM convertibles cv
  CROSS JOIN generate_series(0, 6) AS d(dia)
  RETURNING "productId"
)
UPDATE "Cancha"
SET "precioNocturnoHora" = NULL
WHERE "productId" IN (SELECT DISTINCT "productId" FROM insertadas);
