# 캔버스 칩 — design

## 영향 범위

- **app (main)**:
  - `prompt.ts` `validAnchor`: `canvas` 키를 받는다. `turnPrompt`는 바꾸지 않는다. 지금도 `anchorData: anchors[n-1]`를 그대로 내보낸다.
  - `ipc.ts` `conversationHandler`(start, send, queue): 보낼 때 root 목록에서 캔버스 앵커를 확인하고 경로를 바꾼다(아래 '보낼 때').
  - `messageText.ts` `chipLabel`/`messageLine`: 캔버스 앵커의 이름. 제목, 알림, 큐 줄에 쓰이므로 main이 import할 수 있는 곳에 둔다.
  - `types.ts`의 `Anchor`
  - `drafts.ts`, `queue.ts`(`combineQueued`)는 앵커를 그대로 다루는지 테스트로 확인한다.
- **app (renderer)**:
  - `ShellSidebar.tsx`: 캔버스 행을 끌 수 있게 한다. 행 메뉴 트리거와 chevron은 `draggable={false}`이고, 페이지가 잠겨 있으면 끌 수 없다.
  - `canvasRowMenu.ts`: "Add to message" 항목과 그 가능 여부·이유.
  - 앵커 거울:
    - `anchorField.ts`: `targetKey`가 캔버스를 키에 넣는다. 그래야 다른 캔버스 둘이 한 앵커로 합쳐지지 않고 32곳 수도 맞는다. `isAnchor`는 클립보드용 판정이다.
    - `chipField.ts`: `ICONS`, `KIND_PREFIX`, drop 처리
    - `fieldDecorations.ts`: 놓일 자리 표시
  - 칩 필드의 범위 hook: 지금 `scope()`는 캔버스 하나이고, `null`이면 칩을 받지 않는다. 여기에 `root()`를 더한다. 클립보드 JSON에 `root`를 쓰고, `readFieldClipboard`가 칩마다 칩 또는 이름으로 바꾼다. `insertChip`은 칩 종류에 맞는 범위를 본다.
  - Home composer(`HomeComposerView.tsx`, `homeConversations.ts`): 지금은 `text: string`만 가진다. 이것을 segments와 anchors로 바꾼다. 같이 바뀌는 것은 마지막 요청(`LastRequest`), 시작 초안(`ComposerDraft`), 돌려받은 시작 초안(지금 `plainText`로 평평하게 만든다), Edit on Home(`restoreRequest`), 비교 함수(`same`)다. Home 시작도 앵커를 싣는다(지금은 "Home starts carry no anchors").
  - 보낸 칩: `SentChip`에 캔버스 칩 분기를 둔다. Overview와 Home 스레드에는 `onLocate`가 없으므로 open prop을 새로 준다. 프로토타입 창의 `prototype/requests.ts`(`prototype:reveal`의 `chip`)는 캔버스 앵커를 locate로 보내지 않고 메인 창 열기로 보낸다.
  - App: 보이는 composer가 자기를 등록한다(아래 '메뉴와 놓기의 판정').
- **CLI, 스킬, 가이드**: 바뀌지 않는다.

## 앵커 형식

- 지금 `Anchor`(`types.ts`)는 판별 필드가 없고, `{frame?, element?, point?}`처럼 키가 붙은 선택 객체들이다. `validAnchor`는 키 목록을 허용 목록으로 본다.
- 캔버스 앵커는 `{canvas: {path, id}}`다. `id`는 필수다. 다른 곳의 캔버스 참조(`context.canvas`, `HandoffOrigin.canvas`, `conversation.bound`)와 같은 `{path, id}` 모양이다.
- 검증은 `store.ts`의 `validCanvas`에 `canvasKind(path) !== null`(소문자 `.html`, `.doan/canvases/`나 `.doan/ds/`, 점 구간 없음)을 더한다. `canvas`가 `frame`, `element`, `point`와 함께 오면 거절한다.
- 프롬프트에는 `name`을 더하지 않는다. 에이전트는 `path`에서 이름을 안다.
- **되돌림 비용(사실)**:
  - 대화 이벤트 JSONL은 기기 로컬 형식이고 공유 JSON Schema가 없다(§11, `schema/`에 없다). `validAnchor`만 손으로 검사한다.
  - 이전 빌드의 `store.ts` `parse`는 모르는 앵커 키에서 "Invalid conversation event"를 내고, 그 대화 전체를 읽지 못한다. `appendAll`도 쓰기 전에 읽으므로 이어 쓸 수 없다.
  - `service.list`는 그 대화만 읽을 수 없는 행으로 보여 주고, 다른 대화는 멀쩡하다. `drafts.ts`는 그 대화의 읽을 수 없는 항목을 디스크에 둔 채 뺀다.
  - ARCHITECTURE §7이 `activity.result`, `canvas.drawn`, `model_unavailable`에서 이미 받아들인 규칙("shows as a read failure until Doan is upgraded again")과 같다. 승격 때 그 문단에 한 문장을 더한다.

## 끌기

- **데이터는 메모리에만 둔다**: `dragstart`에서 `{root, path, id}`를 renderer 모듈의 "지금 사이드바 끌기"에 두고, `dragend`에서 지운다. `dataTransfer`에는 Doan 전용 MIME 표식만 넣고, `{root, path}`나 `text/plain`은 넣지 않는다.
  - Chromium은 `dragover` 동안 MIME 종류만 보여 주고 `getData`는 빈 문자열이다. 메모리에 두면 끄는 동안에도 같은 root인지, Home과 맞는지, 한도에 닿았는지를 판정할 수 있다.
  - 캔버스 iframe에 놓여도 절대 경로 root가 신뢰할 수 없는 캔버스 스크립트로 가지 않는다(SECURITY.md 'Scope').
  - MIME 표식은 있는데 메모리에 끌기가 없으면(다른 창이나 다른 앱) 받지 않는다.
  - `effectAllowed = "copy"`. `setDragImage`로 칩 모양의 미리보기를 쓴다.
- **보드 막기**: 캔버스 끌기 중에는 보드 위에 투명한 막을 깐다(Hand 끌기의 막과 같다). 캔버스 iframe이 놓기를 받지 않게 하기 위해서다.
- **칩 필드의 drop**:
  - `prosemirror-view`는 편집 가능한 뷰의 `dragover`와 `dragenter`에서 늘 `preventDefault`를 부른다. 그래서 Chromium의 기본 drop caret이 그려지지 않는다. 또 지금 `chipField.ts`는 모든 `drop`을 막는다.
  - 그래서 놓일 자리 표시를 직접 그린다. `posAtCoords` 자리의 widget decoration(`fieldDecorations.ts`)을 쓰거나 `prosemirror-dropcursor`를 쓴다. 후자는 새 의존성이므로 정확한 버전 고정과 의존성 검토가 필요하다. T1 PoC에서 고른다.
  - `handleDOMEvents.dragover`가 받지 않는 경우 `dropEffect = "none"`을 둔다.
  - 놓을 자리는 `unitFromPos`/`posFromUnit`으로 맞춘다. 목록 접두어나 filler 안에 놓이지 않게 하기 위해서다. 그다음 `placeCaret`과 기존 `insertChip`을 부른다. 그러면 한도와 IME 조합 처리를 그대로 쓴다.
  - composer의 글 칸 밖(카드의 다른 부분)에 놓으면 caret, 없으면 끝에 넣는다. `useComposerDrop`(파일 드롭)은 Files가 아닌 끌기를 무시하므로 충돌하지 않는다. 다만 캔버스 끌기에는 파일 드롭 덮개를 띄우지 않는다.
- **받지 않는 composer의 이유 줄**: 끄는 동안 받지 않는 composer 위에 중립 테두리와 이유 한 줄을 보여 준다. 모양은 드래프트에서 정한다.

## 메뉴와 놓기의 판정

- 보이는 composer가 App에 `{root, canTake(anchor): reason | null, insert(anchor)}`를 등록한다. `canTake`는 칩 필드의 판정(읽기 전용, IME, pick 중, 32곳 수: `distinctTargets`)을 쓴다. 그래서 메뉴와 놓기의 판정이 같다.
- **`canvasChipTarget(row, screen, composer)`**: 위에 화면, root, 행에 대한 규칙을 더한다.
  - root가 같은지. 다르면 같은 프로젝트의 다른 worktree인지 가려 그 브랜치를 말한다.
  - id가 있고 비어 있지 않으며 그 root 목록에서 겹치지 않는지. `rowProblem`은 읽기 오류만 다루므로, 이 판정은 따로 둔다. `doan ls`가 `""`를 줄 수 있다(`trashBlock`).
  - 행에 읽기 오류가 없는지
  - root 목록을 읽는 중이거나 문제가 없는지
  - composer가 없는 화면인지
  - 프로토타입 창이면 받지 않는다.
- 메뉴는 Radix modal이라 `onSelect` 안에서 옮긴 포커스가 되돌아온다. 그래서 `onCloseAutoFocus`에서 `preventDefault`하고 composer로 옮긴다.

## 보낼 때 (main)

- `start`, `send`, `queue`에서 root가 정해진 뒤(보내기는 `target.root`), 캔버스 앵커마다 `project.canvases`에서 id로 하나를 찾는다.
  - 찾으면 앵커의 `path`를 지금 경로로 바꾼다.
  - 없거나 겹치면 그 칩을 이름 텍스트로 바꾸고 앵커에서 뺀다. `{{n}}` 번호를 다시 매긴다.
- 이 확인은 `store.ts`나 `drafts.ts`의 검증에는 넣지 않는다. 캔버스를 지운 뒤에도 히스토리와 초안은 읽을 수 있어야 하기 때문이다.
- 큐와 Send now는 실제로 나갈 때 같은 처리를 거친다.

## 누르기

- 보낸 칩과 composer 칩은 `replyChipTarget({canvas: anchor.canvas.id}, …)`를 그대로 쓴다. 결과는 다음과 같다.
  - `"locate"`(지금 캔버스)는 Fit이 된다.
  - 다른 캔버스는 deep link 열기다.
  - missing은 누른 뒤에 "No longer in <project>"가 된다.
  - 중복, 목록을 읽는 중, 문제는 토스트가 된다.
- 프로토타입 창에서는 `prototype:reveal`에 새 종류를 두고, 메인 창에서 그 캔버스를 연다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `validAnchor`의 캔버스 앵커
  - 받는 path: `.doan/canvases/`, `.doan/ds/`, 하위 폴더, 비ASCII 이름
  - 거절: `..`, 절대 경로, `.HTML`, 점 구간, 길이 한도 초과, id 없음, 다른 키와 섞임
- 앵커 거울
  - `targetKey`: 캔버스 둘이 따로 센다.
  - `chipLabel`/`messageLine`: 제목, 큐 줄, 알림
  - `isAnchor`
  - `combineQueued`의 번호 다시 매기기와 32곳
  - `drafts.ts` 왕복
  - `store.ts`가 캔버스 앵커가 든 `user.message`를 읽는다.
- `canvasChipTarget`와 행의 id 판정
- 클립보드 범위 변환: 칩마다 칩 또는 이름, 섞인 클립보드, 32곳 넘침
- Home의 root 변경 변환과 그 알림 문구
- 보낼 때의 경로 바꾸기와 이름 대체(`{{n}}` 다시 매기기)
- 누르기 결과(`replyChipTarget` 재사용 확인)

## 형식, 규약, 결정에 미치는 영향

- **형식**: 앱 로컬 대화 이벤트의 앵커에 키가 하나 는다(위 '되돌림 비용'). 공유 JSON Schema, CLI 응답, `runtime.json`, 앱 소켓 메시지, `sessions.v1`은 바뀌지 않는다.
- **규약(ARCHITECTURE §1)**: 없다.
- **결정**:
  - PRODUCT §5 item 6의 칩 규칙이 바뀐다. 사용자가 이 feature에서 정했다.
  - 캔버스 경로는 main이 root 목록으로 확인한 것만 앵커로 나간다. renderer의 경로는 main 목록의 키라는 원칙(Canvas row menu IPC)과 같다.
  - 서빙 범위, sandbox iframe, GitHub 토큰, git 명령과는 관계가 없다.
- **보안**:
  - 끌기 데이터는 iframe에 닿지 않는다.
  - 앵커의 path는 프롬프트에 신뢰하지 않는 데이터로 들어간다.

## PoC (T1)

- 같은 창 안에서 사이드바 행 drag가 칩 필드 drop으로 되는지 확인한다. Electron 45, `prosemirror-view` 1.43.0에서 다음을 본다.
  - 놓일 자리 표시: decoration과 `prosemirror-dropcursor` 중 무엇을 쓸지
  - `posAtCoords`와 `unitFromPos`로 맞춘 자리
  - 파일 드롭과의 구분
  - 보드 위의 막
  - 트리 행의 클릭, 키, typeahead
- Playwright `_electron`의 drag가 창을 앞으로 가져오지 않고 이 흐름을 재현하는지도 확인한다. T6 runtime-test의 방식을 정하기 위해서다.

## postmortem에서 가져온 주의점

- 2026-11-22 "Sent anchor chips inserted line breaks into copied text": 캔버스 칩도 보낸 말풍선에서 복사할 때 줄바꿈을 넣지 않는다.
- 2026-11-08 "Look Up named a composer chip by its screen-reader text": Look Up, 복사, 붙여넣기는 보이는 이름을 쓴다.
- 2026-11-03 "A canvas row menu closed by Esc dropped focus to the page body": 메뉴를 Esc로 닫으면 행으로 돌아간다. "Add to message" 뒤에는 composer로 간다.

## 드래프트 요청

`/design-draft canvas-chip`으로 새 드래프트를 그린다.

- **프레임**:
  - `chip`: composer 안의 캔버스 칩, 기존 프레임·요소 칩과의 비교, `ds/` 칩
  - `drag`: 칩 모양 드래그 이미지, 놓일 자리 표시, 받지 않는 composer의 테두리와 이유 줄
  - `menu`: 행 메뉴의 Add to message와 꺼진 상태
  - `sent`: 보낸 말풍선의 칩, 없는 캔버스를 눌렀을 때
  - `home`: Home의 root 불일치, 프로젝트·worktree를 바꿀 때의 알림
  - `copy`: 문구
- 문구는 `clarify` 프리셋으로 정한다.

## 읽은 design preset

- `shape`: 기존 화면을 넓히는 경우. 칩의 시각 체계는 지금 프레임·요소 칩을 이어받는다.
