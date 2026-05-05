# Stages 1·2·3 한 페이지 참조

Cartographer 오케스트레이터가 순차 실행하는 3단계의 정의·입출력·모델·산출물·prompt 위치를 한 곳에 모은다. 본 문서는 reference; 라이브별 결과는 `docs/run*-results.md` 참고.

## 한 줄 정의

| Stage | 한 줄 정의 | 결과물 종류 |
|---|---|---|
| **stage1-mapping** | 로그인 후 앱 전체를 직접 탐색하여 기능을 빠짐없이 마크다운 표로 정리 | 마크다운 (라우트 표 + 사전 검증 메모) |
| **stage2-prioritize** | stage1 매핑 표만 보고 우선순위 후보 **3개**를 신뢰도·근거와 함께 선정 | JSON (`picks.json`) + 마크다운 |
| **stage3-test** | 사람이 결정한 1개 플로우의 Playwright spec 작성 → 실행 → 실패 시 자가수정 (최대 3회) | `tests-generated/<flow>.spec.ts` |

## 입출력 의존성

```
stage1 ── output.md ────┐
                        ├── stage2 입력 (매핑 표만 보고 추론)
                        └── (브라우저 추가 탐색 안 함, 토큰 절약)

stage2 ── picks.json ───┐
                        ├── 사람 게이트 (pnpm continue)
                        │   ├── --pick=N (top 3 중 선택)
                        │   ├── --custom="..." (새 플로우 직접)
                        │   └── --comment="..." (불일치 시 이유)
                        └── decision-final.json + selectedFlowText

stage3 ── selectedFlowText (사람 결정) + stage2.output ── spec 작성·실행
```

## 1주차 모델·토큰 정책

| Stage | 모델 (1주차) | 토큰 한도 (input+output) | 도구 호출 |
|---|---|---|---|
| stage1 | `claude-opus-4-7` | 50,000 | Playwright MCP (브라우저) |
| stage2 | `claude-sonnet-4-6` ◀️ run #5 다운그레이드 | 15,000 | 없음 (추론only) |
| stage3 | `claude-opus-4-7` | 100,000 | Playwright MCP + Write + Bash |

상한 도달 시: 단계 강제 종료 → 다음 단계로 진행 (PROJECT.md). 코드 위치: `src/stages/config.ts`.

## Prompt 파일

| Stage | system prompt | user prompt |
|---|---|---|
| stage1 | `src/prompts/stage1.system.md` | `src/prompts/stage1.user.md` (TARGET_URL/LOGIN_URL/TEST_EMAIL/TEST_PASSWORD + SEED_REPLAY_*) |
| stage2 | `src/prompts/stage2.system.md` | `src/prompts/stage2.user.md` (STAGE1_OUTPUT) |
| stage3 | `src/prompts/stage3.system.md` | `src/prompts/stage3.user.md` (STAGE2_OUTPUT + 사람 결정 우선) |

## 산출물 위치 (라이브 1회당)

```
runs/<runId>/
├── decisions.jsonl              # 단계별 start/end 의사결정 로그
├── report.json                  # 단계별 usage/cost/numTurns/finalTextSource
├── decision-final.json          # 사람 게이트 결정 (continue 후)
├── stage1-mapping/
│   ├── output.md                # 매핑 마크다운 (산출물)
│   └── messages.jsonl           # raw SDK 메시지 (디버깅·재현)
├── stage2-prioritize/
│   ├── output.md                # 산출물 마크다운 (JSON 코드펜스 포함)
│   ├── picks.json               # 추출된 top-3 구조화 JSON
│   └── messages.jsonl
└── stage3-test/
    ├── output.md                # spec + 자가수정 이력 + 실행 결과
    └── messages.jsonl

tests-generated/<flow>.spec.ts   # 자율 작성 spec (커밋함)
data/experiment-history.jsonl    # agreement 누적 (한 라이브 = 한 줄)
reports/<runId>.md               # pnpm report 자동 생성 (gitignore)
```

## 1주차 실측 turns 범위 (8회 라이브)

| Stage | min | max | 평균 | 분류 |
|---|---|---|---|---|
| stage1 | 54 | 84 | 73 | heavy (>30) |
| stage2 | 1 | 1 | 1 | trivial |
| stage3 | 2 | 61 | 28 | light~heavy 변동 큼 |

stage3의 큰 변동성은 (a) stage2 시나리오의 명시도, (b) 기존 tests-generated/ 누적 효과, (c) 사람 게이트 시나리오 주입 여부로 결정됨.

## 사람 게이트 메커니즘

```
pnpm start                     # stage1+2 실행 → 사람 게이트에서 정지
                                  └── 출력에 continue 명령 안내됨

# 옵션 (zero-friction → 가장 강한 override 순)
pnpm continue <runId>                                 # 1순위 그대로 (agreement=true 가능)
pnpm continue <runId> --pick=2 --comment="이유"        # 다른 순위 (agreement=false)
pnpm continue <runId> --pick=3 --comment="이유"        # 동일
pnpm continue <runId> --custom="..." --comment="..."   # 새 플로우 (agreement=false)

# 회피 (regression 자동화용)
pnpm start --auto-pick=1       # 게이트 스킵, 1순위 채택, stage3까지 자동
```

`--pick=N` 의 N은 picks.json 의 `rank` 필드와 일치 (1·2·3).

## 가드레일 (1주차 로컬)

- 같은 액션 5회 이상 반복 금지 (모든 단계)
- 단계당 토큰 한도 초과 시 강제 종료
- 액션이 애매하면 실행 보류 + 사람에게 질문
- WebSocket 의존 기능은 stage2 후보 자동 제외 (stage1 분류 기반)
- 비밀번호 출력·로그 금지

상세: `src/guardrails/env.local.ts`.

## 단계별 책임 (역할 섞임 신호)

`docs/run*-results.md` §3.3 에서 측정. 1주차 baseline 기준:

- **stage1**: 탐색 행동 결정 + 관찰 + 마크다운 정리 (3 역할 한 에이전트). turns ≥50 일 때 heavy.
- **stage2**: 우선순위 판단 (단일 역할). 1턴/추론only 패턴.
- **stage3**: 시나리오 검증 + 코드 작성 + 실행 분석 (3 역할 한 에이전트). 자가수정 ≥4 회 시 역할 섞임 신호.

2주차 P1·P2·P3 분리 후보의 정당성: `docs/week2-plan.md`.

## 다이어그램

```
┌──────────────────────────────────────────────────┐
│ pnpm start                                       │
│                                                  │
│   stage1 (Opus, Playwright MCP)                  │
│   ├── 로그인 + 탐색 + 매핑 표 + 사전 검증 메모   │
│   └── output.md                                  │
│                ↓                                 │
│   stage2 (Sonnet, 추론only)                      │
│   ├── top 3 후보 + 신뢰도(1~5) + 근거 + 시나리오 │
│   └── picks.json                                 │
│                ↓                                 │
│  ╔═══════════════════════╗                       │
│  ║ 사람 게이트 (정지)    ║                       │
│  ║ pnpm continue <runId> ║                       │
│  ╚═══════════════════════╝                       │
│                ↓                                 │
│   stage3 (Opus, Playwright MCP + Write + Bash)   │
│   ├── 사람 결정 시나리오 → spec 작성             │
│   ├── 실행 → 실패 시 자가수정 (≤3 회)            │
│   └── tests-generated/<flow>.spec.ts             │
│                ↓                                 │
│   pnpm report → reports/<runId>.md               │
└──────────────────────────────────────────────────┘
```
