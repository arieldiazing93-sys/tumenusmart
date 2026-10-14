"use client";

import { useEffect, useRef, useState } from "react";
// Hoja de estilos propia de Leaflet: sin esto el mapa se ve descuadrado o cortado.
import "leaflet/dist/leaflet.css";
import { IconoWhatsapp } from "@/components/iconos";
import { enlaceComoLlegar, enlaceParaCompartirPorWhatsapp } from "@/lib/ubicacion-maps";

/** Lo poco de Leaflet que se usa, tipado a mano (así este componente no depende de los tipos de la librería). */
type Mapa = { setView: (centro: [number, number], zoom: number) => Mapa; remove: () => void; invalidateSize: () => void };
type Capa = { addTo: (mapa: Mapa) => Capa };
type Leaflet = {
  map: (el: HTMLElement, opciones: Record<string, unknown>) => Mapa;
  tileLayer: (url: string, opciones: Record<string, unknown>) => Capa;
  divIcon: (opciones: Record<string, unknown>) => unknown;
  marker: (centro: [number, number], opciones: Record<string, unknown>) => Capa;
};

/** El pin rojo, dibujado a mano (el ícono por defecto de Leaflet depende de imágenes externas que a veces no cargan). */
const PIN =
  '<svg width="34" height="46" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">' +
  '<path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.716 23.284 0 15 0z" fill="#ea4335"/>' +
  '<circle cx="15" cy="15" r="5.5" fill="#ffffff"/>' +
  "</svg>";

const BOTON =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[0.86rem] font-semibold transition-all active:scale-[0.97]";

function Icono({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={17}
      height={17}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none"
    >
      {children}
    </svg>
  );
}

/**
 * La ubicación del negocio, como la de WhatsApp Business: un mapa con el pin, que al tocarlo abre Google Maps, y debajo los botones
 * para abrirla, para que Maps trace la ruta y para COMPARTIRLA (el menú de compartir del celular —WhatsApp, Instagram…—, o copiar
 * el enlace si el navegador no lo tiene, y un botón directo para mandarla por WhatsApp).
 *
 * El mapa es de OpenStreetMap con Leaflet (el mismo que ya usa el checkout, sin permisos nuevos) y es solo de vista: no se arrastra ni
 * se acerca con la rueda, así no se queda con el desplazamiento de la página en el celular. Sin coordenadas (el enlace no las trajo)
 * se muestran igual los botones, sin el mapa.
 */
export function MapaUbicacion({
  nombre,
  enlace,
  lat,
  lng,
  alturaPx = 210,
}: {
  nombre: string;
  /** El enlace de Google Maps que cargó el negocio. */
  enlace: string;
  lat: number | null;
  lng: number | null;
  alturaPx?: number;
}) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<Mapa | null>(null);
  const [copiado, setCopiado] = useState(false);
  const conMapa = lat !== null && lng !== null;

  useEffect(() => {
    if (!conMapa) return;
    let cancelado = false;
    // Leaflet toca `window` al importarse: se carga solo en el navegador.
    import("leaflet").then((modulo) => {
      const L = modulo as unknown as Leaflet;
      if (cancelado || !contenedor.current || mapaRef.current) return;
      const mapa = L.map(contenedor.current, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      }).setView([lat as number, lng as number], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapa);
      const icono = L.divIcon({ html: PIN, className: "", iconSize: [34, 46], iconAnchor: [17, 46] });
      L.marker([lat as number, lng as number], { icon: icono, interactive: false }).addTo(mapa);
      mapaRef.current = mapa;
      // Si el contenedor cambia de tamaño después de medirse (pasa al terminar de acomodarse la página), se vuelve a medir.
      setTimeout(() => mapaRef.current?.invalidateSize(), 300);
    });
    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, [conMapa, lat, lng]);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2200);
    return () => clearTimeout(t);
  }, [copiado]);

  async function compartir() {
    const texto = `Ubicación de ${nombre}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: nombre, text: texto, url: enlace });
      } catch {
        // La persona cerró el menú de compartir: no es un error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      // Sin permiso para copiar: queda el botón de WhatsApp y el de abrir.
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-superficie shadow-sm ring-1 ring-linea">
      {conMapa && (
        <div className="relative" style={{ height: alturaPx }}>
          <div ref={contenedor} className="h-full w-full bg-papel-hundido" aria-hidden="true" />
          {/* Tocar el mapa abre Google Maps (como la ubicación de WhatsApp). */}
          <a
            href={enlace}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir ${nombre} en Google Maps`}
            className="absolute inset-0 z-[500]"
          />
        </div>
      )}
      <div className="p-3.5">
        <p className="text-[0.95rem] font-semibold text-tinta">Cómo llegar</p>
        <p className="text-[0.8rem] text-tinta-media">{nombre}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={enlace}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BOTON} bg-brand text-white hover:bg-brand-dark`}
          >
            <Icono>
              <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.5" />
            </Icono>
            Abrir en Google Maps
          </a>
          {conMapa && (
            <a
              href={enlaceComoLlegar({ lat: lat as number, lng: lng as number })}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BOTON} bg-brand-light text-brand-texto hover:bg-brand hover:text-white`}
            >
              <Icono>
                <path d="M3 11 22 2l-9 19-2-8-8-2Z" />
              </Icono>
              Cómo llegar
            </a>
          )}
          <button
            type="button"
            onClick={compartir}
            className={`${BOTON} bg-superficie text-tinta ring-1 ring-linea hover:ring-brand`}
          >
            <Icono>
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
            </Icono>
            {copiado ? "¡Enlace copiado!" : "Compartir"}
          </button>
          <a
            href={enlaceParaCompartirPorWhatsapp(`Ubicación de ${nombre}`, enlace)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BOTON} bg-[#25D366] text-white hover:opacity-90`}
          >
            <IconoWhatsapp tam={17} />
            Enviar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
