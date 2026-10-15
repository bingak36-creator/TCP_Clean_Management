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

## 통합 프론트엔드와 MySQL 조회

[hyunminboo 저장소의 frontend 브랜치](https://github.com/hyunminboo/TCP_Clean_Management/tree/frontend), 커밋 `162daaa2b4ab342ec07dcfccffc2562b27963f36`의 역할별 관제 화면·환경 차트·출동 팝업을 통합했습니다. 대시보드와 이력 차트는 **MySQL에 저장된 실측 데이터만 조회**합니다. 화면 조회는 30초마다 갱신하며 Upstash 직접 조회 선택지는 제공하지 않습니다.

데이터 수집은 아래 직접 API 방식 또는 기존 Upstash 자동 저장 방식으로 설정할 수 있습니다. 화면과 이력 API는 두 수집 방식 모두 MySQL만 조회합니다. 기존 Upstash → MySQL 자동 저장은 화면과 별도로 기본 2분마다 수행합니다. 첫 수집은 남아 있는 이력을 가져오고, 이후에는 DB에 기록한 마지막 저장 시각부터 이어서 읽습니다. 같은 시각에 기록된 다른 패킷을 놓치지 않도록 마지막 저장 시각의 경계 데이터만 중복 확인합니다. 재시작 후에도 DB에 기록한 위치를 사용하므로 전체 이력을 다시 가져오지 않습니다. 이미 제거된 Upstash 이력이나 마지막 저장 시각 이전에 별도로 삽입한 과거 이력을 재탐색하는 기능은 아닙니다.

```sh
cd frontend
npm ci
npm run dev
```

프론트엔드는 기본 `http://127.0.0.1:5173`, 백엔드는 `http://127.0.0.1:8080`입니다. `/api` 요청은 Vite가 백엔드로 전달합니다. 다른 백엔드는 `VITE_API_PROXY_TARGET`으로 지정합니다. [프론트엔드 실행 및 지도 설정](frontend/README.md)을 참고하세요.

센서 API는 `GET /api/iot/devices`와 `GET /api/iot/devices/{MAC}/history?hours=1&limit=1000`입니다. 기간은 1~168시간, 반환 개수는 1~1,000개이며 최신 값을 선택한 후 시간순으로 반환합니다. `source=mysql`은 호환을 위해 허용하며, `source=upstash` 등 다른 출처는 HTTP 400으로 거부합니다. 조회 서비스에는 Upstash 연결 의존성이 없습니다. 원본에 없는 DHT 측정값은 누락 상태로 표시하며, MQ-135는 보정하지 않은 ADC 값입니다. 위치가 등록되지 않은 장치는 지도에 임의 좌표를 만들지 않고 대시보드에서 표시합니다.

현재 역할 로그인과 청소·출동·시설 설정은 원본 프론트엔드의 **시연 기능**입니다. 백엔드 계정 인증 및 해당 작업의 영구 저장은 아직 연결되어 있지 않습니다. 개발 서버에서는 `developer`, `admin`, `cleaner`와 비밀번호 `1234`로 역할 화면을 확인할 수 있습니다. 배포 빌드에서는 시연 로그인 기본값이 꺼져 있으며, 시연 배포에 한해 `VITE_DEMO_AUTH=true`로 켤 수 있습니다. 센서 조회와 MySQL 자동 저장은 실제 데이터에 연결됩니다.

## ESP32 Wi-Fi → 백엔드 API → MySQL 직접 저장

[직접 전송 펌웨어](arduino/smart_zone_mysql_direct/smart_zone_mysql_direct.ino)는 DHT11(GPIO4)·MQ-135(GPIO34)를 30초마다 측정해 `POST /api/iot/esp32`로 보냅니다. 백엔드는 장치 키와 허용 MAC을 확인하고 원본 JSON 및 온도·습도·가스 측정값을 한 트랜잭션으로 저장합니다. 장치 등록은 첫 유효 패킷 수신 시 자동으로 처리합니다. MySQL 비밀번호는 기기에 넣지 않습니다.

- `IOT_DIRECT_API_KEY`: 백엔드와 ESP32가 공유하는 충분히 긴 무작위 장치 키. 비어 있으면 직접 수신 API는 HTTP 503으로 비활성화됩니다.
- `IOT_DIRECT_MAC_ADDRESS`: 키를 사용할 ESP32의 MAC. 지정하면 다른 장치의 패킷은 거부합니다.
- `SERVER_ADDRESS`: ESP32가 접근할 수 있는 서버 바인딩 주소. 로컬 개발의 `0.0.0.0`은 LAN 접속을 허용합니다.
- `UPSTASH_SYNC_ENABLED=false`: 직접 전송만 사용할 때 기존 Upstash 자동 조회를 중단합니다. 과거 MySQL 이력은 보존합니다.
- `RATE_LIMIT_STORE=memory`: Redis 없이 로컬 개발 화면을 실행할 때 사용합니다. 공개 API의 기존 IP별 1분당 10회 제한은 프로세스 메모리에서 유지합니다. 여러 서버의 제한을 공유해야 하는 배포에서는 기본값 `redis`를 사용합니다.

기기별 `device_config.h`는 [예제 헤더](arduino/smart_zone_mysql_direct/device_config.example.h)를 복사해 만들며 Git에서 제외됩니다. `BACKEND_BASE_URL`에는 ESP32에서 접근 가능한 백엔드 주소를, `DEVICE_API_KEY`에는 서버와 같은 키를 지정합니다. 현재 LAN 개발 주소는 `http://192.168.0.5:8080`입니다. 이 주소가 바뀌면 기기 설정도 갱신해야 합니다. HTTP는 신뢰하는 개발 LAN에서 사용하며 외부 서버에는 HTTPS와 서버 CA를 설정하세요. 펌웨어는 HTTPS 인증서 검증을 생략하지 않습니다.

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 arduino/smart_zone_mysql_direct
arduino-cli upload --fqbn esp32:esp32:esp32 --port /dev/cu.usbserial-0001 arduino/smart_zone_mysql_direct
```

서버는 저장이 완료된 새 패킷에 HTTP 201, 동일 패킷 재전송에 HTTP 200과 같은 `sampleKey`의 확인 응답을 반환합니다. ESP32는 확인 응답을 받은 뒤 다음 패킷으로 진행하며 실패하면 같은 패킷을 10초 간격으로 재전송합니다. 미확인 패킷은 기기 RAM에만 보관하므로 전원을 끄면 사라지고, 재시도 중에는 새 측정을 쌓지 않습니다. MySQL 중복 저장은 MAC·샘플 키 제약으로 방지합니다. DHT 실패 시 누락 값을 만들지 않고 MQ-135만 저장합니다.

기존 테이블 이름과 이력을 유지하기 위해 직접 API 원본도 `upstash_imported_samples`에 보관하며 `ingest_source=direct_api`로 구분합니다. 직접 저장은 Redis 동기화 위치를 이동시키지 않습니다. 대시보드는 `source=mysql`과 최신 패킷의 `ingestSource`를 받아 수집 경로를 표시합니다. 이 컴퓨터의 백엔드와 MySQL은 켜져 있어야 기기가 저장할 수 있습니다.

[통합 및 직접 수집 검증 결과](docs/integration-validation.md)를 참고하세요.

## 기존 DB 이전

운영 DB는 먼저 백업하고 애플리케이션을 중지해야 합니다. [측정값 이전 SQL](backend/db/migrate_metric_readings.sql)의 `@legacy_offset`을 기존 Java 프로세스가 사용한 시간대에 맞춘 후 **한 번만** 실행하고 새 백엔드를 시작합니다. 예전 테이블은 `_legacy` 이름으로 남습니다. 온도·습도·가스의 유효한 원본 행을 새 구조로 옮기고 시간·일 집계를 다시 계산합니다. 의미가 확인되지 않은 MAG 원본과 과거 집계는 레거시 테이블에서 보존합니다. 기존 가스 임계치는 단위가 확인될 때까지 자동으로 복사하지 않습니다.

```sh
mysql -u tcp_user -p tcp_clean_db < backend/db/migrate_metric_readings.sql
```

이 SQL은 기존 v1 DB용입니다. 빈 DB에서는 백엔드의 JPA 설정이 새 측정 테이블을 생성합니다. 현재 `ddl-auto: update`는 개발 환경용 설정이므로 운영 배포에서는 검증된 스키마 마이그레이션과 `validate`로 전환해야 합니다.
