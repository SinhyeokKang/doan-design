# quick-open-conversations — design

## 영향 범위

- **앱 renderer만 바뀐다.** main, preload, IPC, CLI(Go), 스킬, 공유 포맷은 바뀌지 않는다.
- 대화 목록은 `HomeRun`(`app/src/renderer/homeRun.ts`)이 이미 등록된 모든 root(`entries`의 `kind: "list"`)에 대해 읽고, `conversation:listChanged`에 맞춰 다시 읽는다(`listState(root)`: 목록, `"loading"`, `"error"`). Quick Open이 검색하는 `entries`(App.tsx의 `<QuickOpen entries={entries} …/>`)와 같은 집합이라 worktree 범위가 저절로 맞는다. 새 IPC 호출은 없다.

바뀌는 파일:

| 파일 | 내용 |
|---|---|
| `app/src/renderer/canvasConversationRows.ts` | 캔버스 대화가 어느 캔버스 행에 맞는지 판정하는 부분을 `conversationCanvasMatch`로 뺀다(아래 1). `canvasConversationRows`도 이 함수를 쓴다 |
| `app/src/renderer/quickOpen.ts` | `SearchResult`에 대화 갈래를 더하고 색인·매칭·읽기 수·빈 결과 문구·행 표시·결과 키를 확장한다 |
| `app/src/renderer/QuickOpenDialog.tsx` | Conversations 탭(`TABS`, `quickOpenTabKey`), 대화 아이콘, 입력란 이름, 대화 목록 prop, 결과 행의 `canvasDir(result.path)` 분기 |
| `app/src/renderer/homeRun.ts` | `canvasRow`가 `conversationCanvasMatch`를 쓰게 하고, 미리 찾은 `{root, row}`로 여는 메서드를 더한다(아래 '여는 길') |
| `app/src/renderer/App.tsx` | `QuickOpen`에 대화 목록을 넘기고, `pick`에서 대화 결과를 새 여는 메서드로 보낸다. 찾을 수 없으면 토스트 |
| `.doan/canvases/quick-open-conversations.html` | `/design-draft`가 새로 그리는 초안. 기존 `doan-search.html`은 고치지 않는다(design-draft 규칙: develop에 있는 화면의 초안은 고치지 않는다) |

## 타입 모양

`SearchResult`는 지금 `CanvasTarget & ({kind: "canvas"} | {kind: "frame", …})`라서 `path`와 `canvasLabel`이 반드시 있다. 프로젝트 대화에는 path가 없으므로 대화는 `CanvasTarget` 밖의 갈래로 둔다.

```ts
type ConversationResult = {
  kind: "conversation"; root: string; conversationId: string; title: string;
  canvas?: { path: string; label: string }; // a canvas conversation's matched row
  lastActivityAt: string;                    // "" when the history could not be read
};
type SearchResult = (CanvasTarget & ({ kind: "canvas" } | { kind: "frame"; frameId: string; frameIndex: number })) | ConversationResult;
```

`result.path`를 쓰는 곳은 모두 `kind`로 좁혀야 한다: `App.tsx`의 `pick`, `QuickOpenDialog.tsx`의 `canvasDir(result.path)`, `resultKey`, `resultParts`, `searchMatch`의 `open` 비교.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `conversationCanvasMatch(canvas, rows)` (`canvasConversationRows.ts`) — 지금 `canvasConversationRows` 안에 있는 규칙을 그대로 뺀다. `sameCanvas`로 맞는 행이 있으면 그 행들, 없으면 id 없이 읽기 오류가 난 행 중 path가 같은 행들. 결과는 `{ kind: "one", row } | { kind: "many", rows } | { kind: "none" }`. renderer의 `sameCanvas`는 main 모듈을 import하지 않고 같은 규칙을 다시 적은 것이다(POSTMORTEM 2026-10-30 'A renderer import of a main module').
2. `conversationEntries(lists, rowsOf)` (`quickOpen.ts`) — root별 `ConversationSummary[]`에서 대화 색인 항목을 만든다. 캔버스 대화는 1이 `one`일 때만 넣고, 그 행의 path와 `canvasLabel`을 담는다. 매칭 필드는 제목 하나다.
3. `searchMatch` 확장 — 대화 갈래를 같은 점수·근접도 규칙으로 다루고, 점수와 근접도가 같으면 캔버스 → 프레임 → 대화 순이다. 빈 검색어의 Conversations 탭은 범위(workspace면 현재 root, Home이면 전체)의 대화를 `lastActivityAt` 내림차순(빈 값은 맨 뒤)으로 최대 50개 돌려준다. All·Canvases·Frames의 빈 검색어 동작은 바뀌지 않는다.
4. `groupResults` 확장 — 빈 검색어의 Conversations 탭에서는 묶음을 각 root의 가장 최근 대화 순으로 정렬한다. 검색어가 있으면 지금처럼 각 root의 첫 결과 순이다.
5. `readingCount(entries, lists, currentRoot, query, kind)` — 지금 인자에 대화 목록과 `kind`를 더한다. 폴더가 읽는 중인 root에 더해, 폴더는 읽혔지만 대화 목록이 `"loading"`인 root를 센다. 대화 목록 상태는 Conversations 탭과 검색어가 있는 All에서만 센다(빈 검색어의 All은 캔버스만 보여 주므로). 한 root는 한 번만 센다. `"error"`는 세지 않는다.
6. `emptyText` 확장 — spec의 문구. `otherCount`는 현재 탭이 아닌 종류의 일치 수 합이다. 대화 목록이 `"loading"`인 범위에서는 null(읽기 줄이 대신 말한다).
7. `resultParts`·`resultKey` 확장 — 대화 행의 이름, 설명(캔버스 이름 또는 "Project conversation", 그리고 " · <시각>"), 접근 이름. 시각은 Conversation 메뉴가 쓰는 함수를 그대로 쓴다. 키는 `["conversation", conversationId]`.
8. `quickOpenTabKey` (`QuickOpenDialog.tsx`) — 탭 네 개로 같은 규칙. 테스트는 `QuickOpenDialog.test.tsx`에 있다.

## 여는 길

- `HomeRun.openConversation(conversationId)`는 id만 받아 root를 목록에서, 캔버스 행을 렌더 시점의 `host.view().entries`에서 다시 찾는다. Quick Open은 고른 결과에 이미 root와 캔버스 행이 있으므로, 그것을 그대로 받는 메서드(예: `openFound({ root, conversationId, row })`)를 더한다. 알림·strip이 쓰는 기존 메서드는 바꾸지 않는다.
- 여는 메서드는 열기 직전에 그 대화가 아직 그 root의 목록에 있는지, 캔버스 대화면 1의 판정이 아직 `one`이고 같은 행인지 다시 확인한다. 아니면 아무 데로도 가지 않고 App이 토스트를 보인다.
- 열기는 기존 경로를 쓴다: 캔버스 대화는 `host.openCanvas`(App의 `openConversationCanvas`, `notification` 트리거), 프로젝트 대화는 `host.openOverview`. 코드상 `notification` 트리거는 대기 중이면 권한 카드, 아니면 composer 필드에 포커스를 둔다(`rightPanelOpen.ts`). `openOverview`는 다른 root로 갈 때 Back/Forward 방문을 남긴다.
- **같은 화면 판정**: 지금 `pickTarget`은 테스트에서만 쓰이고 `App.pick`은 부르지 않는다. 대화 결과의 "이미 그 대화를 보여 주는가"는 App의 `pick`에서 실제로 쓰는 순수 함수(`sameShownConversation(result, shown)`)로 두고 테스트한다. 같으면 화면을 바꾸지 않고 포커스만 옮긴다.

## 포맷 변경

없다. JSON Schema, `v`, 공유 fixture는 바뀌지 않는다.

## 규약 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- ARCHITECTURE의 구조 결정(서빙 범위, sandbox iframe, 토큰, git 명령)과 무관하다.
- PRODUCT §5 item 3 'Design navigation'의 Quick Open 줄("searches canvases and frames", 탭, 빈 결과 문구)이 바뀐다(마지막 작업에서 승격).
- 대화 데이터는 renderer에 이미 있는 목록만 쓰므로 PRODUCT §3 Out of scope 5와 기록 저장 규칙(ARCHITECTURE §7 'Device-local storage and limits')에 닿지 않는다.

## 확인할 위험

- **색인 크기.** 대화 수는 프로젝트당 많아야 수백 개 수준이고 제목 한 필드만 매칭하므로, 기존 50개 상한 삽입 정렬로 충분하다고 본다. 측정은 하지 않는다.
- **목록이 읽히기 전의 선택.** HomeRun 목록이 아직 `"loading"`인 root의 대화는 색인에 없으므로 고를 수 없다. 읽기 줄이 이를 알린다.

## POSTMORTEM에서 가져온 함정

- 'Canvas labels are file stems'(`canvasTree.ts` `canvasLabel`): 대화 행 설명의 캔버스 이름도 `canvasLabel`(파일 stem)을 쓴다. `<title>`을 쓰지 않는다.
- `App.tsx`·`CanvasController.ts`·`quickOpen.ts` 항목(동기 producer가 쓴 상태를 콜백에 실어 보내기): 대화를 열 때 결과에 담긴 root와 캔버스 행을 그대로 넘기고, 렌더 시점의 ref로 다시 찾지 않는다(위 '여는 길').
- 2026-10-30 'A renderer import of a main module': 캔버스 판정은 renderer의 `sameCanvas`를 쓰고 main의 `sessions.ts`를 import하지 않는다.
- 2026-10-25 'A toast's Open was dropped while its project was still loading'과 2026-10-24의 Recurrence(UX N, 열린 모달 뒤로 포커스를 줄 수 없음): Quick Open을 닫은 뒤에 대화를 열고 포커스를 옮긴다. 읽는 중인 root의 대화는 색인에 넣지 않는다.
- Quick Open 테스트의 타이밍 실패(Vitest 5 s): 새 테스트는 순수 함수 위주로 두고 `vi.waitFor`를 쓰지 않는다.

## 디자인 프리셋

`shape`(기존 화면 확장: 시각 체계는 그대로, 새 내용과 상태만 정한다)와 `clarify`(빈 결과 문구, 토스트)를 읽었다.

## 초안 요청

- 파일: `.doan/canvases/quick-open-conversations.html`, 캔버스 id `quick-open-conversations`, 폭 2560. 기존 `doan-search.html`의 Quick Open 대화상자를 그대로 복사해 쓰고, 새 부분만 그린다.
- 프레임(id — 내용):
  - `results-all` — 검색어가 있는 All 탭. 두 프로젝트 묶음에 캔버스·프레임·대화 행이 섞여 있다.
  - `results-conversations` — 검색어가 있는 Conversations 탭. 캔버스 대화 행, 프로젝트 대화 행(최근 활동 시각), 기록을 읽지 못한 대화 행(시각 없음), 긴 제목.
  - `empty-query-conversations-workspace` — workspace에서 빈 검색어의 Conversations 탭(그 root의 대화, 최근 순).
  - `empty-query-conversations-home` — Home에서 빈 검색어의 Conversations 탭(프로젝트 묶음이 가장 최근 대화 순).
  - `no-match` — 빈 결과 문구 네 가지를 타일로: All, Conversations, "<탭 문구>. <n> other results in All."(Conversations 탭과 Frames 탭), "No conversations to show".
  - `reading` — 대화 목록을 읽는 중인 프로젝트가 읽기 줄에 포함된 상태.
  - `open-failed` — 고른 대화를 찾을 수 없을 때의 토스트.
- `/design-sync`가 비교할 프레임: `results-conversations`, `no-match`, `open-failed`.
- 초안 리뷰에서 정한 것(사용자 결정, 2026-11-13):
  - 대화 아이콘은 lucide `MessagesSquare`다. `MessageCircle`은 앱에서 "읽지 않은 완료 대화" 표시로 쓰인다.
  - 열 수 없을 때의 토스트는 원인별로 기존 문구를 다시 쓴다. 대화가 없으면 “Couldn’t open “<title>”. It was deleted.”, 캔버스가 없으면 “Couldn’t open “<title>”. The canvas isn’t in <project>.”, ID 중복이면 `replyChipRefusal`의 중복 문구다. 제목은 `quoted()`(60자, 빈 제목은 "this conversation")를 쓰고, 메시지는 `selectable`이다.
  - 열기에 실패하면 포커스는 Quick Open을 연 곳으로 돌아간다(Escape와 같다).
  - 행의 접근 이름은 시각을 풀어 쓴다(메뉴의 `ShortTime.label`과 같다).
  - 같은 점수와 근접도에서 캔버스와 프레임은 출시 규칙(색인 순서)을 따르고, 대화만 그 뒤에 둔다.
