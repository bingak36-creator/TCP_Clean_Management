# ERD 검증 결과

- 실행 시각: 2026-09-28T03:29:42+00:00
- DB: MySQL 8.0.46
- 환경: network=none, 포트 공개 없음, tmpfs 데이터 디렉터리, 검증 후 컨테이너 제거
- 결과: 41개 확인, 전체 통과

| 확인 항목 | 결과 |
| --- | --- |
| DDL: all tables created | PASS |
| 11 tables | PASS |
| 13 foreign keys | PASS |
| Fixture: users, zones, sensors, metrics | PASS |
| Duplicate permission | PASS — 1062 |
| Required permission FK | PASS — 1048 |
| Unknown zone FK | PASS — 1452 |
| Duplicate FCM token | PASS — 1062 |
| Active device needs a token | PASS — 3819 |
| Latitude range | PASS — 3819 |
| Duplicate metric | PASS — 1062 |
| Metric unit mismatch | PASS — 3819 |
| Unverified GAS thresholds | PASS — 3819 |
| Verified GAS thresholds | PASS |
| Threshold order | PASS — 3819 |
| One packet with two metrics | PASS |
| Duplicate metric packet | PASS — 1062 |
| Decimal value preserved | PASS |
| Hourly and daily buckets coexist | PASS |
| Duplicate aggregate bucket | PASS — 1062 |
| Misaligned bucket | PASS — 3819 |
| Zero sample count | PASS — 3819 |
| Invalid aggregate range | PASS — 3819 |
| Weighted daily mean: 25 rather than 20 | PASS |
| Initial unresolved alert | PASS |
| Only one open zone/type alert | PASS — 1062 |
| Resolved alert needs timestamp | PASS — 3819 |
| Evidence must be object | PASS — 3819 |
| Resolve and allow recurrence | PASS |
| Multiple resolved histories allowed | PASS |
| Deleting raw preserves alert evidence | PASS |
| Historical zone cannot be deleted | PASS — 1451 |
| Action with existing administrator | PASS |
| Duplicate action request | PASS — 1062 |
| Nonexistent administrator | PASS — 1452 |
| Empty action detail | PASS — 3819 |
| Notification outbox row | PASS |
| Duplicate alert/device delivery | PASS — 1062 |
| SENT requires sent_at | PASS — 3819 |
| SENDING requires lease | PASS — 3819 |
| Claim and complete notification | PASS |

이 검증은 목표 DDL의 생성·제약 동작을 확인한다. 기존 Spring 애플리케이션과의 통합, 인증·권한 검사, FCM 실제 전송, 마이그레이션 및 부하 테스트는 포함하지 않는다.
