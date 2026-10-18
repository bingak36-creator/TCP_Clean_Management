const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const getCurrentUserId = () => {
  try {
    const raw = localStorage.getItem('tcp_auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Number.isFinite(Number(parsed.id))) {
        return Number(parsed.id);
      }
    }
  } catch {
    // ignore
  }
  return 1;
};

export const getKstDateString = (date = new Date()) => {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }
};

/**
 * 백엔드(Docker/Spring Boot)에서 전송된 UTC 타임스탬프를 브라우저 로컬 시간(KST)으로 정확히 파싱합니다.
 * 타임존 표기(Z)가 누락되어 9시간 시차가 발생하는 문제를 방지합니다.
 */
export const parseUtcDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') return new Date(val);
  const str = String(val).trim();
  if (!str) return null;
  try {
    let d;
    if (str.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(str)) {
      d = new Date(str);
    } else {
      const isoStr = str.includes(' ') ? str.replace(' ', 'T') : str;
      d = new Date(`${isoStr}Z`);
    }
    return isNaN(d.getTime()) ? new Date(str) : d;
  } catch {
    return new Date(str);
  }
};

export const getAuthHeaders = () => {
  const token = localStorage.getItem('tcp_auth_token') || localStorage.getItem('token') || 'admin-token';
  const bearer = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return {
    'Content-Type': 'application/json',
    'Authorization': bearer,
    'ngrok-skip-browser-warning': 'true'
  };
};

// 두 좌표 간 거리 계산 함수 (미터 단위)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// 백엔드는 상태 코드를 주고, 지도는 한글 라벨을 표시한다.
const PUBLIC_STATUS_LABELS = {
  NORMAL: '쾌적',
  WARN: '혼잡',
  DANGER: '경고',
  INACTIVE: '운영 중지',
  NO_DATA: '측정 없음',
  STALE: '측정 지연',
  UNKNOWN: '확인 필요'
};

/**
 * 백엔드 서버(Spring Boot / ngrok)로부터 실제 IoT 구역 목록 및 최신 센서 데이터를 가져옵니다.
 */
export const fetchBackendZones = async (category, userLat = null, userLon = null) => {
  try {
    const zoneType = category === 'all' ? '' : category === 'restroom' ? 'TOILET' : 'SMOKING';
    const response = await fetch(`${BASE_URL}/api/public/zones${zoneType ? `?type=${zoneType}` : ''}`, {
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    });

    if (!response.ok) {
      throw new Error(`백엔드 통신 오류: HTTP ${response.status}`);
    }

    const data = await response.json();

    return data.filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).map((item) => {
      const distance = userLat && userLon ? getDistanceInMeters(userLat, userLon, item.latitude, item.longitude) : null;
      return {
        id: `iot-${item.zoneId}`,
        name: `[IoT] ${item.name}`,
        lat: item.latitude,
        lon: item.longitude,
        address: item.address || item.name,
        distance: distance,
        type: category,
        temp: item.temp,
        humidity: item.humidity,
        gas: item.gasLevel != null ? `${item.gasLevel} ADC` : '측정 없음',
        mq7: item.mq7Level != null ? `${item.mq7Level} ADC` : null,
        airQuality: '보정 전 센서값',
        status: PUBLIC_STATUS_LABELS[item.status] || item.status || '측정 없음',
        color: item.color || (category === 'restroom' ? '#10b981' : '#3b82f6'),
        isOurSolution: item.isOurSolution ?? true
      };
    });
  } catch (error) {
    console.warn('[backendApi] 백엔드 데이터를 가져오지 못했습니다. 카카오맵 기본 검색 결과를 사용합니다:', error);
    return [];
  }
};

/**
 * 백엔드 MySQL DB에 등록된 전체 관제 구역(Zone) 목록을 조회합니다.
 */
export const fetchAllPublicZones = async (signal) => {
  const response = await fetch(`${BASE_URL}/api/public/zones`, {
    signal,
    headers: {
      'ngrok-skip-browser-warning': 'true'
    }
  });

  if (!response.ok) {
    throw new Error(`구역 목록 조회 실패 (HTTP ${response.status})`);
  }

  return response.json();
};

/**
 * 백엔드 MySQL DB에 신규 화장실/관제구역을 등록합니다. (F05, F06)
 */
export const createBackendZone = async (zoneData) => {
  const rawLat = zoneData.latitude ?? zoneData.lat;
  const rawLng = zoneData.longitude ?? zoneData.lng;
  const parsedLat = rawLat !== undefined && rawLat !== null && rawLat !== '' ? Number(rawLat) : NaN;
  const parsedLng = rawLng !== undefined && rawLng !== null && rawLng !== '' ? Number(rawLng) : NaN;

  const payload = {
    name: zoneData.name,
    address: zoneData.address || `${zoneData.floor || '1F'} ${zoneData.gender || '공용'} 화장실`,
    latitude: Number.isFinite(parsedLat) ? parsedLat : 37.566826,
    longitude: Number.isFinite(parsedLng) ? parsedLng : 126.978656,
    zoneType: zoneData.zoneType || 'TOILET',
    isOurSolution: true,
    pleasantThreshold: zoneData.pleasantThreshold ?? 300.0,
    needsVentilationThreshold: zoneData.needsVentilationThreshold ?? 600.0,
    assignedWorkerId: zoneData.assignedWorkerId ?? null,
    assignedWorkerName: zoneData.assignedWorkerName ?? null
  };

  const response = await fetch(`${BASE_URL}/api/dev/zones`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`구역 등록 실패 (HTTP ${response.status}): ${errorText}`);
  }

  const zoneId = await response.json();

  // 기기 ID (MAC 주소 등)가 있으면 Device Set 등록도 시도하고 실패 시 명시적 경고 발생 (F06)
  if (zoneData.deviceId && zoneData.deviceId.trim()) {
    const rawMac = zoneData.deviceId.trim();
    const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (macPattern.test(rawMac)) {
      const formattedMac = rawMac.toUpperCase().replace(/-/g, ':');
      const dsRes = await fetch(`${BASE_URL}/api/admin/device-sets`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          setCode: `SET-${zoneId}`,
          macAddress: formattedMac,
          zoneId: zoneId,
          installationLabel: zoneData.name
        })
      });
      if (!dsRes.ok) {
        const dsErrText = await dsRes.text().catch(() => '');
        console.warn(`[backendApi] 기기 세트 등록 실패 (${dsRes.status}):`, dsErrText);
        if (zoneData.strictDeviceSet) {
          throw new Error(`구역(#${zoneId})은 생성되었으나 기기 세트(MAC: ${formattedMac}) 등록에 실패했습니다 (${dsRes.status}): ${dsErrText}`);
        }
      }
    }
  }

  return zoneId;
};

/**
 * 백엔드 MySQL DB에서 구역을 삭제합니다. (F03)
 */
export const deleteBackendZone = async (zoneId) => {
  const response = await fetch(`${BASE_URL}/api/dev/zones/${zoneId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  if (!response.ok && response.status !== 404) {
    const errText = await response.text().catch(() => '');
    throw new Error(`구역 삭제 실패 (HTTP ${response.status})${errText ? `: ${errText}` : ''}`);
  }

  return true;
};

// 청소 작업 이력 로컬 영구 저장소 키
const STORAGE_KEY_CLEANING_LOGS = 'tcp_clean_logs_v1';

export const loadStoredCleaningLogs = (fallbackLogs = []) => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CLEANING_LOGS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('[backendApi] 청소 이력 로드 실패:', e);
  }
  return fallbackLogs;
};

export const persistCleaningLog = (newLog, currentLogs = []) => {
  try {
    const updated = [newLog, ...currentLogs.filter(l => l.id !== newLog.id)];
    localStorage.setItem(STORAGE_KEY_CLEANING_LOGS, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('[backendApi] 청소 이력 저장 실패:', e);
    return [newLog, ...currentLogs];
  }
};

/**
 * 화장실 구역 활성화/비활성화 토글
 */
export const toggleZoneActiveApi = async (zoneId) => {
  const response = await fetch(`${BASE_URL}/api/dev/zones/${zoneId}/toggle-active`, {
    method: 'PATCH',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error(`상태 변경 실패 (${response.status})`);
  return response.json();
};

/**
 * 구역 정보/임계값 업데이트 (PUT /api/dev/zones/{zoneId}) (F02, F10)
 */
export const updateZoneThresholdsApi = async (zoneId, thresholds) => {
  const response = await fetch(`${BASE_URL}/api/dev/zones/${zoneId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(thresholds)
  });
  if (!response.ok) throw new Error(`구역 정보 저장 실패 (${response.status})`);
  return response.json();
};

export const updateBackendZoneApi = updateZoneThresholdsApi;

/**
 * 구역별 청소 담당자(Worker) 지정/해제 API (PATCH /api/admin/zones/{id}/worker)
 */
export const assignZoneWorkerApi = async (zoneId, workerId = null, workerName = null) => {
  const response = await fetch(`${BASE_URL}/api/admin/zones/${zoneId}/worker`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ workerId, workerName })
  });
  if (!response.ok) throw new Error(`구역 담당자 지정 실패 (${response.status})`);
  return response.json();
};

/**
 * 백엔드 MySQL DB에 센서 단독 등록/조회/수정/삭제 (/api/dev/sensors)
 */
export const createBackendSensor = async (sensorData) => {
  const response = await fetch(`${BASE_URL}/api/dev/sensors`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(sensorData)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`센서 등록 실패 (HTTP ${response.status}): ${errorText}`);
  }
  return response.json();
};

export const fetchSensorsApi = async (zoneId = null) => {
  try {
    const url = `${BASE_URL}/api/dev/sensors${zoneId ? `?zoneId=${zoneId}` : ''}`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
};

export const updateBackendSensorApi = async (sensorId, sensorData) => {
  const response = await fetch(`${BASE_URL}/api/dev/sensors/${sensorId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(sensorData)
  });
  if (!response.ok) throw new Error(`센서 수정 실패 (${response.status})`);
  return response.json();
};

export const deleteBackendSensorApi = async (sensorId) => {
  const response = await fetch(`${BASE_URL}/api/dev/sensors/${sensorId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error(`센서 삭제 실패 (${response.status})`);
  return true;
};

/**
 * 알림 목록 조회 (status: 'UNRESOLVED' | 'RESOLVED' | 'ALL') (F19)
 */
export const fetchAdminAlertsApi = async (status = 'UNRESOLVED') => {
  try {
    const response = await fetch(`${BASE_URL}/api/admin/alerts?status=${encodeURIComponent(status)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    return [];
  }
};

export const fetchActionLogsApi = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/admin/alerts/action-logs`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
};

/**
 * 알림 단건 해결 액션 기록 (F18)
 */
export const resolveAlertApi = async (alertId, actionDetail = '현장 조치 및 점검 완료', adminId = null) => {
  const effectiveAdminId = adminId ?? getCurrentUserId();
  const response = await fetch(`${BASE_URL}/api/admin/alerts/${alertId}/actions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ actionDetail, adminId: effectiveAdminId })
  });
  if (!response.ok) throw new Error(`알림 처리 실패 (${response.status})`);
  return true;
};

/**
 * 알림 일괄 해결 액션 (zoneIds / alertIds 스코프 지원) (F08, F18)
 */
export const resolveAllAlertsApi = async (
  actionDetail = '관리자 일괄 확인 처리',
  adminId = null,
  options = {}
) => {
  const effectiveAdminId = adminId ?? getCurrentUserId();
  const payload = {
    actionDetail,
    adminId: effectiveAdminId,
    ...(Array.isArray(options.zoneIds) && options.zoneIds.length > 0 ? { zoneIds: options.zoneIds } : {}),
    ...(Array.isArray(options.alertIds) && options.alertIds.length > 0 ? { alertIds: options.alertIds } : {})
  };
  const response = await fetch(`${BASE_URL}/api/admin/alerts/batch-actions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`일괄 처리 실패 (${response.status})`);
  return true;
};

/**
 * 청소 이력 DB 조회
 */
export const fetchCleaningRecordsApi = async (zoneId = null) => {
  try {
    const url = `${BASE_URL}/api/admin/cleaning-records${zoneId ? `?zoneId=${zoneId}` : ''}`;
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    return [];
  }
};

/**
 * 청소 이력 DB 저장 (F16)
 */
export const createCleaningRecordApi = async (record) => {
  const { id, ...cleanPayload } = record || {};
  const response = await fetch(`${BASE_URL}/api/admin/cleaning-records`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(cleanPayload)
  });
  if (!response.ok) throw new Error(`청소 기록 저장 실패 (${response.status})`);
  return response.json();
};

/**
 * 관리자용 기기 세트 상세 목록 조회
 */
export const fetchDeviceSetsApi = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/admin/device-sets`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    return [];
  }
};

/**
 * 기기 세트 이전/수정 히스토리 조회
 */
export const fetchDeviceSetHistoryApi = async (deviceSetId) => {
  try {
    const response = await fetch(`${BASE_URL}/api/admin/device-sets/${deviceSetId}/history`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    return [];
  }
};

/**
 * Upstash 클라우드 동기화 상태 모니터링 조회
 */
export const fetchUpstashStatusApi = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/iot/upstash/status`, {
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    });
    if (!response.ok) return null;
    return response.json();
  } catch (e) {
    return null;
  }
};

/**
 * 백엔드 JWT/세션 로그인 API
 */
export const loginApi = async (username, password) => {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || '로그인 실패');
  }
  return response.json();
};

/**
 * 기기 세트 신규 등록 API (POST /api/admin/device-sets)
 */
export const createDeviceSetApi = async (deviceSetData) => {
  const response = await fetch(`${BASE_URL}/api/admin/device-sets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(deviceSetData)
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `기기 등록 실패 (${response.status})`);
  }
  return response.json();
};

/**
 * 기기 세트 수정 API (PATCH)
 */
export const updateDeviceSetApi = async (deviceSetId, updateData) => {
  const response = await fetch(`${BASE_URL}/api/admin/device-sets/${deviceSetId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(updateData)
  });
  if (!response.ok) throw new Error(`기기 정보 수정 실패 (${response.status})`);
  return response.json();
};

/**
 * 기기 세트 삭제 API (DELETE) (F04)
 */
export const deleteDeviceSetApi = async (deviceSetId) => {
  const response = await fetch(`${BASE_URL}/api/admin/device-sets/${deviceSetId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error(`기기 삭제 실패 (${response.status})`);
  return true;
};

/**
 * 미화원 목록 조회 API (통신 오류 시 null 반환하여 시드 중복 생성 방지) (F15)
 */
export const fetchWorkersApi = async (status = null) => {
  try {
    const url = `${BASE_URL}/api/admin/workers${status ? `?status=${status}` : ''}`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) return null;
    return response.json();
  } catch (e) {
    return null;
  }
};

/**
 * 미화원 신규 등록 API
 */
export const createWorkerApi = async (workerData) => {
  const response = await fetch(`${BASE_URL}/api/admin/workers`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(workerData)
  });
  if (!response.ok) throw new Error(`미화원 등록 실패 (${response.status})`);
  return response.json();
};

/**
 * 미화원 정보 및 담당구역 수정 API (PUT /api/admin/workers/{id})
 */
export const updateWorkerApi = async (workerId, workerData) => {
  const response = await fetch(`${BASE_URL}/api/admin/workers/${workerId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(workerData)
  });
  if (!response.ok) throw new Error(`청소관리인 정보 수정 실패 (${response.status})`);
  return response.json();
};

/**
 * 미화원 상태 변경 API (AVAILABLE, DISPATCHED, OFF_DUTY)
 */
export const updateWorkerStatusApi = async (workerId, status) => {
  const response = await fetch(`${BASE_URL}/api/admin/workers/${workerId}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error(`미화원 상태 변경 실패 (${response.status})`);
  return response.json();
};

/**
 * 미화원 삭제 API
 */
export const deleteWorkerApi = async (workerId) => {
  const response = await fetch(`${BASE_URL}/api/admin/workers/${workerId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error(`미화원 삭제 실패 (${response.status})`);
  return true;
};

/**
 * 중앙 시스템 운영 설정 조회 API
 */
export const fetchSystemSettingsApi = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return response.json();
  } catch (e) {
    return null;
  }
};

/**
 * 중앙 시스템 운영 설정 갱신 API (F11, F18)
 */
export const updateSystemSettingsApi = async (settingsMap, adminId = null) => {
  const effectiveAdminId = adminId ?? getCurrentUserId();
  const response = await fetch(`${BASE_URL}/api/admin/settings?adminId=${effectiveAdminId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(settingsMap)
  });
  if (!response.ok) throw new Error(`설정 저장 실패 (${response.status})`);
  return response.json();
};

/**
 * 일일 청소 체크리스트 조회 API (F09, F17)
 */
export const fetchDailyChecklistApi = async (zoneId, date = '') => {
  try {
    const targetDate = date || getKstDateString();
    const url = `${BASE_URL}/api/admin/checklists?zoneId=${zoneId}&date=${encodeURIComponent(targetDate)}`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    return [];
  }
};

/**
 * 일일 청소 체크리스트 토글 API (F09, F17, F18)
 */
export const toggleDailyChecklistApi = async (payload) => {
  const body = {
    ...payload,
    date: payload?.date || getKstDateString(),
    completedBy: payload?.completedBy ?? getCurrentUserId()
  };
  const response = await fetch(`${BASE_URL}/api/admin/checklists/toggle`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`체크리스트 저장 실패 (${response.status})`);
  return response.json();
};

/**
 * 일일 청소 체크리스트 일괄 저장 API (POST /api/admin/checklists/batch) (F09)
 */
export const batchUpdateDailyChecklistApi = async ({ zoneId, date = '', completedBy = null, items = {} }) => {
  const response = await fetch(`${BASE_URL}/api/admin/checklists/batch`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      zoneId,
      date: date || getKstDateString(),
      completedBy: completedBy ?? getCurrentUserId(),
      items
    })
  });
  if (!response.ok) throw new Error(`체크리스트 일괄 저장 실패 (${response.status})`);
  return response.json();
};

/**
 * 계정(Users) 및 구역 권한(ZonePermissions) 관리 API (F07, F18)
 */
export const fetchUsersApi = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
};

export const createUserApi = async (userData) => {
  const response = await fetch(`${BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(userData)
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`계정 생성 실패 (${response.status}): ${err}`);
  }
  return response.json();
};

export const updateUserApi = async (userId, userData) => {
  const response = await fetch(`${BASE_URL}/api/admin/users/${userId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error(`계정 수정 실패 (${response.status})`);
  return response.json();
};

export const deleteUserApi = async (userId) => {
  const response = await fetch(`${BASE_URL}/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error(`계정 삭제 실패 (${response.status})`);
  return true;
};

/**
 * 감지된 미등록 기기 목록 조회 (관리자 전용)
 */
export const fetchDiscoveredDevicesApi = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/admin/discovered-devices`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
};

/**
 * 감지된 미등록 기기 항목 무시/삭제 (관리자 전용)
 */
export const dismissDiscoveredDeviceApi = async (mac) => {
  const response = await fetch(`${BASE_URL}/api/admin/discovered-devices/${encodeURIComponent(mac)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error(`기기 항목 삭제 실패 (${response.status})`);
  return true;
};




