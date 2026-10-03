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
4. Planes de pago: Vercel Pro y Supabase Pro, ya contratados (confirmado
   2026-10-03). El proyecto está en producción y el dominio se maneja en
   Cloudflare. Los planes resuelven arranques en frío y copias de seguridad,
   no la latencia de red.
5. Falta `package-lock.json` en git. Sin él, cada deploy instala la última
   versión permitida de cada dependencia (por ejemplo `next ^15.0.0`), así que
   dos deploys del mismo código pueden construirse distinto. Hay que generarlo
   con `npm install` en una máquina con Node y subirlo.

## El build frena si una tabla queda sin aislamiento

`package.json` corre `node pruebas/auditoria-aislamiento.mjs` antes de
`prisma generate && next build`. Compara las tablas del esquema que tienen
`storeId` contra `MODELOS_POR_LOCAL` (`src/lib/alcance-local.ts`). Si una tabla
nueva no está anotada, el deploy FALLA con un mensaje que nombra la tabla, y la
versión que ya está en producción sigue funcionando sin cambios.

- Tabla nueva con `storeId`: agregarla a `MODELOS_POR_LOCAL`.
- Tabla con `storeId` que a propósito no se filtra por local (hoy: `Usuario`,
  `ErrorReportado`, `SlugAnterior`): agregarla a `EXCEPCIONES` en el propio
  script, con el motivo escrito.

Si Vercel tiene un "Build Command" propio en Settings, ese manda sobre
`package.json` y esta prueba no corre: dejarlo vacío (o igual al de arriba).
En el log del deploy tiene que aparecer "aislamiento entre locales: N tablas
protegidas".
