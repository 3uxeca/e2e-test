# 1주차 라이브 #8 — B (rank 3 채택: /management/admin-registration CRUD)

`docs/run7-d-results.md` 이후, 새 영역 검증을 위해 사람이 의도적으로
agent rank 1 (`/management/logs`) 을 거부하고 rank 3 (admin-registration)
을 선택한 라이브.

- runId: `runs/2026-05-05T08-30-06-120Z/`
- stage1+2: 2026-05-05 08:30 UTC
- continue (B): 2026-05-05 ~17:42 KST
- 사람 결정: `--pick=3 --comment="B 시나리오: admin-registration CRUD 새 영역 검증..."`

## 1. 결과 종합

| 지표 | 값 |
|---|---|
| 통과 여부 | ✅ **passed** (9.1s, 재실행 7.4s) |
| 자가수정 | **3회 (PROJECT.md 한도 정확히 도달)** |
| 총 시간 | 20m 10s |
| input+output 토큰 | 7,802 |
| stage1 turns | 79 |
| stage1 cost | $4.58 |
| stage2 turns | 1 |
| stage2 cost | $0.15 |
| stage3 turns | 41 |
| stage3 cost | $2.80 |
| **agreement** | **false** (의도적, 누적 1/3 = 33%) |
| 새 spec | `tests-generated/management-admin-registration.spec.ts` (11.7KB) |

## 2. stage2 후보 풀 — D 효과로 변화

| rank | route | confidence | 비교 |
|---|---|---|---|
| 1 | `/management/logs` | 5/5 | 5번째 연속 (#3~#8) |
| 2 | `/dashboard/replay` | 3/5 | **NEW: D 라이브 후 stage1 이 시드 시간대 학습 → 후보 진입** |
| 3 | `/management/admin-registration` | 3/5 | #6의 rank 3 → #7의 rank 2 → 다시 rank 3 |

흥미: agent rationale 에 **"hot-path 25x"** 인용 — Claude Code 내부
메모리 시스템(`.claude/projects/.../memory/`)에 적재된 spec 빈도
정보를 stage2가 활용한 것으로 추정. 메타 인식 깊어짐.

## 3. 사람 결정의 의도적 disagreement

원래 계획: B = `--pick=2` (admin-registration 이 rank 2 였던 #7 기준)
실제 #8 picks: rank 2 자리에 `/dashboard/replay` 가 들어왔는데, 이는
D 라이브에서 이미 검증된 영역. 중복 회피 위해 **`--pick=3`** 으로
admin-registration 채택.

코멘트 명기: "B 시나리오: admin-registration CRUD 새 영역 검증. rank
2 (replay) 는 D 에서 이미 검증해서 중복 회피, rank 3 인 admin-
registration 으로 다양성 확보".

→ disagreement 의 이유가 코멘트에 그대로 누적되어, 향후 분석 시
   "사람이 왜 1순위를 거부했는가" 패턴 추출 가능.

## 4. 자가수정 3회 패턴 — 같은 결함의 단계적 진단

테이블에 동일 데이터를 가진 **2개의 tbody** (반응형 변종) 가 있다는
사실을 stage1 이 미리 잡지 못해 stage3 가 실측으로 발견.

| 회차 | 시도 | 결과 | 분류 |
|---|---|---|---|
| 1 | `dataTbody = page.locator('tbody').last()` | fail — hidden tbody 잡힘 | scenario-assumption |
| 2 | `setViewportSize({1920, 1080})` 추가 (viewport-based 라 가정) | fail — 반응형 hidden 은 viewport 무관 | unclassified |
| 3 | `page.locator('tbody').filter({ visible: true }).first()` | **passed** | unclassified |

자가수정 한도(3회) **정확히 도달**. 한도 안에서 통과 — 합격.

## 5. 누적 통계 (data/experiment-history.jsonl)

| # | runId | agent rank 1 | human pick | agreement | 코멘트 |
|---|---|---|---|---|---|
| 1 | run #6 | /management/logs | rank 1 | ✅ true | (없음) |
| 2 | run #7 D | /management/logs | custom (replay) | ⚠️ false | "WS 분류 정정 후 첫 replay 검증, 시드 환경변수 사용" |
| 3 | run #8 B | /management/logs | rank 3 (admin-registration) | ⚠️ false | "B 시나리오: admin-registration CRUD 새 영역 검증..." |

**현재 일치율: 1/3 = 33%.** 두 번의 disagreement 모두 의도적 다양성
확보 — 실제 의견 충돌이 아니라 "같은 영역 반복 회피" 동기. 통계적
의미는 약하지만 누적 데이터 시작.

## 6. tests-generated/ 누적 5개

```
management-logs.spec.ts                (15KB) — 검색·필터·CSV 저장
management-logs-export.spec.ts         (11KB) — 다운로드 모달
management-logs-search-filter.spec.ts  (16KB) — 10단계 종합
dashboard-replay.spec.ts               (13KB) — 좌표 재생 + datetime picker
management-admin-registration.spec.ts  (12KB) — NEW: CRUD (등록·검색·수정·삭제)
```

**3개 영역 커버**: logs / replay / admin-registration.

## 7. 1주차 baseline 종합 발견 갱신
- **단일 에이전트가 3개 영역 e2e 테스트 자율 작성** (5개 spec, 모두 통과)
- 사람 게이트로 의도적 다양성 확보 (33% agreement, 두 번 새 영역 시도)
- 자가수정 한도(3회) 정확히 사용 — 한도 설계가 적절함을 검증
- 시드 환경변수 → spec 코드까지 종단간 흐름 검증 (D)
- WS 분류 정확도 100% 회복 + stage1 비용 -25% (#7 이후)
- stage2 후보 풀이 라이브를 거치며 학습·진화 (rank 2 변화)

## 8. 1주차 마무리 권장
지금까지 누적:
- 라이브 8회 (#3~#8, 추가로 D continue)
- 모든 라이브 통과
- 자가수정 평균 1.5회 (한도 안)
- 5개 spec, 3개 영역
- 일치율 데이터 3개 포인트 + 코멘트 누적
- stage1 misclassification 정정 사이클 1회 완료

**여기서 1주차 baseline 마무리 권장**. 추가 라이브는 안정성 검증 외
기존 데이터에서 더 도출할 새로운 결론 없음. 2주차 진입 시 본 baseline
대비 멀티 에이전트 효과 측정.
