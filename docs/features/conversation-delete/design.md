# conversation-delete — design

spec의 완료 조건을 main(저장소·서비스·IPC)과 renderer(두 제목 메뉴·확인 알림·화면 전환)로 나눈다. spec의 결정 5~9를 따른다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| app main 저장소 | `app/src/main/conversation/store.ts` | `delete(id)`: index 항목을 뺀 index를 저장(commit 지점)한 뒤 `<id>.jsonl`을 지운다. 생성자에서 복구 뒤 고아 기록을 지운다 |
| app main queue·초안 | `app/src/main/conversation/drafts.ts` | `discard(id)`: 그 대화의 `queued`와 `returned`를 지우고 저장한다 |
| app main 서비스 | `app/src/main/conversation/service.ts` | `delete(id)`: 판단, 실행 정리, 저장소·초안 삭제, `listChanged` |
| app main IPC | `ipc.ts`, `app/src/main/index.ts`, `app/src/preload/index.ts` | `conversation:delete {conversationId}` 채널. 성공하면 main이 그 대화의 알림을 닫는다 |
| app main 알림 | `app/src/main/notifyService.ts` | 대화 하나의 알림을 닫고 잊는 메서드(지금의 `held` 맵 정리) |
| renderer 규칙 | `overviewConversation.ts`, `canvasConversation.ts`, 새 `conversationDelete.ts` | 삭제 가능 여부와 이유, 확인 알림 문구, 삭제 뒤 화면 상태 |
| renderer 실행 | `overviewRun.ts`, `canvasRun.ts`, `conversationStore.ts` | 삭제 성공 뒤 보이던 대화 해제, 초안·thread 정리, ui-state 기억 해제 |
| renderer UI | `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, 확인 알림 컴포넌트, `styles.css` | 행 메뉴 버튼과 하위 메뉴, 확인 알림, 포커스 |
| CLI·skill·`doan check` | 없음 | |

## 2. main

### 2.1 저장소 `ConversationStore.delete(id)`

순서:

1. `recover()`로 남은 journal을 먼저 처리한다. index를 읽을 수 없으면 예외(채널은 `unknown`).
2. 항목이 없으면 `not_found`.
3. 그 항목을 뺀 목록으로 `save()`한다. index rename이 commit 지점이다.
4. `<id>.jsonl`을 지운다. 없으면(ENOENT) 성공으로 본다. 다른 실패는 기록만 하고 성공으로 본다. index가 이미 commit돼 그 기록은 아무 곳에서도 읽히지 않고, 다음 실행의 정리가 지운다.

journal(`start-undo.json`)을 쓰지 않는 이유: 삭제는 기존 로그를 바꾸지 않고, 바뀌는 파일은 index 하나뿐이다. index 앞에 로그를 지우면 index가 없는 기록을 가리켜 `readRequired`가 실패하고 목록 전체가 읽기 실패가 되므로, 순서는 반드시 index 먼저다.

**고아 기록 정리** (spec 완료 조건 10): 생성자의 `recover()` 뒤, index를 읽을 수 있을 때만 `conversations/`에서 이름이 `<validId>.jsonl`이고 index에 없는 정규 파일을 지운다. 복구가 끝난 뒤에는 commit되지 않은 start의 로그가 남지 않으므로(복구가 그것을 지운다), index에 없는 로그는 삭제가 남긴 것뿐이다. 링크·정규 파일이 아닌 것·`index-*.tmp`·`undo-*.tmp`·`start-undo.json`은 건드리지 않는다. index를 읽을 수 없거나 새 버전이면 정리하지 않는다(앞선 결정: 읽을 수 없는 index는 빈 목록으로 다루지 않는다).

### 2.2 초안 `DraftStore.discard(id)`

`queued[id]`와 `returned[id]`를 지우고 temp file + rename으로 저장한다. 삭제는 `working`이 아닐 때만 하므로 `sending` 표시가 붙은 항목은 남아 있지 않다. 그래도 남아 있으면 같이 지운다. 그 메시지는 이미 보냈고 기록은 대화와 함께 사라진다.

### 2.3 서비스 `ConversationService.delete(id)`

1. `quitting`이면 `busy`.
2. `this.working(id)`이거나 live entry가 `busy`이면 `busy`. 기준은 목록의 `working`과 같다: preparing·running·waiting, 판정을 기다리는 project 턴, 나갈 차례인 queue, 이전 프로세스나 판정을 기다리는 send.
3. metadata가 없으면 `not_found`.
4. 실행 정리: 지금의 `archive(id)`처럼 live runner를 닫는다(현재 대화로 재사용되던 idle Codex server 포함). `dropEvidence`, `cancelWait`도 같다. 프로세스 그룹이 아직 끝나는 중이면 reservation은 지금처럼 종료 때 풀린다. live entry는 `terminal`·`closed`로 표시해 늦게 오는 이벤트를 버리게 한다(`receive`는 `terminal`이면 버린다). 이 표시는 빠뜨릴 수 없다: `store.append`는 `O_CREAT`로 열기 때문에 늦은 이벤트 하나가 지운 `<id>.jsonl`을 다시 만든다. 종료 콜백이 reservation을 푼 뒤 live entry를 지운다. 같은 이유로 삭제 뒤 `<id>`로 들어오는 모든 append 경로(append를 부르는 서비스 메서드)는 metadata 확인을 먼저 거쳐야 하고, 테스트가 이를 고정한다.
5. `store.delete(id)` → `drafts.discard(id)` → `queuedExtras`에 남은 첨부 id 해제(`forget` + `files.release`) → `listChanged(root)`.

main은 single thread이고 2~5는 await 없이 이어 실행한다. 그래서 판단과 삭제 사이에 send가 끼어들 수 없다. 삭제 뒤의 send·queue·markSeen·setPermissionMode·read는 지금처럼 `not_found`나 빈 기록을 받는다. 이미 await 중인 send는 `checkSend`와 `metadata(id)` 재확인에서 `not_found`로 거절된다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn'의 재확인 규칙). 다만 2에서 그런 send는 `working`이라 삭제가 먼저 거절된다.

### 2.4 IPC `conversation:delete`

- 요청 `{conversationId}`: `ipc.ts`의 기존 opaque id 검증. 답은 `undefined` 또는 `{error: "busy" | "not_found" | "unknown"}`. 세 코드는 이미 `known`에 있거나 같은 방식으로 추가한다.
- 성공 뒤 `index.ts`가 `notify`에서 그 대화의 알림을 닫고 잊는다. 지금 알림 클릭은 찾지 못하는 대화를 그 프로젝트의 Overview로 보내지만(PRODUCT §5 item 0 'Notifications'), 지운 대화의 알림이 남아 있을 이유가 없다.
- 채널 목록과 모양의 정본은 코드다(ARCHITECTURE §7 'IPC contract').

## 3. renderer

### 3.1 순수 규칙 (`conversationDelete.ts`)

- `deleteAvailability(summary)` → `{ available: true } | { available: false; reason }`.
  - `summary.phase === "waiting"` → `Can’t delete while the agent waits for your answer.`
  - `summary.working || summary.phase === "running"` → `Can’t delete while the agent is working.`
  - 그 밖(끝난 대화, 보관된 대화, 읽기 실패 대화, 되돌아온 초안이 있는 대화) → 사용 가능. 읽을 수 없는 대화도 지울 수 있어야 복구 수단이 된다.
- `deleteDialogView(title, provider)` → `{ title, body }`.
  - 제목: `Delete “<title>”?`. title은 앞뒤 공백을 걷고 줄바꿈을 공백 하나로 바꾼 뒤 60 code point를 넘으면 잘라 `…`을 붙인다(제목은 첫 메시지에서 나와 32,768 code unit까지 길 수 있다). 빈 제목은 `Delete this conversation?`.
  - 본문: `Doan removes this conversation and its history from this device. <Provider>’s own session files aren’t changed. You can’t undo this.` `<Provider>`는 `PROVIDER_NAMES`.
  - 문구는 copy 확인 대상이다(clarify preset: 확인되지 않은 결과를 약속하지 않는다. 여기서 약속하는 것은 Doan 기록 삭제와 provider 파일 미변경뿐이고 둘 다 2.1~2.3이 보장한다).
- `deleteRefusalText(code)` → 토스트 문구. `busy`: `Couldn’t delete the conversation. The agent started working on it.` / `not_found`: `This conversation was already deleted.` / 그 밖: `Couldn’t delete the conversation.`
- `MenuItem`에 `deletable`(위 결과)를 더한다. `menuItem()`이 두 메뉴에 같은 값을 준다.

### 3.2 삭제 뒤 화면 상태

삭제는 사람이 확인 알림에서 확정한 그 창에서만 일어난다(창은 하나). 그래서 renderer는 성공 답을 받으면 목록 알림을 기다리지 않고 바로 정리한다. 목록 알림이 늦게 오거나 먼저 와도 결과가 같아야 한다.

- `ConversationStore`: 그 대화의 초안 key(`draftKey({kind:"existing", conversationId})`), 되돌아온 초안, thread, queue 표시를 지운다(`dropDrafts`와 같은 방식). 새 대화 초안은 건드리지 않는다(spec 결정 5).
- `OverviewRun.deleted(root, id)`: 그 root의 main conversation이 `id`이면 `{conversationId: null, listed: false}`로 바꾸고 `revision`을 올린다. 기억(`remember`)이 `id`이면 `null`로 지운다. 요청 중인 pick이 `id`이면 버린다. 그래서 `pickOverviewConversation`이 목록에 없는 요청을 `reread`로 다시 읽는 일이 없다.
- `CanvasRun.deleted(id)`: `shown`, `request`, `unconfirmed`가 `id`인 캔버스 상태를 새 대화 상태(`shown = null`)로 바꾸고 `revision`을 올린다. 캔버스 현재 대화가 사라진 뒤에도 `pickCanvasConversation`은 "현재 대화가 없으면 새 대화 상태"를 고르므로 보관된 대화를 고르지 않는다(spec 완료 조건 7). 이 성질을 테스트로 고정한다.
- `revision`을 올리므로 삭제 전에 나간 start·send 답은 새 대화 상태를 덮지 못한다(POSTMORTEM 2026-10-26 'The invalidation read overtook the reply to the person's own Reopen'와 ARCHITECTURE §7의 revision 규칙).
- seen 표시(`seen` 집합), 사이드바 slot, Canvas conversations 행, strip, Edit on Home은 main 목록에서 오므로 `listChanged` 뒤 다시 읽은 목록에서 사라진다. 로컬 seen 집합에 남은 id는 목록에 없으므로 영향이 없지만 같이 지운다.

### 3.3 행 메뉴 버튼 (두 제목 메뉴)

- 구조: 대화 행마다 wrapper(`conv-row`, `position: relative`) 안에 지금의 `DropdownMenu.RadioItem`과 그 형제인 `DropdownMenu.Sub`를 둔다. `SubTrigger`가 메뉴 버튼(`aria-label="<title> menu"`, 16px Ellipsis)이고 행의 시간 자리에 절대 위치한다. `SubContent`는 Delete 한 항목이다(Trash2 아이콘). 버튼이 RadioItem 안이 아니라 형제이므로 버튼 클릭은 행 선택이 아니다. 메뉴 항목 안에 interactive 요소를 중첩하지 않는다(menuitem 안의 button은 ARIA에 맞지 않는다).
- 키보드: Radix roving 순서가 DOM 순서이므로 ↓는 행 → 그 행의 버튼 → 다음 행 순서다. 버튼에서 →·Enter·Space가 하위 메뉴를 열고 첫 항목을 하이라이트한다. ←·Esc가 하위 메뉴를 닫고 하이라이트를 버튼으로 돌린다. Typeahead는 `textValue`가 있는 행에만 걸리도록 버튼의 `textValue`를 비운다.
- 보이는 조건: 행 hover, 행이나 버튼의 `data-highlighted`, 하위 메뉴 열림(`data-state="open"`). 숨은 동안은 `display: none`이 아니라 1×1 clip으로 숨긴다(POSTMORTEM 2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body': Radix가 포커스를 돌려줄 대상은 box가 있어야 한다). 버튼이 보이는 동안 시간(`cv-when`)의 보이는 글자는 같은 clip으로 숨기고 `sr-only` 라벨은 남긴다. 상태 표시(`StatusMark`)는 그대로 둔다.
- Delete 항목이 사용 불가이면 `aria-disabled`, 이유 줄 `aria-describedby`, 방향키로 닿음(DESIGN 'Unavailable item'). 고르면 아무 일도 없다(`preventDefault`).
- Delete를 고르면: 두 메뉴가 닫히고, 그 대화의 id·title·provider를 들고 확인 알림을 연다. 메뉴의 `onCloseAutoFocus`는 이 경우 기본 포커스 반환을 막는다(알림이 포커스를 가져간다).
- 목록 읽기 실패(`list === "error"`)와 읽는 중에는 행이 없으므로 버튼도 없다.
- 크기·색은 `/design-draft`가 그리고 `/design-sync`가 잰다. 기준값: 버튼 24×24 안팎(행 높이 안), 캔버스 행 버튼과 같은 Ellipsis·ink. Conversation menu 폭 360(DESIGN 'Project Overview')은 바꾸지 않는다.

### 3.4 확인 알림

- `CanvasTrashDialog`와 같은 compact `alertdialog`(`doan-dialog` `data-ui-size="compact"`, `showModal`, `onCancel`은 Cancel과 같음). Cancel(subtle, autoFocus)과 Delete(prominent, Move to Trash와 같은 검은 채움, spec 결정 9). Remove from Doan의 확인 알림과 같은 모양을 쓴다. 공통 컴포넌트가 이미 있으면 그것을 쓰고, 없으면 `CanvasTrashDialog`의 구조를 따른다(새 추상화를 만들지 않는다). `role="alertdialog"`, `aria-labelledby`·`aria-describedby`를 붙이고 테스트와 포커스 guard는 클래스가 아니라 role로 찾는다(POSTMORTEM 2026-10-30 'Removing a shared dialog class silently disabled two focus guards'). 확정 버튼 이름은 메뉴 항목과 같은 Delete다.
- 알림이 열려 있는 동안 대화가 일을 시작하는 경로는 없다(모달이 composer를 막는다). 그래도 렌더 중 `deleteAvailability`가 불가로 바뀌면 Delete를 `aria-disabled`로 바꾸고 이유를 `doan-notice`로 보인다(`trashBlock`과 같은 방식). main이 확정 때 다시 판단한다.
- Delete: 버튼을 `aria-disabled`로 바꾸고 `conversation:delete`를 부른다. 성공하면 알림을 닫고 3.2를 적용한 뒤 그 화면의 composer에 포커스한다. 거절·실패하면 알림을 닫고 `deleteRefusalText` 토스트를 띄우고 제목 메뉴 trigger에 포커스한다.
- Cancel·Esc: 알림을 닫고 제목 메뉴 trigger에 포커스한다(행 버튼은 닫힌 메뉴 안에 있어 돌아갈 수 없다).
- 다시 읽기·창 닫기·종료가 알림 중에 일어나면 알림은 사라지고 아무것도 지우지 않는다. 지연 삭제가 없으므로 재시작·reload 창(window)에 대한 규칙이 따로 필요 없다.
- `doan://` 링크가 알림 중에 오면 기존 규칙대로 Cancel처럼 닫고 이동한다(PRODUCT §5 item 3 'Deep links').

## 4. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수 | 위치 | 고정할 사례 |
|---|---|---|
| `deleteEntries(entries, id)` | `store.ts` | 항목 하나만 빠짐, 없는 id는 null, 다른 항목의 `state`·`canvas`는 그대로(보관된 대화가 current로 바뀌지 않음) |
| `orphanHistories(names, indexIds)` | `store.ts` | `<validId>.jsonl`만, index에 있는 id·tmp·journal·잘못된 id는 제외, 대소문자는 정확히 비교 |
| `deleteAvailability(summary)` | `conversationDelete.ts` | waiting, running, `working`(판정 대기·queue), ended, archived, readError, returnedDraft |
| `deleteDialogView(title, provider)` | `conversationDelete.ts` | 60 code point 경계(서로게이트 쌍), 줄바꿈, 빈 제목, provider 이름 |
| `deleteRefusalText(code)` | `conversationDelete.ts` | busy, not_found, 그 밖 |
| `menuItem` / `canvasConversationMenu` / `projectConversationMenu`의 `deletable` | `overviewConversation.ts`, `canvasConversation.ts` | 두 메뉴가 같은 값 |
| `OverviewRun.deleted`, `CanvasRun.deleted` | `overviewRun.ts`, `canvasRun.ts` (DOM 없음) | 보이던 대화 → 새 상태, 기억 해제, 요청 해제, revision, 늦은 start 답 무시, 목록 알림 선후 무관, 다른 대화는 그대로 |

저장소·서비스(I/O 있음)는 실제 임시 디렉터리로 테스트한다: index 저장 뒤 unlink 실패, 생성자 정리, 복구 중인 journal과의 순서, working·quitting 거절, idle Codex runner 닫힘, 늦은 이벤트 무시, drafts 정리.

## 5. 형식 변경

- JSON Schema 정본(ARCHITECTURE §11 'Shared formats')은 바뀌지 않는다. `v`도 그대로다.
- `index.json` v2, event JSONL v1, `drafts.json` 모양은 그대로다. 항목과 파일이 사라질 뿐이다.
- 새 앱 IPC 채널 `conversation:delete`. 앱 내부 계약이라 공유 fixture는 없다. `ipc.test.ts`, `preload/index.test.ts`가 모양을 고정한다.
- CLI 응답·`runtime.json`·앱 socket 메시지는 바뀌지 않는다.

## 6. Conventions 영향

없음. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. guide·skill stub도 그대로라 `/agent-eval`은 필요 없다.

## 7. 결정 영향

- **append-only 이벤트**(ARCHITECTURE §7 'Events'): 살아 있는 기록 안의 이벤트는 여전히 다시 쓰거나 자르지 않는다. 삭제는 기록 파일 전체와 index 항목을 함께 없애는 것이고, 삭제 이벤트를 append하지 않는다(파일이 사라지므로 남길 곳이 없다). 기존 truncate는 journal 복구에만 쓰이는 그대로다. 승격 때 'Events'에 "a deletion removes the whole history with its index entry; no event is rewritten"을 적는다.
- **기록 위치**(PRODUCT §3 In scope 6 "Session associations and conversation events stay on this device"): 그대로다. 삭제는 이 기기의 기록을 지울 뿐 저장 위치를 바꾸지 않는다.
- **Undo journal**: 삭제는 journal을 쓰지 않는다(2.1). 진행 중인 journal은 삭제 전에 복구한다.
- **"Doan never forks or takes over a session"**: 에이전트 세션 파일을 건드리지 않으므로 그대로다.
- **No git operations**: 대화 기록은 repo 밖(userData)이라 해당 없다.
- **Remove from Doan 확인 알림**: 사용자가 Remove from Doan도 확인 알림으로 바꿨다고 했지만 PRODUCT §5 item 1은 아직 "eight-second Undo toast"라고 적혀 있다. 그 변경은 다른 작업의 범위다. 이 feature는 같은 모양의 알림을 쓰되 그 작업에 의존하지 않는다(`CanvasTrashDialog` 구조로 충분하다).

## 8. PoC 의존

새 외부 동작에 기대지 않는다. 증명되지 않은 가정은 하나다: Radix `DropdownMenu.RadioGroup` 안에 `RadioItem`과 형제 `Sub`를 두고 `SubTrigger`를 절대 위치로 겹쳐도 roving 순서·hover 하이라이트·포커스 반환이 3.3대로 동작한다. 단위 테스트(jsdom)는 레이아웃과 하이라이트를 확인할 수 없으므로(POSTMORTEM 2026-11-03, 2026-11-02 'Every Overview menu opened under the Overview itself') UI task 첫 단계에서 실제 앱으로 확인한다(tasks T4).

## 9. POSTMORTEM에서 가져온 함정

- **2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body'**: 숨은 메뉴 trigger를 `display: none`으로 숨기면 Radix의 포커스 반환이 조용히 실패한다. 3.3의 clip 규칙과 CSS 테스트로 막는다.
- **2026-11-02 'Every Overview menu opened under the Overview itself'**: portalled 메뉴는 `.doan-floating` z-index 규칙에 기댄다. 하위 메뉴(`SubContent`)도 같은 클래스를 써야 하고, 실제 앱 probe에서 스크린샷으로 확인한다.
- **2026-10-27 'A rejected conversation replacement had already changed current history'**: index rename이 commit 지점이다. 삭제도 index를 먼저 저장하고 로그를 나중에 지운다.
- **2026-10-27 'Awaited conversation work outlived its current turn'**: await 뒤에 metadata와 live identity를 다시 확인한다. 삭제 뒤 늦은 이벤트·send는 `not_found`로 끝나야 한다.
- **2026-10-26 'The invalidation read overtook the reply to the person's own Reopen'**: 삭제 뒤 화면 상태는 revision으로 늦은 답을 막는다.
- **2026-10-25 'Removing a project retained its remembered canvas'**: id로 기억하는 상태(ui-state의 Overview 기억, CanvasRun의 요청)는 삭제 때 같이 지운다.

## 10. 읽은 design preset

`harden`(사용 불가 상태, 실패·거절, 긴 제목), `clarify`(확인 알림·거절 토스트 문구, 확인되지 않은 결과 약속 금지).
