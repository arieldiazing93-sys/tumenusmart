// Reglas para cambiar la dirección pública de un local.
//
// Lo que más importa acá no es que "la-esquina-del-fabri" salga bien —
// eso sale bien solo. Son los casos raros: volver a un nombre que el local ya
// tuvo, o intentar quedarse con la dirección vieja de OTRO negocio, que le
// robaría los clientes que escanean sus carteles impresos.
import { decidirCambioDeUrl } from "./compilado/url-publica.mjs";

let bien = 0, mal = 0;
const base = { pedido: "", actual: "donmario", ocupadaPorOtro: false, fueDeOtro: false };

function caso(titulo, situacion, esperado) {
  const r = decidirCambioDeUrl({ ...base, ...situacion });
  const ok =
    esperado.ok === false
      ? r.ok === false && (!esperado.contiene || r.error.includes(esperado.contiene))
      : r.ok === true && r.slug === esperado.slug &&
        (esperado.cambia === undefined || r.cambia === esperado.cambia);
  if (ok) { bien++; }
  else { mal++; console.log(`  ✗ ${titulo}\n      dio: ${JSON.stringify(r)}`); }
}

// ---- lo normal
caso("nombre con mayúsculas y espacios", { pedido: "La Esquina del Fabri" },
     { ok: true, slug: "la-esquina-del-fabri", cambia: true });
caso("con acentos", { pedido: "Café Módena" }, { ok: true, slug: "cafe-modena" });
caso("con signos raros", { pedido: "Pizza!! & Pasta" }, { ok: true, slug: "pizza-pasta" });
caso("guiones sobrantes en las puntas", { pedido: "  --burger--  " },
     { ok: true, slug: "burger" });

// ---- lo que hay que frenar
caso("vacío", { pedido: "   " }, { ok: false, contiene: "Escribí" });
caso("una sola letra", { pedido: "a" }, { ok: false, contiene: "corta" });
caso("solo signos: no queda nada", { pedido: "!!!" }, { ok: false, contiene: "corta" });
caso("palabra del sistema", { pedido: "admin" }, { ok: false, contiene: "sistema" });
caso("palabra del sistema con mayúsculas", { pedido: "API" }, { ok: false, contiene: "sistema" });
caso("ya la usa otro local", { pedido: "pizzeria", ocupadaPorOtro: true },
     { ok: false, contiene: "Ya hay un local" });
caso("fue de otro local: no se le roban los carteles",
     { pedido: "viejonombre", fueDeOtro: true }, { ok: false, contiene: "otro local" });

// ---- el caso que se olvida
caso("guardar la misma que ya tenía: válido pero no cambia nada",
     { pedido: "donmario" }, { ok: true, slug: "donmario", cambia: false });
caso("la misma escrita distinto tampoco cambia",
     { pedido: "Don Mario" }, { ok: true, slug: "don-mario", cambia: true });
caso("volver a una dirección propia de antes SÍ se permite",
     { pedido: "elfabri", fueDeOtro: false }, { ok: true, slug: "elfabri", cambia: true });

// ---- el orden de las reglas importa
// "admin" ocupada por otro tiene que dar el error de palabra reservada, no el
// de ocupada: si no, se filtraría que existe un local llamado así.
caso("reservada gana sobre ocupada", { pedido: "admin", ocupadaPorOtro: true },
     { ok: false, contiene: "sistema" });

console.log(mal === 0 ? `  ✓ ${bien} pruebas pasaron` : `  ✗ ${mal} fallaron de ${bien + mal}`);
process.exit(mal === 0 ? 0 : 1);
