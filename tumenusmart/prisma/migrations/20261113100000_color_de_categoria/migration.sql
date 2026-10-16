-- Mi carta -> Categorías: cada categoría puede tener un color (de una paleta fija) que se ve en el punto de venta: la pastilla del grupo y las
-- tarjetas de sus productos. Sin color = se ve como siempre. Se puede correr de nuevo sin romper nada.

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "color" TEXT;
