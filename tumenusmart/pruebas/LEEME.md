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
