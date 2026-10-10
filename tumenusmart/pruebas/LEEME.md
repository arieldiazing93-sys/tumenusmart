# Pruebas

## filtro-por-local.mjs

Verifica que el filtro por local haga lo que promete: que ninguna consulta
pueda leer, modificar ni crear datos de otro negocio, incluso si el código
lo pide explícitamente.

Es la prueba más importante del proyecto multi-local. Conviene correrla
cada vez que se toque `src/lib/alcance-local.ts`.

Para correrla hace falta compilar primero el archivo a JavaScript, porque
Node no lee TypeScript directo:

```bash
npx tsc src/lib/alcance-local.ts --target es2020 --module esnext --outDir /tmp/p
node --input-type=module -e "$(sed 's|../src/lib/alcance-local.ts|/tmp/p/alcance-local.js|' pruebas/filtro-por-local.mjs)"
```

Sale con código 0 si pasa todo y 1 si algo falla, así que también sirve
para frenar un despliegue automático si alguna vez se configura.

## verificar-sintaxis.ps1

Revisa la sintaxis de todo `src/` (`.ts` y `.tsx`) **sin necesitar Node**: usa
el analizador de Babel dentro de Microsoft Edge sin ventana. Encuentra lo que
rompe un deploy en Vercel y no se ve a ojo: un `const` repetido, una llave de
más, una etiqueta JSX sin cerrar. No revisa tipos (eso lo hace `next build`).

```powershell
powershell -ExecutionPolicy Bypass -File pruebas\verificar-sintaxis.ps1
```

Necesita Edge (viene con Windows) e internet. Conviene correrla antes de cada
push que toque varios archivos.

## verificar-tipos.ps1

Revisa los **tipos** de todo `src/` sin Node: baja TypeScript a Edge y compila
el proyecto contra un Prisma "de mentira" armado desde `prisma/schema.prisma`.
El build de Vercel frena en el primer error de tipos y muestra uno solo; esto
los muestra todos juntos, antes de publicar. Detecta campos de Prisma mal
escritos o con el tipo equivocado, campos obligatorios que faltan al crear y
pasar el cliente de `prismaDelLocal()` a una función que pide el `PrismaClient`
común (o la transacción). No ve el resultado exacto de un `select`/`include` ni
los tipos de Next y de Node.

```powershell
powershell -ExecutionPolicy Bypass -File pruebas\verificar-tipos.ps1
```

Solo avisa lo NUEVO: los avisos que no son reales (el Prisma de mentira no
conoce `_count`, etc.) están en `pruebas/tipos/base.json`. Si se confirma otro
falso aviso, `-ActualizarBase`.
