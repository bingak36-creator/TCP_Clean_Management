import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 저장된 사용자/역할은 신뢰하지 않고 서버에서 세션을 확인한다.
  useEffect(() => {
    const controller = new AbortController();
    const storedToken = localStorage.getItem('tcp_auth_token');
    const isCurrent = () => !controller.signal.aborted
      && localStorage.getItem('tcp_auth_token') === storedToken;
    const verifyToken = async () => {
      try {
        if (!storedToken) return;
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${storedToken}`,
            'ngrok-skip-browser-warning': 'true'
          }
        });
        if (!res.ok) throw new Error('유효하지 않은 세션입니다.');
        const userData = await res.json();
        if (isCurrent()) {
          setToken(storedToken);
          setUser(userData);
        }
      } catch {
        if (isCurrent()) {
          localStorage.removeItem('tcp_auth_token');
          setToken(null);
          setUser(null);
        }
      } finally {
        localStorage.removeItem('tcp_auth_user');
        localStorage.removeItem('isAdminLoggedIn');
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    verifyToken();
    return () => controller.abort();
  }, []);

  // 만료(기본 8시간)·폐기된 세션은 1분 안에 감지해 로그인 화면으로 돌려보낸다.
  useEffect(() => {
    if (!token) return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
        });
        if (res.status === 401 && localStorage.getItem('tcp_auth_token') === token) {
          localStorage.removeItem('tcp_auth_token');
          setToken(null);
          setUser(null);
        }
      } catch {
        // 네트워크 오류는 세션 만료가 아니므로 유지한다.
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [token]);

  const login = async (username, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      throw new Error(res.status === 401
        ? '아이디 또는 비밀번호가 올바르지 않습니다.'
        : '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    const data = await res.json();
    if (!data.token || !data.id || !data.username || !data.role) {
      throw new Error('로그인 응답을 확인할 수 없습니다.');
    }
    const userInfo = { id: data.id, username: data.username, role: data.role, zoneIds: data.zoneIds || [] };
    localStorage.setItem('tcp_auth_token', data.token);
    setToken(data.token);
    setUser(userInfo);
    return userInfo;
  };

  const logout = async () => {
    const currentToken = localStorage.getItem('tcp_auth_token');
    setToken(null);
    setUser(null);
    localStorage.removeItem('tcp_auth_token');
    localStorage.removeItem('tcp_auth_user');
    localStorage.removeItem('isAdminLoggedIn');
    if (currentToken) {
      try {
        const response = await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}`, 'ngrok-skip-browser-warning': 'true' },
          keepalive: true
        });
        if (!response.ok && response.status !== 401) throw new Error('Session revocation failed');
      } catch (error) {
        console.warn('서버 연결 실패로 세션을 폐기하지 못했습니다. 서버 세션은 만료 시까지 유효할 수 있습니다.', error);
      }
    }
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
    if (!user.zoneIds || user.zoneIds.length === 0) return false;
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
