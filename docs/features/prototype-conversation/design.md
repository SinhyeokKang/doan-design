# prototype-conversation — design

동작은 spec.md에 있고 모두 사용자가 정했다('결정'). 이 문서는 구현 방법이다. PoC 결과와 PoC가 보지 못한 것은 'PoC 의존'에 있다.

## 형제 feature와의 의존

세 prototype feature는 `prototype-responsive` → `prototype-cli-export` → `prototype-conversation` 순서로 구현하고 병합한다(직렬 체인, spec 결정 18). 이 feature는 앞의 두 feature가 develop에 넣은 것 위에 선다.

- `prototype-responsive`
  - 툴바 줄은 없다. 창의 컨트롤은 모두 헤더에 있고, 콘텐츠 패널과 그 아래 8 여백은 지금 그대로다. 헤더는 한 줄(56)이거나 이름이 내려간 두 줄(100)이고, 창 맞춤 높이는 표시 높이 + 64, 맞춘 폭에서 이름이 둘째 줄이면 + 108이다(PRODUCT §5 item 2 'Prototype window' 'One window', ARCHITECTURE §3 'Prototype window' 'Fit').
  - `prototypeViewportBox(panel, mark, mode)`(ARCHITECTURE §3 'Prototype window' 'Rendering in place'). Fit 모드(기본)는 표시 크기를 지키고 줄여 보이고, Responsive 모드는 콘텐츠 패널을 채운다.
  - `prototypeCaptureRect(content, mark, mode, sideColumn = 0)`. 이 feature가 `sideColumn`에 대화 열 폭을 넘긴다.
  - main `PrototypeState`의 모드를 `CLOSED`에도 두는 방식. 패널 상태도 같은 자리에 둔다.
  - 세 무리 헤더. 왼쪽 [Back x88, Forward x124, Reload x160]은 지금 그대로이고, 오른쪽 무리(`.pw-right`)는 창 오른쪽 끝 16 안쪽에 항목 간격 4로 [모드 토글(`.doan-toggle-group`, 이름 "Viewport", 68 × 36), Export(32)]다. 이 feature는 그 끝(Export 뒤 4)에 대화 버튼(32)을 더해 오른쪽 무리 폭 R을 104에서 140으로 만든다.
  - 프레임 이름 캡슐(`.pw-name`)은 x200부터 W − 24 − R까지의 공간(폭 S = W − 224 − R, W는 창 콘텐츠 폭)을 채운다. S ≥ 80이면 첫째 줄이고, S < 80이면 같은 캡슐이 헤더 둘째 줄로 간다(`.pw.name-row`, ARCHITECTURE 'Fit'의 `prototypeHeaderRows`). 둘째 줄은 높이 44(캡슐 36 + 8)이고, 캡슐은 x16부터 W − 16까지, y56–92이며 이름은 가운데다. traffic light와 두 무리는 첫째 줄에 남고, 헤더는 100, 콘텐츠 패널과 대화 열은 y100에서 시작한다. 프레임 메뉴는 캡슐 4 아래에 열린다. 이름은 언제나 보이고 메뉴는 언제나 열 수 있다.
  - R 140에서는 창 폭 444부터 첫째 줄이고, 443 이하는 둘째 줄이다. 예: 640 창 캡슐 276, 600 창 236, 520 창 156, 480 창 116, 444 창 80, 443 창 둘째 줄 411, 406 창 374, 360 창 328.
  - 창 폭이 경계를 지나면 같은 요소가 CSS로 줄을 옮긴다. 포커스와 열린 메뉴는 캡슐에 남고, 콘텐츠 패널과 대화 열은 애니메이션 없이 44 움직인다. 360·480 창에서 패널을 열어 640이 될 때도 같다(360 창은 둘째 줄에서 첫째 줄로).
- `prototype-cli-export`
  - 헤더 오른쪽 무리에서 토글 다음의 Export prototype(32 chrome 아이콘 버튼, `Download`). 대화 버튼은 그 뒤에 온다.
  - 프로토타입 창의 토스트 호스트(`Toast.tsx` 재사용)와, `Toast.tsx`가 쓰는 `onWindowVisible`의 프로토타입 preload 판. 이 feature는 그 호스트를 쓰고 새로 만들지 않는다.
  - `doan open --prototype`으로 시작하는 Play. 새 Play 목록에 들어간다.
  - `PrototypeView`의 `root`·`path`. Export, Show in Finder, 창 visibility는 `index.ts`의 창 host가 다루고, `PROTOTYPE_WINDOW_REQUESTS`가 prototype role의 허용 목록이다. 이 feature의 세 채널도 그 목록에 넣는다.
- 앞의 두 feature가 계획과 다르게 병합되면 이 문서의 해당 문장을 `/tdd` 전에 고친다.

## 영향 범위

- **앱(Electron + TS)만 바뀐다.** CLI(Go), 스킬, guide, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지는 바뀌지 않는다.
- 대화 런타임(`app/src/main/conversation/`)의 서비스, 저장소, 이벤트 JSONL v1, `drafts.json`, 프롬프트는 바뀌지 않는다. 바뀌는 것은 누가 그 IPC를 부를 수 있는지, 이벤트를 어느 창에 보내는지, renderer에서 패널을 세 번째 host로 띄우는 일, 프로토타입 창의 칩과 일부 버튼이 main 창을 옮기는 길이다.

### 구조

- **main**: 프로토타입 창의 main frame(sender role `prototype`)에 대화 채널과 composer가 쓰는 채널 일부를 연다. 대화 요청은 모두 "지금 재생 중인 target의 캔버스에 묶인 대화"로 범위를 좁혀 main이 검사한다. 대화 이벤트, stage, 목록 변경 알림은 그 캔버스의 대화 것만 프로토타입 창에도 보낸다.
- **preload**: `app/src/preload/prototype.ts`에 대화 API를 더한다. 채널 이름은 지금처럼 글자 그대로 쓰고 테스트가 `ipc.ts`와 맞춰 고정한다(ARCHITECTURE §7 'Prototype window IPC' 'Preloads stay separate': 공유 값은 sandbox preload가 require할 수 없는 chunk가 된다).
- **renderer**: 프로토타입 창이 자기 `ConversationStore`를 하나 가진다. main 창의 store와 따로이므로 초안(`drafts` by `draftKey`), 질문 선택 중 상태, 첨부 칩이 창마다 갈린다. 패널 본체는 `CanvasConversationPanel`의 thread + docked composer + 새 대화 상태(제안 프롬프트, 터미널 세션 선택)를 그대로 쓰되, `window.doan`을 직접 부르는 곳을 주입된 호출 객체로 바꾼다. ARCHITECTURE §7 'Renderer primitives'는 "only their hosts … call preload"라고 하므로, 프로토타입 창은 Overview와 canvas 패널에 이은 세 번째 host가 된다.

### 바뀌는 파일

| 파일 | 내용 |
|---|---|
| `app/src/main/index.ts` | `conversation:*` 핸들러는 `handle()`·`senderAllowed`를 거치지 않고 직접 등록된다(`ipcMain.handle(\`conversation:${method}\`, …)`). 이 핸들러가 `fromWindow(event)` 대신 `senderKind(event)`를 받고, `prototype`이면 범위 검사(`prototypeConversationScope`)를 거친다. `attachments:*` 핸들러도 안에서 `fromWindow`를 직접 검사하므로 role 판정으로 바꾸고, `attachments:choose` 대화상자의 부모를 요청을 보낸 창으로 둔다. `conversation:event`·`stage`·`listChanged`·`handoff`를 범위 필터(`prototypeReceives`)를 거쳐 프로토타입 창에도 보낸다. 알림 visibility에 프로토타입 창의 포커스와 보여 주는 대화를 넣는다. `prototype:reveal`을 받으면 main 창을 보이게 하고 앞으로 가져와 main renderer에 보낸다. 프로토타입 창이 닫히면 그 창이 쥔 첨부 id를 해제한다 |
| `app/src/main/senderAllowed.ts` | `prototype` 집합에 composer 보조 채널(아래 '프로토타입 role이 부르는 채널'의 대화 밖 채널)만 더한다. 대화 채널은 위 직접 핸들러에서 막는다. `mainOnly`는 넓히지 않는다 |
| `app/src/main/conversation/ipc.ts` | `conversationHandler`가 sender를 boolean이 아닌 role + 범위로 받는다. 검증 자체(shape, limits)는 그대로다. 프로토타입 role의 `list` 답은 target 캔버스의 행만 남긴다 |
| `app/src/main/prototype/conversationScope.ts` (새 파일, Electron 없음) | 순수 함수 1, 2, 3 |
| `app/src/main/prototype/ipc.ts` | `PrototypeView`에는 `prototype-cli-export`가 넣은 `root`와 `path`(target 캔버스 행의 path, 행이 사라지면 마지막 path)가 이미 있다. 여기에 target 캔버스의 id(`canvasId?`, id 없는 캔버스면 없음)와 패널 상태(열림, 폭)를 더하고, renderer는 셋으로 `{root, canvas: {path, id?}}`를 만든다. 지금의 `canvas` 필드는 라벨 문자열이므로 그대로 둔다. `prototype:panel`, `prototype:showing`, `prototype:reveal` 채널을 더하고 `PROTOTYPE_WINDOW_REQUESTS`에 넣는다. `PrototypeWindowApi`에 대화 호출을 더한다 |
| `app/src/main/prototype/requests.ts` (+ test) | 세 채널의 parser: `prototype:panel`의 열림과 폭 범위, `prototype:showing`의 `conversationId \| null`, `prototype:reveal`의 종류별 모양 |
| `app/src/main/prototype/fit.ts` | 순수 함수 6, 7, 8 |
| `app/src/main/prototype/windowState.ts`, `controller.ts` | 패널 열림·폭을 state에 둔다. `CLOSED`에도 있어서 창을 닫아도 남고 앱 종료로만 사라진다(모드와 같은 자리). Play의 맞춤과 최소폭에 반영한다. `host.capture`에 대화 열 폭을 넘긴다 |
| `app/src/main/prototypeWindow.ts` | 패널을 열 때 창 콘텐츠 폭을 넓히고(`setContentBounds`: 창이 `useContentSize`를 쓴다), 최소폭을 `setMinimumSize`로 360/640 사이에서 바꾼다. `capture`가 `prototypeCaptureRect`의 `sideColumn`에 대화 열 폭을 넘겨 패널 글이 정지 이미지에 찍히지 않게 한다. main 창과 같은 `context-menu` 리스너를 붙여 `editMenu.ts`로 텍스트 편집 메뉴를 연다(main frame만: `editMenuInput`의 `isTopFrame`이 캔버스 iframe을 뺀다). 첫 화면부터 buddy의 accent를 쓰도록 main 창처럼 URL query에 buddy를 넣는다 |
| `app/src/main/notifications.ts` | `notificationFor`가 "포커스된 프로토타입 창이 열린 패널에 이 대화를 보여 준다"를 알면 알림을 만들지 않는다(순수 함수 10) |
| `app/src/main/menuState.ts` | 바뀌지 않는다. Edit와 Undo/Redo는 이미 포커스된 창에 작동하고, New Conversation·Pick from Canvas는 프로토타입 창 포커스 중 계속 꺼져 있다 |
| `app/src/preload/prototype.ts` (+ test) | 대화 호출과 이벤트 구독, `prototype:panel`·`showing`·`reveal`, 자기 창의 visible 이벤트(`prototype-cli-export`가 더한 것 재사용), `droppedPath`(`webUtils.getPathForFile`). 채널 이름 고정 테스트 |
| `app/src/preload/index.ts` | main 창이 `reveal`을 받는 이벤트 구독 하나와 Last used 선택을 받는 구독 하나를 더한다 |
| `app/src/renderer/conversationStore.ts` | `window.doan`을 직접 부르는 곳(`readConversation`, `takeConversationDraft`, `sendQueuedNow`, 첨부 해제·재확인)을 생성자로 받은 호출 객체로 바꾼다. 프로토타입 store는 창이 닫힐 때 그 초안을 버린다 |
| `app/src/renderer/CanvasConversationPanel.tsx`, `canvasRun.ts`(`conversationResumeTarget`), `dockedSupport.ts`, `useProjectSkills.ts`, `dockedBuddyShell.ts`, `visibleClock.ts`(`onWindowVisible`) | 같은 주입. `CanvasConversationPanel`의 `droppedPath`도 주입한다. 본체가 main 창 전용 부분 없이도 그려지도록 "머리 없는 본체"를 꺼낸다(아래 '패널 본체 나누기') |
| `app/src/renderer/ConversationThread.tsx` | `answerReached`가 `{error: "stale"}`을 `settleQuestionSend`처럼 실패 없이 다룬다. 지금은 권한 카드에 "Couldn’t send your answer. Choose again."이 떠서, 다른 창이 먼저 답한 경우에 맞지 않는다 |
| `app/src/renderer/App.tsx` | main 창이 `reveal`을 받아 처리한다(아래 '프로토타입 창 → main 창'). 프로토타입 composer의 Last used 선택을 받아 `rememberChoice`와 `preferenceAfterPick`으로 적용한다 |
| `app/src/renderer/prototype/PrototypeWindow.tsx`, `WindowShell` | 헤더 오른쪽 무리 끝의 대화 버튼과 배지(오른쪽 무리 R 140, 이름의 줄은 위 '형제 feature와의 의존'의 규칙), 콘텐츠 패널 옆의 대화 열(창 아래 8까지), 리사이즈 손잡이, buddy accent 적용. 토스트는 `prototype-cli-export`의 호스트를 쓴다 |
| `app/src/renderer/prototype/conversation.ts` (새 파일) | 순수 함수 4, 5, 9, 11 |
| `app/src/renderer/prototype/PrototypeConversation.tsx` (새 파일) | 프로토타입 창의 대화 host: store, 구독(구독 먼저, 그다음 읽기), 재생 프레임 칩, 본체, docked buddy, 칩과 main 창 전용 버튼을 `prototype:reveal`로 보내기 |
| `app/src/renderer/rendererImports.test.ts` | 이미 `prototype.html`을 entry로 걷는다. 새 import 사슬이 ajv·Node 모듈에 닿지 않는지 그대로 확인한다 |
| `.doan/canvases/prototype-conversation.html` | `/design-draft`가 새로 그리는 초안. 기존 `frame-prototype.html`, `doan-canvas-conversation.html`과 형제 feature의 초안은 고치지 않는다 |

### 프로토타입 role이 부르는 채널

- 대화(직접 핸들러에서 범위 검사): `read`, `list`, `forCanvas`, `resumeTarget`, `start`(그 캔버스의 `new`와 그 캔버스 association의 `resume`만), `send`, `queue`, `removeQueued`, `sendQueuedNow`, `takeDraft`, `interrupt`, `answerPermission`, `answerQuestion`, `markSeen`, `models`, `skills`, `setPermissionMode`. `delete`와 `newDesign`은 거절한다.
- composer와 새 대화 상태가 쓰는 나머지(`senderAllowed`의 prototype 집합). 좁은 읽기로 둔다.
  - 프리셋 읽기: `design-skills:list`, `design-skills:get`.
  - provider 준비 상태만 주는 읽기와 그 변경 이벤트. `agent-auth:read`는 email까지 주므로 열지 않는다.
  - 터미널 세션 선택용 좁은 읽기: "이 캔버스의 association 세션이 아직 터미널에서 일하는가"와 그 변경. `work:get` 전체는 열지 않는다. root로 거르지 않는 이유는 그 세션이 어느 프로젝트에서 일하든 선택을 막아야 하기 때문이다(PRODUCT §5 item 2 'Terminal session').
  - New conversations 기본값, Last used, buddy만 돌려주는 설정 읽기. `preferences:read`와 `preferences:write`는 열지 않는다.
  - Last used 기억: composer의 선택(`ComposerChoice`) 하나를 main을 거쳐 main renderer에 넘긴다. main이 ui-state 파일에 직접 쓰면 main renderer의 다음 통째 저장이 덮어쓰기 때문이다(`App.tsx`의 ui-state 저장). main renderer가 `rememberChoice`와 `preferenceAfterPick`을 적용하므로, 저장된 provider가 하나일 때 pick이 provider를 바꾸는 규칙(PRODUCT §5 item 0 'New conversations')도 그대로 따른다.
- 첨부: `attachments:choose`, `add-paths`, `add-pasted`, `remove`, `recheck`, `release`, `fromPaths`. `attachments:capture`는 열지 않는다.
- 링크: 에이전트 답의 `https:` 링크를 여는 `shell:openLink`.
- 자기 채널: `prototype:panel`, `prototype:showing`, `prototype:reveal`.

### 범위 검사

- 프로토타입 창의 target은 (root, canvas key, frame)이다(ARCHITECTURE §3 'Target and run').
- 대화 id를 받는 요청은 그 대화가 같은 root에 있고, 대화의 캔버스가 target 캔버스와 같은 행으로 맞을 때만 허용한다. 판정은 main 쪽 `resolveListedCanvas`와 같은 규칙(정확히 하나의 목록 행)을 쓴다.
- root만 받는 메서드(`models`, `skills`, `forCanvas`, `resumeTarget`)는 root가 target root와 같아야 허용한다.
- `list`는 프로토타입 창이 보여 주는 캔버스(root와 canvas)를 함께 싣고, 그 캔버스가 target 캔버스일 때만 허용한다. 답은 target 캔버스 행의 대화만 남긴다(서비스의 `list`는 root의 대화 전체를 돌려준다). 다른 캔버스를 이름 대면 `{error: "not_playing"}`으로 답한다. view는 정지 화면 캡처 뒤로 밀려 main의 Play보다 늦게 오므로, 창이 아직 앞 캔버스를 보여 주는 동안 지금 재생 중인 캔버스의 목록을 받아 앞 캔버스의 대화가 지워진 것으로 읽지 않게 하기 위해서다. 창은 이 답을 실패로 보이지 않고 다음 view에서 다시 읽는다. 또 캔버스를 바꿀 때마다 읽기 세대를 올려, A→B→A 앞의 A 읽기가 늦게 끝나도 적용하지 않는다.
- "target loading·lost"는 ARCHITECTURE §3 'Target and run'의 캔버스 행 판정이다(목록을 읽는 중, 행이 사라짐, ID 겹침, 등록되지 않은 root). 이때는 거절한다(추측하지 않는다). run phase가 아니므로, 행이 살아 있는 한 Frame unavailable, Prototype unavailable, 로드 실패 상태에서도 허용한다.
- target이 바뀌는 순간(다른 캔버스의 Play, Back/Forward)과 늦게 도착한 요청 사이의 경합은 main이 요청 시점의 target으로 판정해서 끊는다. 프로토타입 창의 store는 view의 target이 바뀌면 그 캔버스의 대화로 갈아탄다.
- 이것으로 지키는 것: 캔버스 iframe에는 여전히 preload가 없고(§3 'Sender role'), 프로토타입 창 main frame이 무엇을 하든 재생 중인 캔버스의 대화 밖으로는 못 나간다. 프로젝트 대화, 다른 캔버스의 대화, 대화 삭제, 계정 email, 설정 쓰기(Last used 하나 빼고)는 닿지 않는다.

### 패널 본체 나누기

- `CanvasConversationPanel`은 지금 `CanvasRun`(어떤 대화를 보일지, 터미널 세션 선택, 승격 알림), `CanvasTarget`, 프레임 이름, locate, pick, work 목록을 받는다. 프로토타입 host에는 Pick, Capture area, 제목 메뉴, New conversation 버튼만 빠진다.
- 그래서 thread + composer + 새 대화 상태(제안 프롬프트, 터미널 세션 선택) + 전송 경로를 `ConversationCalls`(preload 부분집합 타입)를 받는 본체로 꺼내고, main 창 패널은 그 위에 머리(제목 메뉴, New conversation, Hide)를 얹는다. 어떤 대화를 보일지는 main 창에서는 `CanvasRun`이, 프로토타입 창에서는 순수 함수 4가 정한다.
- `ConversationStore`, `DockedSupport`, `useProjectSkills`, docked buddy shell, `visibleClock`도 호출 객체를 받는다. main 창은 `window.doan`을, 프로토타입 창은 `window.doanPrototype`의 해당 부분을 넘긴다. 프로토타입 창에는 `window.doan`이 없으므로, 본체가 그것 없이 렌더되는지를 테스트로 고정한다.
- 본체의 locate와 main 창 전용 버튼(Sign in, Open들)의 콜백은 host가 정한다. main 창 패널은 지금처럼 처리하고, 프로토타입 host는 `prototype:reveal`을 보낸다.
- 목록 읽기 실패: main 패널은 제목 메뉴의 Retry와 새 대화로 쓸 수 있는 composer를 둔다. 프로토타입 host는 머리가 없으므로 thread 자리에 오류 줄과 Retry를 두고 composer를 막는다(순수 함수 4의 `list_error`).

### 재생 프레임 칩과 앵커

- 고정 칩은 composer 필드 밖, composer 위에 그린다. 필드의 segment가 아니므로 지우거나 잘라 낼 수 없고 Undo 대상도 아니다. 이름은 run이 보고한 `frames`의 원래 title을 쓴다. `view.title`은 title이 없으면 id로 바뀐 값이라 앵커의 `title`로 쓰지 않는다.
- 고정 칩은 포커스를 받지 않는다. 그래서 힌트는 native `title` "Sent with each message" 하나뿐이고(shipped chip field의 칩과 같다, `chipField.ts`), 공유 Tooltip은 쓰지 않는다. 칩의 뜻은 composer 필드의 `aria-describedby`("Frame <이름> is sent with each message.")로 전한다. 재생 프레임이 바뀌면 이 설명도 바꾸고, composer가 잠기면(캔버스가 목록에 없음, ID 중복) 필드에서 설명을 뺀다.
- 보낼 때 `withPlayingFrame`(순수 함수 5)이 재생 프레임 칩 segment를 필드 segment 앞에 붙이고, 그 결과를 지금의 `toMessage`로 메시지로 만든다. `toMessage`는 같은 장소에 같은 번호를 다시 쓰므로, 필드에 같은 프레임 칩이 있어도 앵커가 하나만 생긴다. 필드가 이미 같은 재생 프레임 칩으로 시작하면 붙이지 않는다.
- 앵커는 `{frame: {id, title}}`이고, `validAnchor`와 `anchorTokens` 규칙(marker가 앵커를 정확히 덮는다)을 그대로 지킨다. 그래서 앵커 형식, 프롬프트 직렬화(`turnPrompt`), 이벤트 형식이 바뀌지 않는다.
- 한도: 필드의 32개 장소 한도(붙여 넣은 칩을 칩으로 남길지 이름으로 바꿀지의 판정)에 재생 프레임을 센다. 보낼 때의 검사는 지금 그대로이고, 재생 프레임까지 세어 넘으면 기존 한도 문구로 거절한다.
- 큐: 큐에 넣는 순간 `withPlayingFrame`을 적용하므로, 큐 메시지는 넣은 순간의 재생 프레임을 싣는다. 필드의 캔버스(칩 복사·붙여넣기의 "같은 캔버스")는 재생 중인 캔버스다.
- 터미널 세션 이어 가기(resume)와 legacy external 대화로 보낼 때도 앵커를 싣는다. 이 경로는 첨부와 모델을 받지 않지만 앵커는 받는다(`ipc.ts`의 `message`).
- 대화 제목과 미리보기는 `messageLine`으로 칩 이름을 읽으므로 프레임 이름으로 시작한다. 사용자가 받아들인 결과다.

### 초안의 수명

- 프로토타입 store의 초안은 창이 열려 있는 동안만 산다. 창을 닫으면 store가 사라지고, main은 그 창이 쥐고 있던 첨부 id를 해제한다(창의 `closed`에서, 그 창이 받은 첨부 id 목록으로).
- 돌아온 큐(`takeDraft`): 두 store 모두 대화를 보여 줄 때 `takeDraft`를 부르고, main이 한 번만 내주므로 먼저 보여 준 창이 가져간다. 프로토타입 창이 닫혀 있으면 main 창 store만 부르므로 잃지 않는다. 프로토타입 창이 가져간 뒤 창을 닫으면 그 글은 창 초안과 함께 사라진다(창 초안을 버린다는 결정의 결과).
- main에서 새 대화가 시작되어 현재 대화가 바뀌면, 프로토타입 store는 앞 대화 키의 초안을 새 대화 키로 옮긴다. 새 대화 키에 초안이 이미 있으면 옮기지 않는다(순수 함수 11). 다른 캔버스로 Play한 경우에는 초안이 대화 키에 남았다가 그 캔버스를 다시 재생하면 돌아온다.

### 프로토타입 창 → main 창

- `prototype:reveal`의 종류:
  - `chip`: `{conversationId, anchor}`(사람 칩). 캔버스는 그 대화의 캔버스다.
  - `reply`: `{conversationId, link}`(답 칩의 `ReplyAnchor`, 캔버스 id를 가진다).
  - `settings`: Sign in이 여는 Settings > Agents의 provider.
  - `conversation`: 그리기 중인 프로젝트 대화의 Open, handoff 줄·카드의 Open, 승격 알림의 Open. `{conversationId}`와 열 대상(프로젝트 Overview, 또는 캔버스와 그 대화).
- main은 순수 함수 3으로 검사한다: 근거가 되는 대화가 범위 안인지, 모양이 맞는지(`validAnchor`, `parseReplyAnchor`). 통과하면 main 창을 보이게 하고 앞으로 가져온 뒤(알림 클릭의 `showFromNotification`과 같은 보이기 경로), main renderer에 요청을 보낸다.
- main renderer(App)의 처리는 순수 함수 12로 판정한다.
  - main 창에 dialog, 페이지 잠금, 첫 실행이 있으면: 아무것도 취소하지 않고 막힌 것으로 다룬다. 첫 실행을 막힌 경우에 넣은 것은 리드가 정했다(사용자 결정은 dialog와 페이지 잠금). 토스트 "Couldn’t show <칩 또는 대상 이름>."과 이유. deep link의 "Couldn’t open the link."는 쓰지 않는다. 링크를 연 적이 없기 때문이다.
  - `reply`: 지금의 답 칩 경로(`replyChipTarget.ts`)를 그대로 쓴다.
  - `chip`: `replyChipTarget`은 `ReplyAnchor`(캔버스 id)만 받으므로 새 경로를 둔다. 보여 주는 캔버스가 그 대화의 캔버스면 sent chip처럼 locate한다. 아니면 대화의 캔버스 행을 id(없으면 path)로 연다 → 첫 layout을 기다린다 → `Anchor`를 locate한다. 행을 못 찾으면 기존 "캔버스를 찾지 못함" 토스트, 대상이 없으면 "No longer in the canvas".
  - `settings`·`conversation`: main 창에서 같은 버튼을 누른 것과 같은 함수를 부른다.
- 프로토타입 창 쪽 칩과 버튼은 결과를 기다리지 않는다. 눌렸다는 것만 끝내고, 결과는 main 창이 보인다.

### 패널 폭

- 창 레이아웃: 헤더(창 전체 폭) 아래에 [프레임 열: 콘텐츠 패널] [손잡이] [대화 열]. 둘 다 헤더 아래에서 창 아래 8까지 내려가 높이가 같다. 대화 열은 main 창의 `doan-conv-column`·`ov-right` 모양을 그대로 쓰되 머리만 뺀다. 콘텐츠 패널은 시작 쪽 모서리를, 대화 열은 끝 쪽 모서리를 둥글게 두고, 그 사이는 shipped 1 px 시작 테두리다(DESIGN 'Frame prototype').
- 패널을 열 때 창 폭이 640보다 좁으면 창을 640으로 넓히고 패널을 280으로 연다. 640 이상이면 창은 그대로이고 패널은 기본폭(`max(320px, 28dvw)`)을 최대폭으로 자른 값으로 연다. 작업 영역이 640보다 좁으면 작업 영역 폭까지만 넓히고 패널은 280으로 연다(프레임 열이 360보다 좁아진다). 넓힌 창은 작업 영역 안에 머물도록 옮긴다.
- 열려 있는 동안 창 최소폭은 640(`PROTOTYPE_WINDOW_MIN_WIDTH` 360 + 패널 최소 280)이고, 닫히면 360으로 돌아간다. 닫을 때 창 크기는 바꾸지 않는다. 작업 영역이 640보다 좁으면 열려 있는 동안의 최소폭도 작업 영역 폭이다. 최소폭이 작업 영역보다 크면 macOS가 창을 작업 영역 밖까지 둔다('PoC 의존').
- 작업 영역이 640보다 좁아 창 폭이 640보다 작으면 최대폭 `min(50dvw, 창 폭 − 360)`이 280보다 작아진다(600 창에서 240). 이때도 패널은 280을 지키므로(spec 결정 4) 손잡이의 최솟값과 최댓값이 모두 280이고 조절 범위가 없다(`aria-valuemax="280"`). shipped `panelBounds`(`rightPanelSize.ts`)는 두 한도가 겹치면 최댓값이 이기므로 이 경우에 그대로 쓰지 않는다.
- 패널 최대폭은 `min(50dvw, 창 폭 − 360)`이다(canvas 패널 규칙: DESIGN.md 'Panel width'). 창 폭 360일 때 콘텐츠 패널이 344인 것처럼, 프레임 열 360에서 콘텐츠 패널은 344다. 패널이 열리면 콘텐츠 패널과 대화 열 사이에는 간격이 없다. 둘은 한 면이고 그 경계는 대화 열의 shipped 1 px 시작 테두리다. 모서리는 콘텐츠 패널이 `R 0 0 R`, 대화 열이 `0 R R 0`(R = `--radius-container`)이다. 숫자는 `/design-sync`에서 잰다.
- 패널이 열린 채 새 Play가 창을 맞출 때는 창 콘텐츠 폭 = 표시 폭 + 16 + 패널 폭(최소 640), 높이 = 표시 높이 + 64(헤더 56 + 아래 여백 8)로 맞추고, 맞춘 창 폭에서 이름이 둘째 줄이면 + 108(헤더 100 + 8)로 맞춘다. 패널을 연 창은 640 이상이라 보통 한 줄이다. 폭이 작업 영역보다 넓으면 패널을 먼저 280까지 줄이고, 그다음 프레임 열을 줄인다. 높이는 작업 영역 높이까지다.
- 프레임 iframe은 `prototypeViewportBox(panel, mark, mode)`를 따른다. 대화 열이 폭을 가져가면 콘텐츠 패널이 좁아지고, Responsive 모드에서는 viewport가 패널을 채운 채 `innerWidth`와 media query가 줄어든다. Fit 모드에서는 viewport가 표시 크기를 지키고, 패널이 표시 크기보다 좁으면 비율을 지켜 줄여 보인다. 표시 폭이 344보다 좁은 프레임은 Fit 모드에서 자기 크기로 가운데에 놓이고, Responsive 모드에서는 패널을 채운다. Fit 모드의 프레임 경계(콘텐츠 패널 바탕 `--surface-inset`, 흰 프레임 상자, `--shadow-panel`)는 `prototype-responsive` 초안이 정한 것을 그대로 쓴다.
- 창 크기는 main이 바꾼다. 열 때는 작업 영역 안으로 옮긴 x와 새 폭으로 `setContentBounds`를 먼저 부르고, 그다음 `setMinimumSize(최소폭, 0)`을 부른다. 닫을 때는 `setMinimumSize(360, 0)`만 부른다('PoC 의존'). renderer는 열림과 폭을 `prototype:panel`로 요청하고, main이 순수 함수 6·7·8의 결과로 창을 맞추고 view로 패널 상태를 돌려준다. 창이 커지는 것은 run을 새로 시작하지 않는다(사람이 창을 키울 때와 같다).
- 정지 이미지: run이 ready에서 벗어날 때 main이 찍는 사각형(`prototypeCaptureRect`)에 `sideColumn` = 대화 열 폭(손잡이 포함)을 넘긴다. 그러지 않으면 패널 글이 정지 이미지에 찍힌다.

### seen, 알림, 작업 중 배지

- 프로토타입 창은 포커스와 패널 열림, 보여 주는 대화가 바뀔 때마다 `prototype:showing {conversationId | null}`을 보낸다(열린 패널이 대화를 보여 줄 때만 id). main은 창 포커스를 이미 알고(`focusChanged`), 두 값을 알림 visibility에 넣는다.
- seen 기록은 main 창과 같은 방식이다: 그 조건(포커스, 열린 패널, 그 대화)일 때 프로토타입 host가 `markSeen`을 부른다.
- 대화 버튼의 배지는 main 창 Show conversation의 판정(답 대기, 안 읽음)에 작업 중을 더한다. 작업 중은 목록의 `working`이다. 셋 중 하나만 보이고, 순서는 답 대기 > 작업 중 > 안 읽음이다(순수 함수 9의 일부). 이 우선순위는 리드가 정했다.

### 포커스

- 패널을 열면 composer 필드로, 닫으면 대화 버튼으로 포커스가 간다. 대화 버튼은 열림·배지가 바뀌어도 같은 요소다.
- 대화 버튼은 첫 view 전에도 쓸 수 있다(`disabled`가 아니다). 패널은 프레임에 기대지 않기 때문이다. 같은 때 `disabled`인 Reload와 모드 토글과 다르다.
- 대화 버튼의 `aria-controls`는 모든 상태에서 shipped `CONVERSATION_PANEL_ID`(`"doan-conversation-panel"`, `ConversationPanel.tsx`)를 가리키고, 그 id는 대화 열의 aside에 둔다. main 창의 Show conversation·Hide conversation과 같다. 초안은 패널을 여러 개 그리므로 이 속성을 빼고 `header-button` 캡션에 적었다.
- DOM 순서와 Tab 순서는 헤더(Back, Forward, Reload prototype, 프레임 이름(첫째 줄이나 둘째 줄의 캡슐), 모드 토글(Tab 정지 하나), Export prototype, 대화 버튼) → 프레임 콘텐츠 → 대화 패널이다(spec 결정 16). `prototype-responsive`의 헤더 순서 끝에 대화 버튼을 두고, 대화 열을 `.pw-panel` 뒤에 놓는다.
- 프레임 문서가 다시 로드될 때 캔버스 스크립트의 `focus()`나 `autofocus`가 composer의 포커스를 가져간다(PoC에서 재현). 그래서 포커스가 대화 열 안에 있을 때 만들어진 새 run iframe이 포커스를 가져가면, host가 포커스를 직전의 대화 열 요소로 바로 되돌린다. 되돌리는 기간은 그 iframe이 만들어진 때부터 그 run이 ready가 되어 보이고 1초 뒤까지다.
  - host 문서는 cross-origin iframe으로 간 포커스를 `relatedTarget`이 없는 `focusout`(과 window `blur`)으로만 안다. 대화 열 요소의 그 `focusout`에서 한 task 뒤(`setTimeout` 0) `document.activeElement`가 그 run iframe이면 되돌린다.
  - 기간을 두는 이유: host는 사람이 iframe 안을 누른 것과 스크립트의 `focus()`를 구별하지 못한다(iframe의 `:hover`도 false다). 기간 없이 늘 되돌리면 사람이 프레임을 눌러도 포커스가 composer로 돌아간다(PoC에서 재현).
  - 되돌려도 composer의 IME 조합이 이어진다(CDP `Input.imeSetComposition` 기준). 그 기간이 지난 뒤 캔버스가 부르는 `focus()`는 막지 않는다.
  - `inert`와 iframe의 `allow="focus-without-user-activation 'none'"`은 프레임 자신의 `focus()`를 막지 못해 쓰지 않는다(PoC).
- 헤더의 Reload를 포인터로 누른 뒤에는 두 조건이 모두 맞을 때만 새 run이 ready가 되면 포커스를 새 iframe 안으로 옮긴다: 누르기 전 포커스가 프레임 안이나 페이지(`body`)에 있었고, ready 때도 아직 페이지에 있다. 누르기 전 포커스가 composer나 그 밖의 곳에 있었으면 그대로 둔다(spec 결정 17이 이긴다).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `prototypeConversationScope(method, payload, target, conversations, entries)` (`main/prototype/conversationScope.ts`) — 프로토타입 role의 대화 요청이 허용되는지. 허용 메서드 목록, 대화 id 요청의 root·캔버스 맞춤, root만 받는 요청의 root 일치, `start`는 target 캔버스의 `new`와 그 캔버스 association의 `resume`만, `newDesign`·`delete` 거절, target 캔버스 행 판정(loading·lost·ID 겹침) 거절, run phase는 보지 않음. `list` 답 거르기(`prototypeListRows`)와 다른 캔버스를 이름 댄 `list` 판정(`prototypeListElsewhere`)도 같은 파일에 둔다.
2. `prototypeReceives(message, target, conversations)` (같은 파일) — `conversation:event`, `stage`, `listChanged`, `handoff`를 프로토타입 창에 보낼지. 이벤트·stage·handoff는 대화의 캔버스로, `listChanged`는 root로 판정한다. target이 없으면 보내지 않는다.
3. `prototypeRevealRequest(payload, target, conversations)` (같은 파일) — `prototype:reveal` 검사와 main renderer에 보낼 요청 만들기. 종류별(chip, reply, settings, conversation) 모양, 범위 밖 대화 거절, 사람 칩의 캔버스 결정.
4. `prototypeShownConversation(list, target)` (`renderer/prototype/conversation.ts`) — 그 캔버스의 현재 대화 id, 새 대화 상태, `list_loading`, `list_error`, 막힘(캔버스 사라짐·ID 겹침)을 구분한다. 캔버스 맞춤은 `canvasConversationRows.ts`의 `sameCanvas` 규칙을 그대로 쓴다.
5. `withPlayingFrame(segments, frame)` (같은 파일) — 재생 프레임 칩 segment를 앞에 붙이고(이미 같은 칩으로 시작하면 그대로) `toMessage`로 만든 메시지, 또는 32개 한도 거절. 필드 한도 계산용 `playingFrameCount`도 둔다.
6. `prototypePanelBounds(windowWidth)` (`main/prototype/fit.ts`) — 패널 최소 280, 최대 `min(50% of window, window − 360)`, 기본 `max(320, 28% of window)`을 최대로 자름.
7. `openPanelResize(window, workArea)` (같은 파일) — 패널을 열 때의 창 콘텐츠 bounds와 패널 폭. 640보다 좁으면 640·280, 640 이상이면 그대로·기본폭, 작업 영역이 640보다 좁으면 작업 영역 폭·280. 창은 작업 영역 안으로 옮긴다.
8. `fitPrototypeWindow` 확장 — 패널이 열려 있으면 폭 = 표시 + 16 + 패널(최소 640), 높이 = 표시 + 64(맞춘 폭에서 이름이 둘째 줄이면 + 108). 작업 영역보다 넓으면 패널을 280까지 먼저 줄이고 그다음 프레임 열. 결과에 조정된 패널 폭을 함께 돌려준다.
9. `playingFrameChip(view)`와 `conversationButton(state)` (`renderer/prototype/conversation.ts`) — 고정 칩의 이름(`frames`의 원래 제목, 없으면 id), 상태별 표시(loading 중엔 다음 프레임, lost엔 마지막 id와 제목), 접근 이름. 대화 버튼의 라벨·배지·접근 이름(답 대기 > 작업 중 > 안 읽음).
10. `notificationFor` 확장 (`main/notifications.ts`) — 포커스된 프로토타입 창이 열린 패널에 그 대화를 보여 주면 알림을 만들지 않는다. 다른 대화는 지금과 같다.
11. `carryPrototypeDraft(drafts, from, to)` (`renderer/prototype/conversation.ts`) — 현재 대화가 바뀔 때 앞 대화 키의 초안을, 새 키에 초안이 없을 때만 옮긴다.
12. `revealDecision(request, mainState)` (`renderer/` 쪽, App이 쓰는 새 모듈) — 막힘(dialog·페이지 잠금·첫 실행) → 토스트, 같은 캔버스 → locate, 다른 캔버스 → 행 열기 후 locate, 행 없음 → 토스트, `settings`·`conversation` → 기존 함수.

## 포맷 변경

- 없다. 공유 JSON Schema(ARCHITECTURE §11), format 버전 `v`, 이벤트 JSONL v1, `index.json` v2, `drafts.json`, app socket, CLI 출력이 그대로다. 앵커는 기존 프레임 앵커다.
- 앱 내부 IPC 채널만 는다(프로토타입 preload의 대화 API, `prototype:panel`, `prototype:showing`, `prototype:reveal`, main 창의 reveal·Last used 이벤트, 좁은 읽기들). 공유 스키마가 아니므로 fixture는 없다.
- 패널 열림과 폭은 main 메모리에만 있으므로 userData 파일이 생기지 않는다.

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. 캔버스 저자(에이전트)가 할 일이 없다.
- 프롬프트, guide, CLI 출력이 바뀌지 않으므로 `/agent-eval`이 필요 없다.

## 결정 영향

다음 결정 문장을 바꾼다. 사용자가 이 라운드에서 승인했고, 마지막 승격 task에서 고친다.

- **PRODUCT §3 In scope 마지막 문단**: buddy가 서는 곳("on Home, on the docked composer of the Overview and the canvas conversation panel and in the canvas working notice")에 프로토타입 창의 대화 패널을 더한다.
- **PRODUCT §5 item 2 'Prototype window'**
  - "Nothing in the window reaches the main window's selection, `doan active`, drafts, attachments or settings"를 새 경계로 다시 쓴다. 대화는 두 창이 함께 쓰고, 초안·첨부 칩은 창마다 따로이며, Last used 기억이 설정 쪽 예외다. 칩과 main 창 전용 버튼이 main 창을 앞으로 가져와 옮긴다. 같은 줄의 "viewing a canvas only there does not mark it seen"은 그대로 둔다.
  - 'Independence'의 "only a new play … changes its frame"은 그대로 둔다. 거기에 "프로토타입 창이 main 창을 바꾸는 길은 칩과 main 창 전용 버튼 클릭뿐"을 더한다.
  - 'Header'에 대화 버튼을 더한다: 오른쪽 무리의 끝(Export 뒤)에 있고, 그래서 오른쪽 무리가 140이 되어 이름 캡슐이 창 폭 444부터 첫째 줄이고 443 이하에서는 헤더 둘째 줄이다. Tab 순서에 대화 버튼과 대화 패널을 더한다: Back, Forward, Reload, 프레임 이름, 모드 토글, Export, 대화 버튼 → 프레임 콘텐츠 → 대화 패널(`prototype-responsive`가 적을 순서에 대화 버튼과 패널을 넣는다).
- **PRODUCT §5 'Text edit menu'**: "Inside the canvas iframe, the thumbnail window and the prototype window … there is no menu" → 프로토타입 창의 main frame(헤더와 패널)에는 메뉴가 있고, 그 프레임 콘텐츠에는 없다.
- **PRODUCT §5 item 2 'Conversation panel' 'Seen'**("only while its canvas page shows it in the unfolded panel and the window has focus")과 **item 0 'Notifications'**("Doan notifies only while its main window is not active"): 포커스된 프로토타입 창이 열린 패널에 보여 주는 대화를 더한다.
- **PRODUCT §3 Out of scope**: 해당하는 항목이 없다. 사람의 메시지만 턴을 시작하고, 칩과 Open은 이동일 뿐이라 Out of scope 4(자율 wake-up)에 걸리지 않는다. 스코프 게이트 통과.
- **ARCHITECTURE §3 'Prototype window' 'Sender role'**: "it may call only its own requests, and the main window's guard is not widened" → 재생 캔버스로 범위를 좁힌 대화 채널과 좁은 composer 채널을 더 부른다. `mainOnly`는 여전히 넓히지 않는다. 지키는 방법: 범위 검사(순수 함수 1, 3), 캔버스 iframe에는 preload가 없음, 별도 partition과 내비게이션 게이트는 그대로, 설정과 계정은 좁은 읽기와 Last used 하나만.
- **ARCHITECTURE §3 'Prototype window' 'Fit'과 'Timeout and kill'의 캡처**: 패널 폭, 640 최소폭, 패널을 연 채 Play, 캡처의 대화 열 제외.
- **ARCHITECTURE §7 'Agent conversation runtime and IPC' 'IPC contract'**: "Only the main window's main frame can invoke these channels … `conversation:event` and `conversation:stage` go only to the main window" → 프로토타입 창 main frame을 범위 붙은 두 번째 sender와 받는 쪽으로 적는다.
- **ARCHITECTURE §7 'Prototype window IPC' 'Two senders, no overlap'** → 대화 채널은 겹치고 main이 role마다 범위를 다르게 검사한다. 프로토타입 창에서 main 창으로 가는 `reveal`과 Last used를 적는다.
- **ARCHITECTURE §7 'Renderer primitives'**: hosts에 프로토타입 창을 더한다. **'App menu'의 텍스트 편집 메뉴 항목**: "registers one `context-menu` listener on the main window's `webContents` (not the thumbnail or prototype window)"를 고친다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령, Doan이 대화를 스스로 시작하지 않는다는 결정은 건드리지 않는다.

## PoC 의존

2026-11-14 격리 dev 앱에서 `node .scratch/prototype-conversation/probe.mjs`로 확인했다(exit 0, 스크린샷 `.scratch/prototype-conversation/shot-*.png`). 프로토타입 창 페이지에 임시 패치로 docked composer, thread, docked buddy를 가짜 호출 객체와 함께 콘텐츠 패널 옆 300 열에 띄웠다. 패치는 커밋하지 않았다. probe는 Playwright `_electron`으로 돌았고, 포커스 시험 전에 `app.focus({steal: true})`로 창을 실제 key 창으로 만들었다.

- **다시 로드되는 프레임이 composer 포커스를 가져가지 않기**(spec 결정 17): 정했다. 방법은 '포커스'의 포커스 되돌리기다.
  - 가드가 없으면 실패한다. `focus()`를 부르는 프레임은 Reload와 파일 변경 모두에서 composer 포커스를 가져갔고, 그 뒤 입력이 프레임의 input으로 들어갔다. `autofocus` 프레임도 iframe에 포커스를 가져갔다(매번은 아니다).
  - `inert`는 실패했다. 새 iframe에 `inert`가 걸린 채로도 프레임의 `focus()`가 포커스를 가져갔다. `allow="focus-without-user-activation 'none'"`도 실패했다.
  - 포커스 되돌리기는 통과했다. `autofocus`와 `focus()`(시작 때와 600 ms 뒤) 프레임을 Reload와 파일 변경으로 다시 로드한 네 경우 모두 포커스가 composer에 남았다. 조합 중이던 "한"은 `compositionend` 없이 이어져서 "abc 한글"로 확정됐다.
  - 기간 없는 되돌리기는 사람이 프레임 안 input을 누른 것까지 되돌렸다(실패). 위 기간을 둔 되돌리기에서는 그 클릭으로 포커스가 프레임 input에 갔다(통과).
  - Reload 규칙은 통과했다. 프레임 안에 포커스를 두고 Reload를 포인터로 누르면 ready 뒤 포커스가 새 iframe에 있다(가드 있을 때와 없을 때 모두). composer에 포커스를 두고 누르면 composer에 남는다.
  - 확인하지 못한 것: macOS의 실제 한국어 입력기다. CDP 조합은 renderer의 입력 처리로 바로 가고 `NSTextInputClient`를 거치지 않는다. 실제 입력기에서 포커스가 iframe으로 갔다가 돌아올 때 조합 중인 글자가 남는지는 `/runtime-test`(tasks 9)에서 본다.
- **창 폭을 640으로 넓히고 최소폭을 바꾸기**: 정했다. 호출 순서는 '패널 폭'에 있다.
  - `setMinimumSize(640, 0)`만 부르면 360·480 창이 넓어지지 않았다. `setContentBounds(640)`를 부르면 앞뒤 순서와 상관없이 640이 됐고, 페이지 `innerWidth`도 640이었다. 최소폭이 640인 동안 500을 요청하면 640으로 남았다.
  - 닫을 때 `setMinimumSize(360, 0)`을 부르면 폭은 640 그대로이고, 그 뒤 420으로 줄일 수 있었다.
  - 작업 영역 오른쪽 끝에 붙은 360·480 창을 같은 x로 640까지 넓히면 macOS는 창을 왼쪽으로 밀지 않고 작업 영역 밖으로 넘겼다(1440 작업 영역에서 오른쪽 끝 1720·1600). x를 `min(x, 작업 영역 오른쪽 − 640)`으로 옮기면 작업 영역 안에 들어왔다(`fitPrototypeWindow`의 `place`와 같은 규칙).
  - 이 창은 프레임 크기와 콘텐츠 크기가 같고(`hiddenInset`), 처음 최소 크기는 `[360, 0]`이다.
  - 작업 영역이 640보다 좁은 화면은 실제로 보지 못했다. 이 Mac에는 1440 폭 화면 하나뿐이다. 같은 꼴을 작업 영역보다 넓은 폭으로 시험했다. 폭과 최소폭을 작업 영역 + 160으로 주면 macOS가 창을 작업 영역보다 넓게 두었고, 둘 다 작업 영역 폭으로 자르면 안에 들어왔다. 그래서 '패널 폭'에 최소폭을 작업 영역 폭으로 자르는 규칙을 더했다.
- **대화 renderer를 프로토타입 창에서 돌리기**: 통과했다. `doan-prototype` partition과 그 CSP에서 다음이 동작했다.
  - Radix popover: 모델, Effort, 프리셋, 권한 picker가 열리고 Esc로 닫혔고, 포커스가 trigger로 돌아왔다. 권한을 고르면 host 콜백에 닿았다.
  - chip field: 한국어 `insertText`와 확정된 조합("안녕 프로")이 들어가고 Enter로 보내졌다. `/` 프리셋 목록이 열렸다.
  - docked buddy: WebGL로 그려졌다. GPU 프로세스를 죽이면 still 이미지로 갔다가 다시 WebGL로 돌아오고, poke에 움직였다(POSTMORTEM 2026-11-12). 단, `dockedBuddyShell.ts`가 부르는 `window.doan.onWindowVisible`은 PoC가 `window.doanPrototype.onWindowVisible`로 이어 줬다. 주입 리팩터(tasks 5)가 이것을 호출 객체로 바꿔야 한다.
  - `context-menu`: probe가 프로토타입 창 `webContents`에 붙인 리스너가 composer 우클릭을 main frame(`frame.parent === null`, editable)으로 받아 메뉴를 띄웠다. 프레임 콘텐츠 우클릭은 child frame으로 와서 메뉴를 띄우지 않았다.
  - Attach: 프로토타입 창을 부모로 둔 `dialog.showOpenDialog`가 그 창의 시트로 열렸다(`sheet-begin`).
  - CSP 경고: 콘솔 오류는 DESIGN.md 'Known console warning'의 Radix scroll-lock 스타일 경고(같은 해시)뿐이다. 그 코드는 main 창과 같은 `DockedComposer` chunk에 있다. 이 페이지의 CSP(`default-src 'self'`)는 `<style>` 요소를 막으므로, 패널의 스타일은 `styles.css`나 inline style 속성으로 둔다.
- 이미 확인된 것: 먼저 도착한 답이 이긴다. main의 `answerQuestion`과 `answerPermission`은 이미 해결된 요청에 `stale`을 돌려준다(`service.ts`의 answer 경로, `runners.test.ts`). renderer는 질문에서 `stale`에 실패를 보이지 않지만, 권한 카드(`answerReached`)는 지금 실패 문구를 보인다. 이것은 renderer 수정으로 다룬다(바뀌는 파일 `ConversationThread.tsx`).

## POSTMORTEM에서 가져온 함정

- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: renderer가 main 모듈을 값으로 import하면 ajv가 CSP에 막혀 창이 빈다. 프로토타입 창에 대화 본체를 들이면 `prototype.html` entry의 import 사슬이 크게 는다. `rendererImports.test.ts`가 두 entry를 모두 걷는지 유지하고, 새 순수 함수(`conversationScope.ts`)는 Electron·ajv 없이 둔다. 통합 뒤 빌드된 앱으로 프로토타입 창을 한 번 띄운다.
- **2026-10-26 'The invalidation read overtook the reply to the person's own Reopen' (Recurrence)**: Electron 45에서 `ipcMain.handle` 응답과 main이 먼저 보낸 `webContents.send`의 순서가 보장되지 않는다. 두 창이 같은 요청에 답할 때 "내 답의 응답"과 "다른 창 답의 `permission.resolved`/`question.resolved` 이벤트" 중 어느 것이 먼저 와도 카드 상태가 이벤트 데이터로 정해지게 한다.
- **2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop'**: 같은 canvas id나 path를 가진 두 worktree 사이에서 대화가 섞였다. target 전환과 범위 검사는 root까지 비교하고, 두 worktree 전환, id 없는 캔버스(path 키), 읽기 오류 행을 테스트한다.
- **2026-11-06 'A pick of anything else fixed the composer's resolved model and effort in Settings'와 'Home remembered its choice on every mount'**: Last used를 main renderer로 넘길 때, 손대지 않은 마운트가 아무것도 기억하지 않는지와 Settings의 네 모양에서 다른 것을 골라도 고정값이 바뀌지 않는지를 프로토타입 composer에도 테스트한다.
- **ARCHITECTURE §7 'Events'의 구독 순서 규칙**: "Consumers subscribe before reading, then merge snapshot and buffered events by seq". 프로토타입 store도 구독을 먼저 걸고 읽는다. target이 바뀌어 다른 캔버스 대화로 갈아탈 때도 같은 순서다.
- **Renderer deletion 순서(ARCHITECTURE §7 'IPC contract', POSTMORTEM 2026-10-26 ordering)**: main 창이 대화를 지우면 프로토타입 창의 store도 그 대화의 thread·초안을 버려야 한다. 지운 대화의 초안이 새 대화 초안으로 옮겨 가지 않도록, `listChanged`로 다시 읽은 목록에서 사라진 대화는 store의 `deleted()` 경로로 정리한다. 초안 옮기기(순수 함수 11)는 삭제된 대화에서 일어나지 않는다.
- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: 헤더의 대화 버튼은 같은 버튼 하나가 라벨, `aria-expanded`, 배지만 바꾸게 한다. 상태가 바뀔 때 다른 컴포넌트로 바뀌어 포커스가 `body`로 떨어지지 않게 한다. 패널을 닫으며 포커스를 버튼으로 돌릴 때도 같다.
- **2026-11-02 'The canvas conversation panel's head was 8px shorter than the canvas header'**: 머리를 빼면 thread의 위쪽 여백과 스크롤 클립 기준이 바뀐다. 초안에서 머리 없는 패널의 위쪽 여백을 따로 정하고 `/design-sync`에서 잰다.
- **2026-11-12 'The docked buddy stood still for good after its WebGL context was lost'**: 프로토타입 창은 세 번째 WebGL 컨텍스트를 만든다(main 창 패널과 Overview의 buddy에 더해). 컨텍스트를 잃었을 때의 복구 경로가 이 창에서도 도는지 PoC와 `/runtime-test`에서 본다.

## 디자인 프리셋

`doan design-skill --json`으로 목록을 보고 `clarify`, `adapt`, `harden`을 읽었다.

- clarify: 버튼 이름은 기존 용어("Show conversation", "Hide conversation")를 그대로 쓴다. 작업 중 배지의 접근 이름은 "Show conversation, agent is working"이다. 고정 칩의 보조 문구는 "이 칩이 메시지에 함께 간다"는 사람의 숨은 질문에 답하는 한 문장으로 하고, 결과를 약속하는 말은 넣지 않는다. 막힌 reveal 토스트 "Couldn’t show <name>."은 이유를 함께 말한다. 최종 문구는 `/design-draft`에서 정한다.
- adapt: 좁은 창을 늘리는 대신 구조를 바꾼다는 원칙은 사용자 결정(패널이 프레임 열의 폭을 가져가고, 창이 좁으면 640으로 넓힌다)과 맞는다. 패널 열림·닫힘 상태와 640 경계를 초안 프레임으로 그린다.
- harden: 목록 loading·error, 캔버스 사라짐·ID 겹침, 프레임 lost, 로드 실패, 32개 한도, 두 창 동시 답, 작업 영역이 640보다 좁은 화면, main 창이 막힌 reveal을 상태로 그린다.
