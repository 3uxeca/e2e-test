import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageConfigs, totalTokenBudget, type StageId } from '../stages/config.js';
import {
  countFeaturesFromStage1,
  extractGeneratedTestPaths,
  parseSelfCorrections,
} from './parsers.js';
import type {
  ReasoningWeight,
  ReportJson,
  ReportJsonStageResult,
  StageRollup,
} from './types.js';

const SELF_CORRECTION_LIMIT = 3;
const STAGE1_HEAVY_TURNS = 50;

function findLatestRunId(runsRoot = 'runs'): string {
  const entries = readdirSync(runsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const latest = entries[entries.length - 1];
  if (!latest) throw new Error(`no run directories found under ${runsRoot}`);
  return latest;
}

function loadReport(runId: string, runsRoot = 'runs'): ReportJson {
  const path = join(runsRoot, runId, 'report.json');
  return JSON.parse(readFileSync(path, 'utf8')) as ReportJson;
}

function getStage(report: ReportJson, id: StageId): ReportJsonStageResult | undefined {
  return report.stageResults.find((s) => s.stageId === id);
}

function classifyReasoning(numTurns: number): ReasoningWeight {
  if (numTurns <= 1) return 'trivial';
  if (numTurns <= 5) return 'light';
  if (numTurns <= 30) return 'moderate';
  return 'heavy';
}

function rollupStage(stage: ReportJsonStageResult, totals: ReportJson): StageRollup {
  const totalCacheRead = totals.totalUsage.cacheReadInputTokens || 1;
  return {
    stageId: stage.stageId,
    durationMs: stage.durationMs,
    durationShare: stage.durationMs / totals.totalDurationMs,
    costUsd: stage.costUsd,
    costShare: totals.totalCostUsd ? stage.costUsd / totals.totalCostUsd : 0,
    cacheReadShare: stage.usage.cacheReadInputTokens / totalCacheRead,
    numTurns: stage.numTurns,
    reasoningWeight: classifyReasoning(stage.numTurns),
    finalTextSource: stage.finalTextSource,
    permissionDenials: stage.permissionDenials,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}m ${r.toFixed(0)}s`;
}

interface WeekTwoRecommendation {
  splitName: string;
  rationale: string;
  modelAssignment: string;
}

function buildWeekTwoRecommendations(
  stage1: StageRollup | undefined,
  stage2: StageRollup | undefined,
  stage3: StageRollup | undefined,
  selfCorrectionCount: number,
): WeekTwoRecommendation[] {
  const recs: WeekTwoRecommendation[] = [];

  if (selfCorrectionCount > SELF_CORRECTION_LIMIT) {
    recs.push({
      splitName: 'stage2 → "Coverage Planner" 강화',
      rationale:
        `1주차 stage3 자가수정이 ${selfCorrectionCount}회 (한도 ${SELF_CORRECTION_LIMIT}회 초과). ` +
        `stage2가 stage1 마크다운만 보고 시나리오를 작성한 결과 stage3가 실측으로 보정해야 하는 단계가 많았다. ` +
        `Coverage Planner가 (a) 페이지 자동 로드, (b) 인터랙션의 모달/팝오버 단계, (c) 검색 키워드 매칭 가능성을 사전 검증하면 stage3 보정 회수가 직접 감소한다.`,
      modelAssignment:
        stage2 && stage2.reasoningWeight === 'trivial'
          ? 'Sonnet (1주차 stage2가 1턴/추론only로 통과 — 모델 다운그레이드 가능)'
          : 'Opus (현 사이클에서 상한 가까이 사용했으면 유지)',
    });
  }

  if (stage3 && (stage3.numTurns >= 50 || stage3.costShare > 0.5)) {
    recs.push({
      splitName: 'stage3 → "Coder + Test-Runner" 분리',
      rationale:
        `stage3가 turns=${stage3.numTurns}, 비용비중=${pct(stage3.costShare)}로 가장 무거웠다. ` +
        `Coder(코드 작성)와 Test-Runner(실행 + stderr 해석 + 보정 지시) 책임을 분리하면 자가수정 루프의 결정 품질과 비용이 동시에 개선된다.`,
      modelAssignment: 'Coder=Opus, Test-Runner=Sonnet (실행/해석은 단순 분류에 가까움)',
    });
  }

  if (stage1 && stage1.numTurns >= STAGE1_HEAVY_TURNS) {
    recs.push({
      splitName: 'stage1 → "Explorer + Recorder" 분리',
      rationale:
        `stage1이 turns=${stage1.numTurns}으로 heavy. ` +
        `Explorer(탐색 행동 결정)와 Recorder(부분 산출물 영속화)를 분리하면 빈 산출물 결함이 구조적으로 사라지고, 도구 호출 컨텍스트가 줄어 토큰 절감 가능.`,
      modelAssignment: 'Explorer=Opus, Recorder=Opus (정보 누락 위험 회피)',
    });
  }

  if (recs.length === 0) {
    recs.push({
      splitName: '현재 데이터로는 멀티 에이전트 분리 우선순위 식별 불가',
      rationale: '단계별 turns/cost/자가수정 회수가 모두 한도 안에 들어왔다. 추가 라이브 실행으로 데이터 축적 권장.',
      modelAssignment: 'TBD',
    });
  }

  return recs;
}

interface RolePromiscuityNote {
  stageId: StageId;
  signal: string;
  evidence: string;
}

function detectRoleMixing(
  stage1: StageRollup | undefined,
  stage3: StageRollup | undefined,
  selfCorrectionCount: number,
): RolePromiscuityNote[] {
  const out: RolePromiscuityNote[] = [];
  if (stage3 && selfCorrectionCount > SELF_CORRECTION_LIMIT) {
    out.push({
      stageId: 'stage3-test',
      signal: '시나리오 검증 + 코드 작성 + 실행 분석이 한 프롬프트에 섞여 있다',
      evidence: `자가수정 ${selfCorrectionCount}회 (> 한도 ${SELF_CORRECTION_LIMIT}). stage2 가정 격차를 stage3가 실측으로 보정.`,
    });
  }
  if (stage1 && stage1.numTurns >= STAGE1_HEAVY_TURNS) {
    out.push({
      stageId: 'stage1-mapping',
      signal: '탐색 행동 결정 + 관찰 + 마크다운 정리가 한 에이전트에 섞여 있다',
      evidence: `turns=${stage1.numTurns} (heavy). 부분 산출물 영속화 부재.`,
    });
  }
  return out;
}

export interface GenerateOptions {
  runId?: string;
  runsRoot?: string;
  reportsRoot?: string;
}

export interface GenerateResult {
  outputPath: string;
  runId: string;
}

export function generateReport(opts: GenerateOptions = {}): GenerateResult {
  const runsRoot = opts.runsRoot ?? 'runs';
  const reportsRoot = opts.reportsRoot ?? 'reports';
  const runId = opts.runId ?? findLatestRunId(runsRoot);
  const report = loadReport(runId, runsRoot);

  const stage1 = getStage(report, 'stage1-mapping');
  const stage2 = getStage(report, 'stage2-prioritize');
  const stage3 = getStage(report, 'stage3-test');

  const stage1Roll = stage1 ? rollupStage(stage1, report) : undefined;
  const stage2Roll = stage2 ? rollupStage(stage2, report) : undefined;
  const stage3Roll = stage3 ? rollupStage(stage3, report) : undefined;

  const features = stage1 ? countFeaturesFromStage1(stage1.output.text) : undefined;
  const selfCorrections = stage3 ? parseSelfCorrections(stage3.output.text) : [];
  const generatedTests = stage3 ? extractGeneratedTestPaths(stage3.output.text) : [];

  const causeCounts = selfCorrections.reduce<Record<string, number>>((acc, row) => {
    acc[row.failureCause] = (acc[row.failureCause] ?? 0) + 1;
    return acc;
  }, {});

  const rolePromiscuity = detectRoleMixing(stage1Roll, stage3Roll, selfCorrections.length);
  const recommendations = buildWeekTwoRecommendations(
    stage1Roll,
    stage2Roll,
    stage3Roll,
    selfCorrections.length,
  );

  const lines: string[] = [];
  lines.push(`# 1주차 자율 E2E 에이전트 리포트 — \`${runId}\``);
  lines.push('');
  lines.push(`> 자동 생성: \`pnpm report ${runId}\``);
  lines.push(`> runRoot: \`${report.runRoot}\``);
  lines.push('');

  // ── 1. 요약 ───────────────────────────────────────────────────────
  lines.push('## 1. 한 줄 요약');
  const stage3Pass = stage3?.output.text.includes('1 passed') ? '통과' : '미통과/보류';
  lines.push(
    `- 총 비용 **$${report.totalCostUsd.toFixed(4)}**, 소요 ${formatDuration(report.totalDurationMs)}, ` +
      `테스트 통과 여부: **${stage3Pass}**, 자가수정 ${selfCorrections.length}회.`,
  );
  lines.push('');

  // ── 2. 기본 지표 ──────────────────────────────────────────────────
  lines.push('## 2. 기본 지표');
  lines.push('');
  lines.push('### 2.1 토큰');
  lines.push('| 구분 | 값 |');
  lines.push('|---|---|');
  lines.push(`| input | ${report.totalUsage.inputTokens.toLocaleString()} |`);
  lines.push(`| output | ${report.totalUsage.outputTokens.toLocaleString()} |`);
  lines.push(`| input+output (PROJECT.md 토큰 상한 정의) | ${report.totalUsage.totalTokens.toLocaleString()} / ${totalTokenBudget.toLocaleString()} ${report.reachedTotalBudget ? '**[BUDGET REACHED]**' : ''} |`);
  lines.push(`| cache_creation_input | ${report.totalUsage.cacheCreationInputTokens.toLocaleString()} |`);
  lines.push(`| cache_read_input | ${report.totalUsage.cacheReadInputTokens.toLocaleString()} |`);
  lines.push('');
  lines.push('### 2.2 단계별');
  lines.push('| Stage | turns | cost (USD) | duration | tokens (i+o) | denials | finalTextSource | status |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const s of report.stageResults) {
    lines.push(
      `| ${s.stageId} | ${s.numTurns} | $${s.costUsd.toFixed(4)} | ${formatDuration(s.durationMs)} | ` +
        `${s.usage.totalTokens.toLocaleString()} / ${stageConfigs[s.stageId].tokenLimit.toLocaleString()} | ` +
        `${s.permissionDenials} | ${s.finalTextSource} | ${s.status} |`,
    );
  }
  lines.push('');

  // ── 2.3 발견 기능 수 ──────────────────────────────────────────────
  if (features) {
    lines.push('### 2.3 발견 기능 수 (stage1 매핑 표)');
    lines.push(`- 일반 영역: **${features.general}**`);
    lines.push(`- 관리자 영역: **${features.admin}**`);
    lines.push(`- 공통 모달/팝오버: ${features.common}`);
    lines.push(`- 인증: ${features.auth}`);
    lines.push(`- WebSocket 의존 (1주차 후보 자동 제외): **${features.websocketDependent}**`);
    lines.push(`- 매핑 표 총 행 수: ${features.totalRows}`);
    lines.push('');
  }

  // ── 2.4 자가 수정 ─────────────────────────────────────────────────
  lines.push('### 2.4 자가 수정 회수 (stage3)');
  lines.push(`- 총 회수: **${selfCorrections.length}** (PROJECT.md 한도: ${SELF_CORRECTION_LIMIT})`);
  if (selfCorrections.length > 0) {
    lines.push('- 회차별 변경 요지:');
    for (const r of selfCorrections) {
      lines.push(`  - 회차 ${r.attempt} → ${r.result} (${r.failureCause}): ${r.changeSummary.slice(0, 120)}`);
    }
  }
  lines.push('');

  // ── 3. 2주차 설계용 추가 지표 ──────────────────────────────────────
  lines.push('## 3. 2주차 설계용 추가 지표');
  lines.push('');
  lines.push('### 3.1 단계별 비중');
  lines.push('| Stage | duration share | cost share | cache_read share | reasoning weight |');
  lines.push('|---|---|---|---|---|');
  for (const r of [stage1Roll, stage2Roll, stage3Roll].filter(Boolean) as StageRollup[]) {
    lines.push(
      `| ${r.stageId} | ${pct(r.durationShare)} | ${pct(r.costShare)} | ${pct(r.cacheReadShare)} | ${r.reasoningWeight} |`,
    );
  }
  lines.push('');

  lines.push('### 3.2 추론 난이도 평가 (turns 기반 휴리스틱)');
  lines.push('- `trivial` (turns ≤ 1) — Sonnet 다운그레이드 후보');
  lines.push('- `light` (turns ≤ 5) — Sonnet 가능');
  lines.push('- `moderate` (turns ≤ 30) — 모델 분리 케이스 바이 케이스');
  lines.push('- `heavy` (turns > 30) — Opus 유지 권장');
  lines.push('');

  lines.push('### 3.3 역할 섞임 신호');
  if (rolePromiscuity.length === 0) {
    lines.push('- 감지된 신호 없음.');
  } else {
    for (const note of rolePromiscuity) {
      lines.push(`- **${note.stageId}**: ${note.signal}`);
      lines.push(`  - 근거: ${note.evidence}`);
    }
  }
  lines.push('');

  lines.push('### 3.4 자가 수정 실패 원인 분류 (휴리스틱)');
  if (selfCorrections.length === 0) {
    lines.push('- 분류 대상 없음.');
  } else {
    for (const [cause, count] of Object.entries(causeCounts)) {
      lines.push(`- ${cause}: ${count}회`);
    }
    lines.push('');
    lines.push('> 분류 라벨 정의:');
    lines.push('> - `exploration-gap` — 실제 DOM/페이지 동작을 사전에 보지 못해 발생한 selector·인터랙션 보정');
    lines.push('> - `scenario-assumption` — stage2 시나리오의 잘못된 가정(초기 데이터, 모달 단계 등)을 stage3가 실측으로 보정');
    lines.push('> - `code-bug` — 작성된 코드 자체의 syntax/타입 결함');
    lines.push('> - `unclassified` — 키워드 휴리스틱으로 분류되지 않은 경우 (수동 검토 권장)');
  }
  lines.push('');

  // ── 4. 토큰 상한 도달 ─────────────────────────────────────────────
  lines.push('## 4. 토큰 상한 도달 여부');
  if (report.reachedTotalBudget) {
    lines.push('- ⚠️ 총 토큰 상한 도달.');
  } else {
    lines.push('- 총 토큰 상한 미도달 (PROJECT.md 정의: input+output 합산).');
  }
  const stagesAtLimit = report.stageResults.filter((s) => s.status === 'token-limit-reached');
  if (stagesAtLimit.length === 0) {
    lines.push('- 어느 단계도 단계별 상한에 도달하지 않음.');
  } else {
    for (const s of stagesAtLimit) {
      lines.push(`- ⚠️ ${s.stageId}: 단계별 상한(${stageConfigs[s.stageId].tokenLimit.toLocaleString()}) 도달 → 강제 종료`);
    }
  }
  lines.push('');

  // ── 5. 생성된 테스트 코드 ─────────────────────────────────────────
  lines.push('## 5. 생성된 테스트 코드');
  if (generatedTests.length === 0) {
    lines.push('- 없음 (stage3가 작성하지 못함).');
  } else {
    for (const p of generatedTests) {
      lines.push(`- [${p}](../${p})`);
    }
  }
  lines.push('');

  // ── 6. 의사결정 로그 (decisions.jsonl 요약) ─────────────────────
  lines.push('## 6. 의사결정 로그 위치');
  lines.push(`- raw: \`${join(report.runRoot, 'decisions.jsonl')}\``);
  for (const s of report.stageResults) {
    lines.push(`- ${s.stageId} 산출물: \`${s.output.outputPath}\``);
    lines.push(`- ${s.stageId} raw 메시지: \`${join(report.runRoot, s.stageId, 'messages.jsonl')}\``);
  }
  lines.push('');

  // ── 7. 2주차 설계 제안 ────────────────────────────────────────────
  lines.push('## 7. 2주차 멀티 에이전트 + 모델 분리 설계 제안');
  lines.push('');
  lines.push('1주차 실측 데이터로부터 자동 도출된 우선순위. 각 항목의 근거는 본 리포트의');
  lines.push('§2~§3에서 직접 확인할 수 있다.');
  lines.push('');
  recommendations.forEach((rec, i) => {
    lines.push(`### 우선순위 ${i + 1}. ${rec.splitName}`);
    lines.push(`- 근거: ${rec.rationale}`);
    lines.push(`- 모델 할당 제안: ${rec.modelAssignment}`);
    lines.push('');
  });

  lines.push('---');
  lines.push(`Generated at ${new Date().toISOString()}`);
  lines.push('');

  mkdirSync(reportsRoot, { recursive: true });
  const outputPath = join(reportsRoot, `${runId}.md`);
  writeFileSync(outputPath, lines.join('\n'), 'utf8');

  return { outputPath, runId };
}
