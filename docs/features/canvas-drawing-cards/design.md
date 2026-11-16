# 캔버스 카드 — design

## 영향받는 구성 요소

- **앱 main** (`app/src/main/conversation/`)
  - `service.ts`: 턴별 감시 맵, 편집 경로 수집, 폴더 갱신과 기한 연결, 쓰기.
  - 새 순수 함수 `drawnCanvases`: `handoff.ts` 옆, `canvasesAt`(`project.ts`) 재사용.
  - `types.ts`, `store.ts`: 이벤트 타입과 검증.
  - `summary.ts`: `lastTurnSeq`의 제외 목록.
  - `state.ts`: `foldConversation`은 `canvas.drawn`을 접지 않는다. 기록에만 있으면 되고 상태에는 필요 없다.
- **앱 renderer**
  - `threadItems.ts`: 카드 항목 유도, handoff·missed 줄 대체, 턴 끝 배치.
  - `turnStatus.ts`: `ownEnd`가 끝쪽 카드를 건너뛴다.
  - `overviewRun.ts`: `isMarker`와 `endSeq`가 main의 unseen 제외를 따라 한다.
  - `handoffView.ts`, `revealDecision.ts`: 지금 handoff 줄 항목을 읽는 곳을 카드 항목으로 바꾼다.
  - `ConversationThread.tsx`: 오버뷰(`ProjectOverview.tsx`), 캔버스 패널(`CanvasConversationPanel.tsx`), 프로토타입 창(`prototype/PrototypeConversation.tsx`)이 함께 쓴다. 카드 컴포넌트를 더하고 `.marker.handoff` 규칙과 줄 컴포넌트를 지운다.
- **CLI·skill·형식**: 바뀌지 않는다. `doan handoff`, app-socket v7, `sessions.v1`, `.doan/config.json`, `runtime.json`은 그대로다.

## 판정: 이 턴이 그리는 새 캔버스

근거는 턴 자신의 `edit` activity 경로다(사용자 결정). 지금 missed 줄과 승격 판정이 쓰는 근거와 같다.

1. **스냅숏**: main은 턴 ID를 키로 하는 새 맵(`drawWatches`)을 둔다. `MissedWait`처럼 다음 send가 바꾸는 live 항목과 따로 둔다. 모든 턴(Doan 연결 캔버스·프로젝트 대화, 레거시 외부 대화)을 받아들일 때 그 루트의 목록(경로와 ID)을 잡는다. 기존 `HandoffTurn.snapshot`과 `canvasesAtStart`는 잡는 시점과 저장 방식이 달라서(앞의 것은 수락 뒤 메모리, 뒤의 것은 수락 전 index) 손대지 않는다.
2. **수집**: `receive()`에서 그 턴의 `edit` activity 가운데 `insideDesign`인 경로를 후보로 모은다. 레거시 외부 턴도 같은 지점을 지난다. 지금 `edits`를 모으는 두 곳(service.ts의 evidence와 `handoffTurn`)은 그 대화 종류에만 해당하므로, 새 수집은 그 둘과 따로 둔다. 활동은 권한 응답 전에 오므로(ARCHITECTURE §7 'Project conversations and promotion') 후보만으로는 카드를 만들지 않는다.
3. **판정**: `drawnCanvases({ root, snapshot, edits, listed, announced })`.
   - 편집 경로를 `canvasesAt`으로 목록 행에 맞춘다(root 기준 상대 경로, `/private` 처리 포함).
   - 정확히 한 번 목록에 있는 행만 남긴다(`missedHandoffs`의 필터와 같다).
   - 스냅숏에 경로나 ID로 있는 것과 이미 알린 것은 뺀다.
   - 남은 캔버스마다 `canvas.drawn` { canvas: { path, id? } }를 그 턴의 이벤트로 한 번씩 쓴다.
4. **시점**: 수집할 때 이미 목록에 있으면 바로 판정하고, 아니면 폴더 갱신(`refreshed`) 때마다 다시 본다. 턴이 도는 동안에도 쓰므로 `canvas.drawn`은 `turn.done` 앞에도 뒤에도 올 수 있다.
5. **끝**: 감시는 턴 끝 뒤 `promotionDeadline`까지 이어진다. 프로세스 그룹이 남아 있으면(턴 사이에 살아 있는 Codex 서버) `endedAt + BIND_GRACE_MS`까지다. 그 뒤, 그리고 대화 삭제, 종료(quit), 기록 실패 때 감시를 버린다.
6. **쓰기**
   - 쓰기 직전에 앱이 종료 중이 아닌지, 대화가 있는지, 기록을 받는지, 턴 ID가 감시의 것인지 다시 확인한다(`writeMissed`와 같다. `store.append`는 지운 기록을 다시 만든다).
   - 쓰기에 실패하면 그 감시만 버리고 로그를 남긴다. 턴과 runner는 그대로 둔다(`writeMissed`와 같다). 이 경로는 `receive`의 try/catch 밖이므로 `failedPersistence`를 설정하지 않는다.
7. **한계**
   - 판정 사이에 이름이 바뀐 새 캔버스는 카드를 얻지 못한다(`canvasesAt`은 스냅숏에 있는 캔버스의 ID만 따라간다).
   - 같은 루트의 두 턴이 같은 새 경로를 둘 다 편집하면 두 턴 모두 카드를 쓴다(사용자 결정). 승격의 `contested`는 바인딩에만 적용된다.
   - 앱 종료나 재시작으로 감시가 사라진 뒤 목록에 올라온 캔버스는 카드를 얻지 못한다.

## renderer: 카드 항목

- **항목 형태**: `ThreadItem`에 `{ kind: "canvasCard"; key; canvas; drawing: boolean; drawn: boolean; handoff?: { outcome: "pending" | "started" | "refused" | "cancelled" | "missed"; target?; reason? } }`를 더한다. 기존 `kind: "handoff"` 줄 항목은 없앤다.
  - key는 `<turnId>:<path>`로 고정해 상태가 바뀌어도 같은 DOM이 남게 한다(Open 포커스 유지).
  - `drawn`은 `canvas.drawn`이 있는지를 뜻한다. 없으면 Drawing을 거치지 않는다(handoff 요청만 있는 카드).
- **한 턴의 카드**: `canvas.drawn`, `handoff.requested`, `handoff.missed` 경로를 경로별로 묶는다. 순서는 각 경로가 처음 나온 이벤트 순서다. `handoff.resolved`와 missed는 그 경로 카드의 `handoff`로 들어간다.
- **늦게 온 이벤트**: `canvas.drawn`은 지금 `handoff.missed`처럼 첫 switch에서 처리하고 `turnId`로 그 턴의 카드 묶음에 넣는다. 다음 턴이 시작된 뒤 와도 다음 턴으로 옮겨가지 않고, 지금 열린 활동 그룹을 닫지 않는다(threadItems.ts의 끝난 턴 이벤트를 버리는 두 번째 switch를 타지 않는다).
- **배치**
  - 그 턴의 카드 묶음은 그 턴의 다른 항목 뒤에 둔다.
  - 턴이 도는 동안 `withSending`이 Send now 메시지를 넣는 위치(열린 요청 바로 위)보다 앞에 둔다. 그러면 순서가 `카드 → Send now → 권한·질문 카드`가 된다(사용자 결정).
  - 턴이 끝난 뒤에는 그 턴의 답변과 턴 끝 notice 뒤에 둔다.
  - 카드는 활동 그룹을 닫지 않는다.
- **turn indicator**: `turnStatus`의 `ownEnd`는 지금 Send now 메시지만 건너뛴다. 여기에 끝쪽 `canvasCard`도 건너뛰게 해서 indicator 단계, `activityRun`, 스트리밍 중인 답변 인식이 카드 앞의 항목을 보게 한다.
- **drawing 값**: 그 턴이 아직 돌고 있을 때만 참이다. Stop을 누른 즉시(indicator가 사라지는 시점), 재시작으로 접힌 턴에서, `live=false`로 읽을 때는 거짓이다. 지금 `pending` handoff를 `cancelled`로 읽는 규칙도 그대로 둔다.
- **문구** (`canvasCardText`, 초안에서 확정)
  - 머리: 파일 이름, Open.
  - 상태 줄: "Drawing"(스피너) / "Hands off when this turn ends"(턴이 도는 동안은 스피너 유지) / "Drawn" / "Handed off" / "Didn’t hand off." + 거절 사유 / "Didn’t hand off. The turn didn’t finish." / "Didn’t hand off. The agent didn’t ask to.".
  - 사라진 캔버스: "No longer in <project>"를 붙이고 Open을 숨긴다. 지금 두 문구(" · No longer in <project>", "It’s no longer in <project>.")를 이것 하나로 합친다.
  - 아이콘은 지금 줄처럼 `forward`와 `ban`을 쓰고, 상태는 아이콘과 채움으로 구분한다. 색 왼쪽 보더는 쓰지 않는다.
- **Open 대상**
  - started → 그 캔버스의 새 대화(지금 handoff 줄의 Open과 같은 경로).
  - same_canvas 거절, 사라진 캔버스 → Open 없음.
  - 나머지 → 그 캔버스를 Quick Open처럼 연다.
  - 프로토타입 창에서는 지금 handoff 줄의 Open 경로(메인 창을 앞으로)를 그대로 쓴다.
- **접근성**: 카드는 `role="group"`, 접근 이름은 "<file>, <상태>"다. 스피너는 `aria-hidden`이다. Open의 접근 이름은 "Open <file>"이고, started에서는 "Open the new conversation on <file>"이다. live region은 두지 않는다.
- **스크롤**: 카드가 나타나거나 높이가 바뀌어도 기존 `scrollFollow` 규칙을 그대로 따른다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `drawnCanvases({ root, snapshot, edits, listed, announced })` → 새로 알릴 캔버스.
2. `threadItems`의 카드 유도: 이벤트를 경로별 카드로 합치기, 턴 끝 배치(Send now와 요청 카드 앞), 늦게 온 `canvas.drawn`, 활동 그룹 유지, `drawing` 값, 옛 기록.
3. `turnStatus`의 `ownEnd`가 끝쪽 카드를 건너뛰는 규칙.
4. `canvasCardText`(카드 상태 → 문구, 아이콘, Open 대상, 접근 이름).
5. unseen 제외: main `summary.ts`의 `lastTurnSeq`와 renderer `overviewRun.ts`의 `isMarker`·`endSeq`.

## 형식 변경

- `schema/`의 공유 형식은 바뀌지 않는다. 대화 기록(event JSONL v1)은 userData 형식이고 `store.ts` `payload`가 검증한다.
- 기록에 `canvas.drawn` 이벤트 타입이 더해진다. ARCHITECTURE §7은 새 이벤트 타입이 든 기록을 이전 Doan이 읽지 못한다는 한계를 이미 받아들였다(`model_unavailable` 선례). 이 기능도 같은 한계를 지고, 승격 단계에서 그 문단에 `canvas.drawn`을 더한다.
- 옛 기록의 `handoff.*` 이벤트는 그대로 읽어 카드로 그린다. 쓰는 `handoff.*` 이벤트는 바뀌지 않는다.

## 규칙(conventions)·결정 영향

- ARCHITECTURE §1 conventions와 `doan check` 규칙은 바뀌지 않는다.
- 서빙 범위·샌드박스, GitHub 토큰, git 명령에는 닿지 않는다. 앱은 캔버스 내용을 쓰지 않는다(PRODUCT §3 Out of scope 7 그대로).
- PRODUCT에서 원본 스레드의 handoff "줄"을 전제로 한 곳이 카드 규칙으로 바뀐다. 사용자가 승인했다.
  - §5 item 2 'Handoff': 원본 스레드 줄 문구와, 줄이 "요청이 온 자리"에 놓인다는 규칙(카드는 턴 끝).
  - 'Missed line': 문구, "placed after the turn's last handoff line".
  - 'Handoff'의 다중 시작: "its lines carry each Open".
  - 'Turn indicator': "below a handoff line".
  - 'Prototype window' 'Toward the main window': "a handoff line's or card's Open".
  - 판정, 큐, 토스트, 자동 열기는 그대로다.

## 포스트모템에서 가져온 함정

- 2026-11-15 "A running turn's in-memory canvas missed a move that a refused send had already saved": 메모리 복사본이 저장된 값을 대신하면, 그 필드를 쓰는 모든 곳에서 복사본도 고쳐야 한다. 이 기능의 감시는 대화의 `canvas` metadata를 복사하지 않고, 턴 ID로 묶은 목록 스냅숏과 편집 경로만 쓴다. 그래서 거절된 send가 `refreshCanvas`로 metadata를 바꿔도 감시는 영향을 받지 않는다. 이것을 테스트로 고정한다.
- 2026-10-27 "Awaited conversation work outlived its current turn": 폴더 갱신을 기다린 뒤 쓰기 전에 대화와 턴 정체를 다시 확인한다.
- 2026-10-27 "Successful appends crossed the history reader's byte limit": `canvas.drawn`도 store의 append를 거쳐 공유 한도 검사를 받는다.

## 디자인 프리셋

- 읽은 프리셋: `harden`(그리는 중, Drawn, handoff 대기·시작·거절·취소·missed, 사라짐, 긴 이름, 카드 여러 장 상태를 빠짐없이 그린다).
- 초안은 새 파일 `.doan/canvases/canvas-drawing-cards.html`로 그린다. 기존 `canvas-handoff.html`은 고치지 않는다.

## 초안 요청

- 캔버스: `.doan/canvases/canvas-drawing-cards.html`, id `canvas-drawing-cards`, 너비 1440.
- 프레임
  - `running`: 턴이 도는 동안. 오버뷰 프로젝트 대화(카드 2장, Drawing)와 캔버스 패널(Drawing, Drawing + handoff 대기)을 그린다. 카드 아래에 turn indicator가 있다.
  - `asking`: 권한 요청이 기다리는 동안 `카드 → Send now 메시지 → 권한 카드` 순서를 그린다.
  - `ended`: 끝 상태 하나씩. Drawn, Handed off, 거절 not_new, 거절 same_canvas(Open 없음), 취소, missed, 사라짐. 멈춘 턴의 패널(Stopped notice 뒤 Drawn 카드)도 그린다.
  - `many`: 프로토타입 창의 좁은 패널(280)에 카드 6장과 긴 이름(가운데 줄임, 툴팁)을 그린다.
- 측정 대상(`/design-sync`): 카드 컴포넌트(`.canvas-card`와 그 안의 아이콘, 이름, 상태 줄, Open)와 카드 묶음 간격. 나머지는 출시된 화면을 옮긴 것이다.

## PoC 의존

- 없다. 편집 경로 보고(Claude Code·Codex·ACP의 `edit` activity와 `insideDesign`)와 폴더 갱신 시점은 이미 쓰이고 있다. ACP 프로바이더의 편집 경로가 확인되지 않은 한계는 BACKLOG의 기존 항목(missed 줄 항목)에 카드를 더해 적는다.
