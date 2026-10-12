import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomOverlayMap, Polyline, Circle } from 'react-kakao-maps-sdk';
import Map from '../components/KakaoMapFrame';
import { fetchBackendZones } from '../api/backendApi';
import '../App.css';

import { searchKakaoPlaces, fetchRoute } from '../api/searchApi';

// 초근접 감지 기준 거리 (100m / 도보 약 1분)
const PROXIMITY_RADIUS_METERS = 100;

// 위도/경도 기반 정확한 하버사인 거리 계산 (단위: m)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371000; // 지구 반지름 (m)
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

// 가상의 100m 근접 시설 생성 헬퍼 (약 60m 거리, 테스트/체험용)
const createMock100mPlace = (baseLoc, cat) => {
  const isRestroom = cat === 'restroom' || cat === 'all';
  return {
    id: `mock-100m-${cat}-${Date.now()}`,
    name: isRestroom ? '스마트 IoT 안심화장실' : '클린 센서 흡연구역',
    lat: baseLoc.lat + 0.00045, // 약 50m 북쪽
    lon: baseLoc.lng + 0.00035, // 약 35m 동쪽 -> 직선거리 약 61m
    address: '기준 위치 60m 지점 (100m 이내 근접 시설)',
    calculatedDistance: 60,
    distance: '60',
    isWithin100m: true,
    isMock: true,
    type: isRestroom ? 'restroom' : 'smoking',
    status: isRestroom ? '쾌적' : '여유',
    color: isRestroom ? '#059669' : '#2563eb',
    temp: 22,
    humidity: 45,
    gas: '정상 (가스 감지 안됨)',
    airQuality: '보통',
    people: 1
  };
};

// 가상의 IoT 센서 데이터 부착 함수
const attachIoTSensorData = (places, category) => {
  return places.map(place => ({ ...place, type: category, temp: null, humidity: null,
    gas: '센서 미연결', airQuality: '측정 없음', status: '센서 미연결', color: '#94a3b8', isOurSolution: false }));
};

// 거리 단위 포맷팅 함수
const formatDistance = (meters) => {
  if (meters === undefined || meters === null) return '0m';
  const m = Math.round(Number(meters));
  if (m >= 1000) {
    return (m / 1000).toFixed(1) + 'km';
  }
  return m + 'm';
};

// B2B 미니멀 라인 SVG 아이콘들
const IconNav = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'text-bottom' }}>
    <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
  </svg>
);

const IconGps = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const IconMapPin = ({ active = false }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill={active ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" fill={active ? "#fff" : "none"} stroke="currentColor" strokeWidth="2" />
  </svg>
);

const IconDestination = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconSwap = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="7 10 12 15 17 10" />
    <polyline points="17 14 12 9 7 14" />
  </svg>
);

const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconTarget = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const IconZoomIn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const IconFlask = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2v7.31L4.69 19.3A2 2 0 0 0 6.4 22h11.2a2 2 0 0 0 1.71-2.7L14 9.31V2" />
    <path d="M8.5 2h7" />
    <path d="M7 16h10" />
  </svg>
);

const IconWalk = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13" cy="4" r="1.8" />
    <path d="M7 21l3-4" />
    <path d="M16 21l-2-4l-3-3l1-6" />
    <path d="M6 12l2-3l4-1l3 3l3 1" />
  </svg>
);

const IconCar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="8" rx="2"/>
    <path d="M3 11l3-6h12l3 6"/>
    <circle cx="7" cy="19" r="2"/>
    <circle cx="17" cy="19" r="2"/>
  </svg>
);

const IconBus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="16" rx="2"/>
    <path d="M4 11h16"/>
    <path d="M8 15h.01"/>
    <path d="M16 15h.01"/>
    <path d="M6 19v2"/>
    <path d="M18 19v2"/>
  </svg>
);

const IconStar = ({ filled = false }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill={filled ? "#f59e0b" : "none"}
    stroke={filled ? "#f59e0b" : "currentColor"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const IconSubwayMini = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="16" rx="3" />
    <path d="M4 11h16" />
    <circle cx="8" cy="15" r="1" />
    <circle cx="16" cy="15" r="1" />
    <path d="M6 19l-2 3" />
    <path d="M18 19l2 3" />
  </svg>
);

const IconBusMini = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="16" rx="2"/>
    <path d="M4 11h16"/>
    <circle cx="8" cy="15" r="1"/>
    <circle cx="16" cy="15" r="1"/>
    <path d="M6 19v2"/>
    <path d="M18 19v2"/>
  </svg>
);

const IconWalkMini = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13" cy="4" r="1.8" />
    <path d="M7 21l3-4" />
    <path d="M16 21l-2-4l-3-3l1-6" />
    <path d="M6 12l2-3l4-1l3 3l3 1" />
  </svg>
);

const IconBoltMini = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconSyncMini = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 3v5h-5" />
    <path d="M3 21v-5h5" />
    <path d="M21 8A9 9 0 0 0 4.5 9.5" />
    <path d="M3 16a9 9 0 0 0 16.5-1.5" />
  </svg>
);

const IconPinMini = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconTransferMini = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3l4 4-4 4" />
    <path d="M20 7H4" />
    <path d="M8 21l-4-4 4-4" />
    <path d="M4 17h16" />
  </svg>
);

const IconCarMini = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="8" rx="2"/>
    <path d="M3 11l3-6h12l3 6"/>
    <circle cx="7" cy="19" r="2"/>
    <circle cx="17" cy="19" r="2"/>
  </svg>
);

export default function MapPage() {
  const navigate = useNavigate();
  const [position, setPosition] = useState({ lat: 37.5665, lng: 126.9780 });
  const [userLocation, setUserLocation] = useState(null);
  const [mapLevel, setMapLevel] = useState(3);

  // 출발지 내 위치 연동 ON/OFF 상태 (기본값: true - 내 위치 연동)
  const [isGpsOriginActive, setIsGpsOriginActive] = useState(true);

  // 출발지 & 도착지 검색 상태
  const [originQuery, setOriginQuery] = useState('내 위치');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [originCoord, setOriginCoord] = useState(null);
  const [destCoord, setDestCoord] = useState(null);

  // 장소 자동완성 / 추천 목록 상태
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [activeDropdown, setActiveDropdown] = useState(null); // 'origin' | 'dest' | null

  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('explore'); // 'explore' | 'favorite'
  const [favoriteCategory, setFavoriteCategory] = useState('all'); // 'all' | 'restroom' | 'smoking'
  const [category, setCategory] = useState('all'); // 'all' | 'restroom' | 'smoking'
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  // 100m 근접 기능 및 거리 필터 상태 (기본값: false - 100m 이내만 표시)
  const [showAllDistance, setShowAllDistance] = useState(false);
  const [test100mMode, setTest100mMode] = useState(false);
  const [isAlertDismissed, setIsAlertDismissed] = useState(false);

  // 즐겨찾기 목록 상태 (localStorage 영구 보관)
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('trip_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("즐겨찾기 불러오기 실패:", e);
      return [];
    }
  });

  const isFavorite = (placeId) => {
    return favorites.some(f => String(f.id) === String(placeId));
  };

  const toggleFavorite = (place, e) => {
    if (e) e.stopPropagation();
    setFavorites(prev => {
      const exists = prev.some(f => String(f.id) === String(place.id));
      let updated;
      if (exists) {
        updated = prev.filter(f => String(f.id) !== String(place.id));
      } else {
        updated = [
          ...prev,
          {
            id: place.id,
            name: place.name,
            type: place.type,
            lat: place.lat,
            lon: place.lon,
            address: place.address || '',
            status: place.status || '쾌적',
            color: place.color || (place.type === 'restroom' ? '#059669' : '#2563eb'),
            calculatedDistance: place.calculatedDistance ?? null
          }
        ];
      }
      try {
        localStorage.setItem('trip_favorites', JSON.stringify(updated));
      } catch (err) {
        console.error("즐겨찾기 저장 실패:", err);
      }
      return updated;
    });
  };

  // 경로 및 네비게이션 상태
  const [navRoute, setNavRoute] = useState([]);
  const [navPathSections, setNavPathSections] = useState([]);
  const [navInfo, setNavInfo] = useState(null);
  const [navMode, setNavMode] = useState('walk');
  const [isNavigating, setIsNavigating] = useState(false);
  const [transitRoutes, setTransitRoutes] = useState([]);
  const [selectedTransitIndex, setSelectedTransitIndex] = useState(0);
  const [expandedRouteIndex, setExpandedRouteIndex] = useState(null); // 기본적으로 모두 접힌 심플 요약 카드 목록 상태
  const [expandedStops, setExpandedStops] = useState({});
  const [isLiveGuiding, setIsLiveGuiding] = useState(false);
  const [guidanceToast, setGuidanceToast] = useState(null);

  const toggleStops = (key, e) => {
    if (e) e.stopPropagation();
    setExpandedStops(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const searchContainerRef = useRef(null);
  const mapRef = useRef(null);

  // 바깥 클릭 시 추천 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    handleGpsSearch();
  }, []);

  const handleGpsSearch = () => {
    setIsLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setUserLocation({ lat, lng: lon });
          setPosition({ lat, lng: lon });
          setOriginCoord({ lat, lng: lon, name: '내 위치' });
          if (isGpsOriginActive) {
            setOriginQuery('내 위치');
          }
          performFacilitiesSearch(lat, lon, category, { lat, lng: lon, name: '내 위치' });
        },
        (err) => {
          console.error("GPS Error:", err);
          setIsLoading(false);
          const defaultLat = 37.5665;
          const defaultLon = 126.9780;
          setUserLocation({ lat: defaultLat, lng: defaultLon });
          setPosition({ lat: defaultLat, lng: defaultLon });
          setOriginCoord({ lat: defaultLat, lng: defaultLon, name: '내 위치 (기본)' });
          if (isGpsOriginActive) {
            setOriginQuery('내 위치');
          }
          performFacilitiesSearch(defaultLat, defaultLon, category, { lat: defaultLat, lng: defaultLon, name: '내 위치' });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
    } else {
      setIsLoading(false);
      alert("GPS를 지원하지 않는 브라우저입니다.");
    }
  };

  // '내 위치' ON/OFF 토글 핸들러
  const handleToggleGpsOrigin = () => {
    const nextState = !isGpsOriginActive;
    setIsGpsOriginActive(nextState);

    if (nextState) {
      // ON으로 변경 시: 즉시 GPS 현재 위치로 고정
      setOriginQuery('내 위치');
      if (userLocation) {
        setOriginCoord({ ...userLocation, name: '내 위치' });
      } else {
        handleGpsSearch();
      }
      setActiveDropdown(null);
      setOriginSuggestions([]);
    } else {
      // OFF로 변경 시: 사용자가 직접 입력할 수 있도록 인풋 필드 활성화
      setOriginQuery('');
      setOriginCoord(null);
      setOriginSuggestions([]);
    }
  };

  // 출발지 텍스트 입력 시 카카오 추천 장소 검색
  const handleOriginInputChange = async (value) => {
    setOriginQuery(value);
    if (!value.trim()) {
      setOriginSuggestions([]);
      setActiveDropdown(null);
      return;
    }
    setActiveDropdown('origin');
    try {
      const results = await searchKakaoPlaces(value.trim());
      setOriginSuggestions(results.slice(0, 5));
    } catch (err) {
      setOriginSuggestions([]);
    }
  };

  // 도착지 텍스트 입력 시 카카오 추천 장소 검색
  const handleDestInputChange = async (value) => {
    setDestinationQuery(value);
    if (!value.trim()) {
      setDestSuggestions([]);
      setActiveDropdown(null);
      return;
    }
    setActiveDropdown('dest');
    try {
      const results = await searchKakaoPlaces(value.trim());
      setDestSuggestions(results.slice(0, 5));
    } catch (err) {
      setDestSuggestions([]);
    }
  };

  // 출발지 추천 목록 항목 선택
  const handleSelectOriginSuggestion = (item) => {
    setOriginQuery(item.name);
    const selectedOrigin = {
      lat: item.lat,
      lng: item.lon,
      name: item.name,
      address: item.address
    };
    setOriginCoord(selectedOrigin);
    setActiveDropdown(null);
    setOriginSuggestions([]);

    if (destCoord) {
      startInAppNavigation({
        id: 'dest-' + Date.now(),
        name: destCoord.name,
        lat: destCoord.lat,
        lon: destCoord.lng,
        address: destCoord.address || '',
        type: 'destination',
        status: '도착지',
        color: '#2563eb'
      }, null, 'transit');
    }
  };

  // 도착지 추천 목록 항목 선택 시 즉시 가는 방법(길찾기) 리스트 표시
  const handleSelectDestSuggestion = (item) => {
    setDestinationQuery(item.name);
    const selectedDest = {
      lat: item.lat,
      lng: item.lon,
      lon: item.lon,
      name: item.name,
      address: item.address
    };
    setDestCoord(selectedDest);
    setActiveDropdown(null);
    setDestSuggestions([]);

    const origin = originCoord || userLocation || { lat: 37.5665, lng: 126.9780, name: '내 위치' };
    if (!originCoord) {
      setOriginCoord(origin);
    }

    // 탐색 기준 배너가 아닌, 처음부터 '가는 방법(대중교통 길찾기) 리스트' 화면이 바로 열리도록 실행
    startInAppNavigation({
      id: 'dest-' + Date.now(),
      name: selectedDest.name,
      lat: selectedDest.lat,
      lon: selectedDest.lon,
      lng: selectedDest.lng,
      address: selectedDest.address || '',
      type: 'destination',
      status: '도착지',
      color: '#2563eb'
    }, null, 'transit');

    performFacilitiesSearch(selectedDest.lat, selectedDest.lng, category, selectedDest);
  };

  // 기준 좌표(도착지 또는 출발지) 주변 시설 검색 함수
  const performFacilitiesSearch = async (targetLat, targetLng, currentCategory, baseLocation) => {
    if (!isNavigating) {
      setIsLoading(true);
      setSelectedPlace(null);
    }
    setIsAlertDismissed(false);

    try {
      const backendPlaces = await fetchBackendZones(currentCategory, targetLat, targetLng);
      let realPlaces = [];

      if (currentCategory === 'all') {
        const [restrooms, smokings] = await Promise.all([
          searchKakaoPlaces('화장실', targetLat, targetLng).catch(() => []),
          searchKakaoPlaces('흡연구역', targetLat, targetLng).catch(() => [])
        ]);
        const rSensors = attachIoTSensorData(restrooms.slice(0, 10), 'restroom');
        const sSensors = attachIoTSensorData(smokings.slice(0, 10), 'smoking');
        realPlaces = [...rSensors, ...sSensors];
      } else {
        const kw = currentCategory === 'restroom' ? '화장실' : '흡연구역';
        const raw = await searchKakaoPlaces(kw, targetLat, targetLng).catch(() => []);
        realPlaces = attachIoTSensorData(raw.slice(0, 15), currentCategory);
      }

      realPlaces = [...backendPlaces, ...realPlaces];

      // 기준 위치(도착지 또는 출발지)와의 정확한 거리 계산
      let enhanced = realPlaces.map(place => {
        const dist = calculateDistance(targetLat, targetLng, place.lat, place.lon);
        return {
          ...place,
          calculatedDistance: dist,
          isWithin100m: dist !== null && dist <= PROXIMITY_RADIUS_METERS,
          targetBaseName: baseLocation?.name || '기준 위치'
        };
      });

      // 거리 기준 정렬 (가까운 시설, 100m 이내 시설 우선)
      enhanced.sort((a, b) => (a.calculatedDistance ?? 999999) - (b.calculatedDistance ?? 999999));

      // 100m 테스트 모드인 경우 시뮬레이션 항목 주입
      if (test100mMode) {
        const testPlace = createMock100mPlace({ lat: targetLat, lng: targetLng }, currentCategory);
        enhanced = [testPlace, ...enhanced.filter(p => !p.isMock)];
      }

      setSearchResults(enhanced);
    } catch (error) {
      console.error("주변 시설 검색 오류:", error);
      setSearchResults([]);
    } finally {
      if (!isNavigating) {
        setIsLoading(false);
      }
    }
  };

  // 경로 및 시설 탐색 실행 공통 함수
  const executeRouteAndFacilitySearch = async (origin, dest, currentCat) => {
    setIsLoading(true);
    setSelectedPlace(null);
    setIsAlertDismissed(false);
    setIsMobileSheetOpen(true);

    try {
      const targetBase = dest || origin;
      if (!targetBase) return;

      // 지도를 도착지(또는 기준점)로 이동 및 100m가 보기 좋은 레벨 3 줌
      setPosition({ lat: targetBase.lat, lng: targetBase.lng });
      setMapLevel(3);

      // 출발지와 도착지가 모두 있으면 OSRM 경로 계산
      if (origin && dest) {
        const routeData = await fetchRoute(origin.lat, origin.lng, dest.lat, dest.lng, navMode, origin.name || '출발지', dest.name || '도착지');
        if (routeData) {
          if (navMode === 'transit' && routeData.transitRoutes && routeData.transitRoutes.length > 0) {
            setTransitRoutes(routeData.transitRoutes);
            setSelectedTransitIndex(0);
            const activeTransit = routeData.transitRoutes[0];
            setNavRoute(activeTransit.path || routeData.path);
            setNavPathSections(activeTransit.pathSections || routeData.pathSections || []);
            setNavInfo({
              distance: activeTransit.distance || routeData.distance,
              duration: activeTransit.duration || routeData.duration
            });
          } else {
            setTransitRoutes([]);
            setSelectedTransitIndex(0);
            setNavRoute(routeData.path);
            setNavPathSections(routeData.pathSections || []);
            setNavInfo({ distance: routeData.distance, duration: routeData.duration });
          }
        } else {
          setNavRoute([]);
          setNavPathSections([]);
          setNavInfo(null);
          setTransitRoutes([]);
        }
      } else {
        setNavRoute([]);
        setNavPathSections([]);
        setNavInfo(null);
        setTransitRoutes([]);
      }

      // 도착지(targetBase) 주변 시설 검색
      await performFacilitiesSearch(targetBase.lat, targetBase.lng, currentCat, targetBase);

    } catch (err) {
      console.error("경로 및 시설 탐색 오류:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 폼 제출(Enter 또는 돋보기 클릭 시)
  const handleDualSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    setActiveDropdown(null);

    let resolvedOrigin = originCoord;
    let resolvedDest = destCoord;

    // 출발지 확인
    if (isGpsOriginActive) {
      resolvedOrigin = userLocation ? { ...userLocation, name: '내 위치' } : { lat: 37.5665, lng: 126.9780, name: '내 위치' };
      setOriginCoord(resolvedOrigin);
    } else if (originQuery.trim() && (!originCoord || originCoord.name !== originQuery.trim())) {
      const originResults = await searchKakaoPlaces(originQuery.trim());
      if (originResults && originResults.length > 0) {
        resolvedOrigin = {
          lat: originResults[0].lat,
          lng: originResults[0].lon,
          name: originResults[0].name,
          address: originResults[0].address
        };
        setOriginCoord(resolvedOrigin);
      } else {
        alert(`출발지 '${originQuery}'을(를) 찾을 수 없습니다.`);
        return;
      }
    }

    // 도착지 확인
    if (destinationQuery.trim()) {
      if (!destCoord || destCoord.name !== destinationQuery.trim()) {
        const destResults = await searchKakaoPlaces(destinationQuery.trim());
        if (destResults && destResults.length > 0) {
          resolvedDest = {
            lat: destResults[0].lat,
            lng: destResults[0].lon,
            name: destResults[0].name,
            address: destResults[0].address
          };
          setDestCoord(resolvedDest);
        } else {
          alert(`도착지 '${destinationQuery}'을(를) 찾을 수 없습니다.`);
          return;
        }
      }
    } else {
      resolvedDest = null;
      setDestCoord(null);
    }

    const activeOrigin = resolvedOrigin || originCoord || userLocation || { lat: 37.5665, lng: 126.9780, name: '내 위치' };
    if (!originCoord) {
      setOriginCoord(activeOrigin);
    }

    if (resolvedDest) {
      startInAppNavigation({
        id: 'dest-' + Date.now(),
        name: resolvedDest.name,
        lat: resolvedDest.lat,
        lon: resolvedDest.lng,
        lng: resolvedDest.lng,
        address: resolvedDest.address || '',
        type: 'destination',
        status: '도착지',
        color: '#2563eb'
      }, null, 'transit');
      performFacilitiesSearch(resolvedDest.lat, resolvedDest.lng, category, resolvedDest);
    } else {
      executeRouteAndFacilitySearch(activeOrigin, null, category);
    }
  };

  // 출발지 ↔ 도착지 스왑 (내 위치 OFF 상태이거나, 클릭 시 OFF로 전환하며 스왑)
  const handleSwapOriginDest = () => {
    if (isGpsOriginActive) {
      setIsGpsOriginActive(false);
    }
    const tempQuery = originQuery;
    setOriginQuery(destinationQuery);
    setDestinationQuery(tempQuery);

    const tempCoord = originCoord;
    setOriginCoord(destCoord);
    setDestCoord(tempCoord);

    setActiveDropdown(null);

    if (destCoord) {
      executeRouteAndFacilitySearch(destCoord, tempCoord, category);
    }
  };

  // 카테고리 변경 시
  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    setSelectedPlace(null);
    endNavigation();
    setIsMobileSheetOpen(true);

    setSearchResults([]);
    const activeTarget = destCoord || originCoord || userLocation || position;
    setTimeout(() => {
      performFacilitiesSearch(activeTarget.lat, activeTarget.lng, newCat, activeTarget);
    }, 100);
  };

  const handleSelectLocation = (place) => {
    setSelectedPlace(place);
    setPosition({ lat: place.lat, lng: place.lon });
    setIsMobileSheetOpen(false);
    if (isNavigating) {
      startInAppNavigation(place, null, navMode);
    }
  };

  // 100m 시뮬레이션 테스트 토글 함수
  const toggleTest100mMode = () => {
    const nextMode = !test100mMode;
    setTest100mMode(nextMode);
    setIsAlertDismissed(false);

    const activeTarget = destCoord || originCoord || userLocation || position;

    if (nextMode) {
      setMapLevel(3);
      setPosition({ lat: activeTarget.lat, lng: activeTarget.lng });
      const testItem = createMock100mPlace(activeTarget, category);
      setSearchResults(prev => {
        const withoutMocks = prev.filter(p => !p.isMock);
        return [testItem, ...withoutMocks];
      });
    } else {
      setSearchResults(prev => prev.filter(p => !p.isMock));
    }
  };

  // 특정 시설로의 네비게이션 시작
  const startInAppNavigation = async (place, e, mode = 'transit') => {
    if (e) e.stopPropagation();
    const startPoint = originCoord || userLocation || { lat: 37.5665, lng: 126.9780, name: '내 위치' };
    if (!originCoord) {
      setOriginCoord(startPoint);
    }

    const safePlace = {
      ...place,
      lat: Number(place.lat),
      lon: Number(place.lon ?? place.lng),
      lng: Number(place.lon ?? place.lng),
      name: place.name || '도착지'
    };

    // 즉시 네비게이션 모드로 전환하여 대기 없이 길찾기 화면이 나타나도록 처리
    setIsNavigating(true);
    setIsSidebarOpen(true);
    setIsMobileSheetOpen(true);
    setIsLoading(true);
    setNavMode(mode);
    setSelectedPlace(safePlace);

    const startName = startPoint.name || '출발지';
    const endName = safePlace.name;
    const endLon = safePlace.lon;
    const routeData = await fetchRoute(startPoint.lat, startPoint.lng, safePlace.lat, endLon, mode, startName, endName);

    if (routeData) {
      if (mode === 'transit' && routeData.transitRoutes && routeData.transitRoutes.length > 0) {
        setTransitRoutes(routeData.transitRoutes);
        setSelectedTransitIndex(0);
        setExpandedRouteIndex(null); // 기본 상태는 모든 추천 경로가 심플 요약 카드인 상태!
        const activeTransit = routeData.transitRoutes[0];
        setNavRoute(activeTransit.path || routeData.path);
        setNavPathSections(activeTransit.pathSections || routeData.pathSections || []);
        setNavInfo({
          distance: activeTransit.distance || routeData.distance,
          duration: activeTransit.duration || routeData.duration,
          steps: activeTransit.steps
        });
      } else {
        setTransitRoutes([]);
        setSelectedTransitIndex(0);
        setExpandedRouteIndex(null);
        setNavRoute(routeData.path);
        setNavPathSections(routeData.pathSections || []);
        setNavInfo({
          distance: routeData.distance,
          duration: routeData.duration,
          taxiFare: routeData.taxiFare,
          steps: routeData.steps
        });
      }
      setSelectedPlace(safePlace);
      setIsNavigating(true);
      setIsSidebarOpen(true);
      setIsMobileSheetOpen(true);

      // 경로 전체가 지도 화면에 한눈에 들어오도록 bounds 자동 맞춤
      const pathToFit = (mode === 'transit' ? (routeData.transitRoutes?.[0]?.path || routeData.path) : routeData.path) || [];
      if (pathToFit.length > 0 && mapRef.current && window.kakao?.maps?.LatLngBounds) {
        try {
          const bounds = new window.kakao.maps.LatLngBounds();
          pathToFit.forEach(pt => bounds.extend(new window.kakao.maps.LatLng(pt.lat, pt.lng)));
          mapRef.current.setBounds(bounds);
        } catch (e) {
          setPosition({ lat: startPoint.lat, lng: startPoint.lng });
        }
      } else {
        setPosition({ lat: startPoint.lat, lng: startPoint.lng });
        setMapLevel(3);
      }
    } else {
      alert(`${mode === 'car' ? '자동차' : mode === 'transit' ? '대중교통' : '도보'} 경로를 찾을 수 없습니다.`);
    }
    setIsLoading(false);
  };

  const handleSelectTransitRoute = (index) => {
    if (!transitRoutes[index]) return;
    setSelectedTransitIndex(index);
    const selected = transitRoutes[index];
    if (selected.path && selected.path.length > 0) {
      setNavRoute(selected.path);
      setNavPathSections(selected.pathSections || []);
      if (mapRef.current && window.kakao?.maps?.LatLngBounds) {
        try {
          const bounds = new window.kakao.maps.LatLngBounds();
          selected.path.forEach(pt => bounds.extend(new window.kakao.maps.LatLng(pt.lat, pt.lng)));
          mapRef.current.setBounds(bounds);
        } catch (e) {}
      }
    } else {
      setNavPathSections(selected.pathSections || []);
    }
    setNavInfo({
      distance: selected.distance,
      duration: selected.duration,
      steps: selected.steps
    });
  };

  // 경로 카드 클릭 시 선택 및 상세 '가는 방법' 아코디언 토글
  const handleToggleRouteDetail = (index) => {
    handleSelectTransitRoute(index);
    setExpandedRouteIndex(prev => prev === index ? null : index);
  };

  // 실시간 경로 안내 시작 / 종료 토글 핸들러
  const handleStartGuidance = (route = null, routeIdx = null) => {
    if (isLiveGuiding) {
      setIsLiveGuiding(false);
      setGuidanceToast("경로 안내를 종료했습니다.");
      setTimeout(() => setGuidanceToast(null), 3000);
      return;
    }

    if (routeIdx !== null) {
      handleSelectTransitRoute(routeIdx);
    }

    setIsLiveGuiding(true);
    setGuidanceToast("내 위치에서 실시간 경로 안내를 시작합니다.");
    setTimeout(() => setGuidanceToast(null), 3500);

    // 모바일인 경우 지도를 가리는 바텀시트를 닫아 시작 화면(내 위치 지도)이 바로 보이도록 처리
    setIsMobileSheetOpen(false);

    // 안내 시작 시 '내 위치' 최우선으로 좌표 지정
    const myLocation = userLocation || (originCoord && originCoord.name?.includes('내 위치') ? originCoord : null) || originCoord || { lat: 37.5665, lng: 126.9780 };

    setPosition({ lat: myLocation.lat, lng: myLocation.lng });
    setMapLevel(2);

    // 카카오맵 인스턴스를 통해 직접 레벨 2로 줌인하고 내 위치를 화면 중앙에 정렬
    if (mapRef.current && window.kakao?.maps?.LatLng) {
      try {
        const moveLatLon = new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng);
        mapRef.current.setLevel(2);
        mapRef.current.setCenter(moveLatLon);
      } catch (err) {
        console.warn("지도 내 위치 중심 이동 에러:", err);
      }
    }

    // 최신 GPS 위치 즉시 재측위 시도하여 실시간 내 위치로 부드럽게 이동
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLocation({ lat, lng });
          setPosition({ lat, lng });
          if (mapRef.current && window.kakao?.maps?.LatLng) {
            try {
              const freshLatLon = new window.kakao.maps.LatLng(lat, lng);
              mapRef.current.setLevel(2);
              mapRef.current.panTo(freshLatLon);
            } catch (e) {}
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  };

  const endNavigation = () => {
    setIsNavigating(false);
    setIsLiveGuiding(false);
    setGuidanceToast(null);
    setNavRoute([]);
    setNavPathSections([]);
    setNavInfo(null);
    setTransitRoutes([]);
    setSelectedTransitIndex(0);
    setExpandedRouteIndex(null);
  };

  // 도착 예정 시간 계산
  const getArrivalTime = (durationMinutes) => {
    if (!durationMinutes) return '';
    const now = new Date();
    now.setMinutes(now.getMinutes() + durationMinutes);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const arrivalDate = new Date(now);
    arrivalDate.setHours(0, 0, 0, 0);
    const daysDiff = Math.round((arrivalDate - today) / (1000 * 60 * 60 * 24));

    let hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? '오후' : '오전';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minStr = minutes < 10 ? '0' + minutes : minutes;

    const timeStr = `${ampm} ${hours}:${minStr} 도착`;

    if (daysDiff === 1) return `내일 ${timeStr}`;
    if (daysDiff === 2) return `모레 ${timeStr}`;
    if (daysDiff > 2) return `${daysDiff}일 뒤 ${timeStr}`;
    return timeStr;
  };

  // 소요 시간 텍스트 포맷팅 (60분 이상일 때 'X시간 Y분' 형식으로 변환)
  const formatDurationText = (minutes) => {
    if (minutes === undefined || minutes === null) return '0분';
    const totalM = Math.round(Number(minutes));
    if (totalM === 0) return '0분';
    if (totalM < 60) return `${totalM}분`;

    const days = Math.floor(totalM / (60 * 24));
    const hrs = Math.floor((totalM % (60 * 24)) / 60);
    const mins = totalM % 60;

    if (days > 0) {
      let res = `${days}일`;
      if (hrs > 0) res += ` ${hrs}시간`;
      if (mins > 0) res += ` ${mins}분`;
      return res;
    }

    if (mins === 0) {
      return `${hrs}시간`;
    }
    return `${hrs}시간 ${mins}분`;
  };

  // 시간 포맷팅
  const formatDuration = (minutes) => {
    if (minutes === undefined || minutes === null) return null;
    if (minutes === 0) {
      return (
        <>
          <span style={{ fontSize: '48px', fontWeight: '800', color: '#0f172a', letterSpacing: '-1px' }}>0</span>
          <span style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginLeft: '2px' }}>분</span>
        </>
      );
    }

    const days = Math.floor(minutes / (60 * 24));
    const hrs = Math.floor((minutes % (60 * 24)) / 60);
    const mins = minutes % 60;

    if (days > 0) {
      return (
        <>
          <span style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', letterSpacing: '-1px' }}>{days}</span>
          <span style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginLeft: '2px', marginRight: '6px' }}>일</span>
          {hrs > 0 && (
            <>
              <span style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', letterSpacing: '-1px' }}>{hrs}</span>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginLeft: '2px', marginRight: '6px' }}>시간</span>
            </>
          )}
          {mins > 0 && (
            <>
              <span style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', letterSpacing: '-1px' }}>{mins}</span>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginLeft: '2px' }}>분</span>
            </>
          )}
        </>
      );
    }

    if (hrs > 0) {
      return (
        <>
          <span style={{ fontSize: '36px', fontWeight: '800', color: '#0f172a', letterSpacing: '-1px' }}>{hrs}</span>
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginLeft: '2px', marginRight: '6px' }}>시간</span>
          {mins > 0 && (
            <>
              <span style={{ fontSize: '36px', fontWeight: '800', color: '#0f172a', letterSpacing: '-1px' }}>{mins}</span>
              <span style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginLeft: '2px' }}>분</span>
            </>
          )}
        </>
      );
    }

    return (
      <>
        <span style={{ fontSize: '48px', fontWeight: '800', color: '#0f172a', letterSpacing: '-1px' }}>{mins}</span>
        <span style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginLeft: '2px' }}>분</span>
      </>
    );
  };

  // 100m 이내 시설 목록 필터링
  const within100mPlaces = useMemo(() => {
    return searchResults.filter(p => p.isWithin100m);
  }, [searchResults]);

  // 사용자가 화면 목록에서 보게 될 최종 시설 리스트 (탐색 모드)
  const displayedPlaces = useMemo(() => {
    if (showAllDistance) {
      return searchResults;
    }
    // 기본: 100m 이내 시설만 필터링!
    return within100mPlaces;
  }, [showAllDistance, searchResults, within100mPlaces]);

  // 즐겨찾기 전용 목록 (기준 위치 기반 실시간 거리 계산 및 필터)
  const displayedFavorites = useMemo(() => {
    const base = destCoord || originCoord || userLocation;
    let list = favorites.map(fav => {
      const dist = base ? calculateDistance(base.lat, base.lng, fav.lat, fav.lon) : null;
      return {
        ...fav,
        calculatedDistance: dist,
        isWithin100m: dist !== null && dist <= PROXIMITY_RADIUS_METERS
      };
    });
    if (favoriteCategory !== 'all') {
      list = list.filter(fav => fav.type === favoriteCategory);
    }
    return list.sort((a, b) => (a.calculatedDistance ?? 999999) - (b.calculatedDistance ?? 999999));
  }, [favorites, favoriteCategory, destCoord, originCoord, userLocation]);

  // 지도 위 마커 렌더링 목록 (즐겨찾기 뷰일 땐 즐겨찾기 마커, 그 외엔 탐색 시설 결과)
  const markersToRender = useMemo(() => {
    if (activeTab === 'favorite') {
      return displayedFavorites;
    }
    return displayedPlaces;
  }, [activeTab, displayedFavorites, displayedPlaces]);

  // 현재 100m 반경의 중심점 (도착지가 있으면 도착지, 없으면 내 위치)
  const activeProximityCenter = destCoord || userLocation;
  const isTargetDestination = Boolean(destCoord);

  return (
    <div className="layout-container">

      {/* 사이드바 영역 */}
      <div
        className={`layout-sidebar ${!isMobileSheetOpen ? 'mobile-hidden' : ''} ${isNavigating ? 'nav-mode' : ''}`}
        style={{
          marginLeft: isSidebarOpen ? '0' : '-400px'
        }}
      >
        <div className="mobile-sheet-toggle" onClick={() => setIsMobileSheetOpen(!isMobileSheetOpen)}>
          <div className="mobile-sheet-handle" />
        </div>

        {isNavigating && (selectedPlace || destCoord) ? (
          /* ---------------- 전문적인 네비게이션 대시보드 UI ---------------- */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* 상단 블루 헤더 */}
            <div style={{ backgroundColor: '#2563eb', color: '#fff', padding: '24px 20px 20px', position: 'relative' }}>
              <button
                onClick={endNavigation}
                style={{ position: 'absolute', top: '24px', left: '16px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
              <h2 style={{ margin: '0 0 0 40px', fontSize: '20px', fontWeight: '700', lineHeight: '1.3' }}>
                {(selectedPlace || destCoord)?.name || '도착지'}
              </h2>
            </div>

            {/* 교통수단 세그먼트 컨트롤 */}
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '6px', margin: '20px 20px 0', borderRadius: '12px' }}>
              <button
                style={{...styles.segmentButton, ...(navMode === 'walk' ? styles.segmentActive : {})}}
                onClick={() => startInAppNavigation(selectedPlace || destCoord, null, 'walk')}
              >
                <IconWalk /> 도보
              </button>
              <button
                style={{...styles.segmentButton, ...(navMode === 'car' ? styles.segmentActive : {})}}
                onClick={() => startInAppNavigation(selectedPlace || destCoord, null, 'car')}
              >
                <IconCar /> 자동차
              </button>
              <button
                style={{...styles.segmentButton, ...(navMode === 'transit' ? styles.segmentActive : {})}}
                onClick={() => startInAppNavigation(selectedPlace || destCoord, null, 'transit')}
              >
                <IconBus /> 대중교통
              </button>
            </div>

            {/* 핵심 경로 정보 */}
            <div style={{ padding: navMode === 'transit' ? '16px 20px' : '32px 24px', flex: 1, overflowY: 'auto' }}>
              {isLoading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', paddingTop: '40px' }}>
                  <div className="ping-dot" style={{ margin: '0 auto 12px' }} />
                  {navMode === 'transit' ? '대중교통 다중 최적 경로 탐색 중...' : '경로 탐색 중...'}
                </div>
              ) : navMode === 'transit' ? (
                /* 대중교통 심플 & 모던 추천 UI */
                transitRoutes && transitRoutes.length > 0 ? (
                  <div className="transit-simple-container">

                    {/* 상단 다중 추천 경로 목록 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                        추천 대중교통 경로 ({transitRoutes.length}개)
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                        카드를 누르면 상세 가는 방법이 펼쳐집니다
                      </span>
                    </div>

                    {/* 추천 경로 다중 카드 목록 */}
                    <div className="transit-cards-list">
                      {transitRoutes.map((route, idx) => {
                        const isSelected = idx === selectedTransitIndex;
                        const isExpanded = idx === expandedRouteIndex;
                        const badgeInfo = idx === 0
                          ? { label: '최단시간', classType: 'fastest' }
                          : idx === 1
                          ? { label: '최소환승', classType: 'transfer' }
                          : { label: '도보최소', classType: 'walk' };

                        return (
                          <div
                            key={route.id || idx}
                            className={`transit-route-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
                          >
                            {/* 심플하고 단정한 요약 헤더 (클릭 시 선택 및 상세 토글) */}
                            <div
                              className="transit-card-head"
                              onClick={() => handleToggleRouteDetail(idx)}
                            >
                              {/* 1행: 소요시간 + 도착시간 (좌) / 뱃지 (우) */}
                              <div className="transit-head-top">
                                <div className="transit-time-group">
                                  <span className="transit-duration-num">{formatDurationText(route.duration)}</span>
                                  <span className="transit-arrival-text">{getArrivalTime(route.duration)}</span>
                                </div>
                                <div className="transit-badges-group">
                                  <span className={`transit-badge-tag ${badgeInfo.classType}`}>
                                    {badgeInfo.label}
                                  </span>
                                  {route.isKakaoRealData && (
                                    <span className="clean-inapp-live-tag">실시간 최적</span>
                                  )}
                                </div>
                              </div>

                              {/* 2행: 교통수단 칩 순서 ([9] › [4호선] › [5호선] › [6호선]) */}
                              <div className="transit-chips-row">
                                {route.vehicles && route.vehicles.length > 0 ? (
                                  route.vehicles.map((v, vIdx) => (
                                    <React.Fragment key={vIdx}>
                                      <span
                                        className="transit-vehicle-pill"
                                        style={{ backgroundColor: v.color || '#2563eb' }}
                                      >
                                        {v.type === 'bus' ? <IconBusMini /> : <IconSubwayMini />}
                                        <span>{v.name}</span>
                                      </span>
                                      {vIdx < route.vehicles.length - 1 && (
                                        <span className="transit-pill-arrow">›</span>
                                      )}
                                    </React.Fragment>
                                  ))
                                ) : (
                                  <span className="transit-card-route-name">{route.name}</span>
                                )}
                              </div>

                              {/* 3행: 슬림 세그먼트 트랙 */}
                              {route.segments && route.segments.length > 0 && (
                                <div className="transit-card-segments">
                                  {route.segments.map((seg, sIdx) => (
                                    <div
                                      key={sIdx}
                                      style={{
                                        flex: Math.max(1, seg.min),
                                        backgroundColor: seg.color || '#94a3b8',
                                        height: '4px',
                                        borderRadius: '2px'
                                      }}
                                      title={`${seg.label || ''} ${seg.min}분`}
                                    />
                                  ))}
                                </div>
                              )}

                              {/* 4행: 메타 정보 + 접기/펼치기 버튼 */}
                              <div className="transit-head-bottom">
                                <div className="transit-card-meta">
                                  <span>환승 {route.transfers}회</span>
                                  <span className="transit-dot-sep">•</span>
                                  <span>도보 {formatDurationText(route.walkTime)} ({route.walkDistance}m)</span>
                                  <span className="transit-dot-sep">•</span>
                                  <span>{route.fare}</span>
                                </div>

                                <div className="transit-expand-indicator">
                                  <span>{isExpanded ? '접기' : '상세보기'}</span>
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{
                                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                      transition: 'transform 0.2s'
                                    }}
                                  >
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                  </svg>
                                </div>
                              </div>
                            </div>

                            {/* 눌렀을 때만 나오는 상세 가는 방법 (타임라인) */}
                            {isExpanded && (
                              <div className="transit-card-detail-body">
                                <div className="transit-clean-timeline">
                                  {route.steps?.map((step, stepIdx, arr) => {
                                    const isLast = stepIdx === arr.length - 1;
                                    const isTransit = step.type === 'subway' || step.type === 'bus';
                                    const stepColor = step.color || (step.type === 'subway' ? '#2563eb' : step.type === 'bus' ? '#f59e0b' : '#94a3b8');
                                    const stopKey = `${idx}-${stepIdx}`;
                                    const isStopsExpanded = !!expandedStops[stopKey];

                                    let nodeIcon = <IconWalkMini />;
                                    if (step.type === 'subway') nodeIcon = <IconSubwayMini />;
                                    else if (step.type === 'bus') nodeIcon = <IconBusMini />;
                                    else if (step.type === 'transfer') nodeIcon = <IconTransferMini />;
                                    else if (step.type === 'arrival') nodeIcon = <IconPinMini />;

                                    return (
                                      <div key={stepIdx} className={`clean-timeline-item type-${step.type}`}>
                                        {/* 좌측 노드 및 기둥 연결선 */}
                                        <div className="clean-timeline-pillar">
                                          <div
                                            className={`clean-node-circle ${step.type}`}
                                            style={isTransit ? { backgroundColor: stepColor } : {}}
                                          >
                                            {nodeIcon}
                                          </div>
                                          {!isLast && (
                                            <div
                                              className={`clean-timeline-line ${step.type === 'walk' || step.type === 'transfer' ? 'dashed' : ''}`}
                                              style={isTransit ? { backgroundColor: stepColor } : {}}
                                            />
                                          )}
                                        </div>

                                        {/* 우측 본문 내용 */}
                                        <div className="clean-timeline-body">
                                          {/* 대중교통 탑승 단계 */}
                                          {isTransit ? (
                                            <>
                                              <div className="clean-step-header-row">
                                                <span
                                                  className="clean-transport-pill"
                                                  style={{ backgroundColor: stepColor, color: '#fff' }}
                                                >
                                                  {step.subwayLine || step.busNo || '대중교통'}
                                                </span>
                                                <span className="clean-step-title">
                                                  <strong>{step.startStationName || '승차 정류장'}</strong> 승차
                                                </span>
                                                {step.duration && (
                                                  <span className="clean-step-time-badge">약 {formatDurationText(step.duration)}</span>
                                                )}
                                              </div>

                                              {/* 경유 정류장 아코디언 버튼 */}
                                              {step.stopsCount > 1 && (
                                                <div className="clean-stops-accordion-wrap">
                                                  <button
                                                    type="button"
                                                    className="clean-stops-toggle-pill"
                                                    onClick={(e) => toggleStops(stopKey, e)}
                                                  >
                                                    <span>{step.stopsCount}개 {step.type === 'subway' ? '역' : '정류장'} 이동</span>
                                                    <svg
                                                      width="12"
                                                      height="12"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      strokeWidth="2.5"
                                                      style={{
                                                        transform: isStopsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                        transition: 'transform 0.2s'
                                                      }}
                                                    >
                                                      <polyline points="6 9 12 15 18 9"></polyline>
                                                    </svg>
                                                  </button>

                                                  {/* 펼쳤을 때 나타나는 중간 정류장 리스트 */}
                                                  {isStopsExpanded && step.intermediateStops && step.intermediateStops.length > 0 && (
                                                    <div className="clean-stops-dropdown-list">
                                                      {step.intermediateStops.map((stName, stIdx) => (
                                                        <div key={stIdx} className="clean-stop-sub-item">
                                                          <span className="clean-stop-bullet" style={{ backgroundColor: stepColor }} />
                                                          <span className="clean-stop-name">{stName}</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                              {/* 하차 안내 행 */}
                                              {step.endStationName && (
                                                <div className="clean-step-alight-row">
                                                  <span className="clean-alight-bullet" style={{ borderColor: stepColor }} />
                                                  <span className="clean-alight-text">
                                                    <strong>{step.endStationName}</strong> 하차
                                                  </span>
                                                </div>
                                              )}
                                            </>
                                          ) : (
                                            /* 도보 / 환승 / 도착 단계 */
                                            <>
                                              <div className="clean-step-header-row">
                                                <span className="clean-step-title">{step.title}</span>
                                              </div>
                                              {step.description && step.description !== step.title && (
                                                <div className="clean-step-desc">{step.description}</div>
                                              )}
                                            </>
                                          )}

                                          {/* 추가 안내 팁 (환승 위치 등, 정류장 중복 제외) */}
                                          {step.detailNote && (
                                            <div className="clean-step-hint">
                                              💡 {step.detailNote}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* 가는 방법 아래에 안내 시작 버튼 */}
                                <div className="inapp-start-nav-row">
                                  <button
                                    type="button"
                                    className={`inapp-start-nav-action-btn ${isLiveGuiding && selectedTransitIndex === idx ? 'active' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartGuidance(route, idx);
                                    }}
                                  >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                                    </svg>
                                    <span>{isLiveGuiding && selectedTransitIndex === idx ? '안내 진행 중 (종료하려면 클릭)' : '안내 시작'}</span>
                                  </button>
                                </div>

                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                ) : (
                  <div style={{ color: '#94a3b8', textAlign: 'center', paddingTop: '40px' }}>
                    대중교통 정보를 찾을 수 없습니다.
                  </div>
                )
              ) : (
                /* 도보 / 자동차 모드 UI (앱 자체 처리) */
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '8px' }}>
                    {formatDuration(navInfo?.duration || 0)}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '15px', color: '#64748b', fontWeight: '500', marginBottom: '20px' }}>
                    <span>{formatDistance(navInfo?.distance)}</span>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <span style={{ color: '#2563eb', fontWeight: '600' }}>{getArrivalTime(navInfo?.duration)}</span>
                    {navMode === 'car' && navInfo?.taxiFare && (
                      <>
                        <span style={{ color: '#cbd5e1' }}>•</span>
                        <span style={{ color: '#0f172a', fontWeight: '600' }}>예상 택시비 {navInfo.taxiFare.toLocaleString()}원</span>
                      </>
                    )}
                  </div>

                  {/* 앱 자체 상세 이동 안내 타임라인 (Turn-by-turn) */}
                  {navInfo?.steps && navInfo.steps.length > 0 && (
                    <div className="inapp-turn-timeline-box">
                      <div className="inapp-turn-header">
                        <span>상세 이동 경로</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                          {navInfo.steps.length}개 구간
                        </span>
                      </div>
                      <div className="transit-clean-timeline">
                        {navInfo.steps.map((st, stIdx) => {
                          const isLast = stIdx === navInfo.steps.length - 1;
                          return (
                            <div key={stIdx} className="clean-timeline-item">
                              <div className="clean-timeline-pillar">
                                <div className={`clean-node-circle ${st.type}`}>
                                  {st.type === 'depart' ? <IconPinMini /> : st.type === 'arrive' ? <IconPinMini /> : navMode === 'car' ? <IconCarMini /> : <IconWalkMini />}
                                </div>
                                {!isLast && <div className="clean-timeline-line dashed" />}
                              </div>
                              <div className="clean-timeline-body">
                                <div className="clean-step-header-row">
                                  <span className="clean-step-title">{st.title}</span>
                                  {st.duration > 0 && (
                                    <span className="clean-step-time-badge">약 {formatDurationText(st.duration)}</span>
                                  )}
                                </div>
                                {st.description && <div className="clean-step-desc">{st.description}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 도보 / 자동차 모드 상세 경로 아래 안내 시작 버튼 */}
                  <div className="inapp-start-nav-row" style={{ marginTop: '14px' }}>
                    <button
                      type="button"
                      className={`inapp-start-nav-action-btn ${isLiveGuiding ? 'active' : ''}`}
                      onClick={() => handleStartGuidance()}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                      </svg>
                      <span>{isLiveGuiding ? '안내 진행 중 (종료하려면 클릭)' : '안내 시작'}</span>
                    </button>
                  </div>

                  {/* 실시간 IoT 현장 상태 블록 */}
                  <div style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: '16px',
                    padding: '16px 20px',
                    border: '1px solid #e2e8f0',
                    marginTop: '16px'
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>
                      현장 실시간 상태 (IoT)
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: selectedPlace.color || '#2563eb', marginRight: '8px' }}></div>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>{selectedPlace.status || '정상 운영'}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: '0 20px 24px' }}>
              <button
                onClick={endNavigation}
                style={{
                  width: '100%',
                  padding: '18px 0',
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  borderRadius: '14px',
                  fontSize: '16px',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#1e293b'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#0f172a'}
              >
                안내 종료
              </button>
            </div>

          </div>

        ) : (
          /* ---------------- 일반 탐색 및 검색 모드 UI ---------------- */
          <div className="sidebar-content-wrapper">

            {/* 1. 상단 고정 헤더: 통합 2열 경로 검색 카드 & 카테고리 탭 */}
            <div className="sidebar-header" ref={searchContainerRef}>

              {/* 최상단 뷰 전환: 시설 탐색 vs 즐겨찾기 */}
              <div className="sidebar-top-switcher">
                <button
                  type="button"
                  className={`sidebar-tab-btn ${activeTab === 'explore' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('explore');
                    setSelectedPlace(null);
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                  </svg>
                  <span>시설 탐색</span>
                </button>
                <button
                  type="button"
                  className={`sidebar-tab-btn ${activeTab === 'favorite' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('favorite');
                    setSelectedPlace(null);
                  }}
                >
                  <IconStar filled={activeTab === 'favorite' || favorites.length > 0} />
                  <span>즐겨찾기</span>
                  <span className="sidebar-tab-count">{favorites.length}</span>
                </button>
              </div>

              {activeTab === 'explore' ? (
                <>
                  <form onSubmit={handleDualSearchSubmit} style={{ position: 'relative' }}>
                <div className="unified-route-card">

                  {/* 좌측: 경로 핀 & 연결선 */}
                  <div className="route-track-indicator">
                    <span className="route-origin-dot" />
                    <span className="route-track-line" />
                    <span className="route-dest-dot" />
                  </div>

                  {/* 중앙: 2열 인풋 (출발지 & 도착지) */}
                  <div className="route-inputs-col">

                    {/* Row 1: 출발지 */}
                    <div className="route-input-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isGpsOriginActive ? (
                          <div className="route-gps-active-badge">
                            <span className="ping-dot" style={{ width: '6px', height: '6px' }} />
                            <span>현재 위치 (GPS)</span>
                            <button
                              type="button"
                              onClick={handleGpsSearch}
                              className="route-mini-refresh-btn"
                              title="내 위치 새로고침"
                            >
                              <IconGps />
                            </button>
                          </div>
                        ) : (
                          <input
                            type="text"
                            className="route-clean-input"
                            placeholder="출발지 직접 입력 (예: 서울역)"
                            value={originQuery}
                            onChange={(e) => handleOriginInputChange(e.target.value)}
                            onFocus={() => {
                              if (originSuggestions.length > 0) setActiveDropdown('origin');
                            }}
                          />
                        )}
                      </div>

                      {!isGpsOriginActive && originQuery && (
                        <button
                          type="button"
                          onClick={() => { setOriginQuery(''); setOriginSuggestions([]); }}
                          className="route-clear-icon-btn"
                          title="출발지 지우기"
                        >
                          ×
                        </button>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '6px' }}>
                        {/* 내 위치 지도 위치 토글 아이콘 */}
                        <button
                          type="button"
                          onClick={handleToggleGpsOrigin}
                          className={`route-action-icon-btn ${isGpsOriginActive ? 'gps-on' : ''}`}
                          title={isGpsOriginActive ? "내 위치 사용 중 (클릭 시 직접 입력)" : "내 위치 켜기"}
                        >
                          <IconMapPin active={isGpsOriginActive} />
                        </button>

                        {/* 출발지 ↔ 도착지 맞바꾸기 버튼 */}
                        <button
                          type="button"
                          onClick={handleSwapOriginDest}
                          className="route-action-icon-btn"
                          title="출발지 ↔ 도착지 맞바꾸기"
                        >
                          <IconSwap />
                        </button>
                      </div>
                    </div>

                    <div className="route-input-divider" />

                    {/* Row 2: 도착지 */}
                    <div className="route-input-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          type="text"
                          className="route-clean-input"
                          placeholder="도착지 검색 (화장실/흡연장 탐색)"
                          value={destinationQuery}
                          onChange={(e) => handleDestInputChange(e.target.value)}
                          onFocus={() => {
                            if (destSuggestions.length > 0) setActiveDropdown('dest');
                          }}
                        />
                      </div>

                      {destinationQuery && (
                        <button
                          type="button"
                          onClick={() => { setDestinationQuery(''); setDestSuggestions([]); }}
                          className="route-clear-icon-btn"
                          title="도착지 지우기"
                        >
                          ×
                        </button>
                      )}

                      <div style={{ marginLeft: '6px' }}>
                        <button
                          type="submit"
                          className="route-action-icon-btn search-btn"
                          title="도착지 및 주변 시설 검색"
                        >
                          <IconSearch />
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* 출발지 추천 목록 드롭다운 */}
                {activeDropdown === 'origin' && originSuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '800', color: '#64748b', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      출발지 추천 장소
                    </div>
                    {originSuggestions.map((item) => (
                      <div
                        key={item.id}
                        className="suggestion-item"
                        onClick={() => handleSelectOriginSuggestion(item)}
                      >
                        <div style={{ marginTop: '3px' }}>
                          <span className="route-origin-dot" style={{ display: 'inline-block' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="suggestion-name">{item.name}</div>
                          <div className="suggestion-address">{item.address || '주소 정보 없음'}</div>
                          {item.category && <div className="suggestion-category">{item.category.split('>').pop().trim()}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 도착지 추천 목록 드롭다운 */}
                {activeDropdown === 'dest' && destSuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '800', color: '#64748b', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      도착지 추천 장소
                    </div>
                    {destSuggestions.map((item) => (
                      <div
                        key={item.id}
                        className="suggestion-item"
                        onClick={() => handleSelectDestSuggestion(item)}
                      >
                        <div style={{ marginTop: '3px' }}>
                          <IconDestination />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="suggestion-name">{item.name}</div>
                          <div className="suggestion-address">{item.address || '주소 정보 없음'}</div>
                          {item.category && <div className="suggestion-category">{item.category.split('>').pop().trim()}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </form>

              {/* 카테고리 필터 세그먼트 (전체, 화장실, 흡연장, 즐겨찾기) */}
              <div className="category-segmented-control">
                <button
                  type="button"
                  className={`category-seg-btn ${category === 'all' ? 'active' : ''}`}
                  onClick={() => handleCategoryChange('all')}
                >
                  전체 ({showAllDistance ? searchResults.length : within100mPlaces.length})
                </button>
                <button
                  type="button"
                  className={`category-seg-btn ${category === 'restroom' ? 'active' : ''}`}
                  onClick={() => handleCategoryChange('restroom')}
                >
                  화장실
                </button>
                <button
                  type="button"
                  className={`category-seg-btn ${category === 'smoking' ? 'active' : ''}`}
                  onClick={() => handleCategoryChange('smoking')}
                >
                  흡연구역
                </button>
              </div>

              {/* 도착지 설정 시 기준 정보 미니 배너 (네비게이션 중이 아닐 때만 표시) */}
              {destCoord && !isNavigating && (
                <div style={{
                  marginTop: '10px',
                  padding: '8px 12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '9px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '800',
                      color: '#2563eb',
                      backgroundColor: '#eff6ff',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      border: '1px solid #bfdbfe',
                      flexShrink: 0
                    }}>
                      탐색 기준
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {destCoord.name} (반경 100m)
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '6px' }}>
                    {navInfo && (
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
                        {formatDistance(navInfo.distance)} · {formatDurationText(navInfo.duration)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => startInAppNavigation({
                        id: 'dest-' + Date.now(),
                        name: destCoord.name,
                        lat: destCoord.lat,
                        lon: destCoord.lng,
                        address: destCoord.address || '',
                        type: 'destination',
                        status: '도착지',
                        color: '#2563eb'
                      }, null, 'transit')}
                      style={{
                        backgroundColor: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 9px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="도착지까지 대중교통 및 상세 길찾기 시작"
                    >
                      <IconBusMini />
                      <span>길찾기</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* 즐겨찾기 전용 상단 헤더 & 필터 칩 */
            <div className="favorites-panel-header">
              <div className="favorites-panel-title">
                <IconStar filled={true} />
                <span>내 즐겨찾기 보관함</span>
              </div>
              <div className="favorites-panel-subtitle">
                저장한 시설 ({favorites.length}곳) · 실시간 거리 계산
              </div>
              <div className="favorites-chip-group">
                <button
                  type="button"
                  className={`favorites-chip ${favoriteCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setFavoriteCategory('all')}
                >
                  전체 ({favorites.length})
                </button>
                <button
                  type="button"
                  className={`favorites-chip ${favoriteCategory === 'restroom' ? 'active' : ''}`}
                  onClick={() => setFavoriteCategory('restroom')}
                >
                  화장실 ({favorites.filter(f => f.type === 'restroom').length})
                </button>
                <button
                  type="button"
                  className={`favorites-chip ${favoriteCategory === 'smoking' ? 'active' : ''}`}
                  onClick={() => setFavoriteCategory('smoking')}
                >
                  흡연구역 ({favorites.filter(f => f.type === 'smoking').length})
                </button>
              </div>
            </div>
          )}
        </div>

            {/* 2. 스크롤 가능한 시설 목록 영역 (100m 이내 필터 및 즐겨찾기 분리) */}
            <div className="sidebar-scroll-area">

              {activeTab === 'favorite' ? (
                /* ---------------- 즐겨찾기 전용 목록 ---------------- */
                displayedFavorites.length === 0 ? (
                  <div className="favorites-empty-box">
                    <div style={{ color: '#f59e0b', transform: 'scale(1.4)', marginBottom: '4px' }}>
                      <IconStar filled={true} />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                      {favoriteCategory !== 'all' ? '해당 유형의 즐겨찾기가 없습니다' : '등록된 즐겨찾기가 없습니다'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, textAlign: 'center' }}>
                      자주 찾는 화장실이나 흡연구역의<br />
                      별 모양(★) 아이콘을 눌러 즐겨찾기에 등록해보세요.
                    </div>
                    <button
                      type="button"
                      className="favorites-empty-action-btn"
                      onClick={() => setActiveTab('explore')}
                    >
                      주변 시설 둘러보기
                    </button>
                  </div>
                ) : (
                  displayedFavorites.map((result) => {
                    const is100m = result.isWithin100m;
                    const isSelected = selectedPlace?.id === result.id;
                    const statusClass = result.status === '쾌적' ? 'clean' : result.status === '혼잡' ? 'busy' : 'need-clean';
                    const favActive = isFavorite(result.id);

                    return (
                      <div
                        key={result.id}
                        className={`place-card ${is100m ? 'is-100m' : ''} ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleSelectLocation(result)}
                      >
                        {/* 카드 상단: 시설 유형 + 이름 + 상태 배지 + 즐겨찾기 별 버튼 */}
                        <div className="place-card-top">
                          <div className="place-title-box">
                            <span className={`place-type-badge ${result.type}`}>
                              {result.type === 'restroom' ? '화장실' : '흡연장'}
                            </span>
                            <h4 className="place-name-heading">{result.name}</h4>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className={`place-status-tag ${statusClass}`}>
                              <span className="place-status-dot" />
                              {result.status}
                            </span>

                            {/* 즐겨찾기 별 버튼 */}
                            <button
                              type="button"
                              onClick={(e) => toggleFavorite(result, e)}
                              className={`place-fav-btn ${favActive ? 'is-fav' : ''}`}
                              title="즐겨찾기 해제"
                            >
                              <IconStar filled={favActive} />
                            </button>
                          </div>
                        </div>

                        {/* 카드 하단: 거리 정보 + 100m 뱃지 + 길안내 버튼 */}
                        <div className="place-card-bottom">
                          <div className="place-distance-info">
                            <span>
                              {isTargetDestination ? `도착지에서 ` : '내 위치에서 '}
                              <strong>{formatDistance(result.calculatedDistance ?? result.distance)}</strong>
                            </span>
                            {is100m && (
                              <span className="place-100m-pill">
                                100m 이내
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => startInAppNavigation(result, e, 'walk')}
                            className="place-card-nav-btn"
                            title="길안내 시작"
                          >
                            <IconNav />
                            <span>길안내</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                /* ---------------- 일반 탐색 모드 목록 ---------------- */
                <>
                  {/* 100m 이내 시설 감지 요약 알림 */}
                  {within100mPlaces.length > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '10px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="ping-dot" style={{ width: '6px', height: '6px' }} />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e3a8a' }}>
                          {isTargetDestination ? `도착지 기준` : '내 위치'} 100m 이내 시설 <strong>{within100mPlaces.length}곳</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMapLevel(3);
                          const target = activeProximityCenter;
                          if (target) setPosition({ lat: target.lat, lng: target.lng });
                        }}
                        style={{
                          backgroundColor: '#2563eb',
                          color: '#fff',
                          border: 'none',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        100m 줌
                      </button>
                    </div>
                  )}

                  {/* 주변 전체 보기 활성화 상태 안내 바 */}
                  {showAllDistance && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 12px',
                      backgroundColor: '#f1f5f9',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#475569',
                      border: '1px solid #e2e8f0'
                    }}>
                      <span>전체 주변 시설 표시 중 ({searchResults.length}곳)</span>
                      <button
                        type="button"
                        onClick={() => setShowAllDistance(false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          fontWeight: '700',
                          cursor: 'pointer',
                          fontSize: '11px'
                        }}
                      >
                        100m 이내만 보기
                      </button>
                    </div>
                  )}

                  {/* 시설 목록 렌더링 */}
                  {isLoading ? (
                    <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0', fontSize: '13px' }}>
                      {isTargetDestination ? '도착지' : '내 위치'} 주변 시설 검색 중...
                    </div>
                  ) : !showAllDistance && within100mPlaces.length === 0 ? (
                    /* 100m 이내 시설 없음 안내 */
                    <div style={{
                      padding: '30px 16px',
                      textAlign: 'center',
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: '1px dashed #cbd5e1',
                      margin: '8px 0'
                    }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                        {isTargetDestination ? `'${destCoord.name}' 기준` : '현재 위치'} 100m 이내 시설 없음
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', lineHeight: 1.5 }}>
                        반경 100m 내에 위치한 시설만 표시하도록 설정되어 있습니다.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '240px', margin: '0 auto' }}>
                        {searchResults.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowAllDistance(true)}
                            style={{
                              padding: '8px 14px',
                              backgroundColor: '#0f172a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            주변 전체 시설 보기 ({searchResults.length}곳)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={toggleTest100mMode}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {test100mMode ? '100m 테스트 끄기' : '100m 가상 시설 체험'}
                        </button>
                      </div>
                    </div>
                  ) : displayedPlaces.length > 0 ? (
                    displayedPlaces.map((result) => {
                      const is100m = result.isWithin100m;
                      const isSelected = selectedPlace?.id === result.id;
                      const statusClass = result.status === '쾌적' ? 'clean' : result.status === '혼잡' ? 'busy' : 'need-clean';
                      const favActive = isFavorite(result.id);

                      return (
                        <div
                          key={result.id}
                          className={`place-card ${is100m ? 'is-100m' : ''} ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => handleSelectLocation(result)}
                        >
                          {/* 카드 상단: 시설 유형 + 이름 + 상태 배지 + 즐겨찾기 별 버튼 */}
                          <div className="place-card-top">
                            <div className="place-title-box">
                              <span className={`place-type-badge ${result.type}`}>
                                {result.type === 'restroom' ? '화장실' : '흡연장'}
                              </span>
                              <h4 className="place-name-heading">{result.name}</h4>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className={`place-status-tag ${statusClass}`}>
                                <span className="place-status-dot" />
                                {result.status}
                              </span>

                              {/* 즐겨찾기 별 버튼 */}
                              <button
                                type="button"
                                onClick={(e) => toggleFavorite(result, e)}
                                className={`place-fav-btn ${favActive ? 'is-fav' : ''}`}
                                title={favActive ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                              >
                                <IconStar filled={favActive} />
                              </button>
                            </div>
                          </div>

                          {/* 카드 하단: 거리 정보 + 100m 뱃지 + 길안내 버튼 */}
                          <div className="place-card-bottom">
                            <div className="place-distance-info">
                              <span>
                                {isTargetDestination ? `도착지에서 ` : '내 위치에서 '}
                                <strong>{formatDistance(result.calculatedDistance ?? result.distance)}</strong>
                              </span>
                              {is100m && (
                                <span className="place-100m-pill">
                                  100m 이내
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => startInAppNavigation(result, e, 'walk')}
                              className="place-card-nav-btn"
                              title="길안내 시작"
                            >
                              <IconNav />
                              <span>길안내</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0', fontSize: '13px' }}>
                      {destCoord ? `'${destCoord.name}' 주변에 등록된 시설이 없습니다.` : '주변에 검색된 시설이 없습니다.'}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 지도 영역 */}
      <div className="layout-map-area">
        {!isNavigating && (
          <button
            className="layout-toggle-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "사이드바 숨기기" : "사이드바 열기"}
          >
            {isSidebarOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            )}
          </button>
        )}

        {/* 100m 이내 시설 감지 플로팅 상단 알림 배너 */}
        {within100mPlaces.length > 0 && !isNavigating && !isAlertDismissed && (
          <div className="top-proximity-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={styles.bannerIconBox}>
                <IconTarget />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px' }}>
                    {isTargetDestination ? `도착지 '${destCoord.name}' 주변` : '내 위치'} 100m 이내 {within100mPlaces[0].type === 'restroom' ? '화장실' : '흡연구역'} 감지
                  </span>
                  <span style={styles.bannerDistanceTag}>
                    약 {within100mPlaces[0].calculatedDistance}m
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px', fontWeight: '500' }}>
                  {within100mPlaces[0].name}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => {
                  setSelectedPlace(within100mPlaces[0]);
                  setPosition({ lat: within100mPlaces[0].lat, lng: within100mPlaces[0].lon });
                  setMapLevel(3);
                }}
                style={styles.bannerBtnSecondary}
              >
                위치 보기
              </button>
              <button
                onClick={(e) => startInAppNavigation(within100mPlaces[0], e, 'walk')}
                style={styles.bannerBtnPrimary}
              >
                <IconNav /> 바로 안내
              </button>
              <button
                onClick={() => setIsAlertDismissed(true)}
                style={styles.bannerCloseBtn}
                title="닫기"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* 우측 상단/중단 퀵 컨트롤 툴바 */}
        <div className="map-quick-controls">
          {/* 즐겨찾기 보관함 빠른 열기 플로팅 버튼 */}
          <button
            onClick={() => {
              setActiveTab(activeTab === 'favorite' ? 'explore' : 'favorite');
              setIsSidebarOpen(true);
              setIsMobileSheetOpen(true);
            }}
            style={{
              ...styles.mapControlBtn,
              backgroundColor: activeTab === 'favorite' ? '#fef3c7' : '#fff',
              color: activeTab === 'favorite' ? '#b45309' : '#0f172a',
              border: activeTab === 'favorite' ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
            }}
            title="즐겨찾기 보관함 열기"
          >
            <IconStar filled={activeTab === 'favorite' || favorites.length > 0} />
            <span style={{ fontSize: '10px', marginTop: '3px', fontWeight: '700' }}>
              즐겨찾기{favorites.length > 0 ? `(${favorites.length})` : ''}
            </span>
          </button>

          <button
            onClick={() => {
              const target = activeProximityCenter;
              if (target) {
                setPosition({ lat: target.lat, lng: target.lng });
                setMapLevel(3);
              } else {
                handleGpsSearch();
              }
            }}
            style={styles.mapControlBtn}
            title="100m 반경 확대"
          >
            <IconZoomIn />
            <span style={{ fontSize: '10px', marginTop: '3px', fontWeight: '700' }}>100m 줌</span>
          </button>

          <button
            onClick={handleGpsSearch}
            style={styles.mapControlBtn}
            title="내 위치 재검색"
          >
            <IconGps />
            <span style={{ fontSize: '10px', marginTop: '3px', fontWeight: '700' }}>내 위치</span>
          </button>

          <button
            onClick={toggleTest100mMode}
            style={{
              ...styles.mapControlBtn,
              backgroundColor: test100mMode ? '#2563eb' : '#fff',
              color: test100mMode ? '#fff' : '#0f172a',
              border: test100mMode ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
            }}
            title="100m 근접 시설 시뮬레이션 ON/OFF"
          >
            <IconFlask />
            <span style={{ fontSize: '10px', marginTop: '3px', fontWeight: '700' }}>
              {test100mMode ? '테스트중' : '100m체험'}
            </span>
          </button>
        </div>

        {/* 실시간 길안내 진행 중 상단 플로팅 뱃지 */}
        {isLiveGuiding && (
          <div className="map-live-guiding-pill">
            <span className="live-guiding-pulse" />
            <span className="live-guiding-title">실시간 경로 안내 중</span>
            <span className="live-guiding-dest-label">
              {destCoord?.name || selectedPlace?.name || '목적지'}
            </span>
            <button
              type="button"
              className="live-guiding-stop-pill-btn"
              onClick={() => handleStartGuidance()}
              title="경로 안내 종료"
            >
              종료
            </button>
          </div>
        )}

        {/* 안내 시작/종료 토스트 알림 */}
        {guidanceToast && (
          <div className="map-guidance-toast">
            <span>{guidanceToast}</span>
          </div>
        )}

        <Map
          center={position}
          style={{ width: '100%', height: '100%' }}
          level={mapLevel}
          onZoomChanged={(map) => setMapLevel(map.getLevel())}
          onCreate={(map) => { mapRef.current = map; }}
        >
          {/* 사용자 GPS 위치 마커 */}
          {(userLocation || (originCoord && originCoord.name?.includes('내 위치'))) && (
            <CustomOverlayMap
              position={userLocation || { lat: originCoord.lat, lng: originCoord.lng }}
              zIndex={1001}
            >
              <div style={styles.userLocationDot}>
                <div style={styles.userLocationPulse}></div>
                {isLiveGuiding && (
                  <div className="live-user-loc-badge">
                    <span>내 위치 (출발)</span>
                  </div>
                )}
              </div>
            </CustomOverlayMap>
          )}

          {/* 지정된 별도 출발지 마커 (내 위치가 아닌 특정 장소일 때) */}
          {originCoord && originCoord.name !== '내 위치' && (
            <CustomOverlayMap
              position={{ lat: originCoord.lat, lng: originCoord.lng }}
              yAnchor={1}
              xAnchor={0.5}
              zIndex={1001}
            >
              <div style={styles.originPinContainer}>
                <div style={styles.originTooltip}>
                  <span style={styles.originBadge}>출발</span>
                  <span style={styles.originName}>{originCoord.name}</span>
                </div>
                <div style={styles.originPinIcon}>
                  <div style={styles.originPinInner} />
                </div>
              </div>
            </CustomOverlayMap>
          )}

          {/* 도착지 마커 (도착지가 검색되었을 때) */}
          {destCoord && (
            <CustomOverlayMap
              position={{ lat: destCoord.lat, lng: destCoord.lng }}
              yAnchor={1}
              xAnchor={0.5}
              zIndex={1002}
            >
              <div style={styles.destinationPinContainer}>
                <div style={styles.destinationTooltip}>
                  <span style={styles.destinationBadge}>도착</span>
                  <span style={styles.destinationName}>{destCoord.name}</span>
                </div>
                <div style={styles.destinationPinIcon}>
                  <div style={styles.destinationPinInner} />
                </div>
              </div>
            </CustomOverlayMap>
          )}

          {/* 100m 반경 서클 (도착지가 있으면 도착지 기준, 없으면 내 위치 기준) */}
          {activeProximityCenter && (
            <>
              <Circle
                center={{ lat: activeProximityCenter.lat, lng: activeProximityCenter.lng }}
                radius={100}
                strokeWeight={2}
                strokeColor="#2563eb"
                strokeOpacity={0.8}
                strokeStyle="dashed"
                fillColor="#3b82f6"
                fillOpacity={0.09}
                zIndex={10}
              />

              {/* 100m 원 상단 경계선 라벨 */}
              <CustomOverlayMap
                position={{ lat: activeProximityCenter.lat + 0.0009, lng: activeProximityCenter.lng }}
                zIndex={20}
              >
                <div style={styles.radiusBadge}>
                  {isTargetDestination ? `도착지 100m 반경` : `100m 반경`}
                </div>
              </CustomOverlayMap>
            </>
          )}

          {/* 출발지 → 도착지 간 경로 안내 라인 (도보 점선 / 대중교통 고유 호선색 실선 분리 렌더링) */}
          {navPathSections && navPathSections.length > 0 ? (
            navPathSections.map((sec, sIdx) => {
              if (sec.isWalk) {
                // 도보 구간: 보행자 전용 푸른빛 소프트 글로우 + 선명한 파란 점선
                return (
                  <React.Fragment key={`nav-section-walk-${sIdx}`}>
                    <Polyline
                      path={sec.path}
                      strokeWeight={8}
                      strokeColor="#93c5fd"
                      strokeOpacity={0.5}
                      strokeStyle="solid"
                      zIndex={15}
                    />
                    <Polyline
                      path={sec.path}
                      strokeWeight={5}
                      strokeColor="#2563eb"
                      strokeOpacity={0.95}
                      strokeStyle="shortdash"
                      zIndex={16}
                    />
                  </React.Fragment>
                );
              } else {
                // 대중교통(지하철/버스) 및 차량 구간: 흰색 윤곽선 + 호선/버스/차량 전용 색상의 굵은 실선
                const lineColor = sec.color || (navMode === 'car' ? "#ef4444" : "#8b5cf6");
                return (
                  <React.Fragment key={`nav-section-transit-${sIdx}`}>
                    <Polyline
                      path={sec.path}
                      strokeWeight={10}
                      strokeColor="#ffffff"
                      strokeOpacity={0.95}
                      strokeStyle="solid"
                      zIndex={20}
                    />
                    <Polyline
                      path={sec.path}
                      strokeWeight={7}
                      strokeColor={lineColor}
                      strokeOpacity={1.0}
                      strokeStyle="solid"
                      zIndex={21}
                    />
                  </React.Fragment>
                );
              }
            })
          ) : (
            navRoute.length > 0 && (
              <React.Fragment>
                {navMode === 'walk' ? (
                  <>
                    <Polyline
                      path={navRoute}
                      strokeWeight={8}
                      strokeColor="#93c5fd"
                      strokeOpacity={0.5}
                      strokeStyle="solid"
                      zIndex={15}
                    />
                    <Polyline
                      path={navRoute}
                      strokeWeight={5}
                      strokeColor="#2563eb"
                      strokeOpacity={0.95}
                      strokeStyle="shortdash"
                      zIndex={16}
                    />
                  </>
                ) : (
                  <>
                    <Polyline
                      path={navRoute}
                      strokeWeight={10}
                      strokeColor="#ffffff"
                      strokeOpacity={0.95}
                      strokeStyle="solid"
                      zIndex={20}
                    />
                    <Polyline
                      path={navRoute}
                      strokeWeight={7}
                      strokeColor={navMode === 'car' ? "#ef4444" : "#8b5cf6"}
                      strokeOpacity={1.0}
                      strokeStyle="solid"
                      zIndex={21}
                    />
                  </>
                )}
              </React.Fragment>
            )
          )}

          {/* 주변 시설 마커들 (즐겨찾기 탭 시 즐겨찾기 목록, 그 외엔 검색 결과) */}
          {markersToRender.map((result) => {
            const isSelected = selectedPlace?.id === result.id;
            const is100m = result.isWithin100m;
            if (isNavigating && !isSelected) return null;

            return (
              <div key={result.id}>
                <CustomOverlayMap
                  position={{ lat: result.lat, lng: result.lon }}
                  yAnchor={1}
                  zIndex={isSelected ? 1000 : is100m ? 900 : 1}
                >
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                    {/* 100m 이내 시설일 때 지도 위 상단 강조 배지 */}
                    {is100m && !isNavigating && (
                      <div className="marker-proximity-badge">
                        <span className="ping-dot" />
                        <span>
                          {isTargetDestination ? '도착지 100m 이내' : '100m 이내'} ({result.calculatedDistance}m)
                        </span>
                      </div>
                    )}

                    {/* 100m 레이더 펄스 링 */}
                    {is100m && (
                      <div className="proximity-radar-ring" />
                    )}

                    {/* 핀 본체 */}
                    <div
                      className={isSelected ? 'selected-pin' : ''}
                      style={{
                        backgroundColor: result.color || (result.type === 'restroom' ? '#059669' : '#2563eb'),
                        width: is100m ? '40px' : '36px',
                        height: is100m ? '40px' : '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50% 50% 50% 0',
                        transform: 'rotate(-45deg)',
                        border: is100m ? '3px solid #bfdbfe' : isSelected ? '3px solid #ffe4e6' : '3px solid #fff',
                        boxShadow: is100m ? '0 0 14px rgba(37, 99, 235, 0.45)' : '2px 2px 6px rgba(0,0,0,0.3)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleSelectLocation(result)}
                    >
                      <div style={{ width: '14px', height: '14px', backgroundColor: '#fff', borderRadius: '50%', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
                    </div>
                  </div>
                </CustomOverlayMap>

                {/* 선택 시 나타나는 정보 팝업 */}
                {!isNavigating && isSelected && (
                  <CustomOverlayMap
                    position={{ lat: result.lat, lng: result.lon }}
                    yAnchor={1}
                    xAnchor={0.5}
                    zIndex={1002}
                  >
                    <div style={{
                      backgroundColor: 'white',
                      padding: '16px',
                      borderRadius: '12px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                      transform: is100m ? 'translateY(-68px)' : 'translateY(-48px)',
                      ...styles.popupContent
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          {is100m && (
                            <div style={styles.popup100mTag}>
                              <span className="ping-dot" style={{ width: '5px', height: '5px' }} />
                              <span>
                                {isTargetDestination ? '도착지 기준 100m 이내' : '100m 초근접 시설'} ({result.calculatedDistance}m)
                              </span>
                            </div>
                          )}
                          <h3 style={{ margin: '4px 0 8px 0', fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>{result.name}</h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={(e) => toggleFavorite(result, e)}
                            className="place-fav-btn"
                            style={{ padding: '4px', cursor: 'pointer' }}
                            title={isFavorite(result.id) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                          >
                            <IconStar filled={isFavorite(result.id)} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedPlace(null); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: 0, color: '#94a3b8' }}>×</button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '13px', marginBottom: '12px', fontWeight: '700', color: result.color }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: result.color, marginRight: '8px' }}></div>
                        {result.status}
                      </div>

                      <button
                        onClick={(e) => startInAppNavigation(result, e, 'walk')}
                        style={styles.navButtonLarge}
                      >
                        <IconNav /> 길안내 시작
                      </button>
                    </div>
                  </CustomOverlayMap>
                )}
              </div>
            );
          })}
        </Map>

        {/* 관리자 로그인 플로팅 버튼 */}
        <button
          onClick={() => navigate('/login')}
          className="admin-login-fab"
          style={{
            position: 'absolute',
            zIndex: 1000,
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#0f172a',
            color: '#fff',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s'
          }}
          title="관리자 로그인"
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </button>
      </div>
    </div>
  );
}

const styles = {
  searchFormCard: {
    backgroundColor: '#fff',
    borderRadius: '14px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  inputSection: {
    padding: '10px 14px 8px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '800',
    color: '#0f172a',
  },
  originDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    backgroundColor: '#059669',
    border: '2px solid #a7f3d0',
  },
  mapLocationIconButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 9px',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '800',
    transition: 'all 0.15s ease',
  },
  activeGpsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '8px',
    padding: '6px 10px',
  },
  activeGpsBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#166534',
  },
  gpsRefreshBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    color: '#166534',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
  },
  textInputRow: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    padding: '2px 8px',
  },
  modernInput: {
    flex: 1,
    padding: '7px 4px',
    fontSize: '13px',
    border: 'none',
    backgroundColor: 'transparent',
    outline: 'none',
    color: '#0f172a',
    fontWeight: '600',
    WebkitAppearance: 'none',
  },
  inputClearBtn: {
    padding: '0 6px',
    fontSize: '16px',
    color: '#94a3b8',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    lineHeight: 1,
  },
  inputDivider: {
    height: '1px',
    backgroundColor: '#f1f5f9',
    margin: '0 14px',
  },
  formBottomBar: {
    display: 'flex',
    borderTop: '1px solid #f1f5f9',
    backgroundColor: '#f8fafc',
  },
  swapBtn: {
    flex: '0 0 100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '10px 0',
    backgroundColor: 'transparent',
    border: 'none',
    borderRight: '1px solid #e2e8f0',
    color: '#475569',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  searchSubmitBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 0',
    backgroundColor: '#0f172a',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  dropdownHeader: {
    padding: '8px 14px',
    fontSize: '11px',
    fontWeight: '800',
    color: '#64748b',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #f1f5f9',
  },
  suggestionIconBox: {
    marginTop: '2px',
  },
  tabContainer: {
    display: 'flex',
    gap: '6px',
  },
  tabButton: {
    flex: 1,
    padding: '9px 0',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
    color: '#fff',
  },
  routeSummaryCard: {
    margin: '0 20px 10px',
    padding: '12px 14px',
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
  },
  routeBadge: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #bfdbfe',
  },
  routeMeta: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#0f172a',
  },
  routePoints: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '6px',
  },
  routePointRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
  },
  routePointOriginDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#059669',
    flexShrink: 0,
  },
  routePointDestDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    flexShrink: 0,
  },
  routePointLabel: {
    color: '#64748b',
    fontSize: '11px',
  },
  routePointText: {
    color: '#0f172a',
    fontWeight: '700',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sidebarProximitySummary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    margin: '0 20px 8px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '10px',
  },
  summaryZoomBtn: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  resultsArea: {
    flex: 1,
    overflowY: 'auto',
  },
  resultItem: {
    padding: '15px 20px',
    borderBottom: '1px solid #f1f5f9',
    borderLeft: '4px solid transparent',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  resultItem100m: {
    backgroundColor: '#f8fafc',
    borderLeft: '4px solid #2563eb',
  },
  resultItemSelected: {
    backgroundColor: '#eff6ff',
    borderLeft: '4px solid #1d4ed8',
  },
  within100mBadgeContainer: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '12px',
    padding: '2px 8px',
    marginBottom: '8px',
  },
  within100mText: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#1d4ed8',
  },
  within100mMeters: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#2563eb',
  },
  categoryTag: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid',
  },
  resultName: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#0f172a',
  },
  distanceText: {
    fontSize: '13px',
    color: '#64748b',
    display: 'block',
    marginTop: '4px',
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#fff',
    whiteSpace: 'nowrap',
  },
  iotSummary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
  navButtonSmall: {
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    border: '1px solid #e2e8f0',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.15s',
  },
  navButtonLarge: {
    width: '100%',
    backgroundColor: '#0f172a',
    color: '#fff',
    border: 'none',
    padding: '12px 0',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.15s',
  },
  emptyText: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: '60px',
    fontSize: '14px',
  },
  popupContent: {
    minWidth: '220px',
  },
  popup100mTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    padding: '2px 6px',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  userLocationDot: {
    width: '18px',
    height: '18px',
    backgroundColor: '#2563eb',
    borderRadius: '50%',
    border: '3px solid #fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    position: 'relative',
    transform: 'translate(-50%, -50%)'
  },
  userLocationPulse: {
    content: '""',
    position: 'absolute',
    top: '-8px',
    left: '-8px',
    right: '-8px',
    bottom: '-8px',
    backgroundColor: 'rgba(37, 99, 235, 0.3)',
    borderRadius: '50%',
    animation: 'gps-pulse 2s infinite',
    zIndex: -1
  },
  destinationPinContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transform: 'translateY(-12px)',
  },
  destinationTooltip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#0f172a',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: '20px',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.35)',
    border: '1.5px solid #ef4444',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
  },
  destinationBadge: {
    backgroundColor: '#ef4444',
    color: '#fff',
    fontSize: '10px',
    fontWeight: '800',
    padding: '1px 5px',
    borderRadius: '4px',
  },
  destinationName: {
    fontSize: '12px',
    fontWeight: '700',
  },
  destinationPinIcon: {
    width: '28px',
    height: '28px',
    backgroundColor: '#ef4444',
    borderRadius: '50% 50% 50% 0',
    transform: 'rotate(-45deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #fff',
    boxShadow: '0 3px 8px rgba(239, 68, 68, 0.4)',
  },
  destinationPinInner: {
    width: '10px',
    height: '10px',
    backgroundColor: '#fff',
    borderRadius: '50%',
  },
  originPinContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transform: 'translateY(-12px)',
  },
  originTooltip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#0f172a',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: '20px',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.35)',
    border: '1.5px solid #059669',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
  },
  originBadge: {
    backgroundColor: '#059669',
    color: '#fff',
    fontSize: '10px',
    fontWeight: '800',
    padding: '1px 5px',
    borderRadius: '4px',
  },
  originName: {
    fontSize: '12px',
    fontWeight: '700',
  },
  originPinIcon: {
    width: '26px',
    height: '26px',
    backgroundColor: '#059669',
    borderRadius: '50% 50% 50% 0',
    transform: 'rotate(-45deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #fff',
    boxShadow: '0 3px 8px rgba(5, 150, 105, 0.4)',
  },
  originPinInner: {
    width: '8px',
    height: '8px',
    backgroundColor: '#fff',
    borderRadius: '50%',
  },
  radiusBadge: {
    padding: '2px 8px',
    backgroundColor: '#0f172a',
    color: '#93c5fd',
    fontSize: '11px',
    fontWeight: '700',
    borderRadius: '10px',
    border: '1px solid #3b82f6',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  segmentButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 0',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  segmentActive: {
    backgroundColor: '#fff',
    color: '#0f172a',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  mapControlBtn: {
    width: '46px',
    height: '46px',
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#0f172a',
    transition: 'all 0.15s ease',
    padding: 0,
  },
  bannerIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #bfdbfe',
    flexShrink: 0,
  },
  bannerDistanceTag: {
    fontSize: '11px',
    fontWeight: '800',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  bannerBtnSecondary: {
    padding: '7px 12px',
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  bannerBtnPrimary: {
    padding: '7px 14px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
  },
  bannerCloseBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    lineHeight: 1,
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px',
  }
};
