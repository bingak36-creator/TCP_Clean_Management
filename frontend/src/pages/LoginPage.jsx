import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    // 로컬 스토리지 기반 간단한 로그인 (프로토타입용)
    if (userId === 'admin' && password === '1234') {
      localStorage.setItem('isAdminLoggedIn', 'true');
      navigate('/admin');
    } else {
      alert('아이디는 admin, 비밀번호는 1234 입니다.');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginBox}>
        <h2 style={styles.title}>관리자 로그인</h2>
        <p style={styles.subtitle}>스마트 공간 IoT 모니터링 시스템</p>
        
        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>아이디</label>
            <input 
              type="text" 
              value={userId} 
              onChange={(e) => setUserId(e.target.value)} 
              style={styles.input}
              placeholder="아이디를 입력하세요" 
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>비밀번호</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              style={styles.input}
              placeholder="비밀번호를 입력하세요" 
            />
          </div>
          <button type="submit" style={styles.loginButton}>로그인</button>
        </form>
        <button onClick={() => navigate('/')} style={styles.backButton}>지도로 돌아가기</button>
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
    backgroundColor: '#f1f5f9',
    fontFamily: '"Pretendard", sans-serif'
  },
  loginBox: {
    width: '400px',
    backgroundColor: '#fff',
    padding: '40px',
    borderRadius: '16px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    color: '#0f172a',
    textAlign: 'center'
  },
  subtitle: {
    margin: '0 0 32px 0',
    fontSize: '14px',
    color: '#64748b',
    textAlign: 'center'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569'
  },
  input: {
    padding: '14px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  loginButton: {
    padding: '16px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '12px',
    transition: 'background-color 0.2s',
  },
  backButton: {
    width: '100%',
    padding: '14px',
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '12px'
  }
};
