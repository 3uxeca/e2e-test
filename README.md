# Cartographer — 자율 E2E 테스트 생성 에이전트

URL과 간단한 앱 설명만 주면, 단일 에이전트가 로그인 → 앱 탐색 → 핵심
플로우 우선순위 판단 → Playwright e2e 테스트 작성·실행·자가수정까지
자율 수행하는 시스템.

대상: 김해공항 출국장 LiDAR 모니터링 + KPI 대시보드 (운영팀 내부 도구).

## 1주차 baseline 결과 (2026-05-06 기준)
- ✅ **8회 라이브, 5개 spec, 3개 영역 모두 통과**
- 자가수정 평균 1.5회 (PROJECT.md 한도 3 안)
- 누적 일치율 (에이전트 1순위 vs 사람 최종 선택) 1/3 = 33%
  (두 disagreement 모두 의도적 다양성 확보)
- WS 분류 오류율 40% → 0% (사용자 정정 → prompt 보강 1회 사이클)
- stage2 모델 Sonnet 다운그레이드 검증 완료

상세 회고: [`docs/week1-summary.md`](docs/week1-summary.md)

## Quick start

```bash
# 의존성
pnpm install
pnpm exec playwright install chromium

# .env 작성 (TEST_PASSWORD 만 직접 채우면 됨, 나머지는 .env.example 참고)
cp .env.example .env

# 설정만 미리 확인 (토큰 0)
pnpm sanity

# 파이프라인 시뮬레이션 (토큰 0)
pnpm dry-run

# 라이브 — 단계 1+2 자율 실행, 사람 게이트에서 정지
pnpm start

# 사람 게이트 통과 (3가지 형태)
pnpm continue <runId>                                   # 1순위 그대로
pnpm continue <runId> --pick=2 --comment="이유"          # 2/3순위 채택
pnpm continue <runId> --custom="..." --comment="..."     # 새 플로우 직접

# 단계 1+2+3 모두 자율 (regression 모드)
pnpm start --auto-pick=1

# 리포트 자동 생성 (최신 run 기준)
pnpm report

# 생성된 spec 직접 실행
pnpm exec playwright test tests-generated/<spec>.spec.ts
```

## 프로젝트 구조

```
src/
├── index.ts               # 엔트리 (sanity / dry-run / live + --auto-pick)
├── config.ts              # ENV 로딩 + 가드레일 정책 선택 + 시드 환경변수
├── orchestrator/
│   ├── runner.ts          # 단계 순차 실행기 (--stop-after-stage2 지원)
│   └── continue.ts        # 사람 게이트 통과 후 stage3 재개
├── stages/
│   ├── config.ts          # 단계별 model + tokenLimit
│   ├── stage1-mapping.ts  # 탐색 + 기능 매핑 (Opus)
│   ├── stage2-prioritize.ts # top 3 후보 + 신뢰도 (Sonnet)
│   └── stage3-test.ts     # Playwright spec 작성·자가수정 (Opus)
├── prompts/               # system/user 프롬프트 .md 파일
├── guardrails/            # 환경별(local/staging/prod) 가드레일 정책
├── telemetry/             # 토큰 카운터, 토큰 가드, 결정 로그, raw 메시지
├── sdk/                   # Claude Agent SDK 래퍼 (live + dry-run)
├── mcp/                   # Playwright MCP 연결
├── report/                # pnpm report — 라이브 결과 마크다운 자동 생성
└── cli/                   # pnpm continue 엔트리

runs/                      # 라이브마다 자동 생성 (gitignore)
  └── <runId>/
      ├── decisions.jsonl
      ├── report.json
      ├── decision-final.json (사람 결정 후)
      ├── stage1-mapping/{output.md, messages.jsonl}
      ├── stage2-prioritize/{output.md, messages.jsonl, picks.json}
      └── stage3-test/{output.md, messages.jsonl}

tests-generated/           # 에이전트가 자율 작성한 Playwright spec (커밋함)

reports/                   # 자동 생성 마크다운 리포트 (gitignore)

data/
  └── experiment-history.jsonl  # 라이브마다 한 줄 누적 (agreement 트래킹)

docs/                      # 인터뷰·라이브별 결과·시드 가정·misclassification 등
```

## Docs map

| 파일 | 내용 |
|---|---|
| [`PROJECT.md`](PROJECT.md) | 1주차 작업 명세 (요구사항·실험 단계·측정 지표) |
| [`docs/week1-setup-interview.md`](docs/week1-setup-interview.md) | Step 1 진입 전 사용자 인터뷰 정리 |
| [`docs/run3-results.md`](docs/run3-results.md) | 첫 통과 baseline (자가수정 6회) |
| [`docs/run4-results.md`](docs/run4-results.md) | stage1 prompt 보강 (자가수정 6→3) |
| [`docs/run5-results.md`](docs/run5-results.md) | Sonnet stage2 다운그레이드 검증 |
| [`docs/run6-results.md`](docs/run6-results.md) | top-3 + 사람 게이트 도입, 첫 agreement=true |
| [`docs/run7-d-results.md`](docs/run7-d-results.md) | replay 좌표 재생 (사용자 명세 vs UI 격차 자율 적응) |
| [`docs/run8-b-results.md`](docs/run8-b-results.md) | admin-registration CRUD (자가수정 한도 정확 사용) |
| [`docs/week1-summary.md`](docs/week1-summary.md) | **1주차 종합 회고** |
| [`docs/week2-plan.md`](docs/week2-plan.md) | 2주차 멀티 에이전트 + 모델 분리 설계 |
| [`docs/seed-assumptions.md`](docs/seed-assumptions.md) | 시드 데이터 가정 (`SEED_LOG_*`, `SEED_REPLAY_*`) |
| [`docs/stage1-misclassifications.md`](docs/stage1-misclassifications.md) | stage1 매핑 오분류 누적 + 보강 가이드 |

## 1주차 모델·토큰 정책

- **모든 단계 Claude Opus 4.7** 시작 → run #5 부터 stage2만 Sonnet 4.6 (검증 완료)
- 단계별 토큰 한도: stage1=50k / stage2=15k / stage3=100k
- 한도 도달 시 강제 종료 후 다음 단계 진행
- Max plan 보호: 하루 2~3회 라이브 권장

## 인증
- **Max/Pro plan**: Claude Code CLI(`claude`) OAuth 자격증명 자동 사용
  (`ANTHROPIC_API_KEY` 비워두면 됨)
- **Console 결제**: `.env` 에 `ANTHROPIC_API_KEY` 채움

## 다음 단계
- 2주차: 멀티 에이전트 + 모델 분리 (`docs/week2-plan.md` 참고)
- 3주차: 멀티 에이전트 + 스테이징 환경 적응
