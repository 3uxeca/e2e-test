import { test, expect, type Page } from '@playwright/test';

/**
 * Stage 3 / 사용자 직접 지정 플로우: /dashboard/replay 좌표 재생 검증
 *
 * 시드 (2026-04-05 06:00 ~ 07:00, T1 좌표 데이터 적재 구간):
 *   SEED_REPLAY_DATE=2026-04-05
 *   SEED_REPLAY_START_TIME=06:00
 *   SEED_REPLAY_END_TIME=07:00
 *
 * 사용자가 명세한 9단계:
 *   1) 로그인 후 /dashboard/replay 진입
 *   2) 날짜 입력칸에 SEED_REPLAY_DATE
 *   3) 시작 시각 입력칸에 SEED_REPLAY_START_TIME
 *   4) 종료 시각 입력칸에 SEED_REPLAY_END_TIME
 *   5) '재생' 버튼 클릭
 *   6) 시간 슬라이더가 0:00에서 증가함 단언
 *   7) 캔버스 영역에 좌표 점 1개 이상 렌더 단언
 *   8) 일시정지 클릭 → 슬라이더 멈춤 단언
 *   9) 2D ↔ 3D 토글 → 뷰 모드 전환 단언
 *
 * Stage 1 탐색에서 관찰된 실제 UI 적응 (작은 변경, 의도 보존):
 *   - "날짜 / 시작시각 / 종료시각" 3개 인풋이 아니라 datetime picker 다이얼로그가
 *     달린 textbox 2개 (시작 datetime, 종료 datetime)다. 각 textbox 클릭 →
 *     캘린더 + 시간 listbox 다이얼로그에서 날짜·시각을 선택해 한 번에 채운다.
 *   - 시간 listbox 는 15분 단위. SEED 가 "06:00" / "07:00" 인 한 정확히 매치된다.
 *   - 사용자 명세의 5단계 "재생 버튼 클릭" 은 실제 UI 에서는 datetime range 를
 *     확정하면서 자동 재생을 시작하는 "라이브 뷰 보기" 버튼이 담당한다.
 *     그냥 "재생" 버튼만 누르면 "날짜 범위를 선택하고 라이브뷰를 활성화해주세요"
 *     가드 모달이 뜬다. 이 적응은 의도("시드 범위로 재생을 시작") 를 보존한다.
 *   - 좌표 점은 캔버스가 아니라 SVG <circle r="1.5" fill="#ff0000"> 로 그려진다
 *     (2D 뷰 기준). 3D 뷰로 전환하면 별도 <canvas> 가 등장하므로 뷰 전환 단언
 *     기준은 (a) 2D/3D 토글 라벨의 active 클래스 변화 + (b) 3D 에서 canvas
 *     등장 두 가지를 함께 본다.
 */

const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:3000';
const LOGIN_URL = process.env.LOGIN_URL ?? `${TARGET_URL}/auth/login`;
const TEST_EMAIL = process.env.TEST_EMAIL ?? 'facility@airport.co.kr';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

const SEED_REPLAY_DATE = process.env.SEED_REPLAY_DATE ?? '2026-04-05';
const SEED_REPLAY_START_TIME = process.env.SEED_REPLAY_START_TIME ?? '06:00';
const SEED_REPLAY_END_TIME = process.env.SEED_REPLAY_END_TIME ?? '07:00';

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto(LOGIN_URL);
  await page.getByRole('textbox', { name: '이메일 입력' }).fill(TEST_EMAIL);
  const passwordBox = page.getByRole('textbox', { name: '비밀번호 입력' });
  await passwordBox.fill(TEST_PASSWORD);
  // 하단 데코 SVG 가 로그인 버튼 위로 떠 pointer event 를 가로채는 케이스가
  // 있어, password 필드에서 Enter 로 직접 submit 한다.
  await Promise.all([
    page.waitForURL(/\/(monitoring|management|dashboard)\b/, { timeout: 15_000 }),
    passwordBox.press('Enter'),
  ]);
}

/**
 * 캘린더 listbox 의 aria-label "Month M월, YYYY" 에서 (year, month) 를 읽는다.
 * 헤더의 [role=alert] 는 dialog 첫 마운트 시 일시적으로 빈 문자열인 케이스가
 * 관측되어 폴링이 잘못 0 을 반환할 위험이 있다. listbox aria-label 은 dialog
 * 가 visible 인 한 항상 채워진 상태로 노출되므로 더 결정론적이다.
 */
async function readCalendarYearMonth(
  dialog: ReturnType<Page['getByRole']>
): Promise<{ year: number; month: number } | null> {
  const calendarListbox = dialog.getByRole('listbox', {
    name: /^Month\s+\d+월,\s*\d{4}/,
  });
  const ariaLabel = (await calendarListbox.getAttribute('aria-label')) ?? '';
  const m = ariaLabel.match(/Month\s+(\d+)월,\s*(\d{4})/);
  if (!m) return null;
  return { month: Number(m[1]), year: Number(m[2]) };
}

/**
 * datetime picker 다이얼로그가 열린 상태에서 (date, time) 을 선택한다.
 * - date: "YYYY-MM-DD"
 * - time: "HH:MM" (15분 단위)
 *
 * 캘린더 listbox 의 aria-label "Month M월, YYYY" 를 기준으로 "이전 달" /
 * "다음 달" 버튼을 눌러 목표 월로 이동한 뒤 해당 일자 option 을 클릭하고,
 * 시간 listbox 에서 일치하는 option 을 클릭한다. 시간 옵션 클릭 직후
 * 다이얼로그가 자동으로 닫히고 textbox 에 "YYYY.MM.DD HH:MM" 형식으로 값이
 * 채워지는 게 정상 흐름이다.
 */
async function pickDateTime(page: Page, date: string, time: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Choose Date and Time' });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const [ty, tm, td] = date.split('-').map(Number);

  // 캘린더 listbox 가 마운트될 때까지 폴링 (aria-label 이 채워진 상태).
  await expect
    .poll(async () => (await readCalendarYearMonth(dialog)) !== null, {
      timeout: 5_000,
      message: 'calendar listbox aria-label not ready',
    })
    .toBe(true);

  // 1) 목표 월로 이동.
  for (let safety = 0; safety < 24; safety++) {
    const cur = await readCalendarYearMonth(dialog);
    if (!cur) throw new Error('calendar year/month unreadable');
    const diff = (ty - cur.year) * 12 + (tm - cur.month);
    if (diff === 0) break;
    const navBtn = dialog.getByRole('button', { name: diff < 0 ? '이전 달' : '다음 달' });
    await navBtn.click();
    // listbox 의 aria-label 이 갱신될 때까지 기다린다.
    await expect
      .poll(
        async () => {
          const next = await readCalendarYearMonth(dialog);
          return next ? `${next.year}-${next.month}` : '';
        },
        { timeout: 3_000 }
      )
      .not.toBe(`${cur.year}-${cur.month}`);
  }

  // 2) 일자 option 클릭. aria-label 포맷: "Choose YYYY년 M월 D일 요일".
  //    caller-month 의 옵션만 안전하게 잡기 위해 year+month+day 모두를 명시.
  const dayPattern = new RegExp(`Choose\\s*${ty}년\\s*${tm}월\\s*${td}일\\s`);
  await dialog.getByRole('option', { name: dayPattern }).first().click();

  // 3) 시간 option 클릭. 캘린더 listbox 와 시간 listbox 양쪽 모두 [role=option]
  //    이라, 시간 listbox 안으로 범위를 좁혀 정확 텍스트 매치.
  const timeListbox = dialog.locator('[role="listbox"]').last();
  await timeListbox.getByRole('option', { name: time, exact: true }).click();

  // 4) 다이얼로그가 닫힐 때까지 대기.
  await expect(dialog).toBeHidden({ timeout: 5_000 });
}

/** "YYYY-MM-DD" + "HH:MM" → "YYYY.MM.DD HH:MM" (textbox value 형식). */
function expectedDatetimeText(date: string, time: string): string {
  const [y, m, d] = date.split('-');
  return `${y}.${m}.${d} ${time}`;
}

// ── 테스트 ───────────────────────────────────────────────────────────────────

test.describe('대시보드 / 리플레이 (좌표 재생 + 일시정지 + 2D↔3D)', () => {
  test.beforeAll(() => {
    if (!TEST_PASSWORD) {
      throw new Error('TEST_PASSWORD env is required');
    }
  });

  test('9단계 핵심 플로우', async ({ page }) => {
    test.setTimeout(90_000);

    // ── 1) 로그인 → /dashboard/replay 진입 ───────────────────────────────────
    await login(page);
    await page.goto(`${TARGET_URL}/dashboard/replay`);
    await expect(page).toHaveURL(/\/dashboard\/replay/);
    // 페이지 헤더 영역 확인 (사이드 탭 "리플레이" 가 그려진 시점).
    await expect(page.getByRole('link', { name: '리플레이', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // 슬라이더가 그려질 때까지 기다린다.
    const slider = page.getByRole('slider', { name: 'Replay timeline' });
    await expect(slider).toBeVisible({ timeout: 10_000 });

    // 시작/종료 datetime textbox 두 개가 나란히 노출된다.
    const startBox = page.getByRole('textbox', { name: '기간 및 시간 선택' }).first();
    const endBox = page.getByRole('textbox', { name: '기간 및 시간 선택' }).nth(1);
    await expect(startBox).toBeVisible();
    await expect(endBox).toBeVisible();

    // ── 2~3) 시작 datetime: SEED_REPLAY_DATE + SEED_REPLAY_START_TIME ──────
    await startBox.click();
    await pickDateTime(page, SEED_REPLAY_DATE, SEED_REPLAY_START_TIME);
    await expect(startBox).toHaveValue(
      expectedDatetimeText(SEED_REPLAY_DATE, SEED_REPLAY_START_TIME)
    );

    // ── 4) 종료 datetime: SEED_REPLAY_DATE + SEED_REPLAY_END_TIME ──────────
    await endBox.click();
    await pickDateTime(page, SEED_REPLAY_DATE, SEED_REPLAY_END_TIME);
    await expect(endBox).toHaveValue(
      expectedDatetimeText(SEED_REPLAY_DATE, SEED_REPLAY_END_TIME)
    );

    // ── 5) "재생" 트리거 ────────────────────────────────────────────────────
    // 사용자 명세 5단계: '재생' 버튼 클릭.
    // 실제 UI 에서는 datetime range 가 적용되지 않은 상태에서 "재생" 만 누르면
    // 가드 모달이 뜨므로, range 적용 + 자동 재생을 함께 트리거하는
    // "라이브 뷰 보기" 가 사용자 명세의 의도(=시드 범위로 재생 시작)를 충족한다.
    await page.getByRole('button', { name: '라이브 뷰 보기' }).click();

    // ── 6) 슬라이더가 0 에서 증가함을 단언 ──────────────────────────────────
    // 초기값은 "0" (즉 0:00). 증가하면 "0" 이 아닌 양수 문자열이 된다.
    await expect
      .poll(
        async () => Number((await slider.inputValue()) ?? '0'),
        {
          timeout: 10_000,
          message: 'replay slider did not advance from 0:00',
        }
      )
      .toBeGreaterThan(0);

    // ── 7) 좌표 점 1개 이상 렌더 ────────────────────────────────────────────
    // 2D 뷰의 좌표 점은 #ff0000 채움 + r=1.5 SVG circle 로 그려진다.
    // 다른 정적 SVG 요소(레인 라인 등)와 구분되도록 fill+r 조건으로 좁힌다.
    const coordDots = page.locator(
      '[aria-label="Replay map"] circle[fill="#ff0000"][r="1.5"]'
    );
    await expect
      .poll(async () => coordDots.count(), {
        timeout: 10_000,
        message: '좌표 점이 한 개도 렌더되지 않았다',
      })
      .toBeGreaterThanOrEqual(1);

    // ── 8) 일시정지 → 슬라이더 멈춤 ─────────────────────────────────────────
    const pauseBtn = page.getByRole('button', { name: '일시정지' });
    await expect(pauseBtn).toBeVisible({ timeout: 5_000 });
    await pauseBtn.click();
    // 일시정지 후 버튼 라벨이 "재생" 으로 토글되는 것이 1차 단언.
    await expect(page.getByRole('button', { name: '재생' })).toBeVisible({ timeout: 5_000 });

    // 슬라이더가 더 이상 증가하지 않는지 시간 간격을 두고 두 번 읽어 비교한다.
    const v1 = Number(await slider.inputValue());
    await page.waitForTimeout(1500);
    const v2 = Number(await slider.inputValue());
    expect(v2, 'slider continued advancing after pause').toBe(v1);

    // ── 9) 2D ↔ 3D 토글 → 뷰 모드 전환 ─────────────────────────────────────
    // 토글은 <button> 이 아니라 <div role=generic> 텍스트 셀이라 nameless 라
    // exact-match 선택이 필요하다. 라벨이 active 인 셀에는 `bg-dark` 클래스가
    // 추가된다는 점을 클래스 단언 기준으로 사용한다.
    const tab2D = page.locator('div', { hasText: /^2D$/ }).first();
    const tab3D = page.locator('div', { hasText: /^3D$/ }).first();

    // 초기 상태: 2D 가 active, 3D 는 비활성.
    await expect(tab2D).toHaveClass(/bg-dark/);
    await expect(tab3D).not.toHaveClass(/bg-dark/);

    // 3D 로 전환.
    await tab3D.click();
    await expect(tab3D).toHaveClass(/bg-dark/, { timeout: 5_000 });
    await expect(tab2D).not.toHaveClass(/bg-dark/);
    // 3D 모드는 WebGL canvas 가 추가로 마운트된다 (보강 단언).
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 5_000 });

    // 다시 2D 로 전환되는지도 확인.
    await tab2D.click();
    await expect(tab2D).toHaveClass(/bg-dark/, { timeout: 5_000 });
    await expect(tab3D).not.toHaveClass(/bg-dark/);
  });
});
