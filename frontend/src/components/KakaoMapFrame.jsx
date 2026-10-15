import React, { useEffect, useState } from 'react';
import { Map } from 'react-kakao-maps-sdk';

export default function KakaoMapFrame({ children, ...props }) {
  const [ready, setReady] = useState(Boolean(window.kakao?.maps?.LatLng));
  useEffect(() => {
    if (ready) return;
    const timer = setInterval(() => {
      if (window.kakao?.maps?.LatLng) setReady(true);
    }, 500);
    return () => clearInterval(timer);
  }, [ready]);
  if (!ready) {
    return <div style={{ ...props.style, display: 'grid', placeItems: 'center', background: '#eef2f6', color: '#64748b' }}>
      <div style={{ textAlign: 'center', padding: 24 }}><strong>지도 연결 대기</strong><p>지도 키를 설정하면 위치와 경로를 표시합니다.</p><a href="/dashboard">센서 대시보드 보기</a></div>
    </div>;
  }
  return <Map {...props}>{children}</Map>;
}
