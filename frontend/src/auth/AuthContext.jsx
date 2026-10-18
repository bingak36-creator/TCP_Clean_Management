import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const DEMO_LOGIN_ENABLED = true; // 배포 및 시연 환경에서 상시 데모 로그인 지원

export const ROLES = {
  DEVELOPER: 'DEVELOPER',
  ADMIN: 'ADMIN',
  CLEANER: 'CLEANER'
};

export const ROLE_INFO = {
  DEVELOPER: {
    label: '개발자 (전체 관제)',
    color: '#6366f1',
    bgColor: '#eef2ff',
    borderColor: '#c7d2fe',
    description: '모든 구역 관제, 센서/시설 등록, 시스템 환경설정 권한'
  },
  ADMIN: {
    label: '현장 관리자',
    color: '#2563eb',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    description: '배정된 담당 구역 관제, 실시간 모니터링, 환경 임계값 설정'
  },
  CLEANER: {
    label: '청소 담당자',
    color: '#059669',
    bgColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    description: '담당 구역 위생 상태 점검, 퀵 청소 및 청소 일지 작성'
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tcp_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('tcp_auth_token') || null);
  const [isLoading, setIsLoading] = useState(true);

  // 초기 로드 시 토큰 검증
  useEffect(() => {
    const verifyToken = async () => {
      const storedToken = localStorage.getItem('tcp_auth_token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      if (storedToken.startsWith('mock-jwt-token-') && DEMO_LOGIN_ENABLED) {
        setIsLoading(false);
        return;
      }

      try {
        const authHeader = storedToken.startsWith('Bearer ') ? storedToken : `Bearer ${storedToken}`;
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            'Authorization': authHeader,
            'ngrok-skip-browser-warning': 'true'
          }
        });

        if (res.ok) {
          const userData = await res.json();
          const savedRaw = localStorage.getItem('tcp_auth_user');
          const savedUser = savedRaw ? JSON.parse(savedRaw) : null;
          const resolvedRole = userData.role || savedUser?.role || ROLES.DEVELOPER;
          const dbZoneIds = Array.isArray(userData.zoneIds)
            ? userData.zoneIds
            : (Array.isArray(userData.assignedZoneIds) && userData.assignedZoneIds.length > 0
              ? userData.assignedZoneIds
              : (savedUser?.zoneIds || []));
          const mergedUser = {
            ...(savedUser || {}),
            id: userData.id ?? savedUser?.id ?? 1,
            username: userData.username || savedUser?.username || 'developer',
            role: resolvedRole,
            zoneIds: dbZoneIds
          };
          setUser(mergedUser);
          localStorage.setItem('tcp_auth_user', JSON.stringify(mergedUser));
        } else {
          // 토큰 만료 또는 유효하지 않음
          logout();
        }
      } catch (err) {
        console.warn('Backend auth check skipped, keeping local session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, []);

  const login = async (username, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        if (res.status === 404 && DEMO_LOGIN_ENABLED) throw new Error('DEMO_AUTH_UNAVAILABLE');
        const errorText = await res.text().catch(() => '');
        let errorMsg = '로그인에 실패했습니다.';
        try {
          const parsed = JSON.parse(errorText);
          errorMsg = parsed.message || errorMsg;
        } catch {
          if (errorText) errorMsg = errorText;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      const accessToken = data.accessToken || data.token;
      const resolvedRole = data.role || (data.username?.toLowerCase().includes('cleaner')
        ? ROLES.CLEANER
        : (data.username?.toLowerCase().includes('admin') ? ROLES.ADMIN : ROLES.DEVELOPER));
      const assignedZones = Array.isArray(data.zoneIds)
        ? data.zoneIds
        : (Array.isArray(data.assignedZoneIds) && data.assignedZoneIds.length > 0
          ? data.assignedZoneIds
          : (resolvedRole === ROLES.DEVELOPER ? [] : [1, 2, 3, 4]));
      const userInfo = data.user || {
        id: data.id,
        username: data.username,
        role: resolvedRole,
        zoneIds: assignedZones
      };

      setToken(accessToken);
      setUser(userInfo);
      localStorage.setItem('tcp_auth_token', accessToken);
      localStorage.setItem('tcp_auth_user', JSON.stringify(userInfo));
      localStorage.setItem('isAdminLoggedIn', 'true');

      return userInfo;
    } catch (err) {
      // 백엔드가 일시 정지 상태일 때 오프라인 폴백 시뮬레이션
      if (DEMO_LOGIN_ENABLED && (err.message.includes('Failed to fetch') || err.message === 'DEMO_AUTH_UNAVAILABLE')) {
        console.info('Using local demo role login; backend account authentication is unavailable.');
        let mockUser = null;
        if (username === 'developer' && password === '1234') {
          mockUser = { id: 1, username: 'developer', role: ROLES.DEVELOPER, zoneIds: [] };
        } else if (username === 'admin' && password === '1234') {
          mockUser = { id: 2, username: 'admin', role: ROLES.ADMIN, zoneIds: [1, 2, 3, 4] };
        } else if (username === 'cleaner' && password === '1234') {
          mockUser = { id: 3, username: 'cleaner', role: ROLES.CLEANER, zoneIds: [1, 2] };
        }

        if (mockUser) {
          mockUser.isDemo = true;
          const devices = await fetch(`${API_BASE}/api/iot/devices`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
          }).then(response => response.ok ? response.json() : []).catch(() => []);
          const liveZoneIds = devices.map(device => Number(device.zoneId)).filter(Boolean);
          mockUser.zoneIds = Array.from(new Set([...(mockUser.zoneIds || []), ...liveZoneIds]));
          const fakeToken = 'mock-jwt-token-' + mockUser.role;
          setToken(fakeToken);
          setUser(mockUser);
          localStorage.setItem('tcp_auth_token', fakeToken);
          localStorage.setItem('tcp_auth_user', JSON.stringify(mockUser));
          localStorage.setItem('isAdminLoggedIn', 'true');
          return mockUser;
        }
      }
      throw err;
    }
  };

  // 상단 헤더에서 로그아웃 없이 즉시 역할 전환 (개발자 / 현장 관리자 / 청소 담당자)
  const switchRole = (nextRole) => {
    const roleMap = {
      [ROLES.DEVELOPER]: { id: 1, username: 'developer', role: ROLES.DEVELOPER, zoneIds: [1, 2, 3, 4], isDemo: true },
      [ROLES.ADMIN]: { id: 2, username: 'admin', role: ROLES.ADMIN, zoneIds: [1, 2, 3, 4], isDemo: true },
      [ROLES.CLEANER]: { id: 3, username: 'cleaner', role: ROLES.CLEANER, zoneIds: [1, 2, 3, 4], isDemo: true }
    };
    const nextUser = roleMap[nextRole];
    if (!nextUser) return;
    const fakeToken = 'mock-jwt-token-' + nextUser.role;
    setToken(fakeToken);
    setUser(nextUser);
    localStorage.setItem('tcp_auth_token', fakeToken);
    localStorage.setItem('tcp_auth_user', JSON.stringify(nextUser));
    localStorage.setItem('isAdminLoggedIn', 'true');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('tcp_auth_token');
    localStorage.removeItem('tcp_auth_user');
    localStorage.removeItem('isAdminLoggedIn');
  };

  // 권한 헬퍼 함수
  const hasRole = (allowedRoles) => {
    if (!user) return false;
    if (!allowedRoles || allowedRoles.length === 0) return true;
    return allowedRoles.includes(user.role);
  };

  // 특정 구역(화장실 ID) 접근 가능 여부
  const canAccessZone = (zoneId) => {
    if (!user) return false;
    // DEVELOPER는 전체 구역 접근 가능
    if (user.role === ROLES.DEVELOPER) return true;
    // ADMIN 및 CLEANER는 본인 배정 zoneIds에 포함된 경우만 접근 가능 (배정 목록이 비어있으면 기본 구역 허용)
    if (!zoneId) return false;
    if (!user.zoneIds || user.zoneIds.length === 0) return true;
    return user.zoneIds.includes(Number(zoneId));
  };

  // 탭별 접근 권한
  const canViewTab = (tabName) => {
    if (!user) return false;
    switch (tabName) {
      case 'dashboard':
      case 'cleaning':
      case 'alerts':
        return true; // 모든 로그인 역할(개발자, 관리자, 청소원) 접근 가능
      case 'map':
        return user.role === ROLES.DEVELOPER || user.role === ROLES.ADMIN;
      case 'settings':
        return user.role === ROLES.DEVELOPER || user.role === ROLES.ADMIN;
      default:
        return false;
    }
  };

  // 설정 서브탭별 권한
  const canAccessSettingSubTab = (subTab) => {
    if (!user) return false;
    if (user.role === ROLES.DEVELOPER) return true; // 전체
    if (user.role === ROLES.ADMIN) {
      // 현장 관리자는 임계값 설정만 가능, 시설 등록 및 시스템 설정은 불가
      return subTab === 'thresholds';
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: Boolean(user && token),
        login,
        logout,
        switchRole,
        hasRole,
        canAccessZone,
        canViewTab,
        canAccessSettingSubTab
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
