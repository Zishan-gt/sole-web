import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarkerItem {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  slug?: string;
}

interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  markers?: MapMarkerItem[];
  draggablePin?: boolean;
  onPinMove?: (lat: number, lng: number) => void;
  onMarkerSelect?: (slug: string) => void;
  className?: string;
}

const PIN_ICON = L.divIcon({
  className: 'soleweb-map-pin',
  html: `<div style="width:28px;height:28px;border-radius:9999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 4px 12px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;border-radius:9999px;background:#ffffff;"></div></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const LeafletMap: React.FC<LeafletMapProps> = ({
  center,
  zoom = 13,
  markers = [],
  draggablePin = false,
  onPinMove,
  onMarkerSelect,
  className = 'h-72 w-full rounded-2xl',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center,
      zoom,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (draggablePin) {
      const marker = L.marker(center, { icon: PIN_ICON, draggable: true }).addTo(layer);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onPinMove?.(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      });
      map.setView(center, zoom);
      return;
    }

    if (markers.length > 0) {
      const bounds: [number, number][] = [];
      for (const m of markers) {
        if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
        bounds.push([m.lat, m.lng]);
        const mk = L.marker([m.lat, m.lng], { icon: PIN_ICON }).addTo(layer);
        const safeTitle = m.title.replace(/</g, '&lt;');
        const safeSub = (m.subtitle || '').replace(/</g, '&lt;');
        mk.bindPopup(
          `<div style="font-family:sans-serif;min-width:150px;">
            <div style="font-weight:700;font-size:13px;color:#0f172a;">${safeTitle}</div>
            ${safeSub ? `<div style="font-size:11px;color:#475569;margin-top:2px;">${safeSub}</div>` : ''}
          </div>`
        );
        if (m.slug && onMarkerSelect) {
          mk.on('click', () => {
            mk.openPopup();
          });
        }
      }
      if (bounds.length === 1) {
        map.setView(bounds[0], zoom);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
      }
    } else {
      L.marker(center, { icon: PIN_ICON }).addTo(layer);
      map.setView(center, zoom);
    }
  }, [center[0], center[1], zoom, draggablePin, JSON.stringify(markers)]);

  return <div ref={containerRef} className={`overflow-hidden border border-slate-200 dark:border-slate-800 ${className}`} />;
};
