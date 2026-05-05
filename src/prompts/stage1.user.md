# 입력
- TARGET_URL: {{TARGET_URL}}
- LOGIN_URL: {{LOGIN_URL}}
- TEST_EMAIL: {{TEST_EMAIL}}
- TEST_PASSWORD: {{TEST_PASSWORD}}

# 시드 데이터 힌트 (사람 제공)
시간 기반 페이지(예: `/dashboard/replay`)를 탐색할 때 사용하라:
- 좌표 데이터가 있는 날짜: {{SEED_REPLAY_DATE}}
- 좌표 데이터가 있는 시작 시각: {{SEED_REPLAY_START_TIME}}
- 좌표 데이터가 있는 종료 시각: {{SEED_REPLAY_END_TIME}}

값이 `(미제공)` 이면 사람이 알려주지 않은 것이다. 그 경우 임의 날짜를
시도하지 말고 매핑 표 비고에 "시드 데이터 범위 미제공으로 데이터 검증
불가" 라고 적고 넘어가라.

위 정보로 로그인 후 탐색을 시작하세요. 산출물은 마크다운 한 덩어리로
출력하며, 그 마크다운이 그대로 다음 단계의 입력이 됩니다.
