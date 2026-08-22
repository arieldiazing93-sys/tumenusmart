"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const CENTRO_POR_DEFECTO: [number, number] = [-25.2867, -57.6349];

export type PuntoCalor = { lat: number; lng: number };

type Props = {
  storeLat?: number | null;
  storeLng?: number | null;
  puntos: PuntoCalor[];
  alturaPx?: number;
};

// Mapa de calor "casero": en vez de depender de un plugin externo (no
// disponible en este proyecto), dibuja cada pedido como un círculo chico y
// semitransparente — donde se superponen varios pedidos, el color se ve más
// intenso, dando el mismo efecto visual de concentración sin agregar
// dependencias nuevas.
export function MapaCalor({ storeLat, storeLng, puntos, alturaPx = 420 }: Props) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    import("leaflet").then((L) => {
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const centro: [number, number] =
        storeLat != null && storeLng != null
          ? [storeLat, storeLng]
          : puntos.length > 0
          ? [
              puntos.reduce((s, p) => s + p.lat, 0) / puntos.length,
              puntos.reduce((s, p) => s + p.lng, 0) / puntos.length,
            ]
          : CENTRO_POR_DEFECTO;

      const mapa = L.map(contenedorRef.current).setView(centro, 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapa);

      if (storeLat != null && storeLng != null) {
        const iconoLocal = L.divIcon({
          html: '<div style="background:#1f2937;color:white;font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)">🏠 Local</div>',
          className: "",
          iconSize: [0, 0],
        });
        L.marker([storeLat, storeLng], { icon: iconoLocal, interactive: false }).addTo(mapa);
      }

      puntos.forEach((p) => {
        L.circleMarker([p.lat, p.lng], {
          radius: 16,
          color: "transparent",
          weight: 0,
          fillColor: "#ef4444",
          fillOpacity: 0.12,
        }).addTo(mapa);
      });

      mapaRef.current = mapa;
      setCargando(false);

      const resizeObserver = new ResizeObserver(() => mapaRef.current?.invalidateSize());
      resizeObserver.observe(contenedorRef.current);
      resizeObserverRef.current = resizeObserver;
      timerRef.current = setTimeout(() => mapaRef.current?.invalidateSize(), 300);
    });

    return () => {
      cancelado = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
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
  );
}
