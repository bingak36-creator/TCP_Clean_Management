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

`sampleKey`는 재전송해도 동일하게 유지되는 패킷 키이며, 센서의 측정 항목마다 고유해야 합니다. `measuredAt`을 생략하면 서버 수신 시각을 UTC로 기록합니다. `TEMP_HUMID`는 `TEMPERATURE`/`HUMIDITY`, `GAS`는 `GAS`, `MAG`는 `CONTACT` 값을 받습니다. 같은 키로 다른 값을 보내면 HTTP 409가 반환됩니다. 측정 항목과 단위는 첫 수신 시 자동 등록됩니다. GAS는 단위가 `UNVERIFIED`로 등록되므로 하드웨어 단위와 보정을 확인하고 두 임계치를 설정하기 전에는 가스 이상 감지를 수행하지 않습니다. 개발자는 확인한 단위와 두 임계치를 `PUT /api/admin/sensors/{sensorId}/gas-calibration`(`unitCode`, `pleasantThreshold`, `needsVentilationThreshold`, 앞의 값이 더 작아야 함)으로 등록합니다. 측정값이 환기 임계치를 넘으면 규칙 알림을 만들고, 쾌적 임계치 이하로 내려오면 자동 해제하며, 그 사이 값은 상태를 유지합니다. MQ-7 센서는 이 규칙에서 제외됩니다. MAG의 0/1이 어느 상태를 뜻하는지도 장치 계약에서 확인해야 합니다.

원본의 2026-10-12 변경을 동기화해 React 프론트엔드, 공개 구역의 실제 센서 값 조회, ESP32 WiFiManager 기능을 포함합니다. 기존 `POST /api/iot/{sensorId}/data` 경로도 유지하며, ESP32의 선택 필드 `macAddress`와 측정 항목 배열을 받습니다. 공개 구역 API는 각 구역의 가스·온도·습도 최신 값을 별도로 조회합니다.

`GET /api/iot/device-sets/by-mac/{mac}`는 등록된 장치의 센서 ID만 반환합니다. 설정 조회와 두 센서 수신 경로는 MAC별 인증 키를 요구합니다. `X-Device-Mac`과 `X-Device-Key`를 함께 보내며 본문의 MAC·대상 센서도 확인합니다. 공유 환경 변수 `IOT_DIRECT_API_KEY`는 폐지했습니다. [장치 설정 절차](arduino/esp32_dht22_mq7/README.md)와 [권한·배포·DB 이전 안내](docs/security-upgrade.md)를 참고하세요.

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

원본 JSON·측정값·저장 위치를 한 트랜잭션으로 기록합니다. DB·네트워크 장애로 실패한 패킷은 저장 위치를 진행하지 않고 다음 동기화에서 다시 시도합니다. 범위를 벗어나거나 형식이 잘못되었거나 같은 키에 다른 내용이 온 패킷처럼 다시 시도해도 성공할 수 없는 패킷은 로그를 남기고 건너뛰어, 해당 장치의 이후 패킷 수집을 막지 않습니다. 재시작하면 MySQL에 기록된 위치부터 이어서 가져옵니다. ESP32가 Upstash에 올린 키는 읽기만 하며 삭제하거나 변경하지 않습니다. MQ-135 ADC의 단위는 `UNVERIFIED`로 유지합니다. 자동 생성 구역의 좌표·임계치는 실제 설치 정보로 별도 등록해야 합니다.

개발자 세션으로 `GET /api/iot/upstash/status`에서 등록 장치, 저장된 원본 샘플 수, 마지막 동기화 성공 시각과 오류 상태를 확인할 수 있습니다. 실측 데이터만 사용하려면 `SEED_DEMO_DATA=false`로 시연용 초기 데이터를 끕니다.

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

로그인은 MySQL의 기존 사용자와 비밀번호를 확인하며, 청소·출동·체크리스트·설정 작업은 백엔드에 저장합니다. 미등록 아이디로 로그인해도 계정이 생성되지 않습니다. 데모 로그인, 고정 비밀번호 자동 입력, 화면에서의 역할 전환은 제거했습니다. 역할과 사용자 ID는 서버 DB에서 가져옵니다.

### 관리자 인증과 최초 계정

- `POST /api/auth/login`: 등록된 아이디·비밀번호로 로그인하면 무작위 Bearer 세션 토큰을 발급합니다. 서버는 토큰의 SHA-256 해시만 DB에 저장합니다.
- `GET /api/auth/me`: 실제 발급·유효 기간과 DB 사용자를 검증합니다. 예전 `admin-token`, `mock-jwt-token-*`와 임의 문자열은 사용할 수 없습니다.
- `POST /api/auth/logout`: 해당 세션을 서버 DB에서 폐기합니다. 기본 유효 기간은 8시간이며 `AUTH_SESSION_TTL_SECONDS`로 60~86,400초 범위에서 설정합니다.
- `/api/admin/**`와 `/api/dev/**`의 모든 관리 요청에는 유효한 Bearer 토큰이 필요합니다. 공개 구역 조회는 로그인 없이 사용할 수 있습니다.

빈 사용자 DB의 최초 계정만 `TCP_BOOTSTRAP_USERNAME`과 `TCP_BOOTSTRAP_PASSWORD` 환경 변수로 명시적으로 생성할 수 있습니다. 비밀번호는 최소 12자, 최대 UTF-8 72바이트이며 DEVELOPER 역할로 생성됩니다. 두 변수를 설정하지 않으면 기본 계정도 생성하지 않습니다. 기존 사용자가 한 명이라도 있으면 초기 계정을 추가하거나 비밀번호·역할을 덮어쓰지 않습니다. 계정 생성 후 두 환경 변수를 제거하세요. Docker Compose는 루트 `.env` 또는 호스트 환경 변수의 값을 전달합니다. 일반 Java/Gradle 실행은 셸에 export해야 하며 `.env`를 자동으로 읽지 않습니다.

새 비밀번호는 BCrypt로 저장합니다. 이전 버전의 평문 비밀번호는 정상 로그인 성공 시 BCrypt로 전환합니다. **이전의 자동 가입 기능으로 생성된 계정·역할은 운영자가 검토하고 불필요한 계정을 제거해야 합니다.** 이번 수정은 기존 사용자를 임의로 삭제하지 않습니다.

Flyway가 스키마를 버전별로 관리하며 JPA는 `validate`로 검사합니다. 기존 DB는 자동으로 기준선을 지정하지 않습니다. 이전 DB의 백업·기준선 확인·업그레이드는 [DB 이전 절차](docs/security-upgrade.md#flyway-이전복구)를 따르세요. 브라우저 로그아웃 중 네트워크가 끊어져 서버 폐기에 실패한 세션은 만료 시까지 유효합니다.

관리 API는 역할과 담당 구역을 검사합니다. 조치·설정·체크리스트의 작성자 ID는 세션에서 결정합니다. 개발자는 전체 관리, 관리자는 배정 구역의 운영 조치, 청소 담당자는 배정 구역의 기록·체크리스트를 사용할 수 있습니다.

## ESP32 Wi-Fi → 백엔드 API → MySQL 직접 저장

[공식 ESP32 펌웨어](arduino/esp32_dht22_mq7/esp32_dht22_mq7.ino)는 DHT11/22·MQ-135·MQ-7 값을 센서별 API로 전송합니다. 측정 시각·패킷 키를 먼저 영속 큐에 저장하고 확인 응답 후 제거합니다. [장치별 키·서버 CA·큐 설정](arduino/esp32_dht22_mq7/README.md)이 필요합니다. MySQL 비밀번호는 장치에 넣지 않습니다.

전체 패킷을 보내는 별도 클라이언트는 `POST /api/iot/esp32`를 사용할 수 있습니다. 이 경로도 등록된 MAC의 장치 키와 `X-Device-Mac`이 필요합니다. 새 패킷은 201, 같은 패킷 재전송은 200입니다. 기존 Upstash 수집도 유지하며 정규화된 측정 행에 MAC·수집 출처를 기록합니다. 장치 목록과 이력 API는 모든 수집 경로의 이 측정 행을 조회합니다.

- `UPSTASH_SYNC_ENABLED=false`: 직접 전송만 사용할 때 원격 동기화 중단
- `RATE_LIMIT_STORE=memory`: Redis 없는 한 프로세스 로컬 개발용 요청 제한. 운영 기본값은 Redis
- `app.traffic.device-limit`(기본 120/분): 인증된 장치 MAC별 제한. `app.traffic.iot-ip-limit`(기본 1200/분): 장치 경로의 IP별 제한으로, 같은 NAT 뒤 여러 ESP32를 고려해 별도로 둡니다
- `SERVER_ADDRESS`: 기본값은 127.0.0.1. Compose 내부에서는 0.0.0.0으로 바인딩하며 호스트에 백엔드 포트를 공개하지 않음

공개 배포는 유효한 HTTPS 인증서를 설정합니다. MySQL·Redis 비밀번호와 TLS 파일 경로가 비어 있으면 Compose가 시작하지 않습니다. [보안 배포·기존 비밀번호 교체 안내](docs/security-upgrade.md#운영-비밀번호와-https)를 확인하세요.

## 기존 DB 이전

운영 DB는 먼저 백업하고 애플리케이션을 중지해야 합니다. [측정값 이전 SQL](backend/db/migrate_metric_readings.sql)의 `@legacy_offset`을 기존 Java 프로세스가 사용한 시간대에 맞춘 후 **한 번만** 실행하고 새 백엔드를 시작합니다. 예전 테이블은 `_legacy` 이름으로 남습니다. 온도·습도·가스의 유효한 원본 행을 새 구조로 옮기고 시간·일 집계를 다시 계산합니다. 의미가 확인되지 않은 MAG 원본과 과거 집계는 레거시 테이블에서 보존합니다. 기존 가스 임계치는 단위가 확인될 때까지 자동으로 복사하지 않습니다.

```sh
mysql -u tcp_user -p tcp_clean_db < backend/db/migrate_metric_readings.sql
```

이 수동 SQL은 더 오래된 측정 스키마의 준비 단계입니다. 빈 DB는 Flyway V1/V2로 생성합니다. 기존 DB는 현재 기준 구조 확인과 백업 후 명시적으로 기준선을 등록해야 합니다. 기본 설정은 `ddl-auto: validate`이며 자동 스키마 갱신은 사용하지 않습니다.


## 백엔드 내장 AI 예측

백엔드는 `backend/ai/models/environment/`의 학습된 모델 5개를 Python 추론 프로세스에서 한 번 로드하고 재사용합니다. 기존 `result/`의 모델과 전처리·판정 코드를 복사했으며 원본 SHA-256을 `backend/ai/manifest.json`으로 검사합니다. 실행 시 상위 `result/` 폴더는 필요하지 않습니다. 외부 AI HTTP 서버도 필요하지 않습니다.

예측 대상은 **창문 열림·수도 사용·누수·1시간 내 동파 위험·3시간 내 동파 위험**입니다. 현재 수신 API에는 MQ-7의 히터 주기·유효 관측 이력이 없으므로 흡연과 11개 상황 분류는 활성화하지 않습니다. 이 사유는 판정 응답의 `unavailable`에 들어갑니다. MQ-7 원시값이나 `heaterPhaseValid=true` 하나만으로 흡연 증거를 만들지 않습니다.

### 로컬 실행

Python 3.14와 Java 17이 필요합니다. 다음 가상 환경은 Git에서 제외됩니다.

```sh
cd backend
python3.14 -m venv ai/.venv
ai/.venv/bin/python -m pip install -r ai/requirements.txt
./gradlew bootRun
```

백엔드는 `ai/.venv`, 프로젝트 `.venv`, 상위 작업 폴더 `.venv` 순서의 가까운 Python을 찾고, 없으면 `python3`를 사용합니다. 명시적으로 지정하려면 `RESTROOM_AI_PYTHON=/absolute/path/to/python`을 설정합니다. `java -jar` 실행 시에는 `backend/`를 현재 경로로 사용하거나 `RESTROOM_AI_DIRECTORY=/absolute/path/to/backend/ai`를 지정합니다. Docker 런타임에는 Python·Java·추론 의존성과 모델 파일이 함께 들어갑니다.

### 수집·예측·저장 흐름

1. 일반 센서 API와 직접 ESP32/Upstash 수집이 저장한 MQ-135 행을 `ai_predictions`에 같은 트랜잭션으로 대기시킵니다. MQ-7은 시설 모델 입력으로 사용하지 않습니다.
2. 같은 장치/설치와 같은 `sampleKey`의 온도·습도·MQ-135를 결합합니다. 장치 세트와 Upstash의 실제 센서 연결을 사용하며 다른 장치의 최신값으로 빈 항목을 채우지 않습니다. 독립 MQ-135 센서는 같은 구역에 활성 온습도 센서가 정확히 하나여야 합니다.
3. 누락 항목은 최대 5분 기다린 뒤 `SKIPPED`와 사유를 남깁니다. 유효한 ADC 및 온습도 입력만 추론하며, 모델 장애는 원본 수집을 막지 않고 `RETRY`로 남깁니다.
4. 예측 등급·문구·모델 버전·확률·준비 상태를 DB에 저장합니다. 준비가 끝난 모델의 주의/긴급 항목만 알림으로 저장하고, 같은 센서/설치/종류의 미해결 AI 알림은 중복 생성하지 않습니다. 알림 API에는 `detectionSource: AI`, `modelVersion`, `level`이 포함됩니다. 기존 임계값 규칙 알림은 `RULE`로 구분합니다.
5. 기본 최근 4시간의 미처리 측정값을 회수합니다. Python 또는 백엔드를 재시작하면 이미 완료한 같은 장치의 최근 입력을 모델에 재생해 문맥을 복원하며, 재생 자체는 알림을 다시 저장하지 않습니다.

시설 모델은 **MQ-135 예열 최소 60분과 이후 약 3시간의 이력**을 요구합니다. 공식 스케치의 5초 수집 기준이며, 예열 중에는 `준비 중`으로 응답하고 AI 알림을 생성하지 않습니다. 안정화 검사는 최근 10분의 충분하고 연속된 표본을 요구하므로 드문 수집이나 센서 오류에서는 준비가 완료되지 않을 수 있습니다. 초기 이력이 없는 상태를 정상으로 표시하지 마세요. 학습 모델을 연결한 기능이며 실제 시설에서의 정확도 검증을 대신하지 않습니다.

### 예측 조회 API

기존 관리자 API와 같은 서버 세션(Bearer) 인증과 역할·담당 구역 검사를 적용합니다. 개발자가 아니면 담당 구역의 예측만 조회합니다.

- `GET /api/admin/ai/status`: 모델 로드 상태, 모델 버전, 작업 상태별 개수
- `GET /api/admin/ai/predictions?zoneId=1&limit=50`: 최근 예측/대기/실패 내역 (`limit` 1~200)
- `GET /api/admin/ai/sensors/{mq135SensorId}/latest`: 해당 MQ-135 센서의 최신 판정

응답에는 `status` (`PENDING`, `RUNNING`, `RETRY`, `COMPLETE`, `SKIPPED`), `measuredAt`, `predictedAt`, `stale`, 입력값과 `judgement`가 포함됩니다. `COMPLETE`는 모델 호출이 성공했다는 뜻이며, 실제 판단 준비 여부는 `judgement.ready.environment`를 확인해야 합니다. 기존 React 대시보드는 이 새 AI 조회 API를 아직 표시하지 않습니다.

| 환경 변수 | 기본값 | 용도 |
|---|---|---|
| `RESTROOM_AI_ENABLED` | `true` | 모델 실행·예측 작업 활성화 |
| `RESTROOM_AI_DIRECTORY` | `ai` | 모델과 worker.py가 있는 디렉터리 |
| `RESTROOM_AI_PYTHON` | 자동 검색 | Python 실행 파일 |
| `RESTROOM_AI_TIMEOUT_SECONDS` | `30` | 모델 시작/개별 응답 제한 시간 |
| `RESTROOM_AI_POLL_INTERVAL_MS` | `1000` | 작업 확인 간격 |
| `RESTROOM_AI_BATCH_SIZE` | `50` | 회당 작업 수 (최대 200) |
| `RESTROOM_AI_INPUT_WAIT_SECONDS` | `300` | 같은 패킷의 온습도 대기 시간 |
| `RESTROOM_AI_BACKFILL_HOURS` | `4` | 최근 미처리 데이터 회수·이력 복원 범위 (최대 24시간, 장치별 복원 최대 6000행) |

더 오래된 DB에서 AI 테이블이 없다면 백업·앱 중지 후 [AI 예측 이전 SQL](backend/db/migrate_ai_predictions.sql)과 나머지 이전 단계를 확인하세요. 현재 배포는 Flyway와 `ddl-auto=validate`로 스키마를 관리합니다. AI 결과 테이블은 원본 7일 삭제와 독립적으로 남으므로 서비스의 보관 정책에 맞춰 관리해야 합니다.

### 검증

```sh
cd backend
./gradlew test
ai/.venv/bin/python -m unittest discover -s ai/tests -v
```

Java 통합 테스트는 H2의 메모리 DB에서 수행하고 데모 생성·주기 작업·실제 Upstash 동기화를 끕니다. Python 테스트와 Java 프로세스 테스트는 동봉된 실제 모델을 로드하므로 위 Python 의존성이 필요합니다. 실제 MySQL이나 기기 설정을 바꾸지 않습니다.

## seokhyeon09 최신 main 통합

2026-10-18 기준 main 2960e81의 지도 위치 선택, GPS·장치 발견·이동, 계정·센서·담당자 관리 기능을 기존 인증·AI 처리와 맞춰 통합했습니다. [통합 내역과 적용 안내](docs/seokhyeon-sync.md)를 확인하세요. 보관기간 변경 및 Upstash 패킷 자동 삭제 확대는 승인 대기입니다.

후속 분석에서 시설 저장의 부분 반영, 이동한 장치의 데이터·권한 혼합, 재전송 충돌 등 12개 문제를 수정했습니다. [문제별 수정 내역과 최종 검증](docs/post-sync-fixes.md)을 확인하세요. 시설 층수·구분 저장을 위한 V4 마이그레이션이 추가됐습니다.
