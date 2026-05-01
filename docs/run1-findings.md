# 1주차 1차 라이브 실험 결과 정리 (baseline)

본 문서는 **Step 1~3 골격 완성 직후 첫 라이브 실행 2회분**을 그대로
정리한 것이다. 이 시점의 코드는 아직 (a) `finalText` fallback 누적,
(b) raw 메시지 영속화, (c) stage1 system prompt의 "마지막 텍스트 산출물
명시" 가 적용되지 않은 상태다 — 그 결과로 드러난 병목과 결함이
2차 사이클(수정 후 재실행)의 입력이 된다.

---

## 1. 라이브 실행 #1 — 권한 거부 baseline
- 실행 시각: 2026-05-01 05:44 UTC
- runId: `runs/2026-05-01T05-44-17-832Z/`

### 측정값

| Stage | status | turns | input+output 토큰 | cost (USD) | duration |
|---|---|---|---|---|---|
| stage1-mapping | completed | 18 | 1,118 | $0.6979 | 61.4s |
| stage2-prioritize | completed | 1 | 10 | $0.1250 | 30.2s |
| stage3-test | completed | 15 | 276 | $0.5141 | 133.0s |
| **합계** |  |  | **1,404** | **$1.337** | **224.6s** |

총 캐시: creation 206,275 / read 1,287,574

### 무엇이 일어났는가
- SDK 권한 모드가 default라 모든 도구 호출이 자동 거부됨.
- 에이전트는 가드레일(애매하면 실행하지 말 것)을 준수하여 작업을 보류하고
  사람에게 권한 허용을 요청하는 메시지로 종료.
- 실제 탐색·테스트 작성 없음. 그러나 비용은 $1.34 발생 (system prompt 토큰).

### 도출된 1주차 발견
- **결함 #1**: `permissionMode` 미설정 시 자율 실행이 불가능.
  1주차 로컬 가드레일이 자유 허용을 명시하므로 SDK 권한도 bypass되어야 함.
  → 코드 수정으로 즉시 해소 (`permissionMode: 'bypassPermissions'`).

---

## 2. 라이브 실행 #2 — 권한 풀린 후 baseline
- 실행 시각: 2026-05-01 05:58 UTC
- runId: `runs/2026-05-01T05-58-15-033Z/`

### 측정값

| Stage | status | turns | input+output 토큰 | cost (USD) | duration | denials |
|---|---|---|---|---|---|---|
| stage1-mapping | completed | 40 | 973 | $1.4481 | 239.5s | 0 |
| stage2-prioritize | completed | 1 | 26 | $0.1033 | 24.7s | 0 |
| stage3-test | completed | 9 | 152 | $0.2613 | 70.2s | 0 |
| **합계** |  |  | **1,151** | **$1.813** | **334.5s** | **0** |

총 캐시: creation 166,939 / read 3,519,922

### 무엇이 일어났는가
- 모든 도구 권한 통과 (denials=0). stage1이 실제로 40턴 동안 Playwright
  MCP 호출을 수행 (탐색·스냅샷·네트워크 관찰 등).
- **그러나 stage1의 `output.md`는 빈 파일.** stage2/3는 "1단계 산출물이
  비어 있다"는 보류 보고를 그대로 산출.
- stage3는 보류 상태에서도 도메인 단서(앱 이름 = "실시간 여객 혼잡도
  분석시스템", 로그인 폼 구조, 콘솔 단서 등)를 자율적으로 모아서
  로그인 스모크 fallback 시나리오를 제시.

### 도출된 1주차 발견
- **결함 #2**: stage1이 도구 호출만 40턴 한 뒤 마지막 텍스트 메시지 없이
  종료할 수 있다. 현재 코드는 `SDKResultMessage.subtype === 'success'`
  AND `result` 필드가 채워졌을 때만 `finalText`를 캡처. → fallback 필요.
- **결함 #3**: raw SDK 메시지를 영속화하지 않아, 빈 산출물의 원인을 사후
  추적할 수 없음. → `runs/<id>/<stage>/messages.jsonl` 영속화 필요.
- **결함 #4**: stage1 system prompt가 "마지막 메시지에 마크다운 산출물
  전문 출력"을 명시하지 않아, 모델이 도구 결과만 남기고 끝내는 여지가 있음.
  → 프롬프트 본문 보강 필요.

---

## 3. 1주차 핵심 연구 질문에 대한 잠정 답 (1·2차 실행 합산)

### Q. 단일 에이전트가 통제된 환경에서 의미 있는 E2E 테스트를 자율 생성할 수 있는가?
- **현 시점 기준: No (코드 결함 #2~#4 때문).** stage1 산출물이 보존되지
  않으면 후속 단계가 가치 있는 테스트로 이어지지 못한다.
- 단, 권한과 산출물 보존만 해결되면 가능성 자체는 보임 — stage3가
  입력이 비었음에도 자율적으로 "최소 가치를 보존하는 fallback"
  (로그인 스모크)을 제안한 점에서 추론·계획 능력은 충분.

### Q. 어느 단계에서 토큰/시간 병목이 발생하는가?

| 단계 | 시간 비중 | 비용 비중 | 캐시 비중 (read) | 메모 |
|---|---|---|---|---|
| stage1 | 71.6% (239s/334s) | 79.9% ($1.45/$1.81) | ~93% (3.27M/3.52M) | 단연 가장 무거움 |
| stage2 | 7.4% | 5.7% | ~3% | 도구 호출 0회, 추론만 |
| stage3 | 21.0% | 14.4% | ~4% | 작성 시도 + 보류 |

→ **병목은 명백히 stage1 (탐색·매핑)** 이다. 단계 토큰 상한(50k) 안에
  들어왔지만 turns=40, duration=4분, cost=$1.45 가 stage2의 14배,
  stage3의 5.5배. 이 단계의 도구 호출(브라우저 스냅샷)이 cache 토큰을
  대량 생산.

### Q. 어느 단계가 Opus의 추론 능력이 꼭 필요하고, 어느 단계는 Sonnet으로 충분할까?
- 1·2차 데이터만으로는 단정 못 하지만 **잠정 가설**:
  - stage2 (우선순위 판단): 1턴, 도구 호출 0회, 짧은 추론 — **Sonnet 적합**
  - stage1 (탐색·매핑): 40턴, 다단계 도구 호출과 큰 컨텍스트 추적 — **Opus 유지**
  - stage3 (테스트 작성·자가수정): 코드 정확성과 selector 추론 — **Opus 권장
    (단, "한 번 통과하는 테스트만 만들면 된다" 단순 케이스는 Sonnet 가능)**
- 2주차에는 stage2를 Sonnet으로 분리해 Opus-only baseline 대비 비용/품질
  변화를 측정할 수 있다.

### Q. 어떤 역할을 분리하면 2주차 멀티 에이전트 구성이 가장 효과적일까?
- 가장 무거운 stage1 안에서도 역할이 섞여 있다:
  (a) 탐색 행동 결정 (어떤 페이지를 어떤 순서로 볼까)
  (b) 관찰 (DOM/네트워크/스크린샷 해석)
  (c) 정리 (마크다운 표 작성)
- 2주차에 stage1을 "Explorer + Recorder" 두 에이전트로 분리하면, 탐색
  중간에 부분 산출물을 강제로 영속화해 결함 #2가 구조적으로 사라진다.
- 또한 stage3 자가-수정 루프는 "Coder ↔ Test-Runner" 분리로 명확히
  나눌 수 있다 (코드 작성 책임 vs 실행/실패 분석 책임).

---

## 4. 정량 비교 (#1 vs #2)

| 지표 | #1 (권한 거부) | #2 (권한 OK, 빈 산출물) | 변화 |
|---|---|---|---|
| total cost | $1.34 | $1.81 | +35% |
| total duration | 224.6s | 334.5s | +49% |
| stage1 turns | 18 | 40 | +122% |
| stage1 cache_read | (포함됨) | 3,519,922 | 거의 모두 stage1발 |
| 산출물 가치 | 권한 요청 메시지 | 빈 파일 + 보류 보고 | 둘 다 사용 불가 |

→ 권한이 풀려도 산출물이 보존되지 않으면 비용만 늘어난다는 명확한 신호.
   결함 #2~#4 수정이 baseline 확보의 전제조건.

---

## 5. 적용된 수정 (Run #3 직전)

| # | 결함 | 수정 위치 | 동작 |
|---|---|---|---|
| 2 | stage1 finalText 누락 | `src/sdk/client.ts` | 스트림 도중 assistant 메시지의 모든 text content block을 누적해, `SDKResultMessage.result`가 비어 있으면 누적분을 finalText로 사용한다. 어느 경로로 채워졌는지 `finalTextSource: 'result' \| 'fallback-assistant-text' \| 'sdk-error' \| 'none'`로 표시. |
| 3 | raw 메시지 미영속화 | `src/sdk/client.ts` + `src/stages/_helpers.ts` | 단계마다 `runs/<id>/<stage>/messages.jsonl`에 모든 SDKMessage를 한 줄씩 JSON으로 저장. 사후 재현·분석 + Step 4 리포트 생성 입력으로 사용. |
| 4 | stage1 프롬프트의 텍스트 출력 미명시 | `src/prompts/stage1.system.md` | 산출물 형식 절 위에 "도구 호출이 끝나면 마지막 메시지에 마크다운 전문을 반드시 텍스트로 출력하라"는 출력 규칙 절을 추가. 1차 라이브에서 실제로 발생한 결함을 명시 인용. |

### 변경된 데이터 형상
- `StageResult`에 `finalTextSource`, `costUsd`, `numTurns`, `permissionDenials` 노출.
- `decisions.jsonl`의 `end` 엔트리에 `finalTextSource`, `finalTextChars` 추가.
- 단계 디렉토리 산출물: `output.md` (기존), **`messages.jsonl` (신규)**.

### Run #3 검증 가설
- stage1 산출물 마크다운이 비어있지 않다 (chars > 0).
- 산출물 출처가 `result` 또는 `fallback-assistant-text` 둘 중 하나로 명확히 기록된다.
- 빈 산출물이 다시 발생하면 `messages.jsonl`로 원인을 사후 추적 가능하다.
