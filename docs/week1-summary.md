# 1주차 종합 회고

PROJECT.md 1주차 목표:
> 단일 에이전트(Opus 4.7)가 로그인 + 핵심 기능 1개에 대한 Playwright E2E
> 테스트를 자율 생성하고 실행할 수 있게 한다. 동시에 2주차 멀티 에이전트
> + 모델 분리 도입의 근거가 될 병목 데이터를 수집한다.

**결과: 달성. 그리고 사람 게이트·시드 환경변수·misclassification 정정
사이클 같은 추가 메커니즘이 baseline 일부로 합쳐졌다.**

---

## 1. 8회 라이브 정량 정리

| Run | 변경 | 자가수정 | 통과 | 시간 | input+output | agreement |
|---|---|---|---|---|---|---|
| #3 | 첫 baseline | 6 (한도 위반) | ✅ | 17m 2s | 6,058 | n/a |
| #4 | + stage1 prompt 보강 | 3 (한도 정확) | ✅ | 21m 36s | 9,400 | n/a |
| #5 | + stage2 → Sonnet 4.6 | 1 | ✅ | 12m 11s | 5,559 | n/a |
| #6 | + top-3 후보 + 사람 게이트 | 1 | ✅ | 14m 17s | 5,405 | **true** |
| #7 (stage1+2) | + WS 분류 prompt 보강 + 시드 환경변수 | n/a | n/a | 11m 13s | 5,346 | n/a |
| #7-D | replay (custom) | 1 | ✅ | +11m | +5,121 | false |
| #8 (stage1+2) | (변경 없음, 데이터 누적용) | n/a | n/a | 11m 58s | 5,777 | n/a |
| #8-B | admin-registration (--pick=3) | **3 (한도 정확)** | ✅ | +8m 12s | +2,025 | false |

**총 통과율: 6/6 = 100%** (실측된 stage3 모두 통과). 자가수정 평균 ~2.4회 (한도 안).

---

## 2. 단계별 비용·시간 추세

stage1 (탐색·매핑):

| Run | turns | 시간 | $ (Console eq.) |
|---|---|---|---|
| #3 | 54 | 5m 45s | $2.54 |
| #4 | 84 | 9m 22s | $4.93 |  ← prompt 보강으로 일시 무거워짐
| #5 | 72 | 7m 37s | $4.28 |
| #6 | 78 | 9m 22s | $4.93 |
| #7 | **70** | **7m 49s** | **$3.69** | ← WS 룰 명확화로 -25%
| #8 | 79 | 9m 59s | $4.58 |

stage2 (우선순위 판단):
- 모든 라이브 1턴/추론only 유지
- Opus → Sonnet (#5+) 전환으로 단가 약 1/5

stage3 (테스트 작성·자가수정):

| Run | turns | 자가수정 | 시간 |
|---|---|---|---|
| #3 | 61 | 6 | 10m 36s |
| #4 | 58 | 3 | 12m 14s |
| #5 | 14 | 1 | 3m 26s | ← stage2 Sonnet 효과
| #6 | **2** | 1 | 3m 3s | ← 사람 게이트 효과 (시나리오 명시 주입)
| #7-D | 57 | 1 | 11m | (custom replay 새 영역)
| #8-B | 41 | 3 | 8m 12s | (admin CRUD 새 영역)

**stage3가 가장 큰 변동성**. 명시적 시나리오·기존 spec 누적 효과로 turns 가 7배까지 변함.

---

## 3. 핵심 발견 (정성)

### 3.1 단일 에이전트는 자율 e2e 테스트 자율 생성 가능
조건:
- stage1 prompt 에 "사전 검증 메모" 강제
- stage2 Sonnet (1턴/추론only) + 사람 게이트로 시나리오 명시 주입
- stage3 자가수정 한도 3회 + spec 영속화

### 3.2 사람 게이트는 비용 0의 큰 효과
사람이 1순위 그대로 채택해도 (`pnpm continue <runId>` 인자 없음) stage3
turns 가 14 → 2로 감소. 이유: 사람이 결정한 시나리오를 stage3 prompt
첫머리에 명시 주입 → stage3 가 시나리오를 다시 해석할 필요 없음.

### 3.3 시드 환경변수 → 에이전트 자율 활용
`SEED_REPLAY_DATE/START_TIME/END_TIME` 추가 후, 에이전트가 spec 코드에
`process.env.SEED_REPLAY_DATE` 등을 그대로 박았다. 사람 지식 → 환경변수
→ prompt → spec 의 종단간 흐름 검증.

### 3.4 사용자 명세 부정확해도 에이전트가 도구 관찰로 적응
run #7-D 에서:
- 사용자 명세: "인풋 3개" → 실제 datetime picker 다이얼로그
- 사용자 명세: "재생 버튼" → 실제 "라이브 뷰 보기" 가 트리거
- 사용자 명세: "캔버스 좌표 점" → 실제 SVG `<circle>`

에이전트가 의도 보존하면서 적응 + 보고서에 적응 내역 명시.

### 3.5 misclassification 정정 사이클
run #6 까지 stage1 이 5개 라우트를 WS 의존으로 분류, 이 중 2개 (`/monitoring/summary`,
`/dashboard/replay`) 가 사용자 검증으로 오분류 확인. prompt 에 4-원칙
(데이터 소스·UI 컴포넌트 분리·라우트 트리 휴리스틱 금지·관찰 도구
명시) 추가 → run #7 에서 100% 정확. **에이전트가 직접 자기 이전
오분류를 인용하며 정정**.

### 3.6 stage1 prompt 명확화 → stage1 자체 비용 감소
WS 분류 룰을 명시하니 stage1 turns 78→70, 비용 -25%. 추측 시간 감소.

---

## 4. PROJECT.md 측정 지표 결과

### 기본 지표
- ✅ 단계별 토큰 (input/output/cache 분리) — 모든 라이브 캡처
- ✅ 발견 기능 수 (일반/관리자) — Step 4 리포트 §2.3
- ✅ 자가수정 횟수 — Step 4 리포트 §2.5
- ✅ 단계별 시간 — report.json + console 출력
- ✅ 의사결정 로그 — `runs/<id>/decisions.jsonl`

### 2주차 설계용 추가 지표
- ✅ 단계별 토큰 비중 — Step 4 리포트 §3.1
- ✅ 단계별 추론 난이도 (turns 기반 휴리스틱) — §3.2
- ✅ 역할 섞임 신호 — §3.3
- ✅ 자가수정 실패 원인 분류 (휴리스틱) — §3.4
- ✅ 에이전트 1순위 vs 사람 최종 선택 일치 여부 + 코멘트 — §2.4 + 누적 통계 §2.4.b

---

## 5. 자율 작성 spec 5개 (3개 영역)

```
tests-generated/
├── management-logs.spec.ts                 (15KB) — 검색·필터·CSV 저장 (run #3 첫 통과)
├── management-logs-export.spec.ts          (11KB) — 다운로드 모달 흐름
├── management-logs-search-filter.spec.ts   (16KB) — 10단계 종합
├── dashboard-replay.spec.ts                (13KB) — 좌표 재생 + datetime picker
└── management-admin-registration.spec.ts   (12KB) — 등록·검색·수정·삭제 CRUD
```

총 67KB, 모두 통과.

---

## 6. 누적 데이터셋

- `data/experiment-history.jsonl` — 3 라인 (라이브 #6, #7-D, #8-B의 사람 결정)
- `runs/<8개 runId>/` — 8회 라이브의 raw 메시지·산출물·report.json
- `tests-generated/` — 5개 spec
- `docs/run{3..8}-*.md` — 라이브별 비교 문서

---

## 7. 2주차 진입 체크리스트

- [x] 1주차 baseline 통과 (자가수정 한도 안)
- [x] 측정 지표 모두 캡처
- [x] 자율 spec 누적 (3개 영역)
- [x] 사람 게이트 + 시드 환경변수 + misclassification 정정 사이클 확립
- [x] `docs/week2-plan.md` 작성 — P1/P2/P3 우선순위 + 호환성 + 실험 프로토콜
- [x] stage1 prompt 임시 파일 저장 금지 가이드 추가
- [ ] 2주차 진입 시 baseline 재현 라이브 1회 (`AGENT_MODE=single` 같은 컨트롤)
- [ ] P1 (Coverage Planner — Sonnet) 우선 도입 검토 vs P3 (Explorer/Recorder)
  > 1주차 데이터 기반: 자가수정이 이미 한도 안이라 P1 의 "자가수정 줄이기"
  > 명분 약함. P3 의 "stage1 토큰 절감" 명분도 prompt 명확화로 -25% 달성됨.
  > 2주차에는 단순한 escalation 로 충분할 가능성. 시작 시 재평가.

---

## 8. 1주차 핵심 결론
**단일 에이전트 자율 e2e 테스트 생성은 다음 5가지가 모두 갖춰졌을 때
가장 안정적이다:**

1. stage1 prompt 의 "페이지별 시나리오 사전 검증 메모" 절
2. stage2 Sonnet + top-3 + 신뢰도/근거 구조화
3. 사람 게이트 (zero-friction default + 의도적 disagreement 가능)
4. 사용자 시드 환경변수 (`.env` 통해 spec 까지 흐름)
5. misclassification 누적 → prompt 보강 사이클

**2주차의 멀티 에이전트 분리 우선순위는 1주차 baseline 효율 덕에
원래 계획보다 작아질 가능성이 크다.** 2주차 진입 시 baseline 재현으로
재평가 후 결정.
