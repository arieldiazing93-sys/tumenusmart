// El banco de pruebas: carga archivos TypeScript/TSX REALES del proyecto dentro del navegador (con Babel) para probarlos sin Node.
//
// Lo que no se puede cargar tal cual (la base de datos, next/…, la sesión) se reemplaza con "simulacros":
//
//     const S = window.Cargador.simulacros;
//     S["src/lib/auth"] = { exigirPermiso: async () => ({ nombre: "Ana", email: "a@x.com", rol: "admin" }) };   // un módulo del proyecto
//     S["next/cache"]   = { revalidatePath() {} };                                                            // un paquete externo
//     const A = await window.Cargador.cargar("src/app/admin/(protected)/stock/compras/actions");              // el módulo REAL a probar
//
// La clave de un simulacro es la ruta del proyecto SIN extensión ("@/lib/x" y "./x" se resuelven a "src/lib/x"), o el nombre del paquete.
// Si un archivo importa un paquete que no tiene simulacro, falla con un mensaje que dice cuál y desde dónde.
(function () {
  const simulacros = {};
  const modulos = new Map(); // ruta del archivo → { exports, listo }
  if (typeof window.process === "undefined") window.process = { env: {} };

  function unir(base, relativa) {
    const partes = base.split("/").slice(0, -1);
    for (const p of relativa.split("/")) {
      if (p === "." || p === "") continue;
      if (p === "..") partes.pop();
      else partes.push(p);
    }
    return partes.join("/");
  }

  /** Dice qué es un import: un simulacro, un archivo del proyecto (con su ruta sin extensión) o un paquete externo. */
  function clasificar(spec, desde) {
    let clave = null;
    if (spec.startsWith("@/")) clave = "src/" + spec.slice(2);
    else if (spec.startsWith(".")) clave = unir(desde, spec);
    if (clave === null) {
      if (spec in simulacros) return { tipo: "simulacro", clave: spec };
      return { tipo: "externo", clave: spec };
    }
    if (clave in simulacros) return { tipo: "simulacro", clave };
    return { tipo: "proyecto", clave };
  }

  async function leer(ruta) {
    const r = await fetch("/f/" + encodeURI(ruta));
    return r.ok ? await r.text() : null;
  }

  async function encontrar(clave) {
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ".js"]) {
      const texto = await leer(clave + ext);
      if (texto !== null) return { ruta: clave + ext, texto };
    }
    throw new Error("No encuentro el archivo del proyecto: " + clave);
  }

  async function cargarArchivo(clave) {
    const existente = modulos.get(clave);
    if (existente) return existente;
    const entrada = { exports: {}, listo: false };
    modulos.set(clave, entrada);

    const { ruta, texto } = await encontrar(clave);
    const salida = window.Babel.transform(texto, {
      filename: ruta,
      sourceType: "module",
      presets: [["typescript", { isTSX: ruta.endsWith(".tsx"), allExtensions: true }], ["react", { runtime: "automatic" }]],
      plugins: ["transform-modules-commonjs"],
    }).code;

    // Todo lo que este archivo importa se carga ANTES de ejecutarlo (el require de abajo es síncrono).
    const dependencias = {};
    for (const m of salida.matchAll(/require\("([^"]+)"\)/g)) {
      const spec = m[1];
      if (spec in dependencias) continue;
      const c = clasificar(spec, ruta);
      if (c.tipo === "externo") throw new Error("Paquete externo sin simulacro: " + spec + " (en " + ruta + ")");
      dependencias[spec] = c;
      if (c.tipo === "proyecto") await cargarArchivo(c.clave);
    }
    const requerir = (spec) => {
      const c = dependencias[spec];
      if (!c) throw new Error("require inesperado: " + spec + " (en " + ruta + ")");
      return c.tipo === "simulacro" ? simulacros[c.clave] : modulos.get(c.clave).exports;
    };
    new Function("require", "module", "exports", salida)(requerir, entrada, entrada.exports);
    entrada.listo = true;
    return entrada;
  }

  window.Cargador = {
    simulacros,
    /** Carga (y ejecuta) un archivo del proyecto por su ruta sin extensión y devuelve lo que exporta. */
    async cargar(clave) {
      return (await cargarArchivo(clave)).exports;
    },
    /** Vuelve a empezar: olvida los módulos ya cargados (los simulacros se quedan). */
    olvidar() {
      modulos.clear();
    },
  };
})();
