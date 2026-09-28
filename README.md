# TCP_Clean_Management

## 데이터베이스 설계

- [ERD v2 개선 제안과 코드 검토 근거](docs/erd/README.md)
- [확대·축소 가능한 ERD 및 테이블 상세](docs/erd/index.html)
- [MySQL 목표 스키마](docs/erd/schema.sql)
- [MySQL 제약 검증 결과](docs/erd/validation.md)

ERD v2 중 **측정 항목 모델**은 백엔드에 적용했습니다. 계정, 알림, 조치, 푸시 등 나머지 테이블은 아직 설계 제안입니다.

## 센서 데이터 수집

`POST /api/iot/sensors/{sensorId}/data`는 더 이상 `value1/value2`를 받지 않습니다. 하나의 패킷에 측정 항목별 값을 보냅니다.

```json
{
  "sampleKey": "device-42:20260928T003000Z",
  "measuredAt": "2026-09-28T09:30:00+09:00",
  "readings": [
    { "metricCode": "TEMPERATURE", "measuredValue": 22.5 },
    { "metricCode": "HUMIDITY", "measuredValue": 61.2 }
  ]
}
```

`sampleKey`는 재전송해도 동일하게 유지되는 패킷 키이며, 센서의 측정 항목마다 고유해야 합니다. `measuredAt`을 생략하면 서버 수신 시각을 UTC로 기록합니다. `TEMP_HUMID`는 `TEMPERATURE`/`HUMIDITY`, `GAS`는 `GAS`, `MAG`는 `CONTACT` 값을 받습니다. 같은 키로 다른 값을 보내면 HTTP 409가 반환됩니다. 측정 항목과 단위는 첫 수신 시 자동 등록됩니다. GAS는 단위가 `UNVERIFIED`로 등록되므로 하드웨어 단위와 보정을 확인하고 두 임계치를 설정하기 전에는 가스 이상 감지를 수행하지 않습니다. MAG의 0/1이 어느 상태를 뜻하는지도 장치 계약에서 확인해야 합니다.

## 기존 DB 이전

운영 DB는 먼저 백업하고 애플리케이션을 중지해야 합니다. [측정값 이전 SQL](backend/db/migrate_metric_readings.sql)의 `@legacy_offset`을 기존 Java 프로세스가 사용한 시간대에 맞춘 후 **한 번만** 실행하고 새 백엔드를 시작합니다. 예전 테이블은 `_legacy` 이름으로 남습니다. 온도·습도·가스의 유효한 원본 행을 새 구조로 옮기고 시간·일 집계를 다시 계산합니다. 의미가 확인되지 않은 MAG 원본과 과거 집계는 레거시 테이블에서 보존합니다. 기존 가스 임계치는 단위가 확인될 때까지 자동으로 복사하지 않습니다.

```sh
mysql -u tcp_user -p tcp_clean_db < backend/db/migrate_metric_readings.sql
```

이 SQL은 기존 v1 DB용입니다. 빈 DB에서는 백엔드의 JPA 설정이 새 측정 테이블을 생성합니다. 현재 `ddl-auto: update`는 개발 환경용 설정이므로 운영 배포에서는 검증된 스키마 마이그레이션과 `validate`로 전환해야 합니다.
