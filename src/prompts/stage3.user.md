# 2단계 산출물 (선택된 플로우)

아래는 2단계가 결정한 우선순위 플로우와 검증 포인트입니다.

---

{{STAGE2_OUTPUT}}

---

# 환경
- TARGET_URL: {{TARGET_URL}}
- LOGIN_URL: {{LOGIN_URL}}
- 테스트 계정 이메일: {{TEST_EMAIL}}
- 비밀번호: `process.env.TEST_PASSWORD`에 주입되어 있음 (테스트 코드에서 그대로 사용)

# 시드 데이터 환경변수 (필요 시 spec 에서 그대로 사용)
- `process.env.SEED_REPLAY_DATE` (예: "{{SEED_REPLAY_DATE}}")
- `process.env.SEED_REPLAY_START_TIME` (예: "{{SEED_REPLAY_START_TIME}}")
- `process.env.SEED_REPLAY_END_TIME` (예: "{{SEED_REPLAY_END_TIME}}")
- `process.env.SEED_LOG_COUNT`, `process.env.SEED_LOG_KEYWORD`

값이 `(미제공)` 이면 spec 에서도 그대로 미사용. 시드가 필요한 페이지면
spec 작성을 보류하고 사람에게 알려라 (가드레일).

지금 테스트 작성을 시작하세요.
