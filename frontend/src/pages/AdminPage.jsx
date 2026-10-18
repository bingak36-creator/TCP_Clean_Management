import { buildRestroomsFromBackend, filterZoneRecords } from '../domain/monitoring';
import { facilityPayload, SENSOR_TYPES } from '../domain/facility';
import { emptyChecklist, createChecklistCoordinator, businessDate, applyCleaningRecord, completeCleaning, recordToLog } from '../domain/operations';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLES, ROLE_INFO } from '../auth/AuthContext';
import { CustomOverlayMap, MapMarker } from 'react-kakao-maps-sdk';
import Map from '../components/KakaoMapFrame';
import { searchKakaoPlaces } from '../api/searchApi';
import SensorDataStatus from '../components/SensorDataStatus';
import { fetchSensorDevices, fetchSensorHistory, snapshotToRestroom, formatReading } from '../api/sensorApi';
import {
  fetchAdminZones,
  saveZoneThresholdsApi,
  createDispatchApi,
  rotateDeviceKeyApi,
  revokeDeviceKeyApi,
  createBackendZone,
  updateFacilityApi,
  deleteBackendZone,
  toggleZoneActiveApi,
  fetchAdminAlertsApi,
  resolveAlertApi,
  resolveAllAlertsApi,
  fetchCleaningRecordsApi,
  createCleaningRecordApi,
  fetchSensorsApi,
  createBackendSensor,
  updateBackendSensorApi,
  deleteBackendSensorApi,
  fetchDeviceSetsApi,
  fetchDeviceSetHistoryApi,
  createDeviceSetApi,
  updateDeviceSetApi,
  deleteDeviceSetApi,
  fetchWorkersApi,
  createWorkerApi,
  deleteWorkerApi,
  fetchSystemSettingsApi,
  updateSystemSettingsApi,
  fetchDailyChecklistApi,
  toggleDailyChecklistApi,
  batchUpdateDailyChecklistApi,
  fetchUsersApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  fetchUpstashStatusApi,
  parseUtcDate, assignZoneWorkerApi, updateWorkerApi, updateWorkerStatusApi, fetchDiscoveredDevicesApi, dismissDiscoveredDeviceApi
} from '../api/backendApi';
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

const IconMapPin = ({ size = 13, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
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
const statusStyle = (status) => STATUS_STYLES[status] || { ...STATUS_STYLES.OFFLINE, label: status === 'NO_DATA' ? '측정 없음' : status === 'INACTIVE' ? '운영 중지' : '상태 확인 필요' };

// 서버는 수신 여부만 알려주므로, 실측 장치는 임계값을 넘는 값이 있을 때 주의·위험으로 바꿉니다.
const withLiveStatus = (row) => {
  if (row.isActive === false) return { ...row, status: 'INACTIVE' };
  if (row.stale || row.status === 'STALE') return { ...row, status: 'OFFLINE' };
  return row;
};

// 백엔드 MySQL DB의 Zone 목록과 실시간 센서 디바이스, 담당 청소관리인(Worker), 청소 이력을 매핑하는 헬퍼 함수

// 서버 스냅샷으로 갱신하되, 화면에서 기록한 청소 정보와 화면에서 등록한 구역은 30초마다 지워지지 않게 합니다.
// 주의: 이 파일은 지도 컴포넌트를 Map이라는 이름으로 가져오므로 내장 Map을 쓰지 않습니다.
const mergeLiveRows = (previous, liveRows) => {
  if (!liveRows || liveRows.length === 0) return [];
  const liveIds = liveRows.map(r => r.id);
  const isFromDb = liveRows.some(r => r.isFromDb);

  const merged = liveRows.map(row => {
    const old = previous.find(r => r.id === row.id);
    if (!old) return row;
    const resolvedWorker = row.cleanWorker || '담당자 미지정';
    const resolvedWorkerId = row.assignedWorkerId ?? null;
    return {
      ...row,
      assignedWorkerId: resolvedWorkerId,
      cleanWorker: resolvedWorker,
      lastCleanedHours: row.lastCleanedHours ?? old.lastCleanedHours,
      gender: old.gender || row.gender,
      floor: old.floor || row.floor
    };
  });

  if (isFromDb) {
    // DB 데이터가 있으면 이전의 더미 데이터는 제거하고 DB 데이터 기준으로 완전 교체
    return merged;
  }
  return [...merged, ...previous.filter(r => !r.isLive && !liveIds.includes(r.id))];
};

// 초기 상태 (백엔드 MySQL DB로부터 실제 관제 데이터 로드)
const INITIAL_RESTROOMS = [];
const INITIAL_ALERTS = [];
const INITIAL_CLEANING_LOGS = [];
const INITIAL_PACKET_LOGS = [];

// 측정 이력이 없을 때는 가짜 데이터를 생성하지 않고 빈 배열을 반환합니다.
const buildFallbackHistoryPoints = () => [];

const MONO_FONT = '"SF Mono", "Fira Code", Menlo, monospace';

const genderLabel=gender=>gender==='공용'?'공용':gender==='남'?'남성용':gender==='여'?'여성용':'구분 미등록';

// 출동 가능한 위생 미화 인원 명단

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, logout, canAccessZone, canViewTab, canAccessSettingSubTab } = useAuth();
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
  const [selectedRestroom, setSelectedRestroom] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [historyPoints, setHistoryPoints] = useState([]);
  const [chartRange, setChartRange] = useState('1h');
  const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date().toLocaleTimeString('ko-KR'));

  // 필터 및 정렬
  const [filterFloor, setFilterFloor] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('DANGER_FIRST');

  // 청소 관리 페이지 전용 상태 (SCR-05)
  const [cleanFilterRestroom, setCleanFilterRestroom] = useState('ALL');
  const [cleanFormRestroomId, setCleanFormRestroomId] = useState('');
  const [cleanFormWorker, setCleanFormWorker] = useState(user?.username === 'cleaner' ? '이순신 (위생미화)' : user?.username || '관리자');
  const [cleanFormType, setCleanFormType] = useState('정기 청소');
  const [cleanFormMemo, setCleanFormMemo] = useState('');

  // 설정 페이지 전용 서브탭 및 상태 (SCR-06)
  const [settingsSubTab, setSettingsSubTab] = useState('thresholds'); // 'thresholds', 'restrooms', 'system'
  const [thresholdScope, setThresholdScope] = useState('ALL'); // 'ALL' 또는 restroomId
  const [thresholds, setThresholds] = useState({tempWarn:28,tempDanger:35,humidWarn:70,humidDanger:85,gasWarn:400,gasDanger:700});
  const [systemSettings, setSystemSettings] = useState({offlineSeconds:90,refreshSeconds:30,cleanWarnHours:4});
  const [appliedSettings, setAppliedSettings] = useState({offlineSeconds:90,refreshSeconds:30,cleanWarnHours:4});
  const [issuedCredential, setIssuedCredential] = useState(null);
  const checklistScope = useRef(createChecklistCoordinator());
  const checklistDay = businessDate();
  const [upstashStatus, setUpstashStatus] = useState(null);
  const [deviceSets, setDeviceSets] = useState([]);

  // 미화원(청소관리인) 인원 DB 상태 및 등록/배정 모달 상태
  const [workers, setWorkers] = useState([]);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState(null);
  const [workerFormName, setWorkerFormName] = useState('');
  const [workerFormPhone, setWorkerFormPhone] = useState('');
  const [workerFormRole, setWorkerFormRole] = useState('환경미화 1팀 (주간 전담)');
  const [workerFormStatus, setWorkerFormStatus] = useState('AVAILABLE');
  const [workerFormZoneId, setWorkerFormZoneId] = useState('');

  const cleanersList = useMemo(() => {
    if (workers && workers.length > 0) {
      return workers.map(w => ({
        id: String(w.id),
        name: w.name,
        team: w.role || '위생기동반',
        roleDesc: w.role || '현장 점검 관리',
        assignedZoneId: w.assignedZoneId ?? null,
        status: w.status === 'AVAILABLE' ? '대기 중 (즉시 출동)' : w.status === 'DISPATCHED' ? '현장 작업 중' : '휴무',
        rawStatus: w.status || 'AVAILABLE',
        isAvailable: w.status === 'AVAILABLE',
        phone: w.phone
      }));
    }
    return [];
  }, [workers]);

  // 임계값을 바꾸면 실측 장치의 상태도 바로 다시 계산합니다.
  const restrooms = useMemo(() => rawRestrooms.map(r => withLiveStatus(r, thresholds)), [rawRestrooms, thresholds]);

  // 구역 신규 등록 모달 (POST /api/dev/zones 및 /api/admin/zones)
  const [isAddZoneModalOpen, setIsAddZoneModalOpen] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFloor, setNewZoneFloor] = useState('1F');
  const [newZoneAddress, setNewZoneAddress] = useState('');
  const [newZoneLat, setNewZoneLat] = useState('');
  const [newZoneLng, setNewZoneLng] = useState('');
  const [newZoneType, setNewZoneType] = useState('TOILET');

  // 구역(화장실) 정보 수정 모달 (PUT /api/dev/zones/{id})
  const [isEditZoneModalOpen, setIsEditZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState(null);

  // 기기 세트 수정 모달 (PATCH /api/admin/device-sets/{id})
  const [isEditDeviceSetModalOpen, setIsEditDeviceSetModalOpen] = useState(false);
  const [editingDeviceSet, setEditingDeviceSet] = useState(null);

  // 센서 단독 추가 및 개별 센서 목록 관리 (GET/POST/PATCH/DELETE /api/dev/sensors)
  const [sensorsList, setSensorsList] = useState([]);
  const [isAddSensorModalOpen, setIsAddSensorModalOpen] = useState(false);
  const [newSensorData, setNewSensorData] = useState({
    zoneId: '',
    sensorType: 'TEMP_HUMID'
  });

  // 시스템 계정 및 구역 권한 관리 상태 (GET/POST/PUT/DELETE /api/admin/users)
  const [usersList, setUsersList] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    role: 'CLEANER',
    zoneIds: []
  });

  // 기기 세트 변경 이력 모달 (GET /api/admin/device-sets/{id}/history)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [deviceSetHistories, setDeviceSetHistories] = useState([]);
  const [historyDeviceSetTitle, setHistoryDeviceSetTitle] = useState('');

  // 화장실/신규 노드 등록 모달 상태 (개발자 대시보드 및 설정 탭 내)
  const [isAddRestroomModalOpen, setIsAddRestroomModalOpen] = useState(false);
  const [newRestroomName, setNewRestroomName] = useState('');
  const [newRestroomFloor, setNewRestroomFloor] = useState('1F');
  const [newRestroomGender, setNewRestroomGender] = useState('남');
  const [newRestroomDeviceId, setNewRestroomDeviceId] = useState('');
  const [newRestroomLat, setNewRestroomLat] = useState('');
  const [newRestroomLng, setNewRestroomLng] = useState('');
  const [newRestroomWorkerId, setNewRestroomWorkerId] = useState('');
  const [isGpsLocating, setIsGpsLocating] = useState(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState('');

  // 관리자 전용 미등록 IoT 기기 감지 대기 목록
  const [discoveredDevices, setDiscoveredDevices] = useState([]);

  // 웹 지도 핀 찍기 및 주소 검색 위치 선택기 상태 (Location Picker)
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState('restroom'); // 'restroom' | 'zone' | 'editZone'
  const [pickerLat, setPickerLat] = useState(37.566826);
  const [pickerLng, setPickerLng] = useState(126.978656);
  const [pickerMapCenter, setPickerMapCenter] = useState({ lat: 37.566826, lng: 126.978656 });
  const [pickerSearchKeyword, setPickerSearchKeyword] = useState('');
  const [pickerSearchResults, setPickerSearchResults] = useState([]);
  const [pickerAddress, setPickerAddress] = useState('');
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

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
  const [selectedCleanerIds, setSelectedCleanerIds] = useState([]);
  const [dispatchType, setDispatchType] = useState('긴급 바닥 청소 및 살균 소독');
  const [dispatchUrgency, setDispatchUrgency] = useState('EMERGENCY'); // 'EMERGENCY', 'NORMAL', 'ROUTINE'
  const [dispatchMemo, setDispatchMemo] = useState('청소 기준 시간 초과 구역 현장 점검 및 즉시 소독 조치 요망');


  // 청소 담당자 체크리스트 상태
  const [cleanChecklist, setCleanChecklist] = useState(emptyChecklist);

  const toggleChecklistItem = async (key) => {
    const zoneId=Number(cleanFormRestroomId||selectedRestroom?.id);
    if(!zoneId){showToast('구역을 선택해주세요.');return;}
    const scope=String(zoneId)+':'+checklistDay;
    try {
      const saved=await checklistScope.current.write(scope,
        ()=>toggleDailyChecklistApi({zoneId,date:checklistDay,itemKey:key,isCompleted:!cleanChecklist[key]}),
        row=>setCleanChecklist(prev=>({...prev,[key]:row.completed??row.isCompleted??false})));
      showToast(saved?'체크리스트가 저장되었습니다.':'현재 체크리스트 처리 중입니다.');
    }catch(error){showToast('체크리스트 저장 실패: '+error.message);}
  };

  const saveConfirmedCleaning = async (target, worker, type, memo) => {
    if (!target) throw new Error('구역을 선택해주세요.');
    return completeCleaning({save:createCleaningRecordApi,request:{zoneId:target.id,restroomName:target.name,worker,type,memo},
      commit:(log,zoneId)=>{
        setCleaningLogs(prev=>[log,...prev.filter(old=>old.id!==log.id)]);
        setRestrooms(prev=>prev.map(row=>row.id===zoneId?applyCleaningRecord(row,log.worker):row));
      }});
  };

  // 체크리스트 전체 체크 / 초기화 일괄 DB 동기화 (F09, F17)
  const handleBatchToggleChecklist = async (nextState=true) => {
    const zoneId=Number(cleanFormRestroomId||selectedRestroom?.id);
    if(!zoneId){showToast('구역을 선택해주세요.');return;}
    const scope=String(zoneId)+':'+checklistDay;
    const next=Object.fromEntries(Object.keys(emptyChecklist()).map(key=>[key,nextState]));
    try {
      const saved=await checklistScope.current.write(scope,
        ()=>batchUpdateDailyChecklistApi({zoneId,date:checklistDay,items:next}),
        ()=>setCleanChecklist(next));
      showToast(saved?'체크리스트가 저장되었습니다.':'현재 체크리스트 처리 중입니다.');
    }catch(error){showToast('체크리스트 저장 실패: '+error.message);}
  };

  // 청소 담당자 체크리스트 일괄 제출
  const handleSubmitChecklist = async () => {
    const count=Object.values(cleanChecklist).filter(Boolean).length;
    if (!count) {showToast('최소 한 항목을 점검해주세요.');return;}
    const zoneId=Number(cleanFormRestroomId || selectedRestroom?.id);
    const target=restrooms.find(row=>row.id===zoneId);
    try {
      await saveConfirmedCleaning(target,user.username,`일일 위생 점검 (${count}/6)`,`점검 완료: ${Object.entries(cleanChecklist).filter(([,done])=>done).map(([key])=>key).join(', ')}`);
      showToast('위생 점검 기록이 저장되었습니다.');
    } catch(error){showToast(`위생 점검 기록 저장 실패: ${error.message}`);}
  };

  // 개발자 패킷 스트림 로그 상태
  const [packetLogs, setPacketLogs] = useState(INITIAL_PACKET_LOGS);

  // 청소 담당자 원클릭 즉시 청소 처리
  const handleQuickActionClean = async (item,type,memo) => {
    try {await saveConfirmedCleaning(item,user.username,type,memo);showToast(`[${item.name}] 청소 기록이 저장되었습니다.`);}
    catch(error){showToast(`청소 기록 저장 실패: ${error.message}`);}
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

  // DB 알림 및 청소 기록을 프론트엔드 상태에 병합하는 헬퍼 (F19)
  const syncAlertsFromDb = (dbAlerts) => {
    if (!dbAlerts || !Array.isArray(dbAlerts)) return;
    const mapped = dbAlerts.map(a => ({
      id: a.alertId,
      zoneId:a.zoneId,
      time: a.createdAt ? parseUtcDate(a.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '최근',
      restroom: a.zoneName || '관제 구역',
      metric: a.alertType || '임계 감지',
      value: a.installationLabel || '현장 점검 필요',
      level: (a.alertType && (a.alertType.includes('DANGER') || a.alertType.includes('위험'))) ? 'DANGER' : 'WARN',
      isChecked: a.status === 'RESOLVED',
      memo: a.message
    }));
    setAlerts(prev => {
      const ids = new Set(mapped.map(m => m.id));
      return [...mapped, ...prev.filter(p => !ids.has(p.id) && p.id > 1000000000000)];
    });
  };

  const syncCleaningLogsFromDb = (dbRecords) => {
    if (!dbRecords || !Array.isArray(dbRecords)) return;
    const mappedLogs = dbRecords.map(r => ({
      id: r.id,
      zoneId: r.zoneId,
      createdAt: r.createdAt,
      time: r.createdAt ? parseUtcDate(r.createdAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '최근',
      restroomName: r.restroomName,
      worker: r.worker,
      type: r.type,
      memo: r.memo
    }));
    setCleaningLogs(prev => {
      const ids = new Set(mappedLogs.map(m => m.id));
      return [...mappedLogs, ...prev.filter(p => !ids.has(p.id) && p.id > 1000000000000)];
    });
  };

  // 수동 새로고침 핸들러
  const handleManualRefresh = async () => {
    setDataLoading(true);
    try {
      const [zones,devices]=await Promise.all([fetchAdminZones(),fetchSensorDevices()]);
      setRestrooms(prev=>mergeLiveRows(prev,buildRestroomsFromBackend(zones,devices)));
      setDataError('');setLastUpdatedTime(new Date().toLocaleTimeString('ko-KR'));showToast('최신 관제 데이터를 갱신했습니다.');
    } catch(error){setDataError(`최신 데이터 조회 실패: ${error.message}`);showToast('갱신에 실패했습니다. 마지막으로 확인한 데이터를 표시합니다.');}
    finally{setDataLoading(false);}
  };

  // MySQL에 저장된 실측값, 관제 구역, 알림, 청소 이력을 병합하고 설정된 주기(refreshSeconds)마다 자동 갱신합니다. (F11, F19)
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    setDataLoading(true);
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const [zones, devices, settings, latestWorkers, dbAlerts, dbRecords] = await Promise.all([
          fetchAdminZones(controller.signal),fetchSensorDevices(controller.signal),fetchSystemSettingsApi(),
          fetchWorkersApi(),fetchAdminAlertsApi('ALL'),fetchCleaningRecordsApi()
        ]);
        const applied={offlineSeconds:Number(settings.offline_timeout_seconds),refreshSeconds:Number(settings.polling_interval_seconds),cleanWarnHours:Number(settings.clean_warning_interval_hours)};
        if(!controller.signal.aborted)setAppliedSettings(prev=>Object.keys(applied).every(key=>prev[key]===applied[key])?prev:applied);
        if (controller.signal.aborted) return;

        if (latestWorkers) {
          setWorkers(latestWorkers);
        }
        if (dbAlerts) syncAlertsFromDb(dbAlerts);
        if (dbRecords) syncCleaningLogsFromDb(dbRecords);

        let rows = [];
        if (zones && zones.length > 0) {
          rows = buildRestroomsFromBackend(zones, devices, latestWorkers || [], dbRecords || []);
        } else if (devices && devices.length > 0) {
          rows = devices.map((d, idx) => snapshotToRestroom(d, idx));
        }

        if (rows.length === 0) setRestrooms([]);
        if (rows.length > 0) {
          setRestrooms(prev => mergeLiveRows(prev, rows));
          setCleanFormRestroomId(previous => rows.some(row => row.id === Number(previous)) ? previous : (rows[0]?.id || 1));
          setPacketLogs(rows.filter(row=>row.measuredAt).map(row => ({
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
    const timer = setInterval(refresh, appliedSettings.refreshSeconds * 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [appliedSettings.refreshSeconds]);

  useEffect(() => {
    setRestrooms(prev => prev.map(row => {
      const worker=workers.find(w=>Number(w.assignedZoneId)===Number(row.id));
      return {...row,assignedWorkerId:worker?.id ?? null,cleanWorker:worker?.name || '담당자 미지정'};
    }));
  }, [workers]);

  const handleAssignWorkerToZone = async (zoneId, workerIdVal) => {
    try {
      await assignZoneWorkerApi(zoneId,workerIdVal ? Number(workerIdVal) : null);
      const [zones,devices,latestWorkers]=await Promise.all([fetchAdminZones(),fetchSensorDevices(),fetchWorkersApi()]);
      setRestrooms(prev=>mergeLiveRows(prev,buildRestroomsFromBackend(zones,devices)));
      setWorkers(latestWorkers);
      showToast('담당자 지정이 저장되었습니다.');
    } catch(error) {showToast(error.message);}
  };

  // 청소관리인 삭제 핸들러 (DELETE /api/admin/workers/{id})
  const handleDeleteWorker = async (worker) => {
    if (!window.confirm(`청소관리인 [${worker.name}]님을 명단에서 삭제하시겠습니까?`)) return;
    try {
      setDataLoading(true);
      await deleteWorkerApi(worker.id);
      setWorkers(prev => prev.filter(w => Number(w.id) !== Number(worker.id)));
      setRestrooms(prev => prev.map(r => (
        Number(r.assignedWorkerId) === Number(worker.id) || r.cleanWorker === worker.name
          ? { ...r, assignedWorkerId: null, cleanWorker: '담당자 미지정' }
          : r
      )));
      if (editingWorkerId === worker.id) {
        handleResetWorkerForm();
      }
      showToast(`청소관리인 [${worker.name}]님이 삭제되었습니다.`);
    } catch (err) {
      showToast(`삭제 실패: ${err.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  // MySQL DB에 저장된 실제 알림, 청소 이력, 미화원, 설정, 기기세트, 센서, 계정을 불러옵니다.
  useEffect(() => {
    fetchAdminAlertsApi('ALL').then(syncAlertsFromDb).catch(console.warn);
    fetchCleaningRecordsApi().then(syncCleaningLogsFromDb).catch(console.warn);

    fetchWorkersApi().then(setWorkers).catch(error=>setDataError(error.message));
    // 중앙 시스템 설정 및 온습도·가스 임계값 조회 (F10, F11)
    fetchSystemSettingsApi().then(settingsData => {
      if (settingsData) {
        setSystemSettings(prev => ({
          ...prev,
          offlineSeconds: Number(settingsData.offline_timeout_seconds || prev.offlineSeconds),
          refreshSeconds: Number(settingsData.polling_interval_seconds || prev.refreshSeconds),
          cleanWarnHours: Number(settingsData.clean_warning_interval_hours || prev.cleanWarnHours)
        }));
        setThresholds(prev => ({
          ...prev,
          tempWarn: Number(settingsData.temp_warning_threshold || prev.tempWarn),
          tempDanger: Number(settingsData.temp_danger_threshold || prev.tempDanger),
          humidWarn: Number(settingsData.humidity_warning_threshold || prev.humidWarn),
          humidDanger: Number(settingsData.humidity_danger_threshold || prev.humidDanger),
          gasWarn: Number(settingsData.gas_warning_threshold || prev.gasWarn),
          gasDanger: Number(settingsData.gas_danger_threshold || prev.gasDanger)
        }));
      }
    }).catch(error=>setDataError(`데이터 처리 실패: ${error.message}`));

    fetchSystemSettingsApi().then(data=>{
      setAppliedSettings({offlineSeconds:Number(data.offline_timeout_seconds),refreshSeconds:Number(data.polling_interval_seconds),cleanWarnHours:Number(data.clean_warning_interval_hours)});
      setThresholds({tempWarn:Number(data.temp_warning_threshold),tempDanger:Number(data.temp_danger_threshold),humidWarn:Number(data.humidity_warning_threshold),humidDanger:Number(data.humidity_danger_threshold),gasWarn:Number(data.gas_warning_threshold),gasDanger:Number(data.gas_danger_threshold)});
    }).catch(error=>setDataError(`운영 설정 조회 실패: ${error.message}`));

    if(user.role===ROLES.DEVELOPER) {
      Promise.all([fetchSensorsApi(),fetchUsersApi(),fetchDiscoveredDevicesApi()]).then(([sensors,users,discovered])=>{
        setSensorsList(sensors);setUsersList(users);setDiscoveredDevices(discovered);
      }).catch(error=>setDataError(error.message));
    }
    // 기기 세트 목록 조회
    fetchDeviceSetsApi().then(setDeviceSets).catch(error=>setDataError(`데이터 처리 실패: ${error.message}`));
  }, []);

  useEffect(() => {
    const zoneId=Number(cleanFormRestroomId || selectedRestroom?.id);
    const scope=`${zoneId}:${checklistDay}`;
    const coordinator=checklistScope.current;
    coordinator.load(scope,()=>zoneId?fetchDailyChecklistApi(zoneId,checklistDay):Promise.resolve([]),setCleanChecklist)
      .catch(error=>{if(coordinator.isCurrent(scope))setDataError(`체크리스트 조회 실패: ${error.message}`);});
    return()=>coordinator.cancel(scope);
  },[cleanFormRestroomId,selectedRestroom?.id,checklistDay]);

  // 설정 서브탭 진입 시 클라우드 Upstash 상태, 기기 세트, 개별 센서, 계정 목록 로드
  useEffect(() => {
    if (activeTab === 'settings' && settingsSubTab === 'system') {
      fetchUpstashStatusApi().then(setUpstashStatus).catch(error=>setDataError(`데이터 처리 실패: ${error.message}`));
      fetchDeviceSetsApi().then(setDeviceSets).catch(error=>setDataError(`데이터 처리 실패: ${error.message}`));
    }
  }, [activeTab, settingsSubTab]);

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
          setDataError(`측정 이력 조회 실패: ${error.message}`);
        }
      } finally { pending = false; }
    };
    refresh();
    const timer = setInterval(refresh, appliedSettings.refreshSeconds * 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [selectedRestroom?.id, selectedRestroom?.macAddress, chartRange, appliedSettings.refreshSeconds]);

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
  const accessibleAlerts=filterZoneRecords(alerts,canAccessZone);
  const accessibleCleaningLogs=filterZoneRecords(cleaningLogs,canAccessZone);

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
  const handleSaveQuickCleaning = async () => {
    try {await saveConfirmedCleaning(cleaningTarget,quickCleaningWorker,'수시 점검',quickCleaningMemo);setIsCleaningModalOpen(false);showToast('청소 기록이 저장되었습니다.');}
    catch(error){showToast(`청소 기록 저장 실패: ${error.message}`);}
  };

  // 관리자 전용: 출동 지시 팝업 모달 열기
  const handleOpenDispatchModal = (targetId = null) => {
    const delayed = accessibleRestrooms.filter(r => r.lastCleanedHours >= appliedSettings.cleanWarnHours);
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
    const readyCleaners = cleanersList.filter(c => c.isAvailable);
    setSelectedCleanerIds(readyCleaners.length > 0 ? [readyCleaners[0].id] : (cleanersList[0] ? [cleanersList[0].id] : ['1']));
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
    const availableIds = cleanersList.filter(c => c.isAvailable).map(c => c.id);
    setSelectedCleanerIds(availableIds);
    showToast(`대기 중인 미화 인원 ${availableIds.length}명이 일괄 선택되었습니다.`);
  };

  // 출동 지시 최종 발령
  const handleConfirmDispatch = async () => {
    const workerIds=selectedCleanerIds.map(Number).filter(id=>Number.isInteger(id)&&id>0);
    let targets=accessibleRestrooms;
    if(dispatchTargetId==='ALL_DELAYED') targets=targets.filter(row=>row.lastCleanedHours>=appliedSettings.cleanWarnHours);
    else if(dispatchTargetId!=='ALL_ACCESSIBLE') targets=targets.filter(row=>String(row.id)===String(dispatchTargetId));
    if(!workerIds.length || !targets.length){showToast('실제 담당 인원과 대상 구역을 선택해주세요.');return;}
    try {
      const result=await createDispatchApi({workerIds,zoneIds:targets.map(row=>row.id),type:dispatchType,urgency:dispatchUrgency,memo:dispatchMemo});
      setWorkers(prev=>prev.map(row=>result.workers.find(saved=>saved.id===row.id)||row));
      setCleaningLogs(prev=>[...result.records.map(recordToLog),...prev]);
      setIsDispatchModalOpen(false);showToast('출동 지시가 저장되었습니다.');
    }catch(error){showToast(`출동 지시 저장 실패: ${error.message}`);}
  };

  // 청소 관리 전용 폼 등록 핸들러 (SCR-05 FR-50)
  const handleSubmitCleaningForm = async (event) => {
    event.preventDefault();
    if(!cleanFormWorker.trim()){showToast('담당자를 입력해주세요.');return;}
    const target=accessibleRestrooms.find(row=>String(row.id)===String(cleanFormRestroomId));
    try {await saveConfirmedCleaning(target,cleanFormWorker,cleanFormType,cleanFormMemo||'특이사항 없음');setCleanFormMemo('');showToast('청소 기록이 저장되었습니다.');}
    catch(error){showToast(`청소 기록 저장 실패: ${error.message}`);}
  };

  // 환경 임계값 저장 핸들러 (온습도·가스 전체 MySQL DB 영구 반영 - F10)
  const handleSaveThresholds = async () => {
    const zoneIds=thresholdScope==='ALL'?accessibleRestrooms.map(row=>row.id):[Number(thresholdScope)];
    const globalSettings=user.role===ROLES.DEVELOPER?{
      temp_warning_threshold:String(thresholds.tempWarn),temp_danger_threshold:String(thresholds.tempDanger),
      humidity_warning_threshold:String(thresholds.humidWarn),humidity_danger_threshold:String(thresholds.humidDanger),
      gas_warning_threshold:String(thresholds.gasWarn),gas_danger_threshold:String(thresholds.gasDanger)}:null;
    try {await saveZoneThresholdsApi({zoneIds,pleasantThreshold:thresholds.gasWarn,needsVentilationThreshold:thresholds.gasDanger,globalSettings});
      showToast('임계값이 저장되었습니다.');await handleManualRefresh();
    }catch(error){showToast(`임계값 저장 실패: ${error.message}`);}
  };

  const selectThresholdScope = (value) => {
    setThresholdScope(value);
    const selected=rawRestrooms.find(row=>row.id===Number(value));
    if(selected) setThresholds(prev=>({...prev,gasWarn:selected.pleasantThreshold??prev.gasWarn,gasDanger:selected.needsVentilationThreshold??prev.gasDanger}));
  };

  // 신규 화장실/노드 등록 핸들러 (SCR-06 FR-60)
  const handleAddRestroom = async () => {
    if (!newRestroomName.trim()) {
      alert('화장실 명칭을 입력해주세요.');
      return;
    }

    const parsedLat = parseFloat(newRestroomLat);
    const parsedLng = parseFloat(newRestroomLng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      alert('유효한 위도(Latitude)·경도(Longitude) 좌표를 입력하거나 [현재 내 위치로 좌표 설정] 버튼을 눌러주세요.');
      return;
    }

    try {
      setDataLoading(true);
      const selectedWorker = workers.find(w => String(w.id) === String(newRestroomWorkerId));
      // 1. 백엔드 MySQL DB에 신규 Zone 생성 (GPS 위도/경도 및 담당 청소관리인 포함)
      await createBackendZone({
        name: newRestroomName.trim(),
        floor: newRestroomFloor,
        gender: newRestroomGender,
        deviceId: newRestroomDeviceId.trim(),
        lat: parsedLat,
        lng: parsedLng,
        zoneType: 'TOILET',
        pleasantThreshold: 300.0,
        needsVentilationThreshold: 600.0,
        assignedWorkerId: selectedWorker ? Number(selectedWorker.id) : null,
        assignedWorkerName: selectedWorker ? selectedWorker.name : null
      });

      const registeredName = newRestroomName.trim();
      setIsAddRestroomModalOpen(false);
      setNewRestroomName('');
      setNewRestroomDeviceId('');
      setNewRestroomWorkerId('');
      setGpsStatusMsg('');
      showToast(`신규 화장실 노드 [${registeredName}]이 좌표(${parsedLat}, ${parsedLng})와 함께 DB에 저장되었습니다.`);

      // 2. 백엔드 DB로부터 최신 목록 즉시 새로고침
      const sets = await fetchDeviceSetsApi().catch(() => null);
      if (sets) setDeviceSets(sets);
      await handleManualRefresh();
      await loadDiscoveredDevices();
    } catch (err) {
      console.error('화장실 DB 등록 오류:', err);
      showToast(`등록 실패: ${err.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  // 화장실 활성/비활성화 토글
  const handleToggleRestroomActive = async (id) => {
    try {
      const active=await toggleZoneActiveApi(id);
      setRestrooms(prev=>prev.map(row=>row.id===id?{...row,isActive:active,status:active?'UNKNOWN':'INACTIVE'}:row));
      showToast(`구역이 ${active?'활성화':'비활성화'}되었습니다.`);
      await handleManualRefresh();
    }catch(error){showToast(`구역 상태 저장 실패: ${error.message}`);}
  };

  // 화장실 시설 삭제 핸들러 (개발자 전용)
  const handleDeleteRestroom = async (id) => {
    const target = rawRestrooms.find(r => r.id === id);
    if (!target) return;
    if (rawRestrooms.length <= 1) {
      showToast('최소 1개 이상의 관제 구역이 유지되어야 합니다.');
      return;
    }
    if (!window.confirm(`[${target.name}] 시설을 데이터베이스에서 완전히 삭제하시겠습니까?`)) {
      return;
    }

    try {
      setDataLoading(true);
      // 1. 백엔드 MySQL DB에서 삭제 요청
      await deleteBackendZone(id);
      setRestrooms(prev => prev.filter(r => r.id !== id));
      showToast(`[${target.name}] 시설이 데이터베이스에서 삭제되었습니다.`);
      // 2. 백엔드 목록 즉시 동기화
      await handleManualRefresh();
    } catch (err) {
      console.error('시설 삭제 오류:', err);
      showToast(`삭제 실패: ${err.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  // 신규 관제 구역(건물/층) 생성 핸들러 (POST /api/dev/zones)
  const handleCreateZone = async () => {
    if (!newZoneName.trim()) {
      alert('구역 명칭을 입력해주세요.');
      return;
    }
    try {
      setDataLoading(true);
      await createBackendZone({
        name: newZoneName.trim(),
        floor: newZoneFloor,
        address: newZoneAddress.trim(),
        // 입력하지 않은 좌표는 비워 둔다(지도에 가짜 위치를 만들지 않음).
        latitude: Number.isFinite(parseFloat(newZoneLat)) ? parseFloat(newZoneLat) : null,
        longitude: Number.isFinite(parseFloat(newZoneLng)) ? parseFloat(newZoneLng) : null,
        zoneType: newZoneType
      });
      showToast('신규 관제 구역이 DB(MySQL)에 등록되었습니다.');
      setIsAddZoneModalOpen(false);
      setNewZoneName('');
      await handleManualRefresh();
    } catch (err) {
      console.error('구역 등록 실패:', err);
      showToast('구역 등록 실패: ' + err.message);
    } finally {
      setDataLoading(false);
    }
  };

  // 기기 세트 수정 열기 (화장실 목록에서 호출)
  const handleOpenEditZone = (restroom) => {
    const matchingSet = deviceSets.find(ds =>
      (restroom.macAddress && ds.macAddress?.toLowerCase() === restroom.macAddress?.toLowerCase()) ||
      Number(ds.zoneId) === Number(restroom.id)
    );
    const existingMac = matchingSet?.macAddress || (restroom.macAddress && !restroom.macAddress.startsWith('ZONE-') ? restroom.macAddress : '');

    setEditingZone({
      id: restroom.id,
      name: restroom.name || '',
      floor: restroom.floor || '미등록',
      gender: restroom.gender || '미등록',
      address: restroom.address || '',
      latitude: String(restroom.lat ?? ''),
      longitude: String(restroom.lng ?? ''),
      lat: String(restroom.lat ?? ''),
      lng: String(restroom.lng ?? ''),
      zoneType: restroom.zoneType || 'TOILET',
      isOurSolution:restroom.isLive,
      pleasantThreshold: restroom.pleasantThreshold ?? thresholds.gasWarn ?? 300,
      needsVentilationThreshold: restroom.needsVentilationThreshold ?? thresholds.gasDanger ?? 600,
      assignedWorkerId: restroom.assignedWorkerId != null ? String(restroom.assignedWorkerId) : '',
      deviceSetId: matchingSet?.deviceSetId || null,
      macAddress: existingMac,
      originalMacAddress: existingMac
    });
    setGpsStatusMsg('');
    setIsEditZoneModalOpen(true);
  };

  // 화장실(Zone) 정보 수정 저장 (PUT /api/dev/zones/{id} - F02)
  const handleSaveEditZone = async () => {
    if (!editingZone || !editingZone.name.trim()) {
      showToast('시설 명칭을 입력해주세요.');
      return;
    }
    const candidateMac=editingZone.macAddress?.trim();
    if(candidateMac&&!/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(candidateMac)) {
      showToast('유효한 MAC 주소를 입력해주세요.');return;
    }
    try {
      setDataLoading(true);
      const selectedWorker = workers.find(w => String(w.id) === String(editingZone.assignedWorkerId));
      const payload=facilityPayload({
        ...editingZone,name:editingZone.name.trim(),
        deviceId:candidateMac,assignedWorkerId:selectedWorker?.id ?? null,
        pleasantThreshold:Number(editingZone.pleasantThreshold),
        needsVentilationThreshold:Number(editingZone.needsVentilationThreshold)
      });
      if(payload.device)payload.device.deviceSetId=editingZone.deviceSetId;
      await updateFacilityApi(editingZone.id,payload);
      setDeviceSets(await fetchDeviceSetsApi());

      setIsEditZoneModalOpen(false);
      setEditingZone(null);
      showToast(`[${editingZone.name}] 시설 정보 및 기기 설정이 DB에 반영되었습니다.`);
      await handleManualRefresh();
    } catch (err) {
      console.error('시설 수정 오류:', err);
      showToast(`시설 수정 실패: ${err.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  // 기기 세트 수정 열기 (화장실 목록에서 호출)
  const handleOpenEditDeviceSet = (restroom) => {
    const matchingSet = (deviceSets || []).find(ds =>
      (restroom.macAddress && ds.macAddress?.toLowerCase() === restroom.macAddress?.toLowerCase()) ||
      Number(ds.zoneId) === Number(restroom.id)
    );
    setEditingDeviceSet({
      id: matchingSet ? matchingSet.deviceSetId : null,
      label: matchingSet?.installationLabel || restroom.name,
      zoneId: matchingSet?.zoneId || restroom.id,
      macAddress: matchingSet?.macAddress || (restroom.macAddress && !restroom.macAddress.startsWith('ZONE-') ? restroom.macAddress : ''),
      isNew: !matchingSet
    });
    setIsEditDeviceSetModalOpen(true);
  };

  // 기기 세트 수정 열기 (기기 세트 목록에서 직접 호출 - PATCH /api/admin/device-sets/{id})
  const handleOpenEditDeviceSetFromSet = (ds) => {
    setEditingDeviceSet({
      id: ds.deviceSetId,
      label: ds.installationLabel || ds.setCode,
      zoneId: ds.zoneId,
      macAddress: ds.macAddress,
      isNew: false
    });
    setIsEditDeviceSetModalOpen(true);
  };

  // 기기 세트 수정 저장 (PATCH /api/admin/device-sets/{id} 또는 신규 등록)
  const handleSaveEditDeviceSet = async () => {
    if (!editingDeviceSet) return;
    const mac = editingDeviceSet.macAddress?.trim();
    if (!mac) {
      showToast('ESP32 MAC 주소를 입력해주세요.');
      return;
    }
    const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macPattern.test(mac)) {
      showToast('유효한 MAC 주소 형식(예: 24:DC:C3:99:AA:01)을 입력해주세요.');
      return;
    }
    const normalizedMac = mac.toUpperCase().replace(/-/g, ':');
    const targetZoneId = Number(editingDeviceSet.zoneId);

    try {
      setDataLoading(true);
      if (editingDeviceSet.id) {
        await updateDeviceSetApi(editingDeviceSet.id, {
          zoneId: targetZoneId,
          installationLabel: editingDeviceSet.label?.trim() || `Zone #${targetZoneId} 세트`,
          macAddress: normalizedMac
        });
        showToast('아두이노 기기 위치(구역) 및 MAC 주소가 DB에 수정되었습니다.');
      } else {
        await createDeviceSetApi({
          setCode: `SET-${targetZoneId}`,
          macAddress: normalizedMac,
          zoneId: targetZoneId,
          installationLabel: editingDeviceSet.label?.trim() || `Zone #${targetZoneId} 세트`
        });
        showToast('신규 아두이노 기기 매핑이 DB에 등록되었습니다.');
      }
      setIsEditDeviceSetModalOpen(false);
      setEditingDeviceSet(null);
      const sets = await fetchDeviceSetsApi().catch(() => null);
      if (sets) setDeviceSets(sets);
      await handleManualRefresh();
    } catch (err) {
      console.error('기기 수정 실패:', err);
      showToast('기기 정보 수정 실패: ' + err.message);
    } finally {
      setDataLoading(false);
    }
  };

  // 기기 세트 감사 히스토리 열기 (화장실 목록에서 호출 - deviceSets[0] 폴백 제거 F02)
  const handleOpenDeviceSetHistory = async (restroom) => {
    const matchingSet = deviceSets.find(ds =>
      (restroom.macAddress && ds.macAddress?.toLowerCase() === restroom.macAddress?.toLowerCase()) ||
      Number(ds.zoneId) === Number(restroom.id)
    );
    if (!matchingSet) {
      showToast(`[${restroom.name}] 구역에 매핑된 기기 세트가 없어 변경 이력을 조회할 수 없습니다.`);
      return;
    }
    setHistoryDeviceSetTitle(`${matchingSet.setCode} - ${restroom.name || matchingSet.installationLabel}`);
    try {
      setDataLoading(true);
      const hist = await fetchDeviceSetHistoryApi(matchingSet.deviceSetId);
      setDeviceSetHistories(hist);
    } catch (err) {
      console.error('기기 이력 조회 실패:', err);
      setDeviceSetHistories([]);
    } finally {
      setDataLoading(false);
    }
    setIsHistoryModalOpen(true);
  };

  // 기기 세트 감사 히스토리 열기 (기기 세트 목록에서 직접 호출 - GET /api/admin/device-sets/{id}/history)
  const handleOpenDeviceSetHistoryFromSet = async (ds) => {
    setHistoryDeviceSetTitle(`${ds.setCode} (${ds.installationLabel || ds.macAddress})`);
    try {
      setDataLoading(true);
      const hist = await fetchDeviceSetHistoryApi(ds.deviceSetId);
      setDeviceSetHistories(hist);
    } catch (err) {
      console.error('기기 이력 조회 실패:', err);
      setDeviceSetHistories([]);
    } finally {
      setDataLoading(false);
    }
    setIsHistoryModalOpen(true);
  };

  // 기기 세트 삭제 (DELETE /api/admin/device-sets/{id})
  const handleDeleteDeviceSet = async (deviceSetId) => {
    if (!window.confirm(`기기 세트 #${deviceSetId}를 정말 삭제하시겠습니까? 연결된 센서 매핑이 해제됩니다.`)) return;
    try {
      setDataLoading(true);
      await deleteDeviceSetApi(deviceSetId);
      showToast('기기 세트가 삭제되었습니다.');
      const sets = await fetchDeviceSetsApi();
      setDeviceSets(sets);
      await handleManualRefresh();
    } catch (err) {
      console.error('기기 세트 삭제 실패:', err);
      showToast('기기 삭제 실패: ' + err.message);
    } finally {
      setDataLoading(false);
    }
  };

  // 센서 단독 추가 핸들러 (POST /api/dev/sensors)
  const handleCreateSensor = async () => {
    if (!newSensorData.zoneId) {
      showToast('센서를 설치할 구역을 선택해주세요.');
      return;
    }
    try {
      setDataLoading(true);
      const sensorId = await createBackendSensor({
        zoneId: Number(newSensorData.zoneId),
        sensorType: newSensorData.sensorType
      });
      showToast(`센서(ID: ${sensorId})가 구역 #${newSensorData.zoneId}에 단독 등록되었습니다.`);
      setIsAddSensorModalOpen(false);
      const updatedSensors = await fetchSensorsApi();
      setSensorsList(updatedSensors);
      await handleManualRefresh();
    } catch (err) {
      console.error('센서 단독 등록 실패:', err);
      showToast('센서 등록 실패: ' + err.message);
    } finally {
      setDataLoading(false);
    }
  };

  const issueDeviceKey = async (mac) => {
    try {const issued=await rotateDeviceKeyApi(mac);setIssuedCredential(issued);}
    catch(error){showToast(error.message);}
  };
  const revokeDeviceKey = async (mac) => {
    try {await revokeDeviceKeyApi(mac);setIssuedCredential(null);showToast('장치 키가 폐기되었습니다.');}
    catch(error){showToast(error.message);}
  };

  // 중앙 시스템 운영 설정 저장 핸들러 (PUT /api/admin/settings)
  const handleSaveSystemSettings = async () => {
    try {
      await updateSystemSettingsApi({offline_timeout_seconds:String(systemSettings.offlineSeconds),polling_interval_seconds:String(systemSettings.refreshSeconds),clean_warning_interval_hours:String(systemSettings.cleanWarnHours)});
      setAppliedSettings({...systemSettings});showToast('운영 설정이 저장되어 적용되었습니다.');
    }catch(error){showToast(`운영 설정 저장 실패: ${error.message}`);}
  };

  const handleCheckAlert = async (id,event) => {
    event?.stopPropagation();
    try {
      if(typeof id!=='number' || id>=1000000000000) throw new Error('서버에 등록된 알림만 조치할 수 있습니다.');
      await resolveAlertApi(id,'현장 확인 및 조치 완료');
      setAlerts(prev=>prev.map(row=>row.id===id?{...row,isChecked:true}:row));showToast('조치 기록이 저장되었습니다.');
    }catch(error){showToast(`알림 조치 실패: ${error.message}`);}
  };

  // 측정 시각을 x값으로 써서 수신이 끊긴 구간도 실제 시간 간격대로 보이게 합니다.
  const handleResetWorkerForm = () => {
    setEditingWorkerId(null);
    setWorkerFormName('');
    setWorkerFormPhone('');
    setWorkerFormRole('환경미화 1팀 (주간 전담)');
    setWorkerFormStatus('AVAILABLE');
    setWorkerFormZoneId('');
  };

  const handleEditWorkerClick = (worker) => {
    setEditingWorkerId(worker.id);
    setWorkerFormName(worker.name || '');
    setWorkerFormPhone(worker.phone || '');
    setWorkerFormRole(worker.role || '환경미화 1팀');
    setWorkerFormStatus(worker.status || 'AVAILABLE');
    setWorkerFormZoneId(worker.assignedZoneId != null ? String(worker.assignedZoneId) : '');
  };

  const handleSaveWorkerForm = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!workerFormName.trim()) {
      alert('청소관리인 성명을 입력해주세요.');
      return;
    }

    const assignedZoneId = workerFormZoneId ? Number(workerFormZoneId) : null;
    const payload = {
      name: workerFormName.trim(),
      phone: workerFormPhone.trim() || '010-0000-0000',
      role: workerFormRole.trim() || '위생관리 전담',
      status: workerFormStatus || 'AVAILABLE',
      assignedZoneId: assignedZoneId
    };

    try {
      setDataLoading(true);
      if (editingWorkerId) {
        const updated = await updateWorkerApi(editingWorkerId, payload);
        if (assignedZoneId) {
          await assignZoneWorkerApi(assignedZoneId, updated.id, updated.name).catch(() => {});
        }
        showToast(`청소관리인 [${updated.name}]님의 정보 및 담당 구역이 수정되었습니다.`);
      } else {
        const created = await createWorkerApi(payload);
        if (assignedZoneId && created?.id) {
          await assignZoneWorkerApi(assignedZoneId, created.id, created.name).catch(() => {});
        }
        showToast(`신규 청소관리인 [${created.name}]님이 등록되었습니다.`);
      }

      handleResetWorkerForm();
      const freshWorkers = await fetchWorkersApi();
      setWorkers(freshWorkers || []);
      await handleManualRefresh();
    } catch (err) {
      console.error('청소관리인 저장 오류:', err);
      showToast(`청소관리인 저장 실패: ${err.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  const handleChangeWorkerStatus = async (workerId, newStatus) => {
    try {
      await updateWorkerStatusApi(workerId, newStatus);
      setWorkers(prev => prev.map(w => Number(w.id) === Number(workerId) ? { ...w, status: newStatus } : w));
      const statusLabel = newStatus === 'AVAILABLE' ? '대기 중(출동 가능)' : newStatus === 'DISPATCHED' ? '현장 작업 중' : '휴무';
      showToast(`근무 상태가 [${statusLabel}]로 변경되었습니다.`);
    } catch (err) {
      showToast(`상태 변경 실패: ${err.message}`);
    }
  };

  const loadDiscoveredDevices = async () => {
    try {
      const list = await fetchDiscoveredDevicesApi();
      if (Array.isArray(list)) {
        setDiscoveredDevices(list);
      }
    } catch (e) {
      console.warn('[AdminPage] 미등록 기기 목록 조회 실패:', e);
    }
  };

  const handleRegisterDiscoveredDevice = (dev) => {
    setNewRestroomDeviceId(dev.macAddress);
    if (dev.latitude != null && dev.longitude != null) {
      setNewRestroomLat(String(dev.latitude));
      setNewRestroomLng(String(dev.longitude));
    }
    setIsAddRestroomModalOpen(true);
    showToast(`기기 MAC [${dev.macAddress}]이(가) 자동 입력되었습니다. 화장실 시설 정보를 입력해 주세요.`);
  };

  const handleDismissDiscoveredDevice = async (mac) => {
    try {
      await dismissDiscoveredDeviceApi(mac);
      setDiscoveredDevices(prev => prev.filter(d => d.macAddress !== mac));
      showToast(`미등록 기기 [${mac}] 항목을 대기 목록에서 제외했습니다.`);
    } catch (e) {
      alert('기기 항목 제외 실패: ' + e.message);
    }
  };

  const reverseGeocode = (lat, lng) => {
    if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
      setPickerAddress('');
      return;
    }
    try {
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.coord2Address(lng, lat, (result, status) => {
        if (status === window.kakao.maps.services.Status.OK && result && result.length > 0) {
          const road = result[0].road_address?.address_name;
          const jibun = result[0].address?.address_name;
          setPickerAddress(road || jibun || '');
        } else {
          setPickerAddress('');
        }
      });
    } catch (err) {
      console.warn('역지오코딩 처리 실패:', err);
      setPickerAddress('');
    }
  };

  const openLocationPicker = (target = 'restroom') => {
    setLocationPickerTarget(target);
    let initialLat = 37.566826;
    let initialLng = 126.978656;

    if (target === 'zone') {
      const parsedLat = parseFloat(newZoneLat);
      const parsedLng = parseFloat(newZoneLng);
      if (!isNaN(parsedLat) && !isNaN(parsedLng) ) {
        initialLat = parsedLat;
        initialLng = parsedLng;
      }
    } else if (target === 'editZone') {
      const parsedLat = parseFloat(editingZone?.lat || editingZone?.latitude);
      const parsedLng = parseFloat(editingZone?.lng || editingZone?.longitude);
      if (!isNaN(parsedLat) && !isNaN(parsedLng) ) {
        initialLat = parsedLat;
        initialLng = parsedLng;
      }
    } else {
      // restroom
      const parsedLat = parseFloat(newRestroomLat);
      const parsedLng = parseFloat(newRestroomLng);
      if (!isNaN(parsedLat) && !isNaN(parsedLng) ) {
        initialLat = parsedLat;
        initialLng = parsedLng;
      }
    }

    setPickerLat(initialLat);
    setPickerLng(initialLng);
    setPickerMapCenter({ lat: initialLat, lng: initialLng });
    setPickerSearchKeyword('');
    setPickerSearchResults([]);
    reverseGeocode(initialLat, initialLng);
    setIsLocationPickerOpen(true);
  };

  const handleSetCurrentGpsLocation = (target = 'restroom') => {
    if (!navigator.geolocation) {
      setGpsStatusMsg('현재 브라우저에서 GPS 위치 기능(Geolocation)을 지원하지 않습니다.');
      showToast('이 브라우저에서는 GPS 기능을 지원하지 않습니다.');
      return;
    }

    setIsGpsLocating(true);
    setGpsStatusMsg('스마트폰 GPS 위성 신호를 수신하고 있습니다...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const accuracy = Math.round(position.coords.accuracy || 0);

        if (target === 'zone') {
          setNewZoneLat(lat);
          setNewZoneLng(lng);
        } else if (target === 'editZone') {
          setEditingZone(prev => prev ? { ...prev, latitude: lat, longitude: lng, lat, lng } : prev);
        } else {
          setNewRestroomLat(lat);
          setNewRestroomLng(lng);
          setNewZoneLat(lat);
          setNewZoneLng(lng);
        }

        setIsGpsLocating(false);
        setGpsStatusMsg(`현재 위치 좌표 설정 완료 (${lat}, ${lng}${accuracy ? ` · 정확도 ±${accuracy}m` : ''})`);
        showToast(`현재 스마트폰 GPS 위치(${lat}, ${lng})로 좌표가 설정되었습니다.`);
      },
      (error) => {
        setIsGpsLocating(false);
        let errMsg = 'GPS 위치를 가져오지 못했습니다.';
        if (error.code === 1) {
          errMsg = '위치 권한이 거부되었습니다. 브라우저/스마트폰 위치 접근을 허용해주세요.';
        } else if (error.code === 2) {
          errMsg = '현재 GPS 위치 신호를 확인할 수 없습니다.';
        } else if (error.code === 3) {
          errMsg = 'GPS 응답 시간이 초과되었습니다. 다시 시도해주세요.';
        }
        setGpsStatusMsg(errMsg);
        showToast(errMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handlePickerSearch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!pickerSearchKeyword.trim()) {
      showToast('검색할 건물명, 역명 또는 도로명 주소를 입력해주세요.');
      return;
    }
    try {
      setIsSearchingPlaces(true);
      const results = await searchKakaoPlaces(pickerSearchKeyword.trim(), pickerLat, pickerLng);
      setPickerSearchResults(results || []);
      if (results && results.length > 0) {
        const first = results[0];
        setPickerLat(first.lat);
        setPickerLng(first.lon);
        setPickerMapCenter({ lat: first.lat, lng: first.lon });
        setPickerAddress(first.address || first.name);
        showToast(`'${first.name}' 검색 위치로 이동했습니다.`);
      } else {
        showToast('검색 결과가 없습니다. 지도를 직접 클릭하여 위치를 선택해보세요.');
      }
    } catch (err) {
      console.error('장소 검색 오류:', err);
      showToast('장소 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  const handleSelectSearchResult = (item) => {
    setPickerLat(item.lat);
    setPickerLng(item.lon);
    setPickerMapCenter({ lat: item.lat, lng: item.lon });
    setPickerAddress(item.address || item.name);
    showToast(`'${item.name}' 위치로 핀을 이동했습니다.`);
  };

  const handleConfirmLocationPicker = () => {
    const latStr = Number(pickerLat).toFixed(6);
    const lngStr = Number(pickerLng).toFixed(6);

    if (locationPickerTarget === 'zone') {
      setNewZoneLat(latStr);
      setNewZoneLng(lngStr);
      if (pickerAddress) {
        setNewZoneAddress(pickerAddress);
      }
    } else if (locationPickerTarget === 'editZone') {
      setEditingZone(prev => prev ? {
        ...prev,
        latitude: latStr,
        longitude: lngStr,
        lat: latStr,
        lng: lngStr,
        address: pickerAddress || prev.address
      } : prev);
    } else {
      // restroom
      setNewRestroomLat(latStr);
      setNewRestroomLng(lngStr);
      setNewZoneLat(latStr);
      setNewZoneLng(lngStr);
    }

    setIsLocationPickerOpen(false);
    showToast(`선택된 위치(${latStr}, ${lngStr})로 좌표가 설정되었습니다.`);
  };

  const handleToggleSensorStatus = async (sensor) => {
    const nextStatus = sensor.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateBackendSensorApi(sensor.sensorId, { status: nextStatus });
      const updatedSensors = await fetchSensorsApi();
      setSensorsList(updatedSensors);
      showToast(`센서 #${sensor.sensorId} 상태가 [${nextStatus}]로 변경되었습니다.`);
    } catch (err) {
      showToast(`센서 상태 변경 실패: ${err.message}`);
    }
  };

  const handleDeleteSensorItem = async (sensor) => {
    if (!window.confirm(`센서 #${sensor.sensorId} (${sensor.sensorType})를 데이터베이스에서 삭제하시겠습니까?`)) return;
    try {
      setDataLoading(true);
      await deleteBackendSensorApi(sensor.sensorId);
      setSensorsList(prev => prev.filter(s => s.sensorId !== sensor.sensorId));
      showToast(`센서 #${sensor.sensorId}가 삭제되었습니다.`);
    } catch (err) {
      showToast(`센서 삭제 실패: ${err.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  const handleSaveUserForm = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!userForm.username.trim()) {
      showToast('계정 아이디(username)를 입력해주세요.');
      return;
    }
    try {
      setDataLoading(true);
      if (editingUserId) {
        await updateUserApi(editingUserId, {
          username: userForm.username.trim(),
          password: userForm.password || undefined,
          role: userForm.role,
          zoneIds: userForm.zoneIds.map(Number)
        });
        showToast(`계정 [${userForm.username}] 및 담당 구역 권한이 수정되었습니다.`);
      } else {
        await createUserApi({
          username: userForm.username.trim(),
          password: userForm.password,
          role: userForm.role,
          zoneIds: userForm.zoneIds.map(Number)
        });
        showToast(`신규 계정 [${userForm.username}]이 생성되었습니다.`);
      }
      setEditingUserId(null);
      setUserForm({ username: '', password: '', role: 'CLEANER', zoneIds: [] });
      const latestUsers = await fetchUsersApi();
      setUsersList(latestUsers);
    } catch (err) {
      showToast(`계정 저장 실패: ${err.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  const handleEditUserClick = (u) => {
    setEditingUserId(u.id);
    setUserForm({
      username: u.username || '',
      password: '',
      role: u.role || 'CLEANER',
      zoneIds: Array.isArray(u.zoneIds) ? u.zoneIds.map(Number) : []
    });
  };

  const handleDeleteUserItem = async (u) => {
    if (!window.confirm(`계정 [${u.username}]을 삭제하시겠습니까? 연결된 구역 권한도 함께 정리됩니다.`)) return;
    try {
      setDataLoading(true);
      await deleteUserApi(u.id);
      setUsersList(prev => prev.filter(item => item.id !== u.id));
      showToast(`계정 [${u.username}]이 삭제되었습니다.`);
    } catch (err) {
      showToast(`계정 삭제 실패: ${err.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  const historyTimes = historyPoints.map(point => parseUtcDate(point.measuredAt)?.getTime() || new Date(point.measuredAt).getTime());
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
          {historyPoints && historyPoints.length > 0 ? (
            <Line data={generateChartData()} options={chartOptions} />
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8', fontSize: '13px' }}>
              <IconWind size={24} style={{ marginBottom: '8px' }} />
              <span>실시간 센서 측정 이력 데이터 수집 대기 중</span>
              <span style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>IoT 하드웨어 기기에서 센서 데이터가 수집되면 실시간 시계열 추이 차트가 자동으로 표시됩니다.</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const confirmAccessibleAlerts = async () => {
    try {await resolveAllAlertsApi('담당 구역 알림 일괄 확인');setAlerts(prev=>prev.map(row=>accessibleAlerts.some(a=>a.id===row.id)?{...row,isChecked:true}:row));showToast('담당 구역 알림 조치가 저장되었습니다.');}
    catch(error){showToast(`알림 일괄 조치 실패: ${error.message}`);}
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

  const renderZoneWorkerSelect = (r, compact = false, fullWidth = false) => {
    const matchedWorker = workers.find(w =>
      (r.assignedWorkerId != null && Number(w.id) === Number(r.assignedWorkerId)) ||
      (w.assignedZoneId != null && Number(w.assignedZoneId) === Number(r.id)) ||
      (r.cleanWorker && r.cleanWorker !== '담당자 미지정' && w.name === r.cleanWorker)
    );
    const currentVal = matchedWorker ? String(matchedWorker.id) : '';
    const isUnassigned = !currentVal && (!r.cleanWorker || r.cleanWorker === '담당자 미지정');

    return (
      <select
        className={fullWidth ? 'cleaning-worker-select' : undefined}
        value={currentVal}
        onClick={e => e.stopPropagation()}
        onChange={e => {
          e.stopPropagation();
          handleAssignWorkerToZone(r.id, e.target.value);
        }}
        title="클릭하여 담당 청소관리인 지정/변경"
        style={{
          padding: compact ? '4px 8px' : '5px 10px',
          fontSize: '12px',
          fontWeight: '600',
          borderRadius: '6px',
          border: isUnassigned ? '1px solid #fca5a5' : '1px solid #cbd5e1',
          backgroundColor: isUnassigned ? '#fef2f2' : '#ffffff',
          color: isUnassigned ? '#dc2626' : '#0f172a',
          cursor: 'pointer',
          ...(fullWidth ? { flex: 1, minWidth: 0 } : { maxWidth: compact ? '160px' : '180px' }),
          outline: 'none'
        }}
      >
        <option value="">
          {isUnassigned ? '⚠️ 담당자 미지정 (선택)' : `담당 해제 (${r.cleanWorker})`}
        </option>
        {workers.map(w => (
          <option key={w.id} value={w.id}>
            👤 {w.name} ({w.role ? w.role.split(' ')[0] : '미화'})
          </option>
        ))}
      </select>
    );
  };

  const renderCleaningPanel = () => (
    <div className="cleaning-panel-card" style={styles.panelCard}>
      <div className="cleaning-panel-header">
        <h3 style={styles.panelTitle}>구역별 청소 현황</h3>
        <div className="cleaning-panel-header-actions">
          <button
            type="button"
            onClick={() => setIsWorkerModalOpen(true)}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '600',
              color: '#2563eb',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            + 청소관리인 등록/관리
          </button>
          <button onClick={() => setActiveTab('cleaning')} style={styles.panelLink}>전체 보기 &rarr;</button>
        </div>
      </div>
      {accessibleRestrooms.length === 0 ? (
        <div style={styles.panelEmpty}>담당 구역이 없습니다.</div>
      ) : (
        <div style={styles.cleaningList}>
          {accessibleRestrooms.map(r => {
            const isOver = r.lastCleanedHours >= appliedSettings.cleanWarnHours;
            return (
              <div
                key={r.id}
                className="cleaning-panel-item"
                onClick={() => {
                  setSelectedRestroom(r);
                  openQuickCleaningModal(r);
                }}
                title="행 클릭 시 즉시 청소 등록 · 드롭다운에서 담당자 바로 지정"
                style={{ cursor: 'pointer' }}
              >
                <div className="cleaning-panel-item-top">
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      title={r.name}
                      style={{
                        ...styles.cleaningName,
                        fontWeight: '600',
                        color: '#0f172a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {r.name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {r.floor}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    color: isOver ? '#dc2626' : '#64748b',
                    backgroundColor: isOver ? '#fef2f2' : '#ffffff',
                    border: `1px solid ${isOver ? '#fecaca' : '#e2e8f0'}`,
                    padding: '2px 7px',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    {isOver ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <IconAlertCircle size={11} /> {r.lastCleanedHours}h 지연
                      </span>
                    ) : (
                      r.lastCleanedHours == null ? '기록 없음' : `${r.lastCleanedHours}h 전`
                    )}
                  </span>
                </div>
                <div className="cleaning-panel-item-bottom" onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: '11px', fontWeight: '500', color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    담당 관리인
                  </span>
                  {renderZoneWorkerSelect(r, true, true)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // --- [청소 담당자 전용 대시보드 화면] ---
  const renderCleanerDashboard = () => {
    const delayedCount = accessibleRestrooms.filter(r => r.lastCleanedHours >= appliedSettings.cleanWarnHours).length;
    const checklistCompleted = Object.values(cleanChecklist).filter(Boolean).length;
    const checklistTotal = Object.keys(cleanChecklist).length;
    const checklistPercent = Math.round((checklistCompleted / checklistTotal) * 100);

    // 청소 담당자는 카드에서 바로 작업을 기록합니다. (버튼 모양은 다른 역할과 같은 공통 버튼)
    const cleanerFooter = (item) => {
      const isOver = item.lastCleanedHours >= appliedSettings.cleanWarnHours;
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
            label: `즉시 청소 필요 (${appliedSettings.cleanWarnHours}시간 초과)`,
            value: delayedCount,
            color: delayedCount > 0 ? '#dc2626' : '#0f172a',
            onClick: () => {
              const delayedR = accessibleRestrooms.find(r => r.lastCleanedHours >= appliedSettings.cleanWarnHours);
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
              handleBatchToggleChecklist(!allChecked);
            }
          })}
          {renderSummaryCard({ label: '미확인 알림', value: uncheckedAlerts, color: uncheckedAlerts > 0 ? '#d97706' : '#0f172a', onClick: () => setActiveTab('alerts') })}
        </div>

        <div className="admin-dashboard-body" style={styles.dashboardBody}>
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
                  onClick={() => handleBatchToggleChecklist(true)}
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
    const delayedCount = accessibleRestrooms.filter(r => r.lastCleanedHours >= appliedSettings.cleanWarnHours).length;

    // 카드 하단 깨짐 방지를 위해 2단 컬럼 레이아웃으로 정돈
    const adminFooter = (item) => {
      const isOver = item.lastCleanedHours >= appliedSettings.cleanWarnHours;
      return (
        <div style={{ ...styles.cardFooter, flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>최근 청소</span>
              <span style={{
                fontSize: '12px',
                color: isOver ? '#b91c1c' : '#334155',
                fontWeight: isOver ? '700' : '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap'
              }}>
                {isOver ? (
                  <>
                    <IconAlertCircle size={12} color="#b91c1c" />
                    <span>{item.lastCleanedHours}시간 경과</span>
                  </>
                ) : (
                  <span>{item.lastCleanedHours == null ? '기록 없음' : `${item.lastCleanedHours}시간 전`}</span>
                )}
              </span>
            </div>
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500', flexShrink: 0 }}>담당자</span>
              {renderZoneWorkerSelect(item, true, true)}
            </div>
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
              onClick={() => setIsWorkerModalOpen(true)}
              style={{ ...styles.secondaryBtn, borderColor: '#3b82f6', color: '#1d4ed8', backgroundColor: '#eff6ff' }}
            >
              <IconUsers size={13} /> 청소관리인 등록/배정
            </button>
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
            label: `청소 지연 (${appliedSettings.cleanWarnHours}시간 초과)`,
            value: delayedCount,
            color: delayedCount > 0 ? '#dc2626' : '#0f172a',
            onClick: () => handleOpenDispatchModal('ALL_DELAYED'),
            title: '클릭하여 청소 지연 구역 출동 지시 발령'
          })}
          {renderSummaryCard({ label: '미확인 현장 알림', value: uncheckedAlerts, color: uncheckedAlerts > 0 ? '#d97706' : '#0f172a', onClick: () => setActiveTab('alerts') })}
        </div>

        {renderFilterBar()}

        {/* 중앙 2열: 카드 그리드 / 우측 패널 */}
        <div className="admin-dashboard-body" style={styles.dashboardBody}>
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
            <button onClick={handlePingAllSensors} style={styles.secondaryBtn}>
              <IconRefresh size={13} /> 연결 확인
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
        <div className="admin-dashboard-body" style={styles.dashboardBody}>
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

            {/* 개발자 전용: IoT 노드 및 기기 세트 연결 현황 */}
            <div style={styles.panelCard}>
              <div style={styles.panelHeader}>
                <h3 style={{ ...styles.panelTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconCpu size={14} color="#2563eb" /> IoT 노드 연결 현황
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  등록 노드 {restrooms.length}개
                </span>
              </div>
              {restrooms.length === 0 ? (
                <div style={styles.panelEmpty}>등록된 IoT 노드가 없습니다.</div>
              ) : (
                <div style={{ ...styles.alertList, maxHeight: '280px', overflowY: 'auto' }}>
                  {restrooms.map(item => {
                    const isSelected = selectedRestroom?.id === item.id;
                    const st = statusStyle(item.status);
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedRestroom(item)}
                        style={{
                          ...styles.alertItem,
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                          border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`,
                          borderRadius: '6px',
                          padding: '8px 10px',
                          transition: 'all 0.15s ease'
                        }}
                        title="클릭 시 하단 실시간 시계열 추이 차트 조회"
                      >
                        <div style={styles.alertTop}>
                          <span style={{ ...styles.alertRestroom, fontWeight: '600', color: '#0f172a', fontSize: '12px' }}>
                            {item.name}
                          </span>
                          <span style={{
                            ...styles.statusPillSmall,
                            backgroundColor: st.bg,
                            color: st.text,
                            border: `1px solid ${st.border}`
                          }}>
                            <span style={{ ...styles.pillDot, backgroundColor: st.dot }} />
                            {st.label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '11px' }}>
                          <span style={{ fontFamily: MONO_FONT, color: '#475569', fontSize: '11px' }}>
                            MAC: {item.deviceId || '미등록'}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '600',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: item.ingestSource === 'direct_api' ? '#ecfdf5' : '#f1f5f9',
                            color: item.ingestSource === 'direct_api' ? '#059669' : '#475569'
                          }}>
                            {item.ingestSource === 'direct_api' ? 'Direct API' : 'MySQL/Upstash'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {renderHistoryChart(`장치 ${selectedRestroom?.deviceId ?? '—'} · 이력 ${historyPoints.length}개 · 최근 측정 ${selectedRestroom?.lastUpdated ?? '—'}`)}
      </div>
    );
  };

  // --- [청소관리인(미화 인원) 등록 및 구역 배정 관리 공통 UI] ---
  const renderWorkerManagementSection = () => (
    <div className="admin-worker-grid">
      {/* 좌측: 청소관리인 신규 등록 / 수정 폼 */}
      <div style={styles.panelCard}>
        <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
              {editingWorkerId ? '✏️ 청소관리인 정보 수정' : '➕ 신규 청소관리인 등록'}
            </h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              미화 담당 인원을 등록하고 담당 구역을 지정합니다.
            </span>
          </div>
          {editingWorkerId && (
            <button
              type="button"
              onClick={handleResetWorkerForm}
              style={{ ...styles.actionBtnSmall, color: '#64748b' }}
            >
              신규 전환
            </button>
          )}
        </div>

        <form onSubmit={handleSaveWorkerForm}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>성명 (필수)</label>
            <input
              type="text"
              required
              placeholder="예: 홍길동"
              value={workerFormName}
              onChange={e => setWorkerFormName(e.target.value)}
              style={styles.formInput}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>연락처</label>
            <input
              type="text"
              placeholder="예: 010-1234-5678"
              value={workerFormPhone}
              onChange={e => setWorkerFormPhone(e.target.value)}
              style={styles.formInput}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>소속 팀 / 담당 직무</label>
            <input
              type="text"
              placeholder="예: 환경미화 1팀 (1층 전담)"
              value={workerFormRole}
              onChange={e => setWorkerFormRole(e.target.value)}
              style={styles.formInput}
            />
          </div>

          <div className="worker-form-dual-row">
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>담당 구역 배정</label>
              <select
                value={workerFormZoneId}
                onChange={e => setWorkerFormZoneId(e.target.value)}
                style={styles.formSelect}
              >
                <option value="">-- 구역 미지정 --</option>
                {restrooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.floor})
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>근무 상태</label>
              <select
                value={workerFormStatus}
                onChange={e => setWorkerFormStatus(e.target.value)}
                style={styles.formSelect}
              >
                <option value="AVAILABLE">대기 중 (출동 가능)</option>
                <option value="DISPATCHED">현장 작업 중</option>
                <option value="OFF_DUTY">휴무 / 비번</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            {editingWorkerId && (
              <button
                type="button"
                onClick={handleResetWorkerForm}
                style={{ ...styles.secondaryBtn, flex: 1, justifyContent: 'center' }}
              >
                취소
              </button>
            )}
            <button
              type="submit"
              style={{
                ...styles.cleanBtnSubmit,
                flex: 2,
                backgroundColor: editingWorkerId ? '#2563eb' : '#0f172a'
              }}
            >
              {editingWorkerId ? '청소관리인 수정 저장' : '+ 청소관리인 등록 완료'}
            </button>
          </div>
        </form>
      </div>

      {/* 우측: 등록된 청소관리인 목록 및 구역 배정·상태 관리 테이블 */}
      <div style={styles.panelCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
              등록된 청소관리인 명단 및 구역 배정 현황
            </h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              총 {workers.length}명 등록됨 &middot; 드롭다운에서 담당 구역과 근무 상태를 즉시 변경할 수 있습니다.
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ ...styles.table, minWidth: '720px' }}>
            <thead>
              <tr style={styles.thRow}>
                <th style={{ ...styles.th, width: '100px', whiteSpace: 'nowrap' }}>성명</th>
                <th style={{ ...styles.th, width: '125px', whiteSpace: 'nowrap' }}>연락처</th>
                <th style={{ ...styles.th, minWidth: '130px', whiteSpace: 'nowrap' }}>소속 / 직무</th>
                <th style={{ ...styles.th, minWidth: '190px', whiteSpace: 'nowrap' }}>담당 구역 지정</th>
                <th style={{ ...styles.th, width: '150px', whiteSpace: 'nowrap' }}>근무 상태</th>
                <th style={{ ...styles.th, width: '90px', textAlign: 'center', whiteSpace: 'nowrap' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#64748b', fontSize: '13px' }}>
                    등록된 청소관리인이 없습니다. 좌측 폼에서 신규 청소관리인을 등록해주세요.
                  </td>
                </tr>
              ) : (
                workers.map(w => {
                  const assignedZone = restrooms.find(r =>
                    (w.assignedZoneId != null && Number(r.id) === Number(w.assignedZoneId)) ||
                    (r.assignedWorkerId != null && Number(r.assignedWorkerId) === Number(w.id))
                  );
                  return (
                    <tr key={w.id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap' }}>
                        👤 {w.name}
                      </td>
                      <td style={{ ...styles.td, fontFamily: MONO_FONT, fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {w.phone || '—'}
                      </td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{w.role || '위생관리팀'}</td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                        <select
                          value={assignedZone ? String(assignedZone.id) : (w.assignedZoneId ? String(w.assignedZoneId) : '')}
                          onChange={async (e) => {
                            const nextZoneId = e.target.value ? Number(e.target.value) : null;
                            if (nextZoneId) {
                              await handleAssignWorkerToZone(nextZoneId, w.id);
                            } else {
                              // 배정 해제
                              const prevZoneId = assignedZone?.id || w.assignedZoneId;
                              if (prevZoneId) {
                                await handleAssignWorkerToZone(prevZoneId, '');
                              }
                              await updateWorkerApi(w.id, {
                                name: w.name,
                                phone: w.phone || '',
                                role: w.role || 'CLEANER',
                                status: w.status || 'AVAILABLE',
                                assignedZoneId: null
                              }).catch(() => {});
                              const fresh = await fetchWorkersApi();
                              if (fresh) setWorkers(fresh);
                            }
                          }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            fontWeight: '600',
                            borderRadius: '4px',
                            border: assignedZone ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                            backgroundColor: assignedZone ? '#eff6ff' : '#ffffff',
                            color: assignedZone ? '#1d4ed8' : '#64748b',
                            cursor: 'pointer',
                            maxWidth: '220px',
                            width: '100%'
                          }}
                        >
                          <option value="">미배정 (구역 선택)</option>
                          {restrooms.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.floor})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                        <select
                          value={w.status || 'AVAILABLE'}
                          onChange={e => handleChangeWorkerStatus(w.id, e.target.value)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: '600',
                            borderRadius: '999px',
                            border: w.status === 'AVAILABLE' ? '1px solid #bbf7d0' : w.status === 'DISPATCHED' ? '1px solid #fde68a' : '1px solid #cbd5e1',
                            backgroundColor: w.status === 'AVAILABLE' ? '#f0fdf4' : w.status === 'DISPATCHED' ? '#fffbeb' : '#f1f5f9',
                            color: w.status === 'AVAILABLE' ? '#166534' : w.status === 'DISPATCHED' ? '#b45309' : '#64748b',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="AVAILABLE">● 대기 중 (출동 가능)</option>
                          <option value="DISPATCHED">● 현장 작업 중</option>
                          <option value="OFF_DUTY">○ 휴무 / 비번</option>
                        </select>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => handleEditWorkerClick(w)}
                            style={{ ...styles.actionBtnSmall, color: '#2563eb' }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWorker(w)}
                            style={{ ...styles.actionBtnSmall, color: '#dc2626' }}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

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
                {user?.role !== ROLES.CLEANER && discoveredDevices && discoveredDevices.length > 0 && (
                  <span style={{
                    marginLeft: '6px',
                    padding: '1px 6px',
                    fontSize: '10px',
                    fontWeight: '700',
                    borderRadius: '10px',
                    backgroundColor: '#f59e0b',
                    color: '#ffffff'
                  }}>
                    {discoveredDevices.length}
                  </span>
                )}
              </button>
            )}
          </nav>
        </div>

        <div style={styles.headerRight}>
          {user?.role !== ROLES.CLEANER && discoveredDevices && discoveredDevices.length > 0 && (
            <button
              onClick={() => {
                setActiveTab('settings');
                setSettingsSubTab('restrooms');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                backgroundColor: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fcd34d',
                borderRadius: '16px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
              title="미등록 IoT 기기가 감지되었습니다. 클릭하여 등록하기"
            >
              <span>📡 새 기기 {discoveredDevices.length}대 감지</span>
            </button>
          )}

          <button
            onClick={handleManualRefresh}
            style={{ ...styles.logoutBtn, padding: '4px 8px', fontSize: '11px' }}
            title="관제 데이터 즉시 새로고침"
          >
            <IconRefresh size={11} /> 갱신 {lastUpdatedTime}
          </button>

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

      {issuedCredential && (
        <div role="dialog" aria-modal="true" aria-label="장치 인증 키" style={{position:'fixed',inset:0,zIndex:9999,background:'#0008',display:'grid',placeItems:'center'}}>
          <div style={{background:'white',padding:24,borderRadius:12,maxWidth:600}}>
            <h3>{issuedCredential.macAddress} 인증 키</h3><p>이 키는 지금 한 번만 표시됩니다. 해당 장치의 설정 포털에 저장하세요.</p>
            <code style={{overflowWrap:'anywhere'}}>{issuedCredential.key}</code>
            <div><button onClick={async()=>{try{await navigator.clipboard.writeText(issuedCredential.key);showToast('인증 키를 복사했습니다.');}catch{showToast('복사하지 못했습니다. 키를 직접 선택해주세요.');}}}>복사</button>
            <button onClick={()=>setIssuedCredential(null)}>닫기</button></div>
          </div>
        </div>
      )}
      {/* 토스트 알림 */}
      <section className="sensor-data-toolbar">
        <SensorDataStatus loading={dataLoading} intervalSeconds={appliedSettings.refreshSeconds} />
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
              onClick={confirmAccessibleAlerts}
              style={styles.secondaryBtn}
            >
              선택 항목 일괄 확인
            </button>
          </div>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ ...styles.table, minWidth: '760px' }}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>발생 시각</th>
                  <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>화장실</th>
                  <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>항목</th>
                  <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>등급</th>
                  <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>측정값</th>
                  <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>내용</th>
                  <th style={{ ...styles.th, whiteSpace: 'nowrap', textAlign: 'center' }}>확인 상태</th>
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
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{a.time}</td>
                        <td style={{ ...styles.td, fontWeight: '500', whiteSpace: 'nowrap' }}>{a.restroom}</td>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{a.metric}</td>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                          <span style={{
                            ...styles.statusPillSmall,
                            backgroundColor: st.bg,
                            color: st.text,
                            border: `1px solid ${st.border}`
                          }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{a.value}</td>
                        <td style={{ ...styles.td, minWidth: '160px' }}>{a.memo}</td>
                        <td style={{ ...styles.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
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
        </div>
      )}

      {/* 5. 청소 관리 전면 개편 화면 (SCR-05 명세 반영) */}
      {activeTab === 'cleaning' && (
        <div style={{ padding: '20px 24px', maxWidth: '1380px', margin: '0 auto' }}>
          {/* ① 상단 화장실별 최근 청소 경과 현황 및 담당자 지정 바 (FR-53) */}
          <section style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                화장실별 마지막 청소 경과 현황
              </h3>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                기준 시간({appliedSettings.cleanWarnHours}시간) 초과 시 경고 표시
              </span>
            </div>

            <div style={styles.cleaningStatusTicker}>
              {accessibleRestrooms.map(r => {
                const isOver = r.lastCleanedHours >= appliedSettings.cleanWarnHours;
                return (
                  <div
                    key={r.id}
                    style={{
                      ...styles.tickerCard,
                      border: isOver ? '1px solid #fee2e2' : '1px solid #e2e8f0',
                      backgroundColor: isOver ? '#fff5f5' : '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span title={r.name} style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {r.floor} &middot; {isOver ? (
                          <span style={{ color: '#dc2626', fontWeight: '600' }}><IconAlertCircle size={11} /> {r.lastCleanedHours}시간 경과</span>
                        ) : (
                          r.lastCleanedHours == null ? '청소 기록 없음' : `${r.lastCleanedHours}시간 전`
                        )}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '11px', fontWeight: '500', color: '#64748b', flexShrink: 0 }}>담당 관리인</span>
                      {renderZoneWorkerSelect(r, true, true)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ② 청소관리인 등록 및 구역 배정 섹션 */}
          <section style={{ marginBottom: '20px' }}>
            {renderWorkerManagementSection()}
          </section>

          {/* 중앙 2열 분할 레이아웃: 좌측(청소 완료 등록 폼) / 우측(청소 이력 상세 테이블) */}
          <div className="admin-cleaning-split">
            {/* ③ 청소 완료 등록 폼 (FR-50) */}
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
                    onChange={e => {
                      const nextId = e.target.value;
                      setCleanFormRestroomId(nextId);
                      const targetR = accessibleRestrooms.find(r => String(r.id) === String(nextId));
                      if (targetR && targetR.cleanWorker && targetR.cleanWorker !== '담당자 미지정') {
                        setCleanFormWorker(targetR.cleanWorker);
                      }
                    }}
                    style={styles.formSelect}
                  >
                    {accessibleRestrooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.floor}) - 담당: {r.cleanWorker}</option>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ ...styles.formLabel, marginBottom: 0 }}>담당자 성명</label>
                    {workers.length > 0 && (
                      <select
                        value=""
                        onChange={e => {
                          if (e.target.value) setCleanFormWorker(e.target.value);
                        }}
                        style={{
                          padding: '2px 6px',
                          fontSize: '11px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#f8fafc',
                          color: '#334155',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">등록된 관리인 선택...</option>
                        {workers.map(w => (
                          <option key={w.id} value={`${w.name} (${w.role ? w.role.split(' ')[0] : '미화팀'})`}>
                            {w.name} ({w.role || '미화팀'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
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

              {/* 일일 위생 체크리스트 (MySQL daily_checklists 영속화) */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                    📋 당일 위생 체크리스트
                  </h4>
                  <span style={{ fontSize: '10px', color: '#166534', fontWeight: '600' }}>
                    DB 자동 저장
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'floor', label: '바닥 물청소·건조 및 소독' },
                    { key: 'sink', label: '세면대·거울 소독 및 물얼룩 제거' },
                    { key: 'toilet', label: '변기 살균 세정 및 수압 점검' },
                    { key: 'soap', label: '휴지·비누·손소독제 보충' },
                    { key: 'trash', label: '쓰레기통 비움·위생봉투 교체' },
                    { key: 'vent', label: '환풍기 가동·디퓨저 향기 점검' }
                  ].map(item => {
                    const isChecked = !!cleanChecklist[item.key];
                    return (
                      <label
                        key={item.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                          color: isChecked ? '#166534' : '#334155',
                          backgroundColor: isChecked ? '#f0fdf4' : '#f8fafc',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: isChecked ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecklistItem(item.key)}
                        />
                        <span style={{ textDecoration: isChecked ? 'line-through' : 'none' }}>
                          {item.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ④ 청소 이력 테이블 (FR-51) */}
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
                      <option key={r.id} value={r.id}>{r.name} · 구역 #{r.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ ...styles.table, minWidth: '700px' }}>
                  <thead>
                    <tr style={styles.thRow}>
                      <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>작업 일시</th>
                      <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>화장실 구역</th>
                      <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>작업 구분</th>
                      <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>담당자</th>
                      <th style={styles.th}>점검 메모</th>
                      <th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessibleCleaningLogs
                      .filter(log => cleanFilterRestroom === 'ALL' || String(log.zoneId) === cleanFilterRestroom)
                      .map(log => (
                        <tr key={log.id} style={styles.tr}>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{log.time}</td>
                          <td style={{ ...styles.td, fontWeight: '600', whiteSpace: 'nowrap' }}>{log.restroomName}</td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                            <span style={styles.cleanTypeTag}>{log.type}</span>
                          </td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{log.worker}</td>
                          <td style={{ ...styles.td, minWidth: '150px' }}>{log.memo}</td>
                          <td style={{ ...styles.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={styles.statusPillSmall}>완료</span>
                          </td>
                        </tr>
                      ))}
                    {accessibleCleaningLogs.filter(log => cleanFilterRestroom === 'ALL' || String(log.zoneId) === cleanFilterRestroom).length === 0 && (
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
                    onChange={e => selectThresholdScope(e.target.value)}
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
                        disabled={user.role !== ROLES.DEVELOPER}
                        value={thresholds.tempWarn}
                        onChange={e => setThresholds({ ...thresholds, tempWarn: Number(e.target.value) })}
                        style={styles.thresholdInput}
                      />
                    </div>
                    <div style={styles.thresholdInputCol}>
                      <label style={styles.thresholdLabel}>위험 기준 (이상)</label>
                      <input
                        type="number"
                        disabled={user.role !== ROLES.DEVELOPER}
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
                        disabled={user.role !== ROLES.DEVELOPER}
                        value={thresholds.humidWarn}
                        onChange={e => setThresholds({ ...thresholds, humidWarn: Number(e.target.value) })}
                        style={styles.thresholdInput}
                      />
                    </div>
                    <div style={styles.thresholdInputCol}>
                      <label style={styles.thresholdLabel}>위험 기준 (이상)</label>
                      <input
                        type="number"
                        disabled={user.role !== ROLES.DEVELOPER}
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
                <button onClick={handleSaveThresholds} style={styles.primaryBtn}>
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

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        const firstZoneId = accessibleRestrooms[0]?.id || restrooms[0]?.id || 3;
                        setNewSensorData({ zoneId: firstZoneId, sensorType: 'TEMP_HUMID' });
                        setIsAddSensorModalOpen(true);
                      }}
                      style={{ ...styles.secondaryBtn, borderColor: '#3b82f6', color: '#1d4ed8' }}
                    >
                      <IconPlus /> 센서 단독 추가
                    </button>
                    <button onClick={() => setIsAddZoneModalOpen(true)} style={styles.secondaryBtn}>
                      <IconPlus /> 신규 구역 등록
                    </button>
                    <button onClick={() => setIsAddRestroomModalOpen(true)} style={styles.primaryBtn}>
                      <IconPlus /> 신규 화장실 등록
                    </button>
                  </div>
                </div>

                {/* 미등록 IoT 기기 자동 감지 대기함 (관리자 전용) */}
                {discoveredDevices && discoveredDevices.length > 0 ? (
                  <div style={{
                    marginBottom: '18px',
                    padding: '14px 16px',
                    backgroundColor: '#fffbeb',
                    borderRadius: '8px',
                    border: '1px solid #fde68a',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '15px' }}>📡</span>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#92400e' }}>
                          신규 감지된 미등록 기기 ({discoveredDevices.length}대 대기 중)
                        </h4>
                        <span style={{ fontSize: '11px', color: '#b45309' }}>
                          장치가 전송한 확인 전 정보입니다. 현장의 MAC 주소와 설치 위치를 대조한 뒤 등록해주세요.
                        </span>
                      </div>
                      <button
                        onClick={loadDiscoveredDevices}
                        style={{ ...styles.secondaryBtn, padding: '3px 8px', fontSize: '11px', height: '24px' }}
                      >
                        새로고침
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {discoveredDevices.map(dev => (
                        <div
                          key={dev.macAddress}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            backgroundColor: '#ffffff',
                            borderRadius: '6px',
                            border: '1px solid #fef3c7',
                            flexWrap: 'wrap',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                              <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>MAC: </span>
                              <strong style={{ fontFamily: 'monospace', fontSize: '13px', color: '#0f172a' }}>{dev.macAddress}</strong>
                            </div>
                            {dev.ipAddress && (
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                IP: <span style={{ fontFamily: 'monospace' }}>{dev.ipAddress}</span>
                              </div>
                            )}
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              최근 신호: <span style={{ color: '#0f172a', fontWeight: '500' }}>{dev.lastSeenAt ? parseUtcDate(dev.lastSeenAt).toLocaleTimeString('ko-KR') : '방금'}</span>
                              {dev.requestCount > 1 && ` (${dev.requestCount}회)`}
                            </div>
                            {dev.latitude != null && dev.longitude != null && (
                              <div style={{ fontSize: '11px', color: '#0284c7', backgroundColor: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                                📍 GPS: {dev.latitude.toFixed(4)}, {dev.longitude.toFixed(4)}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleRegisterDiscoveredDevice(dev)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              + 이 기기로 신규 화장실 등록
                            </button>
                            <button
                              onClick={() => handleDismissDiscoveredDevice(dev.macAddress)}
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#f1f5f9',
                                color: '#64748b',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              무시
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    marginBottom: '16px',
                    padding: '10px 14px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#64748b'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#16a34a', fontWeight: '700' }}>✔</span>
                      <span>모든 IoT 기기가 정상 등록되어 운영 중입니다. 새로운 ESP32의 전원을 켜면 여기에 자동으로 감지됩니다.</span>
                    </div>
                    <button
                      onClick={loadDiscoveredDevices}
                      style={{ ...styles.secondaryBtn, padding: '2px 8px', fontSize: '11px', height: '22px' }}
                    >
                      실시간 감지 확인
                    </button>
                  </div>
                )}

                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ ...styles.table, minWidth: '680px' }}>
                    <thead>
                      <tr style={styles.thRow}>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>시설명</th>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>층수</th>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>구분</th>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>아두이노 기기 ID</th>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>상태</th>
                        <th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>동작</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restrooms.map(r => (
                        <tr key={r.id} style={styles.tr}>
                          <td style={{ ...styles.td, fontWeight: '600', whiteSpace: 'nowrap' }}>{r.name}</td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{r.floor}</td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{genderLabel(r.gender)}</td>
                          <td style={{ ...styles.td, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{r.deviceId}</span>
                              <button
                                onClick={() => handleOpenEditDeviceSet(r)}
                                title="아두이노 기기(ESP32 MAC) 변경 또는 설치 위치(구역) 이동"
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '10px',
                                  color: '#2563eb',
                                  backgroundColor: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: '600'
                                }}
                              >
                                변경
                              </button>
                            </div>
                          </td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                            <span style={{
                              ...styles.statusPillSmall,
                              backgroundColor: r.isActive ? '#f0fdf4' : '#f1f5f9',
                              color: r.isActive ? '#166534' : '#64748b'
                            }}>
                              {r.isActive ? '사용 중' : '비활성'}
                            </span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', whiteSpace: 'nowrap' }}>
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
                                onClick={() => handleOpenEditZone(r)}
                                style={{
                                  ...styles.actionBtnSmall,
                                  color: '#2563eb'
                                }}
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleOpenEditDeviceSet(r)}
                                style={{
                                  ...styles.actionBtnSmall,
                                  color: '#059669',
                                  borderColor: '#bbf7d0',
                                  backgroundColor: '#f0fdf4'
                                }}
                                title="설치된 아두이노 보드(MAC) 교체 또는 다른 구역으로 위치 이전"
                              >
                                기기 변경
                              </button>
                              <button
                                onClick={() => handleOpenDeviceSetHistory(r)}
                                style={{
                                  ...styles.actionBtnSmall,
                                  color: '#4f46e5'
                                }}
                              >
                                이력
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

                {/* 개별 센서 현황 및 상태/삭제 관리 (GET/PATCH/DELETE /api/dev/sensors) */}
                <div style={{ marginTop: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                        개별 등록 센서 현황 (GET / PATCH / DELETE /api/dev/sensors)
                      </h4>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        구역별로 설치된 온습도(TEMP_HUMID)·유해가스(GAS)·도어(MAG) 센서의 상태 전환 및 개별 삭제를 관리합니다.
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          const firstZoneId = accessibleRestrooms[0]?.id || restrooms[0]?.id || 3;
                          setNewSensorData({ zoneId: firstZoneId, sensorType: 'TEMP_HUMID' });
                          setIsAddSensorModalOpen(true);
                        }}
                        style={{ ...styles.secondaryBtn, color: '#2563eb' }}
                      >
                        <IconPlus /> 센서 단독 추가
                      </button>
                      <button onClick={() => fetchSensorsApi().then(setSensorsList)} style={styles.secondaryBtn}>
                        새로고침
                      </button>
                    </div>
                  </div>
                  {sensorsList && sensorsList.length > 0 ? (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ ...styles.table, minWidth: '680px' }}>
                        <thead>
                          <tr style={styles.thRow}>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>센서 ID</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>센서 종류</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>설치 구역</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>기기 세트</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>상태</th>
                            <th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>동작</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sensorsList.map(s => (
                            <tr key={s.sensorId} style={styles.tr}>
                              <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: '600', whiteSpace: 'nowrap' }}>#{s.sensorId}</td>
                              <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{s.sensorType}</td>
                              <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{s.zoneName || `구역 #${s.zoneId}`}</td>
                              <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                {s.setCode ? `${s.setCode} (${s.macAddress || ''})` : '단독 센서'}
                              </td>
                              <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                                <span style={{
                                  ...styles.statusPillSmall,
                                  backgroundColor: s.status === 'ACTIVE' ? '#f0fdf4' : '#f1f5f9',
                                  color: s.status === 'ACTIVE' ? '#166534' : '#64748b'
                                }}>
                                  {s.status || 'OFFLINE'}
                                </span>
                              </td>
                              <td style={{ ...styles.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '8px', whiteSpace: 'nowrap' }}>
                                  <button
                                    onClick={() => handleToggleSensorStatus(s)}
                                    style={{
                                      ...styles.actionBtnSmall,
                                      color: s.status === 'ACTIVE' ? '#d97706' : '#166534'
                                    }}
                                  >
                                    {s.status === 'ACTIVE' ? '오프라인 전환' : '온라인 전환'}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSensorItem(s)}
                                    style={{ ...styles.actionBtnSmall, color: '#dc2626' }}
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
                    <div style={{ fontSize: '12px', color: '#94a3b8', padding: '12px 0' }}>등록된 개별 센서가 없습니다.</div>
                  )}
                </div>
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
                      /> 초 (기본: 90초)
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
                      /> 초 (기본: 30초)
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
                      /> 시간 (기본: 4시간)
                    </div>
                  </div>

                  <div style={styles.systemRow}>
                    <div style={styles.systemLabelCol}><div style={styles.systemLabelTitle}>센서 원본 보관 기간</div><div style={styles.systemLabelSub}>현재 서버 정책은 7일입니다.</div></div>
                    <div style={styles.systemInputCol}>7일</div>
                  </div>
                  <p>장치 인증 키는 아래 기기별 버튼에서 발급·폐기합니다. 새 키를 발급하면 이전 키는 즉시 사용할 수 없습니다.</p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={handleSaveSystemSettings} style={styles.primaryBtn}>
                    시스템 설정 저장
                  </button>
                </div>

                {/* 클라우드 Upstash Redis 동기화 모니터링 */}
                <div style={{ marginTop: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                        Upstash Redis 클라우드 원격 동기화 상태 (GET /api/iot/upstash/status)
                      </h4>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>ESP32 수집 센서 데이터의 클라우드 백업 및 동기화 파이프라인 모니터링입니다.</span>
                    </div>
                    <button onClick={() => fetchUpstashStatusApi().then(setUpstashStatus).catch(error=>showToast(error.message))} style={styles.secondaryBtn}>새로고침</button>
                  </div>
                  {upstashStatus ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                      <div><span style={{ color: '#64748b', display: 'block', marginBottom: '4px' }}>Redis 구성:</span> <strong>{upstashStatus.configured ? '설정 완료 (OK)' : '미설정'}</strong></div>
                      <div><span style={{ color: '#64748b', display: 'block', marginBottom: '4px' }}>동기화 활성:</span> <strong>{upstashStatus.enabled ? '작동 중' : '비활성'}</strong></div>
                      <div><span style={{ color: '#64748b', display: 'block', marginBottom: '4px' }}>누적 수집 데이터:</span> <strong>{upstashStatus.importedSamples != null ? upstashStatus.importedSamples.toLocaleString() : 0}건</strong></div>
                      <div><span style={{ color: '#64748b', display: 'block', marginBottom: '4px' }}>최근 성공 시각:</span> <strong>{upstashStatus.lastSuccess ? parseUtcDate(upstashStatus.lastSuccess).toLocaleTimeString('ko-KR') : '대기 중'}</strong></div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#94a3b8', padding: '12px 0' }}>클라우드 동기화 상태를 확인하고 있습니다...</div>
                  )}
                </div>

                {/* 하드웨어 기기 세트 등록 상세 */}
                <div style={{ marginTop: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                        등록된 IoT 기기 세트 현황 (GET /api/admin/device-sets)
                      </h4>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>ESP32 컨트롤러 MAC 주소와 관제 구역 매핑 현황입니다.</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          const firstZoneId = accessibleRestrooms[0]?.id || restrooms[0]?.id || 3;
                          setNewSensorData({ zoneId: firstZoneId, sensorType: 'TEMP_HUMID' });
                          setIsAddSensorModalOpen(true);
                        }}
                        style={{ ...styles.secondaryBtn, color: '#2563eb' }}
                      >
                        <IconPlus /> 센서 단독 추가
                      </button>
                      <button onClick={() => fetchDeviceSetsApi().then(setDeviceSets).catch(error=>showToast(error.message))} style={styles.secondaryBtn}>새로고침</button>
                    </div>
                  </div>
                  {deviceSets && deviceSets.length > 0 ? (
                    <div style={{overflowX:'auto'}}><table style={{ ...styles.table, minWidth: '680px' }}>
                        <thead>
                          <tr style={styles.thRow}>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>세트 코드</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>MAC 주소</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>연동 구역</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>설치 라벨</th>
                            <th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>동작</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deviceSets.map(ds => (
                            <tr key={ds.deviceSetId} style={styles.tr}>
                              <td style={{ ...styles.td, whiteSpace: 'nowrap' }}><strong>{ds.setCode}</strong></td>
                              <td style={{ ...styles.td, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{ds.macAddress}</td>
                              <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{ds.zoneName || `Zone #${ds.zoneId}`}</td>
                              <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{ds.installationLabel || '—'}</td>
                              <td style={{ ...styles.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '6px', whiteSpace: 'nowrap' }}><button onClick={()=>issueDeviceKey(ds.macAddress)} style={styles.actionBtnSmall}>인증 키 발급</button><button onClick={()=>revokeDeviceKey(ds.macAddress)} style={styles.actionBtnSmall}>인증 키 폐기</button>
                                  <button
                                    onClick={() => handleOpenEditDeviceSetFromSet(ds)}
                                    style={{ ...styles.actionBtnSmall, color: '#2563eb' }}
                                  >
                                    수정
                                  </button>
                                  <button
                                    onClick={() => handleOpenDeviceSetHistoryFromSet(ds)}
                                    style={{ ...styles.actionBtnSmall, color: '#4f46e5' }}
                                  >
                                    이력
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDeviceSet(ds.deviceSetId)}
                                    style={{ ...styles.actionBtnSmall, color: '#dc2626' }}
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
                    <div style={{ fontSize: '12px', color: '#94a3b8', padding: '12px 0' }}>등록된 IoT 하드웨어 기기 세트가 없습니다.</div>
                  )}
                </div>

                {/* 시스템 계정(Users) 및 구역 접근 권한(ZonePermissions) 관리 (F07, F18) */}
                <div style={{ marginTop: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                        시스템 계정 및 구역 접근 권한 관리 (GET / POST / PUT / DELETE /api/admin/users)
                      </h4>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        개발자(DEVELOPER)·현장관리자(ADMIN)·청소담당자(CLEANER) 계정을 생성·수정·삭제하고 접근 가능한 관제 구역을 배정합니다.
                      </span>
                    </div>
                    <button onClick={() => fetchUsersApi().then(setUsersList)} style={styles.secondaryBtn}>새로고침</button>
                  </div>

                  <form
                    onSubmit={handleSaveUserForm}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 2fr auto',
                      gap: '10px',
                      alignItems: 'end',
                      padding: '12px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      marginBottom: '14px'
                    }}
                  >
                    <div>
                      <label style={{ ...styles.formLabel, fontSize: '11px' }}>계정 ID (username)</label>
                      <input
                        type="text"
                        placeholder="예: cleaner2"
                        value={userForm.username}
                        onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                        style={styles.formInput}
                      />
                    </div>
                    <div>
                      <label style={{ ...styles.formLabel, fontSize: '11px' }}>
                        {editingUserId ? '비밀번호 (변경 시 입력)' : '비밀번호'}
                      </label>
                      <input
                        type="password"
                        placeholder={editingUserId ? '유지 시 비워둠' : '12자 이상 직접 입력'}
                        value={userForm.password}
                        onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                        style={styles.formInput}
                      />
                    </div>
                    <div>
                      <label style={{ ...styles.formLabel, fontSize: '11px' }}>권한 역할 (Role)</label>
                      <select
                        value={userForm.role}
                        onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                        style={styles.formSelect}
                      >
                        <option value="DEVELOPER">DEVELOPER (최고 개발자)</option>
                        <option value="ADMIN">ADMIN (현장 관리자)</option>
                        <option value="CLEANER">CLEANER (청소 담당자)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ ...styles.formLabel, fontSize: '11px' }}>담당 관제 구역 선택 (복수 선택)</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px 8px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', maxHeight: '64px', overflowY: 'auto' }}>
                        {restrooms.map(r => {
                          const checked = userForm.zoneIds.includes(Number(r.id));
                          return (
                            <label key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const zId = Number(r.id);
                                  setUserForm(prev => ({
                                    ...prev,
                                    zoneIds: checked ? prev.zoneIds.filter(id => id !== zId) : [...prev.zoneIds, zId]
                                  }));
                                }}
                              />
                              <span>{r.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {editingUserId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(null);
                            setUserForm({ username: '', password: '', role: 'CLEANER', zoneIds: [] });
                          }}
                          style={styles.secondaryBtn}
                        >
                          취소
                        </button>
                      )}
                      <button type="submit" style={styles.primaryBtn}>
                        {editingUserId ? '계정 수정' : '계정 등록'}
                      </button>
                    </div>
                  </form>

                  {usersList && usersList.length > 0 ? (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ ...styles.table, minWidth: '700px' }}>
                        <thead>
                          <tr style={styles.thRow}>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>ID</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>계정명</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>역할(Role)</th>
                            <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>배정된 접근 가능 구역</th>
                            <th style={{ ...styles.th, textAlign: 'center', whiteSpace: 'nowrap' }}>관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usersList.map(u => (
                            <tr key={u.id} style={styles.tr}>
                              <td style={{ ...styles.td, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>#{u.id}</td>
                              <td style={{ ...styles.td, fontWeight: '600', whiteSpace: 'nowrap' }}>{u.username}</td>
                              <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                                <span style={styles.statusPillSmall}>{u.role}</span>
                              </td>
                              <td style={{ ...styles.td, fontSize: '12px', minWidth: '180px' }}>
                                {u.role === 'DEVELOPER'
                                  ? '전체 구역 (최고 권한)'
                                  : (u.zoneNames && u.zoneNames.length > 0 ? u.zoneNames.join(', ') : '미배정')}
                              </td>
                              <td style={{ ...styles.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '6px', whiteSpace: 'nowrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleEditUserClick(u)}
                                    style={{ ...styles.actionBtnSmall, color: '#2563eb' }}
                                  >
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUserItem(u)}
                                    style={{ ...styles.actionBtnSmall, color: '#dc2626' }}
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
                    <div style={{ fontSize: '12px', color: '#94a3b8', padding: '12px 0' }}>등록된 시스템 계정이 없습니다.</div>
                  )}
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
                <label style={styles.formLabel}>아두이노 기기 식별자 (deviceId / MAC)</label>
                <input
                  type="text"
                  placeholder="예: 24:DC:C3:99:AA:01 또는 WC-4F-M-01"
                  value={newRestroomDeviceId}
                  onChange={e => setNewRestroomDeviceId(e.target.value)}
                  style={styles.formInput}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>담당 청소관리인 지정 (선택)</label>
                <select
                  value={newRestroomWorkerId}
                  onChange={e => setNewRestroomWorkerId(e.target.value)}
                  style={styles.formSelect}
                >
                  <option value="">-- 담당자 미지정 (추후 배정 가능) --</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.role || '위생기동반'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 현장 설치 기사 스마트폰 GPS(navigator.geolocation) 좌표 설정 */}
              <div style={{
                marginTop: '4px',
                padding: '12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>
                      설치 위치 좌표 설정 (지도 핀 / 주소 검색 / GPS)
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      지도 핀 찍기(HTTP 지원) 또는 스마트폰 GPS로 좌표를 자동 입력합니다.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => openLocationPicker('restroom')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 12px',
                        backgroundColor: '#059669',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 2px rgba(5, 150, 105, 0.25)'
                      }}
                    >
                      <IconMapPin size={13} color="#ffffff" />
                      <span>지도 핀 / 주소 검색</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetCurrentGpsLocation('restroom')}
                      disabled={isGpsLocating}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 12px',
                        backgroundColor: isGpsLocating ? '#94a3b8' : '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: isGpsLocating ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)'
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      </svg>
                      {isGpsLocating ? 'GPS 수신 중...' : '현재 GPS 위치'}
                    </button>
                  </div>
                </div>

                {gpsStatusMsg && (
                  <div style={{
                    fontSize: '11px',
                    padding: '6px 10px',
                    marginBottom: '8px',
                    borderRadius: '6px',
                    backgroundColor: gpsStatusMsg.includes('완료') ? '#f0fdf4' : '#eff6ff',
                    color: gpsStatusMsg.includes('완료') ? '#15803d' : '#1d4ed8',
                    border: `1px solid ${gpsStatusMsg.includes('완료') ? '#bbf7d0' : '#bfdbfe'}`
                  }}>
                    {gpsStatusMsg}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ ...styles.formLabel, fontSize: '11px', marginBottom: '4px' }}>위도 (Latitude)</label>
                    <input
                      type="text"
                      placeholder="예: 37.566826"
                      value={newRestroomLat}
                      onChange={e => setNewRestroomLat(e.target.value)}
                      style={{ ...styles.formInput, fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#ffffff' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...styles.formLabel, fontSize: '11px', marginBottom: '4px' }}>경도 (Longitude)</label>
                    <input
                      type="text"
                      placeholder="예: 126.978656"
                      value={newRestroomLng}
                      onChange={e => setNewRestroomLng(e.target.value)}
                      style={{ ...styles.formInput, fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#ffffff' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => { setIsAddRestroomModalOpen(false); setGpsStatusMsg(''); }} style={styles.secondaryBtn}>취소</button>
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
                    {`🚨 청소 기준 초과 구역 일괄 (${accessibleRestrooms.filter(r => r.lastCleanedHours >= appliedSettings.cleanWarnHours).length}개소)`}
                  </option>
                  <option value="ALL_ACCESSIBLE">
                    {`🏢 전체 담당 구역 (${accessibleRestrooms.length}개소)`}
                  </option>
                  <optgroup label="개별 화장실 구역 선택">
                    {accessibleRestrooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.floor}) - {r.lastCleanedHours == null ? '청소 기록 없음' : r.lastCleanedHours >= appliedSettings.cleanWarnHours ? `⚠️ ${r.lastCleanedHours}시간 경과 (지연)` : `${r.lastCleanedHours}시간 전 청소`}
                      </option>
                    ))}
                  </optgroup>
                </select>

                {/* 대상 구역 상세 정보 카드 */}
                {dispatchTargetId === 'ALL_DELAYED' ? (
                  <div style={styles.dispatchTargetHint}>
                    {accessibleRestrooms.filter(r => r.lastCleanedHours >= appliedSettings.cleanWarnHours).length > 0 ? (
                      <span>
                        지연 대상: <strong>{accessibleRestrooms.filter(r => r.lastCleanedHours >= appliedSettings.cleanWarnHours).map(r => `${r.name}(${r.lastCleanedHours}시간 경과)`).join(', ')}</strong>
                      </span>
                    ) : (
                      <span>현재 {appliedSettings.cleanWarnHours}시간 이상 지연된 구역이 없습니다. (전체 담당 구역으로 일괄 발령 가능)</span>
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
                      onClick={() => setSelectedCleanerIds(cleanersList[0] ? [cleanersList[0].id] : ['1'])}
                      style={styles.cleanerQuickBtn}
                    >
                      기본 1인
                    </button>
                  </div>
                </div>

                {/* 미화 인원 선택 그리드 */}
                <div style={styles.cleanerGrid}>
                  {cleanersList.map(cleaner => {
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
                      onClick={() => setDispatchMemo(`청소 기준 시간(${appliedSettings.cleanWarnHours}시간) 초과 구역 현장 점검 및 즉시 바닥 소독 요망`)}
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
                  {cleanersList.filter(c => selectedCleanerIds.includes(c.id)).map(c => c.name).join(', ') || '없음'}
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
      {/* 1. 신규 구역 등록 모달 */}
      {isAddZoneModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsAddZoneModalOpen(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>신규 관제 구역 등록</h3>
              <button onClick={() => setIsAddZoneModalOpen(false)} style={styles.modalClose}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>구역 명칭 (건물/층/화장실)</label>
                <input
                  type="text"
                  placeholder="예: 본관 3층 화장실"
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value)}
                  style={styles.formInput}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>층수</label>
                  <select
                    value={newZoneFloor}
                    onChange={e => setNewZoneFloor(e.target.value)}
                    style={styles.formSelect}
                  >
                    <option value="B1F">지하 1층 (B1F)</option>
                    <option value="1F">1층 (1F)</option>
                    <option value="2F">2층 (2F)</option>
                    <option value="3F">3층 (3F)</option>
                    <option value="4F">4층 (4F)</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>구역 유형</label>
                  <select
                    value={newZoneType}
                    onChange={e => setNewZoneType(e.target.value)}
                    style={styles.formSelect}
                  >
                    <option value="TOILET">화장실 (TOILET)</option>
                    <option value="SMOKING">흡연구역 (SMOKING)</option>
                  </select>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>도로명 주소</label>
                <input
                  type="text"
                  placeholder="예: 서울특별시 중구 세종대로 110"
                  value={newZoneAddress}
                  onChange={e => setNewZoneAddress(e.target.value)}
                  style={styles.formInput}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>설치 좌표 설정</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => openLocationPicker('zone')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      backgroundColor: '#059669',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <IconMapPin size={12} color="#ffffff" />
                    <span>지도 핀 / 주소 검색</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetCurrentGpsLocation('zone')}
                    disabled={isGpsLocating}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      backgroundColor: isGpsLocating ? '#94a3b8' : '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: isGpsLocating ? 'wait' : 'pointer'
                    }}
                  >
                    {isGpsLocating ? 'GPS 수신 중...' : '현재 GPS 위치'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>위도 (Latitude)</label>
                  <input
                    type="text"
                    value={newZoneLat}
                    onChange={e => setNewZoneLat(e.target.value)}
                    style={styles.formInput}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>경도 (Longitude)</label>
                  <input
                    type="text"
                    value={newZoneLng}
                    onChange={e => setNewZoneLng(e.target.value)}
                    style={styles.formInput}
                  />
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setIsAddZoneModalOpen(false)} style={styles.secondaryBtn}>취소</button>
              <button onClick={handleCreateZone} style={styles.primaryBtn}>구역 생성 완료</button>
            </div>
          </div>
        </div>
      )}

      {/* 1-2. 구역 수정 모달 (PATCH /api/dev/zones/{id}) */}
      {isEditZoneModalOpen && editingZone && (
        <div style={styles.modalOverlay} onClick={() => setIsEditZoneModalOpen(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>모니터링 구역(Zone) 정보 및 좌표 수정</h3>
              <button onClick={() => setIsEditZoneModalOpen(false)} style={styles.modalClose}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>구역 명칭 (Zone Name)</label>
                <input
                  type="text"
                  value={editingZone.name}
                  onChange={e => setEditingZone({ ...editingZone, name: e.target.value })}
                  style={styles.formInput}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>설치 주소 및 설명</label>
                <textarea
                  value={editingZone.address || ''}
                  maxLength={255} onChange={e => setEditingZone({ ...editingZone, address: e.target.value })}
                  style={{ ...styles.formInput, height: '60px', resize: 'none' }}
                />
              </div>
              <div style={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={styles.formLabel}>설치된 아두이노(ESP32) MAC 주소 (기기 ID)</label>
                  {discoveredDevices && discoveredDevices.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#b45309', fontWeight: '600' }}>
                      📡 감지된 새 기기 {discoveredDevices.length}대 있음
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="예: 24:DC:C3:99:AA:01 (ESP32 MAC 주소)"
                    value={editingZone.macAddress || ''}
                    onChange={e => setEditingZone({ ...editingZone, macAddress: e.target.value })}
                    style={{ ...styles.formInput, fontFamily: 'monospace', flex: 1 }}
                  />
                  {discoveredDevices && discoveredDevices.length > 0 && (
                    <select
                      style={{ ...styles.formSelect, width: 'auto', maxWidth: '210px', fontSize: '11px' }}
                      onChange={e => {
                        if (e.target.value) {
                          setEditingZone({ ...editingZone, macAddress: e.target.value });
                        }
                      }}
                      value=""
                    >
                      <option value="">-- 감지된 기기 선택 --</option>
                      {discoveredDevices.map(d => (
                        <option key={d.macAddress} value={d.macAddress}>
                          {d.macAddress} {d.latitude ? '📍' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', display: 'block' }}>
                  아두이노 보드를 교체했거나 새로 연결할 때 변경할 MAC 주소를 입력하세요.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                <label style={styles.formLabel}>설치 위치 좌표 설정</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => openLocationPicker('editZone')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      backgroundColor: '#059669',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <IconMapPin size={12} color="#ffffff" />
                    <span>지도 핀 / 주소 검색</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetCurrentGpsLocation('editZone')}
                    disabled={isGpsLocating}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      backgroundColor: isGpsLocating ? '#94a3b8' : '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: isGpsLocating ? 'wait' : 'pointer'
                    }}
                  >
                    {isGpsLocating ? 'GPS 수신 중...' : '현재 GPS 위치'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>위도 (Lat)</label>
                  <input
                    type="text"
                    value={editingZone.lat ?? editingZone.latitude ?? ''}
                    onChange={e => setEditingZone({ ...editingZone, lat: e.target.value, latitude: e.target.value })}
                    style={{ ...styles.formInput, fontFamily: 'monospace' }}
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>경도 (Lng)</label>
                  <input
                    type="text"
                    value={editingZone.lng ?? editingZone.longitude ?? ''}
                    onChange={e => setEditingZone({ ...editingZone, lng: e.target.value, longitude: e.target.value })}
                    style={{ ...styles.formInput, fontFamily: 'monospace' }}
                  />
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setIsEditZoneModalOpen(false)} style={styles.secondaryBtn}>취소</button>
              <button onClick={handleSaveEditZone} style={styles.primaryBtn}>구역 수정 저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 기기 세트 수정 모달 (PATCH /api/admin/device-sets/{id} 또는 신규 등록) */}
      {isEditDeviceSetModalOpen && editingDeviceSet && (
        <div style={styles.modalOverlay} onClick={() => setIsEditDeviceSetModalOpen(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
                  {editingDeviceSet.id ? '아두이노 설치 위치(구역) 및 ESP32 MAC 주소 변경' : '신규 아두이노 기기(ESP32) 매핑 등록'}
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  설치한 아두이노의 화장실 위치를 다른 구역으로 이동하거나, 보드 교체 시 새로운 ESP32 MAC 주소를 지정합니다.
                </span>
              </div>
              <button onClick={() => setIsEditDeviceSetModalOpen(false)} style={styles.modalClose}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>설치 화장실 / 관제 구역 (위치 변경)</label>
                <select
                  value={editingDeviceSet.zoneId}
                  onChange={e => setEditingDeviceSet({ ...editingDeviceSet, zoneId: e.target.value })}
                  style={styles.formSelect}
                >
                  {accessibleRestrooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.floor}) - 구역 #{r.id}</option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'block' }}>
                  다른 화장실로 기기를 이전 설치했을 때 이 목록에서 이동할 구역을 선택하세요.
                </span>
              </div>
              <div style={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={styles.formLabel}>ESP32 MAC 주소 (아두이노 기기 ID 변경)</label>
                  {discoveredDevices && discoveredDevices.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#b45309', fontWeight: '600' }}>
                      📡 감지된 새 기기 {discoveredDevices.length}대 있음
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="예: 24:DC:C3:99:AA:01"
                    value={editingDeviceSet.macAddress || ''}
                    onChange={e => setEditingDeviceSet({ ...editingDeviceSet, macAddress: e.target.value })}
                    style={{ ...styles.formInput, fontFamily: 'monospace', flex: 1 }}
                  />
                  {discoveredDevices && discoveredDevices.length > 0 && (
                    <select
                      style={{ ...styles.formSelect, width: 'auto', maxWidth: '210px', fontSize: '11px' }}
                      onChange={e => {
                        if (e.target.value) {
                          setEditingDeviceSet({ ...editingDeviceSet, macAddress: e.target.value });
                        }
                      }}
                      value=""
                    >
                      <option value="">-- 감지된 기기 선택 --</option>
                      {discoveredDevices.map(d => (
                        <option key={d.macAddress} value={d.macAddress}>
                          {d.macAddress} {d.latitude ? '📍' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', display: 'block' }}>
                  보드가 고장나 교체했거나 주소를 변경할 때 새 ESP32 MAC 주소를 입력하세요.
                </span>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>설치 라벨 명칭</label>
                <input
                  type="text"
                  placeholder="예: 1F 남자 화장실 메인 센서"
                  value={editingDeviceSet.label}
                  onChange={e => setEditingDeviceSet({ ...editingDeviceSet, label: e.target.value })}
                  style={styles.formInput}
                />
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setIsEditDeviceSetModalOpen(false)} style={styles.secondaryBtn}>취소</button>
              <button onClick={handleSaveEditDeviceSet} style={styles.primaryBtn}>
                {editingDeviceSet.id ? '위치 / MAC 주소 수정 저장' : '기기 매핑 등록 완료'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. 기기 세트 감사 히스토리 모달 (GET /api/admin/device-sets/{id}/history) */}
      {isHistoryModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsHistoryModalOpen(false)}>
          <div style={{ ...styles.modalContent, maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                  [{historyDeviceSetTitle}] 기기 변경 및 이전 감사 히스토리
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  기기의 설치 위치 및 라벨 변경 감사 추적 기록입니다.
                </span>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} style={styles.modalClose}>&times;</button>
            </div>
            <div style={{ ...styles.modalBody, maxHeight: '350px', overflowY: 'auto' }}>
              {deviceSetHistories.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: '12px' }}>
                  기록된 변경 이력이 없습니다.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ ...styles.table, minWidth: '500px' }}>
                    <thead>
                      <tr style={styles.thRow}>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>변경 시각</th>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>세트 코드</th>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>설치 라벨</th>
                        <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>배치 구역</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceSetHistories.map(h => (
                        <tr key={h.historyId} style={styles.tr}>
                          <td style={{ ...styles.td, fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {h.changedAt ? parseUtcDate(h.changedAt).toLocaleString('ko-KR') : '-'}
                          </td>
                          <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>{h.setCode}</td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{h.installationLabel}</td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{h.zoneName || `구역 #${h.zoneId}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setIsHistoryModalOpen(false)} style={styles.primaryBtn}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. 센서 단독 등록 모달 (POST /api/dev/sensors) */}
      {isAddSensorModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsAddSensorModalOpen(false)}>
          <div style={{ ...styles.modalContent, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>센서 단독 추가 등록 (POST /api/dev/sensors)</h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  지정 구역(Zone)에 독립 센서(온습도, 악취가스, 도어 마그네틱)를 단독 추가합니다.
                </span>
              </div>
              <button onClick={() => setIsAddSensorModalOpen(false)} style={styles.modalClose}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>설치 대상 구역 (Zone)</label>
                <select
                  value={newSensorData.zoneId}
                  onChange={e => setNewSensorData({ ...newSensorData, zoneId: e.target.value })}
                  style={styles.formSelect}
                >
                  <option value="">-- 설치 구역 선택 --</option>
                  {accessibleRestrooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.floor}) - 구역 #{r.id}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>센서 종류 (Sensor Type)</label>
                <select
                  value={newSensorData.sensorType}
                  onChange={e => setNewSensorData({ ...newSensorData, sensorType: e.target.value })}
                  style={styles.formSelect}
                >
                  {SENSOR_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setIsAddSensorModalOpen(false)} style={styles.secondaryBtn}>취소</button>
              <button onClick={handleCreateSensor} style={styles.primaryBtn}>센서 등록 완료</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 청소관리인 등록 및 구역 담당자 배정 모달 */}
      {isWorkerModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsWorkerModalOpen(false)}>
          <div
            style={{
              ...styles.modalContent,
              maxWidth: '1040px',
              width: '94vw',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconUsers size={16} color="#2563eb" /> 청소관리인 등록 및 구역별 담당자 배정 관리
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  신규 청소관리인을 등록·수정·삭제하고 각 화장실 구역의 전담 담당자를 즉시 배정합니다.
                </span>
              </div>
              <button onClick={() => setIsWorkerModalOpen(false)} style={styles.modalClose}>&times;</button>
            </div>
            <div style={{ ...styles.modalBody, overflowY: 'auto', padding: '16px' }}>
              {renderWorkerManagementSection()}
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setIsWorkerModalOpen(false)} style={styles.primaryBtn}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 6. 웹 지도 핀 찍기 및 주소 검색 위치 선택기 모달 (옵션 ③ - HTTP 완벽 지원) */}
      {isLocationPickerOpen && (
        <div
          style={{
            ...styles.modalOverlay,
            zIndex: 10000,
            backgroundColor: 'rgba(15, 23, 42, 0.65)'
          }}
          onClick={() => setIsLocationPickerOpen(false)}
        >
          <div
            style={{
              ...styles.modalContent,
              width: '92vw',
              maxWidth: '820px',
              height: '88vh',
              maxHeight: '740px',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconMapPin size={18} color="#059669" />
                  지도 핀 찍기 &amp; 주소 검색
                  <span style={{ fontSize: '11px', fontWeight: '600', backgroundColor: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                    HTTP 환경 지원
                  </span>
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  건물명이나 도로명을 검색하거나, 지도의 설치 위치를 직접 클릭하여 핀을 지정하세요.
                </div>
              </div>
              <button
                onClick={() => setIsLocationPickerOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {/* 검색창 바 */}
            <div
              style={{
                padding: '12px 20px',
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #e2e8f0'
              }}
            >
              <form
                onSubmit={handlePickerSearch}
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    value={pickerSearchKeyword}
                    onChange={e => setPickerSearchKeyword(e.target.value)}
                    placeholder="건물명, 시설명 또는 도로명 주소 검색 (예: 종로구청, 서울역 화장실)"
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      backgroundColor: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94a3b8' }}>
                    🔍
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isSearchingPlaces}
                  style={{
                    padding: '9px 18px',
                    backgroundColor: isSearchingPlaces ? '#94a3b8' : '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: isSearchingPlaces ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {isSearchingPlaces ? '검색 중...' : '검색'}
                </button>
              </form>

              {/* 검색 결과 칩 리스트 */}
              {pickerSearchResults.length > 0 && (
                <div
                  style={{
                    marginTop: '10px',
                    display: 'flex',
                    gap: '6px',
                    overflowX: 'auto',
                    paddingBottom: '4px'
                  }}
                >
                  {pickerSearchResults.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSearchResult(item)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '16px',
                        fontSize: '11px',
                        color: '#334155',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#2563eb'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#334155'; }}
                    >
                      <span>📍</span>
                      <strong style={{ fontWeight: '600' }}>{item.name}</strong>
                      <span style={{ color: '#94a3b8', fontSize: '10px' }}>({item.address || '주소 정보'})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 지도 본문 */}
            <div style={{ flex: 1, position: 'relative', minHeight: '280px' }}>
              <Map
                center={pickerMapCenter}
                style={{ width: '100%', height: '100%' }}
                level={3}
                onClick={(_map, mouseEvent) => {
                  if (!mouseEvent || !mouseEvent.latLng) return;
                  const lat = mouseEvent.latLng.getLat();
                  const lng = mouseEvent.latLng.getLng();
                  setPickerLat(lat);
                  setPickerLng(lng);
                  reverseGeocode(lat, lng);
                }}
              >
                <MapMarker
                  position={{ lat: pickerLat, lng: pickerLng }}
                  draggable={true}
                  onDragEnd={(marker) => {
                    const lat = marker.getPosition().getLat();
                    const lng = marker.getPosition().getLng();
                    setPickerLat(lat);
                    setPickerLng(lng);
                    reverseGeocode(lat, lng);
                  }}
                />
                <CustomOverlayMap
                  position={{ lat: pickerLat, lng: pickerLng }}
                  yAnchor={2.3}
                >
                  <div
                    style={{
                      backgroundColor: '#1e293b',
                      color: '#ffffff',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      border: '1px solid #334155'
                    }}
                  >
                    📍 선택된 센서 설치 위치
                  </div>
                </CustomOverlayMap>
              </Map>

              {/* 지도 안내 툴팁 */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  zIndex: 2,
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '500',
                  color: '#475569',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid #e2e8f0',
                  pointerEvents: 'none'
                }}
              >
                💡 지도를 클릭하거나 핀을 드래그하여 정확한 설치 지점을 맞춰주세요.
              </div>
            </div>

            {/* 하단 선택 정보 및 확정 바 */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>선택 좌표:</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                    {Number(pickerLat).toFixed(6)}, {Number(pickerLng).toFixed(6)}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: '600', color: '#64748b' }}>주소: </span>
                  {pickerAddress || '지도를 클릭하여 주소를 확인하세요'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsLocationPickerOpen(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLocationPicker}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: '#059669',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#ffffff',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>✓</span> 이 위치로 좌표 확정
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
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#0f172a',
    whiteSpace: 'nowrap'
  },
  toolbarActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
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
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
  },
  filterGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
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
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
    gap: '8px',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '10px'
  },
  tickerCard: {
    padding: '10px 12px',
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
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
    gap: '8px',
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
    flexWrap: 'wrap',
    gap: '8px',
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
    width: 'min(420px, 92vw)',
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
    flexWrap: 'wrap',
    gap: '8px',
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
