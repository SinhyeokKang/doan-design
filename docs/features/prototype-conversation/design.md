# prototype-conversation — design

동작은 spec.md에 있고 모두 사용자가 정했다. 이 문서는 구현 방법이다. 남은 미확인은 'PoC 의존'뿐이다.

## 영향 범위

- **앱(Electron + TS)만 바뀐다.** CLI(Go), 스킬, guide, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지는 바뀌지 않는다.
- 대화 런타임(`app/src/main/conversation/`)의 서비스, 저장소, 이벤트 JSONL v1, `drafts.json`, 프롬프트는 바뀌지 않는다. 바뀌는 것은 누가 그 IPC를 부를 수 있는지, 이벤트를 어느 창에 보내는지, renderer에서 패널을 세 번째 host로 띄우는 일, 그리고 프로토타입 창 thread의 칩이 main 창을 옮기는 길이다.

### 구조

- **main**: 프로토타입 창의 main frame(sender role `prototype`)에 대화 채널과 composer가 쓰는 채널 일부를 연다. 대화 요청은 모두 "지금 재생 중인 target의 캔버스에 묶인 대화"로 범위를 좁혀 main이 검사한다. 대화 이벤트, stage, 목록 변경 알림은 그 캔버스의 대화 것만 프로토타입 창에도 보낸다.
- **preload**: `app/src/preload/prototype.ts`에 대화 API를 더한다. 채널 이름은 지금처럼 글자 그대로 쓰고 테스트가 `ipc.ts`와 맞춰 고정한다(ARCHITECTURE §7 'Prototype window IPC' 'Preloads stay separate': 공유 값은 sandbox preload가 require할 수 없는 chunk가 된다).
- **renderer**: 프로토타입 창이 자기 `ConversationStore`를 하나 가진다. main 창의 store와 따로이므로 초안(`drafts` by `draftKey`), 질문 선택 중 상태, 첨부 칩이 창마다 갈린다. 패널 본체는 `CanvasConversationPanel`의 thread + docked composer + 새 대화 상태(제안 프롬프트, 터미널 세션 선택)를 그대로 쓰되, 지금 본체가 `window.doan`을 직접 부르는 곳을 주입된 호출 객체로 바꾼다. ARCHITECTURE §7 'Renderer primitives'는 "only their hosts … call preload"라고 하므로, 프로토타입 창은 Overview와 canvas 패널에 이은 세 번째 host가 된다.

### 바뀌는 파일

| 파일 | 내용 |
|---|---|
| `app/src/main/senderAllowed.ts` | `prototype` role에 아래 '프로토타입 role이 부르는 채널'을 더한다. `mainOnly`는 넓히지 않는다 |
| `app/src/main/index.ts` | `conversation:*` 핸들러가 `fromWindow(event)` 대신 `senderKind(event)`를 받아, `prototype`이면 범위 검사(`prototypeConversationScope`)를 거친다. `conversation:event`·`stage`·`listChanged`·`handoff`, `work:changed`, 에이전트 연결 변경을 범위 필터(`prototypeReceives`)를 거쳐 프로토타입 창에도 보낸다. 알림 visibility에 프로토타입 창의 포커스와 보여 주는 대화를 넣는다. 칩 이동 요청을 받으면 main 창을 보이게 하고 앞으로 가져와 main renderer에 이동을 보낸다 |
| `app/src/main/conversation/ipc.ts` | `conversationHandler`가 sender를 boolean이 아닌 role + 범위로 받는다. 검증 자체(shape, limits)는 그대로다 |
| `app/src/main/prototype/conversationScope.ts` (새 파일, Electron 없음) | 순수 함수 1, 2, 3 |
| `app/src/main/prototype/ipc.ts` | `PrototypeView`에 대화 대상(`root`, `canvas: {path, id?}`)과 패널 상태(열림, 폭)를 더한다. 패널 열림·폭 요청(`prototype:panel`), 보여 주는 대화 보고(`prototype:showing`), 칩 이동 요청(`prototype:reveal`) 채널을 더한다. `PrototypeWindowApi`에 대화 호출을 더한다 |
| `app/src/main/prototype/fit.ts` | 순수 함수 6, 7, 8 |
| `app/src/main/prototype/windowState.ts`, `controller.ts` | 패널 열림·폭을 state에 둔다. 창을 닫아도(`CLOSED`) 남고 앱 종료로만 사라진다. Play의 맞춤과 최소폭에 반영한다 |
| `app/src/main/prototypeWindow.ts` | 패널을 열 때 창 폭을 넓히고(`setBounds`), 최소폭을 `setMinimumSize`로 360/640 사이에서 바꾼다. main 창과 같은 `context-menu` 리스너를 붙여 `editMenu.ts`로 텍스트 편집 메뉴를 연다(main frame만: `editMenuInput`의 `isTopFrame`이 캔버스 iframe을 뺀다). 첫 화면부터 buddy의 accent를 쓰도록 main 창처럼 URL query에 buddy를 넣는다 |
| `app/src/main/notifications.ts` | `notificationFor`가 "포커스된 프로토타입 창이 열린 패널에 이 대화를 보여 준다"를 알면 알림을 만들지 않는다(순수 함수 10) |
| `app/src/main/menuState.ts` | 바뀌지 않는다. Edit와 Undo/Redo는 이미 포커스된 창에 작동하고, New Conversation·Pick from Canvas는 프로토타입 창 포커스 중 계속 꺼져 있다 |
| `app/src/preload/prototype.ts` (+ test) | 대화 호출과 이벤트 구독, 패널·보고·칩 이동 요청. 채널 이름 고정 테스트 |
| `app/src/preload/index.ts` | main 창이 칩 이동 요청을 받는 이벤트 구독 하나를 더한다 |
| `app/src/renderer/conversationStore.ts` | `window.doan`을 직접 부르는 곳(`readConversation`, `takeConversationDraft`, `sendQueuedNow`, 첨부 해제·재확인)을 생성자로 받은 호출 객체로 바꾼다 |
| `app/src/renderer/CanvasConversationPanel.tsx`, `canvasRun.ts`(`conversationResumeTarget`), `dockedSupport.ts`, `useProjectSkills.ts` | 같은 주입. 본체가 main 창 전용 부분 없이도 그려지도록 "머리 없는 본체"를 꺼낸다(아래 '패널 본체 나누기') |
| `app/src/renderer/App.tsx` | main 창이 프로토타입 창의 칩 이동 요청을 받아, 지금의 sent chip locate와 답 칩 경로(`replyChipTarget.ts`, deep link 열기)로 처리한다 |
| `app/src/renderer/prototype/PrototypeWindow.tsx`, `WindowShell` | 헤더 오른쪽 끝의 대화 버튼(Export 다음), 콘텐츠 패널 옆 대화 열, 리사이즈 손잡이, 토스트 자리, buddy accent 적용 |
| `app/src/renderer/prototype/conversation.ts` (새 파일) | 순수 함수 4, 5, 9 |
| `app/src/renderer/prototype/PrototypeConversation.tsx` (새 파일) | 프로토타입 창의 대화 host: store, 구독(구독 먼저, 그다음 읽기), 재생 프레임 칩, 본체, docked buddy, 칩 클릭을 `prototype:reveal`로 보내기 |
| `app/src/renderer/rendererImports.test.ts` | 이미 `prototype.html`을 entry로 걷는다. 새 import 사슬이 ajv·Node 모듈에 닿지 않는지 그대로 확인한다 |
| `.doan/canvases/prototype-conversation.html` | `/design-draft`가 새로 그리는 초안. 기존 `frame-prototype.html`, `doan-canvas-conversation.html`은 고치지 않는다 |

### 프로토타입 role이 부르는 채널

- 대화: `read`, `list`, `forCanvas`, `resumeTarget`, `start`(그 캔버스의 `new`와 그 캔버스 터미널 세션의 `resume`만: `newDesign` 거절), `send`, `queue`, `removeQueued`, `sendQueuedNow`, `takeDraft`, `interrupt`, `answerPermission`, `answerQuestion`, `markSeen`, `models`, `skills`, `setPermissionMode`. `delete`는 열지 않는다.
- composer와 새 대화 상태가 쓰는 나머지: 프리셋 읽기(`design-skills:list`, `design-skills:get`), 에이전트 연결 상태 읽기와 그 변경 이벤트(모델 picker의 provider readiness), 터미널 작업 목록(`work:get`과 `work:changed`: 터미널 세션 선택이 아직 일하는 세션을 막는다), New conversations 기본값과 buddy 읽기, Last used 기억. Last used는 `preferences:write` 전체를 열지 않고, composer의 선택(`ComposerChoice`) 하나만 받는 좁은 채널로 main이 적용한다. PRODUCT §5 item 0 'New conversations'가 "picked or sent on this device in any composer"라고 하므로 프로토타입 composer도 기억한다. 설정 읽기도 `preferences:read` 전체가 아니라 필요한 값(기본값, Last used, buddy)만 돌려주는 읽기로 둔다.
- 첨부: `attachments:choose`, `add-paths`, `add-pasted`, `remove`, `recheck`, `release`, `fromPaths`. `attachments:capture`는 열지 않는다.
- 링크: 에이전트 답의 `https:` 링크를 여는 `shell:openLink`.
- 자기 채널: `prototype:panel`, `prototype:showing`, `prototype:reveal`.

### 범위 검사

- 프로토타입 창의 target은 (root, canvas key, frame)이다(ARCHITECTURE §3 'Target and run'). 대화 요청이 허용되는 것은 그 요청의 대화가 같은 root에 있고, 대화의 캔버스가 target 캔버스와 같은 행으로 맞을 때뿐이다. 판정은 main 쪽 `resolveListedCanvas`와 같은 규칙(정확히 하나의 목록 행)을 쓴다. 목록을 읽는 중이거나 target이 lost면 거절한다(추측하지 않는다).
- target이 바뀌는 순간(다른 캔버스의 Play, Back/Forward)과 늦게 도착한 요청 사이의 경합은 main이 요청 시점의 target으로 판정해서 끊는다. 프로토타입 창의 store는 view의 target이 바뀌면 그 캔버스의 대화로 갈아탄다.
- 이것으로 지키는 것: 캔버스 iframe에는 여전히 preload가 없고(§3 'Sender role'), 프로토타입 창 main frame이 무엇을 하든 재생 중인 캔버스의 대화 밖으로는 못 나간다. 프로젝트 대화, 다른 캔버스의 대화, 대화 삭제, 설정 쓰기(Last used 하나 빼고)는 닿지 않는다.

### 패널 본체 나누기

- `CanvasConversationPanel`은 지금 `CanvasRun`(어떤 대화를 보일지, 터미널 세션 선택, 승격 알림), `CanvasTarget`, 프레임 이름, locate, pick, work 목록을 받는다. 프로토타입 host에는 Pick, Capture area, 제목 메뉴, New conversation 버튼만 빠진다.
- 그래서 thread + composer + 새 대화 상태(제안 프롬프트, 터미널 세션 선택) + 전송 경로를 `ConversationCalls`(preload 부분집합 타입)를 받는 본체로 꺼내고, main 창 패널은 그 위에 머리(제목 메뉴, New conversation, Hide)를 얹는다. 어떤 대화를 보일지는 main 창에서는 `CanvasRun`이, 프로토타입 창에서는 순수 함수 4가 정한다.
- 같은 이유로 `ConversationStore`와 `DockedSupport`도 `ConversationCalls`를 생성자로 받는다. main 창은 `window.doan`을, 프로토타입 창은 `window.doanPrototype`의 대화 부분을 넘긴다.
- 본체의 locate 콜백은 host가 정한다. main 창 패널은 지금처럼 보드에서 locate하고, 프로토타입 host는 `prototype:reveal`을 보낸다.

### 재생 프레임 칩과 앵커

- 고정 칩은 composer 필드 밖, composer 위에 그린다. 필드의 segment가 아니므로 지우거나 잘라 낼 수 없고 Undo 대상도 아니다.
- 보낼 때 `withPlayingFrame`(순수 함수 5)이 요청의 맨 앞에 `{{1}} `을 넣고, 나머지 marker 번호를 하나씩 민다. 앵커는 `{frame: {id, title}}` 하나로, `validAnchor`와 `anchorTokens` 규칙(marker가 앵커를 정확히 덮는다)을 그대로 지킨다. 그래서 앵커 형식, 프롬프트 직렬화(`turnPrompt`), 이벤트 형식이 바뀌지 않는다.
- 같은 프레임 칩을 사람이 필드에 붙여 넣었어도 한도 계산은 "반복된 장소는 한 번"(PRODUCT §5 item 6) 규칙을 따른다. 재생 프레임까지 세어 32개를 넘으면 보내지 않고 기존 한도 문구로 거절한다.
- 대화 제목과 미리보기는 `messageLine`으로 칩 이름을 읽으므로 프레임 이름으로 시작한다. 사용자가 받아들인 결과다.
- 터미널 세션 이어 가기(resume)와 legacy external 대화로 보낼 때도 앵커를 싣는다. 이 경로는 첨부와 모델을 받지 않지만 앵커는 받는다(`ipc.ts`의 `message`).

### thread 칩 → main 창

- 프로토타입 host는 칩을 누르면 `prototype:reveal`로 `{conversationId, anchor}`(사람 칩) 또는 `{conversationId, link}`(답 칩의 `ReplyAnchor`)를 보낸다.
- main은 순수 함수 3으로 검사한다: 대화가 범위 안인지, 앵커·링크 모양이 맞는지(`validAnchor`, `parseReplyAnchor`). 사람 칩의 캔버스는 그 대화의 캔버스다. 통과하면 main 창을 보이게 하고 앞으로 가져온 뒤(알림 클릭의 `showFromNotification`과 같은 보이기 경로), main renderer에 `{root, canvas, anchor | link}`를 보낸다.
- main renderer(App)는 그 요청을 기존 경로로 처리한다: 보여 주는 캔버스면 sent chip locate, 아니면 답 칩처럼 deep link로 열고 대상으로 옮긴다. 대상을 못 찾으면 기존 문구("No longer in the canvas", 캔버스를 찾지 못한 토스트)가 main 창에 보인다. 첫 실행이나 페이지 잠금 중의 처리도 deep link 규칙과 같다.
- 프로토타입 창 쪽 칩은 locate 결과를 기다리지 않는다. 버튼으로서 눌렸다는 것만 끝내고, 결과는 main 창이 보인다.

### 패널 폭

- 창 레이아웃: 헤더 아래에 [콘텐츠 패널(프레임)] [손잡이] [대화 열]. 대화 열은 main 창의 `doan-conv-column`·`ov-right` 모양을 그대로 쓰고 머리만 뺀다.
- 패널을 열 때 창 폭이 640보다 좁으면 창을 640으로 넓히고 패널을 280으로 연다. 640 이상이면 창은 그대로이고 패널은 기본폭(`max(320px, 28dvw)`)을 최대폭으로 자른 값으로 연다. 작업 영역이 640보다 좁으면 작업 영역 폭까지만 넓히고 패널은 280으로 연다(프레임이 360보다 좁아진다).
- 열려 있는 동안 창 최소폭은 640(`PROTOTYPE_WINDOW_MIN_WIDTH` 360 + 패널 최소 280)이고, 닫히면 360으로 돌아간다. 닫을 때 창 크기는 바꾸지 않는다. 패널 최대폭은 창 폭에서 프레임 쪽 360을 남기는 폭이다(창 폭 기준. 콘텐츠 패널의 8 px 여백을 어디서 빼는지는 `/design-draft`와 `/design-sync`에서 숫자로 고정한다).
- 패널이 열린 채 새 Play가 창을 맞출 때는 마크 + chrome + 패널 폭으로 맞추고, 최소폭 640과 작업 영역 안을 지킨다.
- 프레임 iframe은 지금처럼 콘텐츠 패널 폭을 따르므로(`prototypeIframeBox`) 패널이 폭을 가져가면 `innerWidth`와 미디어 쿼리가 따라 바뀐다. 마크가 344보다 좁은 프레임은 지금처럼 자기 폭을 지키고 가운데에 놓인다.
- 창 크기는 main이 바꾼다(창 `setBounds`, `setMinimumSize`). renderer는 열림과 폭을 `prototype:panel`로 요청하고, main이 순수 함수 6·7·8의 결과로 창을 맞추고 view로 패널 상태를 돌려준다. 창이 커지는 것은 run을 새로 시작하지 않는다(사람이 창을 키울 때와 같다).

### seen, 알림, 돌아온 초안

- 프로토타입 창은 포커스와 패널 열림, 보여 주는 대화가 바뀔 때마다 `prototype:showing {conversationId | null}`을 보낸다. main은 창 포커스를 이미 알고(`focusChanged`), 두 값을 알림 visibility에 넣는다.
- seen 기록은 main 창과 같은 방식이다: 그 조건(포커스, 열린 패널, 그 대화)일 때 프로토타입 host가 `markSeen`을 부른다.
- 돌아온 초안: 두 store 모두 대화를 보여 줄 때 `takeDraft`를 부르고, main이 한 번만 내주므로 먼저 보여 준 창이 가져간다(지금의 `ConversationStore.takeDraft` 경로 그대로).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `prototypeConversationScope(method, payload, target, conversations, entries)` (`main/prototype/conversationScope.ts`) — 프로토타입 role의 대화 요청이 허용되는지. 허용 메서드 목록, 대화의 root와 캔버스가 target과 같은 행으로 맞는지, `start`는 target 캔버스의 `new`와 그 캔버스 association의 `resume`만, `newDesign`·`delete` 거절, target이 loading·lost이면 거절.
2. `prototypeReceives(message, target, conversations)` (같은 파일) — `conversation:event`, `stage`, `listChanged`, `handoff`, `work:changed`를 프로토타입 창에 보낼지. 이벤트·stage·handoff는 대화의 캔버스로, `listChanged`는 root로 판정한다. target이 없으면 보내지 않는다.
3. `prototypeRevealRequest(payload, target, conversations)` (같은 파일) — 칩 이동 요청 검사와 main renderer에 보낼 `{root, canvas, anchor | link}` 만들기. 범위 밖 대화, 모양이 틀린 앵커·링크, 사람 칩의 캔버스 결정.
4. `prototypeShownConversation(list, target)` (`renderer/prototype/conversation.ts`) — 그 캔버스의 현재 대화 id 또는 새 대화 상태. 목록 loading·error, ID 겹침(막힘 사유), 캔버스가 목록에서 사라짐을 구분한다. 캔버스 맞춤은 `canvasConversationRows.ts`의 `sameCanvas` 규칙을 그대로 쓴다.
5. `withPlayingFrame(request, frame)` (같은 파일) — 맨 앞 `{{1}}`, marker 밀기, 32개 한도 판정. 결과는 보낼 요청 또는 거절 사유.
6. `prototypePanelBounds(windowWidth)` (`main/prototype/fit.ts`) — 패널 최소 280, 최대(프레임 쪽 360을 남기는 폭), 기본(`max(320, 28% of window)`을 최대로 자름).
7. `openPanelResize(window, workArea)` (같은 파일) — 패널을 열 때의 창 bounds와 패널 폭. 640보다 좁으면 640·280, 640 이상이면 그대로·기본폭, 작업 영역이 640보다 좁으면 작업 영역 폭·280. 창은 작업 영역 안으로 옮긴다.
8. `fitPrototypeWindow` 확장 — 패널이 열려 있으면 마크 + chrome + 패널 폭, 최소폭 640.
9. `playingFrameChip(view)` (`renderer/prototype/conversation.ts`) — 고정 칩의 이름(제목 또는 id), 상태별 표시(loading 중엔 다음 프레임, lost엔 마지막 id와 제목), 접근 이름.
10. `notificationFor` 확장 (`main/notifications.ts`) — 포커스된 프로토타입 창이 열린 패널에 그 대화를 보여 주면 알림을 만들지 않는다. 다른 대화는 지금과 같다.

## 포맷 변경

- 없다. 공유 JSON Schema(ARCHITECTURE §11), format 버전 `v`, 이벤트 JSONL v1, `index.json` v2, `drafts.json`, app socket, CLI 출력이 그대로다. 앵커는 기존 프레임 앵커다.
- 앱 내부 IPC 채널만 는다(프로토타입 preload의 대화 API, `prototype:panel`, `prototype:showing`, `prototype:reveal`, main 창의 칩 이동 이벤트, 좁은 설정 읽기와 Last used 기억). 공유 스키마가 아니므로 fixture는 없다.
- 패널 열림과 폭은 main 메모리에만 있으므로 userData 파일이 생기지 않는다.

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. 캔버스 저자(에이전트)가 할 일이 없다.
- 프롬프트, guide, CLI 출력이 바뀌지 않으므로 `/agent-eval`이 필요 없다.

## 결정 영향

다음 결정 문장을 바꾼다. 사용자가 이 라운드에서 승인했고, 마지막 승격 task에서 고친다.

- **PRODUCT §3 In scope 마지막 문단**: buddy가 서는 곳("on Home, on the docked composer of the Overview and the canvas conversation panel and in the canvas working notice")에 프로토타입 창의 대화 패널을 더한다.
- **PRODUCT §5 item 2 'Prototype window'**
  - "Nothing in the window reaches the main window's selection, `doan active`, drafts, attachments or settings"를 새 경계로 다시 쓴다. 대화는 두 창이 함께 쓰고, 초안·첨부 칩은 창마다 따로이며, Last used 기억이 설정 쪽 예외다. thread 칩 클릭이 main 창을 앞으로 가져와 옮긴다.
  - 'Independence'의 "only a new play … changes its frame"은 그대로 둔다. 거기에 "프로토타입 창이 main 창을 바꾸는 길은 thread 칩 클릭 하나"를 더한다.
- **PRODUCT §5 'Text edit menu'**: "Inside the canvas iframe, the thumbnail window and the prototype window … there is no menu" → 프로토타입 창의 main frame(헤더와 패널)에는 메뉴가 있고, 그 프레임 콘텐츠에는 없다.
- **PRODUCT §5 item 2 'Conversation panel' 'Seen'**("only while its canvas page shows it in the unfolded panel and the window has focus")과 **item 0 'Notifications'**("Doan notifies only while its main window is not active"): 포커스된 프로토타입 창이 열린 패널에 보여 주는 대화를 더한다.
- **PRODUCT §3 Out of scope**: 해당하는 항목이 없다. 사람의 메시지만 턴을 시작하고, 칩 클릭은 이동일 뿐이라 Out of scope 4(자율 wake-up)에 걸리지 않는다. 스코프 게이트 통과.
- **ARCHITECTURE §3 'Prototype window' 'Sender role'**: "it may call only its own requests, and the main window's guard is not widened" → 재생 캔버스로 범위를 좁힌 대화 채널과 composer 채널을 더 부른다. `mainOnly`는 여전히 넓히지 않는다. 지키는 방법: 범위 검사(순수 함수 1, 3), 캔버스 iframe에는 preload가 없음, 별도 partition과 내비게이션 게이트는 그대로, 설정은 좁은 읽기와 Last used 하나만.
- **ARCHITECTURE §3 'Prototype window' 'Fit'**: 패널 폭과 640 최소폭.
- **ARCHITECTURE §7 'Agent conversation runtime and IPC' 'IPC contract'**: "Only the main window's main frame can invoke these channels … `conversation:event` and `conversation:stage` go only to the main window" → 프로토타입 창 main frame을 범위 붙은 두 번째 sender와 받는 쪽으로 적는다.
- **ARCHITECTURE §7 'Prototype window IPC' 'Two senders, no overlap'** → 대화 채널은 겹치고 main이 role마다 범위를 다르게 검사한다. 프로토타입 창에서 main 창으로 가는 칩 이동 요청을 적는다.
- **ARCHITECTURE §7 'Renderer primitives'**: hosts에 프로토타입 창을 더한다. **'App menu'의 텍스트 편집 메뉴 항목**: "registers one `context-menu` listener on the main window's `webContents` (not the thumbnail or prototype window)"를 고친다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령, Doan이 대화를 스스로 시작하지 않는다는 결정은 건드리지 않는다.

## PoC 의존

- **창 폭을 640으로 넓히고 최소폭을 바꾸기**: Electron `setMinimumSize`를 현재 폭보다 크게 줄 때 macOS가 창을 저절로 넓히는지, 아니면 `setBounds`를 먼저 불러야 하는지 확인하지 않았다. 작업 영역 오른쪽 끝에 붙은 창이 넓어질 때 왼쪽으로 밀리는지도 마찬가지다. 기존 `fitPrototypeWindow`의 "작업 영역 안에 머물도록 옮긴다" 규칙을 쓸 예정이다.
- **대화 renderer를 프로토타입 창에서 돌리기**: 프로토타입 창은 메모리 전용 partition(`doan-prototype`)에서 같은 CSP로 `prototype.html`을 띄운다. docked composer의 Radix popover(모델·프리셋·권한 picker), chip field 입력과 IME, 토스트, docked buddy(WebGL), 텍스트 편집 메뉴가 그 창에서 그대로 동작하는지 아직 띄워 본 적이 없다.
- 둘 다 tasks의 첫 task로 `.scratch/` probe를 둔다. 실패하면 설계를 다시 본다.
- 이미 확인된 것(재사용): 먼저 도착한 답이 이긴다. `answerQuestion`은 이미 해결된 요청에 `stale`을 돌려주고, renderer는 `stale`에 실패를 보이지 않으며 `question.resolved`가 카드를 접는다(ARCHITECTURE §7 'IPC contract'). `answerPermission`도 같은지는 `/tdd`에서 테스트로 고정한다.

## POSTMORTEM에서 가져온 함정

- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: renderer가 main 모듈을 값으로 import하면 ajv가 CSP에 막혀 창이 빈다. 프로토타입 창에 대화 본체를 들이면 `prototype.html` entry의 import 사슬이 크게 는다. `rendererImports.test.ts`가 두 entry를 모두 걷는지 유지하고, 새 순수 함수(`conversationScope.ts`)는 Electron·ajv 없이 둔다. 통합 뒤 빌드된 앱으로 프로토타입 창을 한 번 띄운다.
- **2026-10-26 'The invalidation read overtook the reply to the person's own Reopen' (Recurrence)**: Electron 45에서 `ipcMain.handle` 응답과 main이 먼저 보낸 `webContents.send`의 순서가 보장되지 않는다. 두 창이 같은 요청에 답할 때 "내 답의 응답"과 "다른 창 답의 `permission.resolved`/`question.resolved` 이벤트" 중 어느 것이 먼저 와도 카드 상태가 이벤트 데이터로 정해지게 한다.
- **ARCHITECTURE §7 'Events'의 구독 순서 규칙**: "Consumers subscribe before reading, then merge snapshot and buffered events by seq". 프로토타입 store도 구독을 먼저 걸고 읽는다. target이 바뀌어 다른 캔버스 대화로 갈아탈 때도 같은 순서다.
- **Renderer deletion 순서(ARCHITECTURE §7 'IPC contract', POSTMORTEM 2026-10-26 ordering)**: main 창이 대화를 지우면 프로토타입 창의 store도 그 대화의 thread·초안을 버려야 한다. 지운 대화의 초안이 새 대화 초안으로 옮겨 가지 않도록, `listChanged`로 다시 읽은 목록에서 사라진 대화는 store의 `deleted()` 경로로 정리한다.
- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: 헤더의 Show/Hide conversation은 같은 버튼 하나가 라벨과 `aria-expanded`만 바꾸게 한다. 배지가 붙고 떨어질 때나 상태가 바뀔 때 다른 컴포넌트로 바뀌어 포커스가 `body`로 떨어지지 않게 한다. 패널을 닫으며 포커스를 버튼으로 돌릴 때도 같다.
- **2026-11-02 'The canvas conversation panel's head was 8px shorter than the canvas header'**: 머리를 빼면 thread의 위쪽 여백과 스크롤 클립 기준이 바뀐다. 초안에서 머리 없는 패널의 위쪽 여백을 따로 정하고 `/design-sync`에서 잰다.
- **2026-11-12 'The docked buddy stood still for good after its WebGL context was lost'**: 프로토타입 창은 세 번째 WebGL 컨텍스트를 만든다(main 창 패널과 Overview의 buddy에 더해). 컨텍스트를 잃었을 때의 복구 경로가 이 창에서도 도는지 PoC와 `/runtime-test`에서 본다.

## 디자인 프리셋

`doan design-skill --json`으로 목록을 보고 `clarify`, `adapt`, `harden`을 읽었다.

- clarify: 버튼 이름은 기존 용어("Show conversation", "Hide conversation")를 그대로 쓴다. 고정 칩의 보조 문구는 "이 칩이 메시지에 함께 간다"는 사람의 숨은 질문에 답하는 한 문장으로 하고, 결과를 약속하는 말은 넣지 않는다. 최종 문구는 `/design-draft`에서 정한다.
- adapt: 좁은 창을 늘리는 대신 구조를 바꾼다는 원칙은 사용자 결정(패널이 프레임 폭을 가져가고, 창이 좁으면 640으로 넓힌다)과 맞는다. 패널 열림·닫힘 상태와 640 경계를 초안 프레임으로 그린다.
- harden: 목록 loading·error, 캔버스 사라짐·ID 겹침, 프레임 lost, 로드 실패, 32개 한도, 두 창 동시 답, 작업 영역이 640보다 좁은 화면을 상태로 그린다.
