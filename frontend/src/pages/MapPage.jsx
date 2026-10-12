import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, CustomOverlayMap, Polyline } from 'react-kakao-maps-sdk';
import '../App.css'; 

import { searchKakaoPlaces, fetchRoute } from '../api/searchApi';
import { fetchBackendZones } from '../api/backendApi';

// 가상의 IoT 센서 데이터 생성 함수
const attachIoTSensorData = (places, category) => {
  return places.map(place => {
    if (category === 'restroom') {
      const isClean = Math.random() > 0.3;
      return {
        ...place,
        type: 'restroom',
        temp: Math.floor(Math.random() * 10) + 18,
        humidity: Math.floor(Math.random() * 30) + 40,
        gas: isClean ? '정상 (가스 감지 안됨)' : '경고 (악취 감지)',
        status: isClean ? '쾌적' : '청소 요망',
        color: isClean ? '#10b981' : '#ef4444' // 세련된 그린/레드
      };
    } else {
      const isCrowded = Math.random() > 0.5;
      return {
        ...place,
        type: 'smoking',
        airQuality: isCrowded ? '나쁨 (연기 많음)' : '보통',
        people: Math.floor(Math.random() * 10),
        status: isCrowded ? '혼잡' : '여유',
        color: isCrowded ? '#f59e0b' : '#3b82f6' 
      };
    }
  });
};

// 거리 단위 포맷팅 함수
const formatDistance = (meters) => {
  if (!meters) return '0m';
  const m = Math.round(meters);
  if (m >= 1000) {
    return (m / 1000).toFixed(1) + 'km';
  }
  return m + 'm';
};


const IconNav = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'text-bottom' }}><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>;
const IconGps = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
const IconWalk = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 4v7l-4 4"/><path d="M12 11l4 4"/><path d="M12 11v11"/></svg>;
const IconCar = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="8" rx="2"/><path d="M3 11l3-6h12l3 6"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>;
const IconBus = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 19v2"/></svg>;

export default function MapPage() {
  const navigate = useNavigate();
  const [position, setPosition] = useState({ lat: 37.5665, lng: 126.9780 }); 
  const [userLocation, setUserLocation] = useState(null); 
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [category, setCategory] = useState('smoking'); 
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const [isNavigating, setIsNavigating] = useState(false);
  const [navRoute, setNavRoute] = useState([]);
  const [navInfo, setNavInfo] = useState(null);
  const [navMode, setNavMode] = useState('walk');

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
          performSearch('', lat, lon, category);
        },
        (err) => {
          console.error("GPS Error:", err);
          setIsLoading(false);
          alert("위치 정보를 가져올 수 없거나 시간이 초과되었습니다.");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
    } else {
      setIsLoading(false);
      alert("GPS를 지원하지 않는 브라우저입니다.");
    }
  };

  const performSearch = async (queryText, lat, lon, currentCategory) => {
    setIsLoading(true);
    setSelectedPlace(null);
    setIsMobileSheetOpen(true);
    
    try {
      // 1. 우리 백엔드(Spring Boot / ngrok)에서 실제 IoT 센서가 설치된 구역 목록 및 실시간 센서 데이터 조회
      const backendZones = await fetchBackendZones(currentCategory, lat, lon);

      // 2. 카카오 장소 검색 API 호출
      const keyword = queryText ? `${queryText} ${currentCategory === 'restroom' ? '화장실' : '흡연구역'}` : (currentCategory === 'restroom' ? '화장실' : '흡연구역');
      let kakaoPlacesWithSensors = [];
      try {
        const realPlaces = await searchKakaoPlaces(keyword, lat, lon);
        if (realPlaces && realPlaces.length > 0) {
          kakaoPlacesWithSensors = attachIoTSensorData(realPlaces.slice(0, 10), currentCategory);
        }
      } catch (kErr) {
        console.warn("카카오 장소 검색 생략:", kErr);
      }

      // 3. 백엔드 IoT 구역을 우선 배치하고 카카오 검색 결과와 결합
      const combinedResults = [...backendZones, ...kakaoPlacesWithSensors];

      if (combinedResults.length > 0) {
        if (queryText) {
          setPosition({ lat: combinedResults[0].lat, lng: combinedResults[0].lon });
        }
        setSearchResults(combinedResults);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error("데이터 검색 중 오류:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      performSearch('', position.lat, position.lng, category);
      return;
    }
    performSearch(searchQuery, null, null, category);
  };

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    setSearchResults([]);
    setSelectedPlace(null);
    endNavigation();
    setIsMobileSheetOpen(true);
    setTimeout(() => {
      performSearch(searchQuery, position.lat, position.lng, newCat);
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

  const startInAppNavigation = async (place, e, mode = 'walk') => {
    if (e) e.stopPropagation();
    if (!userLocation) {
      alert("내 위치(GPS) 정보를 먼저 활성화해주세요.");
      handleGpsSearch();
      return;
    }

    setIsLoading(true);
    setNavMode(mode);
    setSelectedPlace(place);
    
    const routeData = await fetchRoute(userLocation.lat, userLocation.lng, place.lat, place.lon, mode);
    
    if (routeData) {
      setNavRoute(routeData.path);
      setNavInfo({ distance: routeData.distance, duration: routeData.duration });
      setIsNavigating(true);
      
      setIsSidebarOpen(true);
      setIsMobileSheetOpen(true);
      
      // 안내 시작 시 맵 중심을 사용자(출발지) 위치로 변경
      setPosition({
        lat: userLocation.lat,
        lng: userLocation.lng
      });
    } else {
      alert(`${mode === 'car' ? '자동차' : mode === 'transit' ? '대중교통' : '도보'} 경로를 찾을 수 없습니다.`);
    }
    setIsLoading(false);
  };

  const endNavigation = () => {
    setIsNavigating(false);
    setNavRoute([]);
    setNavInfo(null);
  };

  // 도착 예정 시간 계산 (현재 시간 + 소요 분)
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

  // 시간 포맷팅 (60분 이상일 경우 시간/분으로, 24시간 이상일 경우 일/시간/분으로 표시)
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

  return (
    <div className="layout-container">
      
      {/* 일반 검색일 때만 띄우는 상단 검색바 */}
      {!isNavigating && (
        <div className="search-bar-container" style={{ marginLeft: isSidebarOpen ? '0' : '-400px' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', width: '100%', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
            <button 
              type="button" 
              onClick={handleGpsSearch}
              style={{ padding: '0 16px', backgroundColor: '#fff', border: 'none', borderRight: '1px solid #f1f5f9', cursor: 'pointer', color: '#1e293b' }}
              title="내 위치 주변 검색"
            >
              <IconGps />
            </button>
            <input 
              type="text" 
              placeholder={`${category === 'restroom' ? '화장실' : '흡연장'} 주변 장소 검색`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.modernInput}
              onFocus={() => setIsMobileSheetOpen(false)}
            />
            <button type="submit" style={styles.modernSearchButton}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </button>
          </form>
        </div>
      )}

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

        {isNavigating && selectedPlace ? (
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
                {selectedPlace.name}
              </h2>
            </div>

            {/* 교통수단 세그먼트 컨트롤 */}
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '6px', margin: '20px 20px 0', borderRadius: '12px' }}>
              <button 
                style={{...styles.segmentButton, ...(navMode === 'walk' ? styles.segmentActive : {})}}
                onClick={() => startInAppNavigation(selectedPlace, null, 'walk')}
              >
                <IconWalk /> 도보
              </button>
              <button 
                style={{...styles.segmentButton, ...(navMode === 'car' ? styles.segmentActive : {})}}
                onClick={() => startInAppNavigation(selectedPlace, null, 'car')}
              >
                <IconCar /> 자동차
              </button>
              <button 
                style={{...styles.segmentButton, ...(navMode === 'transit' ? styles.segmentActive : {})}}
                onClick={() => startInAppNavigation(selectedPlace, null, 'transit')}
              >
                <IconBus /> 대중교통
              </button>
            </div>

            {/* 핵심 경로 정보 */}
            <div style={{ padding: '32px 24px', flex: 1 }}>
              {isLoading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', paddingTop: '40px' }}>경로 탐색 중...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '8px' }}>
                    {formatDuration(navInfo?.duration || 0)}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '16px', color: '#64748b', fontWeight: '500', marginBottom: '32px' }}>
                    <span>{formatDistance(navInfo?.distance)}</span>
                    <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
                    <span style={{ color: '#3b82f6' }}>{getArrivalTime(navInfo?.duration)}</span>
                  </div>
                  
                  {/* 세련된 실시간 IoT 정보 블록 */}
                  <div style={{ 
                    backgroundColor: '#f8fafc', 
                    borderRadius: '16px', 
                    padding: '20px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '16px' }}>
                      현장 실시간 상태 (IoT)
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {/* 태그 형태의 세련된 UI */}
                      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: selectedPlace.color, marginRight: '8px' }}></div>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>{selectedPlace.status}</span>
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
          /* ---------------- 일반 검색 모드 UI ---------------- */
          <>
            <div style={{ ...styles.tabContainer, padding: '16px 24px' }}>
              <button 
                style={{...styles.tabButton, ...(category === 'restroom' ? styles.tabActive : {})}}
                onClick={() => handleCategoryChange('restroom')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M7 3h10v3H7z"></path><path d="M7 6v10c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V6"></path><path d="M9 18v3"></path><path d="M15 18v3"></path></svg>
                  화장실
                </div>
              </button>
              <button 
                style={{...styles.tabButton, ...(category === 'smoking' ? styles.tabActive : {})}}
                onClick={() => handleCategoryChange('smoking')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><line x1="18" y1="16" x2="3" y2="16"></line><line x1="21" y1="16" x2="21.01" y2="16"></line><path d="M7 12c0-2 2-2 2-4"></path><path d="M11 12c0-2 2-2 2-4"></path><path d="M15 12c0-2 2-2 2-4"></path></svg>
                  흡연장
                </div>
              </button>
            </div>

            <div style={styles.resultsArea}>
              {isLoading ? (
                <div style={styles.emptyText}>로딩 중...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <div 
                    key={result.id} 
                    style={{
                      ...styles.resultItem,
                      ...(selectedPlace?.id === result.id ? styles.resultItemSelected : {})
                    }}
                    onClick={() => handleSelectLocation(result)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <strong style={styles.resultName}>{result.name}</strong>
                        {result.distance && <span style={styles.distanceText}>내 위치에서 {formatDistance(result.distance)}</span>}
                      </div>
                      <span style={{...styles.statusBadge, backgroundColor: result.color}}>
                        {result.status}
                      </span>
                    </div>
                    
                    <div style={styles.iotSummary}>
                      <button 
                        onClick={(e) => startInAppNavigation(result, e, 'walk')}
                        style={styles.navButtonSmall}
                      >
                        <IconNav /> 길안내
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={styles.emptyText}>주변에 등록된 시설이 없습니다.</div>
              )}
            </div>
          </>
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

        <Map
          center={position}
          style={{ width: '100%', height: '100%' }}
          level={isNavigating ? 3 : 4} 
        >
          {userLocation && (
            <CustomOverlayMap position={userLocation} zIndex={1001}>
              <div style={styles.userLocationDot}>
                <div style={styles.userLocationPulse}></div>
              </div>
            </CustomOverlayMap>
          )}

          {isNavigating && navRoute.length > 0 && (
             <Polyline
                path={navRoute}
                strokeWeight={6} 
                strokeColor={navMode === 'walk' ? "#3b82f6" : navMode === 'car' ? "#ef4444" : "#8b5cf6"} 
                strokeOpacity={0.8}
                strokeStyle={navMode === 'transit' ? "shortdash" : "solid"}
             />
          )}

          {!isNavigating && userLocation && selectedPlace && (
             <Polyline
                path={[
                  { lat: userLocation.lat, lng: userLocation.lng },
                  { lat: selectedPlace.lat, lng: selectedPlace.lon }
                ]}
                strokeWeight={3}
                strokeColor={"#3b82f6"}
                strokeOpacity={0.4}
                strokeStyle={"shortdash"}
             />
          )}

          {searchResults.map((result) => {
            const isSelected = selectedPlace?.id === result.id;
            if (isNavigating && !isSelected) return null;
            
            return (
              <div key={result.id}>
                <CustomOverlayMap 
                  position={{ lat: result.lat, lng: result.lon }}
                  yAnchor={1} 
                  zIndex={isSelected ? 999 : 1}
                >
                  <div 
                    className={isSelected ? 'selected-pin' : ''}
                    style={{
                      backgroundColor: result.color,
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50% 50% 50% 0',
                      transform: 'rotate(-45deg)',
                      border: isSelected ? '3px solid #ffe4e6' : '3px solid #fff',
                      boxShadow: '2px 2px 6px rgba(0,0,0,0.3)',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleSelectLocation(result)}
                  >
                    <div style={{ width: '14px', height: '14px', backgroundColor: '#fff', borderRadius: '50%', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
                  </div>
                </CustomOverlayMap>

                {!isNavigating && isSelected && (
                  <CustomOverlayMap 
                    position={{ lat: result.lat, lng: result.lon }}
                    yAnchor={1}
                    xAnchor={0.5}
                    zIndex={1000}
                  >
                    <div style={{
                      backgroundColor: 'white',
                      padding: '16px',
                      borderRadius: '12px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                      transform: 'translateY(-48px)',
                      ...styles.popupContent
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#0f172a' }}>{result.name}</h3>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedPlace(null); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: 0, color: '#94a3b8' }}>×</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '14px', marginBottom: '12px', fontWeight: 'bold', color: result.color }}>
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
  tabContainer: {
    display: 'flex',
    padding: '0 0 8px 0',
    gap: '8px',
  },
  tabButton: {
    flex: 1,
    padding: '10px 0',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#fff',
  },
  modernInput: {
    flex: 1,
    padding: '14px 10px',
    fontSize: '14px',
    border: 'none',
    backgroundColor: '#fff',
    outline: 'none',
    color: '#0f172a',
    fontWeight: '500',
    WebkitAppearance: 'none',
  },
  modernSearchButton: {
    padding: '0 18px',
    backgroundColor: '#2563eb', 
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsArea: {
    flex: 1,
    overflowY: 'auto',
  },
  resultItem: {
    padding: '16px 24px',
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  resultItemSelected: {
    backgroundColor: '#f8fafc',
    borderLeft: '4px solid #2563eb',
    paddingLeft: '20px',
  },
  resultName: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#0f172a',
    display: 'block',
  },
  distanceText: {
    fontSize: '13px',
    color: '#64748b',
    display: 'block',
    marginTop: '6px',
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '800',
    color: '#fff',
    whiteSpace: 'nowrap',
  },
  iotSummary: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    fontSize: '13px',
    color: '#64748b',
    marginTop: '12px',
    fontWeight: '500'
  },
  iotData: {
    display: 'flex',
    alignItems: 'center',
  },
  navButtonSmall: {
    marginLeft: 'auto',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    border: '1px solid #bfdbfe',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  navButtonLarge: {
    width: '100%',
    backgroundColor: '#2563eb',
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
    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
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
  userLocationDot: {
    width: '20px',
    height: '20px',
    backgroundColor: '#2563eb',
    borderRadius: '50%',
    border: '4px solid #fff',
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
  }
};
