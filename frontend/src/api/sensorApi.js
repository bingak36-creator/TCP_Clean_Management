const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function getJson(path, signal) {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  if (!response.ok) throw new Error(`센서 데이터 조회 실패 (HTTP ${response.status})`);
  return response.json();
}

export function fetchSensorDevices(signal) {
  return getJson('/api/iot/devices', signal);
}

export function fetchSensorHistory(mac, hours = 1, signal) {
  return getJson(`/api/iot/devices/${encodeURIComponent(mac)}/history?hours=${hours}&limit=1000`, signal);
}

export function snapshotToRestroom(device) {
  return {
    id: device.zoneId,
    name: device.name,
    floor: '설치 정보 미등록',
    gender: '공용',
    deviceId: device.macAddress,
    macAddress: device.macAddress,
    temp: device.temperatureC,
    humidity: device.humidityPercent,
    gas: device.mq135Adc,
    status: device.stale ? 'OFFLINE' : 'RECEIVING',
    isActive: !device.stale,
    isLive: true,
    source: device.source,
    ingestSource: device.ingestSource,
    measuredAt: device.measuredAt,
    lastUpdated: device.measuredAt ? new Date(device.measuredAt).toLocaleTimeString('ko-KR') : '측정 없음',
    lastCleanedHours: null,
    cleanWorker: '미등록',
    lat: device.latitude,
    lng: device.longitude
  };
}

export const formatReading = (value) => value == null ? '—' : Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
