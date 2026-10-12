import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RequireAuth({ children, allowedRoles }) {
  const { user, isAuthenticated, isLoading, hasRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        color: '#64748b',
        fontSize: '14px',
        fontWeight: '600'
      }}>
        보안 인증 확인 중...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !hasRole(allowedRoles)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#fee2e2',
          color: '#ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          marginBottom: '16px'
        }}>
          !
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>
          접근 권한이 없습니다
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', maxWidth: '360px', lineHeight: '1.5' }}>
          현재 계정({user?.username} / {user?.role})은 이 페이지에 접근할 수 있는 권한이 부여되지 않았습니다.
        </p>
        <button
          onClick={() => window.history.back()}
          style={{
            padding: '8px 18px',
            backgroundColor: '#0f172a',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          이전 페이지로 돌아가기
        </button>
      </div>
    );
  }

  return children;
}
