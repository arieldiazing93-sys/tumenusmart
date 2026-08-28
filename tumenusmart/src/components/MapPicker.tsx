"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker, Circle as LeafletCircle } from "leaflet";
// Hoja de estilos propia de Leaflet — sin esto el mapa no tiene las reglas
// de posicionamiento de sus capas internas y se ve descuadrado o cortado.
import "leaflet/dist/leaflet.css";

// Centro por defecto: Asunción (Plaza de los Héroes), para cuando todavía
// no hay ubicación propia del local ni del cliente.
const CENTRO_POR_DEFECTO: [number, number] = [-25.2867, -57.6349];

// Paleta para los anillos de zona, de más cerca (más barato) a más lejos.
const COLORES_ZONA = ["#22c55e", "#e05d2f", "#a855f7", "#64748b"];

export type ZonaMapa = {
  id: string;
  radioKm: number;
  costoEnvio: number;
};

type Props = {
  /** Ubicación del local — si se pasa, se dibuja como pin fijo (no arrastrable) */
  storeLat?: number | null;
  storeLng?: number | null;
  /** Zonas a dibujar como círculos concéntricos alrededor del local */
  zonas?: ZonaMapa[];
  /** Ubicación del cliente (pin arrastrable) */
  lat?: number | null;
  lng?: number | null;
  onChange: (lat: number, lng: number) => void;
  zoom?: number;
  alturaPx?: number;
};

export function MapPicker({
  storeLat,
  storeLng,
  zonas = [],
  lat,
  lng,
  onChange,
  zoom = 13,
  alturaPx = 320,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const circulosRef = useRef<LeafletCircle[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const timerInvalidarRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redibujarCirculosRef = useRef<((centro: [number, number]) => void) | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ubicando, setUbicando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    // Leaflet toca `window` al importarse, así que se carga solo en el
    // navegador (nunca durante el render en el servidor de Next.js).
    import("leaflet").then((L) => {
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const centroLocal: [number, number] | null =
        storeLat != null && storeLng != null ? [storeLat, storeLng] : null;
      const centroInicial: [number, number] =
        lat != null && lng != null
          ? [lat, lng]
          : centroLocal ?? CENTRO_POR_DEFECTO;

      const mapa = L.map(contenedorRef.current).setView(centroInicial, zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapa);

      // Pin fijo del local + anillos de zona (de mayor a menor radio, para
      // que el círculo chico quede dibujado arriba y no tapado).
      if (centroLocal) {
        const zonasOrdenadas = [...zonas].sort((a, b) => b.radioKm - a.radioKm);
        zonasOrdenadas.forEach((z, i) => {
          const color = COLORES_ZONA[(zonasOrdenadas.length - 1 - i) % COLORES_ZONA.length];
          const circulo = L.circle(centroLocal, {
            radius: z.radioKm * 1000,
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.08,
          }).addTo(mapa);
          circulosRef.current.push(circulo);
        });

        const iconoLocal = L.divIcon({
          html: '<div style="background:#1f2937;color:white;font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)">🏠 Local</div>',
          className: "",
          iconSize: [0, 0],
        });
        L.marker(centroLocal, { icon: iconoLocal, interactive: false }).addTo(mapa);
      }

      // Cuando NO hay un local fijo (ej: la propia pantalla donde se está
      // marcando la ubicación del local) pero sí hay zonas para previsualizar,
      // los círculos se dibujan alrededor del pin arrastrable y se vuelven a
      // dibujar cada vez que se mueve, para que el admin vea en vivo qué
      // radio le corresponde a cada zona desde ese punto.
      const circulosSiguenAlPin = !centroLocal && zonas.length > 0;

      function redibujarCirculosEnPin(centro: [number, number]) {
        circulosRef.current.forEach((c) => c.remove());
        circulosRef.current = [];
        const zonasOrdenadas = [...zonas].sort((a, b) => b.radioKm - a.radioKm);
        zonasOrdenadas.forEach((z, i) => {
          const color = COLORES_ZONA[(zonasOrdenadas.length - 1 - i) % COLORES_ZONA.length];
          const circulo = L.circle(centro, {
            radius: z.radioKm * 1000,
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.08,
          }).addTo(mapa);
          circulosRef.current.push(circulo);
        });
      }

      if (circulosSiguenAlPin) {
        redibujarCirculosEnPin(centroInicial);
        redibujarCirculosRef.current = redibujarCirculosEnPin;
      }

      // Pin del cliente dibujado a mano (un puntito rojo tipo "gota"), en vez
      // del ícono por defecto de Leaflet — ese depende de imágenes externas
      // que a veces tardan o no cargan, dejando el mapa sin marcador visible.
      const iconoCliente = L.divIcon({
        html:
          '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">' +
          '<path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.716 23.284 0 15 0z" fill="#e11d2f"/>' +
          '<circle cx="15" cy="15" r="5.5" fill="#ffffff"/>' +
          "</svg>",
        className: "",
        iconSize: [30, 40],
        iconAnchor: [15, 40],
      });

      const marker = L.marker(centroInicial, { draggable: true, icon: iconoCliente }).addTo(mapa);
      marker.on("dragend", () => {
        const { lat: la, lng: ln } = marker.getLatLng();
        if (circulosSiguenAlPin) redibujarCirculosEnPin([la, ln]);
        onChange(la, ln);
      });
      mapa.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        if (circulosSiguenAlPin) redibujarCirculosEnPin([e.latlng.lat, e.latlng.lng]);
        onChange(e.latlng.lat, e.latlng.lng);
      });

      mapaRef.current = mapa;
      markerRef.current = marker;
      setCargando(false);

      if (lat == null || lng == null) {
        onChange(centroInicial[0], centroInicial[1]);
      }

      // Arregla el mapa cuando queda "partido" o desalineado porque su
      // contenedor cambió de tamaño después de que Leaflet ya había medido
      // el espacio disponible (pasa seguido en formularios largos, donde el
      // contenido de arriba termina de acomodarse un instante después).
      const resizeObserver = new ResizeObserver(() => {
        mapaRef.current?.invalidateSize();
      });
      resizeObserver.observe(contenedorRef.current);
      resizeObserverRef.current = resizeObserver;
      timerInvalidarRef.current = setTimeout(() => mapaRef.current?.invalidateSize(), 300);
    });

    return () => {
      cancelado = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (timerInvalidarRef.current) clearTimeout(timerInvalidarRef.current);
      mapaRef.current?.remove();
      mapaRef.current = null;
      markerRef.current = null;
      circulosRef.current = [];
      redibujarCirculosRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function usarMiUbicacion() {
    if (!navigator.geolocation) return;
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        markerRef.current?.setLatLng([latitude, longitude]);
        mapaRef.current?.setView([latitude, longitude], zoom);
        redibujarCirculosRef.current?.([latitude, longitude]);
        onChange(latitude, longitude);
        setUbicando(false);
      },
      () => setUbicando(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={contenedorRef}
        style={{ height: alturaPx }}
        className="w-full overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100"
      >
        {cargando && (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Cargando mapa…
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={usarMiUbicacion}
        disabled={ubicando}
        // Azul y con cuerpo: es la forma MÁS rápida y más exacta de decir
        // dónde vivís, y como enlace de texto no se veía que fuera algo para
        // tocar. El azul además es el color de navegar en el sistema, y esto
        // navega el mapa — no confirma nada.
        className="inline-flex self-start items-center gap-2 rounded-lg border border-azul/35 bg-azul-luz px-3.5 py-2.5 text-[0.86rem] font-semibold text-azul-oscuro transition-colors duration-150 hover:border-azul hover:bg-azul hover:text-white active:scale-[0.98] disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-[17px] w-[17px] flex-none"
        >
          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        {ubicando ? "Ubicando…" : "Usar mi ubicación actual"}
      </button>
      <p className="text-xs text-neutral-500">
        Arrastrá el pin o tocá el mapa para marcar dónde entregamos tu pedido.
      </p>
    </div>
  );
}
