# 스레드 편집 줄 수 — tasks

순서: PoC → 형식과 픽스처 → 순수 함수 → 정규화(I/O) → UI → 승격. `[commit]`은 커밋 경계다.

## T0. provider별 편집 결과 PoC

- Claude Code(최소 2.1.284와 현재 버전), Codex(최소 0.158.0과 현재 버전), Cursor, Copilot, Antigravity로 실제 편집 턴을 돌려 프레임을 녹화한다.
  - 녹화 대상: Edit, MultiEdit(Claude), `replace_all`(Claude), 새 파일 Write, 기존 파일 덮어쓰기, 파일 삭제, 거부(Deny), 실패한 편집, Codex fileChange에 경로가 여러 개인 항목.
  - 실제 로그인은 임시 홈에 복제해 쓰고, 끝나면 복제본을 지운다(AGENTS.md 'Real agent sign-ins').
  - 스크립트는 `.scratch/thread-edit-lines/`에 둔다.
- provider별 통과 기준:
  - Claude: 편집 결과의 user 프레임에 `tool_use_result.structuredPatch`가 있고, 그 `+`/`-` 줄 수가 실제 파일 변화와 같다.
  - Codex: `item/completed` fileChange의 `changes[].diff`가 hunk를 가진 unified diff이고, `+`/`-` 줄 수가 실제 변화와 같다.
  - ACP: 완료까지 받은 갱신 중 하나에 `type: "diff"` content가 있고, `oldText`/`newText`가 편집 전후 파일 내용과 같다. 그 content가 몇 번째 갱신에 오는지도 기록한다.
  - 기준을 만족하지 못한 provider는 범위에서 빼고 BACKLOG 항목으로 옮긴다.
- 결과를 design.md '데이터 흐름'과 spec.md 완료 조건 1(고정된 목록)에 반영한다.
- 검증: 녹화한 프레임이 `app/src/main/conversation/fixtures/`에 더미 경로로 들어가고, 각 provider의 관찰 결과(통과·실패, 버전, 날짜)가 design.md에 적혀 있다. 녹화 실행 명령은 정해져 있지 않다 — 사용자 확인 필요. `/orchestrate`의 PoC 배치를 시작할 때 conductor가 사용자에게 묻는다.
- `[commit]` 픽스처와 spec.md·design.md 갱신.

## T1. 형식: `activity.callId`와 `activity.result`

- `types.ts`에 이벤트 타입을 추가하고, `store.ts` `payload`에서 검사한다.
  - `callId`는 비어 있지 않은 문자열이고 `LIMITS.label` 안이다.
  - `path`는 `activity`의 `path`와 같은 검사(`str`)를 쓴다.
  - `lines.added`/`lines.removed`는 `Number.isSafeInteger`이고 0 이상이다.
- 테스트 파일: 새 `app/src/main/conversation/activityResult.test.ts`. 기존 `contextUsage.test.ts`가 이벤트 검사를 고정하는 방식을 따른다.
- 검증: `npm --prefix app test`에서 다음이 확인된다.
  - 새 이벤트를 받아들인다.
  - 음수, 소수, `1e400`, 빈 `callId`, 한도를 넘는 `callId`, `callId` 없는 `activity.result`를 거부한다.
  - `callId` 없는 기존 `activity`와 `\n`이 든 `callId`는 그대로 읽는다.
  - `activity.result` 대신 모르는 타입이 든 히스토리는 `parse`에서 통째로 실패하고, 파일이 다시 쓰이지 않는다(이전 Doan이 겪는 상황을 재현한다).
- `[commit]` `test:` → `feat:`

## T2. 순수 함수: 줄 수 세기와 표시

- `countUnifiedDiff`, `countStructuredPatch`, `countTextChange`(앞뒤 자르기, Myers, `EDIT_LINES_MAX`·`EDIT_DISTANCE_MAX`), `editLinesLabel`, 머리 이름 함수.
- 검증: `npm --prefix app test`에서 T0 녹화 프레임에서 뽑은 입력과 다음 경계 사례가 기대값과 같다.
  - 새 파일, 파일 삭제, 빈 파일, 줄바꿈 없는 마지막 줄, CRLF와 LF가 섞인 텍스트
  - `--`로 시작하는 삭제 줄, 헤더만 있는 diff, "Binary files … differ"(`null`)
  - MultiEdit와 `replace_all`의 여러 hunk
  - 한도 초과(`null`)
  - 5,000줄 캔버스를 통째로 다시 쓴 경우: D 상한 때문에 `null`이 되고, 정해진 시간(예: 50 ms) 안에 끝난다
  - `+12 −0`, `+0 −0`, `+12,345`, 단수형 이름
- `[commit]` `test:` → `feat:`

## T3. 정규화: provider별 `callId`와 `activity.result` 기록

- Claude Code(`transport.ts`의 tool_use·tool_result, edit id 집합), Codex(`transport.ts` fileChange `item/completed`), ACP(`acp.ts`, `AcpTool`의 마지막 diff content 보관과 완료 시 계산)에서 기록한다. 적용되지 않은 편집(거부, 실패, `declined`)에는 기록하지 않는다.
- 검증: `npm --prefix app test`에서 다음이 확인된다.
  - T0 녹화 프레임을 넣은 `transport.test.ts`·`acp.test.ts`가 기대한 이벤트 순서와 숫자를 낸다.
  - 거부·실패 프레임에서는 `activity.result`가 나오지 않는다.
  - `tool_result`가 둘인 Claude 프레임에서는 세지 않는다.
  - 한도를 넘는 id나 `\0`이 든 id에서는 `callId`와 결과를 만들지 않는다. 턴은 계속된다.
  - Codex 항목에 같은 경로가 두 번 나오면 결과도 두 번 나온다.
  - 대화를 지운 뒤 도착한 결과가 히스토리 파일을 다시 만들지 않는다(`service.*.test.ts`).
  - `drawn.test.ts`와 `service.drawn.test.ts`가 그대로 통과한다.
- `[commit]` `test:` → `feat:`

## T4. UI 드래프트

- `/design-draft`로 펼친 단계와 접힌 머리의 줄 수 표시를 그린다. 다음을 포함한다.
  - 캔버스 패널 347과 최소 폭 280, Overview 720, 프로토타입 창의 대화 패널
  - 긴 경로, 0인 쪽, 큰 숫자, 일부만 아는 행, 진행 중 머리
- 사용자가 앱에서 드래프트를 확인한다.
- 검증: `doan check`가 통과하고, `doan ls`에 드래프트가 나오고, 사용자 확인을 받는다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다).

## T5. renderer: 단계, 머리 합계, 턴 인디케이터

- `threadItems.ts`에서 결과를 단계에 붙이고 머리 합계를 계산한다.
- `turnStatus.ts`에서 `activity.result`를 `lastSeq` 계산에서 빼고, 머리를 구조로 바꾼다.
- `ConversationThread.tsx`와 `styles.css`에서 그린다. 스크린리더 이름을 붙인다.
- 검증: `npm --prefix app test`에서 다음이 통과한다.
  - `threadItems.test.ts`: 키 매칭, Codex 경로별 매칭, 같은 키 합산, 키가 맞는 activity가 없는 결과와 다른 턴의 결과 무시, 줄 수 없는 행의 머리 유지, 일부만 아는 행의 합계, 진행 중 머리에 합계 없음
  - `turnStatus.test.ts`: `activity.result` 뒤에도 다른 도구의 stage가 유지되고, 회전하지 않는 마지막 행이 합계를 유지한다
  - `state.test.ts`·`summary.test.ts`와 새 `seenEvents.test.ts`(지금은 없다): `activity.result`가 안 본 끝, 턴 상태, 미리보기를 바꾸지 않는다
  - `ConversationThread.test.tsx`: 마크업, 단계와 머리의 접근성 이름, 복사 텍스트가 "Edited a.ts +12 −3"이다
  - `npm --prefix app run typecheck`와 `npm --prefix app run lint`도 통과한다.
- `/design-sync`로 드래프트와 실제 앱의 computed style을 맞추고, `docs/design/conversation.md`에 측정값을 기록한다. 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`로 격리된 실제 앱에서 Claude Code 또는 Codex 편집 턴 하나를 확인한다. 검증: 단계와 머리에 숫자가 보이고, 숫자가 도착할 때 스레드의 스크롤 높이가 바뀌지 않는다. 스크린샷은 `.scratch/`에 저장한다. 직접 확인하지 못한 화면(프로토타입 창 등)은 T6에서 BACKLOG에 남긴다.
- `[commit]` `test:` → `feat:` → `docs(design):`

## T6. 승격과 정리

- `docs/PRODUCT.md` §5 item 3(activity 행 규칙)에 편집 줄 수 표시 규칙을 현재 규칙으로 쓴다. 진행 중 머리, 합계가 늘어나는 것, 늦게 온 숫자를 알리지 않는 것, 모르는 값의 경우를 포함한다.
- `docs/ARCHITECTURE.md` 'Device-local storage and limits'에 `activity.callId`, `activity.result`, "이전 Doan은 `activity.result`가 든 히스토리를 읽지 못한다"를 추가한다.
- T0에서 확인하지 못한 provider와 미검증 화면은 `docs/BACKLOG.md`에 남긴다. inline diff 본문과 턴 끝 요약 카드는 BACKLOG 아이디어로 남긴다.
- `/agent-eval`은 하지 않는다. 안내, CLI 출력, `doan check` 규칙, 스킬 stub이 바뀌지 않기 때문이다. 이 이유를 PR 본문에 적는다.
- `docs/features/thread-edit-lines/`를 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과하고, PRODUCT와 ARCHITECTURE 본문에 `docs/features/` 참조가 없다.
- `[commit]` 문서마다 따로(`docs(PRODUCT):`, `docs(ARCHITECTURE):`, `docs(BACKLOG):`, `docs(feature):`).
