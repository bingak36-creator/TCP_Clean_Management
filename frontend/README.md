# TCP CLEAN 프론트엔드

React/Vite 기반 지도·역할별 관제 화면입니다. UI 원본은 [hyunminboo/TCP_Clean_Management의 frontend 브랜치](https://github.com/hyunminboo/TCP_Clean_Management/tree/frontend), 커밋 `162daaa2b4ab342ec07dcfccffc2562b27963f36`입니다. 기존 측정 항목 기반 백엔드와 Upstash → MySQL 자동 저장을 유지하면서 실제 센서 조회를 연결했습니다.

```sh
npm ci
npm run dev
```

`http://127.0.0.1:5173/login`에서 서버 DB에 등록된 계정으로 로그인합니다. 미등록 아이디는 자동 가입되지 않으며 시연 계정·고정 비밀번호·오프라인 대체 로그인·화면 역할 전환을 제공하지 않습니다. 최초 관리자 생성과 세션 설정은 [루트 README](../README.md#관리자-인증과-최초-계정)를 참고하세요. 저장된 토큰은 시작 시 서버에서 검증하고 사용자 ID·역할·배정 구역은 서버 응답만 사용합니다. 역할별 인가와 감사 주체 확인은 서버에서 수행합니다. 청소·출동·체크리스트·시설 설정은 인증된 백엔드 API와 연결됩니다.

대시보드와 차트는 **MySQL DB만 조회**하며 화면은 30초마다 갱신합니다. 1시간·6시간·24시간·7일 차트는 실제 측정 이력을 표시하고, 해당 기간에 데이터가 없으면 측정값을 만들지 않습니다. ESP32 Wi-Fi → 백엔드 API → MySQL 직접 수집을 지원하며, 기존 Upstash 자동 저장을 선택한 환경에서는 수집 주기가 기본 2분입니다. 화면 조회 API는 Upstash를 직접 읽지 않습니다.

## 환경 설정

필요한 값만 Git에서 제외되는 `.env.local`에 설정합니다.

```dotenv
# Vite에서 /api 요청을 전달할 백엔드
VITE_API_PROXY_TARGET=http://127.0.0.1:8080
# 지도 사용 시 본인의 Kakao JavaScript 키와 사이트 도메인 등록 필요
VITE_KAKAO_MAP_KEY=
# Vite 대중교통 프록시 사용 시 서버 측 REST 키
KAKAO_REST_API_KEY=
```

기본 API는 프론트엔드와 같은 출처의 `/api`입니다. 별도 API 주소가 필요하면 `VITE_API_BASE_URL`을 설정하고 백엔드 CORS를 맞추세요. 지도 키가 없으면 지도 연결 안내와 센서 대시보드 링크를 표시합니다. 실제 설치 좌표가 없는 센서 장치는 지도에 임의로 배치하지 않습니다.

## 빌드

```sh
npm test
npm run lint
npm run build
```

Docker 빌드에는 HTTPS, HTTP 리디렉션, SPA 경로 처리와 `/api` → `backend:8080` 프록시 설정을 포함합니다. 실제 도메인의 인증서와 비밀 키를 `TLS_CERT_DIR`에서 읽기 전용 마운트해야 하며, 자세한 절차는 [배포 안내](../docs/security-upgrade.md)를 참고하세요. 배포 시 지도 JavaScript 키 등 `VITE_` 설정은 빌드 환경에서 제공해야 합니다. Vite 개발 서버의 Kakao REST 프록시는 Nginx 배포 설정에 포함되지 않으므로 실제 배포에서는 별도 서버 경로를 연결해야 합니다.

Upstash 인증 URL과 MySQL 비밀번호는 백엔드의 로컬 비공개 설정으로 관리합니다. 프론트엔드 환경 변수나 번들에 넣지 마세요. MySQL 자동 저장 및 조회 경로는 [루트 README](../README.md#통합-프론트엔드와-mysql-조회)에 설명되어 있습니다.
