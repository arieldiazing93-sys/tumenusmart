#!/usr/bin/env bash
# ===========================================================================
#  Auditoría de tipos sin node_modules
# ===========================================================================
#  En este proyecto no se puede correr `npm install` para verificar antes de
#  publicar, así que `tsc` no encuentra React, Next ni Prisma y escupe miles de
#  errores que NO son bugs (JSX implícito, `process` sin tipos, etc.).
#
#  Durante un tiempo filtré solo TS1xxx (sintaxis), y eso dejó pasar un error
#  que rompió el build en Vercel: un `export ... from` que reenviaba un tipo
#  hacia afuera pero no lo traía al archivo, y después se usaba adentro.
#
#  Estos códigos SÍ son confiables aunque falte node_modules, porque hablan de
#  nombres y de archivos MÍOS, no de librerías:
#
#    TS2304 / TS2552  no existe ese nombre
#    TS2305 / TS2724  ese archivo no exporta eso
#    TS2694           ese espacio de nombres no tiene ese miembro
#    TS2307           no existe ese archivo  (solo rutas @/ ./ ../ ; las de
#                     npm se ignoran porque obviamente faltan)
#    TS2741 / TS2739  a un componente MÍO le falta una prop obligatoria
#    TS2322           le paso a un componente MÍO algo del tipo equivocado
#
#  Los dos últimos estuvieron excluidos un tiempo por ruidosos, y esa exclusión
#  dejó pasar un build roto: agregué una prop obligatoria a una tarjeta y me
#  olvidé de cuatro usos más abajo. Revisado, TODO el ruido tiene solo dos
#  formas, las dos causadas por la falta de los tipos de React:
#    · "Property 'children' is missing"  → React no sabe que children es especial
#    · un tipo que arranca con "{ key:"  → React no sabe que key es especial
#  Filtrando esas dos, lo que queda son errores de verdad.
#
#  Uso:  bash pruebas/auditoria-tipos.sh
# ===========================================================================
set -uo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$(mktemp /tmp/tsconfig.auditoria.XXXX.json)"

cat > "$CONF" << JSON
{
  "compilerOptions": {
    "noEmit": true, "skipLibCheck": true, "jsx": "preserve",
    "target": "es2020", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "esModuleInterop": true, "types": [],
    "paths": { "@/*": ["$RAIZ/src/*"] }
  },
  "include": ["$RAIZ/src/**/*.ts", "$RAIZ/src/**/*.tsx", "$RAIZ/prisma/**/*.ts"]
}
JSON

# Ojo con el fallback: `tsc` devuelve código != 0 cuando ENCUENTRA errores, así
# que un `a || b` correría los dos y duplicaría cada línea. Se elige uno solo.
if command -v tsc > /dev/null 2>&1; then TSC="tsc"; else TSC="npx --no-install tsc"; fi
SALIDA="$($TSC -p "$CONF" 2>&1)"
rm -f "$CONF"

# 1. Sintaxis rota: nunca es ruido.
SINTAXIS="$(echo "$SALIDA" | grep -E "error TS1[0-9]{3}:" || true)"
# 2. Nombres y exportaciones que no existen.
NOMBRES="$(echo "$SALIDA" | grep -E "error TS(2304|2305|2552|2694|2724):" || true)"
# 3. Archivos propios que no se encuentran (las rutas de npm se descartan).
RUTAS="$(echo "$SALIDA" | grep "error TS2307:" | grep -E "'(@/|\./|\.\./)" || true)"
# 4. Props mal pasadas a componentes propios, sin el ruido de children y key.
PROPS="$(echo "$SALIDA" | grep -E "error TS(2741|2739|2322):" \
  | grep -v "Property 'children' is missing" \
  | grep -v "Type '{ key:" || true)"
# Acá se probó agregar TS2345 (llamar a una función mía con un argumento del
# tipo equivocado) después del build que rompió por el Decimal de Prisma. NO
# QUEDÓ, y conviene saber por qué antes de volver a intentarlo:
#
#   · No agarraba ese error. Esta auditoría compila con un tsconfig propio y
#     sin los tipos que genera Prisma, así que `pedido.total` no se ve como
#     Decimal sino como `any`. Justo el dato que hacía falta comparar.
#   · Y devolvía cuatro avisos en archivos que compilan perfecto en Vercel,
#     por esa misma falta de tipos: `never`, `unknown[]`, `{}`.
#
# O sea: cero errores reales y cuatro falsos. Un auditor así se empieza a
# ignorar en una semana, y entonces tampoco sirven los que sí funcionan.
#
# Mientras no se pueda correr el chequeo de tipos de verdad (npm bloqueado),
# esta clase de error se cubre del otro lado: los módulos de src/lib que
# reciben datos de la base aceptan "algo que sabe convertirse en texto" en vez
# de adivinar la forma exacta, y las pruebas los ejercitan con un objeto que
# imita al Decimal. Ver `Monto` en src/lib/rendicion.ts.

FALLAS=0
for par in "sintaxis:$SINTAXIS" "nombres y exportaciones:$NOMBRES" "rutas propias:$RUTAS" "props de componentes:$PROPS"; do
  titulo="${par%%:*}"; cuerpo="${par#*:}"
  if [ -n "$cuerpo" ]; then
    echo "  ✗ $titulo"
    echo "$cuerpo" | sed 's/^/      /'
    FALLAS=1
  else
    echo "  ✓ $titulo"
  fi
done

if [ "$FALLAS" -eq 0 ]; then
  echo
  echo "  Auditoría de tipos limpia."
else
  echo
  echo "  HAY ERRORES QUE VAN A ROMPER EL BUILD EN VERCEL. No publicar."
fi
exit $FALLAS
