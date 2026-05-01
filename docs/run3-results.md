# 1주차 라이브 #3 결과 — 첫 통과 baseline

수정 3종(`fallback-assistant-text` 누적, `messages.jsonl` 영속화,
stage1 프롬프트 출력 규칙 명시) 적용 직후의 라이브 실행 결과.
**단일 에이전트가 E2E 테스트를 자율 생성·실행·통과시킨 첫 baseline**이다.

- 실행 시각: 2026-05-01 06:18 UTC
- runId: `runs/2026-05-01T06-18-12-071Z/`
- 모드: live, env=local, 모든 단계 `claude-opus-4-7`

## 1. 측정값 요약

| Stage | status | turns | input+output | cache_read | cost (USD) | duration | denials |
|---|---|---|---|---|---|---|---|
| stage1-mapping | completed | 54 | 3,827 | (대량) | $2.5351 | 345.2s | 0 |
| stage2-prioritize | completed | 1 | 6 | (소량) | $0.1573 | 40.7s | 0 |
| stage3-test | completed | 61 | 2,225 | (대량) | $4.6179 | 636.2s | 0 |
| **합계** |  | **116** | **6,058** | **14,716,534 (총)** | **$7.3103** | **1022.1s (약 17분)** | **0** |

캐시 생성 합계: 560,112 토큰.

## 2. 단계별 산출물 정성 평가

### stage1 (탐색·매핑) — 매우 높은 품질
- **51줄 마크다운** (가드레일 정책까지 포함하면 더 김), 표 16행.
- 일반 영역 8개 / 관리자 영역 6개 / 공통 모달·팝오버 3개 식별.
- **WebSocket 의존 라우트 5개를 네트워크 트래픽 관찰로 자동 식별**:
  `/monitoring/live/2d/all`, `/monitoring/live/3d/{t1,t2}`,
  `/monitoring/summary`, `/dashboard/replay`. 1주차 가드레일에 따라
  자동으로 후보에서 제외.
- 비기능적 발견까지 캡처: "FIDS iframe이 5xx", "검색대 미운영 상태",
  "facility 계정이 super-admin까지 접근 가능", `/dashboard`가
  `/dashboard/flow`로 리다이렉트, `/management`가 `/management/status`
  와 동일 콘텐츠 등.
- "결정 로그(라우트 vs utility URL 판단)" 절을 자체적으로 추가해
  매핑 판단 근거를 남김.

### stage2 (우선순위 판단) — 정확하고 효율적
- 1턴, 40.7초, $0.16. 도구 호출 없이 추론만으로 판단.
- 선택: **`/management/logs` (관리자 시스템 로그)**. 이유: 73건 실제
  시드 데이터 보유, WS 의존 0, 검색·필터·페이지네이션·CSV 다운로드의
  자연스러운 5~13단계 시나리오, 운영 빈도/실패 영향도 모두 높음.
- 탈락 후보 4개와 사유까지 명기:
  `/dashboard` (KPI가 비어 결정론적 검증 약함),
  `/management/settings` (비가역 사이드 이펙트),
  `/management/admin-registration` (셋업성, 빈도 낮음),
  `/management/fids-monitoring` (iframe 5xx로 검증 불가).

### stage3 (테스트 작성·자가수정) — 통과는 했으나 자가수정 회수 초과
- **`tests-generated/management-logs.spec.ts` 8.4KB 작성**.
- 최종 실행: `1 passed (13.5s)`.
- 자가수정 6회 발생 (PROJECT.md 한도 3회 초과):
  1. 로그인 버튼이 데코 SVG에 가려진 케이스 → `force: true`로 우회 시도 (실패)
  2. password 필드에서 Enter로 폼 submit (부분 통과)
  3. stage2가 가정한 "초기 0건"이 무효 (auto-load) → 단언 완화
  4. "메시지 + MASTER-T1" 키워드 매칭 0 → "코드명 + KPI_DATA_MISSING"으로 변경
  5. "로그 저장"이 직접 download 아닌 "파일 내보내기" 모달 흐름 — 단계 보강
  6. download 이벤트 미발화 케이스 → 모달 close OR download 이벤트 둘 중 하나로 통과 처리
- 에이전트 자체 분석: **같은 결함 반복이 아니라 새로운 결함 단계적 발견**.
  같은 액션 5회 이상 반복은 한 번도 발생하지 않음 (가드레일 준수).

## 3. 1주차 핵심 연구 질문 — 최종 답

### Q1. 단일 에이전트가 의미 있는 E2E 테스트를 자율 생성할 수 있는가?
✅ **할 수 있다 — 단, 가드레일 한도(자가수정 3회)는 못 지킨다.**
  - 통과한 테스트는 단순 스모크가 아니라 검색·필터 3종 팝오버·페이지네이션·
    CSV 다운로드 모달까지 포함한 8.4KB짜리 의미 있는 시나리오.
  - 그러나 stage2의 시나리오 가정과 stage3 작성 시 실제 페이지 동작
    사이의 격차를 stage3에서만 메우려다 보니 6회까지 보정이 필요했다.

### Q2. 어느 단계에서 토큰/시간 병목이 발생하는가?

| 단계 | 시간 비중 | 비용 비중 | turns |
|---|---|---|---|
| stage1 | 33.8% (345s/1022s) | 34.7% ($2.54/$7.31) | 54 |
| stage2 | 4.0% | 2.2% | 1 |
| stage3 | 62.2% (636s/1022s) | 63.2% ($4.62/$7.31) | 61 |

→ **#2 baseline은 stage1 단일 병목이었지만, #3은 stage3 자가수정 루프가
   가장 무겁다.** 그 원인은 stage2가 사전 검증 없이 시나리오를 만들어
   stage3가 실측으로 보정해야 하는 단계가 많기 때문.

### Q3. 어느 단계가 Opus 필요, 어느 단계는 Sonnet 가능?
실측 데이터 기반 잠정 결론:
- **stage2 (우선순위 판단)** — 1턴, 40초, $0.16. 정확한 후보 비교 + 탈락
  사유 4개. **Sonnet으로 충분 가능성 매우 높음.** 2주차에 분리 후 비교.
- **stage1 (탐색·매핑)** — 54턴 도구 호출, 다단계 컨텍스트 추적, 표 16행
  품질. **Opus 유지.** Sonnet 분리는 정보 누락 위험.
- **stage3 (테스트 작성·자가수정)** — 61턴, 자가수정 6회. selector 추론,
  실패 stack trace 해석, Playwright DSL 정확성 모두 필요. **Opus 유지.**
  단, "Test-Runner" 부분(실행 + 결과 해석)은 Sonnet에 위임 가능 가설.

### Q4. 어떤 역할을 분리하면 2주차 멀티 에이전트가 가장 효과적일까?
실측이 가리키는 분리 우선순위:

1. **stage2 → "Coverage Planner" 강화** (Sonnet)
   현재 stage2가 stage1 마크다운만 보고 시나리오 작성 → stage3가 6회
   보정. Coverage Planner가 사전에 (a) 페이지 진입 직후 자동 로드,
   (b) 인터랙션의 모달/팝오버 단계, (c) 검색 키워드의 실제 매칭 가능성
   을 한 번 더 검증해 stage3의 자가수정을 줄인다.

2. **stage3 → "Coder + Test-Runner" 분리** (Opus + Sonnet)
   - Coder (Opus): selector·DSL·assertion 작성
   - Test-Runner (Sonnet): `npx playwright test` 실행 + stderr 해석 +
     변경 요지를 Coder에 피드백
   책임이 분리되면 자가수정 루프의 결정 품질과 비용이 동시에 개선된다.

3. **stage1 → "Explorer + Recorder" 분리** (Opus + Opus)
   탐색 중간에 부분 산출물을 강제로 영속화해 결함 #2(빈 산출물)가
   구조적으로 사라진다. (코드 측 fallback이 이미 있어 우선순위 낮음.)

## 4. PROJECT.md 한도 위반 항목과 해석

| 항목 | 한도 | 실측 | 해석 |
|---|---|---|---|
| stage3 자가수정 회수 | 3회 | 6회 | 한도 초과. 단, "같은 결함 반복" 아닌 "새로운 결함 단계적 발견". 2주차 Coverage Planner로 사전 해소 가능. |
| 단계당 토큰 상한 | 50k/15k/100k | 3,827 / 6 / 2,225 | 한참 미달. input+output 정의의 구조적 특성 (cache가 비용 대부분). |
| 동일 액션 5회 반복 | 5회 | 0회 발생 | 준수. |
| 도구 권한 거부 | (수정 후 0) | 0 | 준수. |

## 5. 산출물 (영속화 위치)

- `runs/2026-05-01T06-18-12-071Z/decisions.jsonl` — 단계별 start/end + finalTextSource·finalTextChars
- `runs/2026-05-01T06-18-12-071Z/report.json` — 24KB, 단계별 usage/cost/numTurns/permissionDenials/finalTextSource
- `runs/2026-05-01T06-18-12-071Z/stage{1,2,3}/output.md` — 단계별 마크다운 산출물
- `runs/2026-05-01T06-18-12-071Z/stage{1,2,3}/messages.jsonl` — 340 메시지(=raw SDK trace)
- `tests-generated/management-logs.spec.ts` — **에이전트가 자율 작성하고 통과시킨 첫 e2e 테스트**

## 6. Step 4(리포트 자동 생성) 진입을 위한 입력 데이터 충분성

✅ Step 4가 자동 합성해야 할 마크다운의 모든 데이터가 준비됨:
- 기본 지표: token/cost/duration/denials/numTurns (report.json)
- 추가 지표: 단계별 비중 (계산 가능), finalTextSource (디버깅 단서),
  자가수정 회수 (stage3 output.md 파싱 또는 messages.jsonl)
- 의사결정 로그: decisions.jsonl
- 생성된 테스트 코드 링크: report.json의 outputPath + tests-generated/

→ 다음 단계: Step 4 (리포트 자동 생성기) 작성.
