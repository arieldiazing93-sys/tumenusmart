"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const MapPicker = dynamic(
  () => import("@/components/MapPicker").then((m) => m.MapPicker),
  { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-xl bg-neutral-100" /> }
);

export function StoreLocationField({
  initialLat,
  initialLng,
}: {
  initialLat: number | null;
  initialLng: number | null;
}) {
  const [lat, setLat] = useState<number | null>(initialLat);
  const [lng, setLng] = useState<number | null>(initialLng);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        Ubicación del local
      </label>
      <p className="mb-2 text-xs text-neutral-500">
        Marcá dónde está tu local — es el punto desde el que se calculan las
        distancias de las zonas de envío.
      </p>
      <MapPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
      <input type="hidden" name="lat" value={lat ?? ""} />
      <input type="hidden" name="lng" value={lng ?? ""} />
    </div>
  );
}
