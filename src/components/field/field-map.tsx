"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

export type FieldPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  label: string;
  flagged: boolean;
};

const pin = (color: string) =>
  L.divIcon({
    className: "",
    html: `<svg width="24" height="34" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`,
    iconSize: [24, 34],
    iconAnchor: [12, 34],
  });
const ok = pin("#0f766e");
const warn = pin("#dc2626");

/** Where field staff punched today (punch locations only; no continuous tracking). */
export default function FieldMap({
  points,
  branches,
}: {
  points: FieldPoint[];
  branches: { name: string; lat: number; lng: number }[];
}) {
  const all = [...points, ...branches];
  const bounds = all.length
    ? L.latLngBounds(all.map((p) => [p.lat, p.lng] as [number, number])).pad(0.2)
    : L.latLngBounds([
        [4.5, 116.9],
        [21.1, 126.6],
      ]); // the Philippines
  return (
    <MapContainer bounds={bounds} className="h-[28rem] w-full rounded-md border" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {branches.map((b) => (
        <CircleMarker key={b.name} center={[b.lat, b.lng]} radius={6} pathOptions={{ color: "#64748b" }}>
          <Popup>{b.name}</Popup>
        </CircleMarker>
      ))}
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={p.flagged ? warn : ok}>
          <Popup>
            <b>{p.name}</b>
            <br />
            {p.label}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
