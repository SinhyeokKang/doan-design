# 프레임 우선 선택 작업

- [ ] 1. `/feature-review`로 상태표를 검토하고 `/design-draft`에서 프레임·요소·중첩·가리킴·해제 상태를 그려 사용자 확인을 받는다. 검증: `doan check --repo . --json`과 `doan ls --repo . --json`.
- [ ] 2. 순수 선택·Esc·hover·복구 전이 테스트를 먼저 작성한다. 검증: `npm --prefix app test`에서 새 동작의 red와 Picker 기존 동작을 구분한다.
- [ ] 3. canvasScript와 controller에 전이를 연결하고 메시지 검증·단일 선택 투영을 유지한다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`. **구현 커밋 경계**.
- [ ] 4. `/design-sync`와 `/runtime-test`로 실제 클릭·Esc·중첩·Option-click·Picker·재로드를 확인하고 `/code-review` 후 게이트를 실행한다. 검증: 격리된 `DOAN_CLI=<abs path to doan> npm --prefix app run dev -- -- --user-data-dir=<tmp>` probe와 `node .agents/skills/verify/scripts/verify.mjs`. probe는 AGENTS.md의 HOME·SHELL·에이전트 설정 격리를 적용한다.
- [ ] 5. PRODUCT §5 item 4와 ARCHITECTURE §3의 구현된 선택 규칙을 영문으로 승격하고 이 디렉터리를 삭제한다. 검증: 완료 조건별 상태 전이 증거와 Picker 비변경 증거를 대조한다. **문서별 커밋 경계**.
