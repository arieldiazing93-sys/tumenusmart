-- Encuadre de la foto de un producto: qué parte se ve cuando la carta la recorta (0 a 100; 50 = centro). Es opcional: sin valor, la foto
-- se muestra como siempre. Se puede correr de nuevo sin romper nada.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imagenFocoX" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imagenFocoY" INTEGER;
