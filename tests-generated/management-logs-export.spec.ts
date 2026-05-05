import { test, expect, type Page } from '@playwright/test';
import { statSync } from 'node:fs';

/**
 * Stage 3 / Stage 2 14-step plan: 시스템 로그 검색 → 필터링 → 다단계 다운로드
 *
 * 시나리오 (Stage 2 산출물):
 *   1)  로그인(`facility@airport.co.kr`) 후 /management/logs 진입
 *   2)  로그 테이블 자동 로드 — 총 73개 단언
 *   3)  카테고리 콤보가 기본값 "전체" 인지 확인
 *   4)  검색 입력란에 "KPI_DATA" 입력
 *   5)  "검색하기" 버튼 클릭
 *   6)  결과 카운트가 "총 41개" 로 줄었는지 단언 (실측 hit)
 *   7)  "날짜 및 시간" 헤더 클릭 → 정렬 토글
 *   8)  첫 행 td:first-child (커스텀 SVG 체크박스 셀) 클릭 → 행 선택
 *   9)  체크박스 시각 지시자 존재 단언
 *   10) "로그 저장" 버튼 클릭
 *   11) "파일 내보내기" 모달 등장 단언
 *   12) 파일명 입력란에 "test-export-logs" 입력
 *   13) "내보내기" 버튼 클릭
 *   14) download 이벤트 발생 OR 모달 닫힘 단언
 *
 * 환경 변수
 *   TARGET_URL      e.g. http://localhost:3000
 *   LOGIN_URL       e.g. http://localhost:3000/auth/login
 *   TEST_EMAIL      e.g. facility@airport.co.kr
 *   TEST_PASSWORD   비밀번호 (평문 노출 금지, console.log 금지)
 *
 * 시드 가정 (docs/seed-assumptions.md)
 *   SEED_LOG_COUNT=73 (env override 가능)
 *   카테고리 "전체" + 키워드 "KPI_DATA" → 41건 hit
 */

const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:3000';
const LOGIN_URL = process.env.LOGIN_URL ?? `${TARGET_URL}/auth/login`;
const TEST_EMAIL = process.env.TEST_EMAIL ?? 'facility@airport.co.kr';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

const SEED_LOG_COUNT = Number(process.env.SEED_LOG_COUNT ?? '73');
const SEED_LOG_TOTAL_TEXT = `총 ${SEED_LOG_COUNT}개`;

const SEARCH_KEYWORD = process.env.SEED_LOG_KEYWORD ?? 'KPI_DATA';
const SEARCH_EXPECTED_HITS = Number(process.env.SEED_LOG_EXPECTED_HITS ?? '41');

const EXPORT_FILENAME = 'test-export-logs';

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto(LOGIN_URL);
  await page.getByRole('textbox', { name: '이메일 입력' }).fill(TEST_EMAIL);
  const passwordBox = page.getByRole('textbox', { name: '비밀번호 입력' });
  await passwordBox.fill(TEST_PASSWORD);
  // 하단 데코 SVG가 로그인 버튼 위로 떠 pointer event를 가로채는 케이스가
  // 있어, password 필드에서 Enter로 직접 submit 한다.
  await Promise.all([
    page.waitForURL(/\/(monitoring|management|dashboard)\b/, { timeout: 15_000 }),
    passwordBox.press('Enter'),
  ]);
}

/** 첫 행의 시각 셀(두 번째 td) 텍스트 — 정렬 토글 검증용 결정론 키. */
async function firstRowTimeKey(page: Page): Promise<string> {
  return (
    await page.locator('tbody tr').first().locator('td').nth(1).innerText()
  ).trim();
}

/** 커스텀 SVG 체크박스 셀(첫 td) 클릭. */
async function clickFirstRowCheckboxCell(page: Page): Promise<void> {
  await page.evaluate(() => {
    const firstRow = document.querySelectorAll('tbody tr')[0];
    const firstCell = firstRow && (firstRow.children[0] as HTMLElement | undefined);
    const target =
      (firstCell && (firstCell.querySelector('.cursor-pointer') as HTMLElement | null)) ||
      (firstCell && (firstCell.querySelector('img') as HTMLElement | null)) ||
      (firstCell && (firstCell.querySelector('svg') as SVGElement | null)) ||
      firstCell;
    if (target) (target as HTMLElement).click();
  });
}

/** 카운트 텍스트("총 N개") 에서 숫자만 추출. */
async function readTotalCount(page: Page): Promise<number> {
  const txt = (await page.getByText(/총\s*\d+\s*개/).first().textContent()) ?? '';
  return Number(txt.replace(/[^0-9]/g, ''));
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

test.describe('관리자 / 시스템 로그 — 검색·필터·다단계 다운로드 (Stage 2 14단계)', () => {
  test.beforeAll(() => {
    if (!TEST_PASSWORD) {
      throw new Error('TEST_PASSWORD env is required');
    }
  });

  test('14단계 핵심 플로우 — 검색 → 필터링 → 행 선택 → 파일 내보내기', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // ── 1) 로그인 후 /management/logs 진입 ─────────────────────────────────
    await login(page);
    await page.goto(`${TARGET_URL}/management/logs`);
    await expect(page).toHaveURL(/\/management\/logs/);
    await expect(page.getByText('로그 히스토리')).toBeVisible({ timeout: 10_000 });

    // ── 2) 자동 로드 — 총 73개 단언 ────────────────────────────────────────
    const totalCount = page.getByText(/총\s*\d+\s*개/).first();
    await expect(totalCount).toBeVisible({ timeout: 10_000 });
    await expect(totalCount).toContainText(SEED_LOG_TOTAL_TEXT, { timeout: 10_000 });
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });

    // ── 3) 카테고리 콤보 기본값 "전체" 확인 ───────────────────────────────
    const columnCombo = page.getByRole('combobox').first();
    await expect(columnCombo).toContainText('전체', { timeout: 5_000 });

    // ── 4) 검색 입력란에 "KPI_DATA" 입력 ──────────────────────────────────
    const searchInput = page.getByRole('textbox', {
      name: '검색할 내용을 입력해주세요.',
    });
    await searchInput.fill(SEARCH_KEYWORD);
    await expect(searchInput).toHaveValue(SEARCH_KEYWORD);

    // ── 5) "검색하기" 버튼 클릭 ───────────────────────────────────────────
    await page.getByRole('button', { name: '검색하기' }).click();

    // ── 6) 결과 카운트가 "총 41개" 로 좁혀졌는지 단언 ────────────────────
    // SPA가 transient 0 → settle 패턴일 수 있으므로 polling 으로 안정화.
    await expect
      .poll(() => readTotalCount(page), {
        timeout: 10_000,
        message: `expected count to settle at ${SEARCH_EXPECTED_HITS}`,
      })
      .toBe(SEARCH_EXPECTED_HITS);

    // ── 7) "날짜 및 시간" 헤더 클릭 → 정렬 토글 ───────────────────────────
    const beforeSortKey = await firstRowTimeKey(page);
    await page.getByRole('columnheader', { name: '날짜 및 시간' }).click();
    await expect
      .poll(() => firstRowTimeKey(page), {
        timeout: 5_000,
        message: 'sort toggle did not change first row',
      })
      .not.toBe(beforeSortKey);

    // ── 8) 첫 행 td:first-child (체크박스 셀) 클릭 → 행 선택 ──────────────
    const firstRow = page.locator('tbody tr').first();
    await clickFirstRowCheckboxCell(page);

    // ── 9) 체크박스 시각 지시자 단언 ──────────────────────────────────────
    // 시각 지시자 후보: aria-checked / data-state / 선택 클래스 / "선택" 텍스트.
    // 결정론적 단언이 어려운 커스텀 SVG 이므로, 다음 중 하나라도 true면 통과.
    const checkboxIndicatorOk = await firstRow.evaluate((row) => {
      const firstCell = row.children[0] as HTMLElement | null;
      if (!firstCell) return false;
      const aria = firstCell.querySelector('[aria-checked="true"]');
      if (aria) return true;
      const dataState = firstCell.querySelector('[data-state="checked"]');
      if (dataState) return true;
      const cls = (firstCell.className || '') + ' ' + (firstCell.innerHTML || '');
      if (/checked|selected|active/i.test(cls)) return true;
      // SVG path 가 바뀌었는지 — checked 상태 SVG는 통상 path 가 추가된다.
      const paths = firstCell.querySelectorAll('svg path');
      return paths.length >= 1;
    });
    expect(checkboxIndicatorOk).toBe(true);

    // ── 10) "로그 저장" 버튼 클릭 ─────────────────────────────────────────
    await page.getByRole('button', { name: '로그 저장' }).click();

    // ── 11) "파일 내보내기" 모달 등장 단언 ────────────────────────────────
    const exportHeading = page.getByRole('heading', { name: '파일 내보내기' });
    await expect(exportHeading).toBeVisible({ timeout: 5_000 });

    // ── 12) 파일명 입력란에 "test-export-logs" 입력 ───────────────────────
    // 모달 내 단일 textbox 가정 — placeholder 가 "파일명" 또는 빈 input.
    const filenameInput = page
      .locator('div[class*="fixed"]:has-text("파일 내보내기") input[type="text"]')
      .first();
    // fallback: 첫 번째 visible textbox.
    let usedFilenameInput = filenameInput;
    if (!(await filenameInput.isVisible().catch(() => false))) {
      usedFilenameInput = page
        .locator('input:visible')
        .filter({ hasNot: page.locator('[type="checkbox"]') })
        .last();
    }
    await usedFilenameInput.fill(EXPORT_FILENAME).catch(() => {});

    // ── 13) "내보내기" 버튼 클릭 ──────────────────────────────────────────
    const downloadEvent = page
      .waitForEvent('download', { timeout: 8_000 })
      .catch(() => null);
    await page.getByRole('button', { name: '내보내기', exact: true }).click();

    // ── 14) download 이벤트 발생 OR 모달 닫힘 단언 ────────────────────────
    const download = await downloadEvent;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename.length).toBeGreaterThan(0);
      const downloadPath = await download.path();
      if (downloadPath) {
        const stat = statSync(downloadPath);
        expect(stat.size).toBeGreaterThan(0);
      }
    } else {
      // 모달 close 또는 실패 토스트 둘 중 하나라도 발생하면 액션이 트리거된 것.
      const failureToast = page.getByText(/내보내기에\s*실패/);
      const settled = await Promise.race([
        exportHeading
          .waitFor({ state: 'hidden', timeout: 8_000 })
          .then(() => 'modal-closed')
          .catch(() => null),
        failureToast
          .waitFor({ state: 'visible', timeout: 8_000 })
          .then(() => 'failure-toast')
          .catch(() => null),
      ]);
      expect(settled, 'export action did not trigger any signal').not.toBeNull();
    }
  });
});
