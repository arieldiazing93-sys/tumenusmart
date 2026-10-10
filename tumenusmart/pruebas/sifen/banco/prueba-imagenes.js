// Prueba de las imágenes que dejan de usarse: qué rutas del almacenamiento se pueden borrar (src/lib/supabase-storage.ts), el borrado
// inmediato al cambiar o quitar una foto (src/lib/imagenes.ts: nunca borra lo que otra fila todavía usa ni lo que no es nuestro) y la
// limpieza diaria de las sueltas (src/lib/limpiar-imagenes-huerfanas.ts), con un almacenamiento y una base simulados.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  const BF = window.BaseFalsa;

  window.process = window.process || { env: {} };
  window.process.env = window.process.env || {};
  window.process.env.SUPABASE_URL = "https://proy.supabase.co";
  window.process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  S["node:crypto"] = { randomBytes: () => ({ toString: () => "00" }) };
  S["crypto"] = S["node:crypto"];

  // ------------------------------------------------------------------------------------------ el almacenamiento simulado
  const DIA = 86400000;
  const bucket = []; // { ruta, creado: Date | null }
  const borrados = [];
  let falloBorrar = false;
  const almacen = {
    remove: async (rutas) => {
      if (falloBorrar) return { error: { message: "almacenamiento caído" } };
      for (const r of rutas) {
        const i = bucket.findIndex((o) => o.ruta === r);
        if (i >= 0) bucket.splice(i, 1);
        borrados.push(r);
      }
      return { error: null };
    },
    list: async (carpeta, { limit, offset }) => {
      const prefijo = carpeta ? carpeta + "/" : "";
      const archivos = bucket
        .filter((o) => o.ruta.startsWith(prefijo) && !o.ruta.slice(prefijo.length).includes("/") && (carpeta ? true : !o.ruta.includes("/")))
        .map((o) => ({ name: o.ruta.slice(prefijo.length), id: "id-" + o.ruta, created_at: o.creado ? o.creado.toISOString() : null }));
      // En la raíz también aparecen las carpetas, como entradas sin id.
      const carpetas = carpeta ? [] : ["logos", "portadas", "personal", "reservas", "clientes", "asistencia", "raro"].map((n) => ({ name: n, id: null }));
      return { data: [...carpetas, ...archivos].slice(offset, offset + limit), error: null };
    },
  };
  S["@supabase/supabase-js"] = { createClient: () => ({ storage: { from: () => almacen } }) };

  const ORIGEN = "https://proy.supabase.co";
  const url = (ruta) => `${ORIGEN}/storage/v1/object/public/productos/${ruta}`;
  const subir = (ruta, diasAtras = 0) => bucket.push({ ruta, creado: new Date(Date.now() - diasAtras * DIA) });
  const reponer = () => {
    BF.reiniciar();
    bucket.length = 0;
    borrados.length = 0;
    falloBorrar = false;
  };
  BF.reiniciar();
  BF.instalar(S);
  const T = () => BF.tablas;

  // ------------------------------------------------------------------------------------------------------- qué se puede borrar
  const st = await C.cargar("src/lib/supabase-storage");
  window.log("== Imágenes: qué rutas se pueden borrar");
  for (const r of ["1696000000000-abc123.jpg", "logos/1696-abc.png", "portadas/1-a.webp", "personal/1-a.jpeg", "reservas/1-a.jpg", "clientes/1-a.jpg", "asistencia/1-a.jpg"]) {
    ok(st.esRutaDeImagenDescartable(r), `se puede borrar: ${r}`);
  }
  for (const r of ["", "../secreto.jpg", "logos/../x.jpg", "otra/1-a.jpg", "a/b/c.jpg", "/1-a.jpg", "foto.svg", "foto.gif", "logos/", "archivo.pdf", "con espacio.jpg"]) {
    ok(!st.esRutaDeImagenDescartable(r), `NO se borra: «${r}»`);
  }
  igual(st.rutaDeImagenPropia(url("logos/1-a.jpg"), ORIGEN), "logos/1-a.jpg", "la ruta de una imagen nuestra en una carpeta");
  igual(st.rutaDeImagenPropia(url("1-a.jpg") + "?t=123", ORIGEN), "1-a.jpg", "la de la raíz (productos), sin lo que viene después del «?»");
  igual(st.rutaDeImagenPropia("https://otro.supabase.co/storage/v1/object/public/productos/1-a.jpg", ORIGEN), null, "de otro proyecto de almacenamiento: no es nuestra");
  igual(st.rutaDeImagenPropia(`${ORIGEN}/storage/v1/object/public/otrobucket/1-a.jpg`, ORIGEN), null, "de otro bucket: no es nuestra");
  igual(st.rutaDeImagenPropia(`${ORIGEN.replace("https", "http")}/storage/v1/object/public/productos/1-a.jpg`, ORIGEN), null, "sin https: no");
  igual(st.rutaDeImagenPropia("https://ejemplo.com/foto.jpg", ORIGEN), null, "una foto de cualquier sitio: nunca se toca");
  igual(st.rutaDeImagenPropia(url("carpeta-rara/1-a.jpg"), ORIGEN), null, "de una carpeta que este sistema no usa: no");
  window.process.env.SUPABASE_URL = "";
  igual(st.rutaDeImagenPropia(url("logos/1-a.jpg")), null, "si no está configurado el almacenamiento, no borra nada");
  window.process.env.SUPABASE_URL = ORIGEN;
  igual(st.rutaDeImagenPropia(url("logos/1-a.jpg")), "logos/1-a.jpg", "y configurado (por la variable de entorno), la reconoce sin más datos");
  igual(st.rutaDeImagenPropia("esto no es una dirección", ORIGEN), null, "texto que no es una dirección");
  ok(!(st.rutaDeImagenPropia(url("logos/%2e%2e/x.jpg"), ORIGEN) ?? "").includes(".."), "un «..» disfrazado nunca sale como ruta");
  igual(st.rutaEnUsoDeUrl("https://otro-servidor.com/storage/v1/object/public/productos/logos/1-a.jpg?x=1"), "logos/1-a.jpg", "para saber qué está en uso se es generoso: se toma la ruta aunque el servidor sea otro");

  // ------------------------------------------------------------------------------------------------------ el borrado inmediato
  window.log("== Imágenes: al cambiar o quitar una foto, la anterior se borra (si nadie más la usa)");
  const imagenes = await C.cargar("src/lib/imagenes");
  reponer();
  subir("logos/1-vieja.jpg", 2);
  subir("logos/1-nueva.jpg");
  T().store = [{ id: "s1", logoUrl: url("logos/1-nueva.jpg"), portadaUrl: null }];
  let n = await imagenes.descartarImagenes([url("logos/1-vieja.jpg")]);
  ok(n === 1 && !bucket.some((o) => o.ruta === "logos/1-vieja.jpg") && bucket.some((o) => o.ruta === "logos/1-nueva.jpg"), "el logo anterior se borra y el nuevo queda");
  igual(borrados, ["logos/1-vieja.jpg"], "y se borró solo ese archivo");

  reponer();
  subir("1-producto.jpg", 3);
  T().product = [{ id: "p1", imagenUrl: url("1-producto.jpg") }];
  n = await imagenes.descartarImagenes([url("1-producto.jpg")]);
  ok(n === 0 && bucket.length === 1, "si otro producto usa la misma foto (un duplicado), no se borra");

  const enUso = [
    ["personal/1-p.jpg", "miembroPersonal", { fotoUrl: url("personal/1-p.jpg") }],
    ["clientes/1-c.jpg", "customer", { fotoUrl: url("clientes/1-c.jpg") }],
    ["asistencia/1-s.jpg", "colaborador", { fotoUrl: url("asistencia/1-s.jpg") }],
    ["asistencia/1-m.jpg", "marcacionAsistencia", { fotoUrl: url("asistencia/1-m.jpg") }],
    ["portadas/1-p.jpg", "store", { id: "s1", portadaUrl: url("portadas/1-p.jpg"), logoUrl: null }],
    ["reservas/1-f.jpg", "paginaReservas", { storeId: "s1", fotoUrl: url("reservas/1-f.jpg"), bannerUrl: null, galeria: [] }],
    ["reservas/1-b.jpg", "paginaReservas", { storeId: "s1", fotoUrl: null, bannerUrl: url("reservas/1-b.jpg"), galeria: [] }],
    ["reservas/1-g.jpg", "paginaReservas", { storeId: "s1", fotoUrl: null, bannerUrl: null, galeria: [{ url: url("reservas/1-g.jpg"), descripcion: "" }] }],
  ];
  for (const [ruta, tabla, fila] of enUso) {
    reponer();
    subir(ruta, 3);
    T()[tabla] = [fila];
    n = await imagenes.descartarImagenes([url(ruta)]);
    ok(n === 0 && bucket.length === 1, `en uso en ${tabla}: no se borra (${ruta})`);
  }

  reponer();
  subir("1-sola.jpg", 3);
  n = await imagenes.descartarImagenes([url("1-sola.jpg"), url("1-sola.jpg"), null, undefined, "", "https://ejemplo.com/otra.jpg"]);
  ok(n === 1 && borrados.length === 1 && bucket.length === 0, "repetidas, vacías y de afuera: se borra una sola vez lo que corresponde y no falla nada");

  reponer();
  subir("1-sola.jpg", 3);
  falloBorrar = true;
  n = await imagenes.descartarImagenes([url("1-sola.jpg")]);
  ok(n === 0 && bucket.length === 1, "si el almacenamiento falla, no lanza error (el cambio del usuario ya estaba guardado)");

  igual(imagenes.urlsQueSeFueron(["a", "b", null, "c"], ["b", "d", null]), ["a", "c"], "las que estaban y ya no están");
  igual(imagenes.urlsDeGaleria([{ url: "x", descripcion: "" }, { url: 3 }, null, "texto", { url: "y" }]), ["x", "y"], "las de la galería, ignorando lo que no sirve");
  igual(imagenes.urlsDeGaleria(null), [], "y sin galería, nada");

  // ------------------------------------------------------------------------------------------------------ la limpieza diaria
  window.log("== Imágenes: la limpieza diaria de las que quedaron sueltas");
  const limp = await C.cargar("src/lib/limpiar-imagenes-huerfanas");
  const armar = () => {
    reponer();
    subir("1-prod-en-uso.jpg", 30);
    subir("1-prod-suelto-viejo.jpg", 30);
    subir("1-prod-suelto-reciente.jpg", 1);
    subir("logos/1-logo-viejo.jpg", 20);
    subir("logos/1-logo-actual.jpg", 20);
    subir("reservas/1-galeria-uso.jpg", 40);
    subir("clientes/1-corte-suelto.jpg", 10);
    subir("asistencia/1-marcacion-en-uso.jpg", 3);
    subir("asistencia/1-selfie-suelta.jpg", 15);
    subir("raro/1-no-mio.jpg", 90); // una carpeta que este sistema no usa: ni se mira
    bucket.push({ ruta: "1-sin-fecha.jpg", creado: null });
    T().product = [{ imagenUrl: url("1-prod-en-uso.jpg") }];
    T().store = [{ id: "s1", logoUrl: url("logos/1-logo-actual.jpg"), portadaUrl: null }];
    T().paginaReservas = [{ storeId: "s1", fotoUrl: null, bannerUrl: null, galeria: [{ url: url("reservas/1-galeria-uso.jpg"), descripcion: "" }] }];
    T().marcacionAsistencia = [{ fotoUrl: url("asistencia/1-marcacion-en-uso.jpg") }];
  };
  const ahora = new Date();

  armar();
  let r = await limp.limpiarImagenesHuerfanas(ahora, 10000, { simular: true });
  ok(r.simulacion && r.borradas === 0 && bucket.length === 11 && borrados.length === 0, "en simulación no se borra nada");
  ok(r.sueltas === 4 && r.enUso === 4 && r.enAlmacenamiento === 10, `ve 4 sueltas, 4 en uso y 10 archivos en las carpetas conocidas (${JSON.stringify(r)})`);
  igual(r.ejemplos.slice().sort(), ["1-prod-suelto-viejo.jpg", "asistencia/1-selfie-suelta.jpg", "clientes/1-corte-suelto.jpg", "logos/1-logo-viejo.jpg"], "y dice cuáles");

  r = await limp.limpiarImagenesHuerfanas(ahora, 10000);
  ok(r.borradas === 4 && !r.quedanPendientes && r.abortada === null, "de verdad: borra las 4 sueltas y viejas");
  igual(borrados.slice().sort(), ["1-prod-suelto-viejo.jpg", "asistencia/1-selfie-suelta.jpg", "clientes/1-corte-suelto.jpg", "logos/1-logo-viejo.jpg"], "justamente esas");
  const quedan = bucket.map((o) => o.ruta).sort();
  ok(
    ["1-prod-en-uso.jpg", "logos/1-logo-actual.jpg", "reservas/1-galeria-uso.jpg", "asistencia/1-marcacion-en-uso.jpg", "1-prod-suelto-reciente.jpg", "raro/1-no-mio.jpg", "1-sin-fecha.jpg"].every((x) => quedan.includes(x)),
    "se conserva lo que se usa, lo subido hace menos de una semana, lo de carpetas ajenas y lo que no trae fecha"
  );
  r = await limp.limpiarImagenesHuerfanas(ahora, 10000);
  ok(r.borradas === 0 && r.sueltas === 0, "repetirla no borra nada más");

  armar();
  T().product = [];
  T().store = [];
  T().paginaReservas = [];
  T().marcacionAsistencia = [];
  r = await limp.limpiarImagenesHuerfanas(ahora, 10000);
  ok(r.abortada !== null && r.borradas === 0 && borrados.length === 0, "si la base no devuelve ninguna imagen en uso, no borra nada (puede ser un error, no que todo esté suelto)");

  armar();
  r = await limp.limpiarImagenesHuerfanas(ahora, 10000, { maximo: 2 });
  ok(r.borradas === 2 && r.quedanPendientes && borrados.length === 2, "tiene un tope por corrida: lo que falta sigue mañana");

  armar();
  T().product = [{ imagenUrl: "https://otro-servidor.com/storage/v1/object/public/productos/1-prod-suelto-viejo.jpg" }, ...T().product];
  r = await limp.limpiarImagenesHuerfanas(ahora, 10000, { simular: true });
  ok(r.sueltas === 3, "una dirección guardada con otro servidor pero el mismo archivo cuenta como en uso (se prefiere conservar de más)");

  armar();
  falloBorrar = true;
  let fallo = false;
  try { await limp.limpiarImagenesHuerfanas(ahora, 10000); } catch { fallo = true; }
  ok(fallo, "si el almacenamiento falla, la limpieza lo informa (no se calla)");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
