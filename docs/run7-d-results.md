# 1주차 라이브 #7 — D (custom: /dashboard/replay 좌표 재생)

`docs/run6-results.md` 다음, **stage1 WS 분류 prompt 보강** + **사용자
시드 환경변수 (`SEED_REPLAY_*`)** 도입 직후의 라이브.
사용자가 `--custom` 으로 직접 지정한 시나리오로 stage3 진행.

- runId: `runs/2026-05-05T07-51-37-681Z/`
- stage1+2 실행: 2026-05-05 07:51 UTC
- continue (D): 2026-05-05 ~17:25 KST
- 사람 결정: `--custom="/dashboard/replay 좌표 재생 검증..." --comment="..."`

## 1. 라이브 #7 종합 (stage1+2 + D)

| 지표 | 값 |
|---|---|
| 통과 여부 | ✅ **passed (6.7s)** |
| 자가수정 | 1회 (시도 2회 중 첫 회 실패 → 두 번째 통과) |
| 총 시간 (stage1+2+3) | ~21분 |
| input+output 토큰 | 10,467 |
| stage1 turns | 70 (#6의 78 → -10%) |
| stage1 cost | $3.69 (#6의 $4.93 → -25%) ⬇️ |
| stage2 turns | 1 |
| stage3 turns | 57 |
| **agreement** | **false** (custom — 첫 disagreement 데이터 포인트) |
| 새 spec | `tests-generated/dashboard-replay.spec.ts` (13KB) |

## 2. stage1 WS 분류 정정 효과

prompt 보강(`docs/stage1-misclassifications.md` 입력) 직후 첫 라이브에서
**모든 분류 정확**:

| 라우트 | 이전 라이브들 | run #7 |
|---|---|---|
| `/monitoring/live/2d/{all,t1,t2}` | yes | yes ✅ + 두 신호 명시 |
| `/monitoring/live/3d/{all,t1,t2}` | yes | yes ✅ + 두 신호 명시 |
| `/monitoring/summary` | yes ❌ | **no ✅ (정정)** |
| `/dashboard/replay` | yes ❌ | **no ✅ (정정, "DB 적재 좌표 REST 페치" 명기)** |

게다가 에이전트가 자기 이전 오분류를 명시 인용하며 `참고 (이전 라이브
오분류 사례): /monitoring/summary 와 /dashboard/replay 는 WS가 아니다`
라고 산출물에 적었다. **메타 자기 인식 + 학습 적용 동시 확인**.

부수 효과: stage1 자체가 가벼워짐 (78→70 turns, 비용 -25%) — 명확한
분류 룰이 추측 시간을 줄였다는 가설.

## 3. stage2 후보 풀 변화

WS 분류 정정으로 후보 풀이 다양화:

| rank | route | confidence | 비교 (#5/#6) |
|---|---|---|---|
| 1 | `/management/logs` | 5/5 | 동일 (4번째 연속 1순위) |
| 2 | `/management/admin-registration` | 4/5 | #6의 rank 3 → rank 2 |
| 3 | `/dashboard` | 3/5 | **NEW: 일반 영역 첫 후보 진입** |

`/dashboard/replay` 자체가 top3에 들어가진 않았지만 (`/dashboard` 가
대신 진입), 후보 풀이 명백히 정상화됨.

## 4. 사용자 시드 환경변수 → 에이전트 자율 활용

`.env` 에 시드 추가:
```
SEED_REPLAY_DATE=2026-04-05
SEED_REPLAY_START_TIME=06:00
SEED_REPLAY_END_TIME=07:00
```

stage3 가 spec 에 `process.env.SEED_REPLAY_DATE` 등을 그대로 박았다.
fallback 값(2026-04-05)도 정확히 baseline 시드값으로 설정. **사용자
지식 → 환경변수 → prompt → spec 코드의 종단간 흐름 검증**.

## 5. 사용자 명세 vs 실제 UI 격차 — 에이전트의 자율 적응

사용자가 `--custom` 으로 9단계 명세를 줬지만, stage3 가 실제 UI를
도구로 관찰해서 의도를 보존하면서 다음 적응을 했다 (산출물 첫머리에
직접 명시):

| # | 사용자 명세 | 실제 UI | 에이전트 적응 |
|---|---|---|---|
| 1 | "날짜·시작·종료 인풋 3개" | datetime picker 다이얼로그 + textbox 2개 | 캘린더 + 시간 listbox 다이얼로그로 datetime range 선택 |
| 2 | "재생 버튼 클릭" | 그냥 "재생" 누르면 가드 모달 ("날짜 범위 선택하고 라이브뷰 활성화") | "라이브 뷰 보기" 버튼이 datetime range 확정 + 자동 재생을 동시 처리하는 실제 트리거임을 발견하고 사용 |
| 3 | "캔버스에 좌표 점" | 2D 뷰는 SVG `<circle r="1.5" fill="#ff0000">` / 3D 뷰는 별도 `<canvas>` | (a) 2D/3D 토글 active 클래스 변화 + (b) 3D 캔버스 등장 두 단언을 함께 사용 |

**의의**: 사람의 명세가 정확하지 않아도 에이전트가 도구 관찰로 보정하며
의도 보존. 1주차 baseline 의 "단일 에이전트 자율성" 이 단순 프롬프트
복종이 아니라 실측 적응까지 포함됨을 확인.

## 6. 자가수정 패턴 (1회)

| 회차 | 변경 요지 | 결과 |
|---|---|---|
| 1 | 캘린더 헤더 텍스트("M월 YYYY")를 `dialog.getByRole('alert')` 로 폴링하는 monthDiff 사용 | failed — dialog 첫 마운트 시 헤더 alert 가 일시 빈 문자열이라 monthDiff=0 → break → 잘못된 월(5월)에서 "4월 5일" 옵션 검색 → timeout 90s |
| 2 | 캘린더 listbox `aria-label="Month M월, YYYY"` 를 결정론적 신호로 사용. 폴링 사전준비 + day option regex 에 year+month+day 묶기 + 시간 옵션을 시간 listbox 로 범위 좁힘 | **passed (6.7s)** |

자가수정 원인: aria-label 결정론 vs alert text 비결정론. 1회 보정으로
확정 — 한도(3회) 안.

## 7. 누적 통계 (data/experiment-history.jsonl)

| # | runId | agent rank 1 | human pick | agreement | comment |
|---|---|---|---|---|---|
| 1 | run #6 | /management/logs | rank 1 | ✅ true | (없음) |
| 2 | run #7 D | /management/logs | **custom (replay)** | ⚠️ false | "WS 분류 정정 후 첫 replay 검증, 시드 환경변수 사용" |

**현재 일치율: 1/2 = 50%**. `--custom` 사용은 의도적 disagreement
(사용자가 새 영역 검증 시도) — 부정적 신호 아님.

## 8. tests-generated/ 누적 4개

```
management-logs.spec.ts          (15KB) — 검색·필터·CSV 저장
management-logs-export.spec.ts   (11KB) — 다운로드 모달
management-logs-search-filter.spec.ts (16KB) — 10단계 종합
dashboard-replay.spec.ts         (13KB) — NEW: 좌표 재생 + datetime picker
```

E2E 테스트 스위트가 자연스럽게 누적되는 패턴 확인 (4번째 spec).

## 9. 1주차 핵심 발견 — 갱신
- **사용자 시드 → 에이전트 활용 종단간 검증** ✅
- **명세 부정확해도 에이전트가 도구 관찰로 적응** ✅
- **WS 분류 정확도 100% 회복** ✅
- **stage1 명확한 룰 → stage1 자체 비용 -25%** ✅
- **agreement=false 첫 데이터 포인트 + 코멘트 누적** ✅

다음 단계: B (admin-registration CRUD) 로 새 영역 자율 작성 검증.
