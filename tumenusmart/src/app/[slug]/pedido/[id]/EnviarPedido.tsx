"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BotonWhatsappCTA } from "@/components/BotonWhatsappCTA";
import { Aviso } from "@/components/ui";
import { enlaceConDatosDeFactura, leerDatosFacturaCliente } from "@/lib/factura-cliente-sesion";
import { MINUTOS_PARA_ENVIAR_PEDIDO, textoTiempo } from "@/lib/pedido-vencimiento";
import { marcarEnviadoWhatsapp } from "./actions";

/**
 * El paso final del pedido: mandarlo por WhatsApp. Mientras el cliente no toca el botón, el local no se entera, así que la
 * pantalla lo llama: el botón salta tres veces cada tanto y arriba hay un aviso con una cuenta regresiva (la misma de las
 * reservas de turnos). Si el tiempo se acaba sin que lo toque, el pedido se cancela solo (el servidor lo borra y devuelve el
 * stock) y esta pantalla lo dice y manda a armar el pedido de nuevo, para que nadie crea que pidió algo que el local nunca vio.
 *
 * `venceEnSegundos` es null cuando no hay nada que contar (ya lo envió, o una persona del local ya lo tomó).
 */
export function EnviarPedido({
  slug,
  orderId,
  nombreLocal,
  link,
  yaEnviado,
  venceEnSegundos,
  conAviso,
}: {
  slug: string;
  orderId: string;
  nombreLocal: string;
  link: string;
  yaEnviado: boolean;
  venceEnSegundos: number | null;
  /** false en un pedido cancelado: ahí no hay ningún paso que cumplir (el botón queda, sin avisos ni saltos). */
  conAviso: boolean;
}) {
  const [enviado, setEnviado] = useState(yaEnviado);
  // Cuándo vence, medido con el reloj de este teléfono a partir de que apareció la pantalla.
  const [limite] = useState(() => (venceEnSegundos == null ? null : Date.now() + venceEnSegundos * 1000));
  const [ahora, setAhora] = useState(() => Date.now());
  // El servidor dijo que ya venció (se acabó justo al tocar el botón).
  const [rechazado, setRechazado] = useState(false);

  // Si el cliente pidió factura, sus datos (razón social, RUC, correo) los tiene solo este navegador: no se guardan en el pedido.
  // Se agregan al mensaje acá, justo debajo de "Comprobante: Factura".
  const [enlace, setEnlace] = useState(link);
  useEffect(() => {
    const datos = leerDatosFacturaCliente(orderId);
    setEnlace(datos ? enlaceConDatosDeFactura(link, datos) : link);
  }, [orderId, link]);

  const restante = limite == null ? null : Math.max(0, Math.ceil((limite - ahora) / 1000));
  const vencido = !enviado && (rechazado || restante === 0);
  const contando = !enviado && !vencido && limite != null;

  // Solo corre el reloj mientras hay una cuenta regresiva a la vista.
  useEffect(() => {
    if (!contando) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [contando]);

  if (vencido) return <PedidoVencido slug={slug} nombreLocal={nombreLocal} />;

  return (
    <>
      {conAviso && !enviado && (
        <div className="mb-6">
          <Aviso titulo="Falta un paso" color="aviso">
            Enviá el pedido por WhatsApp para que {nombreLocal} lo reciba y lo confirme.
            {contando && restante != null && (
              <>
                {" "}
                Tenés <span className="cifra font-bold">{textoTiempo(restante)}</span> para hacerlo: si no, el pedido se cancela y
                hay que armarlo de nuevo.
              </>
            )}
          </Aviso>
        </div>
      )}

      <div className="mb-8 flex justify-center">
        <BotonWhatsappCTA
          link={enlace}
          yaEnviado={yaEnviado}
          // El botón salta mientras el pedido espera el envío; deja de saltar apenas se lo toca.
          llamar={conAviso && !yaEnviado}
          onEnviar={() => {
            setEnviado(true);
            marcarEnviadoWhatsapp(slug, orderId)
              .then((r) => {
                if (!r.ok && r.vencido) {
                  setEnviado(false);
                  setRechazado(true);
                }
              })
              .catch(() => {
                // Sin conexión con el servidor: el cliente igual llega a WhatsApp y el local tiene el mensaje.
              });
          }}
        />
      </div>
    </>
  );
}

/**
 * La pantalla de "se venció el tiempo": tapa toda la página (el pedido ya no existe) y ofrece empezar de nuevo desde la carta.
 * El carrito se vació al enviar el pedido, así que se arma desde cero.
 */
export function PedidoVencido({ slug, nombreLocal }: { slug: string; nombreLocal: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-papel px-5 py-10">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-aviso/40 bg-aviso-luz text-aviso"
        >
          <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>

        <h2 className="mt-4 text-[1.3rem] font-semibold tracking-titular text-tinta">Se venció el tiempo</h2>
        <p className="mt-1.5 text-[0.92rem] leading-snug text-tinta-media">
          No mandaste el pedido por WhatsApp dentro de los {MINUTOS_PARA_ENVIAR_PEDIDO} minutos, así que se canceló y{" "}
          {nombreLocal} no lo recibió. Si todavía lo querés, armalo de nuevo y mandalo enseguida.
        </p>

        <Link
          href={`/${slug}`}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[0.95rem] font-semibold text-white transition-colors hover:bg-brand-dark active:scale-[0.99]"
        >
          Hacer el pedido de nuevo
        </Link>
      </div>
    </div>
  );
}
