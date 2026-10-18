import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// 모던 B2B SVG 라인 아이콘 (Lucide 규격: 개발자=Terminal, 관리자=ShieldCheck, 청소담당=Broom)
const IconRoleDeveloper = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m4 17 6-6-6-6" />
    <path d="M12 19h8" />
  </svg>
);

const IconRoleAdmin = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const IconRoleCleaner = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 10.5 22 2" />
    <path d="M14.734 13.841a2 2 0 0 0-.314-2.42L12.58 9.58a2 2 0 0 0-2.421-.314l-7.657 4.461A1 1 0 0 0 2.3 15.3l6.403 6.403a1 1 0 0 0 1.571-.204z" />
    <path d="m5 18 2-2" />
    <path d="m7.699 10.7 5.602 5.601" />
  </svg>
);

export default function LoginPage() {
  const [userId, setUserId] = useState('admin');
  const [password, setPassword] = useState('1234');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
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

  // 체험용 역할 빠른 채우기
  const selectQuickRole = (roleUsername) => {
    setUserId(roleUsername);
    setPassword('1234');
    setErrorMsg('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginBox}>
        <div style={styles.brandRow}>
          <span style={styles.badge}>TCP CLEAN 관제</span>
        </div>
        <h2 style={styles.title}>시스템 로그인</h2>
        <p style={styles.subtitle}>역할별 관제 화면 · 로컬 체험 계정</p>

        {/* 역할별 빠른 테스트 선택 버튼 */}
        <div style={styles.quickRoleBox}>
          <div style={styles.quickRoleTitle}>테스트 역할 빠른 선택:</div>
          <div style={styles.roleGrid}>
            <button
              type="button"
              onClick={() => selectQuickRole('developer')}
              style={{
                ...styles.roleChip,
                ...(userId === 'developer' ? styles.roleChipActiveDev : {})
              }}
            >
              <IconRoleDeveloper size={15} color={userId === 'developer' ? '#6366f1' : '#64748b'} />
              <span>개발자</span>
            </button>
            <button
              type="button"
              onClick={() => selectQuickRole('admin')}
              style={{
                ...styles.roleChip,
                ...(userId === 'admin' ? styles.roleChipActiveAdmin : {})
              }}
            >
              <IconRoleAdmin size={15} color={userId === 'admin' ? '#2563eb' : '#64748b'} />
              <span>관리자</span>
            </button>
            <button
              type="button"
              onClick={() => selectQuickRole('cleaner')}
              style={{
                ...styles.roleChip,
                ...(userId === 'cleaner' ? styles.roleChipActiveCleaner : {})
              }}
            >
              <IconRoleCleaner size={15} color={userId === 'cleaner' ? '#059669' : '#64748b'} />
              <span>청소담당</span>
            </button>
          </div>
        </div>

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
              placeholder="예: developer, admin, cleaner"
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
              placeholder="비밀번호 (기본: 1234)"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            style={styles.loginButton}
            disabled={isSubmitting}
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
