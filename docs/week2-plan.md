# 2주차 설계 — 멀티 에이전트 + 모델 분리 (로컬)

> 본 문서는 1주차 baseline(`docs/run3-results.md`, `reports/<runId>.md`)에서
> **실측으로 도출된 우선순위**를 기반으로 작성된 2주차 설계안이다.
> 코드 구현은 2주차 시작 시 진행한다 (PROJECT.md "1주차에는 미리 멀티/분리로
> 만들지 마라" 룰 준수).

## 1. 2주차 목표 (재확인)
PROJECT.md: "1주차 baseline 대비 멀티 에이전트와 모델 분리의 효과를
**동시에 측정**한다." 측정 대상은 다음 3가지:

1. **자가수정 회수**가 PROJECT.md 한도(3회)를 만족하는가?
2. **단계별 비용/시간**이 1주차 대비 어떻게 바뀌는가?
3. **테스트 통과율**이 유지 또는 향상되는가?

## 2. 1주차 baseline 핵심 측정값 (비교 기준)

| 지표 | 값 |
|---|---|
| 총 비용 | $7.31 |
| 총 시간 | 17m 2s |
| 자가수정 회수 | 6 (한도 3 초과) |
| 자가수정 원인 분포 | scenario-assumption 3, exploration-gap 2, unclassified 1 |
| 테스트 통과 | 1 passed |
| stage1 비중 | 34.7% cost / 33.8% time / 54 turns / heavy |
| stage2 비중 | 2.2% cost / 4.0% time / 1 turn / trivial |
| stage3 비중 | 63.2% cost / 62.2% time / 61 turns / heavy |

## 3. 도입 우선순위 (자동 도출 + 정성 보완)

### P1. stage2 → "Coverage Planner" 강화 (Sonnet)

#### 진단
- 1주차 stage2는 1턴/$0.16 — Opus가 아까운 단계.
- 동시에 stage3 자가수정 6회의 6/6이 stage2의 격차에서 발생.
  (scenario-assumption 3 + exploration-gap 2가 모두 stage1 메타데이터
  부족이거나 stage2가 시나리오를 만들 때 검증을 안 했기 때문)

#### 설계
- 새 에이전트 `coverage-planner`. 모델: `claude-sonnet-4-6`.
- 입력: stage1 마크다운 + 최종 후보 라우트.
- 책임:
  1. 후보 라우트의 자동 로드 동작 직접 1회 검증 (페이지 진입 + 첫 데이터
     렌더링까지)
  2. 핵심 인터랙션의 모달/팝오버 단계 직접 1회 시뮬 (열기/닫기)
  3. 검색·필터 키워드의 실측 매칭 가능 후보 1개 확보
- 산출물 형식: stage1의 "페이지별 시나리오 사전 검증 메모" 표를 한 라우트
  분량으로 채운 것 + stage2 시나리오 본문.
- 토큰 한도: 25k (1주차 stage2 한도 15k에서 +10k. 도구 호출 추가분).

#### 측정 가설
- 자가수정 회수 6 → ≤3.
- stage3 비용 비중 63% → ≤45% (stage2가 약 $0.5 더 쓰지만 stage3가 그
  이상으로 줄어든다는 가설).
- 총 비용은 비슷하거나 감소 (Sonnet으로 인한 단가 하락도 더해짐).

### P2. stage3 → "Coder" + "Test-Runner" 분리 (Opus + Sonnet)

#### 진단
- stage3 turns=61 / $4.62. 단일 에이전트가 (a) 코드 작성, (b) 테스트
  실행, (c) stderr 분석, (d) 보정 결정 4가지를 모두 처리.
- 1주차 자가수정 표 기록을 보면 (b)(c)는 결정론적 파싱·분류에 가까움
  (Sonnet 충분), (a)(d)는 selector 추론·DSL 정확성 필요 (Opus 유지).

#### 설계
- 두 에이전트 모드.
  - `coder` (Opus): spec 작성. coverage-planner 산출물 + 마지막 실행 결과 +
    이전 변경 요지를 입력으로 받는다.
  - `test-runner` (Sonnet): `npx playwright test ...` 실행, 실패 케이스
    분류(`exploration-gap` / `scenario-assumption` / `code-bug` /
    `flaky`), 다음 사이클의 변경 요지를 1~3 줄로 작성.
- 자가수정 루프는 `coder ↔ test-runner` 핸드오프로 진행. 한도 3회 유지.
- 토큰 한도 분배(잠정): coder 75k + test-runner 30k = 105k (1주차 stage3
  100k 대비 +5k).

#### 측정 가설
- 자가수정 회수가 한도 안에 들어옴 (coverage-planner와 합산 효과).
- stage3 총 비용 $4.62 → ≤$3.0 (Sonnet이 1/N 가격으로 (b)(c) 대체).
- "자가수정 실패 원인 분류"가 휴리스틱 파서 대신 test-runner의 직접
  라벨링으로 정확도 향상.

### P3. stage1 → "Explorer" + "Recorder" 분리 (Opus + Opus, 후순위)

#### 진단
- stage1 turns=54 (heavy). 단, 1주차 베이스에서 산출물은 결국 충실했음
  (코드측 fallback + prompt 강화로 빈 산출물은 이미 해소).
- 분리 시 부분 산출물 영속화로 robustness↑, 토큰은 변화 가능성 양면.

#### 설계 (스케치)
- `explorer` (Opus): 다음 방문 라우트 결정. 도구 호출은 하지 않고 다음
  step만 산출.
- `recorder` (Opus): explorer가 지시한 라우트로 이동·관찰·매핑 표 한
  행 작성·영속화.
- 한 라운드 = `explorer → recorder → ...`. 같은 라우트 재방문 5회 가드레일은
  recorder 단에서 카운팅.

#### 도입 시점
- P1·P2 도입으로 baseline이 안정된 후. 즉, 2주차 후반 또는 3주차 진입 직전.
- P1·P2의 효과만으로 자가수정 한도 안에 들어오면 P3는 보류.

## 4. 호환성: 단일 에이전트 ↔ 멀티 에이전트 모드 공존

PROJECT.md "단계별 핸들러를 모듈화해서 나중에 에이전트별로 분리 가능하게"
요구를 반영해, 다음 형태를 유지한다:

### 4.1 stage 모듈 인터페이스 보존
현재 `src/stages/{stage1,stage2,stage3}.ts` 의 `(ctx) => StageResult`
시그니처는 그대로. 멀티 에이전트 모드는 각 stage 안에서 내부적으로
여러 에이전트 호출 + 결과 합성을 책임진다. orchestrator 입장에선
어떤 모드든 같은 입출력.

### 4.2 모드 토글
`src/stages/config.ts` 에 `agentMode: 'single' | 'multi'` 필드 추가.
1주차는 `'single'`, 2주차는 `'multi'`. 환경변수 `AGENT_MODE`로 override
가능 (실험 비교용).

### 4.3 측정값 동등성 보장
멀티 에이전트의 `usage`/`costUsd`/`numTurns`는 내부 호출 전체의 합산을
StageResult로 노출. 즉 Step 4 리포트 generator는 변경 없이 재사용 가능.

## 5. 실험 설계 (1주차 vs 2주차 비교 프로토콜)

### 5.1 통제 조건
- 동일 대상 웹앱, 동일 시드(73건 로그), 동일 계정.
- 동일 stage1 prompt (1주차 마지막 버전, "사전 검증 메모" 절 포함).
- 같은 시간대(부하 차이 최소) 또는 워밍업 1회 후 측정.

### 5.2 변수
- 모드 토글: `AGENT_MODE=single` (1주차 baseline 재현) vs
  `AGENT_MODE=multi` (2주차).
- 모델 분리: stage2 Sonnet, stage3 test-runner Sonnet. (1주차는 모두 Opus.)

### 5.3 측정 항목 (Step 4 리포트가 자동 캡처)
- 자가수정 회수, 단계별 비용/시간, 통과 여부, 토큰 상한 도달 여부,
  단계별 추론 weight, 역할 섞임 신호.
- 추가 (2주차 신규): coverage-planner의 사전검증 hit/miss 회수,
  test-runner의 실패 분류 정확도(자가 라벨 vs 사람 라벨 spot-check).

### 5.4 종료 조건
- A안: 동일 작업 3회 반복하여 자가수정 회수 평균 ≤3 → 합격.
- B안: 한 번이라도 자가수정 ≤3 + 통과 → 조건부 합격, 추가 반복으로
  안정성 확인.

## 6. 멀티 에이전트 도입 위험과 완화책

| 위험 | 완화책 |
|---|---|
| 핸드오프에서 컨텍스트 누락 | 각 에이전트 입력에 prior stage의 `output.md` 전체를 포함. messages.jsonl도 옵션 입력. |
| Sonnet이 우선순위 판단을 더 단순하게 함 | coverage-planner 시스템 프롬프트에 "탈락 후보 N개와 사유 명기" 강제 (1주차 stage2 산출물 형식 그대로). |
| test-runner가 잘못된 분류로 coder를 misguide | test-runner 산출물에 "분류" + "근거(stderr 발췌)" 두 필드 강제. coder가 의심 시 사람에게 질문. |
| 비용 절감 가설이 깨짐 (오히려 늘어남) | 2주차 1회 실행 후 즉시 §5.3 지표 비교. 가설 거짓이면 Sonnet→Opus 롤백. |

## 7. 비-목표 (2주차에 하지 말 것)

- 웹소켓 의존 라우트 테스트 — 1주차에서 이미 후보 자동 제외됨. 3주차
  대상.
- 스테이징 환경 검증 — 3주차 대상.
- 새 도메인(다른 앱) 적용 — 2주차는 동일 앱에서 multi vs single 비교에만 집중.
- 토큰 캐시 최적화 별도 PR — multi 도입 시 캐시 동작이 자연히 바뀌므로
  관찰만 하고 별도 작업하지 않음.

## 8. 진입 체크리스트 (2주차 첫날에 할 일)

- [ ] 본 문서를 사용자와 다시 검토하고 P1·P2 진입을 합의.
- [ ] `AGENT_MODE=single`로 라이브 1회 실행 → 1주차 baseline 재현 확인.
- [ ] `coverage-planner` 에이전트 + Sonnet 모델 ID 확정.
- [ ] `src/stages/config.ts`에 agentMode 필드 + multi 분기 골격.
- [ ] coverage-planner system/user prompt 초안 작성.
- [ ] dry-run으로 multi 분기 파이프라인 검증.
- [ ] live 실행 후 Step 4 리포트로 1주차 vs 2주차 비교.
