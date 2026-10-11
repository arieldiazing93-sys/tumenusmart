-- Cuánto se acerca la foto de un producto en la carta (100 = entera, 300 = el triple). Es opcional: sin valor, la foto se muestra
-- como siempre. Junto con el encuadre (imagenFocoX / imagenFocoY) deja subir o bajar la foto aunque entre justa en su marco.
-- Se puede correr de nuevo sin romper nada.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imagenZoom" INTEGER;
