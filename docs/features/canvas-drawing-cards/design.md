# 캔버스 카드 — design

## 영향받는 구성 요소

- **앱 main** (`app/src/main/conversation/`): `service.ts`(턴별 스냅숏, 편집 경로 감시, 폴더 갱신 연결), `handoff.ts` 또는 새 순수 모듈(새 캔버스 판정), `store.ts`(새 이벤트 검증), `types.ts`(이벤트 타입).
- **앱 renderer**: `threadItems.ts`(카드 항목 유도, handoff·missed 줄을 카드로 합치기, 턴 끝 배치), 스레드 렌더(`ConversationThread.tsx`, 그리고 이를 쓰는 `ProjectOverview.tsx`·`CanvasConversationPanel.tsx`·`prototype/PrototypeConversation.tsx`), handoff 줄 표시 로직(`handoffView.ts`, `revealDecision.ts`), 카드 문구.
- **CLI·skill·형식**: 바뀌지 않는다. `doan handoff`, app-socket v7, `sessions.v1`, `.doan/config.json`, `runtime.json`은 그대로다.

## 판정: 이 턴이 그리는 새 캔버스

근거는 턴 자신의 `edit` activity 경로다(사용자 결정). 지금 missed 줄과 승격 판정이 쓰는 근거와 같다.

1. 턴이 받아들여질 때 그 루트의 목록에 있는 캔버스(경로와 ID)를 스냅숏으로 잡는다. 지금 `HandoffTurn`은 Doan 연결 캔버스 대화에만, project evidence의 `canvasesAtStart`는 프로젝트 대화에만 있다. 카드는 모든 턴(레거시 외부 대화 포함)에 필요하므로 이 스냅숏을 한곳에서 모든 턴에 잡는다. 기존 두 스냅숏을 이것으로 바꿀지는 `/implement`에서 동작이 같다는 테스트를 두고 판단한다.
2. 턴의 `edit` activity가 `insideDesign`인 경로를 보고하면 후보로 둔다. 활동은 권한 응답 전에 오므로(ARCHITECTURE §7 'Project conversations and promotion') 이것만으로 카드를 만들지 않는다.
3. 후보 경로가 목록에 정확히 한 캔버스로 올라오고, 그 캔버스가 스냅숏에 경로로도 ID로도 없으면 `canvas.drawn` { canvas: { path, id } }를 그 턴의 이벤트로 한 번 쓴다. 이미 목록에 있으면 바로, 아니면 폴더 갱신(`refreshed`) 때마다 다시 본다.
4. 감시는 턴 끝 뒤 `promotionDeadline`까지 이어지고 그 뒤 버린다. 대화 삭제, 종료(quit), 기록 실패도 감시를 버린다. 쓰기 직전에 앱이 종료 중이 아닌지, 대화가 있고 기록을 받는지 다시 확인한다(missed 줄의 `store.append` 함정과 같다).
5. 판정 사이에 이름이 바뀐 새 캔버스는 카드를 얻지 못한다. missed 줄과 같은 한계다.
6. 같은 루트의 두 턴이 같은 새 경로를 둘 다 편집하면 두 스레드에 모두 카드가 생긴다. 둘 다 그 파일을 썼으므로 받아들인다. 승격의 `contested` 규칙은 바인딩에만 적용되고 카드에는 적용되지 않는다.

## renderer: 카드 항목

- `ThreadItem`에 `{ kind: "canvasCard"; key; canvas; drawing: boolean; handoff?: { outcome: "pending" | "started" | "refused" | "cancelled" | "missed"; target?; reason? } }`를 더하고, 기존 `kind: "handoff"` 줄 항목은 없앤다.
- 한 턴의 카드 = `canvas.drawn` 경로 ∪ `handoff.requested` 경로 ∪ `handoff.missed` 경로를 경로로 묶은 것이다. 순서는 각 경로가 처음 나온 이벤트 순서다. handoff 결과(`handoff.resolved`)와 missed는 그 경로 카드의 `handoff`로 들어간다.
- 배치: 그 턴의 카드는 턴의 다른 항목 뒤에 모아 둔다. 턴이 도는 동안은 스레드의 마지막(turn indicator 바로 위)이고, Send now 메시지가 있으면 그 위다(지금 turn indicator가 Send now 메시지 아래에 오는 규칙을 따른다). 카드는 활동 행 그룹을 닫지 않는다.
- `drawing`은 그 턴이 아직 돌고 있을 때만 참이다. 재시작으로 접힌 턴과 `live=false` 읽기에서는 거짓이다. 지금 `pending` handoff를 `cancelled`로 읽는 규칙도 그대로 둔다.
- 카드 문구(초안, `/design-draft`에서 확정):
  - 머리: 파일 이름(`<file>`), Open.
  - 상태 줄: 그리는 중 "Drawing" + 스피너 / 끝난 뒤 handoff 없음 "Drawn" / handoff 대기 "Hands off when this turn ends" / 시작 "Handed off", Open은 새 대화로 간다 / 거절·취소·missed는 지금 줄의 문장을 그대로 쓴다("Didn’t hand off. The agent didn’t ask to." 등).
  - 캔버스가 사라지면 Open을 숨기고 "No longer in <project>"를 붙인다(지금 handoff 줄 규칙과 같다).
- 프로토타입 창은 같은 항목을 그리고, Open은 지금 handoff 줄의 Open 경로(메인 창을 앞으로)를 그대로 쓴다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `drawnCanvases(snapshot, editPaths, listed, announced)` → 새로 알릴 캔버스 목록. 스냅숏에 경로·ID로 있는 것, 목록에 없거나 두 번 이상 있는 것, 이미 알린 것을 제외한다.
2. `threadItems`의 카드 유도: drawn·requested·resolved·missed 이벤트를 경로별 카드 하나로 합치기, 턴 끝 배치, 활동 그룹을 끊지 않기, 재시작 접힘에서 `drawing=false`.
3. 카드 상태 → 문구·Open 대상 매핑(`canvasCardText`).
4. 안 봄(unseen) 계산에서 `canvas.drawn`을 `handoff.missed`처럼 제외하는 규칙. 턴이 끝난 뒤 늦게 쓰여도 대화가 다시 안 본 상태로 켜지지 않아야 한다.

## 형식 변경

- `schema/`의 공유 형식은 바뀌지 않는다. 대화 기록(event JSONL v1)은 userData 형식이고 `store.ts`가 검증한다.
- 기록에 `canvas.drawn` 이벤트 타입이 더해진다. ARCHITECTURE §7은 "새 이벤트 타입을 담은 기록은 이전 Doan이 읽지 못한다"는 점을 이미 받아들인 한계로 적고 있다(`model_unavailable` 선례). 이 기능도 같은 한계를 지고, 승격 단계에서 그 문단에 `canvas.drawn`을 더한다.
- 이전 기록의 `handoff.*` 이벤트는 그대로 읽고 카드로 그린다. 쓰는 이벤트는 바뀌지 않는다.

## 규칙(conventions)·결정 영향

- ARCHITECTURE §1 conventions와 `doan check` 규칙은 바뀌지 않는다.
- 서빙 범위·샌드박스, GitHub 토큰, git 명령에는 닿지 않는다. 앱은 캔버스 내용을 쓰지 않는다(PRODUCT §3 Out of scope 7 그대로).
- PRODUCT §5 item 2 'Handoff'의 원본 스레드 줄("Hands off to <file> when this turn ends", "Handed off to <file>", "Didn’t hand off to <file>.")과 'Missed line'이 카드 상태로 바뀐다. 판정, 큐, 토스트, 자동 열기는 그대로다. 사용자가 승인했다(handoff·missed 줄을 카드에 합치기).

## 포스트모템에서 가져온 함정

- 2026-11-15 "A running turn's in-memory canvas missed a move that a refused send had already saved": 메모리 복사본(턴 스냅숏, 감시 상태)이 저장된 값을 대신하면, 그 필드를 쓰는 모든 곳(거절로 끝나는 경로 포함)에서 복사본도 고쳐야 한다. 스냅숏과 감시는 턴 ID로 묶고, 거절된 send가 바꾼 캔버스 경로가 판정에 끼지 않는지 테스트로 고정한다.
- 2026-10-27 "Awaited conversation work outlived its current turn": 폴더 갱신을 기다린 뒤 쓰기 전에 대화와 턴 정체를 다시 확인한다.
- 2026-10-27 "Successful appends crossed the history reader's byte limit": `canvas.drawn`은 작은 이벤트지만 기록 쓰기는 반드시 store의 append를 거쳐 공유 한도 검사를 받는다.

## 디자인 프리셋

- 읽은 프리셋: `harden`(그리는 중, 끝남, handoff 대기·시작·거절·취소·missed, 캔버스 사라짐, 긴 파일 이름 상태를 빠짐없이 그린다). 카드 시각 형태는 `/design-draft`에서 정한다.

## PoC 의존

- 없다. 편집 경로 보고(Claude Code·Codex·ACP의 `edit` activity와 `insideDesign`)와 폴더 갱신 시점은 이미 쓰이고 있다. ACP 프로바이더의 편집 경로는 확인되지 않았으므로(PRODUCT §5 item 1), 그 프로바이더에서는 카드가 빠질 수 있다는 한계를 승격 때 적는다.
