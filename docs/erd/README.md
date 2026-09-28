# TCP Clean Management — ERD v2 제안

검토 기준: `main`의 `9c77a60c4d911550411281b731a8c8bc138ef2cf` (2026-09-28 클론).

**현재 JPA 엔티티 8개를 바탕으로 만든 11개 테이블의 개선 설계다.** 이 디렉터리의 SQL은 빈 DB에서 검증하는 목표 스키마이며, 현재 애플리케이션에 바로 적용하는 마이그레이션은 아니다. 백엔드 엔티티와 API는 아직 기존 구조다.

- [확대·축소 및 테이블 상세 보기](index.html)
- [관계도 PNG](erd-overview.png) · [벡터 SVG](erd-overview.svg)
- [전체 컬럼 Mermaid 원본](schema.mmd)
- [MySQL DDL](schema.sql) · [검증 결과](validation.md)

![ERD v2 관계도](erd-overview.png)

그림에는 관계를 읽는 데 필요한 주요 컬럼을 표시했다. 전체 컬럼·자료형·NULL 허용·인덱스·CHECK는 HTML 상세 보기와 SQL에 있다. 선 양 끝의 `1`, `0..N`, `0..1`은 대응 가능한 행 수다. 점선은 원본 측정값 삭제 후 NULL이 될 수 있는 참조다.

## 코드에서 확인한 문제와 변경

| 현재 코드의 근거 | 개선 설계 | 효과 |
| --- | --- | --- |
| `entity/ZonePermission.java`에는 이미 `id`가 있다. 사용자·구역 조합에 UNIQUE가 없다. | `id` 유지, `UNIQUE(user_id, zone_id)`, FK NOT NULL | 동일한 권한 중복 방지. 기존 문서에 없던 PK를 실제 코드에 맞춤 |
| `SensorDataRaw`와 `SensorDataRequest`의 `value1/value2` 의미가 센서 종류에 따라 바뀐다. | `sensor_metrics` 추가, 원본 한 행을 측정 항목 하나로 표현 | 온도·습도·가스·접점의 의미와 단위를 명시 |
| `IotDataService`는 수신 시각을 `measuredAt`에 기록한다. | `measured_at`, `received_at`, `time_source`, `sample_key` | 측정 지연을 구별하고 동일 패킷의 재전송을 중복 저장하지 않음 |
| `DataAggregationJob`은 집계할 때마다 새 행을 저장한다. | `UNIQUE(metric_id, granularity, bucket_start)` | 재실행 시 같은 버킷을 갱신하는 upsert 가능 |
| 집계 데이터에는 평균·최댓값만 있고 시간/일 구분과 표본 수가 없다. | `HOUR/DAY`, `sample_count`, `sum_value`, `avg/min/max` | 서로 다른 표본 수를 반영한 일평균 계산 |
| `AnalyticsService`는 조건을 만족할 때마다 새 알림을 생성한다. | 미해결 `(zone, type)` 한 건 제한, `last_detected_at`, `occurrence_count` | 지속되는 한 이상 현상을 하나의 알림으로 관리 |
| 알림에 근거 측정값·판단 기준이 없고, 원본은 7일 후 삭제된다. | `evidence`, `detector_version`, nullable `trigger_reading_id` | 원본 삭제 뒤에도 최초 감지 근거 보존 |
| `User.fcmToken`은 사용자당 하나다. 푸시 전송 구현은 없다. | `user_devices`, `notification_deliveries` | 여러 기기 등록, 발송 대기·실패·재시도 이력 지원 |
| `AdminAlertService`는 요청의 `adminId`로 임시 사용자 객체를 만든다. | 필수 관리자 FK, 조치 유형, 요청 중복 키, 알림 버전 | 올바른 인증·권한 검사와 함께 일관된 조치 기록 가능 |

코드 경로는 `backend/src/main/java/com/tcp/cleanmanagement/` 기준이다. 현재 분석은 가스 임계치와 0도 미만 온도 조건이며, 학습된 AI 모델이나 FCM 전송은 구현돼 있지 않다. `WINDOW`와 `MAG`는 enum에 있지만 감지 로직은 없다. `PublicZoneService`의 현재 상태는 `NORMAL` 고정값이다.

## 테이블 구성

| 영역 | 테이블 | 역할 |
| --- | --- | --- |
| 계정·권한 | `users` | 계정, 비밀번호 해시, 역할, 활성 여부 |
| 계정·권한 | **`user_devices` 추가** | 사용자별 앱 설치와 FCM 토큰 |
| 계정·권한 | `zone_permissions` | 사용자가 관리할 수 있는 구역 |
| 시설 | `zones` | 화장실·흡연 구역, 위치 |
| 계측 | `sensors` | 구역에 설치된 장치, 고유 장치 키, 최종 수신 시각 |
| 계측 | **`sensor_metrics` 추가** | 한 장치가 제공하는 측정 항목·단위·가스 쾌적도 기준 |
| 계측 | `sensor_data_raw` | 측정 항목별 원본 값과 시각 |
| 계측 | `sensor_data_aggregated` | 항목별 시간·일 집계 |
| 대응 | `alerts` | 이상 감지 사건, 상태, 최초 감지 근거 |
| 대응 | `action_logs` | 관리자 메모와 해결 조치의 추가 전용 이력 |
| 대응 | **`notification_deliveries` 추가** | 알림별 기기 발송 대기열 및 재시도 상태 |

## 재설계 범위에 대한 판단

사용자·구역·설치 센서·알림·조치 이력이라는 도메인 분리는 유지할 만하다. 권한 테이블에는 제약 보강이 필요하고, 측정값·집계·알림 사건의 모델은 구현 초기에 재설계하는 편이 좋다. 따라서 v2는 기존 핵심 관계를 유지하면서 이 세 영역의 데이터 의미와 수명 주기를 바꾼 제안이다.

측정 항목을 분리하면 온습도 한 패킷이 두 행이 되고 AI 입력을 만들 때 시각·패킷 기준으로 모으는 작업이 필요하다. 센서 종류가 영구히 고정된다면 명시적인 `temperature_c`, `humidity_pct` 컬럼을 쓰는 방식도 가능하다. 이 제안은 복합 센서와 서로 다른 가스 단위를 함께 다루는 현재 흐름에 맞춰 항목 분리를 선택했다.

필수적인 데이터 모델 개선은 기존 8개와 `sensor_metrics`를 합친 9개에서 시작할 수 있다. 추가 2개인 기기·발송 테이블은 모바일 푸시를 실제 구현하는 단계에 함께 도입하면 된다. 다중 테넌트, 복잡한 역할 계층, 동적 규칙 편집, 모든 AI 추론의 별도 저장은 확인된 요구가 없어 추가하지 않았다.

확정 전 확인할 요구는 가스 단위와 보정, MAG 설치 대상·신호 의미, 정상/이상 판정의 시간창, 구역별 권한 정책이다. AI가 여러 센서의 시간창을 함께 판단한다면 `trigger_reading_id`는 대표 측정값으로만 쓰고 `evidence`에는 입력 구간·사용한 항목·특징값·점수·모델 버전을 함께 저장한다. 정상 판정을 포함한 모든 추론 결과를 재현·평가해야 한다면 별도의 `analysis_runs` 모델을 다음 설계 단계에 추가한다.

## 측정값과 임계치

온습도 센서 하나는 `TEMPERATURE/CELSIUS`, `HUMIDITY/PERCENT` 두 개의 측정 항목을 가진다. 같은 패킷의 온도·습도 행에는 같은 `sample_key`를 쓰며, UNIQUE는 `(metric_id, sample_key)`이므로 충돌하지 않는다. 가스 센서는 `GAS`, 접점 센서는 `CONTACT/BINARY`를 사용한다.

가스 값이 ppm, ppb, ADC 중 무엇인지는 저장소만으로 확인할 수 없다. 하드웨어 사양 확인 전에는 `UNVERIFIED` 단위로 기록하고 임계치 판단을 활성화하지 않는다. `MAG`가 문인지 창문인지, 0/1 중 어느 값이 열림인지도 하드웨어 계약에서 정해야 한다. 측정 항목의 의미·단위는 데이터가 쌓인 뒤 변경하지 않고 새 설치 레코드와 측정 항목으로 교체한다.

기존 `zones.pleasant_threshold`와 `needs_ventilation_threshold`는 **가스 측정 항목으로 이동**한다. 서로 다른 단위의 장치를 하나의 구역 임계치로 비교하는 일을 피하기 위해서다. 두 값은 함께 설정하며 `pleasant_threshold < needs_ventilation_threshold`를 강제한다. 기존 분석의 `pleasant_threshold × 1.5` 흡연 조건은 코드의 버전 관리된 규칙으로 유지할 수 있고, 실제 사용한 임계값을 `alerts.evidence`에 남긴다. 동적 규칙 편집 화면을 위한 별도 규칙 테이블은 이번 범위에 넣지 않았다.

구역 상태 계산의 제안 정책: 신선한 정상 GAS 측정값 중 가장 나쁜 상태를 채택한다. 값이 첫 기준 이하면 `PLEASANT`, 두 기준 사이면 `NORMAL`, 두 번째 기준 이상이면 `NEEDS_VENTILATION`이다. 임계치 미설정·단위 미확인·유효한 최근 데이터 부재는 `UNKNOWN`으로 반환한다. 구체적인 데이터 신선도 시간과 감지 민감도는 센서 주기와 현장 실험으로 정한다.

## DB가 보장하는 규칙

- 관계의 필수 FK를 `NOT NULL`로 만들고 계정·구역·장치는 활성 상태로 관리한다. 원본 측정값을 제외한 이력 연결에는 기본적으로 `ON DELETE RESTRICT`를 사용한다.
- 권한, 기기 토큰, 장치 키, 측정 항목, 원본 패킷, 집계 버킷, 조치 요청, 기기별 알림 발송에 중복 방지 키를 둔다.
- `alerts.open_zone_id`는 미해결일 때만 `zone_id`, 해결 후에는 NULL인 생성 컬럼이다. `(open_zone_id, alert_type)` UNIQUE는 구역·유형별 미해결 알림 한 건을 보장하며, 해결된 과거 알림은 여러 건 보존한다. 해결 후 재발은 새 알림이다.
- `status=RESOLVED`와 `resolved_at` 존재 여부를 함께 검사한다. `@Version`에 연결할 `version` 컬럼을 둬 동시 조치 충돌을 감지할 수 있다.
- 원본 삭제 시 `alerts.trigger_reading_id`만 NULL로 바뀐다. `evidence`는 최초 감지 때의 `sensor_id`, `metric_id`, `metric_code`, `unit_code`, `measured_value`, `measured_at`, 연산자와 임계값을 복사한 JSON 객체다. 탐지기 버전은 별도 컬럼에 고정한다. 반복 감지로 최초 근거를 덮어쓰지 않는다.

생성 컬럼에 대한 UNIQUE 인덱스와 CHECK는 [MySQL 생성 컬럼 인덱스 문서](https://dev.mysql.com/doc/refman/8.0/en/create-table-secondary-indexes.html), [CHECK 문서](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html)에 맞췄다. CHECK가 강제되는 MySQL 8.0.16 이상을 대상으로 한다.

## 서비스에서 함께 구현해야 하는 규칙

외래 키는 인증과 접근 권한을 대신하지 않는다. JWT 검증 후 인증된 사용자 ID를 사용하고, `ADMIN/DEVELOPER`와 해당 구역의 `zone_permissions`를 검사해야 한다. 현재 요청의 `adminId`를 신뢰하는 방식과 전체 미해결 알림 조회를 구역별 권한 필터로 바꾼다. `DEVELOPER`의 전역 접근 여부는 아직 명세가 없으므로 이 제안에서는 자동 우회를 두지 않는다.

센서 종류와 측정 항목의 조합, 습도 0~100, 접점 0/1, `alerts.zone_id`와 최초 측정값의 실제 구역 일치, evidence의 필수 키는 서비스에서 검증해야 한다. 이 교차 테이블 규칙은 제공한 FK/CHECK만으로 모두 강제되지 않는다. 기존 데이터가 있는 센서를 다른 구역으로 재배치하면 과거 데이터 해석이 바뀌므로 기존 센서를 비활성화하고 새 설치 레코드를 만든다. 여기서 `device_key`는 설치마다 새로 발급하는 등록 키이며 영구 하드웨어 일련번호가 아니다. 재배치 시 새 키로 등록한다.

원본 저장이 커밋된 뒤 분석하도록 after-commit 이벤트 또는 영속 작업 대기열을 사용한다. 현재 `@Async @EventListener`는 원본 커밋 이전에 실행될 수 있다. `(metric_id, sample_key)` 중복 요청은 분석을 다시 시작하지 않고 기존 성공 결과를 돌려준다. 비동기 분석의 장애 후 재실행까지 정확한 감지 횟수가 필요하면 별도의 처리 완료 키/작업 레코드가 필요하며, 현재 11개 테이블만으로 작업 전달의 exactly-once를 보장하지 않는다.

해결 요청은 한 트랜잭션에서 권한 확인, 알림 버전 검사 또는 행 잠금, `RESOLVED/resolved_at` 변경, `RESOLVE` 조치 이력 추가를 수행한다. 같은 `request_key`의 재시도는 기존 결과를 반환한다. 일반 `NOTE`는 상태를 바꾸지 않는다. 최초 evidence와 조치 이력은 앱에서 수정하지 않는다.

푸시 대기 행은 알림 생성 트랜잭션에서 만들고, 작업자가 lease를 얻은 뒤 전송한다. 완료 갱신에는 해당 `lease_token`을 조건으로 넣어 오래된 작업자가 새 작업의 상태를 덮어쓰지 못하게 한다. 실패 시 재시도 시각을 갱신하고 최대 시도 횟수를 넘으면 `FAILED`로 종료한다. 알림 ID를 앱 측 중복 표시 방지 키로 쓴다. 외부 FCM 호출과 DB 커밋은 한 트랜잭션이 아니므로 전송 자체는 at-least-once다.

발송 직전에도 사용자·기기 활성 상태와 구역 권한을 다시 확인하며, 권한이 사라지면 `CANCELLED` 처리한다. 기기 레코드의 소유자는 변경하지 않는다. 로그아웃·계정 전환 시 이전 행을 비활성화하고 토큰을 NULL로 해제한 뒤 새 소유자의 행에 등록해 발송 이력의 수신자가 바뀌지 않게 한다.

## 집계와 보관

모든 저장 시각과 집계 버킷은 UTC `DATETIME(3)`다. JDBC, 애플리케이션 시계, 스케줄러도 UTC로 맞춘다. `DAY`는 UTC 자정부터 다음 UTC 자정까지다. 한국 현지 일별 통계가 필요하면 명시적으로 KST 경계를 계산하는 별도 정책으로 바꾸며, 기존 버킷과 섞지 않는다.

시간 집계 범위는 `[bucket_start, bucket_start + 1h)`이며, 재집계는 결과를 누적 덧셈하지 않고 해당 버킷을 다시 계산해 upsert한다. 일평균은 `SUM(sum_value) / SUM(sample_count)`로 계산한다. 시간별 평균의 단순 평균을 사용하지 않는다. 데이터가 없는 버킷은 0값 행을 만들지 않는다. `CONTACT` 집계의 평균은 관측 표본에서의 열림 비율이며, 시간 비율로 해석하지 않는다.

현재의 7일 원본 보관 정책은 유지 가능한 제안이다. 지연 도착 데이터가 있으면 보관 중인 시간/일 버킷을 다시 계산해야 한다. 삭제는 해당 범위의 집계 완료를 확인한 뒤 작은 배치로 수행한다. 재전송 중복 키도 원본과 함께 사라지므로, 7일보다 오래된 측정값은 수집 단계에서 거절하거나 별도 보관 정책을 적용해야 한다. 유효한 시각이 없는 레거시/신규 장치는 `LEGACY_SERVER`/`SERVER`를 명시하며 장치에서 직접 측정한 시각처럼 표시하지 않는다.

## 기존 데이터 이전 순서

1. 백업과 데이터 점검 후 **새 DB/새 테이블 세트**에 목표 스키마를 만든다. 중복 권한, NULL FK, 없는 관리자 참조, 누락된 좌표·주소를 먼저 정리한다. 기존 Hibernate `ddl-auto:update`에 컬럼 재구성과 데이터 분할을 맡기지 않는다.
2. 사용자·구역·센서 ID는 보존한다. 비밀번호가 실제 해시인지 확인하고 `password_hash`로 이전한다. 평문이면 문자열 이름만 바꾸지 말고 안전한 해시 전환 또는 비밀번호 재설정을 수행한다. 기존 FCM 토큰은 중복을 정리해 사용자별 레거시 기기 행으로 이전한다.
3. 센서 유형별 `sensor_metrics`를 만든다. TEMP_HUMID의 `value1`은 온도, `value2`는 습도로 분리한다. GAS의 `value1`을 가스로 옮긴다. `value2`가 NULL이면 가짜 0 측정값을 만들지 않는다. MAG 의미와 GAS 단위는 하드웨어 확인 뒤 매핑한다.
4. 기존 raw ID에 `legacy:`를 붙인 값을 `sample_key`로 사용한다. 같은 원본에서 분리된 온도·습도는 같은 키를 공유하되 metric이 다르다. 기존 `measured_at`은 서버 수신 시각이므로 `time_source=LEGACY_SERVER`로 표시한다.
5. 가스 단위가 확인된 경우에만 구역 임계치를 해당 GAS 측정 항목으로 복사한다. 여러 가스 장치의 단위나 보정이 다르면 개별 보정 후 설정한다.
6. 최근 원본이 남아 있는 구간은 집계를 새로 계산한다. **과거 집계에는 표본 수·합계·최솟값이 없어 v2 행을 정확히 복원할 수 없다.** 기존 집계는 레거시 조회용으로 보존하고 표본 수를 1로 꾸며 이전하지 않는다.
7. 기존 알림은 원본 연결을 임의로 추정하지 않는다. `trigger_reading_id=NULL`, `detector_version=legacy-unknown`, `evidence={"source":"legacy","reason":"original evidence unavailable"}`로 이전한다. 같은 구역·유형의 중복 미해결 알림은 담당자가 한 활성 사건으로 정리한 뒤 UNIQUE를 적용한다. 기존 조치 로그는 해결 기록이라는 현재 서비스 동작을 확인하고 `RESOLVE`로 이전한다.
8. DTO·JPA 엔티티·리포지토리·집계·분석·권한·푸시 작업자를 새 스키마에 맞추고 대조 검증 후 전환한다. 배포에서는 버전 관리된 마이그레이션과 `ddl-auto:validate`를 사용한다.

## 재생성과 검증

`schema.sql`이 전체 컬럼·제약의 기준 파일이다. `render_erd.py`는 이 SQL에서 컬럼과 FK를 읽어 Mermaid, SVG, PNG와 HTML 상세 보기를 만든다. 표에서 선택한 주요 컬럼과 선 배치는 스크립트의 명시적 메타데이터다. 스크립트는 모든 FK가 그림에 반영됐는지 확인한다.

```sh
python3 -m pip install Pillow  # PNG 생성용; 이미 설치돼 있으면 생략
python3 docs/erd/render_erd.py
python3 docs/erd/validate_schema.py
```

검증 스크립트는 Docker의 격리된 MySQL 8.0 컨테이너를 만들고, 외부 포트와 영속 볼륨 없이 SQL 생성과 제약 시나리오를 실행한 뒤 컨테이너를 제거한다. 결과는 [validation.md](validation.md)에 기록한다.
