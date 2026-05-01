# 1주차 셋업 인터뷰 기록

PROJECT.md "먼저 나에게 물어볼 것" 절차에 따라, Step 1 착수 전에 진행한
사전 인터뷰 결과 및 그로부터 확정된 1주차 운영 결정사항을 기록한다.

날짜: 2026-04-29

---

## 1. 인터뷰 Q&A

### Q1. 대상 웹앱 위치 / 포트
- **A.** `http://localhost:3000`. 환경변수 `TARGET_URL`로 주입.

### Q2. 로그인 URL 패턴
- **A.** `http://localhost:3000/auth/login`. 환경변수 `LOGIN_URL`로 주입.
  에이전트가 로그인 경로를 추측하지 않도록 명시 주입한다.

### Q3. 관리자 페이지 진입 경로
- **A.** `http://localhost:3000/management`.
  일반 사용자 영역과 분리된 별도 경로. 1주차에는 탐색·테스트 모두 허용.

### Q4. 테스트 계정 / 권한
- **A.** `facility@airport.co.kr` (슈퍼 계정, `ROLE_SYSTEM_ADMIN`).
  일반 + 관리자 영역 모두 단일 계정으로 접근 가능. 비밀번호는 `.env`로 주입.

### Q5. 시드 데이터
- **A.** 승객 좌표 / 출국장 혼잡도 / 검색기기 데이터 + 24개 계정.
  게시글류 일반 콘텐츠는 없음.
- **운영 함의.** "리스트/CRUD 게시판" 같은 일반 웹 패턴 가정 금지.
  시각 모니터링 + 대시보드 KPI 기반 플로우를 우선 후보로 판단해야 한다.

### Q6. 앱 도메인 한 줄 설명
- **A.** 김해공항 출국장의 LiDAR 기반 승객 위치 스트림을 시각 모니터링하고,
  혼잡도·체류·동선 등 KPI 데이터를 대시보드 형태로 분석하는
  **공항 운영팀용 내부 도구**.

### Q7. 웹소켓 의존 기능 식별 방법
- **A.** 에이전트가 **네트워크 트래픽을 직접 관찰**해서 판별 (선택지 a).
  Playwright MCP의 네트워크 가시성을 활용해
  `ws://` / `wss://` 핸드셰이크가 발생하는 라우트를 웹소켓 의존으로 표시.
- **운영 함의.** 단계 1 매핑 산출물에 라우트별 "웹소켓 사용 여부" 컬럼을
  반드시 포함. 단계 2 우선순위 후보에서 해당 라우트를 자동 제외.

### Q8. Playwright MCP
- **A.** Microsoft 공식 Playwright MCP 사용.

### Q9. 패키지 매니저 / Node 버전
- **A.** **pnpm** 선택 (yarn 제외, npm·pnpm 중 효율 우선 위임 → pnpm).
  - 선정 사유: 디스크 효율(content-addressable store), 설치 속도,
    strict `node_modules`로 phantom dependency 차단
    → 2주차 단계 모듈을 에이전트별로 분리할 때 의존성 누수 위험 감소.
- **Node 버전.** 20 LTS 기준.

### Q10. Anthropic 모델
- **A.** 1주차는 **모든 단계에서 `claude-opus-4-7` 단일 사용** (PROJECT.md 갱신 반영).
  정직한 baseline 확보 → 2주차 모델 분리(Opus/Sonnet) 효과를 명확히 비교.
- **운영 함의.** 모델 설정은 `src/stages/config.ts` 한 곳에서 관리.
  환경변수 `ANTHROPIC_MODEL`은 폐기.

### Q11. 인증 방식 (후속 확인)
- **A.** 사용자는 **Claude Max plan** 사용자.
  `@anthropic-ai/claude-agent-sdk`는 Claude Code CLI(`claude`) 바이너리를
  subprocess로 띄우는 구조라 `ApiKeySource='oauth'`를 통해 Max plan OAuth
  자격증명을 그대로 사용한다.
- **운영 함의.** `ANTHROPIC_API_KEY` 환경변수는 **선택 사항**으로 강등.
  Max plan 사용자는 비워두고 Claude Code CLI 로그인만 유지하면 된다.
  Console 결제(API key) 사용자만 키를 채운다.

---

## 2. 확정된 1주차 운영 결정사항 요약

| 항목 | 값 |
|---|---|
| 환경 (`ENV`) | `local` |
| `TARGET_URL` | `http://localhost:3000` |
| `LOGIN_URL` | `http://localhost:3000/auth/login` |
| 관리자 영역 | `http://localhost:3000/management` (탐색/테스트 허용) |
| 테스트 계정 | `facility@airport.co.kr` (`ROLE_SYSTEM_ADMIN`) |
| 도메인 | 김해공항 출국장 LiDAR 모니터링 + KPI 대시보드 (운영팀 내부 도구) |
| 웹소켓 식별 | 에이전트가 Playwright MCP 네트워크 트래픽 관찰로 판별 |
| 패키지 매니저 | pnpm |
| Node 버전 | 20 LTS |
| MCP | Microsoft 공식 Playwright MCP |
| 1주차 모델 | `claude-opus-4-7` |

---

## 3. 환경변수 목록 (`.env.example` 매핑)

| 변수 | 용도 | 1주차 예시값 |
|---|---|---|
| `ENV` | 가드레일 정책 선택 (`local`/`staging`/`prod`) | `local` |
| `TARGET_URL` | 대상 웹앱 베이스 URL | `http://localhost:3000` |
| `LOGIN_URL` | 로그인 진입 URL | `http://localhost:3000/auth/login` |
| `TEST_EMAIL` | 테스트 계정 이메일 | `facility@airport.co.kr` |
| `TEST_PASSWORD` | 테스트 계정 비밀번호 | (사용자 주입) |
| `ANTHROPIC_API_KEY` | Claude Agent SDK 인증 (Max plan은 선택, Console 결제만 필수) | (선택) |

> 모델/토큰 상한은 환경변수가 아닌 `src/stages/config.ts`에서 단계별로 관리한다.

---

## 4. 1주차 가드레일 활성 정책 (재확인)

- 관리자 페이지 포함 모든 영역 탐색·테스트 허용
- 비가역 액션(삭제 등) 자유 실행 허용 (DB 리셋 가능 환경)
- 결제/외부 알림은 mock 한정 허용
- 공통 가드레일 적용:
  - 동일 액션 5회 이상 반복 시 중단
  - 단계당 토큰 상한 가드 (구체값은 Step 2)
  - 액션이 애매하면 실행 보류 후 사람에게 질문
- **웹소켓 의존 기능에 대한 테스트 작성 금지** (기록만 허용)

---

## 5. 미확정 / 후속 결정 필요 항목

- 시드 데이터 정확한 스키마 → 단계 1에서 에이전트가 실측으로 채움
- 웹소켓 의존 라우트 목록 → 단계 1 매핑 산출물의 일부로 자동 채움

---

## 6. 단계별 토큰 상한 + 모델 정책 (PROJECT.md 갱신 반영)

### 모델
1주차 모든 단계에서 **`claude-opus-4-7` 단일 사용**.
2주차에 stage별로 모델 분리(예: stage2를 Sonnet)할 때 한 곳만 바꾸면 되도록
`src/stages/config.ts`에서 단계별 메타데이터로 관리한다.

### 토큰 상한 (input + output 합산)

| Stage | 설명 | 모델 | 토큰 상한 |
|---|---|---|---|
| `stage1-mapping` | 탐색 + 기능 매핑 | claude-opus-4-7 | 50,000 |
| `stage2-prioritize` | 우선순위 판단 | claude-opus-4-7 | 15,000 |
| `stage3-test` | 테스트 작성 + 자가 수정(최대 3회) | claude-opus-4-7 | 100,000 |
| **합계** |  |  | **165,000 / 1회 실행** |

상한 도달 시: 단계를 강제 종료하고 그 시점 데이터로 다음 단계 진행.
상한에 부딪혀 멈추는 것 자체가 2주차 설계 근거 데이터가 된다
("어느 단계가 상한을 못 지키는가?").

## 7. Max plan 운영 룰

- 1회 실행 ≈ 165k 토큰 (Opus 단일).
- Max plan 일일/주간 한도 보호를 위해 **하루 최대 2~3회 실행**을 목표로 한다.
- 그 이상 필요해지면 실험 설계 자체를 재검토 (모델 분리 앞당김 등).
