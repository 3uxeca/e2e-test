# 1주차 라이브 #6 — top-3 후보 + 사람 게이트 (첫 agreement=true)

`docs/run5-results.md` (Sonnet stage2 검증) 다음, **stage2 prompt 를
top-3 + 신뢰도 + 추론 근거로 확장**하고 **사람 검토 게이트**를 도입한
첫 라이브.

- 실행 시각: 2026-05-05 06:58 UTC (stage1+2), 07:23 UTC (continue)
- runId: `runs/2026-05-05T06-58-34-589Z/`
- 사람 결정: `pnpm continue <runId>` (인자 없음 = 1순위 그대로 채택)

## 1. 종합 비교 (#3 → #6)

| 지표 | #3 baseline | #4 (prompt 보강) | #5 (Sonnet stage2) | #6 (top3 + 사람 게이트) |
|---|---|---|---|---|
| 자가수정 | 6 (한도 위반) | 3 (한도 정확) | 1 | **1** |
| 통과 | ✅ | ✅ | ✅ | ✅ |
| 총 시간 | 17m 2s | 21m 36s | 12m 11s | **14m 17s** |
| input+output | 6,058 | 9,400 | 5,559 | **5,405** |
| stage3 turns | 61 | 58 | 14 | **2** |
| stage3 cost | $4.62 | $3.83 | $0.71 | $1.05 |
| stage1 turns | 54 | 84 | 72 | **78** |
| stage2 모델 | Opus | Opus | Sonnet | Sonnet |
| stage2 turns | 1 | 1 | 1 | 1 |
| **agreement** | (n/a) | (n/a) | (n/a) | **true** (1/1) |

## 2. 핵심 발견

### stage3 가 2턴만에 통과
사람 게이트가 stage2 의 15단계 시나리오를 명시적으로 stage3 user prompt
첫머리에 주입한 결과, stage3 가 시나리오를 다시 해석할 필요 없이 그대로
코드화 → 1회 작성 + 1회 실행으로 통과.

자율 모드(#5)에선 stage3 가 stage2 산출물을 직접 읽고 해석하느라 14턴.
**같은 정보를 더 명확한 컨텍스트로 주면 turns 가 7배 감소**.

### tests-generated/ 누적 패턴
- run #3: `management-logs.spec.ts` (15KB)
- run #5: `management-logs-export.spec.ts` (11KB)
- **run #6: `management-logs-search-filter.spec.ts` (16KB) — 신규**

stage3 가 기존 spec 2개를 참고 입력으로 받아 새 spec 작성. 자율
e2e 테스트 스위트가 자연스럽게 누적되는 패턴 확인.

### 누적 agreement 통계
- 1회 라이브 / 1회 일치 = 100%. 통계적 의미는 약함 (n=1).
- 단 PROJECT.md 측정 지표("에이전트 1순위 vs 사람 최종 선택 일치 여부")
  의 첫 데이터 포인트를 확보. 후속 라이브에서 어긋남이 발생하면 그때
  부터 패턴 식별 가능.

### stage1 misclassification 발견 (사용자 확정)
1주차 가드레일에서 후보 자동 제외되던 5개 라우트 중 **2개가 오분류**:
- `/dashboard/replay` — DB 적재 좌표 재생, REST 기반 (WS 아님)
- `/monitoring/summary` — 백그라운드 좌표 위젯이 있을 뿐 핵심 데이터는
  WS 아님

`docs/stage1-misclassifications.md` 에 누적. 2주차 stage1 prompt
보강의 직접 입력.

## 3. 1주차 핵심 연구 질문 — 최종 답

### Q. 단일 에이전트가 의미 있는 E2E 테스트를 자율 생성할 수 있는가?
✅ **가능. PROJECT.md 한도(자가수정 3) 안에서, 사람 게이트 추가만으로
   stage3 가 2턴/light 수준까지 떨어진다.**

### Q. 어디가 다음 개선 대상인가?
- stage1 이 여전히 78턴(heavy) — 비용 비중 80%. P3(Explorer/Recorder
  분리)의 명분이 가장 강해졌다 (단, 이미 Run #6 로 baseline 이 충분히
  좋아서 우선순위는 여전히 낮음).
- stage1 의 WS over-flag 정확도. 사용자 검토로 잡힌 2건 외에 추가 오류
  가능성. 2주차 stage1 prompt 의 "데이터 소스 vs UI 컴포넌트 구분" 절
  보강이 필요.

### Q. 2주차 멀티 에이전트 설계는 더 작아져도 되나?
**그렇다.** P1(Coverage Planner)·P2(Coder/Test-Runner) 분리의 명분이
거의 사라졌다. 1주차 baseline (single agent + Sonnet stage2 + top-3
human gate) 이 매우 효율적. 2주차에는:
- (a) P3 (Explorer/Recorder) 분리만 시도하거나
- (b) 멀티 분리는 아예 보류하고 stage1 prompt 보강 + 추가 측정
  안정성 확보로 넘어가거나

선택은 추가 라이브 1~2회의 안정성 데이터를 본 후 결정.

## 4. 다음 액션 후보
1. **stage1 prompt 보강 (WS 분류 정확도)** — 사용자 확정 오류 2건을
   직접 입력으로 사용. 토큰 0 (코드/문서만).
2. **추가 라이브 1회 (안정성 확인)** — Run #6 의 2턴 stage3가 평균인지
   운인지 가린다.
3. **여기서 1주차 baseline 마무리** — 충분한 데이터 누적 (#3~#6 4회).
   2주차 진입 시 재평가.
