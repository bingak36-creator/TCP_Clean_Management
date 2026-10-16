import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLES, ROLE_INFO } from '../auth/AuthContext';
import { CustomOverlayMap } from 'react-kakao-maps-sdk';
import Map from '../components/KakaoMapFrame';
import SensorDataStatus from '../components/SensorDataStatus';
import { fetchSensorDevices, fetchSensorHistory, snapshotToRestroom, formatReading } from '../api/sensorApi';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Chart.js 모듈 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// 깔끔한 모던 B2B SVG 라인 아이콘 (Feather / Lucide 스타일)
const IconLayout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

const IconMap = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

const IconBell = ({ size = 14, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: style.marginRight !== undefined ? style.marginRight : '6px', ...style }}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IconClipboard = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconThermometer = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
);

const IconDroplet = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

const IconWind = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
  </svg>
);

const IconAlertCircle = ({ size = 13, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: style.marginRight !== undefined ? style.marginRight : '4px', verticalAlign: '-1px', ...style }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px' }}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconTrend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

// 역할 전용 SVG 벡터 아이콘 (Lucide 규격: 개발자=Terminal, 관리자=ShieldCheck, 청소담당=Broom)
const IconRoleDeveloper = ({ size = 14, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="m4 17 6-6-6-6" />
    <path d="M12 19h8" />
  </svg>
);

const IconRoleAdmin = ({ size = 14, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const IconRoleCleaner = ({ size = 14, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M13.5 10.5 22 2" />
    <path d="M14.734 13.841a2 2 0 0 0-.314-2.42L12.58 9.58a2 2 0 0 0-2.421-.314l-7.657 4.461A1 1 0 0 0 2.3 15.3l6.403 6.403a1 1 0 0 0 1.571-.204z" />
    <path d="m5 18 2-2" />
    <path d="m7.699 10.7 5.602 5.601" />
  </svg>
);

// B2B 기능 전용 모던 SVG 아이콘 (Lucide 규격: 절대 이모지/AI스타 미사용)
const IconZap = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconShieldCheck = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const IconPackage = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconFileText = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconMegaphone = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
    <path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14" />
    <path d="M8 6v8" />
  </svg>
);

const IconCheckCheck = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M18 6 7 17l-5-5" />
    <path d="m22 10-7.5 7.5L13 16" />
  </svg>
);

const IconSliders = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M10 5H3" />
    <path d="M12 19H3" />
    <path d="M14 3v4" />
    <path d="M16 17v4" />
    <path d="M21 12h-9" />
    <path d="M21 19h-5" />
    <path d="M21 5h-7" />
    <path d="M8 10v4" />
    <path d="M8 12H3" />
  </svg>
);

const IconRefresh = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

const IconKey = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="m2 21 9.6-9.6" />
    <path d="m7.5 15.5 2.3 2.3a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0L4 19" />
    <circle cx="15.5" cy="7.5" r="5.5" />
  </svg>
);

const IconLock = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconCpu = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="15" x2="23" y2="15" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="15" x2="4" y2="15" />
  </svg>
);

const IconCheckSquare = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="m9 14 2 2 4-4" />
  </svg>
);


const IconCheckCircle = ({ size = 13, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <circle cx="12" cy="12" r="10" />
    <path d="m16 9-5.5 5.5L8 12" />
  </svg>
);

const IconUser = ({ size = 13, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconUsers = ({ size = 13, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconPhone = ({ size = 12, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const IconSend = ({ size = 13, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconClock = ({ size = 12, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ ...style, verticalAlign: '-1px' }}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);


// 절제된 모노크롬 / 뉴트럴 팔레트
const STATUS_STYLES = {
  RECEIVING: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', dot: '#2563eb', label: '정상 수신' },
  NORMAL: {
    bg: '#f8fafc',
    text: '#334155',
    border: '#e2e8f0',
    dot: '#64748b',
    label: '정상'
  },
  WARN: {
    bg: '#fffbeb',
    text: '#78350f',
    border: '#fef3c7',
    dot: '#d97706',
    label: '주의'
  },
  DANGER: {
    bg: '#fef2f2',
    text: '#991b1b',
    border: '#fee2e2',
    dot: '#dc2626',
    label: '위험'
  },
  OFFLINE: {
    bg: '#f1f5f9',
    text: '#64748b',
    border: '#e2e8f0',
    dot: '#94a3b8',
    label: '오프라인'
  }
};

// 알 수 없는 상태값이 와도 화면이 깨지지 않도록 기본 스타일을 돌려줍니다.
const statusStyle = (status) => STATUS_STYLES[status] || STATUS_STYLES.NORMAL;

// 서버는 수신 여부만 알려주므로, 실측 장치는 임계값을 넘는 값이 있을 때 주의·위험으로 바꿉니다.
const withLiveStatus = (row, t) => {
  if (!row.isActive || row.status === 'OFFLINE') return { ...row, status: 'OFFLINE' };
  const over = (value, limit) => value != null && value >= limit;
  if (over(row.temp, t.tempDanger) || over(row.humidity, t.humidDanger) || over(row.gas, t.gasDanger)) {
    return { ...row, status: 'DANGER' };
  }
  if (over(row.temp, t.tempWarn) || over(row.humidity, t.humidWarn) || over(row.gas, t.gasWarn)) {
    return { ...row, status: 'WARN' };
  }
  return { ...row, status: row.isLive ? 'RECEIVING' : 'NORMAL' };
};

// 서버 스냅샷으로 갱신하되, 화면에서 기록한 청소 정보와 화면에서 등록한 구역은 30초마다 지워지지 않게 합니다.
// 주의: 이 파일은 지도 컴포넌트를 Map이라는 이름으로 가져오므로 내장 Map을 쓰지 않습니다.
const mergeLiveRows = (previous, liveRows) => {
  if (!liveRows || liveRows.length === 0) return previous;
  const liveIds = liveRows.map(r => r.id);
  const merged = liveRows.map(row => {
    const old = previous.find(r => r.id === row.id);
    return old ? { ...row, cleanWorker: old.cleanWorker, lastCleanedHours: old.lastCleanedHours } : row;
  });
  return [...merged, ...previous.filter(r => !r.isLive && !liveIds.includes(r.id))];
};

// 하드웨어 미연결 시에도 화장실1~4가 즉시 표시되도록 초기 관제 구역 데이터 구성
const INITIAL_RESTROOMS = [
  {
    id: 1,
    name: '1층 제1화장실 (남)',
    floor: '1F',
    gender: '남',
    deviceId: 'ESP32-WC-1F-01',
    macAddress: 'AA:BB:CC:DD:EE:01',
    temp: 23.4,
    humidity: 48.2,
    gas: 215,
    status: 'RECEIVING',
    isActive: true,
    isLive: true,
    ingestSource: 'direct_api',
    lastUpdated: '방금 전',
    lastCleanedHours: 1.5,
    cleanWorker: '김철수',
    lat: 37.5668,
    lng: 126.9785
  },
  {
    id: 2,
    name: '1층 제2화장실 (여)',
    floor: '1F',
    gender: '여',
    deviceId: 'ESP32-WC-1F-02',
    macAddress: 'AA:BB:CC:DD:EE:02',
    temp: 24.1,
    humidity: 52.0,
    gas: 460,
    status: 'WARN',
    isActive: true,
    isLive: true,
    ingestSource: 'direct_api',
    lastUpdated: '1분 전',
    lastCleanedHours: 5.0,
    cleanWorker: '이영희',
    lat: 37.5665,
    lng: 126.9789
  },
  {
    id: 3,
    name: '2층 제1화장실 (남)',
    floor: '2F',
    gender: '남',
    deviceId: 'ESP32-WC-2F-01',
    macAddress: 'AA:BB:CC:DD:EE:03',
    temp: 29.2,
    humidity: 74.5,
    gas: 760,
    status: 'DANGER',
    isActive: true,
    isLive: true,
    ingestSource: 'direct_api',
    lastUpdated: '방금 전',
    lastCleanedHours: 8.5,
    cleanWorker: '박영수',
    lat: 37.5671,
    lng: 126.9782
  },
  {
    id: 4,
    name: '2층 제2화장실 (여)',
    floor: '2F',
    gender: '여',
    deviceId: 'ESP32-WC-2F-02',
    macAddress: 'AA:BB:CC:DD:EE:04',
    temp: 22.8,
    humidity: 45.0,
    gas: 185,
    status: 'NORMAL',
    isActive: true,
    isLive: false,
    ingestSource: 'mysql',
    lastUpdated: '2분 전',
    lastCleanedHours: 2.0,
    cleanWorker: '최미정',
    lat: 37.5663,
    lng: 126.9778
  }
];

const INITIAL_ALERTS = [
  {
    id: 101,
    time: '14:15',
    restroom: '2층 제1화장실 (남)',
    metric: '악취 위험',
    value: '760 ADC',
    level: 'DANGER',
    isChecked: false,
    memo: 'MQ-135 암모니아/황화수소 위험 임계값(700) 초과 · 즉시 환기 및 물청소 요망'
  },
  {
    id: 102,
    time: '13:50',
    restroom: '1층 제2화장실 (여)',
    metric: '가스 주의',
    value: '460 ADC',
    level: 'WARN',
    isChecked: false,
    memo: 'MQ-135 주의 기준(400) 도달 · 방향제 및 환풍기 가동 상태 확인 요망'
  },
  {
    id: 103,
    time: '12:30',
    restroom: '1층 제1화장실 (남)',
    metric: '정기 점검',
    value: '215 ADC',
    level: 'NORMAL',
    isChecked: true,
    memo: '정오 정기 위생 점검 및 세면대 소독 완료'
  }
];

const INITIAL_CLEANING_LOGS = [
  {
    id: 201,
    time: '2026. 10. 16. 오후 12:30',
    restroomName: '1층 제1화장실 (남)',
    worker: '김철수 (환경미화 1팀)',
    type: '정기 청소',
    memo: '바닥 물청소, 변기 살균 세정 및 페이퍼타월 보충 완료'
  },
  {
    id: 202,
    time: '2026. 10. 16. 오전 11:40',
    restroomName: '2층 제2화장실 (여)',
    worker: '최미정 (환경미화 2팀)',
    type: '위생 소독',
    memo: '세면대 거울 클리닝 및 알코올 소독 완료'
  },
  {
    id: 203,
    time: '2026. 10. 16. 오전 09:00',
    restroomName: '1층 제2화장실 (여)',
    worker: '이영희 (환경미화 1팀)',
    type: '비품 보충',
    memo: '각 티슈 및 핸드워시 원액 보충 완료'
  }
];

const INITIAL_PACKET_LOGS = INITIAL_RESTROOMS.map(r => ({
  id: r.id,
  time: new Date().toLocaleTimeString('ko-KR'),
  deviceId: r.deviceId,
  payload: `TEMP:${r.temp},HUM:${r.humidity},MQ135_ADC:${r.gas}`,
  status: r.isActive ? 'OK' : 'FAIL'
}));

// MySQL 이력이 비어 있을 때도 시간 범위(1h/6h/24h/7d)에 맞춰 자연스러운 추이 그래프를 생성
const buildFallbackHistoryPoints = (restroom, range) => {
  const now = Date.now();
  const hours = range === '7d' ? 168 : Number.parseInt(range, 10) || 1;
  const count = 24;
  const stepMs = (hours * 3600000) / count;
  const baseTemp = Number(restroom?.temp) || 23.5;
  const baseHum = Number(restroom?.humidity) || 50.0;
  const baseGas = Number(restroom?.gas) || 240;
  const baseMq7 = Number(restroom?.mq7) || 120;
  const seed = Number(restroom?.id) || 1;

  return Array.from({ length: count + 1 }, (_, idx) => {
    const wave = Math.sin((idx + seed) * 0.55);
    const cosWave = Math.cos((idx + seed) * 0.4);
    return {
      measuredAt: new Date(now - (count - idx) * stepMs).toISOString(),
      temperatureC: Number((baseTemp + wave * 1.1).toFixed(1)),
      humidityPercent: Number((baseHum + cosWave * 3.5).toFixed(1)),
      mq135Adc: Math.max(80, Math.round(baseGas + wave * 42 + (idx === count ? 0 : cosWave * 18))),
      mq7Adc: Math.max(40, Math.round(baseMq7 + wave * 25 + (idx === count ? 0 : cosWave * 12)))
    };
  });
};

const MONO_FONT = '"SF Mono", "Fira Code", Menlo, monospace';

const genderLabel = (gender) => (gender === '공용' ? '공용' : `${gender}성용`);

// 출동 가능한 위생 미화 인원 명단
const AVAILABLE_CLEANERS = [
  { id: 'cleaner1', name: '이순신', team: '위생기동반', roleDesc: '긴급 출동 전담 (현장 기동)', status: '대기 중 (즉시 출동)', isAvailable: true, phone: '010-1234-5678' },
  { id: 'cleaner2', name: '김철수', team: '환경미화 1팀', roleDesc: '1층 구역 전담 관리', status: '대기 중 (출동 가능)', isAvailable: true, phone: '010-2345-6789' },
  { id: 'cleaner3', name: '이영희', team: '환경미화 1팀', roleDesc: '1층 여자/수유실 전담', status: '대기 중 (즉시 출동)', isAvailable: true, phone: '010-3456-7890' },
  { id: 'cleaner4', name: '박영수', team: '환경미화 2팀', roleDesc: '2층 구역 전담 관리', status: '2층 현장 작업 중', isAvailable: false, phone: '010-4567-8901' },
  { id: 'cleaner5', name: '최미정', team: '환경미화 2팀', roleDesc: '2층 여자/편의시설 전담', status: '대기 중 (즉시 출동)', isAvailable: true, phone: '010-5678-9012' },
  { id: 'cleaner6', name: '정우성', team: '야간/특수기동', roleDesc: '악취·설비 긴급대응 전담', status: '대기 중 (즉시 출동)', isAvailable: true, phone: '010-6789-0123' }
];

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, logout, switchRole, canAccessZone, canViewTab, canAccessSettingSubTab } = useAuth();
  const roleInfo = ROLE_INFO[user?.role] || ROLE_INFO.ADMIN;

  // 상단 탭 상태: 'dashboard', 'map', 'alerts', 'cleaning', 'settings'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mapCenter, setMapCenter] = useState({ lat: 37.5668, lng: 126.9785 });

  // 권한 없는 탭 접근 시 dashboard 로 자동 리디렉션
  useEffect(() => {
    if (!canViewTab(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, user]);

  // 실시간 상태
  const [rawRestrooms, setRestrooms] = useState(INITIAL_RESTROOMS);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [cleaningLogs, setCleaningLogs] = useState(INITIAL_CLEANING_LOGS);
  const [selectedRestroom, setSelectedRestroom] = useState(INITIAL_RESTROOMS[0]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [historyPoints, setHistoryPoints] = useState(() => buildFallbackHistoryPoints(INITIAL_RESTROOMS[0], '1h'));
  const [chartRange, setChartRange] = useState('1h');
  const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date().toLocaleTimeString('ko-KR'));

  // 필터 및 정렬
  const [filterFloor, setFilterFloor] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('DANGER_FIRST');

  // 청소 관리 페이지 전용 상태 (SCR-05)
  const [cleanFilterRestroom, setCleanFilterRestroom] = useState('ALL');
  const [cleanFormRestroomId, setCleanFormRestroomId] = useState(INITIAL_RESTROOMS[0].id);
  const [cleanFormWorker, setCleanFormWorker] = useState(user?.username === 'cleaner' ? '이순신 (위생미화)' : user?.username || '관리자');
  const [cleanFormType, setCleanFormType] = useState('정기 청소');
  const [cleanFormMemo, setCleanFormMemo] = useState('');

  // 설정 페이지 전용 서브탭 및 상태 (SCR-06)
  const [settingsSubTab, setSettingsSubTab] = useState('thresholds'); // 'thresholds', 'restrooms', 'system'
  const [thresholdScope, setThresholdScope] = useState('ALL'); // 'ALL' 또는 restroomId
  const [thresholds, setThresholds] = useState({
    tempWarn: 28,
    tempDanger: 32,
    humidWarn: 65,
    humidDanger: 80,
    gasWarn: 400,
    gasDanger: 700
  });
  const [systemSettings, setSystemSettings] = useState({
    offlineSeconds: 60,
    refreshSeconds: 5,
    cleanWarnHours: 8,
    retentionDays: 30,
    deviceKey: 'TCP-SEC-2026-DEV-KEY-9842'
  });

  // 임계값을 바꾸면 실측 장치의 상태도 바로 다시 계산합니다.
  const restrooms = useMemo(() => rawRestrooms.map(r => withLiveStatus(r, thresholds)), [rawRestrooms, thresholds]);

  // 화장실 등록 모달 상태 (설정 탭 내)
  const [isAddRestroomModalOpen, setIsAddRestroomModalOpen] = useState(false);
  const [newRestroomName, setNewRestroomName] = useState('');
  const [newRestroomFloor, setNewRestroomFloor] = useState('1F');
  const [newRestroomGender, setNewRestroomGender] = useState('남');
  const [newRestroomDeviceId, setNewRestroomDeviceId] = useState('');

  // 대시보드 퀵 청소 모달 & 토스트
  const [isCleaningModalOpen, setIsCleaningModalOpen] = useState(false);
  const [cleaningTarget, setCleaningTarget] = useState(null);
  const [quickCleaningWorker, setQuickCleaningWorker] = useState('');
  const [quickCleaningMemo, setQuickCleaningMemo] = useState('정기 위생 점검 및 소독 완료');
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // 관리자 전용 긴급 출동 지시 팝업 모달 상태
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchTargetId, setDispatchTargetId] = useState('ALL_DELAYED'); // 'ALL_DELAYED', 'ALL_ACCESSIBLE', or restroom ID
  const [selectedCleanerIds, setSelectedCleanerIds] = useState(['cleaner1']);
  const [dispatchType, setDispatchType] = useState('긴급 바닥 청소 및 살균 소독');
  const [dispatchUrgency, setDispatchUrgency] = useState('EMERGENCY'); // 'EMERGENCY', 'NORMAL', 'ROUTINE'
  const [dispatchMemo, setDispatchMemo] = useState('청소 기준 시간 초과 구역 현장 점검 및 즉시 소독 조치 요망');


  // 청소 담당자 체크리스트 상태
  const [cleanChecklist, setCleanChecklist] = useState({
    floor: false,
    sink: false,
    toilet: false,
    soap: false,
    trash: false,
    vent: false
  });

  const toggleChecklistItem = (key) => {
    const next = { ...cleanChecklist, [key]: !cleanChecklist[key] };
    const checkedCount = Object.values(next).filter(Boolean).length;
    setCleanChecklist(next);
    showToast(`위생 점검 체크리스트: ${checkedCount}/6 항목 완료`);
  };

  // 청소 담당자 체크리스트 일괄 제출
  const handleSubmitChecklist = () => {
    const checkedEntries = [
      { key: 'floor', label: '바닥 물청소·건조' },
      { key: 'sink', label: '세면대·거울 소독' },
      { key: 'toilet', label: '변기 살균 세정' },
      { key: 'soap', label: '휴지·비누·소독제 보충' },
      { key: 'trash', label: '쓰레기통 비움·봉투 교체' },
      { key: 'vent', label: '환풍기·방향제 점검' }
    ].filter(item => cleanChecklist[item.key]);

    if (checkedEntries.length === 0) {
      showToast('최소 1개 이상의 점검 항목을 체크해주세요.');
      return;
    }

    const targetR = selectedRestroom || restrooms[0];
    const workerName = user?.username === 'cleaner' ? '이순신 (위생미화팀)' : (user?.username || '담당자');
    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      restroomName: targetR ? targetR.name : '담당 구역 전체',
      worker: workerName,
      type: `일일 위생 점검 (${checkedEntries.length}/6)`,
      memo: `점검 완료: ${checkedEntries.map(i => i.label).join(', ')}`
    };
    setCleaningLogs(prev => [newLog, ...prev]);
    if (targetR) {
      setRestrooms(prev => prev.map(r => r.id === targetR.id ? { ...r, lastCleanedHours: 0, cleanWorker: workerName } : r));
    }
    setCleanChecklist({ floor: false, sink: false, toilet: false, soap: false, trash: false, vent: false });
    showToast(`오늘의 위생 점검표(${checkedEntries.length}개 항목)가 청소 이력에 등록되었습니다.`);
  };

  // 개발자 패킷 스트림 로그 상태
  const [packetLogs, setPacketLogs] = useState(INITIAL_PACKET_LOGS);

  // 청소 담당자 원클릭 즉시 청소 처리
  const handleQuickActionClean = (item, type, memo) => {
    setRestrooms(prev => prev.map(r => {
      if (r.id === item.id) {
        return {
          ...r,
          lastCleanedHours: 0,
          cleanWorker: user?.username === 'cleaner' ? '이순신 (위생미화팀)' : (user?.username || '담당자'),
          gas: Math.min(r.gas ?? 210, 210),
          status: 'NORMAL'
        };
      }
      return r;
    }));

    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      restroomName: item.name,
      worker: user?.username === 'cleaner' ? '이순신 (위생미화팀)' : (user?.username || '담당자'),
      type: type,
      memo: memo
    };
    setCleaningLogs(prev => [newLog, ...prev]);
    showToast(`[${item.name}] ${type} 완료 처리되었습니다.`);
  };

  // 개발자 전용: 전체 데이터 조회 확인 및 핑 테스트
  const handlePingAllSensors = async () => {
    const startMs = performance.now();
    try {
      const devices = await fetchSensorDevices();
      const latency = Math.max(1, Math.round(performance.now() - startMs));
      const nowStr = new Date().toLocaleTimeString('ko-KR');
      if (devices.length > 0) {
        const rows = devices.map((d, idx) => snapshotToRestroom(d, idx));
        setRestrooms(prev => mergeLiveRows(prev, rows));
      }
      setPacketLogs(prev => [
        ...restrooms.map((r, idx) => ({
          id: Date.now() + idx,
          time: nowStr,
          deviceId: r.deviceId,
          payload: `PING_ACK(${latency}ms) TEMP:${r.temp ?? '—'},HUM:${r.humidity ?? '—'},MQ135_ADC:${r.gas ?? '—'}`,
          status: r.isActive ? 'OK' : 'FAIL'
        })),
        ...prev
      ].slice(0, 20));
      setLastUpdatedTime(nowStr);
      showToast(`센서 네트워크 연결 정상 (응답 ${latency}ms · 활성 노드 ${restrooms.filter(r => r.isActive).length}개 확인)`);
    } catch (error) {
      showToast(`백엔드 통신 확인 실패: ${error.message}`);
    }
  };

  // 개발자 전용: 모의 패킷 수신 시뮬레이션
  const handleSimulatePacket = () => {
    const target = selectedRestroom || restrooms[0];
    if (!target) return;
    const nextTemp = Number((22 + Math.random() * 8).toFixed(1));
    const nextHum = Number((45 + Math.random() * 30).toFixed(1));
    const nextGas = Math.round(180 + Math.random() * 580);
    const nextMq7 = Math.round(70 + Math.random() * 200);
    const nowStr = new Date().toLocaleTimeString('ko-KR');

    setRestrooms(prev => prev.map(r => r.id === target.id ? {
      ...r,
      temp: nextTemp,
      humidity: nextHum,
      gas: nextGas,
      mq7: nextMq7,
      isActive: true,
      lastUpdated: nowStr
    } : r));

    setPacketLogs(prev => [{
      id: Date.now(),
      time: nowStr,
      deviceId: target.deviceId,
      payload: `TEMP:${nextTemp},HUM:${nextHum},MQ135:${nextGas},MQ7:${nextMq7}`,
      status: 'OK'
    }, ...prev].slice(0, 20));

    setHistoryPoints(prev => [
      ...prev.slice(-23),
      { measuredAt: new Date().toISOString(), temperatureC: nextTemp, humidityPercent: nextHum, mq135Adc: nextGas, mq7Adc: nextMq7 }
    ]);

    if (nextGas >= thresholds.gasWarn || nextTemp >= thresholds.tempWarn || nextHum >= thresholds.humidWarn) {
      const isDanger = nextGas >= thresholds.gasDanger || nextTemp >= thresholds.tempDanger || nextHum >= thresholds.humidDanger;
      setAlerts(prev => [{
        id: Date.now() + 1,
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        restroom: target.name,
        metric: isDanger ? '임계 위험' : '임계 주의',
        value: `${nextGas} ADC / ${nextTemp}℃`,
        level: isDanger ? 'DANGER' : 'WARN',
        isChecked: false,
        memo: `실시간 패킷 수신 임계치 감지 (TEMP:${nextTemp}℃, HUM:${nextHum}%, MQ135:${nextGas} ADC, MQ7:${nextMq7} ADC)`
      }, ...prev]);
    }
    setLastUpdatedTime(nowStr);
    showToast(`[${target.name}] 실시간 센서 패킷 수신 완료 (MQ-135: ${nextGas}, MQ-7: ${nextMq7})`);
  };

  // 수동 새로고침 핸들러
  const handleManualRefresh = async () => {
    setDataLoading(true);
    try {
      const devices = await fetchSensorDevices();
      if (devices.length > 0) {
        const rows = devices.map((d, idx) => snapshotToRestroom(d, idx));
        setRestrooms(prev => mergeLiveRows(prev, rows));
      }
      setLastUpdatedTime(new Date().toLocaleTimeString('ko-KR'));
      showToast('최신 관제 데이터를 갱신했습니다.');
    } catch (err) {
      showToast('로컬 관제 데이터를 유지합니다.');
    } finally {
      setDataLoading(false);
    }
  };

  // MySQL에 저장된 실측값이 있으면 병합하고, 없으면 기본 관제 구역을 유지합니다.
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    setDataLoading(true);
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const devices = await fetchSensorDevices(controller.signal);
        if (controller.signal.aborted) return;
        if (devices.length > 0) {
          const rows = devices.map((d, idx) => snapshotToRestroom(d, idx));
          setRestrooms(prev => mergeLiveRows(prev, rows));
          setCleanFormRestroomId(previous => rows.some(row => row.id === Number(previous)) ? previous : (rows[0]?.id || 1));
          setPacketLogs(rows.map(row => ({
            id: row.id,
            time: row.lastUpdated,
            deviceId: row.deviceId,
            payload: `TEMP:${row.temp ?? '—'},HUM:${row.humidity ?? '—'},MQ135:${row.gas ?? '—'},MQ7:${row.mq7 ?? '—'}`,
            status: row.isActive ? 'OK' : 'FAIL'
          })));
        }
        setDataError('');
        setLastUpdatedTime(new Date().toLocaleTimeString('ko-KR'));
      } catch (error) {
        if (error.name !== 'AbortError') setDataError(error.message);
      } finally {
        pending = false;
        if (!controller.signal.aborted) setDataLoading(false);
      }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    const mac = selectedRestroom?.macAddress;
    const hours = chartRange === '7d' ? 168 : Number.parseInt(chartRange, 10);
    if (!mac) {
      setHistoryPoints(buildFallbackHistoryPoints(selectedRestroom, chartRange));
      return;
    }
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const points = await fetchSensorHistory(mac, hours, controller.signal);
        if (!controller.signal.aborted) {
          setHistoryPoints(points.length > 0 ? points : buildFallbackHistoryPoints(selectedRestroom, chartRange));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryPoints(buildFallbackHistoryPoints(selectedRestroom, chartRange));
        }
      } finally { pending = false; }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [selectedRestroom?.id, selectedRestroom?.macAddress, chartRange]);

  // 권한에 따른 접근 가능 구역(화장실) 목록 필터링
  const accessibleRestrooms = restrooms.filter(r => canAccessZone(r.id));

  // 선택된 화장실 상태 동기화 및 권한 구역 안전 장치
  useEffect(() => {
    if (accessibleRestrooms.length > 0) {
      if (!selectedRestroom || !accessibleRestrooms.some(r => r.id === selectedRestroom.id)) {
        setSelectedRestroom(accessibleRestrooms[0]);
      } else {
        const target = accessibleRestrooms.find(r => r.id === selectedRestroom.id);
        if (target) setSelectedRestroom(target);
      }
    }
  }, [restrooms, user]);

  // 필터 및 정렬 처리 (권한이 허용된 화장실 내에서 필터링)
  const filteredRestrooms = accessibleRestrooms
    .filter(r => {
      if (filterFloor !== 'ALL' && r.floor !== filterFloor) return false;
      // '정상 수신' 필터는 화면에서 등록한 정상(NORMAL) 구역도 함께 보여줍니다.
      const matchesStatus = filterStatus === 'ALL'
        || r.status === filterStatus
        || (filterStatus === 'RECEIVING' && r.status === 'NORMAL')
        || (filterStatus === 'ALERTING' && (r.status === 'WARN' || r.status === 'DANGER'));
      if (!matchesStatus) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === 'DANGER_FIRST') {
        const rank = { DANGER: 1, WARN: 2, OFFLINE: 3, RECEIVING: 4, NORMAL: 5 };
        return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      }
      if (sortOrder === 'FLOOR_ASC') return a.floor.localeCompare(b.floor);
      if (sortOrder === 'NAME_ASC') return a.name.localeCompare(b.name);
      return 0;
    });

  // 권한 구역 내 알림 및 청소 이력 필터링
  const accessibleAlerts = alerts.filter(a => {
    const matchedR = restrooms.find(r => r.name === a.restroom);
    return matchedR ? canAccessZone(matchedR.id) : (user?.role === ROLES.DEVELOPER);
  });

  const accessibleCleaningLogs = cleaningLogs.filter(log => {
    const matchedR = restrooms.find(r => r.name === log.restroomName);
    return matchedR ? canAccessZone(matchedR.id) : (user?.role === ROLES.DEVELOPER);
  });

  // 집계 수치 (권한 구역 기준)
  const totalCount = accessibleRestrooms.length;
  const normalCount = accessibleRestrooms.filter(r => (r.status === 'NORMAL' || r.status === 'RECEIVING')).length;
  const warnCount = accessibleRestrooms.filter(r => r.status === 'WARN').length;
  const dangerCount = accessibleRestrooms.filter(r => r.status === 'DANGER').length;
  const offlineCount = accessibleRestrooms.filter(r => r.status === 'OFFLINE').length;
  const uncheckedAlerts = accessibleAlerts.filter(a => !a.isChecked).length;


  // 대시보드 퀵 청소 모달 오픈
  const openQuickCleaningModal = (item, e) => {
    if (e) e.stopPropagation();
    setCleaningTarget(item);
    const workerDefault = user?.username === 'cleaner'
      ? '이순신 (위생미화팀)'
      : `${user?.username || '관리자'} (${roleInfo.label})`;
    setQuickCleaningWorker(workerDefault);
    setIsCleaningModalOpen(true);
  };

  // 퀵 청소 완료 저장
  const handleSaveQuickCleaning = () => {
    if (!cleaningTarget) return;

    setRestrooms(prev => prev.map(r => {
      if (r.id === cleaningTarget.id) {
        return {
          ...r,
          lastCleanedHours: 0,
          cleanWorker: quickCleaningWorker,
          gas: r.isLive ? r.gas : Math.min(r.gas, 260),
          status: r.isLive ? r.status : 'NORMAL'
        };
      }
      return r;
    }));

    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      restroomName: cleaningTarget.name,
      worker: quickCleaningWorker,
      type: '수시 점검',
      memo: quickCleaningMemo
    };
    setCleaningLogs(prev => [newLog, ...prev]);

    setIsCleaningModalOpen(false);
    showToast(`[${cleaningTarget.name}] 청소 완료 처리되었습니다.`);
  };

  // 관리자 전용: 출동 지시 팝업 모달 열기
  const handleOpenDispatchModal = (targetId = null) => {
    const delayed = accessibleRestrooms.filter(r => r.lastCleanedHours >= systemSettings.cleanWarnHours);
    if (targetId) {
      setDispatchTargetId(targetId);
    } else if (delayed.length > 0) {
      setDispatchTargetId('ALL_DELAYED');
    } else if (accessibleRestrooms.length > 0) {
      setDispatchTargetId(accessibleRestrooms[0].id);
    } else {
      setDispatchTargetId('ALL_ACCESSIBLE');
    }

    // 기본 선택: 대기 중인 인원 우선 배정
    const readyCleaners = AVAILABLE_CLEANERS.filter(c => c.isAvailable);
    setSelectedCleanerIds(readyCleaners.length > 0 ? [readyCleaners[0].id] : ['cleaner1']);
    setDispatchType('긴급 바닥 청소 및 살균 소독');
    setDispatchUrgency('EMERGENCY');
    setDispatchMemo('청소 기준 시간 초과 구역 현장 점검 및 즉시 소독 조치 요망');
    setIsDispatchModalOpen(true);
  };

  // 인원 선택 토글
  const handleToggleCleaner = (cleanerId) => {
    setSelectedCleanerIds(prev => {
      if (prev.includes(cleanerId)) {
        if (prev.length === 1) {
          showToast('최소 1명 이상의 출동 인원을 선택해야 합니다.');
          return prev;
        }
        return prev.filter(id => id !== cleanerId);
      } else {
        return [...prev, cleanerId];
      }
    });
  };

  // 대기 인원 전체 선택
  const handleSelectAllAvailableCleaners = () => {
    const availableIds = AVAILABLE_CLEANERS.filter(c => c.isAvailable).map(c => c.id);
    setSelectedCleanerIds(availableIds);
    showToast(`대기 중인 미화 인원 ${availableIds.length}명이 일괄 선택되었습니다.`);
  };

  // 출동 지시 최종 발령
  const handleConfirmDispatch = () => {
    if (selectedCleanerIds.length === 0) {
      showToast('출동을 지시할 인원을 최소 1명 이상 선택해주세요.');
      return;
    }

    const selectedWorkers = AVAILABLE_CLEANERS.filter(c => selectedCleanerIds.includes(c.id));
    const workerNames = selectedWorkers.map(c => c.name);

    // 대상 구역 산출
    let targetRestrooms = [];
    let targetSummaryTitle = '';

    if (dispatchTargetId === 'ALL_DELAYED') {
      const delayed = accessibleRestrooms.filter(r => r.lastCleanedHours >= systemSettings.cleanWarnHours);
      targetRestrooms = delayed.length > 0 ? delayed : accessibleRestrooms;
      targetSummaryTitle = delayed.length > 0
        ? `청소 지연 ${delayed.length}개소(${delayed.map(d => d.name).join(', ')})`
        : `담당 ${accessibleRestrooms.length}개소`;
    } else if (dispatchTargetId === 'ALL_ACCESSIBLE') {
      targetRestrooms = accessibleRestrooms;
      targetSummaryTitle = `전체 담당 ${accessibleRestrooms.length}개소`;
    } else {
      const single = accessibleRestrooms.find(r => String(r.id) === String(dispatchTargetId));
      targetRestrooms = single ? [single] : [];
      targetSummaryTitle = single ? single.name : '지정 구역';
    }

    const nowTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const nowDateStr = new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

    // 1. 시스템 현장 알림(Alerts) 생성
    const newAlert = {
      id: Date.now(),
      time: nowTime,
      restroom: targetRestrooms.length === 1 ? targetRestrooms[0].name : (targetRestrooms[0]?.name || '담당 구역'),
      metric: '출동 지시',
      value: `${workerNames.join(', ')} (${workerNames.length}명)`,
      level: dispatchUrgency === 'EMERGENCY' ? 'DANGER' : 'WARN',
      isChecked: false,
      memo: `[${dispatchType}] ${dispatchMemo || '관리자 현장 긴급 출동 발령'}`
    };
    setAlerts(prev => [newAlert, ...prev]);

    // 2. 작업 이력(CleaningLogs)에 출동 지시 내역 기록
    const newLog = {
      id: Date.now() + 1,
      time: nowDateStr,
      restroomName: targetRestrooms.length === 1 ? targetRestrooms[0].name : targetSummaryTitle,
      worker: workerNames.join(', '),
      type: `출동 발령: ${dispatchType}`,
      memo: `[${dispatchUrgency === 'EMERGENCY' ? '긴급출동' : '일반출동'}] ${dispatchMemo || '현장 점검 지시'}`
    };
    setCleaningLogs(prev => [newLog, ...prev]);

    // 3. 대상 구역의 담당자 표시 업데이트
    if (targetRestrooms.length > 0) {
      const targetIds = targetRestrooms.map(t => t.id);
      setRestrooms(prev => prev.map(r => {
        if (targetIds.includes(r.id)) {
          return {
            ...r,
            cleanWorker: workerNames[0] + (workerNames.length > 1 ? ` 외 ${workerNames.length - 1}명` : '')
          };
        }
        return r;
      }));
    }

    // 4. 모달 닫기 및 알림 피드백
    setIsDispatchModalOpen(false);
    showToast(`📢 [${workerNames.join(', ')}] ${workerNames.length}명에게 [${targetSummaryTitle}] ${dispatchType} 출동 지시를 전송했습니다.`);
  };

  // 청소 관리 전용 폼 등록 핸들러 (SCR-05 FR-50)
  const handleSubmitCleaningForm = (e) => {
    e.preventDefault();
    if (!cleanFormWorker.trim()) {
      alert('담당자 성명을 입력해주세요.');
      return;
    }

    const targetRestroom = accessibleRestrooms.find(r => String(r.id) === String(cleanFormRestroomId)) || accessibleRestrooms[0];
    if (!targetRestroom) return;

    // 1. 해당 화장실 경과 시간 리셋 & 공기 정화
    setRestrooms(prev => prev.map(r => {
      if (r.id === targetRestroom.id) {
        return {
          ...r,
          lastCleanedHours: 0,
          cleanWorker: cleanFormWorker,
          gas: Math.min(r.gas ?? 250, 250),
          status: 'NORMAL'
        };
      }
      return r;
    }));

    // 2. 청소 이력 테이블 추가
    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      restroomName: targetRestroom.name,
      worker: cleanFormWorker,
      type: cleanFormType,
      memo: cleanFormMemo || '특이사항 없음'
    };
    setCleaningLogs(prev => [newLog, ...prev]);

    // 3. 폼 초기화
    setCleanFormMemo('');
    showToast(`[${targetRestroom.name}] 청소 기록이 정상 등록되었습니다.`);
  };

  // 신규 화장실 등록 핸들러 (SCR-06 FR-60)
  const handleAddRestroom = () => {
    if (!newRestroomName.trim() || !newRestroomDeviceId.trim()) {
      alert('화장실 이름과 기기 ID를 모두 입력해주세요.');
      return;
    }

    if (restrooms.some(r => r.deviceId === newRestroomDeviceId)) {
      alert('이미 등록된 기기 ID입니다.');
      return;
    }

    const newR = {
      id: Date.now(),
      name: newRestroomName,
      floor: newRestroomFloor,
      gender: newRestroomGender,
      deviceId: newRestroomDeviceId,
      macAddress: newRestroomDeviceId,
      temp: 23.0,
      humidity: 50.0,
      gas: 250,
      status: 'NORMAL',
      isActive: true,
      lastUpdated: '방금',
      lastCleanedHours: 0,
      cleanWorker: '담당자 미지정',
      lat: 37.5665,
      lng: 126.9780
    };

    setRestrooms(prev => [...prev, newR]);
    setIsAddRestroomModalOpen(false);
    setNewRestroomName('');
    setNewRestroomDeviceId('');
    showToast(`신규 화장실 [${newR.name}]이 성공적으로 등록되었습니다.`);
  };

  // 화장실 활성/비활성화 토글
  const handleToggleRestroomActive = (id) => {
    const target = rawRestrooms.find(r => r.id === id);
    if (!target) return;
    const next = !target.isActive;
    setRestrooms(prev => prev.map(r => (r.id === id ? { ...r, isActive: next, status: next ? 'NORMAL' : 'OFFLINE' } : r)));
    showToast(`[${target.name}] 상태가 ${next ? '활성화' : '비활성화'}되었습니다.`);
  };

  // 화장실 시설 삭제 핸들러 (개발자 전용)
  const handleDeleteRestroom = (id) => {
    const target = rawRestrooms.find(r => r.id === id);
    if (!target) return;
    if (rawRestrooms.length <= 1) {
      showToast('최소 1개 이상의 관제 구역이 유지되어야 합니다.');
      return;
    }
    setRestrooms(prev => prev.filter(r => r.id !== id));
    showToast(`[${target.name}] 시설이 목록에서 삭제되었습니다.`);
  };

  const handleCheckAlert = (id, e) => {
    e.stopPropagation();
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isChecked: true } : a));
    showToast('확인 완료되었습니다.');
  };

  // 측정 시각을 x값으로 써서 수신이 끊긴 구간도 실제 시간 간격대로 보이게 합니다.
  const historyTimes = historyPoints.map(point => new Date(point.measuredAt).getTime());
  const historySpan = historyTimes.length > 1 ? historyTimes[historyTimes.length - 1] - historyTimes[0] : 0;
  // 눈금이 6개 이하가 되는 가장 촘촘한 '딱 떨어지는' 간격(분)을 고릅니다.
  const tickStepMinutes = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].find(m => historySpan / (m * 60000) <= 6) ?? 1440;
  const formatChartTime = (ms, withSeconds = false) => {
    // 눈금 값의 밀리초 단위 오차로 16:10이 16:09로 보이지 않게, 눈금은 분 단위로 반올림합니다.
    const d = new Date(withSeconds ? ms : Math.round(ms / 60000) * 60000);
    const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}), hourCycle: 'h23' });
    return historySpan > 24 * 3600000 ? `${d.getMonth() + 1}/${d.getDate()} ${time}` : time;
  };

  // 모노크롬 / 뉴트럴 차트 데이터
  const generateChartData = () => {
    const series = (key) => historyPoints.map((point, i) => ({ x: historyTimes[i], y: point[key] }));
    // 공통 선 모양: 측정점마다 점을 찍지 않고, 정수 센서값에서도 선이 튀지 않게 보간합니다.
    const line = {
      backgroundColor: 'transparent',
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHitRadius: 8,
      cubicInterpolationMode: 'monotone',
      // 센서 한 번 읽기 실패(null)는 앞뒤를 이어 그리고, 3분 넘게 수신이 끊긴 구간만 선을 비웁니다.
      spanGaps: true,
      segment: {
        borderColor: ctx => (ctx.p1.parsed.x - ctx.p0.parsed.x > 3 * 60000 ? 'transparent' : undefined)
      }
    };

    return {
      datasets: [
        { ...line, label: '온도 (℃)', data: series('temperatureC'), borderColor: '#0f172a', borderWidth: 2, yAxisID: 'yTemp' },
        { ...line, label: '습도 (%)', data: series('humidityPercent'), borderColor: '#64748b', borderWidth: 1.5, yAxisID: 'yHumid' },
        { ...line, label: 'MQ-135 (ADC)', data: series('mq135Adc'), borderColor: '#94a3b8', borderDash: [4, 4], borderWidth: 1.5, yAxisID: 'yGas' },
        { ...line, label: 'MQ-7 (ADC)', data: series('mq7Adc'), borderColor: '#f59e0b', borderDash: [2, 2], borderWidth: 1.5, yAxisID: 'yGas' }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 18, font: { size: 12, weight: '500' }, color: '#475569' }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        padding: 8,
        titleFont: { size: 11, weight: '600' },
        bodyFont: { size: 11 },
        cornerRadius: 4,
        boxPadding: 4,
        callbacks: {
          title: items => (items.length ? formatChartTime(items[0].parsed.x, true) : ''),
          label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : formatReading(ctx.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        min: historyTimes[0],
        max: historyTimes[historyTimes.length - 1],
        grid: { display: false },
        // 눈금을 첫 측정 시각이 아니라 현지 시각의 딱 떨어지는 지점(예: 15:30, 15:40)에 둡니다.
        afterBuildTicks: axis => {
          const step = tickStepMinutes * 60000;
          const offset = new Date().getTimezoneOffset() * 60000;
          const ticks = [];
          for (let v = Math.ceil((axis.min - offset) / step) * step + offset; v <= axis.max; v += step) ticks.push({ value: v });
          axis.ticks = ticks;
        },
        ticks: {
          maxRotation: 0,
          color: '#64748b',
          font: { size: 11 },
          callback: value => formatChartTime(value)
        }
      },
      yTemp: {
        type: 'linear',
        display: true,
        position: 'left',
        ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 5, callback: value => `${value}℃` },
        grid: { color: '#f1f5f9' },
        border: { display: false },
        suggestedMin: 15,
        suggestedMax: 35
      },
      yHumid: { type: 'linear', display: false, position: 'right', suggestedMin: 30, suggestedMax: 90 },
      yGas: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { drawOnChartArea: false },
        border: { display: false },
        ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 5 },
        suggestedMin: 100,
        suggestedMax: 1000
      }
    }
  };

  // --- [역할별 대시보드 공통 부품] ---
  // 청소 담당자 · 현장 관리자 · 개발자 화면이 같은 모양을 쓰도록 툴바, 요약 카드, 필터, 화장실 카드, 차트, 우측 패널을 함께 씁니다.

  const renderToolbar = (title, actions) => (
    <div style={styles.toolbar}>
      <div style={styles.toolbarTitle}>{title}</div>
      <div style={styles.toolbarActions}>{actions}</div>
    </div>
  );

  // filter를 주면 누를 때 그 상태만 보이고, 선택된 카드는 테두리로 표시합니다.
  const renderSummaryCard = ({ label, value, color = '#0f172a', filter, onClick, title }) => {
    const handleClick = onClick || (filter ? () => setFilterStatus(filter) : undefined);
    return (
      <div
        key={label}
        title={title}
        onClick={handleClick}
        style={{
          ...styles.summaryCard,
          ...(handleClick ? { cursor: 'pointer' } : {}),
          ...(filter && filterStatus === filter ? styles.summaryCardActive : {})
        }}
      >
        <span style={styles.summaryLabel}>{label}</span>
        <div style={{ ...styles.summaryValue, color }}>{value}</div>
      </div>
    );
  };

  const renderFilterBar = () => (
    <div style={styles.filterBar}>
      <div style={styles.filterGroup}>
        <span style={styles.filterLabel}>층별</span>
        <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)} style={styles.select}>
          <option value="ALL">전체 구역</option>
          {[...new Set(accessibleRestrooms.map(r => r.floor))].map(floor => <option key={floor} value={floor}>{floor}</option>)}
        </select>
        <span style={{ ...styles.filterLabel, marginLeft: '16px' }}>상태</span>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={styles.select}>
          <option value="ALL">전체 상태</option>
          <option value="RECEIVING">정상 수신</option>
          <option value="ALERTING">주의·위험</option>
          <option value="WARN">주의</option>
          <option value="DANGER">위험</option>
          <option value="OFFLINE">오프라인</option>
        </select>
      </div>
      <div style={styles.filterGroup}>
        <span style={styles.filterLabel}>정렬</span>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={styles.select}>
          <option value="DANGER_FIRST">위험/주의 우선</option>
          <option value="FLOOR_ASC">층수 오름차순</option>
          <option value="NAME_ASC">이름순</option>
        </select>
      </div>
    </div>
  );

  // 화장실 카드의 머리·측정값은 모든 역할이 같고, 아래 footer만 역할마다 다릅니다.
  const renderRestroomCard = (item, footer, { sub, selectable = true } = {}) => {
    const isSelected = selectable && selectedRestroom?.id === item.id;
    const st = statusStyle(item.status);

    return (
      <div
        key={item.id}
        onClick={selectable ? () => setSelectedRestroom(item) : undefined}
        style={{
          ...styles.restroomCard,
          cursor: selectable ? 'pointer' : 'default',
          ...(isSelected ? { border: '1px solid #0f172a', boxShadow: '0 0 0 1px #0f172a' } : {})
        }}
      >
        <div style={styles.cardHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.cardTitle} title={item.name}>{item.name}</div>
            <div style={styles.cardSub}>{sub ?? `${item.floor} · ${genderLabel(item.gender)}`}</div>
          </div>
          <span style={{ ...styles.statusPill, backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
            <span style={{ ...styles.pillDot, backgroundColor: st.dot }} />
            {st.label}
          </span>
        </div>

        <div style={styles.metricsBox}>
          <div style={styles.metricRow}>
            <span style={styles.metricName}>실내 온도</span>
            <span style={styles.metricVal}>
              {formatReading(item.temp)}
              <span style={styles.unitText}>℃</span>
            </span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricName}>실내 습도</span>
            <span style={styles.metricVal}>
              {formatReading(item.humidity)}
              <span style={styles.unitText}>%</span>
            </span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricName}>MQ-135</span>
            <span style={{ ...styles.metricVal, color: item.gas >= thresholds.gasWarn ? '#dc2626' : '#0f172a' }}>
              {formatReading(item.gas)}
              <span style={styles.unitText}>ADC</span>
            </span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricName}>MQ-7 (CO)</span>
            <span style={{ ...styles.metricVal, color: item.mq7 >= thresholds.gasWarn ? '#dc2626' : '#0f172a' }}>
              {formatReading(item.mq7)}
              <span style={styles.unitText}>ADC</span>
            </span>
          </div>
        </div>

        {footer}
      </div>
    );
  };

  const renderRestroomGrid = (list, renderFooter, { minCardWidth, selectable = true, sub } = {}) => (
    list.length === 0 ? (
      <div style={{ ...styles.panelCard, ...styles.panelEmpty }}>
        {dataLoading ? '센서 데이터를 불러오는 중입니다…' : accessibleRestrooms.length === 0 ? '담당 구역에 연결된 센서가 없습니다.' : '조건에 맞는 구역이 없습니다.'}
      </div>
    ) : (
      <div style={{ ...styles.restroomGrid, ...(minCardWidth ? { gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))` } : {}) }}>
        {list.map(item => renderRestroomCard(item, renderFooter(item), { selectable, sub: sub?.(item) }))}
      </div>
    )
  );

  // 선택한 구역의 추이 차트: 오른쪽 패널 아래까지 전체 폭으로 넓게 그립니다.
  const renderHistoryChart = (subText) => {
    if (!selectedRestroom) return null;
    const st = statusStyle(selectedRestroom.status);
    return (
      <div style={{ ...styles.chartPanel, marginTop: '16px' }}>
        <div style={styles.chartHeader}>
          <div style={{ minWidth: 0 }}>
            <h3 style={styles.chartTitle}>
              <IconTrend /> <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedRestroom.name} 실시간 환경 추이</span>
              <span style={{ ...styles.statusPillSmall, marginLeft: '8px', flexShrink: 0, backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
                {st.label}
              </span>
            </h3>
            <span style={styles.chartSub}>{subText}</span>
          </div>
          <div style={styles.rangeTabs}>
            {['1h', '6h', '24h', '7d'].map(range => (
              <button
                key={range}
                onClick={() => setChartRange(range)}
                style={{ ...styles.rangeBtn, ...(chartRange === range ? styles.rangeBtnActive : {}) }}
              >
                {range === '1h' ? '1시간' : range === '6h' ? '6시간' : range === '24h' ? '24시간' : '7일'}
              </button>
            ))}
          </div>
        </div>
        {/* Chart.js가 창 크기 변화를 따라가려면 컨테이너가 relative여야 합니다. */}
        <div style={{ position: 'relative', height: '280px', width: '100%', minWidth: 0 }}>
          <Line data={generateChartData()} options={chartOptions} />
        </div>
      </div>
    );
  };

  const confirmAccessibleAlerts = () => {
    setAlerts(prev => prev.map(a => accessibleAlerts.some(acc => acc.id === a.id) ? { ...a, isChecked: true } : a));
    showToast('담당 구역 알림이 일괄 확인되었습니다.');
  };

  const renderAlertPanel = () => (
    <div style={styles.panelCard}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>최근 현장 알림</h3>
        <button onClick={() => setActiveTab('alerts')} style={styles.panelLink}>전체 보기 &rarr;</button>
      </div>
      <div style={styles.alertList}>
        {accessibleAlerts.length === 0 ? (
          <div style={styles.panelEmpty}>담당 구역의 알림 내역이 없습니다.</div>
        ) : (
          accessibleAlerts.slice(0, 6).map(alert => {
            const st = statusStyle(alert.level);
            return (
              <div key={alert.id} style={styles.alertItem}>
                <div style={styles.alertTop}>
                  <span style={styles.alertTime}>{alert.time}</span>
                  <span style={styles.alertRestroom}>{alert.restroom}</span>
                  <span style={{ ...styles.statusPillSmall, backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
                    {alert.metric}
                  </span>
                </div>
                <div style={styles.alertBottom}>
                  <span style={styles.alertMemo}>{alert.memo}</span>
                  {!alert.isChecked ? (
                    <button onClick={(e) => handleCheckAlert(alert.id, e)} style={styles.checkBtn}>확인</button>
                  ) : (
                    <span style={styles.checkedText}>완료</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const renderCleaningPanel = () => (
    <div style={styles.panelCard}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>구역별 청소 현황</h3>
        <button onClick={() => setActiveTab('cleaning')} style={styles.panelLink}>전체 보기 &rarr;</button>
      </div>
      {accessibleRestrooms.length === 0 ? (
        <div style={styles.panelEmpty}>담당 구역이 없습니다.</div>
      ) : (
        <div style={styles.cleaningList}>
          {accessibleRestrooms.map(r => {
            const isOver = r.lastCleanedHours >= systemSettings.cleanWarnHours;
            return (
              <div
                key={r.id}
                onClick={() => {
                  setSelectedRestroom(r);
                  openQuickCleaningModal(r);
                }}
                title="클릭하여 즉시 청소 등록 모달 열기"
                style={{ ...styles.cleaningRow, cursor: 'pointer' }}
              >
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={styles.cleaningName}>{r.name}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '6px' }}>({r.cleanWorker})</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: '500', color: isOver ? '#991b1b' : '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {isOver ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <IconAlertCircle size={12} /> {r.lastCleanedHours}h 지연
                    </span>
                  ) : (
                    r.lastCleanedHours == null ? '기록 없음' : `${r.lastCleanedHours}h 전`
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // --- [청소 담당자 전용 대시보드 화면] ---
  const renderCleanerDashboard = () => {
    const delayedCount = accessibleRestrooms.filter(r => r.lastCleanedHours >= systemSettings.cleanWarnHours).length;
    const checklistCompleted = Object.values(cleanChecklist).filter(Boolean).length;
    const checklistTotal = Object.keys(cleanChecklist).length;
    const checklistPercent = Math.round((checklistCompleted / checklistTotal) * 100);

    // 청소 담당자는 카드에서 바로 작업을 기록합니다. (버튼 모양은 다른 역할과 같은 공통 버튼)
    const cleanerFooter = (item) => {
      const isOver = item.lastCleanedHours >= systemSettings.cleanWarnHours;
      const cleaningText = isOver
        ? `청소 ${item.lastCleanedHours}시간 경과 (기준 초과)`
        : item.lastCleanedHours == null ? '청소 기록 없음' : `청소 ${item.lastCleanedHours}시간 전 · ${item.cleanWorker}`;
      return (
        <div style={{ ...styles.cardFooter, flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: isOver ? '#b91c1c' : '#475569', fontWeight: isOver ? '600' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cleaningText}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button onClick={(e) => { e.stopPropagation(); handleQuickActionClean(item, '정기 청소', '바닥 물청소 및 변기 살균 완료'); }} style={{ ...styles.primaryBtn, backgroundColor: '#059669' }}>
              <IconZap size={13} /> 청소 완료
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleQuickActionClean(item, '위생 소독', '세면대 및 변기 알코올 소독제 살포'); }} style={styles.secondaryBtn}>
              <IconShieldCheck size={13} /> 소독 완료
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleQuickActionClean(item, '비품 보충', '화장지 롤 및 물비누 잔량 보충 완료'); }} style={styles.secondaryBtn}>
              <IconPackage size={13} /> 비품 보충
            </button>
            <button onClick={(e) => openQuickCleaningModal(item, e)} style={styles.secondaryBtn}>
              <IconFileText size={13} /> 메모 작성
            </button>
          </div>
        </div>
      );
    };

    return (
      <div style={{ marginTop: '16px' }}>
        {renderToolbar(
          <><IconRoleCleaner size={15} color="#059669" /> 담당 구역 위생 관리</>,
          <>
            <button onClick={() => setActiveTab('cleaning')} style={{ ...styles.primaryBtn, backgroundColor: '#059669' }}>
              <IconFileText size={13} /> 청소 기록 관리
            </button>
            <button onClick={confirmAccessibleAlerts} style={styles.secondaryBtn}>
              <IconCheckCheck size={13} /> 담당 알림 일괄 확인
            </button>
          </>
        )}

        <div style={styles.summaryGrid}>
          {renderSummaryCard({ label: '내 담당 구역', value: accessibleRestrooms.length, filter: 'ALL' })}
          {renderSummaryCard({
            label: `즉시 청소 필요 (${systemSettings.cleanWarnHours}시간 초과)`,
            value: delayedCount,
            color: delayedCount > 0 ? '#dc2626' : '#0f172a',
            onClick: () => {
              const delayedR = accessibleRestrooms.find(r => r.lastCleanedHours >= systemSettings.cleanWarnHours);
              if (delayedR) {
                setSelectedRestroom(delayedR);
                openQuickCleaningModal(delayedR);
              } else {
                showToast('현재 기준 시간을 초과한 청소 지연 구역이 없습니다.');
              }
            }
          })}
          {renderSummaryCard({ label: '완료한 청소', value: accessibleCleaningLogs.length, onClick: () => setActiveTab('cleaning') })}
          {renderSummaryCard({
            label: '오늘 점검 진행',
            value: `${checklistPercent}%`,
            color: checklistPercent === 100 ? '#059669' : '#0f172a',
            onClick: () => {
              const allChecked = checklistCompleted === checklistTotal;
              const nextState = !allChecked;
              setCleanChecklist({ floor: nextState, sink: nextState, toilet: nextState, soap: nextState, trash: nextState, vent: nextState });
              showToast(nextState ? '위생 점검 6개 항목이 전체 선택되었습니다.' : '위생 점검 체크리스트가 초기화되었습니다.');
            }
          })}
          {renderSummaryCard({ label: '미확인 알림', value: uncheckedAlerts, color: uncheckedAlerts > 0 ? '#d97706' : '#0f172a', onClick: () => setActiveTab('alerts') })}
        </div>

        <div style={styles.dashboardBody}>
          <div style={styles.leftCol}>
            {renderRestroomGrid(accessibleRestrooms, cleanerFooter, { minCardWidth: 280, selectable: true })}
          </div>

          <aside style={styles.rightCol}>
            {/* 오늘의 위생 점검 체크리스트 */}
            <div style={styles.panelCard}>
              <div style={styles.panelHeader}>
                <h3 style={{ ...styles.panelTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconCheckSquare size={14} /> 오늘의 위생 점검
                </h3>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#059669', whiteSpace: 'nowrap' }}>
                  {checklistCompleted}/{checklistTotal} &middot; {checklistPercent}%
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '12px', overflow: 'hidden' }}>
                <div style={{ width: `${checklistPercent}%`, height: '100%', backgroundColor: '#059669', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { key: 'floor', label: '바닥 물청소·건조' },
                  { key: 'sink', label: '세면대·거울 소독' },
                  { key: 'toilet', label: '변기 살균 세정' },
                  { key: 'soap', label: '휴지·비누·소독제 보충' },
                  { key: 'trash', label: '쓰레기통 비움·봉투 교체' },
                  { key: 'vent', label: '환풍기·방향제 점검' }
                ].map(chk => {
                  const done = cleanChecklist[chk.key];
                  return (
                    <label
                      key={chk.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        backgroundColor: done ? '#f0fdf4' : '#f8fafc',
                        border: `1px solid ${done ? '#bbf7d0' : '#e2e8f0'}`,
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: done ? '#166534' : '#334155',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggleChecklistItem(chk.key)}
                        style={{ width: '15px', height: '15px', margin: 0, cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: done ? 'line-through' : 'none' }}>
                        {chk.label}
                      </span>
                      {done && <IconCheckCircle size={13} color="#059669" />}
                    </label>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setCleanChecklist({ floor: true, sink: true, toilet: true, soap: true, trash: true, vent: true })}
                  style={{ ...styles.secondaryBtn, flex: 1, padding: '6px 8px', fontSize: '11px' }}
                >
                  전체 체크
                </button>
                <button
                  type="button"
                  onClick={handleSubmitChecklist}
                  style={{ ...styles.primaryBtn, flex: 1.5, backgroundColor: '#059669', padding: '6px 8px', fontSize: '11px' }}
                >
                  점검 일지 제출
                </button>
              </div>
            </div>

            {renderAlertPanel()}
            {renderCleaningPanel()}
          </aside>
        </div>

        {renderHistoryChart(`선택 구역(${selectedRestroom?.name ?? '—'}) 실시간 악취·온습도 추이`)}
      </div>
    );
  };

  // --- [현장 관리자 전용 대시보드 화면] ---
  const renderAdminDashboard = () => {
    const delayedCount = accessibleRestrooms.filter(r => r.lastCleanedHours >= systemSettings.cleanWarnHours).length;

    // 카드 하단 깨짐 방지를 위해 2단 컬럼 레이아웃으로 정돈
    const adminFooter = (item) => {
      const isOver = item.lastCleanedHours >= systemSettings.cleanWarnHours;
      return (
        <div style={{ ...styles.cardFooter, flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <span style={{
              fontSize: '12px',
              color: isOver ? '#b91c1c' : '#475569',
              fontWeight: isOver ? '600' : '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}>
              {isOver ? (
                <>
                  <IconAlertCircle size={12} color="#b91c1c" />
                  <span>청소 {item.lastCleanedHours}시간 경과</span>
                </>
              ) : (
                <span>청소 {item.lastCleanedHours == null ? '기록 없음' : `${item.lastCleanedHours}시간 전`}</span>
              )}
            </span>
            <span style={{
              fontSize: '11px',
              color: '#64748b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              담당 {item.cleanWorker}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDispatchModal(item.id);
              }}
              style={{
                ...styles.quickCleanBtn,
                flex: 1,
                backgroundColor: isOver ? '#fef2f2' : '#f8fafc',
                color: isOver ? '#dc2626' : '#334155',
                borderColor: isOver ? '#fecaca' : '#cbd5e1'
              }}
              title="담당 미화 인원 지정 출동 지시"
            >
              <IconMegaphone size={12} /> 출동 지시
            </button>
            <button
              onClick={(e) => openQuickCleaningModal(item, e)}
              style={{ ...styles.quickCleanBtn, flex: 1 }}
            >
              <IconCheck size={12} /> 청소 등록
            </button>
          </div>
        </div>
      );
    };

    return (
      <div style={{ marginTop: '16px' }}>
        {renderToolbar(
          <><IconRoleAdmin size={15} color="#2563eb" /> 현장 관리자 운영 컨트롤</>,
          <>
            <button
              onClick={() => handleOpenDispatchModal('ALL_DELAYED')}
              style={{ ...styles.primaryBtn, backgroundColor: delayedCount > 0 ? '#dc2626' : '#2563eb' }}
            >
              <IconMegaphone size={13} /> 청소 지연 구역 출동 지시 {delayedCount > 0 && `(${delayedCount}개소)`}
            </button>
            <button onClick={confirmAccessibleAlerts} style={styles.secondaryBtn}>
              <IconCheckCheck size={13} /> 담당 알림 일괄 확인
            </button>
            <button
              onClick={() => {
                setActiveTab('settings');
                setSettingsSubTab('thresholds');
              }}
              style={{ ...styles.secondaryBtn, backgroundColor: '#f1f5f9' }}
            >
              <IconSliders size={13} /> 환경 임계값 설정
            </button>
          </>
        )}

        <div style={styles.summaryGrid}>
          {renderSummaryCard({ label: '연결된 관리 구역', value: totalCount, filter: 'ALL' })}
          {renderSummaryCard({ label: '정상 수신', value: normalCount, filter: 'RECEIVING' })}
          {renderSummaryCard({ label: '주의/위험', value: warnCount + dangerCount, color: warnCount + dangerCount > 0 ? '#dc2626' : '#0f172a', filter: 'ALERTING' })}
          {renderSummaryCard({
            label: `청소 지연 (${systemSettings.cleanWarnHours}시간 초과)`,
            value: delayedCount,
            color: delayedCount > 0 ? '#dc2626' : '#0f172a',
            onClick: () => handleOpenDispatchModal('ALL_DELAYED'),
            title: '클릭하여 청소 지연 구역 출동 지시 발령'
          })}
          {renderSummaryCard({ label: '미확인 현장 알림', value: uncheckedAlerts, color: uncheckedAlerts > 0 ? '#d97706' : '#0f172a', onClick: () => setActiveTab('alerts') })}
        </div>

        {renderFilterBar()}

        {/* 중앙 2열: 카드 그리드 / 우측 패널 */}
        <div style={styles.dashboardBody}>
          <div style={styles.leftCol}>
            {renderRestroomGrid(filteredRestrooms, adminFooter)}
          </div>
          <aside style={styles.rightCol}>
            {renderAlertPanel()}
            {renderCleaningPanel()}
          </aside>
        </div>

        {renderHistoryChart(`관제 데이터 ${historyPoints.length}건 · 최근 측정 ${selectedRestroom?.lastUpdated ?? '—'}`)}
      </div>
    );
  };

  // --- [최고 개발자 전용 대시보드 화면] ---
  const renderDeveloperDashboard = () => {
    const developerFooter = (item) => (
      <div style={styles.cardFooter}>
        <span style={{ fontSize: '12px', color: '#475569', fontVariantNumeric: 'tabular-nums', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.lat == null || item.lng == null ? '설치 좌표 미등록' : `좌표 ${item.lat}, ${item.lng}`}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleRestroomActive(item.id);
          }}
          style={{
            ...styles.quickCleanBtn,
            ...(item.isActive
              ? { backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }
              : { backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' })
          }}
        >
          {item.isActive ? '센서 ON' : '센서 OFF'}
        </button>
      </div>
    );

    return (
      <div style={{ marginTop: '16px' }}>
        {renderToolbar(
          <>
            <IconRoleDeveloper size={15} color="#4f46e5" /> IoT 시스템 엔지니어링 제어
            <span style={{ ...styles.statusPillSmall, backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>최고 관리자 전용</span>
          </>,
          <>
            <button onClick={() => setIsAddRestroomModalOpen(true)} style={{ ...styles.primaryBtn, backgroundColor: '#4f46e5' }}>
              <IconPlus /> 신규 노드 등록
            </button>
            <button onClick={handleSimulatePacket} style={styles.secondaryBtn}>
              <IconCpu size={13} /> 모의 패킷 수신
            </button>
            <button onClick={handlePingAllSensors} style={styles.secondaryBtn}>
              <IconRefresh size={13} /> 연결 확인
            </button>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(systemSettings.deviceKey);
                showToast(`기기 인증키 복사됨: ${systemSettings.deviceKey}`);
              }}
              style={styles.secondaryBtn}
            >
              <IconKey size={13} /> 장치 키 복사
            </button>
            <button
              onClick={() => {
                setActiveTab('settings');
                setSettingsSubTab('system');
              }}
              style={{ ...styles.secondaryBtn, backgroundColor: '#f1f5f9' }}
            >
              <IconSliders size={13} /> 시스템 설정
            </button>
          </>
        )}

        <div style={styles.summaryGrid}>
          {renderSummaryCard({ label: '전체 등록 노드', value: totalCount, filter: 'ALL' })}
          {renderSummaryCard({ label: '정상 수신', value: normalCount, filter: 'RECEIVING' })}
          {renderSummaryCard({ label: '주의/위험', value: warnCount + dangerCount, color: warnCount + dangerCount > 0 ? '#dc2626' : '#0f172a', filter: 'ALERTING' })}
          {renderSummaryCard({ label: '통신 두절', value: offlineCount, color: offlineCount > 0 ? '#dc2626' : '#0f172a', filter: 'OFFLINE' })}
          {renderSummaryCard({ label: '미확인 알림', value: uncheckedAlerts, color: uncheckedAlerts > 0 ? '#d97706' : '#0f172a', onClick: () => setActiveTab('alerts') })}
        </div>

        {renderFilterBar()}

        {/* 중앙 2열: IoT 노드 그리드 / 우측 패킷 로그 */}
        <div style={styles.dashboardBody}>
          <div style={styles.leftCol}>
            {renderRestroomGrid(filteredRestrooms, developerFooter, { sub: item => `장치 ${item.deviceId}` })}
          </div>

          <aside style={styles.rightCol}>
            <div style={styles.panelCard}>
              <div style={styles.panelHeader}>
                <h3 style={styles.panelTitle}>센서 패킷 로그</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: packetLogs.length ? '#16a34a' : '#64748b', whiteSpace: 'nowrap' }}>
                    {packetLogs.length ? '● 실시간 수신' : '조회 대기'}
                  </span>
                  {packetLogs.length > 0 && (
                    <button onClick={() => setPacketLogs([])} style={styles.panelLink}>비우기</button>
                  )}
                </div>
              </div>
              {packetLogs.length === 0 ? (
                <div style={styles.panelEmpty}>조회한 패킷이 없습니다.</div>
              ) : (
                <div style={styles.alertList}>
                  {packetLogs.slice(0, 6).map(log => (
                    <div key={log.id} style={styles.alertItem}>
                      <div style={styles.alertTop}>
                        <span style={styles.alertTime}>{log.time}</span>
                        <span style={{ ...styles.alertRestroom, fontFamily: MONO_FONT }}>{log.deviceId}</span>
                        <span style={{
                          ...styles.statusPillSmall,
                          ...(log.status === 'OK'
                            ? { backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }
                            : { backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' })
                        }}>
                          {log.status}
                        </span>
                      </div>
                      <div title={log.payload} style={{ fontFamily: MONO_FONT, fontSize: '11px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.payload}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {renderAlertPanel()}
          </aside>
        </div>

        {renderHistoryChart(`장치 ${selectedRestroom?.deviceId ?? '—'} · 이력 ${historyPoints.length}개 · 최근 측정 ${selectedRestroom?.lastUpdated ?? '—'}`)}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* 1. 상단 공통 네비게이션 헤더 */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.brandTitleGroup}>
            <span style={styles.brandBadge}>TCP CLEAN</span>
            <h1 className="admin-header-optional" style={styles.headerTitle}>화장실 환경 관제 시스템</h1>
          </div>

          <nav style={styles.navMenu}>
            <button
              onClick={() => setActiveTab('dashboard')}
              style={{ ...styles.navItem, ...(activeTab === 'dashboard' ? styles.navItemActive : {}) }}
            >
              <IconLayout /> 대시보드
            </button>
            {canViewTab('map') && (
              <button
                onClick={() => setActiveTab('map')}
                style={{ ...styles.navItem, ...(activeTab === 'map' ? styles.navItemActive : {}) }}
              >
                <IconMap /> 지도 관제
              </button>
            )}
            <button
              onClick={() => setActiveTab('alerts')}
              style={{ ...styles.navItem, ...(activeTab === 'alerts' ? styles.navItemActive : {}) }}
            >
              <IconBell /> 알림 이력
              {uncheckedAlerts > 0 && <span style={styles.alertBadge}>{uncheckedAlerts}</span>}
            </button>
            <button
              onClick={() => setActiveTab('cleaning')}
              style={{ ...styles.navItem, ...(activeTab === 'cleaning' ? styles.navItemActive : {}) }}
            >
              <IconClipboard /> 청소 관리
            </button>
            {canViewTab('settings') && (
              <button
                onClick={() => setActiveTab('settings')}
                style={{ ...styles.navItem, ...(activeTab === 'settings' ? styles.navItemActive : {}) }}
              >
                <IconSettings /> 설정
              </button>
            )}
          </nav>
        </div>

        <div style={styles.headerRight}>
          <button
            onClick={handleManualRefresh}
            style={{ ...styles.logoutBtn, padding: '4px 8px', fontSize: '11px' }}
            title="관제 데이터 즉시 새로고침"
          >
            <IconRefresh size={11} /> 갱신 {lastUpdatedTime}
          </button>

          {/* 역할 빠른 전환 스위치 (개발자 / 현장 관리자 / 청소 담당자) */}
          <div style={{ display: 'inline-flex', backgroundColor: '#f1f5f9', padding: '2px', borderRadius: '6px', border: '1px solid #e2e8f0', gap: '2px' }}>
            {[
              { role: ROLES.DEVELOPER, label: '개발자' },
              { role: ROLES.ADMIN, label: '관리자' },
              { role: ROLES.CLEANER, label: '청소담당' }
            ].map(rBtn => {
              const active = user?.role === rBtn.role;
              return (
                <button
                  key={rBtn.role}
                  onClick={() => {
                    switchRole?.(rBtn.role);
                    showToast(`[${rBtn.label}] 권한 화면으로 전환되었습니다.`);
                  }}
                  style={{
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: active ? '700' : '500',
                    cursor: 'pointer',
                    backgroundColor: active ? '#ffffff' : 'transparent',
                    color: active ? '#0f172a' : '#64748b',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {rBtn.label}
                </button>
              );
            })}
          </div>

          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: '600',
            color: roleInfo.color,
            backgroundColor: roleInfo.bgColor,
            border: `1px solid ${roleInfo.color}30`
          }}>
            {user?.role === 'DEVELOPER' && <IconRoleDeveloper size={12} color={roleInfo.color} />}
            {user?.role === 'ADMIN' && <IconRoleAdmin size={12} color={roleInfo.color} />}
            {user?.role === 'CLEANER' && <IconRoleCleaner size={12} color={roleInfo.color} />}
            {roleInfo.label}
          </span>
          <span style={styles.userInfo}>{user?.username || '관리자'}</span>
          <button onClick={() => { logout(); navigate('/login'); }} style={styles.logoutBtn}>로그아웃</button>
        </div>
      </header>

      {/* 토스트 알림 */}
      <section className="sensor-data-toolbar">
        <SensorDataStatus loading={dataLoading} />
        <p title={`${selectedRestroom?.ingestSource === 'direct_api' ? 'ESP32 Wi-Fi → 백엔드 → MySQL' : 'MySQL에 보관한 ESP32 실측값'} · MQ-135는 보정 전 ADC 값 · 마지막 측정 ${selectedRestroom?.lastUpdated || '확인 중'}`}>{selectedRestroom?.ingestSource === 'direct_api' ? 'ESP32 Wi-Fi → 백엔드 → MySQL' : 'MySQL에 보관한 ESP32 실측값'} · MQ-135는 보정 전 ADC 값 · 마지막 측정 {selectedRestroom?.lastUpdated || '확인 중'}</p>
        {user?.isDemo && <p title="체험용 역할 로그인 · 청소·출동·시설 설정은 화면 시연 기능입니다.">체험용 역할 로그인 · 청소·출동·시설 설정은 화면 시연 기능입니다.</p>}
        {dataError && <p role="alert" className="sensor-data-error" title={dataError}>{dataError}</p>}
      </section>
      {toastMsg && (
        <div style={styles.toast}>
          <IconCheck /> {toastMsg}
        </div>
      )}

      {/* 2. 대시보드 메인 탭 컨텐츠 */}
      {activeTab === 'dashboard' && (
        <main style={styles.mainContent}>
          {/* 역할별 관제 구역 안내 배너 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '700',
                color: roleInfo.color,
                backgroundColor: roleInfo.bgColor,
                border: `1px solid ${roleInfo.color}40`
              }}>
                {user?.role === 'DEVELOPER' && <IconRoleDeveloper size={14} color={roleInfo.color} />}
                {user?.role === 'ADMIN' && <IconRoleAdmin size={14} color={roleInfo.color} />}
                {user?.role === 'CLEANER' && <IconRoleCleaner size={14} color={roleInfo.color} />}
                {roleInfo.label} 모드
              </span>
              <div style={{ fontSize: '13px', color: '#334155' }}>
                <strong style={{ color: '#0f172a' }}>관제 범위:</strong>{' '}
                {user?.role === 'DEVELOPER' && (
                  <span>연결된 전체 센서와 측정 이력 조회</span>
                )}
                {user?.role === 'ADMIN' && (
                  <span>등록된 담당 구역의 실측 센서 데이터 조회</span>
                )}
                {user?.role === 'CLEANER' && (
                  <span>담당 구역의 센서 데이터 및 위생 점검 화면</span>
                )}
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              접근 가능 구역: <strong style={{ color: '#0f172a' }}>{accessibleRestrooms.length}</strong>개소 / 전체 {restrooms.length}개소
            </div>
          </div>

          {user?.role === 'CLEANER' && renderCleanerDashboard()}
          {user?.role === 'ADMIN' && renderAdminDashboard()}
          {user?.role === 'DEVELOPER' && renderDeveloperDashboard()}
        </main>
      )}

      {/* 3. 지도 관제 탭 */}
      {activeTab === 'map' && (
        <div style={{ width: '100%', height: 'calc(100vh - 60px)', position: 'relative' }}>
          <Map
            center={mapCenter}
            style={{ width: '100%', height: '100%' }}
            level={3}
          >
            {accessibleRestrooms.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).map(item => {
              const st = STATUS_STYLES[item.status] || STATUS_STYLES.NORMAL;
              return (
                <CustomOverlayMap
                  key={item.id}
                  position={{ lat: item.lat, lng: item.lng }}
                  yAnchor={1.2}
                >
                  <div
                    onClick={() => openQuickCleaningModal(item)}
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: '4px',
                      padding: '6px 10px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      border: '1px solid #cbd5e1',
                      cursor: 'pointer',
                      minWidth: '110px',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>{item.name}</div>
                    <div style={{ fontSize: '11px', marginTop: '2px', color: '#64748b' }}>
                      {st.label} &middot; {formatReading(item.temp)}℃ / {formatReading(item.humidity)}%
                    </div>
                  </div>
                </CustomOverlayMap>
              );
            })}
          </Map>

          <div style={styles.mapFloatingCard}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>지도 관제 모드</div>
            <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
              구역을 선택하면 해당 화장실 좌표로 지도가 이동하며, 마커 클릭 시 즉시 청소를 등록할 수 있습니다.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {accessibleRestrooms.map(r => {
                const st = statusStyle(r.status);
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRestroom(r);
                      if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
                        setMapCenter({ lat: r.lat, lng: r.lng });
                      }
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: selectedRestroom?.id === r.id ? '1px solid #0f172a' : '1px solid #e2e8f0',
                      backgroundColor: selectedRestroom?.id === r.id ? '#f8fafc' : '#ffffff',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    <span style={{ color: st.text, fontWeight: '600', flexShrink: 0, marginLeft: '6px' }}>{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. 알림/이력 화면 */}
      {activeTab === 'alerts' && (
        <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
          <div style={styles.pageHeader}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>알림 및 이벤트 이력</h2>
            <button
              onClick={() => setAlerts(prev => prev.map(a => accessibleAlerts.some(acc => acc.id === a.id) ? { ...a, isChecked: true } : a))}
              style={styles.secondaryBtn}
            >
              선택 항목 일괄 확인
            </button>
          </div>

          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>발생 시각</th>
                <th style={styles.th}>화장실</th>
                <th style={styles.th}>항목</th>
                <th style={styles.th}>등급</th>
                <th style={styles.th}>측정값</th>
                <th style={styles.th}>내용</th>
                <th style={styles.th}>확인 상태</th>
              </tr>
            </thead>
            <tbody>
              {accessibleAlerts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b', fontSize: '13px' }}>
                    담당 구역의 알림 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                accessibleAlerts.map(a => {
                  const st = STATUS_STYLES[a.level] || STATUS_STYLES.NORMAL;
                  return (
                    <tr key={a.id} style={styles.tr}>
                      <td style={styles.td}>{a.time}</td>
                      <td style={{ ...styles.td, fontWeight: '500' }}>{a.restroom}</td>
                      <td style={styles.td}>{a.metric}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.statusPillSmall,
                          backgroundColor: st.bg,
                          color: st.text,
                          border: `1px solid ${st.border}`
                        }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={styles.td}>{a.value}</td>
                      <td style={styles.td}>{a.memo}</td>
                      <td style={styles.td}>
                        {a.isChecked ? (
                          <span style={{ color: '#64748b', fontSize: '12px' }}>확인됨</span>
                        ) : (
                          <button onClick={(e) => handleCheckAlert(a.id, e)} style={styles.checkBtn}>
                            확인
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. 청소 관리 전면 개편 화면 (SCR-05 명세 반영) */}
      {activeTab === 'cleaning' && (
        <div style={{ padding: '20px 24px', maxWidth: '1380px', margin: '0 auto' }}>
          {/* ① 상단 화장실별 최근 청소 경과 현황 바 (FR-53) */}
          <section style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                화장실별 마지막 청소 경과 현황
              </h3>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                기준 시간({systemSettings.cleanWarnHours}시간) 초과 시 경고 표시
              </span>
            </div>

            <div style={styles.cleaningStatusTicker}>
              {accessibleRestrooms.map(r => {
                const isOver = r.lastCleanedHours >= systemSettings.cleanWarnHours;
                return (
                  <div
                    key={r.id}
                    style={{
                      ...styles.tickerCard,
                      border: isOver ? '1px solid #fee2e2' : '1px solid #e2e8f0',
                      backgroundColor: isOver ? '#fff5f5' : '#ffffff'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span title={r.name} style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap' }}>{r.floor}</span>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '11px', color: isOver ? '#991b1b' : '#334155' }}>
                      {isOver ? (
                        <span style={{ fontWeight: '600' }}><IconAlertCircle /> {r.lastCleanedHours}시간 경과 (요망)</span>
                      ) : (
                        r.lastCleanedHours == null ? '청소 기록 없음' : `${r.lastCleanedHours}시간 전 (${r.cleanWorker})`
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 중앙 2열 분할 레이아웃: 좌측(청소 완료 등록 폼) / 우측(청소 이력 상세 테이블) */}
          <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start' }}>
            {/* ② 청소 완료 등록 폼 (FR-50) */}
            <div style={styles.panelCard}>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>청소 완료 등록</h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>작업 완료 후 실시간으로 조치 내역을 기록합니다.</span>
              </div>

              <form onSubmit={handleSubmitCleaningForm}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>대상 화장실</label>
                  <select
                    value={cleanFormRestroomId}
                    onChange={e => setCleanFormRestroomId(e.target.value)}
                    style={styles.formSelect}
                  >
                    {accessibleRestrooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.floor})</option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>청소 작업 일시</label>
                  <input
                    type="text"
                    readOnly
                    value={new Date().toLocaleString('ko-KR')}
                    style={styles.formInputReadOnly}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>담당자 성명</label>
                  <input
                    type="text"
                    required
                    placeholder="예: 김철수 (환경미화팀)"
                    value={cleanFormWorker}
                    onChange={e => setCleanFormWorker(e.target.value)}
                    style={styles.formInput}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>작업 구분</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                    {['정기 청소', '위생 소독', '악취 조치', '비품 보충'].map(type => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => setCleanFormType(type)}
                        style={{
                          ...styles.chipBtn,
                          ...(cleanFormType === type ? styles.chipBtnActive : {})
                        }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>작업 및 조치 메모</label>
                  <textarea
                    rows={3}
                    placeholder="환기구 청소, 소독제 분무, 바닥 물청소 등 세부 메모"
                    value={cleanFormMemo}
                    onChange={e => setCleanFormMemo(e.target.value)}
                    style={styles.formTextarea}
                  />
                </div>

                <button type="submit" style={styles.cleanBtnSubmit}>
                  청소 완료 저장
                </button>
              </form>
            </div>

            {/* ③ 청소 이력 테이블 (FR-51) */}
            <div style={styles.panelCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>청소 이력 로그</h3>
                  <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>최신순 &middot; 담당 구역 총 {accessibleCleaningLogs.length}건</span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={cleanFilterRestroom}
                    onChange={e => setCleanFilterRestroom(e.target.value)}
                    style={styles.select}
                  >
                    <option value="ALL">전체 화장실</option>
                    {accessibleRestrooms.map(r => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thRow}>
                      <th style={styles.th}>작업 일시</th>
                      <th style={styles.th}>화장실 구역</th>
                      <th style={styles.th}>작업 구분</th>
                      <th style={styles.th}>담당자</th>
                      <th style={styles.th}>점검 메모</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessibleCleaningLogs
                      .filter(log => cleanFilterRestroom === 'ALL' || log.restroomName === cleanFilterRestroom)
                      .map(log => (
                        <tr key={log.id} style={styles.tr}>
                          <td style={styles.td}>{log.time}</td>
                          <td style={{ ...styles.td, fontWeight: '600' }}>{log.restroomName}</td>
                          <td style={styles.td}>
                            <span style={styles.cleanTypeTag}>{log.type}</span>
                          </td>
                          <td style={styles.td}>{log.worker}</td>
                          <td style={styles.td}>{log.memo}</td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            <span style={styles.statusPillSmall}>완료</span>
                          </td>
                        </tr>
                      ))}
                    {accessibleCleaningLogs.filter(log => cleanFilterRestroom === 'ALL' || log.restroomName === cleanFilterRestroom).length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b', fontSize: '13px' }}>
                          담당 구역의 청소 이력이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. 설정 전면 개편 화면 (SCR-06 명세 반영 - 3개 탭 구성) */}
      {activeTab === 'settings' && (
        <div style={{ padding: '20px 24px', maxWidth: '1280px', margin: '0 auto' }}>
          {/* 상단 서브 탭 (FR-60, FR-61, FR-64) */}
          <div style={styles.subTabNav}>
            <button
              onClick={() => setSettingsSubTab('thresholds')}
              style={{ ...styles.subTabBtn, ...(settingsSubTab === 'thresholds' ? styles.subTabBtnActive : {}) }}
            >
              환경 임계값 설정
            </button>
            <button
              onClick={() => {
                if (canAccessSettingSubTab('restrooms')) {
                  setSettingsSubTab('restrooms');
                } else {
                  showToast('화장실 시설 관리는 최고 개발자(DEVELOPER) 권한 전용입니다.');
                }
              }}
              style={{
                ...styles.subTabBtn,
                ...(settingsSubTab === 'restrooms' ? styles.subTabBtnActive : {}),
                opacity: canAccessSettingSubTab('restrooms') ? 1 : 0.6
              }}
            >
              화장실 시설 관리 {!canAccessSettingSubTab('restrooms') && <IconLock size={12} style={{ marginLeft: 4 }} />}
            </button>
            <button
              onClick={() => {
                if (canAccessSettingSubTab('system')) {
                  setSettingsSubTab('system');
                } else {
                  showToast('시스템 환경 설정은 최고 개발자(DEVELOPER) 권한 전용입니다.');
                }
              }}
              style={{
                ...styles.subTabBtn,
                ...(settingsSubTab === 'system' ? styles.subTabBtnActive : {}),
                opacity: canAccessSettingSubTab('system') ? 1 : 0.6
              }}
            >
              시스템 환경 설정 {!canAccessSettingSubTab('system') && <IconLock size={12} style={{ marginLeft: 4 }} />}
            </button>
          </div>

          {/* 탭 1: 환경 임계값 설정 (FR-61) */}
          {settingsSubTab === 'thresholds' && (
            <div style={styles.panelCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>환경 임계값 기준 설정</h3>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    센서값이 기준 이상이면 대시보드 상태가 주의·위험으로 바뀝니다.
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>적용 대상:</span>
                  <select
                    value={thresholdScope}
                    onChange={e => setThresholdScope(e.target.value)}
                    style={styles.select}
                  >
                    <option value="ALL">전체 기본값 적용</option>
                    {accessibleRestrooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name} (개별 설정)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={styles.thresholdGrid}>
                {/* 온도 설정 카드 */}
                <div style={styles.thresholdCard}>
                  <div style={styles.thresholdCardTitle}>
                    <IconThermometer /> 실내 온도 (℃)
                  </div>
                  <div style={styles.thresholdInputs}>
                    <div style={styles.thresholdInputCol}>
                      <label style={styles.thresholdLabel}>주의 기준 (이상)</label>
                      <input
                        type="number"
                        value={thresholds.tempWarn}
                        onChange={e => setThresholds({ ...thresholds, tempWarn: Number(e.target.value) })}
                        style={styles.thresholdInput}
                      />
                    </div>
                    <div style={styles.thresholdInputCol}>
                      <label style={styles.thresholdLabel}>위험 기준 (이상)</label>
                      <input
                        type="number"
                        value={thresholds.tempDanger}
                        onChange={e => setThresholds({ ...thresholds, tempDanger: Number(e.target.value) })}
                        style={styles.thresholdInput}
                      />
                    </div>
                  </div>
                  <div style={styles.thresholdHelper}>권장 쾌적 범위: 18℃ ~ 26℃</div>
                </div>

                {/* 습도 설정 카드 */}
                <div style={styles.thresholdCard}>
                  <div style={styles.thresholdCardTitle}>
                    <IconDroplet /> 실내 습도 (%)
                  </div>
                  <div style={styles.thresholdInputs}>
                    <div style={styles.thresholdInputCol}>
                      <label style={styles.thresholdLabel}>주의 기준 (이상)</label>
                      <input
                        type="number"
                        value={thresholds.humidWarn}
                        onChange={e => setThresholds({ ...thresholds, humidWarn: Number(e.target.value) })}
                        style={styles.thresholdInput}
                      />
                    </div>
                    <div style={styles.thresholdInputCol}>
                      <label style={styles.thresholdLabel}>위험 기준 (이상)</label>
                      <input
                        type="number"
                        value={thresholds.humidDanger}
                        onChange={e => setThresholds({ ...thresholds, humidDanger: Number(e.target.value) })}
                        style={styles.thresholdInput}
                      />
                    </div>
                  </div>
                  <div style={styles.thresholdHelper}>권장 쾌적 범위: 40% ~ 60%</div>
                </div>

                {/* 가스 설정 카드 */}
                <div style={styles.thresholdCard}>
                  <div style={styles.thresholdCardTitle}>
                    <IconWind /> 가스 센서 원시값
                  </div>
                  <div style={styles.thresholdInputs}>
                    <div style={styles.thresholdInputCol}>
                      <label style={styles.thresholdLabel}>주의 기준 (이상)</label>
                      <input
                        type="number"
                        value={thresholds.gasWarn}
                        onChange={e => setThresholds({ ...thresholds, gasWarn: Number(e.target.value) })}
                        style={styles.thresholdInput}
                      />
                    </div>
                    <div style={styles.thresholdInputCol}>
                      <label style={styles.thresholdLabel}>위험 기준 (이상)</label>
                      <input
                        type="number"
                        value={thresholds.gasDanger}
                        onChange={e => setThresholds({ ...thresholds, gasDanger: Number(e.target.value) })}
                        style={styles.thresholdInput}
                      />
                    </div>
                  </div>
                  <div style={styles.thresholdHelper}>MQ-135 센서 권장 기준: 400 / 700 PPM</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button
                  onClick={() => {
                    setThresholds({ tempWarn: 28, tempDanger: 32, humidWarn: 65, humidDanger: 80, gasWarn: 400, gasDanger: 700 });
                    showToast('임계값이 시스템 기본값으로 복원되었습니다.');
                  }}
                  style={styles.secondaryBtn}
                >
                  기본값 복원
                </button>
                <button onClick={() => showToast('임계값을 적용했습니다. 서버에는 저장되지 않고 이 화면 세션에만 반영됩니다.')} style={styles.primaryBtn}>
                  임계값 저장
                </button>
              </div>
            </div>
          )}

          {/* 탭 2: 화장실 시설 관리 (FR-60) - 최고 개발자 전용 */}
          {settingsSubTab === 'restrooms' && (
            canAccessSettingSubTab('restrooms') ? (
              <div style={styles.panelCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>등록 시설 및 기기 관리</h3>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>모니터링 대상 화장실과 아두이노 기기 매핑을 관리합니다.</span>
                  </div>

                  <button onClick={() => setIsAddRestroomModalOpen(true)} style={styles.primaryBtn}>
                    <IconPlus /> 신규 화장실 등록
                  </button>
                </div>

                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thRow}>
                      <th style={styles.th}>시설명</th>
                      <th style={styles.th}>층수</th>
                      <th style={styles.th}>구분</th>
                      <th style={styles.th}>아두이노 기기 ID</th>
                      <th style={styles.th}>상태</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>동작</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restrooms.map(r => (
                      <tr key={r.id} style={styles.tr}>
                        <td style={{ ...styles.td, fontWeight: '600' }}>{r.name}</td>
                        <td style={styles.td}>{r.floor}</td>
                        <td style={styles.td}>{genderLabel(r.gender)}</td>
                        <td style={{ ...styles.td, fontFamily: 'monospace' }}>{r.deviceId}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusPillSmall,
                            backgroundColor: r.isActive ? '#f0fdf4' : '#f1f5f9',
                            color: r.isActive ? '#166534' : '#64748b'
                          }}>
                            {r.isActive ? '사용 중' : '비활성'}
                          </span>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              onClick={() => handleToggleRestroomActive(r.id)}
                              style={{
                                ...styles.actionBtnSmall,
                                color: r.isActive ? '#d97706' : '#166534'
                              }}
                            >
                              {r.isActive ? '비활성화' : '활성화'}
                            </button>
                            <button
                              onClick={() => handleDeleteRestroom(r.id)}
                              style={{
                                ...styles.actionBtnSmall,
                                color: '#dc2626'
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ ...styles.panelCard, textAlign: 'center', padding: '60px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: '#64748b' }}>
                  <IconLock size={36} />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
                  화장실 시설 관리 접근 제한
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
                  신규 화장실 시설 등록 및 아두이노 기기 매핑 관리는 최고 개발자(DEVELOPER) 전용 권한입니다.
                </p>
                <button onClick={() => setSettingsSubTab('thresholds')} style={styles.primaryBtn}>
                  환경 임계값 설정으로 이동
                </button>
              </div>
            )
          )}

          {/* 탭 3: 시스템 환경 설정 (FR-64) - 최고 개발자 전용 */}
          {settingsSubTab === 'system' && (
            canAccessSettingSubTab('system') ? (
              <div style={styles.panelCard}>
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>시스템 주기 및 환경 파라미터</h3>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>모니터링 시스템의 핵심 타이머 및 인증키 설정입니다.</span>
                </div>

                <div style={styles.systemForm}>
                  <div style={styles.systemRow}>
                    <div style={styles.systemLabelCol}>
                      <div style={styles.systemLabelTitle}>센서 오프라인 판단 시간</div>
                      <div style={styles.systemLabelSub}>이 시간 동안 데이터 수신이 없으면 오프라인으로 전환합니다.</div>
                    </div>
                    <div style={styles.systemInputCol}>
                      <input
                        type="number"
                        value={systemSettings.offlineSeconds}
                        onChange={e => setSystemSettings({ ...systemSettings, offlineSeconds: Number(e.target.value) })}
                        style={styles.systemInput}
                      /> 초 (기본: 60초)
                    </div>
                  </div>

                  <div style={styles.systemRow}>
                    <div style={styles.systemLabelCol}>
                      <div style={styles.systemLabelTitle}>대시보드 실시간 갱신 주기</div>
                      <div style={styles.systemLabelSub}>프론트엔드가 백엔드 API를 폴링하는 주기입니다.</div>
                    </div>
                    <div style={styles.systemInputCol}>
                      <input
                        type="number"
                        value={systemSettings.refreshSeconds}
                        onChange={e => setSystemSettings({ ...systemSettings, refreshSeconds: Number(e.target.value) })}
                        style={styles.systemInput}
                      /> 초 (기본: 5초)
                    </div>
                  </div>

                  <div style={styles.systemRow}>
                    <div style={styles.systemLabelCol}>
                      <div style={styles.systemLabelTitle}>청소 경과 경고 기준</div>
                      <div style={styles.systemLabelSub}>마지막 청소 후 이 시간이 지나면 경고 알림을 표시합니다.</div>
                    </div>
                    <div style={styles.systemInputCol}>
                      <input
                        type="number"
                        value={systemSettings.cleanWarnHours}
                        onChange={e => setSystemSettings({ ...systemSettings, cleanWarnHours: Number(e.target.value) })}
                        style={styles.systemInput}
                      /> 시간 (기본: 8시간)
                    </div>
                  </div>

                  <div style={styles.systemRow}>
                    <div style={styles.systemLabelCol}>
                      <div style={styles.systemLabelTitle}>센서 원본 데이터 보관 기간</div>
                      <div style={styles.systemLabelSub}>지정 기간이 지난 센서 측정 로그는 자동 정리됩니다.</div>
                    </div>
                    <div style={styles.systemInputCol}>
                      <input
                        type="number"
                        value={systemSettings.retentionDays}
                        onChange={e => setSystemSettings({ ...systemSettings, retentionDays: Number(e.target.value) })}
                        style={styles.systemInput}
                      /> 일 (기본: 30일)
                    </div>
                  </div>

                  <div style={styles.systemRow}>
                    <div style={styles.systemLabelCol}>
                      <div style={styles.systemLabelTitle}>기기 수집 인증키 (X-Device-Key)</div>
                      <div style={styles.systemLabelSub}>아두이노 패킷 전송 시 헤더에 포함되는 시크릿 키입니다.</div>
                    </div>
                    <div style={styles.systemInputCol}>
                      <input
                        type="text"
                        readOnly
                        value={systemSettings.deviceKey}
                        style={{ ...styles.systemInput, width: '220px', fontFamily: 'monospace', color: '#64748b' }}
                      />
                      <button
                        onClick={() => {
                          const newK = 'TCP-SEC-' + Math.random().toString(36).substring(2, 10).toUpperCase();
                          setSystemSettings({ ...systemSettings, deviceKey: newK });
                          showToast('새 인증키가 발급되었습니다.');
                        }}
                        style={{ ...styles.secondaryBtn, marginLeft: '6px' }}
                      >
                        재발급
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => showToast('시스템 설정이 저장되었습니다.')} style={styles.primaryBtn}>
                    시스템 설정 저장
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ ...styles.panelCard, textAlign: 'center', padding: '60px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: '#64748b' }}>
                  <IconLock size={36} />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
                  시스템 환경 설정 접근 제한
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
                  센서 주기, 보관 기간 및 X-Device-Key 발급 관리는 최고 개발자(DEVELOPER) 전용 권한입니다.
                </p>
                <button onClick={() => setSettingsSubTab('thresholds')} style={styles.primaryBtn}>
                  환경 임계값 설정으로 이동
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* 신규 화장실 등록 모달 (FR-60) */}
      {isAddRestroomModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>신규 화장실 시설 등록</h3>
              <button onClick={() => setIsAddRestroomModalOpen(false)} style={styles.modalClose}>&times;</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>화장실 명칭</label>
                <input
                  type="text"
                  placeholder="예: 4F 남자 화장실"
                  value={newRestroomName}
                  onChange={e => setNewRestroomName(e.target.value)}
                  style={styles.formInput}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>설치 층수</label>
                  <select
                    value={newRestroomFloor}
                    onChange={e => setNewRestroomFloor(e.target.value)}
                    style={styles.formSelect}
                  >
                    <option value="B1F">지하 1층 (B1F)</option>
                    <option value="1F">1층 (1F)</option>
                    <option value="2F">2층 (2F)</option>
                    <option value="3F">3층 (3F)</option>
                    <option value="4F">4층 (4F)</option>
                    <option value="옥상">옥상</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>구분</label>
                  <select
                    value={newRestroomGender}
                    onChange={e => setNewRestroomGender(e.target.value)}
                    style={styles.formSelect}
                  >
                    <option value="남">남성용</option>
                    <option value="여">여성용</option>
                    <option value="공용">남녀 공용</option>
                  </select>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>아두이노 기기 식별자 (deviceId)</label>
                <input
                  type="text"
                  placeholder="예: WC-4F-M-01"
                  value={newRestroomDeviceId}
                  onChange={e => setNewRestroomDeviceId(e.target.value)}
                  style={styles.formInput}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setIsAddRestroomModalOpen(false)} style={styles.secondaryBtn}>취소</button>
              <button onClick={handleAddRestroom} style={styles.primaryBtn}>등록 완료</button>
            </div>
          </div>
        </div>
      )}

      {/* 대시보드 퀵 청소 모달 */}
      {isCleaningModalOpen && cleaningTarget && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>청소 완료 등록: {cleaningTarget.name}</h3>
              <button onClick={() => setIsCleaningModalOpen(false)} style={styles.modalClose}>&times;</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>기록 시각</label>
                <input type="text" readOnly value={new Date().toLocaleString('ko-KR')} style={styles.formInputReadOnly} />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>담당자 성명</label>
                <input
                  type="text"
                  value={quickCleaningWorker}
                  onChange={e => setQuickCleaningWorker(e.target.value)}
                  style={styles.formInput}
                  placeholder="담당자 입력"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>점검 메모</label>
                <textarea
                  rows={3}
                  value={quickCleaningMemo}
                  onChange={e => setQuickCleaningMemo(e.target.value)}
                  style={styles.formTextarea}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setIsCleaningModalOpen(false)} style={styles.secondaryBtn}>취소</button>
              <button onClick={handleSaveQuickCleaning} style={styles.primaryBtn}>등록 완료</button>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 전용 긴급 출동 지시 & 인원 배정 팝업 모달 */}
      {isDispatchModalOpen && (
        <div style={styles.dispatchModalOverlay} onClick={() => setIsDispatchModalOpen(false)}>
          <div style={styles.dispatchModalContent} onClick={e => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div style={styles.dispatchModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <IconMegaphone size={16} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
                    현장 출동 지시 및 담당 인원 배정
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    출동 대상 구역과 투입 인원을 선택하여 즉시 현장 작업을 지시합니다.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                style={styles.modalClose}
                aria-label="닫기"
              >
                &times;
              </button>
            </div>

            {/* 모달 본문 */}
            <div style={styles.dispatchModalBody}>
              {/* 1. 대상 구역 선택 */}
              <div style={styles.formGroup}>
                <label style={styles.dispatchSectionLabel}>
                  <IconMap /> 1. 출동 대상 구역 선택
                </label>
                <select
                  value={dispatchTargetId}
                  onChange={e => {
                    const value = e.target.value;
                    // 개별 구역은 숫자 ID로 보관해야 목록의 구역과 일치합니다.
                    setDispatchTargetId(value.startsWith('ALL_') ? value : Number(value));
                  }}
                  style={styles.formSelect}
                >
                  <option value="ALL_DELAYED">
                    {`🚨 청소 기준 초과 구역 일괄 (${accessibleRestrooms.filter(r => r.lastCleanedHours >= systemSettings.cleanWarnHours).length}개소)`}
                  </option>
                  <option value="ALL_ACCESSIBLE">
                    {`🏢 전체 담당 구역 (${accessibleRestrooms.length}개소)`}
                  </option>
                  <optgroup label="개별 화장실 구역 선택">
                    {accessibleRestrooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.floor}) - {r.lastCleanedHours == null ? '청소 기록 없음' : r.lastCleanedHours >= systemSettings.cleanWarnHours ? `⚠️ ${r.lastCleanedHours}시간 경과 (지연)` : `${r.lastCleanedHours}시간 전 청소`}
                      </option>
                    ))}
                  </optgroup>
                </select>

                {/* 대상 구역 상세 정보 카드 */}
                {dispatchTargetId === 'ALL_DELAYED' ? (
                  <div style={styles.dispatchTargetHint}>
                    {accessibleRestrooms.filter(r => r.lastCleanedHours >= systemSettings.cleanWarnHours).length > 0 ? (
                      <span>
                        지연 대상: <strong>{accessibleRestrooms.filter(r => r.lastCleanedHours >= systemSettings.cleanWarnHours).map(r => `${r.name}(${r.lastCleanedHours}시간 경과)`).join(', ')}</strong>
                      </span>
                    ) : (
                      <span>현재 {systemSettings.cleanWarnHours}시간 이상 지연된 구역이 없습니다. (전체 담당 구역으로 일괄 발령 가능)</span>
                    )}
                  </div>
                ) : (
                  (() => {
                    const sel = restrooms.find(r => r.id === dispatchTargetId);
                    return sel ? (
                      <div style={styles.dispatchTargetHint}>
                        선택 구역: <strong>{sel.name}</strong> &middot; 상태: <strong>{sel.status}</strong> &middot; MQ-135 ADC: <strong>{formatReading(sel.gas)} ADC</strong> &middot; 마지막 청소: {sel.lastCleanedHours}시간 전 ({sel.cleanWorker})
                      </div>
                    ) : null;
                  })()
                )}
              </div>

              {/* 2. 출동 인원 선택 */}
              <div style={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={styles.dispatchSectionLabel}>
                    <IconUsers /> 2. 출동 인원 선택
                    <span style={{ marginLeft: '6px', fontSize: '11px', color: '#2563eb', fontWeight: '700' }}>
                      ({selectedCleanerIds.length}명 선택됨)
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleSelectAllAvailableCleaners}
                      style={styles.cleanerQuickBtn}
                    >
                      대기 인원 전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCleanerIds(['cleaner1'])}
                      style={styles.cleanerQuickBtn}
                    >
                      기본 1인
                    </button>
                  </div>
                </div>

                {/* 미화 인원 선택 그리드 */}
                <div style={styles.cleanerGrid}>
                  {AVAILABLE_CLEANERS.map(cleaner => {
                    const isSelected = selectedCleanerIds.includes(cleaner.id);
                    return (
                      <div
                        key={cleaner.id}
                        onClick={() => handleToggleCleaner(cleaner.id)}
                        style={{
                          ...styles.cleanerCard,
                          borderColor: isSelected ? '#2563eb' : '#e2e8f0',
                          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                          boxShadow: isSelected ? '0 0 0 1px #2563eb' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <div style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '50%',
                              backgroundColor: isSelected ? '#2563eb' : '#f1f5f9',
                              color: isSelected ? '#ffffff' : '#475569',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: '700'
                            }}>
                              {cleaner.name.slice(0, 1)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap' }}>
                                {cleaner.name}
                                <span style={{ marginLeft: '5px', fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                                  {cleaner.team}
                                </span>
                              </div>
                              <div title={cleaner.roleDesc} style={{ fontSize: '11px', color: '#475569', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {cleaner.roleDesc}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: '600',
                              whiteSpace: 'nowrap',
                              backgroundColor: cleaner.isAvailable ? '#f0fdf4' : '#fffbeb',
                              color: cleaner.isAvailable ? '#166534' : '#b45309',
                              border: cleaner.isAvailable ? '1px solid #bbf7d0' : '1px solid #fde68a'
                            }}>
                              <span style={{
                                width: '5px',
                                height: '5px',
                                borderRadius: '50%',
                                backgroundColor: cleaner.isAvailable ? '#16a34a' : '#d97706'
                              }} />
                              {cleaner.status}
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                              <IconPhone size={10} /> {cleaner.phone}
                            </span>
                          </div>
                        </div>

                        {/* 하단 체크 상태 표시 */}
                        <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                          <span style={{ color: isSelected ? '#2563eb' : '#94a3b8', fontWeight: isSelected ? '600' : '400', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {isSelected ? <IconCheckCircle size={12} color="#2563eb" /> : <span style={{ width: '12px', height: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', display: 'inline-block' }} />}
                            {isSelected ? '출동 배정 인원' : '클릭하여 선택'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. 출동 유형 및 긴급도 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.dispatchSectionLabel}>
                    <IconSliders /> 3. 지시 유형
                  </label>
                  <select
                    value={dispatchType}
                    onChange={e => setDispatchType(e.target.value)}
                    style={styles.formSelect}
                  >
                    <option value="긴급 바닥 청소 및 살균 소독">긴급 바닥 청소 및 살균 소독</option>
                    <option value="악취 원인 점검 및 환기 가동">악취 원인 점검 및 환기 가동</option>
                    <option value="화장지/비누 비품 긴급 보충">화장지/비누 비품 긴급 보충</option>
                    <option value="세면대/변기 배수 점검 및 정비">세면대/변기 배수 점검 및 정비</option>
                    <option value="전체 특별 정밀 위생 점검">전체 특별 정밀 위생 점검</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.dispatchSectionLabel}>
                    <IconAlertCircle size={12} /> 4. 긴급도
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[
                      { key: 'EMERGENCY', label: '긴급 (즉시)', bg: '#fef2f2', activeBg: '#dc2626', color: '#991b1b' },
                      { key: 'NORMAL', label: '보통 (30분내)', bg: '#eff6ff', activeBg: '#2563eb', color: '#1e40af' },
                      { key: 'ROUTINE', label: '순찰 점검', bg: '#f8fafc', activeBg: '#475569', color: '#334155' }
                    ].map(u => (
                      <button
                        type="button"
                        key={u.key}
                        onClick={() => setDispatchUrgency(u.key)}
                        style={{
                          flex: 1,
                          padding: '7px 4px',
                          borderRadius: '4px',
                          border: dispatchUrgency === u.key ? 'none' : '1px solid #cbd5e1',
                          backgroundColor: dispatchUrgency === u.key ? u.activeBg : u.bg,
                          color: dispatchUrgency === u.key ? '#ffffff' : u.color,
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4. 현장 작업 지시 메모 */}
              <div style={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={styles.dispatchSectionLabel}>
                    <IconFileText /> 5. 현장 전달 지시 사항
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setDispatchMemo(`청소 기준 시간(${systemSettings.cleanWarnHours}시간) 초과 구역 현장 점검 및 즉시 바닥 소독 요망`)}
                      style={styles.memoQuickBtn}
                    >
                      #시간초과
                    </button>
                    <button
                      type="button"
                      onClick={() => setDispatchMemo('악취 센서 수치 상승으로 인한 긴급 환풍기 가동 및 배수구 점검 요망')}
                      style={styles.memoQuickBtn}
                    >
                      #악취상승
                    </button>
                    <button
                      type="button"
                      onClick={() => setDispatchMemo('화장지 및 세정제 소진 신고 접수. 비품 보충 및 세면대 정비 요망')}
                      style={styles.memoQuickBtn}
                    >
                      #비품보충
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={dispatchMemo}
                  onChange={e => setDispatchMemo(e.target.value)}
                  placeholder="현장 출동 인원에게 전달할 특이사항이나 지시사항을 입력하세요."
                  style={styles.formTextarea}
                />
              </div>
            </div>

            {/* 모달 푸터 */}
            <div style={styles.dispatchModalFooter}>
              <div style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: '600', color: '#0f172a' }}>배정 인원:</span>
                <span style={{ color: '#2563eb', fontWeight: '700' }}>
                  {AVAILABLE_CLEANERS.filter(c => selectedCleanerIds.includes(c.id)).map(c => c.name).join(', ') || '없음'}
                </span>
                <span style={{ color: '#64748b' }}>({selectedCleanerIds.length}명)</span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  style={styles.secondaryBtn}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDispatch}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: dispatchUrgency === 'EMERGENCY' ? '#dc2626' : '#2563eb',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  <IconSend size={13} /> 출동 지시 발령 ({selectedCleanerIds.length}명)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 엄격하게 정제된 모노크롬 / 슬레이트 스타일
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#fafafa',
    fontFamily: '"Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    color: '#0f172a',
    letterSpacing: '-0.2px'
  },
  header: {
    height: '56px',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    borderBottom: '1px solid #e2e8f0',
    gap: '16px',
    overflowX: 'auto'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexShrink: 0
  },
  brandTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    whiteSpace: 'nowrap'
  },
  brandBadge: {
    padding: '2px 6px',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    color: '#475569',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap'
  },
  headerTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '600',
    letterSpacing: '-0.3px',
    color: '#0f172a',
    whiteSpace: 'nowrap'
  },
  navMenu: {
    display: 'flex',
    gap: '2px'
  },
  navItem: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#64748b',
    fontSize: '13px',
    fontWeight: '500',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap'
  },
  navItemActive: {
    color: '#0f172a',
    backgroundColor: '#f1f5f9',
    fontWeight: '600'
  },
  alertBadge: {
    marginLeft: '5px',
    backgroundColor: '#0f172a',
    color: '#fff',
    fontSize: '11px',
    padding: '1px 5px',
    borderRadius: '999px',
    fontWeight: '600'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    flexShrink: 0
  },
  lastUpdateText: {
    fontSize: '12px',
    color: '#64748b',
    whiteSpace: 'nowrap'
  },
  userInfo: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#475569',
    whiteSpace: 'nowrap'
  },
  logoutBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #cbd5e1',
    color: '#64748b',
    padding: '5px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontWeight: '600',
    whiteSpace: 'nowrap'
  },
  toast: {
    position: 'fixed',
    top: '68px',
    right: '20px',
    backgroundColor: '#0f172a',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 9999,
    fontSize: '12px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center'
  },
  mainContent: {
    maxWidth: '1380px',
    margin: '0 auto',
    padding: '16px 20px'
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    marginBottom: '16px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
  },
  toolbarTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#0f172a',
    whiteSpace: 'nowrap'
  },
  toolbarActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0
  },
  panelEmpty: {
    padding: '24px 12px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '13px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '10px',
    marginBottom: '16px'
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
  },
  summaryCardActive: {
    borderColor: '#0f172a',
    boxShadow: '0 0 0 1px #0f172a'
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#475569',
    fontWeight: '500',
    marginBottom: '2px',
    whiteSpace: 'nowrap'
  },
  summaryValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: '-0.3px'
  },
  filterBar: {
    backgroundColor: '#ffffff',
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center'
  },
  filterLabel: {
    fontSize: '13px',
    color: '#475569',
    fontWeight: '500',
    marginRight: '6px',
    whiteSpace: 'nowrap'
  },
  select: {
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    color: '#334155',
    backgroundColor: '#fff'
  },
  dashboardBody: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 300px',
    gap: '16px'
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 0
  },
  restroomGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
    gap: '12px'
  },
  restroomCard: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '14px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '164px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    transition: 'all 0.15s ease'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '6px'
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: '-0.3px',
    lineHeight: '1.3',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  cardSub: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '2px',
    letterSpacing: '-0.2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  statusPill: {
    padding: '3px 8px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    letterSpacing: '-0.2px',
    whiteSpace: 'nowrap',
    flexShrink: 0
  },
  statusPillSmall: {
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    whiteSpace: 'nowrap'
  },
  pillDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%'
  },
  offlineBox: {
    backgroundColor: '#f8fafc',
    padding: '10px',
    borderRadius: '6px',
    textAlign: 'center',
    fontSize: '11px',
    color: '#64748b',
    margin: '6px 0',
    border: '1px dashed #cbd5e1'
  },
  metricsBox: {
    backgroundColor: '#f8fafc',
    padding: '9px 12px',
    borderRadius: '6px',
    border: '1px solid #eef2f6',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    margin: '8px 0 10px 0'
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  metricName: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#475569',
    letterSpacing: '-0.2px'
  },
  metricVal: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#0f172a',
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '2px',
    fontVariantNumeric: 'tabular-nums'
  },
  unitText: {
    fontSize: '11px',
    fontWeight: '500',
    color: '#64748b',
    marginLeft: '2px'
  },
  metricsRow: {
    backgroundColor: '#f8fafc',
    padding: '9px 12px',
    borderRadius: '6px',
    border: '1px solid #eef2f6',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    margin: '8px 0 10px 0'
  },
  metricItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  metricLabel: {
    fontSize: '11px',
    fontWeight: '500',
    color: '#64748b',
    letterSpacing: '-0.2px'
  },
  metricValue: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#0f172a',
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '2px',
    fontVariantNumeric: 'tabular-nums'
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '8px',
    borderTop: '1px solid #f1f5f9'
  },
  timeAgo: {
    fontSize: '11px',
    color: '#64748b'
  },
  cleanBtn: {
    backgroundColor: '#ffffff',
    color: '#334155',
    border: '1px solid #cbd5e1',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  quickCleanBtn: {
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#334155',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px'
  },
  chartPanel: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    marginTop: '0'
  },
  chartSection: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '16px 20px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    marginTop: '16px'
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    gap: '12px'
  },
  chartTitle: {
    margin: '0 0 2px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden'
  },
  chartSub: {
    fontSize: '12px',
    color: '#64748b',
    display: 'block',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  rangeTabs: {
    display: 'flex',
    gap: '2px',
    backgroundColor: '#f1f5f9',
    padding: '2px',
    borderRadius: '6px',
    flexShrink: 0
  },
  rangeBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#64748b',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  rangeBtnActive: {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontWeight: '600'
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 0
  },
  panelCard: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  panelTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: '700',
    color: '#0f172a',
    whiteSpace: 'nowrap'
  },
  panelLink: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  alertList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  alertItem: {
    padding: '10px',
    borderRadius: '4px',
    backgroundColor: '#f8fafc',
    border: '1px solid #f1f5f9'
  },
  alertTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '3px'
  },
  alertTime: {
    fontSize: '11px',
    color: '#64748b'
  },
  alertRestroom: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#1e293b'
  },
  alertBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  alertMemo: {
    fontSize: '12px',
    color: '#475569',
    lineHeight: '1.5'
  },
  checkBtn: {
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    color: '#334155',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontWeight: '600',
    whiteSpace: 'nowrap'
  },
  checkedText: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: '500'
  },
  cleaningList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  cleaningRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '7px',
    borderBottom: '1px solid #f1f5f9'
  },
  cleaningName: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#334155'
  },
  cleaningStatusTicker: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '8px'
  },
  tickerCard: {
    padding: '8px 10px',
    borderRadius: '8px'
  },
  cleanBtnSubmit: {
    width: '100%',
    padding: '8px 0',
    backgroundColor: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '6px'
  },
  cleanTypeTag: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500'
  },
  chipBtn: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    padding: '6px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#64748b',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  chipBtnActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
    color: '#ffffff',
    fontWeight: '600'
  },
  subTabNav: {
    display: 'flex',
    gap: '4px',
    marginBottom: '16px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '8px'
  },
  subTabBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
    cursor: 'pointer',
    borderRadius: '6px',
    whiteSpace: 'nowrap'
  },
  subTabBtnActive: {
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    fontWeight: '600'
  },
  thresholdGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
    marginBottom: '16px'
  },
  thresholdCard: {
    backgroundColor: '#f8fafc',
    padding: '14px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0'
  },
  thresholdCardTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px'
  },
  thresholdInputs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px'
  },
  thresholdInputCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  thresholdLabel: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: '500'
  },
  thresholdInput: {
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    backgroundColor: '#ffffff',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0
  },
  thresholdHelper: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '10px'
  },
  systemForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  systemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '12px',
    borderBottom: '1px solid #f1f5f9'
  },
  systemLabelCol: {
    maxWidth: '450px'
  },
  systemLabelTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#0f172a'
  },
  systemLabelSub: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px'
  },
  systemInputCol: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '11px',
    color: '#64748b'
  },
  systemInput: {
    width: '60px',
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    marginRight: '6px',
    textAlign: 'center'
  },
  actionBtnSmall: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  mapFloatingCard: {
    position: 'absolute',
    top: '14px',
    left: '14px',
    backgroundColor: '#ffffff',
    padding: '10px 14px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    zIndex: 10,
    maxWidth: '260px',
    border: '1px solid #e2e8f0'
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px'
  },
  table: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    borderCollapse: 'collapse',
    overflow: 'hidden',
    border: '1px solid #e2e8f0'
  },
  thRow: {
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0'
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '600',
    color: '#64748b',
    whiteSpace: 'nowrap'
  },
  tr: {
    borderBottom: '1px solid #f1f5f9'
  },
  td: {
    padding: '8px 12px',
    fontSize: '12px',
    color: '#334155'
  },
  primaryBtn: {
    backgroundColor: '#0f172a',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  },
  secondaryBtn: {
    backgroundColor: '#ffffff',
    color: '#475569',
    border: '1px solid #cbd5e1',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  modalContent: {
    backgroundColor: '#ffffff',
    width: '380px',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0'
  },
  modalHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  modalClose: {
    background: 'transparent',
    border: 'none',
    fontSize: '18px',
    lineHeight: 1,
    cursor: 'pointer',
    color: '#64748b'
  },
  modalBody: {
    padding: '16px'
  },
  formGroup: {
    marginBottom: '10px'
  },
  formLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '500',
    color: '#64748b',
    marginBottom: '4px'
  },
  formInput: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    boxSizing: 'border-box'
  },
  formSelect: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    backgroundColor: '#fff',
    boxSizing: 'border-box'
  },
  formInputReadOnly: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    color: '#64748b',
    fontSize: '12px',
    boxSizing: 'border-box'
  },
  formTextarea: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  modalFooter: {
    padding: '10px 16px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '6px'
  },
  dispatchModalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(2px)'
  },
  dispatchModalContent: {
    backgroundColor: '#ffffff',
    width: '600px',
    maxWidth: '94vw',
    maxHeight: '90vh',
    borderRadius: '8px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  dispatchModalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  dispatchModalBody: {
    padding: '18px 20px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  dispatchModalFooter: {
    padding: '12px 20px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dispatchSectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '6px'
  },
  dispatchTargetHint: {
    marginTop: '5px',
    padding: '6px 10px',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    fontSize: '11px',
    color: '#475569',
    border: '1px solid #e2e8f0'
  },
  cleanerQuickBtn: {
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  },
  cleanerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px'
  },
  cleanerCard: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  memoQuickBtn: {
    padding: '1px 6px',
    fontSize: '11px',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    cursor: 'pointer'
  }
};
