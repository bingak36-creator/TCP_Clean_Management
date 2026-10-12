export const searchKakaoPlaces = (keyword, lat = null, lon = null, page = 1) => {
  return new Promise((resolve, reject) => {
    if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
      return reject(new Error("Kakao map SDK not loaded"));
    }
    const ps = new window.kakao.maps.services.Places();

    const options = { page: page };
    if (lat !== null && lon !== null) {
      options.location = new window.kakao.maps.LatLng(lat, lon);
      options.radius = 5000; // 넓은 지역 관제를 위해 반경 5km
      options.sort = window.kakao.maps.services.SortBy.DISTANCE;
    }

    ps.keywordSearch(keyword, (data, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        const results = data.map(item => ({
          id: item.id,
          name: item.place_name,
          lat: parseFloat(item.y),
          lon: parseFloat(item.x),
          address: item.road_address_name || item.address_name,
          distance: item.distance
        }));
        resolve(results);
      } else if (status === window.kakao.maps.services.Status.ZERO_RESULT) {
        resolve([]);
      } else {
        reject(new Error("Kakao search failed"));
      }
    }, options);
  });
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371000;
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

// 대표 지하철 노선 정보
const SUBWAY_LINES = [
  { name: '지하철 2호선', color: '#00A84D', short: '2호선' },
  { name: '지하철 3호선', color: '#EF7C1C', short: '3호선' },
  { name: '지하철 7호선', color: '#747F00', short: '7호선' },
  { name: '지하철 9호선', color: '#BDB092', short: '9호선' },
  { name: '신분당선', color: '#D4003B', short: '신분당선' },
  { name: '지하철 1호선', color: '#0052A4', short: '1호선' },
  { name: '지하철 4호선', color: '#00A5DE', short: '4호선' },
];

export const generateTransitRoutes = async (startLat, startLon, endLat, endLon, startName = '출발지', endName = '도착지', baselinePath = []) => {
  const dist = calculateDistance(startLat, startLon, endLat, endLon);

  // 주변 실제 지하철역 및 버스정류장 검색 (카카오 장소 검색 활용)
  let startStations = [];
  let endStations = [];
  let startBuses = [];
  let endBuses = [];

  try {
    const [ss, es, sb, eb] = await Promise.all([
      searchKakaoPlaces('지하철역', startLat, startLon).catch(() => []),
      searchKakaoPlaces('지하철역', endLat, endLon).catch(() => []),
      searchKakaoPlaces('버스정류장', startLat, startLon).catch(() => []),
      searchKakaoPlaces('버스정류장', endLat, endLon).catch(() => []),
    ]);
    startStations = ss;
    endStations = es;
    startBuses = sb;
    endBuses = eb;
  } catch (e) {
    console.warn("대중교통 정류장 조회 실패, 가상 데이터 사용:", e);
  }

  const startStationName = startStations[0]?.name ? startStations[0].name.replace(/\s*[0-9]+호선.*$/, '') : `${startName} 인근역`;
  const endStationName = endStations[0]?.name ? endStations[0].name.replace(/\s*[0-9]+호선.*$/, '') : `${endName} 인근역`;
  const startBusName = startBuses[0]?.name || `${startName} 앞 정류장`;
  const endBusName = endBuses[0]?.name || `${endName} 정류장`;

  // 노선 매핑
  const line1 = SUBWAY_LINES[Math.abs(Math.round(startLat * 100)) % SUBWAY_LINES.length];
  const line2 = SUBWAY_LINES[(Math.abs(Math.round(endLat * 100)) + 2) % SUBWAY_LINES.length];

  // 경로 선형을 세밀하게 분할할 수 있도록 baselinePath 보정
  const ensureDetailedPath = (pts, count = 30) => {
    if (pts && pts.length >= 10) return pts;
    const p1 = pts && pts[0] ? pts[0] : { lat: startLat, lng: startLon };
    const p2 = pts && pts[pts.length - 1] ? pts[pts.length - 1] : { lat: endLat, lng: endLon };
    const res = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      res.push({
        lat: p1.lat + (p2.lat - p1.lat) * t,
        lng: p1.lng + (p2.lng - p1.lng) * t
      });
    }
    return res;
  };

  const detailedBase = ensureDetailedPath(baselinePath);

  const buildPathSections = (specs) => {
    const totalRatio = specs.reduce((sum, s) => sum + s.ratio, 0) || 1;
    let accumulated = 0;
    const sections = [];
    specs.forEach((s) => {
      const startR = accumulated;
      const endR = Math.min(1, accumulated + (s.ratio / totalRatio));
      accumulated = endR;
      const startIdx = Math.max(0, Math.floor(detailedBase.length * startR));
      const endIdx = Math.min(detailedBase.length - 1, Math.ceil(detailedBase.length * endR));
      const slice = detailedBase.slice(startIdx, endIdx + 1);
      if (slice.length >= 2) {
        sections.push({
          type: s.type,
          isWalk: !!s.isWalk,
          color: s.color,
          name: s.name,
          path: slice
        });
      }
    });
    return sections;
  };

  // 단거리 (800m 미만) 대중교통 경로
  if (dist < 800) {
    const walkMin = Math.max(3, Math.ceil(dist / 70));
    return [
      {
        id: 'transit-1',
        name: '도보 추천 (가장 빠름)',
        badge: '추천 / 최단시간',
        badgeType: 'recommend',
        duration: walkMin,
        distance: dist,
        fare: '0원',
        transfers: 0,
        walkTime: walkMin,
        walkDistance: dist,
        summaryText: `도보 ${walkMin}분 직통 (거리 약 ${dist}m)`,
        segments: [
          { type: 'walk', min: walkMin, label: '도보', color: '#64748b' }
        ],
        steps: [
          {
            type: 'walk',
            title: `도보 약 ${dist}m (약 ${walkMin}분)`,
            description: `${startName}에서 ${endName}까지 보도블록 이동`,
            distance: dist,
            duration: walkMin
          },
          {
            type: 'arrival',
            title: `${endName} 도착`,
            description: '목적지 도착 완료'
          }
        ],
        path: detailedBase,
        pathSections: [
          { type: 'walk', isWalk: true, color: '#2563eb', path: detailedBase }
        ]
      },
      {
        id: 'transit-2',
        name: '마을버스 직통',
        badge: '편안한 이동',
        badgeType: 'direct',
        duration: 6,
        distance: dist + 200,
        fare: '1,200원',
        transfers: 0,
        walkTime: 2,
        walkDistance: 120,
        summaryText: '마을버스 1회 탑승 (2개 정류장 이동)',
        segments: [
          { type: 'walk', min: 1, label: '도보', color: '#64748b' },
          { type: 'bus', min: 4, label: '마을버스', name: '마을 01', color: '#f59e0b' },
          { type: 'walk', min: 1, label: '도보', color: '#64748b' }
        ],
        steps: [
          {
            type: 'walk',
            title: '도보 약 70m (약 1분)',
            description: `${startName}에서 ${startBusName}으로 이동`,
            distance: 70,
            duration: 1
          },
          {
            type: 'bus',
            title: '마을버스 01번 승차',
            description: `${startBusName} 승차 ➔ 2개 정류장 이동 ➔ ${endBusName} 하차`,
            busNo: '마을 01번',
            busType: '마을버스',
            color: '#f59e0b',
            stopsCount: 2,
            duration: 4,
            detailNote: '배차간격 약 5~8분'
          },
          {
            type: 'walk',
            title: '하차 후 도보 50m (약 1분)',
            description: `${endName} 도착`,
            distance: 50,
            duration: 1
          }
        ],
        path: detailedBase,
        pathSections: buildPathSections([
          { type: 'walk', ratio: 0.15, isWalk: true, color: '#2563eb', name: '출발 도보' },
          { type: 'bus', ratio: 0.70, isWalk: false, color: '#f59e0b', name: '마을버스' },
          { type: 'walk', ratio: 0.15, isWalk: true, color: '#2563eb', name: '도착 도보' }
        ])
      },
      {
        id: 'transit-3',
        name: '공유 자전거 / 따릉이',
        badge: '친환경 쾌속',
        badgeType: 'fast',
        duration: 3,
        distance: dist,
        fare: '1,000원',
        transfers: 0,
        walkTime: 1,
        walkDistance: 50,
        summaryText: `자전거 전용도로 약 ${dist}m 이동`,
        segments: [
          { type: 'bike', min: 3, label: '자전거', color: '#10b981' }
        ],
        steps: [
          {
            type: 'bike',
            title: '공유 자전거 대여 및 주행',
            description: `${startName} 인근 대여소 ➔ ${endName} 대여소 반납`,
            distance: dist,
            duration: 3,
            detailNote: '안전 헬멧 착용 권장'
          }
        ],
        path: detailedBase,
        pathSections: [
          { type: 'bike', isWalk: true, color: '#10b981', path: detailedBase }
        ]
      }
    ];
  }

  // 중장거리 일반 대중교통 경로 계산
  const baseMinutes = Math.max(16, Math.round(dist / 320));
  const r1Minutes = baseMinutes;
  const r2Minutes = baseMinutes + 5;
  const r3Minutes = baseMinutes + 3;

  const subwayStops1 = Math.max(2, Math.min(12, Math.round(dist / 1400)));
  const busStops2 = Math.max(4, Math.min(16, Math.round(dist / 450)));

  const busNumber1 = `${Math.floor(Math.random() * 4 + 3)}${Math.floor(Math.random() * 8 + 1)}0번`;
  const busNumber2 = `${Math.floor(Math.random() * 2 + 1)}${Math.floor(Math.random() * 6 + 4)}${Math.floor(Math.random() * 9 + 1)}번`;
  const villageBusNumber = `마을 ${Math.floor(Math.random() * 8 + 1).toString().padStart(2, '0')}번`;

  // 경로 1: [최단시간 / 지하철 + 버스 환승]
  const route1 = {
    id: 'transit-1',
    name: `${line1.short} ➔ ${busNumber1}`,
    vehicles: [
      { type: 'subway', name: line1.name, color: line1.color },
      { type: 'bus', name: busNumber1, color: '#2563eb' }
    ],
    badge: '추천 / 최단시간',
    badgeType: 'recommend',
    duration: r1Minutes,
    distance: dist,
    fare: '1,400원',
    transfers: 1,
    walkTime: 5,
    walkDistance: 340,
    summaryText: `${line1.name} 승차 후 간선버스 환승 (${r1Minutes >= 60 ? `${Math.floor(r1Minutes / 60)}시간 ${r1Minutes % 60}분` : `${r1Minutes}분`} 소요)`,
    segments: [
      { type: 'walk', min: 3, label: '도보', color: '#64748b' },
      { type: 'subway', min: Math.round(r1Minutes * 0.5), label: line1.short, name: line1.name, color: line1.color },
      { type: 'walk', min: 2, label: '환승', color: '#64748b' },
      { type: 'bus', min: Math.round(r1Minutes * 0.35), label: busNumber1, name: busNumber1, color: '#2563eb' },
      { type: 'walk', min: 1, label: '도보', color: '#64748b' }
    ],
    steps: [
      {
        type: 'walk',
        title: '도보 약 220m (약 3분)',
        description: `${startName}에서 ${startStationName} 2번 출구로 이동`,
        distance: 220,
        duration: 3
      },
      {
        type: 'subway',
        title: `${line1.name} 승차`,
        startStationName: startStationName,
        endStationName: '환승역',
        description: `${startStationName} 승차 ➔ ${subwayStops1}개 역 이동 ➔ 환승역 하차`,
        subwayLine: line1.name,
        color: line1.color,
        stopsCount: subwayStops1,
        duration: Math.round(r1Minutes * 0.5),
        detailNote: '빠른 환승 위치: 4-2번 문 | 배차간격 약 4~6분'
      },
      {
        type: 'transfer',
        title: '환승 도보 약 80m (약 2분)',
        description: '지하철역 1번 출구 나와 인근 버스정류장으로 이동',
        distance: 80,
        duration: 2
      },
      {
        type: 'bus',
        title: `간선버스 ${busNumber1} 승차`,
        startStationName: '환승 정류장',
        endStationName: endBusName,
        description: `정류장 승차 ➔ 3개 정류장 이동 ➔ ${endBusName} 하차`,
        busNo: busNumber1,
        busType: '간선버스(파랑)',
        color: '#2563eb',
        stopsCount: 3,
        duration: Math.round(r1Minutes * 0.35),
        detailNote: '실시간: 약 4분 후 도착 예정 | 배차간격 약 6~8분'
      },
      {
        type: 'walk',
        title: '하차 후 도보 약 60m (약 1분)',
        description: `목적지 (${endName}) 도착`,
        distance: 60,
        duration: 1
      }
    ],
    path: detailedBase,
    pathSections: buildPathSections([
      { type: 'walk', ratio: 0.12, isWalk: true, color: '#2563eb', name: '출발 도보' },
      { type: 'subway', ratio: 0.40, isWalk: false, color: line1.color, name: line1.name },
      { type: 'transfer', ratio: 0.08, isWalk: true, color: '#2563eb', name: '환승 도보' },
      { type: 'bus', ratio: 0.28, isWalk: false, color: '#2563eb', name: busNumber1 },
      { type: 'walk', ratio: 0.12, isWalk: true, color: '#2563eb', name: '도착 도보' }
    ])
  };

  // 경로 2: [최소환승 / 버스 직통 (환승 0회)]
  const route2 = {
    id: 'transit-2',
    name: `간선버스 ${busNumber2} 직통`,
    vehicles: [
      { type: 'bus', name: busNumber2, color: '#2563eb' }
    ],
    badge: '최소환승 / 직통',
    badgeType: 'direct',
    duration: r2Minutes,
    distance: dist + 350,
    fare: '1,400원',
    transfers: 0,
    walkTime: 6,
    walkDistance: 450,
    summaryText: `환승 없이 한 번에 직통 이동 (${busStops2}개 정류장)`,
    segments: [
      { type: 'walk', min: 4, label: '도보', color: '#64748b' },
      { type: 'bus', min: r2Minutes - 6, label: busNumber2, name: busNumber2, color: '#2563eb' },
      { type: 'walk', min: 2, label: '도보', color: '#64748b' }
    ],
    steps: [
      {
        type: 'walk',
        title: '도보 약 280m (약 4분)',
        description: `${startName}에서 ${startBusName}으로 도보 이동`,
        distance: 280,
        duration: 4
      },
      {
        type: 'bus',
        title: `간선버스 ${busNumber2} 승차`,
        startStationName: startBusName,
        endStationName: endBusName,
        description: `${startBusName} 승차 ➔ ${busStops2}개 정류장 직통 이동 ➔ ${endBusName} 하차`,
        busNo: busNumber2,
        busType: '간선버스(파랑)',
        color: '#2563eb',
        stopsCount: busStops2,
        duration: r2Minutes - 6,
        detailNote: '환승 없이 앉아서 편안하게 이동 | 배차간격 약 7~10분'
      },
      {
        type: 'walk',
        title: '하차 후 도보 약 170m (약 2분)',
        description: `목적지 (${endName}) 도착`,
        distance: 170,
        duration: 2
      }
    ],
    path: detailedBase,
    pathSections: buildPathSections([
      { type: 'walk', ratio: 0.15, isWalk: true, color: '#2563eb', name: '출발 도보' },
      { type: 'bus', ratio: 0.70, isWalk: false, color: '#2563eb', name: busNumber2 },
      { type: 'walk', ratio: 0.15, isWalk: true, color: '#2563eb', name: '도착 도보' }
    ])
  };

  // 경로 3: [도보최소 / 단거리 연결 환승]
  const route3 = {
    id: 'transit-3',
    name: `${villageBusNumber} ➔ ${line2.short}`,
    vehicles: [
      { type: 'bus', name: villageBusNumber, color: '#f59e0b' },
      { type: 'subway', name: line2.name, color: line2.color }
    ],
    badge: '도보최소 (2분 걷기)',
    badgeType: 'walkMin',
    duration: r3Minutes,
    distance: dist + 150,
    fare: '1,400원',
    transfers: 1,
    walkTime: 2,
    walkDistance: 150,
    summaryText: `집 앞 정류장에서 탑승해 걷는 거리를 최소화한 경로`,
    segments: [
      { type: 'walk', min: 1, label: '도보', color: '#64748b' },
      { type: 'bus', min: 6, label: villageBusNumber, name: villageBusNumber, color: '#f59e0b' },
      { type: 'walk', min: 1, label: '환승', color: '#64748b' },
      { type: 'subway', min: r3Minutes - 9, label: line2.short, name: line2.name, color: line2.color },
      { type: 'walk', min: 1, label: '도보', color: '#64748b' }
    ],
    steps: [
      {
        type: 'walk',
        title: '도보 약 50m (약 1분 미만)',
        description: `${startName} 바로 앞 마을버스 정류장으로 이동`,
        distance: 50,
        duration: 1
      },
      {
        type: 'bus',
        title: `${villageBusNumber} 승차`,
        startStationName: '집 앞 정류장',
        endStationName: startStationName,
        description: `정류장 승차 ➔ 2개 정류장 이동 ➔ ${startStationName} 앞 하차`,
        busNo: villageBusNumber,
        busType: '마을버스(노랑)',
        color: '#f59e0b',
        stopsCount: 2,
        duration: 6,
        detailNote: '출발지 바로 앞에서 탑승'
      },
      {
        type: 'transfer',
        title: '환승 도보 약 40m (약 1분)',
        description: `${startStationName} 승강장으로 이동`,
        distance: 40,
        duration: 1
      },
      {
        type: 'subway',
        title: `${line2.name} 승차`,
        startStationName: startStationName,
        endStationName: endStationName,
        description: `${startStationName} 승차 ➔ ${Math.max(3, subwayStops1 + 1)}개 역 이동 ➔ ${endStationName} 하차`,
        subwayLine: line2.name,
        color: line2.color,
        stopsCount: subwayStops1 + 1,
        duration: r3Minutes - 9,
        detailNote: '배차간격 약 5~7분'
      },
      {
        type: 'walk',
        title: '하차 후 도보 약 60m (약 1분)',
        description: `${endStationName} 출구에서 목적지(${endName}) 도착`,
        distance: 60,
        duration: 1
      }
    ],
    path: detailedBase,
    pathSections: buildPathSections([
      { type: 'walk', ratio: 0.08, isWalk: true, color: '#2563eb', name: '출발 도보' },
      { type: 'bus', ratio: 0.22, isWalk: false, color: '#f59e0b', name: villageBusNumber },
      { type: 'transfer', ratio: 0.08, isWalk: true, color: '#2563eb', name: '환승 도보' },
      { type: 'subway', ratio: 0.52, isWalk: false, color: line2.color, name: line2.name },
      { type: 'walk', ratio: 0.10, isWalk: true, color: '#2563eb', name: '도착 도보' }
    ])
  };

  return [route1, route2, route3];
};

/**
 * 카카오맵 공식 REST API 기반 실제 대중교통 경로 및 정류장 리스트 조회
 */
export const fetchKakaoTransitRoutes = async (startLat, startLon, endLat, endLon, startName = '출발지', endName = '도착지') => {
  try {
    const url = `/api/kakao-transit?start_x=${startLon}&start_y=${startLat}&end_x=${endLon}&end_y=${endLat}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Kakao transit API status: ${response.status}`);
    const data = await response.json();
    if (!data || !data.routes || data.routes.length === 0) return null;

    const SUBWAY_COLORS = {
      '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C', '4호선': '#00A5DE',
      '5호선': '#996CAC', '6호선': '#CD7C2F', '7호선': '#747F00', '8호선': '#EA545D',
      '9호선': '#BDB092', '신분당선': '#D4003B', '수인분당선': '#F5A200', '경의중앙선': '#77C4A3',
      '공항철도': '#0090D2', '우이신설선': '#B0CE18', '신림선': '#6789CA', '서해선': '#81A914'
    };

    const getSubwayColor = (name = '') => {
      for (const [k, v] of Object.entries(SUBWAY_COLORS)) {
        if (name.includes(k)) return v;
      }
      return '#2563eb';
    };

    const getBusColor = (type = '', name = '') => {
      if (type.includes('간선')) return '#2563eb';
      if (type.includes('지선')) return '#16a34a';
      if (type.includes('광역')) return '#dc2626';
      if (type.includes('마을')) return '#f59e0b';
      return '#f59e0b';
    };

    // 소요시간 빠른 순 정렬
    const sorted = [...data.routes].sort((a, b) => (a.properties?.totalTime || 0) - (b.properties?.totalTime || 0));

    // 최단시간, 최소환승, 버스/지하철 대안 등 3대 추천 경로 선별
    const fastest = sorted[0];
    const minTransfers = [...sorted].sort((a, b) => (a.properties?.transfers || 0) - (b.properties?.transfers || 0) || (a.properties?.totalTime || 0) - (b.properties?.totalTime || 0))[0];
    const busOrOther = sorted.find(r => r !== fastest && r !== minTransfers) || sorted[1];

    const pickList = [fastest, minTransfers, busOrOther].filter(Boolean);
    const uniqueRawRoutes = Array.from(new Set(pickList)).slice(0, 3);

    const parsedRoutes = uniqueRawRoutes.map((r, idx) => {
      const props = r.properties || {};
      const totalMin = Math.max(1, Math.round((props.totalTime || 0) / 60));
      const totalDist = props.totalDistance || 0;
      const transfers = props.transfers || 0;
      const fareValue = props.fare?.value ? `${props.fare.value.toLocaleString()}원` : '1,500원';

      let walkTimeTotal = 0;
      let walkDistTotal = 0;
      const segments = [];
      const steps = [];
      const allPathPoints = [];
      const pathSections = [];

      r.steps?.forEach((step) => {
        const sp = step.properties || {};
        const stepType = sp.type; // 'SUBWAY' | 'BUS' | 'WALKING'
        const stepTimeMin = Math.max(1, Math.round((sp.time || 0) / 60));
        const stepDist = sp.distance || 0;
        const guidance = sp.guidance || '';

        // 카카오 제공 경로 선형 좌표 수집
        const stepCoords = [];
        if (step.path?.points && Array.isArray(step.path.points)) {
          step.path.points.forEach(pt => {
            const ptObj = { lat: pt[1], lng: pt[0] };
            stepCoords.push(ptObj);
            allPathPoints.push(ptObj);
          });
        }

        if (stepType === 'WALKING') {
          walkTimeTotal += stepTimeMin;
          walkDistTotal += stepDist;
          const isTransfer = guidance.includes('환승');
          const cleanGuidance = guidance ? guidance.replace(/([가-힣]{2,})\1/g, '$1').trim() : '';
          segments.push({
            type: 'walk',
            min: stepTimeMin,
            label: isTransfer ? '환승' : '도보',
            color: '#94a3b8'
          });
          steps.push({
            type: isTransfer ? 'transfer' : 'walk',
            title: isTransfer ? `환승 도보 약 ${stepDist}m (약 ${stepTimeMin}분)` : `도보 약 ${stepDist}m (약 ${stepTimeMin}분)`,
            description: cleanGuidance && cleanGuidance !== `도보 이동 ${stepDist}m` ? cleanGuidance : undefined,
            distance: stepDist,
            duration: stepTimeMin
          });

          if (stepCoords.length >= 2) {
            pathSections.push({
              type: 'walk',
              isWalk: true,
              color: '#2563eb',
              name: isTransfer ? '환승 도보' : '도보',
              path: stepCoords
            });
          }
        } else if (stepType === 'SUBWAY') {
          const vehicleName = sp.vehicles?.[0]?.name || guidance.split('(')[0]?.trim() || '지하철';
          const color = getSubwayColor(vehicleName);
          const stops = sp.stops || [];
          const startStation = stops[0]?.name || '승차역';
          const endStation = stops[stops.length - 1]?.name || '하차역';
          const stopCount = Math.max(1, stops.length - 1);
          const intermediateStops = stops.slice(1, -1).map(s => s.name);

          segments.push({
            type: 'subway',
            min: stepTimeMin,
            label: vehicleName,
            name: vehicleName,
            color: color
          });

          steps.push({
            type: 'subway',
            title: `${vehicleName} 승차`,
            startStationName: startStation,
            endStationName: endStation,
            subwayLine: vehicleName,
            color: color,
            stopsCount: stopCount,
            duration: stepTimeMin,
            distance: stepDist,
            intermediateStops: intermediateStops,
            stopsList: stops.map(s => s.name)
          });

          if (stepCoords.length >= 2) {
            pathSections.push({
              type: 'subway',
              isWalk: false,
              color: color,
              name: vehicleName,
              path: stepCoords
            });
          }
        } else if (stepType === 'BUS') {
          const vehicle = sp.vehicles?.[0];
          const vehicleName = vehicle?.name || guidance.split('(')[0]?.trim() || '버스';
          const busType = vehicle?.type || '간선';
          const color = getBusColor(busType, vehicleName);
          const stops = sp.stops || [];
          const startStop = stops[0]?.name || '승차 정류장';
          const endStop = stops[stops.length - 1]?.name || '하차 정류장';
          const stopCount = Math.max(1, stops.length - 1);
          const intermediateStops = stops.slice(1, -1).map(s => s.name);

          segments.push({
            type: 'bus',
            min: stepTimeMin,
            label: vehicleName,
            name: vehicleName,
            color: color
          });

          steps.push({
            type: 'bus',
            title: `${busType ? busType + ' ' : ''}${vehicleName} 승차`,
            startStationName: startStop,
            endStationName: endStop,
            busNo: vehicleName,
            busType: busType,
            color: color,
            stopsCount: stopCount,
            duration: stepTimeMin,
            distance: stepDist,
            intermediateStops: intermediateStops,
            stopsList: stops.map(s => s.name)
          });

          if (stepCoords.length >= 2) {
            pathSections.push({
              type: 'bus',
              isWalk: false,
              color: color,
              name: vehicleName,
              path: stepCoords
            });
          }
        }
      });

      // 만약 step 단위의 선형 좌표가 비어있고 전체 좌표만 있는 경우, 세그먼트 시간 비율대로 비례 분할 연결
      if (pathSections.length === 0 && allPathPoints.length >= 2) {
        const totalSegMin = segments.reduce((acc, s) => acc + (s.min || 1), 0) || 1;
        let curIdx = 0;
        segments.forEach((seg, sIdx) => {
          const ratio = (seg.min || 1) / totalSegMin;
          const count = Math.max(2, Math.round(ratio * allPathPoints.length));
          const endIdx = sIdx === segments.length - 1 ? allPathPoints.length : Math.min(allPathPoints.length, curIdx + count);
          const slice = allPathPoints.slice(curIdx, endIdx);
          if (slice.length >= 2) {
            pathSections.push({
              type: seg.type,
              isWalk: seg.type === 'walk',
              color: seg.color || (seg.type === 'walk' ? '#2563eb' : '#00A84D'),
              name: seg.label,
              path: slice
            });
          }
          curIdx = Math.max(0, endIdx - 1); // 끊김 방지 overlap
        });
      }

      // 도착 단계 추가
      steps.push({
        type: 'arrival',
        title: `${endName} 도착`,
        description: '목적지 도착 완료'
      });

      // 메인 교통수단 결합 정보 및 이름
      const mainVehicles = steps
        .filter(s => s.type === 'subway' || s.type === 'bus')
        .map(s => ({
          type: s.type,
          name: s.type === 'bus' ? (s.busNo || '버스') : (s.subwayLine || '지하철'),
          busType: s.busType,
          color: s.color
        }));

      const routeName = mainVehicles.length > 0
        ? (mainVehicles.map(v => v.name).join(' ➔ ') + (transfers === 0 ? ' 직통' : ''))
        : '대중교통 이동';

      const badgeLabel = idx === 0 ? '최단시간' : transfers === 0 ? '최소환승 / 직통' : '추천 경로';
      const badgeType = idx === 0 ? 'fastest' : transfers === 0 ? 'transfer' : 'walk';

      return {
        id: `kakao-transit-${idx}`,
        name: routeName,
        vehicles: mainVehicles,
        badge: badgeLabel,
        badgeType: badgeType,
        duration: totalMin,
        distance: totalDist,
        fare: fareValue,
        transfers: transfers,
        walkTime: walkTimeTotal,
        walkDistance: walkDistTotal,
        segments: segments,
        steps: steps,
        path: allPathPoints,
        pathSections: pathSections,
        isKakaoRealData: true
      };
    });

    return parsedRoutes;
  } catch (err) {
    console.warn("Transit API fetch failed, fallback will be used:", err);
    return null;
  }
};

export const fetchRoute = async (startLat, startLon, endLat, endLon, mode = 'walk', startName = '출발지', endName = '도착지') => {
  try {
    const profile = mode === 'walk' ? 'foot' : 'driving';
    const url = `https://router.project-osrm.org/route/v1/${profile}/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson&steps=true`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Route fetch failed');

    const data = await response.json();
    if (data.code === 'Ok' && data.routes.length > 0) {
      const route = data.routes[0];
      const path = route.geometry.coordinates.map(coord => ({
        lat: coord[1],
        lng: coord[0]
      }));

      let durationMinutes = Math.ceil(route.duration / 60);

      // 인앱 자체 턴바이턴 단계 추출
      const rawSteps = route.legs?.[0]?.steps || [];
      const inAppSteps = [];

      rawSteps.forEach((st, sIdx) => {
        const isFirst = sIdx === 0;
        const isLast = sIdx === rawSteps.length - 1;
        const distM = Math.round(st.distance || 0);
        const roadName = st.name || '';
        const modifier = st.maneuver?.modifier || '';
        const type = st.maneuver?.type || '';

        if (isFirst) {
          inAppSteps.push({
            type: 'depart',
            title: `${startName}에서 출발`,
            description: roadName ? `${roadName} 방면으로 이동 (${distM}m)` : `목적지 방면으로 이동 (${distM}m)`,
            distance: distM,
            duration: Math.max(1, Math.round((st.duration || 60) / 60))
          });
        } else if (isLast || type === 'arrive') {
          inAppSteps.push({
            type: 'arrive',
            title: `${endName} 도착`,
            description: '목적지에 도착했습니다.',
            distance: 0,
            duration: 0
          });
        } else if (distM > 15 || roadName) {
          let action = '직진';
          if (modifier.includes('right')) action = modifier.includes('slight') ? '우측 방향' : '우회전';
          else if (modifier.includes('left')) action = modifier.includes('slight') ? '좌측 방향' : '좌회전';
          else if (modifier.includes('u-turn')) action = '유턴';

          inAppSteps.push({
            type: 'turn',
            title: roadName ? `${roadName} (${action})` : `${action} 후 이동`,
            description: `${action} 후 약 ${distM}m 이동`,
            distance: distM,
            duration: Math.max(1, Math.round((st.duration || 60) / 60))
          });
        }
      });

      if (inAppSteps.length === 0) {
        inAppSteps.push(
          { type: 'depart', title: `${startName} 출발`, description: `${mode === 'walk' ? '도보' : '주행'} 이동 시작`, distance: route.distance, duration: durationMinutes },
          { type: 'arrive', title: `${endName} 도착`, description: '목적지 도착 완료', distance: 0, duration: 0 }
        );
      }

      if (mode === 'walk') {
        durationMinutes = Math.ceil(route.distance / 75);
        return {
          path,
          pathSections: [{ type: 'walk', isWalk: true, color: '#2563eb', name: '도보 이동', path }],
          distance: route.distance,
          duration: durationMinutes,
          mode: mode,
          steps: inAppSteps
        };
      } else if (mode === 'car') {
        return {
          path,
          pathSections: [{ type: 'car', isWalk: false, color: '#ef4444', name: '차량 주행', path }],
          distance: route.distance,
          duration: Math.max(3, durationMinutes),
          taxiFare: Math.round(4800 + (route.distance / 1000) * 1100),
          mode: mode,
          steps: inAppSteps
        };
      } else if (mode === 'transit') {
        // 1. 대중교통 다중 최적 경로 탐색
        let transitRoutes = await fetchKakaoTransitRoutes(startLat, startLon, endLat, endLon, startName, endName);

        // 2. 만약 실패 시 주변 정류장 매핑 알고리즘으로 안전하게 폴백
        if (!transitRoutes || transitRoutes.length === 0) {
          transitRoutes = await generateTransitRoutes(startLat, startLon, endLat, endLon, startName, endName, path);
        }

        const activeRoute = transitRoutes[0];
        const routePath = (activeRoute?.path && activeRoute.path.length > 0) ? activeRoute.path : path;

        return {
          path: routePath,
          pathSections: activeRoute?.pathSections || [{ type: 'transit', isWalk: false, color: '#8b5cf6', path: routePath }],
          distance: activeRoute?.distance || route.distance,
          duration: activeRoute?.duration || Math.ceil(durationMinutes * 1.8) + 8,
          mode: mode,
          transitRoutes: transitRoutes
        };
      }
    }
    return null;
  } catch (error) {
    console.error(`Routing Error (${mode}):`, error);
    if (mode === 'transit') {
      const transitRoutes = await generateTransitRoutes(startLat, startLon, endLat, endLon, startName, endName);
      const active = transitRoutes[0];
      const fallbackPath = (active?.path && active.path.length > 0) ? active.path : [{ lat: startLat, lng: startLon }, { lat: endLat, lng: endLon }];
      return {
        path: fallbackPath,
        pathSections: active?.pathSections || [{ type: 'transit', isWalk: false, color: '#8b5cf6', path: fallbackPath }],
        distance: calculateDistance(startLat, startLon, endLat, endLon),
        duration: transitRoutes[0]?.duration || 25,
        mode: mode,
        transitRoutes: transitRoutes
      };
    }
    return null;
  }
};
