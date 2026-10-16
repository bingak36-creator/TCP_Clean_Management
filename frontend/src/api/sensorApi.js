const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function getJson(path, signal) {
  const response = await fetch(`${API_BASE}${path}`, {
    signal,
    headers: {
      'ngrok-skip-browser-warning': 'true'
    }
  });
  if (!response.ok) throw new Error(`센서 데이터 조회 실패 (HTTP ${response.status})`);
  return response.json();
}

export function fetchSensorDevices(signal) {
  return getJson('/api/iot/devices', signal);
}

export function fetchSensorHistory(mac, hours = 1, signal) {
  return getJson(`/api/iot/devices/${encodeURIComponent(mac)}/history?hours=${hours}&limit=1000`, signal);
}

export function snapshotToRestroom(device, index = 0) {
  const rawName = (device.name || '').trim();
  const isDefaultEspName = !rawName || rawName.toUpperCase().startsWith('ESP32');
  const displayName = isDefaultEspName
    ? (index === 0 ? '1층 제1화장실 (ESP32 실측)' : `제${index + 1}화장실 (${rawName})`)
    : rawName;

  return {
    id: device.zoneId || index + 1,
    name: displayName,
    floor: device.floor || '1F',
    gender: device.gender || '공용',
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
    lastCleanedHours: 1.5,
    cleanWorker: '이순신',
    lat: device.latitude ?? 37.5668,
    lng: device.longitude ?? 126.9785
  };
}

export const formatReading = (value) => value == null ? '—' : Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
