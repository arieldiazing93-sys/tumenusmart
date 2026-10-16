/**
 * El pitido corto del lector: uno agudo cuando el producto se sumó, uno grave y doble cuando el código no se reconoce. Es lo que te dice, sin
 * mirar la pantalla, que el escaneo entró. Solo suena en el navegador, y si no se puede (sin sonido, bloqueado) no pasa nada.
 */
type TipoDePitido = "ok" | "error";

let contexto: AudioContext | null = null;

function tono(ctx: AudioContext, frecuencia: number, desde: number, duracion: number) {
  const oscilador = ctx.createOscillator();
  const volumen = ctx.createGain();
  oscilador.type = "square";
  oscilador.frequency.value = frecuencia;
  // Sube y baja rápido para que no suene un "clic" feo al empezar y al terminar.
  volumen.gain.setValueAtTime(0.0001, ctx.currentTime + desde);
  volumen.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + desde + 0.01);
  volumen.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + desde + duracion);
  oscilador.connect(volumen);
  volumen.connect(ctx.destination);
  oscilador.start(ctx.currentTime + desde);
  oscilador.stop(ctx.currentTime + desde + duracion + 0.02);
}

/** El motor de audio del navegador, creado una sola vez (crearlo tarda: conviene hacerlo antes del primer escaneo, no durante). */
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  contexto = contexto ?? new Constructor();
  return contexto;
}

/** Deja listo el sonido (sin hacer ruido). Se llama al abrir la pantalla para que el primer pitido no demore el primer producto. */
export function prepararPitido(): void {
  try {
    audio();
  } catch {
    // Sin sonido: no pasa nada.
  }
}

export function pitar(tipo: TipoDePitido): void {
  // Después de que la pantalla ya se actualizó: el sonido nunca demora lo que se ve.
  setTimeout(() => {
    try {
      const ctx = audio();
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume();
      if (tipo === "ok") {
        tono(ctx, 1500, 0, 0.07);
      } else {
        tono(ctx, 240, 0, 0.14);
        tono(ctx, 240, 0.2, 0.14);
      }
    } catch {
      // Sin sonido: el aviso en pantalla alcanza.
    }
  }, 0);
}
