import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, CustomOverlayMap } from 'react-kakao-maps-sdk';
import { searchKakaoPlaces } from '../api/searchApi';

// 가상의 IoT 센서 데이터 생성 함수 (관리자용 상세 데이터 추가)
const attachIoTSensorData = (places, category) => {
  return places.map(place => {
    // 최근 점검 시간 랜덤 생성
    const hoursAgo = Math.floor(Math.random() * 48) + 1;
    const inspectDate = new Date();
    inspectDate.setHours(inspectDate.getHours() - hoursAgo);
    const lastInspected = `${inspectDate.getFullYear()}-${String(inspectDate.getMonth()+1).padStart(2, '0')}-${String(inspectDate.getDate()).padStart(2, '0')} ${String(inspectDate.getHours()).padStart(2, '0')}:${String(inspectDate.getMinutes()).padStart(2, '0')}`;

    if (category === 'restroom') {
      const isClean = Math.random() > 0.3;
      return {
        ...place,
        type: 'restroom',
        temp: Math.floor(Math.random() * 10) + 18,
        humidity: Math.floor(Math.random() * 30) + 40,
        gas: isClean ? '정상' : '악취 경고',
        status: isClean ? '쾌적' : '청소 요망',
        color: isClean ? '#10b981' : '#ef4444',
        lastInspected: lastInspected,
        maintenanceLog: isClean ? '특이사항 없음. 비품(휴지, 비누) 보충 완료 및 청결 상태 양호.' : '가스 센서 기준치 초과 감지. 긴급 청소 및 환기구 필터 교체 요망.',
        manager: '김철수 (위생관리팀)'
      };
    } else {
      const isCrowded = Math.random() > 0.5;
      return {
        ...place,
        type: 'smoking',
        airQuality: isCrowded ? '나쁨' : '보통',
        people: Math.floor(Math.random() * 10),
        status: isCrowded ? '혼잡' : '여유',
        color: isCrowded ? '#f59e0b' : '#3b82f6',
        lastInspected: lastInspected,
        maintenanceLog: isCrowded ? '일시적 인원 밀집으로 공기질 저하. 제연기 최대 출력 가동 중. 재떨이 비움 요망.' : '제연기 및 환풍 시설 정상 가동 중. 특이사항 없음.',
        manager: '이영희 (환경관리팀)'
      };
    }
  });
};

// 아이콘들
const IconDashboard = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', marginTop: '-2px', verticalAlign: 'middle' }}><rect x="3" y="3" width="7" height="9" rx="1"></rect><rect x="14" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="12" width="7" height="9" rx="1"></rect><rect x="3" y="16" width="7" height="5" rx="1"></rect></svg>;
const IconRestroom = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', marginTop: '-2px', verticalAlign: 'middle' }}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path></svg>;
const IconSmoking = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', marginTop: '-2px', verticalAlign: 'middle' }}><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path></svg>;
const IconClose = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;

export default function AdminPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [adminPlaces, setAdminPlaces] = useState([]);
  const [mapCenter, setMapCenter] = useState({ lat: 37.5665, lng: 126.9780 });
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 마커 클릭 시 모달창 상태
  const [selectedAdminPlace, setSelectedAdminPlace] = useState(null);

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isAdminLoggedIn');
    if (!isLoggedIn) {
      alert('로그인이 필요한 페이지입니다.');
      navigate('/login');
    } else {
      loadDefaultAdminData();
    }
  }, [navigate]);

  const loadDefaultAdminData = () => {
    setIsLoading(true);
    setSelectedAdminPlace(null);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setMapCenter({ lat, lng: lon });
          fetchBothCategories(lat, lon);
        },
        () => {
          fetchBothCategories(37.5665, 126.9780);
        },
        { enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 }
      );
    } else {
      fetchBothCategories(37.5665, 126.9780);
    }
  };

  const fetchBothCategories = async (lat, lon, customKeyword = '') => {
    setIsLoading(true);
    setSelectedAdminPlace(null);
    try {
      const keyword1 = customKeyword ? `${customKeyword} 화장실` : '화장실';
      const keyword2 = customKeyword ? `${customKeyword} 흡연구역` : '흡연구역';
      
      const [restrooms, smokings] = await Promise.all([
        searchKakaoPlaces(keyword1, lat, lon, 1),
        searchKakaoPlaces(keyword2, lat, lon, 1)
      ]);
      
      const rData = attachIoTSensorData(restrooms, 'restroom');
      const sData = attachIoTSensorData(smokings, 'smoking');
      
      const combined = [...rData, ...sData];
      setAdminPlaces(combined);
      
      if (combined.length > 0 && customKeyword) {
        setMapCenter({ lat: combined[0].lat, lng: combined[0].lon });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminSearch = (e) => {
    e.preventDefault();
    if (searchKeyword.trim()) {
      fetchBothCategories(null, null, searchKeyword);
    } else {
      loadDefaultAdminData();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('isAdminLoggedIn');
    navigate('/');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            <div style={styles.grid}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>현재 반경 내 관리 시설</h3>
                <div style={styles.statNumber}>{adminPlaces.length > 0 ? adminPlaces.length : 0}<span style={styles.statUnit}>개소</span></div>
              </div>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>현재 경고 (청소/환기 요망)</h3>
                <div style={{...styles.statNumber, color: '#ef4444'}}>
                  {adminPlaces.filter(p => p.status === '청소 요망' || p.status === '혼잡').length}
                  <span style={styles.statUnit}>건</span>
                </div>
              </div>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>일일 평균 방문</h3>
                <div style={styles.statNumber}>8,204<span style={styles.statUnit}>명</span></div>
              </div>
            </div>

            <div style={{ ...styles.card, flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>실시간 통합 관제 맵</h3>
                
                <form onSubmit={handleAdminSearch} style={{ display: 'flex' }}>
                  <input 
                    type="text" 
                    placeholder="지역 검색 (예: 강남역)" 
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px 0 0 6px', outline: 'none', fontSize: '13px' }}
                  />
                  <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '0 6px 6px 0', cursor: 'pointer', fontSize: '13px' }}>
                    검색
                  </button>
                </form>
              </div>
              
              <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: '400px', backgroundColor: '#e2e8f0' }}>
                {isLoading && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#334155' }}>
                    데이터 동기화 중...
                  </div>
                )}
                
                {/* 우측 상세 정보 사이드 패널 (마커 클릭 시 등장) */}
                {selectedAdminPlace && (
                  <div style={styles.infoPanel}>
                    <div style={styles.infoPanelHeader}>
                      <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>시설 상세 정보</h4>
                      <button onClick={() => setSelectedAdminPlace(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                        <IconClose />
                      </button>
                    </div>
                    
                    <div style={styles.infoPanelBody}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', backgroundColor: selectedAdminPlace.color, color: '#fff', marginRight: '8px' }}>
                          {selectedAdminPlace.type === 'restroom' ? '화장실' : '흡연장'}
                        </span>
                        <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>{selectedAdminPlace.name}</h3>
                      </div>
                      
                      <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b' }}>{selectedAdminPlace.address}</p>
                      
                      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '12px' }}>실시간 IoT 상태</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          {selectedAdminPlace.type === 'restroom' ? (
                            <>
                              <div style={styles.infoStatBox}><div style={styles.infoStatLabel}>온도</div><div style={styles.infoStatValue}>{selectedAdminPlace.temp}°C</div></div>
                              <div style={styles.infoStatBox}><div style={styles.infoStatLabel}>습도</div><div style={styles.infoStatValue}>{selectedAdminPlace.humidity}%</div></div>
                              <div style={{...styles.infoStatBox, gridColumn: 'span 2'}}><div style={styles.infoStatLabel}>가스/악취 센서</div><div style={{...styles.infoStatValue, color: selectedAdminPlace.gas === '정상' ? '#10b981' : '#ef4444'}}>{selectedAdminPlace.gas}</div></div>
                            </>
                          ) : (
                            <>
                              <div style={styles.infoStatBox}><div style={styles.infoStatLabel}>이용 인원</div><div style={styles.infoStatValue}>{selectedAdminPlace.people}명</div></div>
                              <div style={styles.infoStatBox}><div style={styles.infoStatLabel}>공기질</div><div style={{...styles.infoStatValue, color: selectedAdminPlace.airQuality === '보통' ? '#10b981' : '#ef4444'}}>{selectedAdminPlace.airQuality}</div></div>
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>최근 점검 기록</div>
                        <div style={{ padding: '12px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                          <div style={{ fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}><strong>일시:</strong> {selectedAdminPlace.lastInspected}</div>
                          <div style={{ fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}><strong>담당자:</strong> {selectedAdminPlace.manager}</div>
                          <div style={{ fontSize: '13px', color: '#0f172a', marginTop: '8px', padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', lineHeight: '1.4' }}>
                            {selectedAdminPlace.maintenanceLog}
                          </div>
                        </div>
                      </div>
                      
                      <button style={{ width: '100%', padding: '14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                        점검 인력 호출
                      </button>
                    </div>
                  </div>
                )}

                <Map center={mapCenter} isPanto={true} style={{ width: '100%', height: '100%' }} level={5}>
                  {adminPlaces.map(place => {
                    const isSelected = selectedAdminPlace?.id === place.id;
                    return (
                      <CustomOverlayMap key={place.id} position={{ lat: place.lat, lng: place.lon }} yAnchor={1}>
                        <div 
                          onClick={() => setSelectedAdminPlace(place)}
                          style={{
                            backgroundColor: place.color,
                            width: isSelected ? '32px' : '24px', 
                            height: isSelected ? '32px' : '24px',
                            borderRadius: '50%',
                            border: isSelected ? '3px solid #0f172a' : '2px solid #fff',
                            boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: isSelected ? '14px' : '12px', fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            zIndex: isSelected ? 1000 : 1
                          }}
                        >
                          {place.type === 'restroom' ? 'W' : 'S'}
                        </div>
                      </CustomOverlayMap>
                    );
                  })}
                </Map>
              </div>
            </div>
          </div>
        );
      case 'restroom':
        return (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>화장실 상세 관제 시스템</h3>
            <p style={{color: '#64748b'}}>현재 IoT 센서 기반 악취 및 청결도 실시간 모니터링 중입니다.</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>시설명</th>
                  <th style={styles.th}>최근 점검일시</th>
                  <th style={styles.th}>온도/습도</th>
                  <th style={styles.th}>가스 센서</th>
                  <th style={styles.th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {adminPlaces.filter(p => p.type === 'restroom').map(place => (
                  <tr key={place.id}>
                    <td style={styles.td}><strong>{place.name}</strong></td>
                    <td style={{...styles.td, fontSize: '13px', color: '#64748b'}}>{place.lastInspected}</td>
                    <td style={styles.td}>{place.temp}°C / {place.humidity}%</td>
                    <td style={styles.td}>{place.gas}</td>
                    <td style={styles.td}>
                      <span style={place.status === '쾌적' ? styles.badgeSuccess : styles.badgeDanger}>
                        {place.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {adminPlaces.filter(p => p.type === 'restroom').length === 0 && (
                  <tr><td colSpan="5" style={{...styles.td, textAlign: 'center'}}>데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      case 'smoking':
        return (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>흡연장 상세 관제 시스템</h3>
            <p style={{color: '#64748b'}}>현재 인원 밀집도 및 공기질 실시간 모니터링 중입니다.</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>시설명</th>
                  <th style={styles.th}>최근 점검일시</th>
                  <th style={styles.th}>이용 인원</th>
                  <th style={styles.th}>공기질 센서</th>
                  <th style={styles.th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {adminPlaces.filter(p => p.type === 'smoking').map(place => (
                  <tr key={place.id}>
                    <td style={styles.td}><strong>{place.name}</strong></td>
                    <td style={{...styles.td, fontSize: '13px', color: '#64748b'}}>{place.lastInspected}</td>
                    <td style={styles.td}>{place.people}명</td>
                    <td style={styles.td}>{place.airQuality}</td>
                    <td style={styles.td}>
                      <span style={place.status === '여유' ? styles.badgeSuccess : styles.badgeWarning}>
                        {place.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {adminPlaces.filter(p => p.type === 'smoking').length === 0 && (
                  <tr><td colSpan="5" style={{...styles.td, textAlign: 'center'}}>데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h1 style={styles.logo}>IoT Monitoring</h1>
          <p style={styles.logoSub}>Admin System</p>
        </div>
        <nav style={styles.nav}>
          <button style={{...styles.navButton, ...(activeTab === 'dashboard' ? styles.navActive : {})}} onClick={() => setActiveTab('dashboard')}>
            <IconDashboard /> 대시보드 (통합 상황판)
          </button>
          <button style={{...styles.navButton, ...(activeTab === 'restroom' ? styles.navActive : {})}} onClick={() => setActiveTab('restroom')}>
            <IconRestroom /> 화장실 관제 시스템
          </button>
          <button style={{...styles.navButton, ...(activeTab === 'smoking' ? styles.navActive : {})}} onClick={() => setActiveTab('smoking')}>
            <IconSmoking /> 흡연장 관제 시스템
          </button>
        </nav>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <h2 style={styles.headerTitle}>
            {activeTab === 'dashboard' && '대시보드'}
            {activeTab === 'restroom' && '화장실 관제 시스템'}
            {activeTab === 'smoking' && '흡연장 관제 시스템'}
          </h2>
          <div style={styles.headerRight}>
            <span style={styles.adminName}>최고관리자님</span>
            <button onClick={handleLogout} style={styles.logoutBtn}>로그아웃</button>
          </div>
        </header>
        <div style={styles.contentBody}>
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

const styles = {
  layout: { display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#f8fafc', fontFamily: '"Pretendard", sans-serif' },
  sidebar: { width: '280px', backgroundColor: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '4px 0 15px rgba(0,0,0,0.1)', zIndex: 100 },
  sidebarHeader: { padding: '32px 24px', borderBottom: '1px solid #1e293b' },
  logo: { margin: 0, fontSize: '22px', fontWeight: '800', color: '#38bdf8' },
  logoSub: { margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' },
  nav: { padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
  navButton: { padding: '14px 16px', backgroundColor: 'transparent', border: 'none', color: '#cbd5e1', textAlign: 'left', fontSize: '15px', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center' },
  navActive: { backgroundColor: '#38bdf8', color: '#0f172a' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { height: '80px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' },
  headerTitle: { margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '700' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  adminName: { fontSize: '14px', color: '#475569', fontWeight: '600' },
  logoutBtn: { padding: '8px 16px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#475569', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' },
  contentBody: { padding: '32px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' },
  card: { backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' },
  cardTitle: { margin: '0 0 16px 0', fontSize: '16px', color: '#475569', fontWeight: 'bold' },
  statNumber: { fontSize: '36px', fontWeight: '800', color: '#0f172a' },
  statUnit: { fontSize: '16px', fontWeight: '600', color: '#94a3b8', marginLeft: '4px' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '12px' },
  th: { textAlign: 'left', padding: '12px 16px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: '600', fontSize: '14px' },
  td: { padding: '16px', borderBottom: '1px solid #f1f5f9', color: '#0f172a', fontSize: '14px' },
  badgeSuccess: { padding: '6px 12px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' },
  badgeDanger: { padding: '6px 12px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' },
  badgeWarning: { padding: '6px 12px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' },
  infoPanel: { position: 'absolute', top: '16px', right: '16px', width: '320px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100% - 32px)' },
  infoPanelHeader: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', flexShrink: 0 },
  infoPanelBody: { padding: '20px', overflowY: 'auto' },
  infoStatBox: { backgroundColor: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' },
  infoStatLabel: { fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold' },
  infoStatValue: { fontSize: '15px', color: '#0f172a', fontWeight: '800' }
};
