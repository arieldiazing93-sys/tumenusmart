// Prueba de los colores de las categorías (src/lib/colores-categoria.ts): la paleta fija, las claves válidas, las transparencias y que el
// texto se lea sobre cada color (blanco sobre el color pleno de la pastilla elegida; texto oscuro sobre el fondo suave de las tarjetas).
(async () => {
  const { ok, igual } = window;
  const c = await window.Cargador.cargar("src/lib/colores-categoria");

  window.log("== Colores de categoría: la paleta");
  ok(c.COLORES_CATEGORIA.length === 12, "doce colores: " + c.COLORES_CATEGORIA.length);
  ok(new Set(c.COLORES_CATEGORIA.map((x) => x.clave)).size === 12, "las claves no se repiten");
  ok(new Set(c.COLORES_CATEGORIA.map((x) => x.hex)).size === 12, "los colores no se repiten");
  ok(c.COLORES_CATEGORIA.every((x) => /^#[0-9A-F]{6}$/.test(x.hex) && /^[a-z]+$/.test(x.clave) && x.etiqueta.length > 2), "cada uno tiene clave en minúsculas, color #RRGGBB y nombre");
  for (const x of c.COLORES_CATEGORIA) ok(c.esColorCategoria(x.clave), "«" + x.clave + "» es una clave válida");
  ok(!c.esColorCategoria("fucsia") && !c.esColorCategoria("") && !c.esColorCategoria(null) && !c.esColorCategoria(undefined) && !c.esColorCategoria("#FF0000") && !c.esColorCategoria(5), "lo que no es de la paleta se rechaza (también un hex suelto)");
  igual(c.colorDeCategoria("azul").hex, "#1D4ED8", "el azul");
  igual(c.colorDeCategoria("cafe").etiqueta, "Café", "el café");
  ok(c.colorDeCategoria(null) === null && c.colorDeCategoria(undefined) === null && c.colorDeCategoria("raro") === null, "sin color o con una clave rara: sin color (se ve como siempre)");

  window.log("== Colores de categoría: transparencias y variables");
  igual(c.conTransparencia("#1D4ED8", 0.1), "rgba(29, 78, 216, 0.1)", "el azul al 10 %");
  igual(c.conTransparencia("#DC2626", 0.45), "rgba(220, 38, 38, 0.45)", "el rojo al 45 %");
  igual(c.variablesDeColor(null), undefined, "sin color no hay variables");
  igual(c.variablesDeColor("nada"), undefined, "con una clave rara tampoco");
  const v = c.variablesDeColor("verde");
  igual(Object.keys(v), ["--cat", "--cat-10", "--cat-18", "--cat-45"], "las cuatro variables de un color");
  igual(v["--cat"], "#15803D", "--cat es el color pleno");
  igual(v["--cat-10"], "rgba(21, 128, 61, 0.1)", "--cat-10 es el fondo suave");

  window.log("== Colores de categoría: se lee el texto");
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const x of c.COLORES_CATEGORIA) {
    ok(contraste("#FFFFFF", x.hex) >= 4.5, "blanco sobre " + x.etiqueta + " (" + x.hex + "): " + contraste("#FFFFFF", x.hex).toFixed(2) + ":1");
  }
  // El fondo suave de la tarjeta (18 % del color sobre blanco, el más fuerte que se usa) con el texto de siempre (#131417).
  const mezcla = (hex, alfa) => {
    const n = parseInt(hex.slice(1), 16);
    const m = (canal) => Math.round(255 + (canal - 255) * alfa).toString(16).padStart(2, "0");
    return "#" + m((n >> 16) & 255) + m((n >> 8) & 255) + m(n & 255);
  };
  for (const x of c.COLORES_CATEGORIA) {
    ok(contraste("#131417", mezcla(x.hex, 0.18)) >= 7, "texto oscuro sobre el fondo suave de " + x.etiqueta + ": " + contraste("#131417", mezcla(x.hex, 0.18)).toFixed(1) + ":1");
  }

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
