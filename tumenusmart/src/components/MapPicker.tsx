"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker, Circle as LeafletCircle } from "leaflet";

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
        onChange(la, ln);
      });
      mapa.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        onChange(e.latlng.lat, e.latlng.lng);
      });

      mapaRef.current = mapa;
      markerRef.current = marker;
      setCargando(false);

      if (lat == null || lng == null) {
        onChange(centroInicial[0], centroInicial[1]);
      }
    });

    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
      markerRef.current = null;
      circulosRef.current = [];
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
        className="self-start text-sm text-brand hover:underline disabled:opacity-50"
      >
        {ubicando ? "Ubicando…" : "📍 Usar mi ubicación actual"}
      </button>
      <p className="text-xs text-neutral-500">
        Arrastrá el pin o tocá el mapa para marcar dónde entregamos tu pedido.
      </p>
    </div>
  );
}
