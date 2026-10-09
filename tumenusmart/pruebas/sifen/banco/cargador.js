// Cargador de módulos del proyecto para el navegador: baja el .ts/.tsx real desde /f/src/..., lo compila con Babel
// (TypeScript + JSX) y resuelve sus imports. Lo que no se quiere probar en serio (acciones del servidor, el router de
// Next) se reemplaza con simulacros pasados en `simulacros`.
window.Cargador = (function () {
  const cache = {};
  const simulacros = {};

  function normalizar(ruta) {
    const partes = [];
    for (const p of ruta.split("/")) {
      if (p === "" || p === ".") continue;
      if (p === "..") partes.pop();
      else partes.push(p);
    }
    return partes.join("/");
  }

  function resolver(desde, especificador) {
    if (especificador.startsWith("@/")) return "src/" + especificador.slice(2);
    if (especificador.startsWith(".")) {
      const carpeta = desde.split("/").slice(0, -1).join("/");
      return normalizar(carpeta + "/" + especificador);
    }
    return null; // paquete externo
  }

  async function traer(ruta) {
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      const r = await fetch("/f/" + encodeURI(ruta + ext));
      if (r.ok) return { texto: await r.text(), archivo: ruta + ext };
    }
    throw new Error("No encontré el módulo " + ruta);
  }

  async function cargar(ruta) {
    if (simulacros[ruta]) return simulacros[ruta];
    if (cache[ruta]) return cache[ruta].exports;
    const { texto, archivo } = await traer(ruta);
    const { code } = Babel.transform(texto, {
      presets: [["typescript", { allExtensions: true, isTSX: archivo.endsWith(".tsx") }], ["react", { runtime: "automatic" }]],
      plugins: ["transform-modules-commonjs"],
      filename: archivo,
    });
    const modulo = { exports: {} };
    cache[ruta] = modulo;
    const pedidos = [...new Set([...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))];
    const cargados = {};
    for (const p of pedidos) {
      if (simulacros[p]) { cargados[p] = simulacros[p]; continue; }
      const destino = resolver(archivo, p);
      if (destino === null) throw new Error("Paquete externo sin simulacro: " + p + " (en " + archivo + ")");
      cargados[p] = await cargar(destino);
    }
    const req = (p) => { if (p in cargados) return cargados[p]; throw new Error("require inesperado: " + p); };
    new Function("exports", "require", "module", code)(modulo.exports, req, modulo);
    return modulo.exports;
  }

  return { cargar, simulacros };
})();
