# 스레드 편집 줄 수 — tasks

순서: PoC → 형식과 픽스처 → 순수 함수 → 정규화(I/O) → UI → 승격. `[commit]`은 커밋 경계다.

## T0. provider별 편집 결과 PoC

- Claude Code(최소 2.1.284와 현재 버전), Codex(최소 0.158.0과 현재 버전), Cursor, Copilot, Antigravity로 실제 편집 턴을 하나씩 돌려 프레임을 녹화한다. 녹화 대상은 Edit, 새 파일 Write, 기존 파일 덮어쓰기, 거부(Deny), 실패한 편집이다. 실제 로그인은 임시 홈에 복제해 쓰고, 끝나면 복제본을 지운다(AGENTS.md 'Real agent sign-ins'). 스크립트는 `.scratch/thread-edit-lines/`에 둔다.
- 확인할 것: Claude user 프레임의 `tool_use_result` 존재와 모양(`structuredPatch`, `type`, `userModified`), Codex `changes[].diff`의 형식과 `add`/`delete`일 때의 모양, Cursor `oldText`/`newText`의 실제 값, Copilot과 Antigravity가 완료된 편집에 diff content를 주는지.
- 결과를 design.md '데이터 흐름'에 반영한다. 편집 내용을 주지 않는 provider는 범위에서 빼고 BACKLOG 항목으로 옮긴다.
- 검증: 녹화한 프레임이 `app/src/main/conversation/fixtures/`에 더미 경로로 들어가고, 각 provider의 관찰 결과(통과·실패, 버전, 날짜)가 design.md에 적혀 있다. 실행 명령은 정해져 있지 않다 — 사용자 확인 필요(`/orchestrate`의 PoC 배치에서 정한다).
- `[commit]` 픽스처와 design.md 갱신.

## T1. 형식: `activity.callId`와 `activity.lines`

- `types.ts`에 이벤트 타입을 추가하고, `store.ts` `payload`에서 검사한다. `added`/`removed`는 `Number.isSafeInteger`이고 0 이상이어야 한다. `callId`는 비어 있지 않은 문자열이고 길이 한도 안이어야 한다.
- 검증: `npm --prefix app test`에서 store 테스트가 새 이벤트를 받아들이고, 음수·소수·`1e400`·빈 `callId`·`callId` 없는 `activity.lines`를 거부하며, `callId` 없는 기존 `activity`를 그대로 읽는다.
- `[commit]` `test:` → `feat:`

## T2. 순수 함수: 줄 수 세기

- `countUnifiedDiff`, `countStructuredPatch`, `countTextChange`(Myers, `EDIT_LINES_MAX` 한도), `editLinesLabel`.
- 검증: `npm --prefix app test`에서 T0 녹화 프레임에서 뽑은 입력과 경계 사례(새 파일, 삭제, 빈 파일, 줄바꿈 없는 마지막 줄, `--`로 시작하는 삭제 줄, 헤더만 있는 diff, 한도 초과는 `null`)가 기대값과 같다.
- `[commit]` `test:` → `feat:`

## T3. 정규화: provider별 `callId`와 `activity.lines` 기록

- Claude Code(`transport.ts` tool_use·tool_result), Codex(`transport.ts` fileChange `item/completed`), ACP(`acp.ts` 완료 갱신)에서 기록한다. 적용되지 않은 편집(거부, 실패, `declined`)에는 기록하지 않는다.
- 검증: `npm --prefix app test`에서 T0 녹화 프레임을 넣은 transport·acp 테스트가 기대한 이벤트 순서와 숫자를 낸다. 거부·실패 프레임에서는 `activity.lines`가 나오지 않는다. `canvas.drawn` 판정 테스트(`drawn.test.ts`, `service.drawn.test.ts`)가 그대로 통과한다.
- `[commit]` `test:` → `feat:`

## T4. UI 드래프트

- `/design-draft`로 펼친 단계와 접힌 머리의 줄 수 표시를 그린다. 패널 347과 최소 폭 280, Overview 720, 긴 경로, 0인 쪽 표시, 진행 중 머리를 포함한다. 사용자가 앱에서 드래프트를 확인한다.
- 검증: `doan check`가 통과하고, `doan ls`에 드래프트가 나온다. 사용자 확인을 받는다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다).

## T5. renderer: 단계와 머리 합계

- `threadItems.ts`에서 줄 수를 단계에 붙이고 머리 합계를 계산한다. `ConversationThread.tsx`와 `styles.css`에서 그린다. 스크린리더 이름을 넣는다.
- 검증: `npm --prefix app test`에서 `threadItems.test.ts`(키 매칭, Codex 경로별 매칭, 나중 이벤트 우선, 줄 수 없는 행의 머리 유지, 진행 중 머리에 합계 없음)와 `ConversationThread.test.tsx`(마크업, 접근성 이름)가 통과한다. `npm --prefix app run typecheck`와 `npm --prefix app run lint`도 통과한다.
- `/design-sync`로 드래프트와 실제 앱의 computed style을 맞추고, `docs/design/conversation.md`에 측정값을 기록한다.
- `/runtime-test`로 격리된 실제 앱에서 Claude Code 또는 Codex 편집 턴 하나를 확인한다.
- `[commit]` `test:` → `feat:` → `docs(design):`

## T6. 승격과 정리

- `docs/PRODUCT.md` §5 item 3(activity 행 규칙)에 편집 줄 수 표시 규칙을 현재 규칙으로 쓴다.
- `docs/ARCHITECTURE.md` 'Device-local storage and limits'에 `activity.callId`, `activity.lines`, "이전 Doan은 `activity.lines`가 든 히스토리를 읽지 못한다"를 추가한다.
- T0에서 확인하지 못한 provider와 미검증 화면은 `docs/BACKLOG.md`에 남긴다. inline diff 본문과 턴 끝 요약 카드는 BACKLOG 아이디어로 남긴다.
- `docs/features/thread-edit-lines/`를 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과하고, PRODUCT와 ARCHITECTURE 본문에 `docs/features/` 참조가 없다.
- `[commit]` 문서마다 따로(`docs(PRODUCT):`, `docs(ARCHITECTURE):`, `docs(BACKLOG):`, `docs(feature):`).
