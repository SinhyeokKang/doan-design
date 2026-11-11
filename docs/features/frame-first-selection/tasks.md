# 프레임 우선 선택 작업

## 검증표

| 경계 | 검증 |
|---|---|
| 선택·이동 | spec 상태표의 모든 클릭·Esc, 서랍 직접 선택, Quick Open·Locate의 선택 비변경 |
| 정체성·재로드 | 중복 프레임 ID의 selector 복구, 같은 ID 노드 교체, 요소 재부모화, 조상 프레임 제거·속성 제거 |
| 해제·순서 | Hand·Picker·캔버스 전환·소실 뒤 진입 기준 없음, Esc 뒤 이전 응답 거부, hover와 선택 seq 분리 |
| modifier·포커스 | 정지 포인터의 ⌘ press/release·연속 클릭, ⌘Tab·blur·앱/iframe 전환, Option+⌘, Picker+⌘+Shift, Hand·Space·Capture 중 ⌘ |
| 캔버스 조작 | ⌘클릭의 링크·입력 미실행, Option-click 입력 후 일반 선택 복귀, tooltip·메뉴·IME가 Esc를 먼저 처리하면 한 번에 두 단계 진행하지 않음 |
| 실제 CLI | 각 선택·Esc·전체 해제 뒤 격리 `doan active` 결과가 화면의 단일 선택과 일치 |

## 작업 순서

- [x] 1. `/feature-review`로 상태표를 검토하고 `/design-draft`에서 프레임·요소·중첩·가리킴·해제 상태를 그려 사용자 확인을 받는다. 검증: `doan check --repo . --json`과 `doan ls --repo . --json`.
- [ ] 2. 순수 선택·Esc·hover·⌘직접 선택·복구 전이 테스트를 검증표대로 먼저 작성한다. 검증: `npm --prefix app test`에서 새 동작의 red와 Picker 기존 동작을 구분한다.
- [ ] 3. canvasScript와 controller에 전이를 연결하고 메시지 검증·단일 선택 투영을 유지한다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`. **구현 커밋 경계**.
- [ ] 4. `/design-sync`와 `/runtime-test`로 검증표의 실제 입력·재로드를 확인하고 `/code-review` 후 게이트를 실행한다. 검증: 격리된 `DOAN_CLI=<abs path to doan> npm --prefix app run dev -- -- --user-data-dir=<tmp>` probe, 각 단계의 `DOAN_RUNTIME=<absolute temp userData>/runtime.json <absolute CLI> active --json --repo <absolute temp repo>`, `node .agents/skills/verify/scripts/verify.mjs`. probe는 AGENTS.md의 HOME·SHELL·에이전트 설정 격리를 적용한다.
- [ ] 5. PRODUCT §5 item 4와 ARCHITECTURE §3의 구현된 선택 규칙을 영문으로 승격하고 이 디렉터리를 삭제한다. 검증: 완료 조건별 상태 전이 증거와 Picker 비변경 증거를 대조한다. **문서별 커밋 경계**.
