import React from 'react';

export default function SensorDataStatus({ loading = false, intervalSeconds = 30 }) {
  return (
    <div className="sensor-data-source" aria-label="센서 데이터 조회 경로">
      <strong>MySQL DB 조회</strong>
      <span role="status">{loading ? 'DB 데이터 확인 중…' : `${intervalSeconds}초마다 DB 갱신`}</span>
    </div>
  );
}
