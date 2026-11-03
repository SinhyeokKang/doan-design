# conversation-delete — design

spec의 완료 조건을 main(저장소·서비스·IPC)과 renderer(두 제목 메뉴·확인 알림·화면 전환)로 나눈다. spec의 결정 5~15를 따른다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| app main 저장소 | `app/src/main/conversation/store.ts` | `delete(id)`: index 항목을 뺀 index를 저장(commit 지점)한 뒤 `<id>.jsonl`을 지운다. 생성자에서 복구 뒤 고아 기록을 지운다 |
| app main queue·초안 | `app/src/main/conversation/drafts.ts` | `discard(id)`: 그 대화의 `queued`와 `returned`를 지우고 저장한다 |
| app main 서비스 | `app/src/main/conversation/service.ts` | `delete(id)`: 판단, 실행 정리, 저장소·초안 삭제, `listChanged` |
| app main IPC | `ipc.ts`, `app/src/main/index.ts`, `app/src/preload/index.ts` | `conversation:delete {conversationId}` 채널. 성공하면 main이 그 대화의 알림을 닫는다 |
| app main 알림 | `app/src/main/notifyService.ts` | 대화 하나의 알림을 닫고 잊는 메서드(지금의 `held` 맵 정리) |
| renderer 규칙 | `overviewConversation.ts`, `canvasConversation.ts`, 새 `conversationDelete.ts` | 삭제 가능 여부와 이유, 확인 알림 문구, 삭제 뒤 화면 상태 |
| renderer 실행 | `overviewRun.ts`, `canvasRun.ts`, `homeRun.ts`, `conversationStore.ts` | 삭제 중 표시, 삭제 성공 뒤 보이던 대화 해제, 초안·thread·늦은 이벤트 정리, strip·Edit on Home 정리, ui-state 기억 해제 |
| renderer UI | `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, 확인 알림 컴포넌트, `styles.css` | 행 Delete 버튼과 툴팁, 확인 알림, 포커스 |
| CLI·skill·`doan check` | 없음 | |

## 2. main

### 2.1 저장소 `ConversationStore.delete(id)`

순서:

1. `recover()`로 남은 journal을 먼저 처리한다. index를 읽을 수 없으면 예외(채널은 `unknown`).
2. 항목이 없으면 `not_found`.
3. 그 항목을 뺀 목록으로 `save()`한다. index rename이 commit 지점이다.
4. `<id>.jsonl`을 지운다. 없으면(ENOENT) 성공으로 본다. 다른 실패는 기록만 하고 성공으로 본다. index가 이미 commit돼 그 기록은 아무 곳에서도 읽히지 않고, 다음 실행의 정리가 지운다.

journal(`start-undo.json`)을 쓰지 않는 이유: 삭제는 기존 로그를 바꾸지 않고, 바뀌는 파일은 index 하나뿐이다. index 앞에 로그를 지우면 index가 없는 기록을 가리켜 그 항목의 `readRequired`가 실패하고 목록에 읽기 실패 대화(`readError`)로 남는다(`service.ts:406`). 그래서 순서는 반드시 index 먼저다.

**고아 기록 정리** (spec 완료 조건 10): 생성자의 `recover()` 뒤, index를 읽을 수 있을 때만 `conversations/`에서 이름이 `<validId>.jsonl`이고 index에 없는 정규 파일을 지운다. 복구가 끝난 뒤에는 commit되지 않은 start의 로그가 남지 않으므로(복구가 그것을 지운다), index에 없는 로그는 삭제가 남긴 것뿐이다. 링크·정규 파일이 아닌 것·`index-*.tmp`·`undo-*.tmp`·`start-undo.json`은 건드리지 않는다. index를 읽을 수 없거나 새 버전이면 정리하지 않는다(앞선 결정: 읽을 수 없는 index는 빈 목록으로 다루지 않는다). index.json이 없을 때(ENOENT)도 정리하지 않는다. `readIndex`는 ENOENT를 `[]`로 돌려주므로(`store.ts:183`), 이를 구분하지 않으면 index를 잃은 기기에서 시작하자마자 모든 기록을 지운다. 파일명 비교는 대소문자를 무시한다. store는 id 충돌을 대소문자 없이 보고(`store.ts:133`, `:157`) macOS 파일 시스템도 대소문자를 구분하지 않으므로, 정확히 비교하면 살아 있는 기록을 고아로 보고 지울 수 있다.

### 2.2 초안 `DraftStore.discard(id)`

`queued[id]`와 `returned[id]`를 지우고 temp file + rename으로 저장한다. 삭제는 `working`이 아닐 때만 하므로 `sending` 표시가 붙은 항목은 남아 있지 않다. 그래도 남아 있으면 같이 지운다. 그 메시지는 이미 보냈고 기록은 대화와 함께 사라진다. `save()`는 실패를 삼키고(`drafts.ts:174`) `broken`이면 쓰기가 no-op이다(`drafts.ts:197`). 삭제는 index commit 뒤라 이 실패는 삭제 실패가 아니다(2.3 단계 5).

**고아 초안 정리**(spec 결정 14): 서비스 시작 때, 저장소의 고아 기록 정리와 같은 조건(index를 읽을 수 있고 index.json이 있음)에서 index에 없는 id의 `queued`·`returned` 항목을 지운다. 비교는 2.1과 같이 대소문자를 무시한다.

### 2.3 서비스 `ConversationService.delete(id)`

1. `quitting`이면 거절한다(`busy`). 창이 닫히는 중이라 renderer는 이 경우 토스트를 띄우지 않는다(3.4).
2. `this.working(id)`이면 `busy`(live entry의 `busy`는 이미 여기에 들어 있다). 기준은 목록의 `working`과 같다: preparing·running·waiting, 판정을 기다리는 project 턴, 나갈 차례인 queue, 이전 프로세스나 판정을 기다리는 send.
3. metadata가 없으면 `not_found`.
4. 실행 정리: 지금의 `archive(id)`가 하는 정리를 그대로 부른다(`service.ts:585-595`: live runner 닫기, 현재 대화로 재사용되던 idle Codex server 포함, `terminal`·`closed` 표시, `dropEvidence`, `cancelWait`). live entry는 삭제 시점에 지우지 않는다. `exited()`는 `accepted` entry를 지우지 않고(`service.ts:709`), 삭제 때 `this.live.delete`를 부르면 종료 콜백의 identity 확인(`service.ts:360`)이 빗나가 reservation이 풀리지 않는다(POSTMORTEM 2026-10-28). `terminal` 표시는 빠뜨릴 수 없다: `receive`는 `terminal`이면 이벤트를 버리고, `store.append`는 `O_CREAT`로 열기 때문에(`store.ts:295`) 표시가 없으면 늦은 이벤트 하나가 지운 `<id>.jsonl`을 다시 만든다. 같은 이유로 삭제 뒤 `<id>`로 들어오는 모든 append 경로(append를 부르는 서비스 메서드)는 metadata 확인을 먼저 거쳐야 하고, 테스트가 이를 고정한다.
5. `store.delete(id)` → `drafts.discard(id)` → `queuedExtras`에 남은 첨부 id 해제(`forget` + `files.release`) → `this.changed(root)`(예외를 잡는 wrapper). `store.delete`의 index commit이 성공 기준이다. 그 뒤의 정리(초안, 첨부, 알림 닫기)가 실패하면 기록만 하고 성공으로 답한다. 이미 지운 대화가 실패 토스트를 띄우지 않게 하기 위해서다. 남은 초안은 다음 시작 때 정리된다(2.2).

**한계**(spec 결정 15): 기록 쓰기에 실패한 대화(`failedPersistence`)는 `busy`가 true로 남아(`service.ts:364-372`, `:709-710`) 재시작 전까지 `working`이다. 그래서 그 동안은 지울 수 없다. 승격 때 BACKLOG에 적는다.

main은 single thread이고 2~5는 await 없이 이어 실행한다. 그래서 판단과 삭제 사이에 send가 끼어들 수 없다. 삭제 뒤의 send·queue·markSeen·setPermissionMode·read는 지금처럼 `not_found`나 빈 기록을 받는다. 이미 await 중인 send는 `checkSend`와 `metadata(id)` 재확인에서 `not_found`로 거절된다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn'의 재확인 규칙). 다만 2에서 그런 send는 `working`이라 삭제가 먼저 거절된다.

### 2.4 IPC `conversation:delete`

- 요청 `{conversationId}`: `ipc.ts`의 기존 opaque id 검증. 답은 `undefined` 또는 `{error: "busy" | "not_found" | "unknown"}`. 세 코드는 이미 `known`에 있다(`ipc.ts:180`).
- 성공 뒤 그 대화의 알림을 닫고 잊는다. `conversation:*` 채널은 generic loop로 등록되므로(`index.ts:796-797`) 채널 handler가 아니라, `index.ts`가 서비스 생성자에 넘기는 삭제 callback에서 `notify`를 부른다(다른 서비스 callback과 같은 방식). 지금 알림 클릭은 찾지 못하는 대화를 그 프로젝트의 Overview로 보내지만(PRODUCT §5 item 0 'Notifications'), 지운 대화의 알림이 남아 있을 이유가 없다.
- 채널 목록과 모양의 정본은 코드다(ARCHITECTURE §7 'IPC contract').

## 3. renderer

### 3.1 순수 규칙 (`conversationDelete.ts`)

- `deleteAvailability(summary)` → `{ available: true } | { available: false; reason }`.
  - `summary.phase === "waiting"` → `The agent is waiting for your answer.`
  - `summary.working || summary.phase === "running"` → `The agent is working on this conversation.`
  - 캔버스 메뉴처럼 상태를 말한다(`An agent is working on this canvas.`, `ShellSidebar.tsx:135`).
  - 그 밖(끝난 대화, 보관된 대화, 읽기 실패 대화, 되돌아온 초안이 있는 대화) → 사용 가능. 읽을 수 없는 대화도 지울 수 있어야 복구 수단이 된다.
- `deleteDialogView(title, provider, hasDraft)` → `{ title, body }`.
  - 제목: `Delete “<title>”?`. title은 앞뒤 공백을 걷고 줄바꿈을 공백 하나로 바꾼 뒤 60 code point를 넘으면 잘라 `…`을 붙인다(제목은 첫 메시지에서 나와 32,768 code unit까지 길 수 있다). 빈 제목은 `Delete this conversation?`.
  - 본문: `Doan deletes this conversation from this device. <Provider>’s own session files stay. You can’t undo this.` `<Provider>`는 `PROVIDER_NAMES`. `hasDraft`(그 대화의 composer 초안이나 되돌아온 queue가 있음)이면 `Its unsent message is discarded too.`를 덧붙인다(spec 결정 13).
  - 문구는 copy 확인 대상이다(clarify preset: 확인되지 않은 결과를 약속하지 않는다. 여기서 약속하는 것은 Doan 기록 삭제와 provider 파일 미변경뿐이고 둘 다 2.1~2.3이 보장한다).
- `deleteRefusalText(code, title)` → 토스트 문구. 캔버스 메뉴의 `Couldn’t move “x” to Trash. …`(`canvasRowMessages.ts:17`)와 형식을 맞춘다. `busy`: `Couldn’t delete “<title>”. The agent started working on it.` / `not_found`: `“<title>” was already deleted.` / 그 밖: `Couldn’t delete “<title>”. Try again.` 종료 중 거절에는 토스트를 띄우지 않는다.
- `MenuItem`에 `deletable`(위 결과)를 더한다. `menuItem()`이 두 메뉴에 같은 값을 준다.

### 3.2 삭제 뒤 화면 상태

삭제는 사람이 확인 알림에서 확정한 그 창에서만 일어난다(창은 하나). 그래서 renderer는 성공 답을 받으면 목록 알림을 기다리지 않고 바로 정리한다.

**삭제 중 표시**: IPC 답과 main 이벤트의 순서는 보장되지 않는다(POSTMORTEM 2026-10-26 recurrence). 목록이 먼저 적용되면 Overview `afterList`의 `gone`(`overviewConversation.ts:122`, `overviewRun.ts:296-302`)이 지운 대화의 초안을 새 대화 key로 옮겨 새 대화 초안을 덮는다(spec 결정 5 위반). 그래서 renderer는 `conversation:delete`를 부르기 전에 그 id를 "삭제 중"으로 표시한다. `afterList`는 삭제 중인 id가 사라지면 초안을 옮기지 않는다. 거절·실패하면 표시를 푼다. 성공하면 아래 정리 뒤 푼다.

- `ConversationStore`: 그 대화의 초안 key(`draftKey({kind:"existing", conversationId})`), 되돌아온 초안, thread, queue 표시를 지운다(`dropDrafts`와 같은 방식). 새 대화 초안은 건드리지 않는다(spec 결정 5). 그 id로 늦게 와서 `unclaimed`에 쌓인 이벤트(`conversationStore.ts:160`)도 버리고, 이후 그 id로 오는 이벤트를 무시한다. 남기면 같은 id로 thread를 다시 읽는 경로에서 되살아난다.
- `OverviewRun.deleted(root, id)`: 그 root의 main conversation이 `id`이면 `{conversationId: null, listed: false}`로 바꾸고 `revision`을 올린다. 기억(`remember`)이 `id`이면 `null`로 지운다. 요청 중인 pick이 `id`이면 버린다. 그래서 `pickOverviewConversation`이 목록에 없는 요청을 `reread`로 다시 읽는 일이 없다. 승격 줄(`s.moved`, `overviewRun.ts:304`)이 `id`를 가리키면 지운다(spec 결정 12). 삭제는 모든 root의 상태에 적용한다.
- `CanvasRun.deleted(id)`: 모든 캔버스 상태에서(캔버스 ID가 중복된 두 캔버스가 같은 대화를 보이는 경우 포함) `shown`, `request`, `unconfirmed`가 `id`인 상태를 새 대화 상태(`shown = null`)로 바꾸고 `revision`을 올린다. 승격 notice의 Open(`notice.open`, `canvasRun.ts:228`)이 `id`를 가리키면 notice를 지운다. 삭제 뒤 `previous`/`last` 목록 비교(`canvasRun.ts:195`)가 승격 notice를 잘못 띄우지 않게, 지운 id는 비교에서 뺀다. 캔버스 현재 대화가 사라진 뒤에도 `pickCanvasConversation`은 "현재 대화가 없으면 새 대화 상태"를 고르므로 보관된 대화를 고르지 않는다(spec 완료 조건 7). 이 성질을 테스트로 고정한다.
- `revision`을 올리므로 삭제 전에 나간 start·send 답은 새 대화 상태를 덮지 못한다(POSTMORTEM 2026-10-26 'The invalidation read overtook the reply to the person's own Reopen'와 ARCHITECTURE §7의 revision 규칙).
- `HomeRun.deleted(id)`: `HomeRun`은 자기가 시작했거나 claim한 대화를 `conversations`·`strips`에 두고, 목록에서 사라져도 빼지 않는다(`homeRun.ts:459`). `merged()`(`homeRun.ts:514-525`)는 그 대화를 다시 끼워 넣고 `strip()`(`homeRun.ts:385-395`)은 Dismiss 전까지 보여 준다. 그래서 conversations, strips, events, histories, extras, 그 root의 `lastRequests` 항목에서 `id`를 지운다. 문제 workspace 화면의 strip, Open, Edit on Home이 지운 대화를 가리키지 않게 된다.
- seen 표시(`seen` 집합), 사이드바 slot, Canvas conversations 행은 main 목록에서 오므로 `listChanged` 뒤 다시 읽은 목록에서 사라진다. 로컬 seen 집합에 남은 id는 목록에 없으므로 영향이 없지만 같이 지운다.
- renderer는 성공 답을 받으면 세 Run(`OverviewRun`, `CanvasRun`, `HomeRun`)의 `deleted`와 `ConversationStore` 정리를 모두 부른다. 어느 화면에서 지웠는지와 상관없다.

### 3.3 행 Delete 버튼 (두 제목 메뉴)

초안: `.doan/canvases/conversation-delete.html` 프레임 `row-button`, `row-unavailable`. 사용자가 `/design-draft` 중 "…" 메뉴와 하위 메뉴 대신 휴지통 버튼을 바로 두기로 정했다(spec 결정 8). 사용자가 초안(프레임 `row-button`·`row-unavailable`·`delete-dialog`·`delete-toast`·`after-delete`)을 확정했다. `/tdd`는 이 초안을 기준으로 한다.

- 구조: 대화 행마다 wrapper(`conv-row`, `position: relative`) 안에 지금의 `DropdownMenu.RadioItem`과 그 형제인 `DropdownMenu.Item`을 둔다. 이 Item이 Delete 버튼(`aria-label="Delete “<title>”"`, 16px Trash2, 24×24 `--size-control-xs`)이고 행의 시간 자리에 절대 위치한다. 버튼이 RadioItem 안이 아니라 형제이므로 버튼 클릭은 행 선택이 아니다. 메뉴 항목 안에 interactive 요소를 중첩하지 않는다(menuitem 안의 button은 ARIA에 맞지 않는다).
- 실행: Item의 `onSelect`가 제목 메뉴를 닫고 그 대화의 id·title·provider를 들고 확인 알림을 연다. 메뉴의 `onCloseAutoFocus`는 이 경우 기본 포커스 반환을 막는다(알림이 포커스를 가져간다).
- 툴팁: 공유 Tooltip(`.doan-tooltip`)을 버튼에 붙인다. 문구는 사용 가능하면 `Delete conversation`, 불가이면 `deleteAvailability`의 이유다. 포인터가 버튼에 머무를 때와 키보드 하이라이트가 버튼에 있을 때 보인다. 행에만 포인터가 있을 때는 보이지 않는다.
- 키보드: Radix roving 순서가 DOM 순서이므로 ↓는 행 → 그 행의 버튼 → 다음 행 순서다. 버튼에서 Enter·Space가 실행이다. Esc는 Radix 기본대로 메뉴를 닫고 포커스를 제목 메뉴 trigger로 보낸다. Typeahead는 `textValue`가 있는 행에만 걸리도록 버튼의 `textValue`를 비운다. ⌫·⌘⌫ 단축키와 행 우클릭 메뉴는 두지 않는다.
- 보이는 조건: 행 hover, 행이나 버튼의 `data-highlighted`. 숨은 동안은 `display: none`이 아니라 1×1 clip으로 숨긴다(POSTMORTEM 2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body': Radix가 포커스를 돌려줄 대상은 box가 있어야 한다). 버튼이 보이는 동안 시간(`cv-when`)의 보이는 글자는 같은 clip으로 숨기고 그 자리는 버튼 폭(`min-width: var(--size-control-xs)`)을 유지하며, `sr-only` 라벨은 남긴다. 상태 표시(`StatusMark`)는 그대로 둔다.
- 행 하이라이트: ↓로 하이라이트가 버튼에 가면 `data-highlighted`가 행에서 빠져 행 채움과 구분선 숨김(`styles.css:945-948`)이 꺼진다. 그래서 버튼이 하이라이트된 동안에도 행이 하이라이트 채움을 유지한다(`.conv-row:has([data-highlighted])`). 선택된 행(`.current`)은 지금처럼 선택 채움을 유지한다.
- 구분선: `conv-row` wrapper를 넣으면 형제 선택자 `.conv-item + .conv-item`(`styles.css:947-948`)이 맞지 않아 행 사이 구분선이 사라진다. 선택자를 `.conv-row + .conv-row` 기준으로 함께 고친다.
- 사용 불가: 버튼은 `aria-disabled`, 비활성 색(`--text-disabled`), 하이라이트 채움 없음, 이유는 툴팁 문구이자 `aria-describedby` 대상이다. 방향키로 닿고, 실행하면 아무 일도 없다(`preventDefault`).
- 목록 읽기 실패(`list === "error"`)와 읽는 중에는 행이 없으므로 버튼도 없다. 마지막 대화를 지운 뒤에는 New conversation 행만 남는다(지금의 빈 목록 표시 그대로).
- 크기·색은 초안의 값이고 `/design-sync`가 잰다: 버튼 24×24, 첫 줄(20px) 가운데, 오른쪽 8px(아이콘이 시간 글자의 오른쪽 끝에 맞음), subtle ink, 하이라이트 채움은 `--affordance-subtle-hover`. Conversation menu 폭 360(DESIGN 'Project Overview')은 바꾸지 않는다.

### 3.4 확인 알림

- `CanvasTrashDialog`와 같은 compact `alertdialog`(`doan-dialog` `data-ui-size="compact"`, `showModal`, `onCancel`은 Cancel과 같음). Cancel(subtle, autoFocus)과 Delete(prominent, Move to Trash와 같은 검은 채움, spec 결정 9). 공통 컴포넌트가 이미 있으면 그것을 쓰고, 없으면 `CanvasTrashDialog`의 구조를 따른다(새 추상화를 만들지 않는다). `role="alertdialog"`, `aria-labelledby`·`aria-describedby`를 붙이고 테스트와 포커스 guard는 클래스가 아니라 role로 찾는다(POSTMORTEM 2026-10-30 'Removing a shared dialog class silently disabled two focus guards'). 확정 버튼 이름은 메뉴 항목과 같은 Delete다.
- 알림이 열려 있는 동안 대화가 일을 시작하는 경로는 없다(모달이 composer를 막는다). 그래도 렌더 중 `deleteAvailability`가 불가로 바뀌면 Delete를 `aria-disabled`로 바꾸고 이유를 `doan-notice`로 보인다(`trashBlock`과 같은 방식). main이 확정 때 다시 판단한다.
- Delete: 버튼을 `aria-disabled`로 바꾸고, 그 id를 삭제 중으로 표시한 뒤(3.2) `conversation:delete`를 부른다. 성공하면 알림을 닫고 3.2를 적용한다. 보이던 대화를 지웠으면 그 화면의 composer에, 아니면 제목 메뉴 trigger에 포커스한다(spec 완료 조건 8). 성공 토스트는 없다. 거절·실패하면 알림을 닫고 `deleteRefusalText` 토스트를 띄우고(종료 중 거절은 띄우지 않음) 제목 메뉴 trigger에 포커스한다.
- Cancel·Esc: 알림을 닫고 제목 메뉴 trigger에 포커스한다(행 버튼은 닫힌 메뉴 안에 있어 돌아갈 수 없다).
- 다시 읽기·창 닫기·종료가 알림 중에 일어나면 알림은 사라지고 아무것도 지우지 않는다. 지연 삭제가 없으므로 재시작·reload 창(window)에 대한 규칙이 따로 필요 없다.
- `doan://` 링크나 OS 알림 클릭(Open)이 알림 중에 오면 기존 규칙대로 Cancel처럼 닫고 이동한다(PRODUCT §5 item 3 'Deep links').

## 4. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수 | 위치 | 고정할 사례 |
|---|---|---|
| `deleteEntries(entries, id)` | `store.ts` | 항목 하나만 빠짐, 없는 id는 null, 다른 항목의 `state`·`canvas`는 그대로(보관된 대화가 current로 바뀌지 않음) |
| `orphanHistories(names, indexIds)` | `store.ts` | `<validId>.jsonl`만, index에 있는 id·tmp·journal·잘못된 id는 제외, 대소문자만 다른 이름은 index에 있는 것으로 봄 |
| `orphanDrafts(ids, indexIds)` | `drafts.ts` | index에 없는 id만, 대소문자 무시 |
| `deleteAvailability(summary)` | `conversationDelete.ts` | waiting, running, `working`(판정 대기·queue), ended, archived, readError, returnedDraft |
| `deleteDialogView(title, provider, hasDraft)` | `conversationDelete.ts` | 60 code point 경계(서로게이트 쌍), 줄바꿈, 빈 제목, provider 이름, 초안 줄 유무 |
| `deleteRefusalText(code, title)` | `conversationDelete.ts` | busy, not_found, 그 밖 |
| `menuItem` / `canvasConversationMenu` / `projectConversationMenu`의 `deletable` | `overviewConversation.ts`, `canvasConversation.ts` | 두 메뉴가 같은 값 |
| `OverviewRun.deleted`, `CanvasRun.deleted`, `HomeRun.deleted` | `overviewRun.ts`, `canvasRun.ts`, `homeRun.ts` (DOM 없음) | 보이던 대화 → 새 상태, 기억 해제, 요청 해제, revision, 늦은 start 답 무시, 삭제 중 표시로 목록이 먼저 와도 초안이 옮겨지지 않음, 승격 줄·notice 해제, 중복 캔버스 둘 다 정리, 마지막 대화 삭제, strip·Edit on Home 해제, 다른 대화는 그대로 |

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
- **Undo journal**: 삭제는 journal을 쓰지 않는다(2.1). 진행 중인 journal은 삭제 전에 복구한다. ARCHITECTURE §7 'Device-local storage'의 "Every current/archived change goes through the undo journal"은 삭제와 맞지 않으므로 승격 때 이 문장을 고친다.
- **"Doan never forks or takes over a session"**: 에이전트 세션 파일을 건드리지 않으므로 그대로다.
- **No git operations**: 대화 기록은 repo 밖(userData)이라 해당 없다.
- **Remove from Doan**: `project-remove-confirm`이 Remove from Doan을 같은 모양의 확인 알림으로 바꾸고 있다. 이 feature는 그 작업에 의존하지 않는다(`CanvasTrashDialog` 구조로 충분하다).

## 8. PoC 의존

새 외부 동작에 기대지 않는다. 증명되지 않은 가정은 두 가지다: (1) Radix `DropdownMenu.RadioGroup` 안에 `RadioItem`과 형제 `Item`을 두고 그 Item을 절대 위치로 겹쳐도 roving 순서·hover 하이라이트·포커스 반환이 3.3대로 동작한다. (2) 메뉴 Item에 붙인 Tooltip이 키보드 하이라이트(Radix가 Item에 포커스를 옮김)에도 열리고, 메뉴 위에 뜬다. 단위 테스트(jsdom)는 레이아웃과 하이라이트를 확인할 수 없으므로(POSTMORTEM 2026-11-03, 2026-11-02 'Every Overview menu opened under the Overview itself') UI task 첫 단계에서 실제 앱으로 확인한다(tasks T4).

## 9. POSTMORTEM에서 가져온 함정

- **2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body'**: 숨은 메뉴 trigger를 `display: none`으로 숨기면 Radix의 포커스 반환이 조용히 실패한다. 3.3의 clip 규칙과 CSS 테스트로 막는다.
- **2026-11-02 'Every Overview menu opened under the Overview itself'**: portalled 메뉴는 `.doan-floating` z-index 규칙에 기댄다. 메뉴 안 버튼의 툴팁이 메뉴 위에 뜨는지 실제 앱 probe에서 스크린샷으로 확인한다.
- **2026-10-27 'A rejected conversation replacement had already changed current history'**: index rename이 commit 지점이다. 삭제도 index를 먼저 저장하고 로그를 나중에 지운다.
- **2026-10-27 'Awaited conversation work outlived its current turn'**: await 뒤에 metadata와 live identity를 다시 확인한다. 삭제 뒤 늦은 이벤트·send는 `not_found`로 끝나야 한다.
- **2026-10-26 'The invalidation read overtook the reply to the person's own Reopen'**: 삭제 뒤 화면 상태는 revision으로 늦은 답을 막는다.
- **2026-10-25 'Removing a project retained its remembered canvas'**: id로 기억하는 상태(ui-state의 Overview 기억, CanvasRun의 요청)는 삭제 때 같이 지운다.

## 10. 읽은 design preset

`harden`(사용 불가 상태, 실패·거절, 긴 제목), `clarify`(확인 알림·거절 토스트 문구, 확인되지 않은 결과 약속 금지).
