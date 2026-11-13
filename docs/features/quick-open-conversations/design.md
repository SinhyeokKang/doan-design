# quick-open-conversations — design

## 영향 범위

- **앱 renderer만 바뀐다.** main, preload, IPC, CLI(Go), 스킬, 공유 포맷은 바뀌지 않는다.
- 대화 목록은 `HomeRun`(`app/src/renderer/homeRun.ts`)이 이미 등록된 모든 root에 대해 읽고 `conversation:listChanged`에 맞춰 다시 읽는다(`listState(root)`: 목록, `"loading"`, `"error"`). Quick Open은 이 목록을 그대로 쓰므로 새 IPC 호출이 없다.
- 대화를 여는 길은 `HomeRun.openConversation(conversationId)`이다. 캔버스 대화는 `canvasRow`로 캔버스를 찾아 `host.openCanvas`로, 나머지는 `host.openOverview`로 간다. Quick Open은 이 길을 다시 쓴다.

바뀌는 파일:

| 파일 | 내용 |
|---|---|
| `app/src/renderer/quickOpen.ts` | `SearchResult`에 `kind: "conversation"`을 더하고, 색인·매칭·빈 결과 문구·행 표시·결과 키를 확장한다 |
| `app/src/renderer/QuickOpenDialog.tsx` | Conversations 탭, 대화 아이콘, 대화 목록 prop |
| `app/src/renderer/App.tsx` | `QuickOpen`에 대화 목록과 읽는 중 root를 넘기고, `pick`에서 대화 결과를 `run.openConversation`으로 보낸다 |
| `.doan/canvases/doan-search.html` | `/design-draft`가 대화 결과·Conversations 탭·빈 상태 프레임을 더한다 |

## 순수 함수로 뺄 부분 (`/tdd` 대상)

모두 `quickOpen.ts`에 둔다.

1. `conversationEntries(lists, rowsOf)` — root별 `ConversationSummary[]`와 각 root의 캔버스 행에서 대화 색인 항목을 만든다.
   - 캔버스 대화는 그 root의 캔버스 중 `canvas.id`로(없으면 path로) 정확히 하나가 맞을 때만 넣는다. 맞는 행의 path와 이름(파일 stem)을 항목에 담는다. 0개나 2개 이상이면 뺀다.
   - 매칭 필드는 제목 하나다. 항목은 `conversationId`, `root`, `title`, `canvas?: { path, label }`, `archived`, `lastActivityAt`을 가진다.
2. `searchMatch` 확장 — `kind: "conversation"`을 다른 종류와 같은 점수·근접도 규칙으로 다룬다. 빈 검색어에서 Conversations 탭은 범위(workspace면 현재 root, Home이면 전체)의 대화를 `lastActivityAt` 내림차순으로 최대 50개 돌려준다. All과 Canvases의 빈 검색어 동작은 바뀌지 않는다.
3. `readingCount` 확장 — 검색 범위 안에서 폴더가 읽는 중인 root와, 폴더는 읽혔지만 대화 목록이 `"loading"`인 root를 합쳐 센다(한 root는 한 번만 센다). 대화 목록 상태는 Conversations와 All 탭에서만 센다. `"error"`는 세지 않는다.
4. `emptyText` 확장 — spec의 문구를 돌려준다. `otherCount`는 현재 탭이 아닌 종류의 일치 수 합이다.
5. `resultParts`·`resultKey` 확장 — 대화 행의 이름, 설명(캔버스 이름 또는 "Project conversation", 보관이면 " · Archived"), 접근 이름. 키는 `["conversation", conversationId]`.
6. `pickTarget` — 대화 결과는 `"conversation"`을 돌려주고, App이 그것을 `openConversation`으로 보낸다.
7. `quickOpenTabKey` — 탭 네 개로 같은 규칙.

## 포맷 변경

없다. JSON Schema, `v`, 공유 fixture는 바뀌지 않는다.

## 규약 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- ARCHITECTURE의 구조 결정(서빙 범위, sandbox iframe, 토큰, git 명령)과 무관하다.
- PRODUCT §5 item 3 'Quick Open'의 "searches canvases and frames"와 탭 목록, 빈 결과 문구가 바뀐다(마지막 작업에서 승격).
- 대화 데이터는 이미 renderer에 있는 목록만 쓰므로 PRODUCT §3 Out of scope 5(서버 없음)와 기록 저장 규칙(ARCHITECTURE §7 'Device-local storage and limits')에 닿지 않는다.

## 확인할 위험

- **여는 길의 포커스와 방문 기록.** `openConversation`은 알림과 strip이 쓰는 길이라 `openCanvas`에 `kind: "notification"` 트리거를 넘긴다. Quick Open이 연 대화에서 포커스가 어디로 가는지(패널 composer, 제목 메뉴 트리거 등)와 Back/Forward 방문이 기존 Quick Open 캔버스 열기와 같은지 실제 앱에서 확인한다. 다르면 Quick Open용 트리거를 따로 넘기는 것을 구현에서 정하고 PR 본문에 적는다.
- **같은 화면.** 이미 그 대화를 보여 주는 Overview나 패널에서 고르면 아무것도 바뀌지 않아야 한다(`pickTarget`의 jump 규칙과 같은 기대).
- **색인 크기.** 대화 수는 프로젝트당 많아야 수백 개 수준이고 제목 한 필드만 매칭하므로, 기존 50개 상한 삽입 정렬로 충분하다고 본다. 측정은 하지 않는다.

## POSTMORTEM에서 가져온 함정

- 'Canvas labels are file stems'(`canvasTree.ts` `canvasLabel`): 대화 행 설명의 캔버스 이름도 `canvasLabel`(파일 stem)을 쓴다. `<title>`을 쓰지 않는다.
- `App.tsx`·`CanvasController.ts`·`quickOpen.ts` 항목(동기 producer가 쓴 상태를 콜백에 실어 보내기): `pick`이 대화를 열 때 결과에 담긴 `conversationId`와 `root`를 그대로 넘기고, 렌더 시점의 ref로 다시 찾지 않는다.
- Quick Open 테스트의 타이밍 실패(Vitest 5 s): 새 테스트는 순수 함수 위주로 두고 `vi.waitFor`를 쓰지 않는다.

## 디자인 프리셋

`shape`(기존 화면 확장: 시각 체계는 그대로, 새 내용과 상태만 정한다)와 `clarify`(빈 결과 문구)를 읽었다.
