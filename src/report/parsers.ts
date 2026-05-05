import type { FeatureCounts, SelfCorrectionRow } from './types.js';

const ZONE_GENERAL = ['일반'];
const ZONE_ADMIN = ['관리자'];
const ZONE_COMMON = ['공통'];
const ZONE_AUTH = ['인증'];

interface TableRow {
  cells: string[];
}

function extractMarkdownTableRows(markdown: string): TableRow[] {
  const lines = markdown.split('\n');
  const rows: TableRow[] = [];
  let inTable = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (/^\|\s*-+/.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) {
      // header line — wait for separator
      continue;
    }
    const cells = line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    rows.push({ cells });
  }
  return rows;
}

export function countFeaturesFromStage1(stage1Markdown: string): FeatureCounts {
  const rows = extractMarkdownTableRows(stage1Markdown);
  const counts: FeatureCounts = {
    general: 0,
    admin: 0,
    common: 0,
    auth: 0,
    websocketDependent: 0,
    totalRows: 0,
  };

  for (const { cells } of rows) {
    if (cells.length < 6) continue;
    const zone = cells[0] ?? '';
    const websocket = (cells[5] ?? '').toLowerCase();
    if (!ZONE_GENERAL.concat(ZONE_ADMIN, ZONE_COMMON, ZONE_AUTH).includes(zone)) {
      continue;
    }
    counts.totalRows += 1;
    if (ZONE_GENERAL.includes(zone)) counts.general += 1;
    if (ZONE_ADMIN.includes(zone)) counts.admin += 1;
    if (ZONE_COMMON.includes(zone)) counts.common += 1;
    if (ZONE_AUTH.includes(zone)) counts.auth += 1;
    if (websocket.includes('yes') || websocket.includes('partial')) {
      counts.websocketDependent += 1;
    }
  }
  return counts;
}

const EXPLORATION_KEYWORDS = ['selector', 'force', 'click', 'svg', '가려', 'submit', 'enter'];
const SCENARIO_KEYWORDS = ['stage2', '시나리오', '가정', '초기', '키워드', '저장 동작', 'auto-load', '자동 로드', '모달'];
const CODE_BUG_KEYWORDS = ['syntax', '컴파일', '타입', 'undefined', 'reference'];

function classifyCause(summary: string): SelfCorrectionRow['failureCause'] {
  const lower = summary.toLowerCase();
  const hits = {
    exploration: EXPLORATION_KEYWORDS.filter((k) => lower.includes(k.toLowerCase())).length,
    scenario: SCENARIO_KEYWORDS.filter((k) => lower.includes(k.toLowerCase())).length,
    code: CODE_BUG_KEYWORDS.filter((k) => lower.includes(k.toLowerCase())).length,
  };
  const max = Math.max(hits.exploration, hits.scenario, hits.code);
  if (max === 0) return 'unclassified';
  if (hits.scenario === max) return 'scenario-assumption';
  if (hits.exploration === max) return 'exploration-gap';
  return 'code-bug';
}

export function parseSelfCorrections(stage3Markdown: string): SelfCorrectionRow[] {
  const heading = stage3Markdown.indexOf('자가 수정 이력');
  if (heading < 0) return [];
  const tail = stage3Markdown.slice(heading);
  const rows = extractMarkdownTableRows(tail);
  const out: SelfCorrectionRow[] = [];
  for (const { cells } of rows) {
    if (cells.length < 3) continue;
    const attempt = cells[0] ?? '';
    if (!/^\d+$/.test(attempt) && attempt !== '-') continue;
    const changeSummary = cells[1] ?? '';
    const result = cells[2] ?? '';
    out.push({
      attempt,
      changeSummary,
      result,
      failureCause: classifyCause(changeSummary),
    });
  }
  return out;
}

export function extractGeneratedTestPaths(stage3Markdown: string): string[] {
  const paths: string[] = [];
  const re = /tests-generated\/[\w./-]+\.spec\.ts/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stage3Markdown)) !== null) {
    if (!paths.includes(m[0])) paths.push(m[0]);
  }
  return paths;
}

export interface Stage2Selection {
  flowName?: string;
  route?: string;
  droppedCandidates: string[];
}

function stripDecoration(value: string): string {
  return value
    .trim()
    .replace(/^\*{1,2}/, '')
    .replace(/\*{1,2}$/, '')
    .replace(/^[`:\s]+/, '')
    .replace(/[`:\s]+$/, '')
    .trim();
}

function takeFirstLineMatch(markdown: string, label: string): string | undefined {
  // Allow optional list bullet, optional bold markers, then `<label>:` then value.
  // label is a regex fragment (e.g. '플로우\\s*이름').
  const re = new RegExp(`^\\s*[-*]?\\s*\\*{0,2}\\s*${label}\\s*\\*{0,2}\\s*:\\s*(.+?)\\s*$`, 'm');
  const m = markdown.match(re);
  return m && m[1] ? stripDecoration(m[1]) : undefined;
}

export function extractStage2Selection(stage2Markdown: string): Stage2Selection {
  const flowName = takeFirstLineMatch(stage2Markdown, '플로우\\s*이름');
  const route = takeFirstLineMatch(stage2Markdown, '라우트');

  const droppedCandidates: string[] = [];
  const headingIdx = stage2Markdown.search(/탈락(한)?\s*(플로우|후보)/);
  if (headingIdx >= 0) {
    const tail = stage2Markdown.slice(headingIdx);
    const lines = tail.split('\n');
    // Skip the heading line itself, then collect items in either bullet or
    // markdown table form until the next markdown heading.
    let inTableBody = false;
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === undefined) break;
      if (/^#{1,6}\s/.test(line)) break;

      // Bullet form: "- ..." or "  - ..." (인라인 backtick 보존)
      const bm = line.match(/^[\t ]*-\s+(.+)$/);
      if (bm && bm[1]) {
        droppedCandidates.push(bm[1].trim());
        continue;
      }

      // Table separator "|---|---|" → 다음 라인부터 data row
      if (/^\|[\s|\-:]+\|\s*$/.test(line)) {
        inTableBody = true;
        continue;
      }

      // Table data row "| col1 | col2 | ..." (header row 만나면 separator
      // 전이라 inTableBody=false → skip)
      const tm = line.match(/^\|(.+)\|\s*$/);
      if (tm && tm[1] && inTableBody) {
        const cells = tm[1].split('|').map((c) => c.trim()).filter((c) => c.length > 0);
        if (cells.length >= 2) {
          droppedCandidates.push(`${cells[0]} — ${cells.slice(1).join(' | ')}`);
        } else if (cells.length === 1) {
          droppedCandidates.push(cells[0]!);
        }
      }
    }
  }

  return { flowName, route, droppedCandidates };
}
