import { parseUtcDate } from './time.js';
export const buildRestroomsFromBackend = (zones, devices = [], workersList = [], cleaningRecords = []) => {
  if (!zones || zones.length === 0) return [];

  return zones.map((z) => {
    const dev = (devices || []).find(d => d.zoneId != null && Number(d.zoneId) === Number(z.zoneId));
    const floorMatch = (z.name || '').match(/(?:^|[^A-Z0-9])(B?[1-9]\d{0,2}F|RF)(?![A-Z0-9])/i);
    const koreanFloor = (z.name || '').match(/(지하\s*)?([1-9]\d{0,2})층/);
    const floor = z.floor || (floorMatch ? floorMatch[1].toUpperCase() : koreanFloor ? `${koreanFloor[1] ? 'B' : ''}${koreanFloor[2]}F` : '미등록');
    const gender=z.gender||(/여(?:성용|자|성)?\s*화장실/.test(z.name||'')?'여':/남(?:성용|자|성)?\s*화장실/.test(z.name||'')?'남':/공용\s*화장실/.test(z.name||'')?'공용':'미등록');

    const matchedWorker = (workersList || []).find(w =>
      (z.assignedWorkerId != null && Number(w.id) === Number(z.assignedWorkerId)) ||
      (w.assignedZoneId != null && Number(w.assignedZoneId) === Number(z.zoneId))
    );
    const assignedWorkerId = z.assignedWorkerId ?? matchedWorker?.id ?? null;
    const assignedWorkerName = z.assignedWorkerName || matchedWorker?.name || '담당자 미지정';

    const matchedCleanRecord = (cleaningRecords || []).find(rec =>
      rec.zoneId != null && Number(rec.zoneId) === Number(z.zoneId)
    );
    const cleanedTimestamp = z.lastCleanedAt || matchedCleanRecord?.createdAt || null;

    let computedLastCleanedHours = null;
    if (cleanedTimestamp) {
      const parsed = parseUtcDate(cleanedTimestamp);
      const diffHours = parsed ? (Date.now() - parsed.getTime()) / 3600000 : NaN;
      if (Number.isFinite(diffHours) && diffHours >= 0) {
        computedLastCleanedHours = Number(diffHours.toFixed(1));
      }
    }

    return {
      id: z.zoneId,
      name: z.name,
      floor: floor,
      gender: gender,
      address: z.address || '',
      zoneType: z.zoneType || 'TOILET',
      pleasantThreshold: z.pleasantThreshold ?? null,
      needsVentilationThreshold: z.needsVentilationThreshold ?? null,
      deviceId: dev?.macAddress || `ZONE-${z.zoneId}`,
      macAddress: dev?.macAddress || null,
      temp: dev?.temperatureC ?? z.temp ?? null,
      humidity: dev?.humidityPercent ?? z.humidity ?? null,
      gas: dev?.mq135Adc ?? z.gasLevel ?? null,
      mq7: dev?.mq7Adc ?? z.mq7Level ?? null,
      status: z.status || 'UNKNOWN',
      stale: Boolean(z.stale || dev?.stale),
      measuredAt: z.measuredAt || dev?.measuredAt || null,
      isActive: z.isActive !== undefined ? z.isActive : true,
      isLive: z.isOurSolution ?? true,
      isFromDb: true,
      ingestSource: dev?.ingestSource || 'mysql',
      lastUpdated: parseUtcDate(z.measuredAt || dev?.measuredAt)?.toLocaleTimeString('ko-KR') || '측정 없음',
      lastCleanedHours: computedLastCleanedHours,
      assignedWorkerId,
      cleanWorker: assignedWorkerName,
      lat: z.latitude ?? null,
      lng: z.longitude ?? null
    };
  });
};


export const filterZoneRecords=(records,canAccessZone)=>records.filter(row=>row.zoneId!=null&&canAccessZone(Number(row.zoneId)));
