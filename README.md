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

원본의 2026-10-12 변경을 동기화해 React 프론트엔드, 공개 구역의 실제 센서 값 조회, ESP32 WiFiManager 기능을 포함합니다. 기존 `POST /api/iot/{sensorId}/data` 경로도 유지하며, ESP32의 선택 필드 `macAddress`와 측정 항목 배열을 받습니다. 공개 구역 API는 각 구역의 가스·온도·습도 최신 값을 별도로 조회합니다.

`GET /api/iot/device-sets/by-mac/{mac}`는 Upstash에서 자동 등록된 장치의 실제 센서 ID를 반환합니다. 등록되지 않은 MAC은 기존 단일 시연용 장치 세트로 연결하며, 활성 센서를 ID 순서로 조회해 첫 `TEMP_HUMID`를 `DHT11`, 첫 두 `GAS`를 `MQ135`·`MQ7`에 연결합니다.

## Upstash → MySQL 자동 저장

MySQL 연결 설정이 준비되어 있으면 인증 정보를 포함한 Upstash Redis 연결 URL 하나를 설정해 자동 저장을 시작할 수 있습니다. URL 형식은 `rediss://default:<password>@<endpoint>.upstash.io:6379`입니다. HTTPS REST 연결은 `https://default:<REST-token>@<endpoint>.upstash.io` 형식의 인증 URL 또는 `UPSTASH_REDIS_REST_URL`·`UPSTASH_REDIS_REST_TOKEN` 환경 변수 두 개로 설정할 수 있습니다. URL 안의 비밀번호나 토큰에 특수 문자가 있으면 URL 인코딩해야 합니다. HTTPS REST 주소만으로는 인증할 수 없습니다.

```sh
cd backend
python3 scripts/configure-upstash.py
./gradlew bootJar
python3 scripts/run-local.py --config "$HOME/Library/Application Support/Codex/tcp-clean-management/runtime.json"
```

설정 프로그램은 URL을 화면에 표시하지 않고 로컬 비공개 파일에 저장합니다. 다른 환경에서는 `UPSTASH_REDIS_URL` 환경 변수로도 연결할 수 있습니다. MySQL은 기존 Spring 데이터소스 설정을 사용하며, 새 환경에서는 `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`를 함께 설정합니다.

백엔드가 시작되면 `esp32:<MAC>:history` 정렬 집합을 찾아 남아 있는 측정 이력을 페이지 단위로 저장합니다. 이후 기본 2분 간격으로 새 데이터를 가져오고, 5분 간격으로 새 장치를 찾습니다. `UPSTASH_POLL_INTERVAL_MS`와 `UPSTASH_DISCOVERY_INTERVAL_MS`로 간격을 변경할 수 있습니다. 현재 ESP32 펌웨어의 이력 보존은 최대 1,000개이며 마지막 전송 후 24시간입니다. Upstash에서 이미 제거된 데이터는 복구할 수 없습니다.

- `upstash_devices`: MAC별 구역·센서 자동 등록 및 마지막 저장 위치
- `upstash_imported_samples`: 원본 JSON, 측정 시각, MySQL 저장 시각. 동일 MAC·샘플 키는 한 번만 보관합니다.
- `sensor_data_raw`: 온도·습도·MQ-135 값을 기존 측정 항목 모델로 저장합니다. DHT 측정 실패 시 누락 값을 만들지 않고 가스 값만 저장합니다.

원본 JSON·측정값·저장 위치를 한 트랜잭션으로 기록합니다. 실패한 패킷은 저장 위치를 진행하지 않고 다음 동기화에서 다시 시도합니다. 재시작하면 MySQL에 기록된 위치부터 이어서 가져옵니다. ESP32가 Upstash에 올린 키는 읽기만 하며 삭제하거나 변경하지 않습니다. MQ-135 ADC의 단위는 `UNVERIFIED`로 유지합니다. 자동 생성 구역의 좌표·임계치는 실제 설치 정보로 별도 등록해야 합니다.

`GET /api/iot/upstash/status`에서 등록 장치, 저장된 원본 샘플 수, 마지막 동기화 성공 시각과 오류 상태를 확인할 수 있습니다. 실측 데이터만 사용하려면 `SEED_DEMO_DATA=false`로 시연용 초기 데이터를 끕니다.

## 기존 DB 이전

운영 DB는 먼저 백업하고 애플리케이션을 중지해야 합니다. [측정값 이전 SQL](backend/db/migrate_metric_readings.sql)의 `@legacy_offset`을 기존 Java 프로세스가 사용한 시간대에 맞춘 후 **한 번만** 실행하고 새 백엔드를 시작합니다. 예전 테이블은 `_legacy` 이름으로 남습니다. 온도·습도·가스의 유효한 원본 행을 새 구조로 옮기고 시간·일 집계를 다시 계산합니다. 의미가 확인되지 않은 MAG 원본과 과거 집계는 레거시 테이블에서 보존합니다. 기존 가스 임계치는 단위가 확인될 때까지 자동으로 복사하지 않습니다.

```sh
mysql -u tcp_user -p tcp_clean_db < backend/db/migrate_metric_readings.sql
```

이 SQL은 기존 v1 DB용입니다. 빈 DB에서는 백엔드의 JPA 설정이 새 측정 테이블을 생성합니다. 현재 `ddl-auto: update`는 개발 환경용 설정이므로 운영 배포에서는 검증된 스키마 마이그레이션과 `validate`로 전환해야 합니다.
