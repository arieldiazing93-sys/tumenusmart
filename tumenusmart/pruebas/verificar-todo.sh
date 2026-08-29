#!/usr/bin/env bash
# Todo lo que se puede verificar sin node_modules. Se corre antes de entregar.
#   bash pruebas/verificar-todo.sh
set -uo pipefail
cd "$(dirname "$0")/.."
FALLAS=0

echo "── configuración de despliegue ───────────────────────"
node pruebas/auditoria-vercel-json.mjs || FALLAS=1
node pruebas/auditoria-esquema.mjs || FALLAS=1

echo
echo "── tipos ─────────────────────────────────────────────"
bash pruebas/auditoria-tipos.sh || FALLAS=1

echo
echo "── clases de color ───────────────────────────────────"
tsc tailwind.config.ts --ignoreConfig --outDir pruebas/compilado --target es2020 \
    --module esnext --moduleResolution bundler --skipLibCheck > /dev/null 2>&1
mv -f pruebas/compilado/tailwind.config.js pruebas/compilado/tailwind.config.mjs
node pruebas/auditoria-colores.mjs || FALLAS=1
node pruebas/auditoria-content.mjs || FALLAS=1

echo
echo "── permisos ─────────────────────────────────────────"
node pruebas/auditoria-permisos.mjs || FALLAS=1

echo
echo "── contraste ────────────────────────────────────────"
node pruebas/contraste-estados.mjs || FALLAS=1

echo
echo "── lógica ────────────────────────────────────────────"
for modulo in carta ordenar permisos errores; do
  tsc "src/lib/$modulo.ts" --ignoreConfig --outDir pruebas/compilado --target es2020 \
      --module esnext --moduleResolution bundler --skipLibCheck > /dev/null 2>&1
  mv -f "pruebas/compilado/$modulo.js" "pruebas/compilado/$modulo.mjs"
done

# url-publica importa alcance-local: mismo caso que whatsapp/format.
tsc src/lib/url-publica.ts src/lib/alcance-local.ts --ignoreConfig --outDir pruebas/compilado \
    --target es2020 --module esnext --moduleResolution bundler --skipLibCheck > /dev/null 2>&1
for f in url-publica alcance-local; do mv -f "pruebas/compilado/$f.js" "pruebas/compilado/$f.mjs"; done
sed -i 's|from "./alcance-local"|from "./alcance-local.mjs"|' pruebas/compilado/url-publica.mjs

# whatsapp importa format, así que se compilan juntos y se corrige la extensión
# del import: Node necesita la ruta completa, TypeScript la escribe sin ella.
tsc src/lib/whatsapp.ts src/lib/format.ts --ignoreConfig --outDir pruebas/compilado \
    --target es2020 --module esnext --moduleResolution bundler --skipLibCheck > /dev/null 2>&1
for f in whatsapp format; do mv -f "pruebas/compilado/$f.js" "pruebas/compilado/$f.mjs"; done
sed -i 's|from "./format"|from "./format.mjs"|' pruebas/compilado/whatsapp.mjs
for prueba in carta ordenar permisos errores whatsapp analista suscripcion filtro-por-local url-publica; do
  printf "  %-18s " "$prueba"
  node "pruebas/$prueba.mjs" > /tmp/salida.txt 2>&1 && echo "✓ $(grep -oE '[0-9]+ (pruebas pasaron|bien)' /tmp/salida.txt | head -1)" \
    || { echo "✗ FALLÓ"; cat /tmp/salida.txt | tail -5; FALLAS=1; }
done

echo
echo "── navegador (Chromium real) ─────────────────────────"
for prueba in foco-al-mover fixed-dentro-del-panel banda-de-categoria aviso-sonoro; do
  printf "  %-24s " "$prueba"
  node "pruebas/$prueba.mjs" > /tmp/salida.txt 2>&1 \
    && echo "✓ $(grep -oE '[0-9]+/[0-9]+' /tmp/salida.txt | tail -1) $(grep -oE '[0-9]+ comprobaciones' /tmp/salida.txt | head -1)" \
    || { echo "✗ FALLÓ"; tail -6 /tmp/salida.txt; FALLAS=1; }
done

echo
[ "$FALLAS" -eq 0 ] && echo "  TODO EN VERDE." || echo "  HAY FALLAS. No entregar."
exit $FALLAS
