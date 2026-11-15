import React, { createContext, useContext, useState } from 'react';
import { apiFetch } from '../lib/api';

export interface SelectedLocation {
  lat: number | null;
  lng: number | null;
  label: string;
  city?: string;
  isGlobal: boolean;
}

const STORAGE_KEY = 'soleweb_last_location';

const DEFAULT_LOCATION: SelectedLocation = {
  lat: null,
  lng: null,
  label: 'Global (All Cities)',
  city: '',
  isGlobal: true,
};

interface LocationContextValue {
  location: SelectedLocation;
  setLocation: (loc: SelectedLocation) => void;
  detectNearMe: () => Promise<SelectedLocation>;
  detecting: boolean;
}

const LocationContext = createContext<LocationContextValue>({
  location: DEFAULT_LOCATION,
  setLocation: () => {},
  detectNearMe: async () => DEFAULT_LOCATION,
  detecting: false,
});

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocationState] = useState<SelectedLocation>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as SelectedLocation;
    } catch {
      // Ignore invalid storage
    }
    return DEFAULT_LOCATION;
  });
  const [detecting, setDetecting] = useState(false);

  const setLocation = (loc: SelectedLocation) => {
    setLocationState(loc);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } catch {
      // Ignore quota errors
    }
  };

  const detectNearMe = async (): Promise<SelectedLocation> => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.');
    }
    setDetecting(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      let label = 'Current Location';
      let city = '';
      try {
        const rev = await apiFetch<{ city?: string; area?: string; label?: string }>(
          `/api/reverse-geocode?lat=${lat}&lng=${lng}`
        );
        city = rev.city || '';
        label = [rev.area, rev.city].filter(Boolean).join(', ') || rev.label || label;
      } catch {
        // Use coordinates label
      }
      const next: SelectedLocation = { lat, lng, label, city, isGlobal: false };
      setLocation(next);
      return next;
    } finally {
      setDetecting(false);
    }
  };

  return (
    <LocationContext.Provider value={{ location, setLocation, detectNearMe, detecting }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => useContext(LocationContext);
