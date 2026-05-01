# 시드 데이터 가정 — 1주차 baseline (`tests-generated/*.spec.ts` 의존성)

자율 생성된 e2e 테스트가 통과하기 위해 대상 웹앱(`http://localhost:3000`)이
가지고 있어야 하는 시드 데이터 가정을 한 곳에 정리한다. 이 문서는
사람이 환경을 다시 세팅할 때 또는 테스트가 간헐적으로 실패할 때 1차로
참고할 명세다.

## 공통

| 가정 | 값 | 출처 |
|---|---|---|
| 앱 URL | `http://localhost:3000` | `.env.example` `TARGET_URL` |
| 로그인 URL | `http://localhost:3000/auth/login` | `.env.example` `LOGIN_URL` |
| 슈퍼 계정 | `facility@airport.co.kr` (`ROLE_SYSTEM_ADMIN`) | `docs/week1-setup-interview.md` Q4 |
| 슈퍼 계정 비밀번호 | `.env` `TEST_PASSWORD` 로 주입 | 운영자 직접 입력 |

## 라이브 #3 baseline 시점의 데이터 형상

| 영역 | 항목 | 시드 양/형태 | 참고 (없거나 다르면 어떤 spec이 깨지는가) |
|---|---|---|---|
| `/management/logs` | 시스템 로그 행 수 | **73건** (페이지네이션 1·2 노출) | `tests-generated/management-logs.spec.ts`의 `총 73개` 단언 |
| `/management/logs` | 코드명 카테고리에 매칭되는 키워드 | **`KPI_DATA_MISSING`** (≥1건) | 같은 spec의 카테고리=코드명, 키워드=KPI_DATA_MISSING 검색 단계. 매칭 0건이면 `expect.toBeVisible` 실패 |
| `/management/logs` | "로그 저장" 흐름 | 행 선택 → "로그 저장" → "파일 내보내기" 모달 → "내보내기" 클릭 → (브라우저 download 이벤트 OR 모달 close) | spec이 두 종결 조건 OR로 단언 |
| `/management/admin-registration` | 관리자 리스트 | **12명**, 페이지네이션 1·2 | (현 시점 spec 미생성) |
| `/management/super-admin` | 전체 데이터 로그 | **7,419,484건** | (현 시점 spec 미생성) |
| `/monitoring/*` | 라이브 좌표 스트림 | LiDAR 디바이스가 ENABLE된 상태에서만 의미 있음 | 1주차 스코프 외 (WS 의존, 자동 제외) |

## 시드를 다시 깨끗한 상태로 만들고 싶을 때

이 프로젝트는 외부 웹앱을 수정하지 않는다 (PROJECT.md). 시드 리셋 절차는
대상 웹앱 측 운영 가이드를 따른다. 본 저장소가 책임지는 범위:
- 어떤 시드 가정에 의존하는지 명시 (이 문서)
- 시드가 어긋났을 때 spec이 즉시 실패하지 않도록 가능한 범위에서
  단언을 환경변수로 유연하게 (예: `SEED_LOG_COUNT`).

## 환경변수 확장 (선택)

| 변수 | 의미 | 미설정 시 동작 |
|---|---|---|
| `SEED_LOG_COUNT` | `/management/logs`의 기대 행 수 | spec이 baseline 값(73)을 사용 |
| `SEED_LOG_KEYWORD` | 코드명 카테고리에서 ≥1건 hit하는 키워드 | spec이 baseline 값(`KPI_DATA_MISSING`)을 사용 |

> 위 변수는 **현재 spec에 적용되어 있다.** 테스트가 다른 시드 환경에서도
> 통과하도록 만들고 싶다면 `.env`에 위 변수를 채워 넣는다. 예:
>
> ```
> SEED_LOG_COUNT=120
> SEED_LOG_KEYWORD=ERROR
> ```

## 주의

- 비밀번호·토큰은 절대 본 문서나 spec 파일에 평문으로 남기지 않는다.
- 시드를 변경하면 본 문서의 표를 함께 갱신한다 — spec 디버깅 1차 자료다.
