import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Stage 3 / Week 1 — 관리자 / 관리자 등록·검색·수정·삭제 CRUD
 *
 * 2단계가 사람 검토 후 최종 채택한 7단계 플로우:
 *   1) /management/admin-registration 진입 → 총 N명 ≥ 12 확인 (initialCount 캡처)
 *   2) 검색창에 결정론적 키워드 입력 → '검색하기' → 결과 카운트 감소 확인
 *   3) 검색어 비우고 검색 → 카운트 복원 (다음 단계의 결정론 보장)
 *   4) 폼 5필드 입력 (이름/부서/사번/휴대전화/이메일) → '관리자 등록' 버튼이
 *      활성화되는 것 확인 → 클릭 → 총 N+1 명 + 새 행이 목록 상단에 노출
 *   5) 새 행의 '수정' 클릭 → 모달 노출 → 부서 변경 → '변경' 활성 → 클릭 →
 *      목록의 부서 셀이 새 값으로 갱신
 *   6) 새 행의 '삭제' 클릭 → 확인 다이얼로그 ('삭제하기' 클릭) → 행 사라짐
 *   7) 총 N명이 initialCount 로 복귀 (teardown 검증)
 *
 * 주요 관찰점 (사전 탐색 결과):
 *   • 페이지에 두 개의 <table> 이 존재 (header / body 분리). 행 select 는 반드시
 *     getByRole('row', { name: <고유 substring> }) 또는 두 번째 tbody 로 좁혀야
 *     strict mode 위반을 피한다.
 *   • 사번 input 은 숫자가 아닌 문자를 자동 strip 한다 → 숫자 ID 만 입력.
 *   • 신규 행은 목록 상단(등록일 desc)에 삽입된다.
 *   • 삭제 확인은 브라우저 confirm() 이 아닌 커스텀 다이얼로그 ('삭제하기' 버튼).
 *   • 수정 모달에서 '변경' 버튼은 한 필드라도 값이 바뀌어야 활성화된다.
 *   • 검색은 클라이언트 substring 매치로 보이며 "관리자1" 은 "관리자10" 까지
 *     포함시키므로 결정론적 narrow 키워드는 "관리자5" / "관리자8" 같은 unique
 *     suffix 를 쓴다.
 *
 * 환경 변수
 *   TARGET_URL      e.g. http://localhost:3000
 *   LOGIN_URL       e.g. http://localhost:3000/auth/login
 *   TEST_EMAIL      e.g. facility@airport.co.kr
 *   TEST_PASSWORD   비밀번호 (절대 console.log 금지)
 */

const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:3000';
const LOGIN_URL = process.env.LOGIN_URL ?? `${TARGET_URL}/auth/login`;
const TEST_EMAIL = process.env.TEST_EMAIL ?? 'facility@airport.co.kr';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

// 검색 narrowing 키워드 — 시드 데이터 "관리자1 ~ 관리자10" 중 unique suffix.
// "관리자8" 은 다른 행 이름의 substring 이 아니므로 정확히 1행만 매치.
const SEARCH_KEYWORD = '관리자8';

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto(LOGIN_URL);
  await page.getByRole('textbox', { name: '이메일 입력' }).fill(TEST_EMAIL);
  const passwordBox = page.getByRole('textbox', { name: '비밀번호 입력' });
  await passwordBox.fill(TEST_PASSWORD);
  // 데코 SVG 가 로그인 버튼 위로 떠 pointer event 를 가로채는 케이스가 있어,
  // password 필드에서 Enter 로 직접 submit 한다.
  await Promise.all([
    page.waitForURL(/\/(monitoring|management|dashboard)\b/, { timeout: 15_000 }),
    passwordBox.press('Enter'),
  ]);
}

/** "총 N명" 텍스트에서 N 만 정수로 추출. */
async function readTotalCount(page: Page): Promise<number> {
  const totalLocator = page.getByText(/총\s*\d+\s*명/).first();
  await expect(totalLocator).toBeVisible({ timeout: 10_000 });
  const txt = (await totalLocator.textContent()) ?? '';
  return Number(txt.replace(/[^0-9]/g, ''));
}

/**
 * 데이터 행이 들어있는 가시성 있는 tbody.
 * 페이지에는 두 개의 tbody 가 동일 데이터를 담고 있으며 그 중 하나는
 * 반응형 변종(`flow-vertical-narrow`) 으로 viewport 폭에 따라 토글된다.
 * `:visible` 필터로 실제 화면에 노출된 tbody 만 잡는다.
 */
function dataTbody(page: Page): Locator {
  return page.locator('tbody').filter({ visible: true }).first();
}

/** 특정 이름을 포함한 visible 데이터 행. */
function rowByName(page: Page, name: string): Locator {
  return dataTbody(page).locator('tr', { hasText: name });
}

// ─── 테스트 ────────────────────────────────────────────────────────────────

test.describe('관리자 / 관리자 등록 (CRUD)', () => {
  test.beforeAll(() => {
    if (!TEST_PASSWORD) {
      throw new Error('TEST_PASSWORD env is required');
    }
  });

  test('7단계 핵심 CRUD 플로우', async ({ page }) => {
    test.setTimeout(120_000);

    // 데이터 테이블이 ≥1584px 뷰포트에서만 보이는 반응형 컨테이너 안에
    // 들어 있어 default 1280×720 에서는 `.hidden` 으로 가려진다. 데스크톱
    // 레이아웃을 강제 활성화한 뒤 진행한다.
    await page.setViewportSize({ width: 1920, height: 1080 });

    // 결정론적이면서도 행간 충돌이 나지 않도록 timestamp 기반 unique key 사용.
    const stamp = Date.now().toString().slice(-7);
    const newAdmin = {
      name: `E2E${stamp}`,
      department: 'QA부',
      employeeId: `9${stamp}`, // 사번 input 이 비숫자를 strip 하므로 숫자만.
      phone: '010-0000-0001',
      email: `e2e${stamp}@e2e.local`,
    };
    const updatedDepartment = 'QA부수정';

    // ── 1) 로그인 → 페이지 진입 → initialCount 캡처 ──────────────────────────
    await login(page);
    await page.goto(`${TARGET_URL}/management/admin-registration`);
    await expect(page).toHaveURL(/\/management\/admin-registration/);
    await expect(page.getByRole('heading', { name: '신규 관리자 등록' }).or(
      page.getByText('신규 관리자 등록').first()
    )).toBeVisible({ timeout: 10_000 });
    // 자동 로드된 행이 ≥ 1 임을 먼저 확인 (목록 헤더 + 적어도 1행).
    await expect(dataTbody(page).locator('tr').first()).toBeVisible({ timeout: 10_000 });

    const initialCount = await readTotalCount(page);
    expect(initialCount).toBeGreaterThanOrEqual(12);

    // ── 2) 검색 → 결과 카운트가 initialCount 보다 작아짐 ────────────────────
    const searchInput = page.getByRole('textbox', {
      name: '검색할 내용을 입력해주세요.',
    });
    const searchButton = page.getByRole('button', { name: '검색하기' });

    await searchInput.fill(SEARCH_KEYWORD);
    await expect(searchInput).toHaveValue(SEARCH_KEYWORD);
    await searchButton.click();

    // settle 까지 polling — 결과 카운트가 초기보다 적어짐.
    await expect
      .poll(() => readTotalCount(page), {
        timeout: 10_000,
        message: 'search did not reduce the total count',
      })
      .toBeLessThan(initialCount);

    // 결과 행 본문에 검색어가 포함되는지 표본 확인.
    await expect(
      dataTbody(page).getByText(SEARCH_KEYWORD).first()
    ).toBeVisible({ timeout: 5_000 });

    // ── 3) 검색어 비우고 검색하기 → 원래 카운트로 복원 ──────────────────────
    await searchInput.fill('');
    await searchButton.click();
    await expect
      .poll(() => readTotalCount(page), { timeout: 10_000 })
      .toBe(initialCount);

    // ── 4) 폼 5필드 입력 → 등록 버튼 활성 → 클릭 → 행 추가 ───────────────────
    const registerButton = page.getByRole('button', { name: '관리자 등록' });
    await expect(registerButton).toBeDisabled();

    await page.getByRole('textbox', { name: '이름을 입력해주세요' }).fill(newAdmin.name);
    // 동일 placeholder("부서를 입력해주세요") 가 나중에 수정 모달에도 등장하므로,
    // 폼 단계에서는 main DOM 에만 존재한다는 사실을 활용해 첫 번째 매치를 선택.
    await page
      .getByRole('textbox', { name: '부서를 입력해주세요' })
      .first()
      .fill(newAdmin.department);
    await page
      .getByRole('textbox', { name: '사번을 입력해주세요' })
      .first()
      .fill(newAdmin.employeeId);
    await page
      .getByRole('textbox', { name: '010-1234-5678' })
      .first()
      .fill(newAdmin.phone);
    await page
      .getByRole('textbox', { name: '이메일을 입력해주세요' })
      .first()
      .fill(newAdmin.email);

    await expect(registerButton).toBeEnabled({ timeout: 5_000 });
    await registerButton.click();

    // 카운트 +1, 새 행이 목록 상단에 노출.
    await expect
      .poll(() => readTotalCount(page), { timeout: 10_000 })
      .toBe(initialCount + 1);

    const newRow = rowByName(page, newAdmin.name);
    await expect(newRow).toHaveCount(1, { timeout: 10_000 });
    await expect(newRow).toContainText(newAdmin.name);
    await expect(newRow).toContainText(newAdmin.department);
    await expect(newRow).toContainText(newAdmin.email);
    await expect(newRow).toContainText(newAdmin.phone);

    // ── 5) 수정: 새 행의 '수정' 버튼 → 모달 → 부서 변경 → '변경' ────────────
    await newRow.getByRole('button', { name: '수정' }).click();

    const editModalHeading = page.getByText('관리자 정보 수정');
    await expect(editModalHeading).toBeVisible({ timeout: 5_000 });

    // 모달 컨테이너로 좁혀 부서 입력박스를 집는다 (페이지에 같은 placeholder
    // 를 가진 폼 인풋이 함께 살아있음).
    const editModal = page
      .locator('div')
      .filter({ has: page.getByText('관리자 정보 수정') })
      .filter({ has: page.getByRole('button', { name: '변경' }) })
      .last();

    const modalDeptInput = editModal.getByRole('textbox', { name: '부서를 입력해주세요' });
    await expect(modalDeptInput).toHaveValue(newAdmin.department, { timeout: 5_000 });
    await modalDeptInput.fill(updatedDepartment);
    await expect(modalDeptInput).toHaveValue(updatedDepartment);

    const saveBtn = editModal.getByRole('button', { name: '변경', exact: true });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // 모달 닫힘 + 행에 새 부서값 반영.
    await expect(editModalHeading).toBeHidden({ timeout: 5_000 });
    await expect(rowByName(page, newAdmin.name)).toContainText(updatedDepartment, {
      timeout: 10_000,
    });

    // ── 6) 삭제: 새 행의 '삭제' → 확인 다이얼로그 → '삭제하기' → 행 제거 ─────
    const targetRow = rowByName(page, newAdmin.name);
    await targetRow.getByRole('button', { name: '삭제' }).click();

    // 커스텀 confirm 다이얼로그.
    const deleteConfirmText = page.getByText(
      `${newAdmin.name} 님을 관리자 목록에서 삭제하시겠습니까?`
    );
    await expect(deleteConfirmText).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: '삭제하기' }).click();

    // 행 자체가 사라짐.
    await expect(rowByName(page, newAdmin.name)).toHaveCount(0, { timeout: 10_000 });

    // ── 7) 총 N명이 initialCount 로 복귀 (teardown 검증) ────────────────────
    await expect
      .poll(() => readTotalCount(page), { timeout: 10_000 })
      .toBe(initialCount);
  });
});
