// Una base de datos en memoria con la forma mínima de Prisma (findFirst, findMany, findUnique, create, update, updateMany, count),
// para probar la emisión y el envío de las facturas electrónicas sin base real. Una sola para todas las pruebas: los módulos del
// sistema se cargan una vez y quedan atados a este mismo objeto, así que cada prueba la reinicia y la llena a su gusto.
//
//   BaseFalsa.db         el cliente (sirve como `prisma`, como `prismaDelLocal(...)` y como la `tx` de una transacción)
//   BaseFalsa.reiniciar() vacía todas las tablas
//   BaseFalsa.tablas      { documentoElectronico: [...], comprobante: [...], … }
//
// Los filtros entienden: igualdad, null, { in }, { lte }, { gt }, { not }, OR y AND. Lo demás se ignora (select, include, take sí).
(function () {
  const tablas = {};
  let contadorId = 0;
  // Los valores por defecto que la base real pone sola (los `@default` del esquema), para las tablas que las pruebas crean.
  const defectos = {
    eventoElectronico: { estado: "pendiente", intentos: 0, enviadoEn: null, procesadoEn: null, proximoIntentoEn: null, errorEnvio: null },
    documentoElectronico: { estado: "firmado", vistaPrevia: true, intentos: 0, enviadoEn: null, procesadoEn: null, proximoIntentoEn: null, errorEnvio: null },
  };

  function coincide(fila, donde) {
    if (!donde) return true;
    for (const [clave, v] of Object.entries(donde)) {
      if (clave === "OR") { if (!v.some((c) => coincide(fila, c))) return false; continue; }
      if (clave === "AND") { if (!v.every((c) => coincide(fila, c))) return false; continue; }
      const x = fila[clave];
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v && !v.in.includes(x)) return false;
        if ("lte" in v && !(x != null && x <= v.lte)) return false;
        if ("gt" in v && !(x != null && x > v.gt)) return false;
        if ("not" in v && x === v.not) return false;
      } else if (v === null) {
        if (x !== null && x !== undefined) return false;
      } else if (x !== v) return false;
    }
    return true;
  }

  const copia = (f) => (f ? { ...f } : f);
  const tabla = (nombre) => (tablas[nombre] = tablas[nombre] || []);

  function aplicarDatos(fila, data) {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && !(v instanceof Date) && "increment" in v) fila[k] = (fila[k] || 0) + v.increment;
      else fila[k] = v;
    }
  }

  function delegado(nombre) {
    const filtrar = (args) => {
      let filas = tabla(nombre).filter((f) => coincide(f, args && args.where));
      const orden = args && args.orderBy;
      if (orden) {
        const [campo, sentido] = Object.entries(Array.isArray(orden) ? orden[0] : orden)[0];
        filas = [...filas].sort((a, b) => (a[campo] > b[campo] ? 1 : a[campo] < b[campo] ? -1 : 0) * (sentido === "desc" ? -1 : 1));
      }
      if (args && args.take) filas = filas.slice(0, args.take);
      return filas;
    };
    return {
      findMany: async (args) => filtrar(args).map(copia),
      findFirst: async (args) => copia(filtrar(args)[0] ?? null),
      findUnique: async (args) => copia(filtrar(args)[0] ?? null),
      count: async (args) => filtrar(args).length,
      create: async ({ data }) => { const fila = { id: "id-" + ++contadorId, ...(defectos[nombre] || {}), ...data }; tabla(nombre).push(fila); return copia(fila); },
      update: async ({ where, data }) => { const fila = filtrar({ where })[0]; if (!fila) throw new Error("No existe la fila de " + nombre); aplicarDatos(fila, data); return copia(fila); },
      updateMany: async ({ where, data }) => { const filas = filtrar({ where }); filas.forEach((f) => aplicarDatos(f, data)); return { count: filas.length }; },
    };
  }

  const db = new Proxy({}, { get: (_, nombre) => (typeof nombre === "string" ? delegado(nombre) : undefined) });
  // Conecta esta base como `prisma` y `prismaDelLocal` de los módulos del sistema. Se MODIFICAN los objetos ya registrados (en vez de
  // reemplazarlos) porque un módulo ya cargado se quedó con el objeto de antes; `delLocal(storeId)` puede aplicar el filtro por local.
  function instalar(simulacros, delLocal) {
    const p = (simulacros["src/lib/prisma"] = simulacros["src/lib/prisma"] || {});
    p.prisma = db;
    const l = (simulacros["src/lib/prisma-local"] = simulacros["src/lib/prisma-local"] || {});
    l.prismaDelLocal = delLocal || (() => db);
    simulacros["@prisma/client"] = simulacros["@prisma/client"] || {};
  }
  window.BaseFalsa = { db, tablas, instalar, reiniciar: () => { for (const k of Object.keys(tablas)) delete tablas[k]; contadorId = 0; } };
})();
