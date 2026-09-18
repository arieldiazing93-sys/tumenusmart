"use client";

// `qz-tray` es una librería pensada solo para el navegador (websocket,
// firma, impresoras). Un `import` normal la carga también durante el
// render en el servidor (así funciona un Client Component en Next.js: se
// renderiza una vez en el servidor para el HTML inicial, y otra vez en el
// navegador al hidratar) — ahí se comporta distinto y el HTML del servidor
// no coincide con el del cliente, lo que rompe la hidratación de TODA la
// página (React error #418) apenas algo importa este módulo. Por eso se
// carga con `import()` dinámico, recién cuando de verdad hace falta
// conectar o imprimir — nunca durante un render.
type Qz = typeof import("qz-tray")["default"];

let qzPromise: Promise<Qz> | null = null;
function cargarQz(): Promise<Qz> {
  if (!qzPromise) qzPromise = import("qz-tray").then((m) => m.default);
  return qzPromise;
}

let configurado = false;
let conexionEnCurso: Promise<void> | null = null;

function configurarFirma(qz: Qz) {
  if (configurado) return;
  configurado = true;
  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setCertificatePromise((resolve, reject) => {
    fetch("/api/qz/certificado", { credentials: "include" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("No se pudo obtener el certificado"))))
      .then(resolve)
      .catch(reject);
  });
  qz.security.setSignaturePromise((aFirmar) => (resolve, reject) => {
    fetch("/api/qz/firmar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: aFirmar }),
    })
      .then((r) => r.json())
      .then((d) => (d.firma ? resolve(d.firma) : reject(new Error(d.error ?? "Firma inválida"))))
      .catch(reject);
  });
}

/**
 * Conecta si todavía no hay conexión activa; reutiliza la que ya está
 * abierta (no reconecta en cada ticket) y coalesce llamadas simultáneas en
 * una sola promesa en vuelo. Rechaza si QZ Tray no está corriendo en esta
 * computadora — ese rechazo es la señal que usan los puntos de disparo
 * para caer al fallback manual.
 */
export async function conectarQz(): Promise<void> {
  const qz = await cargarQz();
  configurarFirma(qz);
  if (qz.websocket.isActive()) return;
  if (conexionEnCurso) return conexionEnCurso;
  conexionEnCurso = qz.websocket.connect({ retries: 2, delay: 1 }).finally(() => {
    conexionEnCurso = null;
  });
  return conexionEnCurso;
}

export async function listarImpresoras(): Promise<string[]> {
  await conectarQz();
  const qz = await cargarQz();
  return qz.printers.find();
}

/**
 * Imprime un HTML ya renderizado en la impresora indicada. `flavor: 'plain'`
 * es intencional: con `flavor: 'file'` QZ Tray (proceso Java aparte, sin la
 * cookie de sesión del navegador) bajaría la URL él mismo y una pantalla
 * protegida por sesión le devolvería el login en vez del comprobante.
 */
export async function imprimirHtml(nombreImpresora: string, html: string, anchoMm: number): Promise<void> {
  await conectarQz();
  const qz = await cargarQz();
  const config = qz.configs.create(nombreImpresora, {
    units: "mm",
    // Probado en impresora térmica real, dos veces: con una altura fija de
    // 297mm sobraba papel en blanco después del contenido; con 3276mm
    // (el valor "rollo continuo" que se recomienda para otros drivers)
    // sobraba TODAVÍA MÁS — este driver no recorta solo, imprime el alto
    // que se le pida. Sin `size.height` (solo ancho), QZ Tray mide el
    // contenido real y arma la página a esa altura.
    size: { width: anchoMm },
    scaleContent: false,
    rasterize: false,
    // Sin esto, QZ Tray renderiza el HTML a 72 DPI (la resolución típica de
    // pantalla) y después lo estira para cubrir el ancho físico del papel
    // — probado en una impresora térmica real: sale borroso, con
    // interlineado exagerado y muy poco texto por línea. 203 DPI es la
    // densidad estándar de las impresoras térmicas de recibos (8
    // puntos/mm) — con esto renderiza a la resolución real del papel en
    // vez de escalar una imagen de baja resolución.
    density: 203,
  });
  await qz.print(config, [{ type: "pixel", format: "html", flavor: "plain", data: html }]);
}

/**
 * Corta el papel — comando ESC/POS crudo (GS V 0, corte completo), mandado
 * como un trabajo aparte DESPUÉS del HTML. Probado en impresora térmica
 * real: el driver de Windows tiene una opción "Cut paper per job", pero no
 * corta de verdad para los trabajos que manda QZ Tray — otros programas de
 * punto de venta (ej. SoftRestaurant) SÍ cortan en la misma impresora
 * porque mandan el comando de corte directo, sin depender del driver.
 * `forceRaw` no está soportado en Windows (según la propia librería), así
 * que esto pasa igual por el driver — pero al ser un trabajo de impresión
 * aparte y posterior, el driver lo procesa después de haber terminado con
 * el HTML.
 */
export async function cortarPapel(nombreImpresora: string): Promise<void> {
  await conectarQz();
  const qz = await cargarQz();
  const config = qz.configs.create(nombreImpresora);
  await qz.print(config, [{ type: "raw", format: "command", flavor: "plain", data: "\x1D\x56\x00" }]);
}
