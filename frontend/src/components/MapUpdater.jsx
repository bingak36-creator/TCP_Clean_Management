import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function MapUpdater({ center, isSidebarOpen }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);

  useEffect(() => {
    // 사이드바가 열리거나 닫힐 때 지도 크기 재계산 (애니메이션 시간 0.3초 후)
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 300);
    return () => clearTimeout(timer);
  }, [isSidebarOpen, map]);

  return null;
}
