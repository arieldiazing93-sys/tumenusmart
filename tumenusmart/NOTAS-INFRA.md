# Notas de infraestructura

Cosas que no se pueden explicar dentro de su propio archivo, porque ese
archivo es JSON y JSON no admite comentarios.

## Por qué `regions: ["gru1"]` en `vercel.json`

`gru1` es São Paulo (`sa-east-1`), **exactamente la misma región de AWS donde
está la base en Supabase** (`aws-0-sa-east-1`).

Por defecto Vercel corre las funciones en Washington (`iad1`). Nadie eligió
eso: es el valor por defecto para proyectos nuevos. Con la base en São Paulo,
cada consulta cruzaba el continente y volvía — unos 120 ms por consulta.

Y no es una consulta por pantalla. La de Pedidos hace 8 seguidas para un
superadmin (4 solo para dibujar el marco del panel), y como la conexión va con
`connection_limit=1`, Prisma no puede correr dos a la vez: hacen fila. Eso solo
era cerca de un segundo en cada clic, antes de sumar el arranque en frío.

En la misma región el viaje pasa a milisegundos.

El plan Hobby permite elegir UNA región; Pro permite hasta cinco.

## Ojo con `vercel.json`

Vercel lo valida contra un esquema estricto y **rechaza cualquier clave que no
conozca**. El truco de poner una clave `"//"` para dejar un comentario —que sí
funciona en `package.json`— acá rompe el build con:

    should NOT have additional property `//`

Por eso esta explicación vive en este archivo y no ahí adentro.
La verificación `pruebas/auditoria-vercel-json.mjs` chequea esto antes de
publicar.

## Pendientes de rendimiento, en orden de impacto

1. **Medido primero.** En Vercel → Logs cada request muestra su duración.
   Comparar antes y después del cambio de región antes de tocar otra cosa.
2. Sacar `ideaDeLaSemana()` del layout: corre en CADA navegación solo para
   pintar un punto al lado de "Ideas".
3. Revisar `connection_limit=1` en la URL de conexión. Está así para no agotar
   el pooler, pero serializa todas las consultas de una misma request.
4. Plan Pro de Vercel y Supabase: eso resuelve arranques en frío y copias de
   seguridad, no la latencia de red.
