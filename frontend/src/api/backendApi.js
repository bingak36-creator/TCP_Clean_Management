const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// 두 좌표 간 거리 계산 함수 (미터 단위)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * 백엔드 서버(Spring Boot / ngrok)로부터 실제 IoT 구역 목록 및 최신 센서 데이터를 가져옵니다.
 * @param {'restroom' | 'smoking'} category 카테고리
 * @param {number|null} userLat 사용자 현재 위도 (거리 계산용)
 * @param {number|null} userLon 사용자 현재 경도 (거리 계산용)
 */
export const fetchBackendZones = async (category, userLat = null, userLon = null) => {
  try {
    const zoneType = category === 'all' ? '' : category === 'restroom' ? 'TOILET' : 'SMOKING';
    const response = await fetch(`${BASE_URL}/api/public/zones${zoneType ? `?type=${zoneType}` : ''}`, {
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    });

    if (!response.ok) {
      throw new Error(`백엔드 통신 오류: HTTP ${response.status}`);
    }

    const data = await response.json();

    return data.filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).map((item) => {
      const distance = userLat && userLon ? getDistanceInMeters(userLat, userLon, item.latitude, item.longitude) : null;
      return {
        id: `iot-${item.zoneId}`,
        name: `[IoT] ${item.name}`,
        lat: item.latitude,
        lon: item.longitude,
        address: item.name,
        distance: distance,
        type: category,
        temp: item.temp,
        humidity: item.humidity,
        gas: item.gasLevel != null ? `${item.gasLevel} ADC` : '측정 없음',
        mq7: item.mq7Level != null ? `${item.mq7Level} ADC` : null,
        airQuality: '보정 전 센서값',
        status: item.status || '측정 없음',
        color: item.color || (category === 'restroom' ? '#10b981' : '#3b82f6'),
        isOurSolution: item.isOurSolution ?? true
      };
    });
  } catch (error) {
    console.warn('[backendApi] 백엔드 데이터를 가져오지 못했습니다. 카카오맵 기본 검색 결과를 사용합니다:', error);
    return [];
  }
};
