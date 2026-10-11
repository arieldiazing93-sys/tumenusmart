// Prueba de punta a punta del encuadre de la foto de un producto: el formulario manda imagenFocoX/imagenFocoY, la acción del servidor
// (productos/actions.ts) los guarda acotados y, SIN foto, los borra. La carta pública (Carta.tsx) se prueba con el banco de React.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  const BF = window.BaseFalsa;
  const T = () => BF.tablas;

  window.process = window.process || { env: {} };
  window.process.env = window.process.env || {};
  window.process.env.SUPABASE_URL = "https://proy.supabase.co";
  window.process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  S["node:crypto"] = { randomBytes: () => ({ toString: () => "00" }) };
  S["@supabase/supabase-js"] = { createClient: () => ({ storage: { from: () => ({ remove: async () => ({ error: null }), list: async () => ({ data: [], error: null }) }) } }) };
  S["next/cache"] = { revalidatePath() {} };
  S["next/navigation"] = { redirect(destino) { const e = new Error("NEXT_REDIRECT"); e.destino = destino; throw e; } };
  S["src/lib/auth"] = { exigirPermiso: async () => ({ nombre: "Ana", email: "ana@local.com", rol: "empleado" }) };
  S["src/lib/local-actual"] = { idLocalActual: async () => "local-1" };
  BF.reiniciar();
  BF.instalar(S);

  const acciones = await C.cargar("src/app/admin/(protected)/productos/actions");
  const url = "https://proy.supabase.co/storage/v1/object/public/productos/1-foto.jpg";
  const formulario = (extra = {}) => {
    const f = new FormData();
    const base = { nombre: "Milanesitas", categoryId: "c1", precio: "60000", descripcion: "Deliciosas", imagenUrl: url, iva: "gravado10", unidadMedida: "unidad", disponible: "on", ...extra };
    for (const [k, v] of Object.entries(base)) if (v !== null) f.set(k, v);
    return f;
  };
  const guardar = async (extra) => {
    try { await acciones.actualizarProducto("p1", formulario(extra)); } catch (e) { if (e.message !== "NEXT_REDIRECT") throw e; }
    return T().product[0];
  };
  const sembrar = () => {
    BF.reiniciar();
    T().category = [{ id: "c1", storeId: "local-1", nombre: "Hamburguesas" }];
    T().product = [{ id: "p1", storeId: "local-1", nombre: "Milanesitas", categoryId: "c1", precio: 60000, iva: "gravado10", disponible: true, imagenUrl: url, imagenFocoX: null, imagenFocoY: null }];
  };

  window.log("== Encuadre de la foto: el formulario llega a la base");
  sembrar();
  let p = await guardar({ imagenFocoX: "50", imagenFocoY: "32" });
  ok(p.imagenFocoX === 50 && p.imagenFocoY === 32 && p.imagenUrl === url, "el encuadre que manda el formulario se guarda (" + JSON.stringify([p.imagenFocoX, p.imagenFocoY]) + ")");
  p = await guardar({ imagenFocoX: "480", imagenFocoY: "-9", imagenZoom: "9000" });
  ok(p.imagenFocoX === 100 && p.imagenFocoY === 0 && p.imagenZoom === 300, "un valor fuera de rango se acota (0–100 el encuadre, 100–300 el acercamiento)");
  p = await guardar({ imagenFocoX: "40", imagenFocoY: "" });
  ok(p.imagenFocoX === null && p.imagenFocoY === null, "con un solo valor no se guarda nada");
  p = await guardar({ imagenFocoX: "", imagenFocoY: "", imagenZoom: "100" });
  ok(p.imagenFocoX === null && p.imagenFocoY === null && p.imagenZoom === null, "sin tocar nada queda sin encuadre (la carta la muestra como siempre)");
  p = await guardar({ imagenFocoX: "20", imagenFocoY: "80" });
  p = await guardar({ imagenUrl: "", imagenFocoX: "20", imagenFocoY: "80", imagenZoom: "200" });
  ok(p.imagenUrl === null && p.imagenFocoX === null && p.imagenFocoY === null && p.imagenZoom === null, "si se quita la foto, el encuadre se borra con ella");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
