import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!userId.trim() || !password.trim()) {
      setErrorMsg('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await login(userId.trim(), password);
      navigate('/admin');
    } catch (err) {
      setErrorMsg(err.message || '로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginBox}>
        <div style={styles.brandRow}>
          <span style={styles.badge}>TCP CLEAN 관제</span>
        </div>
        <h2 style={styles.title}>시스템 로그인</h2>
        <p style={styles.subtitle}>등록된 계정으로 관제 화면에 로그인하세요.</p>

        {errorMsg && (
          <div style={styles.errorAlert}>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>계정 아이디</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={styles.input}
              placeholder="계정 아이디"
              autoComplete="username"
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="비밀번호"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            style={styles.loginButton}
            disabled={isSubmitting || isLoading}
          >
            {isSubmitting ? '인증 처리 중...' : `${userId || '사용자'} 계정으로 로그인`}
          </button>
        </form>

        <button onClick={() => navigate('/')} style={styles.backButton}>
          &larr; 일반 길찾기 지도로 돌아가기
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    fontFamily: '"Pretendard", -apple-system, sans-serif'
  },
  loginBox: {
    width: '420px',
    backgroundColor: '#fff',
    padding: '36px 32px',
    borderRadius: '16px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
  },
  brandRow: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '10px'
  },
  badge: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.5px',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    padding: '4px 10px',
    borderRadius: '20px',
    border: '1px solid #bfdbfe'
  },
  title: {
    margin: '0 0 6px 0',
    fontSize: '22px',
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center'
  },
  subtitle: {
    margin: '0 0 20px 0',
    fontSize: '13px',
    color: '#64748b',
    textAlign: 'center'
  },
  quickRoleBox: {
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    padding: '12px',
    border: '1px solid #e2e8f0',
    marginBottom: '20px'
  },
  quickRoleTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#475569',
    marginBottom: '8px'
  },
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '6px'
  },
  roleChip: {
    padding: '9px 6px',
    backgroundColor: '#fff',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#1e293b',
    transition: 'all 0.15s ease'
  },
  roleChipActiveDev: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
    boxShadow: '0 0 0 2px rgba(99, 102, 241, 0.2)'
  },
  roleChipActiveAdmin: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)'
  },
  roleChipActiveCleaner: {
    borderColor: '#059669',
    backgroundColor: '#ecfdf5',
    boxShadow: '0 0 0 2px rgba(5, 150, 105, 0.2)'
  },
  errorAlert: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    marginBottom: '16px',
    fontWeight: '500'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#334155'
  },
  input: {
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box'
  },
  loginButton: {
    padding: '14px',
    backgroundColor: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '6px',
    transition: 'background-color 0.2s'
  },
  backButton: {
    marginTop: '16px',
    width: '100%',
    padding: '10px',
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer'
  }
};
