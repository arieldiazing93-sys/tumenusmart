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
 * Imprime texto crudo (ESC/POS, ver src/lib/escpos.ts) en la impresora
 * indicada. Reemplaza al enfoque anterior (HTML renderizado como imagen vía
 * el driver gráfico de Windows) — probado en impresora térmica real: ese
 * camino salía borroso, con espaciado impredecible y sin corte de papel
 * confiable, y dependía de la calidad del driver gráfico de cada modelo.
 * Texto crudo es el estándar de facto que casi todas las impresoras
 * térmicas soportan igual — así imprimen la mayoría de los sistemas de
 * punto de venta comerciales.
 *
 * La impresora indicada tiene que estar configurada como "raw" en Windows
 * (driver Generic / Text Only, mismo puerto que la impresora real) — ver
 * /admin/pos/estaciones. `flavor: 'plain'` no aplica acá (es para HTML/PDF);
 * un string simple en el array de datos ya se interpreta como
 * `{type: 'raw', format: 'command', flavor: 'plain'}`.
 */
export function imprimirTexto(nombreImpresora: string, texto: string): Promise<void> {
  // Una impresión por vez en toda la pantalla: mandar varios trabajos juntos a la misma impresora física los mezcla en su
  // buffer y salen líneas superpuestas. Pasa de verdad cuando la impresión automática de comandas (que corre en segundo
  // plano) y el ticket de un cobro coinciden en la misma impresora. Cada trabajo espera a que termine el anterior; que uno
  // falle no frena a los que siguen (el error le llega solo a quien lo pidió).
  const tarea = colaDeImpresion.then(() => imprimirConLimite(nombreImpresora, texto));
  colaDeImpresion = tarea.catch(() => {});
  return tarea;
}

/** Cuánto se espera a que una impresora acepte un trabajo antes de darlo por fallado. */
const LIMITE_IMPRESION_MS = 25_000;

/**
 * Manda el trabajo a la impresora, pero no espera para siempre: una impresora en pausa, apagada o que abre una ventana
 * pidiendo dónde guardar un archivo (las impresoras "PDF" lo hacen) dejaría el trabajo colgado, y como las impresiones van de
 * a una, también a todas las que vienen detrás. Pasado el límite se da por fallado y sigue lo que viene.
 */
async function imprimirConLimite(nombreImpresora: string, texto: string): Promise<void> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(
      () =>
        rechazar(
          new Error(
            "La impresora no respondió en 25 segundos. Revisá que no esté en pausa ni pidiendo guardar un archivo (las impresoras PDF lo piden)."
          )
        ),
      LIMITE_IMPRESION_MS
    );
  });
  const enviar = (async () => {
    await conectarQz();
    const qz = await cargarQz();
    const config = qz.configs.create(nombreImpresora);
    await qz.print(config, [texto]);
  })();
  // Si el límite gana, el envío sigue por su cuenta: su error (si lo hay) ya no le importa a nadie y no debe quedar sin atender.
  enviar.catch(() => {});
  try {
    await Promise.race([enviar, limite]);
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}

/** El último trabajo de impresión pedido: el siguiente se encadena a él. */
let colaDeImpresion: Promise<void> = Promise.resolve();
