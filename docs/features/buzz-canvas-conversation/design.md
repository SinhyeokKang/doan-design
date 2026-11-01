# buzz-canvas-conversation — design

## 0. 초안

`/design-draft`가 새 파일 `.doan/canvases/buzz-canvas-conversation.html`을 그린다. 초안은 2026-11-01 user가 확정했다. 셸·캔버스 헤더·보드·도구모음은 `buzz-canvas.html`(확정), 스레드·docked 입력창은 `buzz-conversation.html`·`buzz-project.html`(출하)에서 가져온다. 대화 드롭다운은 `buzz-canvas.html`의 `conversation-menu` 참고 프레임을 그대로 쓴다.

| 프레임 | 내용 |
|---|---|
| `panel-thread` | 현재 대화가 있는 캔버스: 헤더 드롭다운(대화 제목), 스레드(칩이 든 사람 메시지), docked 입력창(Pick from canvas 포함), 도구모음 Add to conversation(비활성) |
| `panel-new` | 대화가 없는 캔버스의 새 대화: Overview 새 대화 패턴(빈 본문, 입력창 바로 위 추천 칩 — Home·Overview와 같은 quiet `suggestion` 버튼과 간격, 공급자 선택기와 Settings 기본값, placeholder "Ask, / for presets"; 기본 패널 폭에서 잘리지 않게 Overview 답장 "Reply, / for presets"와 같은 길이로 줄였다) |
| `panel-new-replace` | 대화가 있던 캔버스에서 메뉴의 New conversation: 같은 새 대화 상태, 더하는 것 없음(Overview 패턴). 첫 전송이 새 대화를 현재로 만들고 이전 대화는 메뉴의 이전 대화로 간다 |
| `panel-resume` | 세션 연결이 있는 캔버스: "Continue the <Provider> session from your terminal"(기본, 선택지에는 공급자 로고를 넣지 않음)과 "Start a new conversation" 선택. 이어 가기면 모델 줄에 같은 에이전트·effort 트리거를 chevron 없이 비활성으로 둔다("Terminal session", "Default", 툴팁 "Set in your terminal") |
| `panel-menu` | 대화 드롭다운(새 대화, 현재·이전 대화, 상태) |
| `panel-archived` | 이전 대화 읽기와 보관 표시, 보내면 다시 현재가 됨 |
| `panel-permission` | 스레드 안 권한 요청 선택지와 캔버스 작업 표시(답 대기라 캡슐은 Open) |
| `panel-failed` | 실패한 턴과, 칩이 든 반환된 초안 |
| `panel-states` | 목록 읽는 중, 목록 읽기 실패(헤더는 "New conversation"), 대화 읽기 실패, 시작 거절(새 대화라 헤더는 "New conversation"), 캔버스가 사라짐, 캔버스가 로드되지 않음(피커 비활성), 보관 대화 복원 대기(출하된 restore busy 줄과 Open), 터미널 세션 이어 가기 거절, 칩 대상을 찾지 못함, 프로젝트 대화가 그리는 중 안내, 패널을 연 채 승격 안내, 칩 32개 상한, 캔버스 ID 중복 |
| `chips-composer` | 프레임·요소·점 칩이 든 입력창(box) |
| `picker-mode` | 고르기 상태: 위쪽 가운데 안내 캡슐("Click a frame or an element, or Shift-click a spot"과 kbd "Esc"; 초안의 "Click a frame, an element or an empty spot"에서 바뀌었다, 2026-11-01 user, 숨긴 sr 텍스트 "Press Escape to cancel"), hover 후보, 눌린 피커 |
| `add-tool` | 선택이 있을 때 Add to conversation 활성과 툴팁, 칩이 들어간 입력창. 프레임 밖 참고 타일에 네이티브 메뉴 File > New Conversation ⌘N, Edit > Add Selection to Conversation ⌘L(항목과 켜짐 조건만, `/design-sync` 비교 대상 아님) |
| `chip-locate` | 보낸 칩을 눌러 대상 강조. 대상을 찾지 못함("No longer in the canvas")은 `panel-states`의 타일 |
| `open-badge` | 접힌 패널의 Show conversation에 새 소식 점(답 대기). 답 대기 중 작업 안내 캡슐은 Stop 대신 Open |
| `narrow` | 960×600, 패널 최소 폭 320(`max(320px, 28dvw)`, `buzz-canvas` 폭 규칙). 칩이 들어가면 입력창이 box가 되어 글자와 칩이 도구 위에서 줄바꿈된다 |

재사용(2026-11-01 user 검수): 새로 그리지 않고 출하 단위를 쓴다. 대화 드롭다운 = Overview `conv-menu`·`conv-item`·`cv-head`. 스레드·입력창·추천 칩(`ov-suggestions`·`suggestion`, quiet 버튼)·알림·표시 = Overview·buzz-conversation. 세션 이어 가기 선택 = 온보딩의 선택 카드(`ob-choice-list`·`doan-panel ob-choice`, 숨긴 radio). 시작·전송 거절 = 입력창 아래 `composer-reason docked-reason`. 빈 본문 = Overview 오른쪽 패널의 `rp-empty`. 새로 만드는 단위는 인라인 앵커 칩(공통 결정 2; 컴포넌트 상수 최대 폭 180px·radius 6px, 맞는 토큰이 없다), 고르기 안내(캔버스 작업 안내 캡슐 재사용), 열기 버튼 새 소식 점(사이드바 슬롯의 안 본 점과 같은 크기·색)뿐이다.

선택 카드 라디오(2026-11-01 user, 공용 선택 카드 변경): 오른쪽 체크 아이콘을 없애고, 그 자리를 카드 왼쪽 위의 보이는 라디오가 대신한다. 라디오는 16px(`--size-icon`) 원이고 제목 첫 줄(`--type-label-sm-line-height`)의 가운데에 맞춘다. 제목이 두 줄이 되어도 라디오는 첫 줄에 남는다. 꺼짐은 `--border-prominent` 테두리와 `--surface-panel` 채움, 켜짐은 `--affordance-prominent` 채움과 6px(`--space-1h`) `--text-on-prominent` 점(체크박스 `doan-checkbox`와 같은 색). 숨긴 native radio·카드 포커스 외곽선·Enter 고르기는 그대로다. 이 변경은 이 화면만이 아니라 `ob-choice`를 쓰는 모든 곳(온보딩 Your projects, Add Projects의 폴더 안 저장소)에 반영한다. 썸네일이 있는 카드는 라디오 → 썸네일 → 텍스트 순서다.

모델·effort(2026-11-01 user 질문에 대한 답, 출하된 `dockedPicker` 규칙): 기존·보관 대화는 공급자를 바꿀 수 없어 그 공급자의 모델만 고를 수 있고, 트리거 접근 이름에 공급자가 붙는다("Model: Opus 5.5 (Claude Code)"). effort는 그 모델의 단계만. 새 대화는 Home과 같은 공급자 선택기와 Settings 기본값. 터미널 세션 이어 가기는 모델·effort·첨부를 받지 않는다. 첨부 버튼은 비활성이고 툴팁은 "Files can’t be attached to a terminal session"이다. 프리셋은 그대로 쓸 수 있고, placeholder는 답장과 같은 "Reply, / for presets"다. 모양은 같게 두고 고를 수만 없게 한다: 같은 xs 트리거, chevron 없음, `aria-disabled`, 툴팁 "Set in your terminal"(2026-11-01 user).

## 1. 영향 범위

- **renderer**
  - 캔버스 대화 호스트: Overview의 `overviewRun.ts`·`dockedSupport.ts`·`overviewConversation.ts`가 하는 일(목록 읽기, 대화 고르기, 시작·전송·대기열·복원·초안·본 것)을 캔버스 하나에 맞춘 호스트로 둔다. 공통 부분은 함수로 나누고, 프로젝트 대화와 캔버스 대화만 다른 부분(어떤 대화가 대상인지, 새 대화의 시작 모드)을 분기한다. 새 파일 이름은 구현에서 정한다(예: `canvasRun.ts`).
  - 대화 패널: `buzz-canvas`의 껍데기 본문을 스레드·입력창으로 바꾸고, 헤더 제목을 드롭다운 트리거로 바꾼다(Overview 헤더의 `projectConversationMenu`·`conv-menu` 재사용).
  - 칩 필드: `ComposerParts.tsx`의 `ComposerField`를 칩을 담는 필드로 바꾼다. 인터페이스 `{text, anchors}`는 그대로이고(ARCHITECTURE §7 'Renderer primitives'), Home·Overview의 입력창도 같은 필드를 쓴다(그쪽에는 칩을 넣는 길이 없을 뿐).
  - 피커와 도구: 입력창의 피커 버튼, 도구모음의 Add to conversation, 캔버스 고르기 상태. `CanvasController`는 도구 상태 하나(`select | pick`)를 두고, pick이 끝나면 select로 돌아간다(두 값만, 미리 넓히지 않는다). 고르기는 캔버스 스크립트의 내부 명령으로 한다(§4 '구조 결정').
  - 메뉴: Edit > Add Selection to Conversation(⌘L, 선택이 있고 피커가 쓸 수 있을 때만 켜짐, 도구모음 버튼과 같은 동작). File > New Conversation(⌘N)을 캔버스 페이지에서도 켠다(패널을 펴고 새 대화 상태, 입력창 포커스). `menuState`에 캔버스 페이지 조건을 더한다.
  - 새 대화 초안: `DockedMode`의 새 대화에 캔버스를 넣어 초안 키를 (root, 캔버스 id) 단위로 만든다(Overview 새 대화는 root 단위 그대로). 터미널 세션 이어 가기도 `DockedMode`의 모드로 두고, existing·archived에는 대화의 `owner`를 실어 `legacy-external`이면 모델·effort 트리거를 "Terminal session"·"Default" 비활성으로, 첨부를 비활성으로 둔다(이어 간 뒤의 전송·대기열도 세 값을 거절하기 때문이다).
  - 작업 안내 캡슐: 답 대기 중에는 Stop 대신 Open을 둔다(`buzz-canvas` 확정분을 바꾼다, 2026-11-01 user). 일하는 중에는 Stop 그대로다.
  - 칩 locate: 보낸 메시지 칩의 대상 찾기와 뷰 이동·강조. renderer는 sandbox iframe의 DOM을 읽을 수 없으므로, 코멘트 핀이 쓰던 `anchors` 요청·응답 채널(targets→rects, `canvasMessage.ts`)을 칩용으로 남기고 `select-anchor` 없이 `jumpToNode`·`locateView`로 이동만 한다. 이 채널은 선택 외곽선도 나르므로 핀을 지울 때 함께 지우지 않는다.
  - 상태줄: 캔버스 페이지에서 `ConversationStripView`를 그리지 않는다.
  - 열기 버튼 새 소식 점: `buzz-canvas`가 만든 Show conversation 버튼에 점과 접근 이름을 더한다.
  - 코멘트 제거: `CommentsPanel.tsx`, `CommentPins.ts`, `ReviewBar.tsx`, `HandOffDialog.tsx`, `useComments.tsx`, `CommentsSession.ts`, `commentAnchors.ts`와 테스트, `App.tsx`의 연결, `CanvasController`의 핀·코멘트 경로(`setComments`·`recordResolved`·`drawPins`), Activity의 resolved 집계(`activity.ts`), 초안 가드(`setCommentDraftGuard`, `comments:transition`), 사이드바 캔버스 행의 코멘트 수 접근 설명(`ShellSidebar.tsx`)과 코멘트 읽기 오류 행(`canvasTree.ts`)(2026-11-01 user). 남김·지움은 아래 표를 따른다.
- **preload·main**
  - 앱 전용 코멘트 IPC(`comments:*`, `comments:invalidated`), Review 상태 IPC(`review-state:get`·`review-state:raise`, `main/reviewState.ts`, `<userData>/review-state.json`), 코멘트 가드(`transitionGuard`)를 지운다(2026-11-01 user). `transitionGuard`가 감싸던 Quit과 `folders:remove`는 계속 진행 함수를 바로 부른다. 코멘트 파일 형식과 CLI가 쓰는 Go 코드는 그대로다.
  - 대화 IPC: 캔버스 대화 시작은 `startConversation`(`mode: "new"`, `canvas`), 이어 가기는 `sendConversation`, 터미널 세션은 `conversationResumeTarget`과 `mode: "resume"`이다. 바뀌는 것 하나: `mode: "new"`도 `newDesign`처럼 `validateSendExtras`를 거쳐 `model`·`effort`·`attachments`를 받는다(지금은 `bad_request`, `ipc.ts`; 2026-11-01 user). `resume`은 그대로 거절한다.
  - 대화 제목: main이 시작할 때 제목을 `request.text`가 아니라 한 줄 텍스트(`{{n}}`을 칩 이름으로 바꾼 것, §3 `messageLine`)로 만든다. 미리보기·대기열·알림도 같은 함수를 쓴다. 함수는 main과 renderer가 함께 쓰므로 main 모듈을 끌어오지 않는 공용 모듈에 둔다(POSTMORTEM 2026-10-30 renderer import).
  - 메뉴: Go > Next/Previous Resolved Comment를 지운다(`menuState` `resolvedNav`).
- **CLI·스킬·형식**: 바뀌지 않는다.

코멘트 코드의 남김·지움(2026-11-01 user):

| 대상 | 처리 | 이유 |
|---|---|---|
| `app/src/main/comments/`의 `identity`·`document`·`service` 중 캔버스 identity·document bindings | 남김 | `main/shell.ts`·`main/inspector.ts`·`main/serve/server.ts`가 캔버스 경로·응답 해시에 쓴다. 코멘트 전용 함수(`authorizeComments`, `commentDocument`)만 지운다 |
| `app/src/comments/projection.ts`의 `copyText` | 남김 | eval H6·H7이 import한다(eval은 비목표) |
| `app/src/comments/`의 review·handoff·draft·panelText와 renderer가 쓰던 resolution | 지움 | 앱 코멘트 화면만 썼다. eval이 쓰는 것은 남긴다 |
| `comments:*`·`comments:invalidated` IPC, preload 노출 | 지움 | 앱 코멘트 화면 전용 |
| `review-state:*` IPC, `main/reviewState.ts`, `review-state.json` | 지움 | Review 전용 |
| `transitionGuard` | 지움 | Quit·`folders:remove`는 바로 진행 |
| `anchors` 요청·응답 채널 | 남김 | 칩 locate와 선택 외곽선이 쓴다 |
| 코멘트 JSON Schema, Go 코드, CLI, 스킬 | 남김 | 비목표 |

## 2. 상호작용 규칙

### 대화 패널

- 헤더: Overview 오른쪽 패널 제목 줄 자리의 대화 드롭다운. 트리거는 현재 보이는 대화의 제목(새 대화 상태면 "New conversation"), 메뉴는 New conversation → "Conversations on <canvas>" → 이 캔버스의 대화(현재 대화 먼저, 그다음 최근 활동 순, 공급자 로고·제목·상태·시각·한 줄 미리보기). Overview 메뉴(`conv-menu`, `conv-item`)와 같은 행이다. 헤더는 스크롤되지 않는 줄이고 스레드는 그 아래 영역에서만 스크롤된다. 헤더에는 따로 배경 바·구분선·그림자를 두지 않고, 위로 넘어간 메시지는 헤더 아래 경계에서 잘린다(Overview `.ov-head`·`.thread-scroll`과 같다, 2026-11-01 user).
- 기본으로 보이는 대화: 요청된 대화(Overview 행, 알림 등) → 이 캔버스의 현재 대화 → 새 대화 상태. 보관 대화는 사람이 메뉴에서 고를 때만 보인다.
- 보관 대화: 읽기 상태로 보이고, 입력창 위의 보관 표시에 "Archived when another conversation became current on this canvas. Send a message to make it current again." 안내가 있다. 보내면 복원(백엔드 restore)이다.
- 본 것: 패널이 펴져 있고, 창이 포커스를 가지고, 그 대화가 보일 때 `markSeen`. 접힌 패널, 다른 화면, 창 포커스 없음에서는 기록하지 않는다.
- 상태: 목록 읽는 중(300ms 뒤 "Loading conversation…"), 읽기 실패("Couldn’t read conversations"와 Retry), 대화 하나 읽기 실패(그 대화만 오류)는 Overview와 같다.
- 현재 대화가 일하는 동안(running·waiting) 새 대화 상태에서 보내기를 막는다. 보관 대화 복원과 같은 busy 줄 "The current conversation on this canvas is still running."과 Open을 보인다(2026-11-01 user). 백엔드는 이 경우 현재 턴을 interrupted로 끝내므로 renderer가 막는다.
- 프로젝트 대화가 이 캔버스를 그리는 동안(그 대화가 턴 중에 이 캔버스를 만들었고 아직 승격 판단 전): 새 대화 상태의 입력창 위에 "A project conversation is drawing this canvas. Sending here starts a separate conversation."와 Open(Overview의 그 대화)을 둔다. 보내기는 막지 않는다. 패널을 연 채 승격되면 보이던 것은 바꾸지 않고, 입력창 위에 "A project conversation is now current on this canvas."와 Open(승격된 대화)을 보인다(2026-11-01 user).
- 터미널 세션 선택지: 새 대화 상태가 처음 보일 때 `conversationResumeTarget`을 한 번 부르고 캔버스가 바뀔 때까지 재사용한다. 응답 전에는 선택지 없이 새 대화로 보이고 Send는 막는다(늦게 나타난 선택지 때문에 다른 모드로 보내지 않게). 늦은 응답은 캔버스 revision으로 버린다(2026-11-01 user).

### 패널을 여는 규칙 (2026-11-01 user)

- 연다: Overview 캔버스 행, 알림·권한 토스트의 Open, Overview 승격 알림의 Open, 작업 안내 캡슐의 Open, 사이드바 캔버스 행(슬롯에 답 대기나 안 본 끝이 보일 때만; 일하는 중이거나 표시가 없으면 패널은 마지막 상태), Add to conversation, ⌘N(2026-11-01 user).
- 포커스: 권한 요청으로 들어오면(권한 토스트·알림의 Open, 캡슐의 Open, 답 대기 슬롯) 그 요청으로 스크롤하고 첫 선택지에 포커스를 준다(Overview `scrollToItem`과 같다). 나머지 진입은 입력창에 포커스를 준다.
- 작업 안내 캡슐: 답 대기 중에는 Stop 대신 Open만 둔다. 패널이 접혀 있으면 펴고, 펴져 있으면 그 요청으로 스크롤만 한다. 멈추기는 패널 권한 카드의 Stop으로 한다. 일하는 중에는 Stop 그대로다(2026-11-01 user, `buzz-canvas` 확정분 변경).
- 열지 않는다: 에이전트의 턴 시작, 권한 요청, 턴 종료. 이때는 캔버스 작업 표시와 사이드바 슬롯이 알린다.
- 새 소식 점: 패널이 접혀 있으면 캔버스 헤더의 Show conversation 버튼 오른쪽 위에 accent 점(사이드바 슬롯의 안 본 점과 같은 모양)을 둔다. 조건은 이 캔버스의 현재 대화가 답을 기다리거나(`phase: waiting`), 본 적 없는 끝이 있을 때다. 버튼 접근 이름에 "Show conversation, needs your answer" / "Show conversation, new activity"를 더한다. 패널을 펴서 그 대화가 보이면 본 것 규칙대로 사라진다. 일하는 중(`running`)은 캔버스 작업 표시가 알리므로 점을 두지 않는다.

### 칩 필드

- 칩은 인라인 원자다: 커서는 칩 앞뒤에만 서고, Backspace/Delete는 칩 하나를 통째로 지운다. 칩 모양은 공통 결정 2의 "인라인 앵커 칩"(연한 accent 채움 + 진한 accent 글자)이다.
- 칩 이름: 프레임 "<프레임 이름>"(아이콘 Frame), 요소 "<이름> <doan-id>" 또는 `<이름> “<text>”`(최대 40자), 점 "Point in <프레임>". 요소의 이름은 tag를 사람이 읽는 이름으로 바꾼 것이다: h1~h6 → heading, a → link, img → image, input·textarea·select → field, button → button, 그 밖은 tag 그대로(2026-11-01 user). 클래스에서 오는 이름은 쓰지 않는다. 전체 대상은 `title`.
- 값: 필드는 `{text, anchors}`를 준다. text의 칩 자리는 `{{n}}`(1부터, 등장 순)이고, 같은 대상을 두 번 넣으면 같은 번호를 쓴다(백엔드는 반복을 허용). 사람이 `{{`나 `}}`를 직접 치면 지금처럼 Send가 막힌다. 이 검사(`draftProblem`)는 사람이 친 텍스트 조각만 본다. 칩 마커는 검사하지 않는다.
- 칩 수 상한: 서로 다른 대상은 한 메시지에 32개까지다(`LIMITS.anchors`). 넘으면 피커와 Add to conversation이 칩을 넣지 않고 입력창 아래 이유 줄 "A message can point at up to 32 places. Remove one to add another."를 보인다. 상한 값은 main 모듈이 아닌 공용 모듈에서 가져온다.
- 한 줄 텍스트: 제목·미리보기·대기열·알림처럼 한 줄로 보이는 곳은 `{{n}}`을 칩 이름으로 바꾼 텍스트를 쓴다(§3 `messageLine`).
- 대기열 합치기와 반환된 초안은 백엔드의 `combineQueued`가 번호를 다시 매긴 `{text, anchors}`를 돌려주므로, 필드는 그것을 칩으로 다시 그린다.
- 붙여넣기: 이미지·파일은 지금처럼 첨부로 가고, 텍스트는 순수 텍스트로 들어간다. Doan 입력창 사이에서 자르기·복사·붙여넣기를 하면 칩이 칩으로 남고, 바깥으로 붙이면 칩 이름 텍스트가 된다.
- 편집: ⌘Z·⇧⌘Z는 칩 넣기·지우기를 한 단계로 되돌린다. ⌥⌫·⌘⌫과 Shift+화살표는 칩을 한 단위로 다룬다. 빈 필드의 Backspace가 프리셋·첨부 칩을 지우는 지금 규칙(`chipRemoval`)은 커서가 맨 앞일 때만이다.
- 접근성: 필드는 `role="textbox"`, `aria-multiline`이고 `/` 프리셋 combobox ARIA(`aria-activedescendant`)를 지금처럼 가진다. 입력창 칩은 숨긴 종류 접두어("Frame", "Element", "Point")를 텍스트로 가져 문장 흐름으로 읽히고, Tab 정지점이 아니다. 칩을 넣으면 기존 sr status로 "Added <label>"을 알린다.
- IME: 조합 중에는 칩을 넣지 않고 조합이 끝난 뒤 넣는다. 칩 삽입과 capsule↔box 전환에서 필드 요소를 다시 마운트하지 않는다(POSTMORTEM·ARCHITECTURE의 docked 규칙).

### 피커와 Add to conversation

- 입력창 피커("Pick from canvas", 입력창 카드 아래 모델 줄의 왼쪽 끝 xs 아이콘 버튼; 에이전트·effort는 오른쪽, 2026-11-01 user): 누르면 캔버스가 한 번 고르기 상태가 된다. 보드 커서가 십자, 위쪽 가운데에 "Click a frame or an element, or Shift-click a spot" 안내와 kbd "Esc", hover 후보는 지금 hover 외곽선. 누르면 앵커가 정해지고 칩이 커서 위치에 들어가며 입력창 포커스가 돌아온다. 고르기는 현재 선택·`doan active`를 바꾸지 않는다. Esc·피커 다시 누르기·다른 화면으로 가기는 취소다.
- 고르기 Esc와 취소(2026-11-01 user): Esc 순서는 메뉴·팝오버 → `/` 목록 → 고르기 → 선택 해제다. 고르기 중 Esc는 포커스가 입력창·iframe·패널 어디에 있어도 고르기만 취소하고 선택을 지우지 않는다(`preventDefault`). Hide conversation, 메뉴에서 대화 전환, 입력창을 쓸 수 없게 됨(전송 중 아님, gone·프로젝트 문제), 다시 로드 뒤 로드 실패나 목록에 없음도 고르기를 취소한다. 같은 ID로 캔버스가 옮겨지면 다시 로드처럼 고르기를 유지한다. 고르기 중에도 두 손가락 팬·핀치는 동작하고, ⌥-클릭도 고른다.
- 포커스 복귀: 고르기를 시작할 때 입력창 커서 위치를 저장하고, 칩을 넣으면 커서를 칩 바로 뒤에, 취소하면 저장한 위치에 둔다. 복귀는 시작할 때의 의도를 들고 가서, 그 사이 포커스가 다른 곳으로 갔거나 IME 조합 중이면 옮기지 않는다(POSTMORTEM 2026-10-23 R-L).
- 접근성: 피커는 `aria-pressed`, 안내 문구는 `role="status"`이고 숨긴 텍스트 "Press Escape to cancel"을 가진다. 작업 안내 캡슐과 함께 뜨면 작업 안내가 위, 고르기 안내가 그 아래다.
- 프레임과 점(2026-11-01 user): 프레임의 배경(프레임 요소 자체)을 누르면 프레임 칩, 요소를 누르면 요소 칩이다. 프레임 안 어디든 ⇧-클릭하면 그 자리의 점 앵커(`point {frameId, dx, dy}`, 그 프레임 기준 offset, 겹치면 가장 안쪽 프레임)다. 프레임 배경이 곧 프레임 요소라 "빈 곳 → 점"과 "프레임 → 프레임 칩"이 겹쳐서 점을 ⇧-클릭으로 나눴다. 프레임 밖(문서의 프레임 바깥과 보드 여백)을 누르면 아무것도 넣지 않고 고르기를 유지한다. 보드 좌표는 앱 내부 배치라 에이전트가 HTML과 연결할 수 없기 때문이다(2026-11-01 user). "Point on canvas" 칩은 없다.
- Add to conversation(도구모음, `buzz-canvas`가 만든 `role="toolbar"`에 더함): 현재 선택(프레임·요소)이 있을 때 활성. 누르면 패널을 펴고(접혀 있었으면) 입력창 커서 위치(포커스가 없었으면 끝)에 선택의 칩을 넣고 입력창에 포커스를 준다. 보관 대화가 보이는 중이면 그 입력창에 넣는다.
- 쓸 수 있는 때: 피커와 Add to conversation(⌘L 포함)은 입력창이 입력을 받고 캔버스가 로드되었을 때만 활성이다. 비활성은 `disabled` 대신 `aria-disabled`라 툴팁이 hover·포커스로 나온다. 툴팁은 캔버스를 보일 수 없으면 "Pick from canvas isn’t available while the canvas can’t be shown.", 입력창을 쓸 수 없으면 그 이유 줄과 같은 문구다.
- 단축키: Edit > Add Selection to Conversation ⌘L(2026-11-01 user). 피커에는 단축키를 두지 않는다.

### 칩 locate

- 보낸 메시지(스레드의 사람 말풍선)와 입력창의 칩을 누르면 대상을 찾아 뷰를 옮기고 1.2초 강조한다(Quick Open 프레임 이동과 같은 하이라이트). 찾는 순서: 요소는 유일한 `data-doan-id` → selector, 프레임은 frame id, 점은 그 프레임의 offset. 점의 프레임이 사라졌으면 찾지 못함이다. 점은 그 자리에 지름 12px 고리를 1.2초 보인다.
- 뷰(2026-11-02 user): 프레임 칩은 서랍에서 프레임을 고를 때와 같은 이동(`fitFrame`)이다. 요소·점 칩은 지금 배율을 유지한 채 대상을 가운데로 옮기고, 요소가 화면보다 크면 전체가 보이도록 배율을 줄인다. 입력창 칩도 누르면 locate하며, hover 커서는 pointer이고 누른 뒤 입력창 커서는 칩 바로 뒤다.
- 스레드의 칩은 버튼이라 Tab과 Enter로 locate할 수 있고, 이름은 "Show <label> on canvas"다. 캔버스가 로드되지 않은 동안은 locate를 비활성으로 둔다.
- 찾지 못하면 칩 옆에 "No longer in the canvas"(`role="status"`)를 보이고, 다음 동작이 있거나 4초가 지나면 사라진다. 다른 캔버스의 대화가 보이는 일은 없다(패널은 열린 캔버스의 대화만).
- locate는 선택·`doan active`·입력창 내용을 바꾸지 않는다.

### 상태줄과 대화 상태 (2026-11-01 user)

- 캔버스 페이지에서 임시 상태줄을 그리지 않는다(문제 워크스페이스 화면은 그대로). 이 캔버스의 대화 상태는 패널 스레드가, 다른 대화(프로젝트 대화, 다른 캔버스)의 상태는 사이드바 슬롯과 권한 토스트가 알린다(지금 규칙).

### 오류 처리 (2026-11-01 user: 캔버스 대화에서 처리할 오류가 많다)

원칙: 오류는 그 자리에서 무엇이 실패했는지와 다음 동작을 보인다. 사람의 입력(텍스트·칩·첨부·프리셋)은 어떤 거절에서도 입력창에 남는다(PRODUCT §5 항목 1, `buzz-conversation` 규칙). Overview와 같은 코드는 같은 문구를 쓴다(`startErrorView`·`dockedRefusal`·`canvasGoneText`, `homeComposer.ts`·`dockedRules.ts`). 캔버스에만 있는 경우는 아래 표에서 새로 정한다. 문구는 초안에서 clarify 프리셋으로 확정한다.

| 경우 | 패널에 보이는 것 | 다음 동작 |
|---|---|---|
| 대화 목록 읽기 실패 | 헤더 드롭다운과 본문에 "Couldn’t read conversations" | Retry. 입력창은 새 대화로 쓸 수 있다 |
| 한 대화의 기록 읽기 실패(`readError`) | 그 대화 행과 본문에 읽을 수 없음 표시 | 메뉴에서 다른 대화나 New conversation |
| 시작 거절(새 대화, `not_logged_in`·`cli_missing`·`runtime_unsupported`·`credential_override`·`rate_limited`·`session_unavailable`·`session_in_use`·`process_exited`·`cli_install_failed`) | 입력창 아래 notice, `startErrorView` 문구 | 다른 에이전트 고르기 또는 Retry(코드별 `retry`), 로그인 문제는 Settings > Agents |
| 전송 거절(이어 가기, `busy`·`not_logged_in`·`rate_limited`·그 밖) | 입력창 아래 notice, `dockedRefusal` 문구 | 잠시 뒤 다시 보내기, Settings > Agents |
| 보관 대화 복원 중 현재 대화가 일함(`busy`) | busy 줄 "The current conversation on this canvas is still running." | 현재 대화로 가기(Open) 또는 끝날 때까지 기다리기 |
| 캔버스를 찾을 수 없음(목록에 없는 페이지, ID 중복) | 캔버스 페이지가 이미 아는 상태라 보내기 전에 입력창을 초안을 가진 채 비활성으로 두고 이유 줄을 보인다: 목록에 없음 "This canvas isn’t listed in <project>, so its conversation can’t continue.", ID 중복 "Another canvas has the same ID, so this conversation can’t continue. Run doan check in a terminal to find it."(2026-11-01 user). 보낸 뒤 `canvas_not_found`가 오면 같은 줄을 보인다. 캔버스 목록에서 대화의 캔버스가 사라진 경우(다른 화면)는 `canvasGoneText` 그대로 | 캔버스 페이지 자체의 missing·중복 ID 안내를 따른다(`buzz-canvas`·기존 규칙) |
| 대기열 거절(`queue_limit`, `not_running`) | `queue_limit`은 notice, `not_running`은 보내기로 바꿔 다시 시도(기존 규칙) | — |
| 첨부 문제(`attachment_missing`·`attachment_limit`) | 첨부 칩의 이동됨 표시와 notice(기존 규칙) | 칩 지우기 |
| 칩 앵커 문제(`bad_request`가 앵커 때문) | 보내기 전에 막는다: 선택 payload의 selector는 스크립트가 이미 1000자로 줄이므로(`validAnchor` 상한 2048 아래) 그대로 쓴다. 칩 수는 32개 상한(§2 '칩 필드') | — |
| 프로젝트 문제(`project_not_open`, missing·not set up·config error) | 입력창 비활성, 이유 줄 "<project> isn’t available. Fix it from its menu in the sidebar." | 사이드바 메뉴 |
| 준비된 에이전트 없음(`no_agent`, 새 대화) | 이유 줄 "No agent is ready to run."과 "Sign in to an agent…" | Settings > Agents |
| 턴 실패(`turn.failed`: `process_exited`·`rate_limited`·`session_in_use`·`unknown` 등) | 스레드의 실패 항목(기존 `threadItems`), 캔버스 작업 표시는 사라짐 | 다시 보내기. 대기열은 반환된 초안으로 입력창에 돌아온다 |
| 사람이 멈춤·로그아웃·앱 재시작으로 끊긴 턴 | 스레드의 중단 항목, 만료된 권한 요청 표시 | 다시 보내기 |
| 권한 요청 답 전송 실패 | 그 권한 항목 아래 오류 줄(기존 Overview 규칙) | 다시 고르기 |
| 캔버스가 로드되지 않음(로딩, 실패, 폭 없음, 목록에 없는 페이지) | 대화는 그대로 쓸 수 있다(목록에 없는 페이지는 위 '캔버스를 찾을 수 없음'). 입력창 피커와 Add to conversation은 비활성이고 이유 툴팁 "Pick from canvas isn’t available while the canvas can’t be shown." | 캔버스 Reload |
| 칩 대상을 찾지 못함(locate) | 칩 옆 "No longer in the canvas" | — |
| 고르기 중 캔버스가 다시 로드됨 | 고르기 상태를 유지하고 새 문서에 적용 | Esc로 취소 |
| 고르기 중 다른 캔버스·화면으로 이동 | 고르기 취소, 칩 없음 | — |
| 터미널 세션 이어 가기 불가(`conversationResumeTarget`의 `available: false`, 또는 resume 모드의 모든 거절: `no_session`·`session_unavailable`·`session_in_use`·`not_logged_in`·`cli_missing`·`runtime_unsupported`·`process_exited` 등) | 연결이 없으면 선택지를 보이지 않는다. 이어 가기 전송이 거절되면 입력창 아래 notice("Couldn’t continue the terminal session: <이유>.")와 새 계정 연결로 바꾸는 버튼 "Start a new conversation"(긴 이유 줄이라 버튼은 글 아래 줄). resume 모드에서는 "Choose another agent."를 쓰지 않는다. 버튼은 새 대화 모드로 바꾸고 초안을 유지한 채 입력창에 포커스를 준다 | 새 대화로 시작 |
| 모델 목록 읽기 실패 | 모델 "Default"(기존 규칙) | — |
| 칩 수 상한 초과 | 칩을 넣지 않고 이유 줄 "A message can point at up to 32 places. Remove one to add another." | 칩 지우기 |

## 3. 순수 함수 (`/tdd` 대상)

| 함수 | 파일(안) | 경우 |
|---|---|---|
| 캔버스 대화 고르기 `pickCanvasConversation(list, canvas, requested)` | `canvasConversation.ts` | 요청된 대화, 현재 대화, 없음(새 대화), 보관 대화 요청, 목록 읽기 실패, 옮겨진 캔버스(`sameCanvas`), 승격 직후(보이던 것 유지와 승격 안내), 프로젝트 대화가 그리는 중(안내) |
| 캔버스 대화 메뉴 `canvasConversationMenu(list, canvas, shown)` | 같은 파일 | 현재 먼저·최근 활동 순, 상태(Needs your answer, Working, Finished not seen), 보관 표시, 빈 목록 |
| 패널 열기 판단 `panelOpenFor(trigger, slot)` · 새 소식 점 `openButtonBadge(summary, panelOpen)` · 캡슐 동작 `capsuleAction(phase)` | `rightPanelOpen.ts` | 각 진입 경로(열기, 포커스 대상: 권한 요청 또는 입력창)와 에이전트 이벤트(열지 않음), 사이드바 행(답 대기·안 본 끝이면 열기, 일하는 중·표시 없음이면 그대로), ⌘N; 캡슐: 일하는 중 Stop, 답 대기 Open; 점: 답 대기, 본 적 없는 끝, 일하는 중(없음), 펴져 있음(없음), 보관 대화만 있음(없음) |
| 새 대화 시작 방식 `newConversationMode(resumeTarget, prefs)` | `canvasConversation.ts` | 연결 있음(이어 가기 기본, 새 계정 연결 선택 가능), 연결 없음·`available: false`(새 대화만), 응답 전(새 대화로 보이고 Send 막음), 이어 가기 거절 뒤 새 대화로 바꿈, 현재 대화가 일하는 중(Send 막음, busy 줄) |
| 초안 키 `draftKey(mode)` · 초안 문제 `draftProblem(draft)` | `dockedRules.ts`·`homeComposer.ts`(기존) | 캔버스 새 대화는 (root, 캔버스 id), Overview 새 대화는 root, 터미널 세션 모드; `{{`는 친 텍스트 조각만 검사, 칩 마커는 통과 |
| 피커 쓸 수 있음 `pickerAvailability(composer, canvas, chips)` | `canvasPicker.ts` | 입력 받음·로드됨(활성), 캔버스 로드 안 됨·폭 없음·목록에 없음(캔버스 이유), 입력창 비활성(그 이유), 칩 32개(상한 이유) |
| 본 것 판단 `shouldMarkSeen(panelOpen, focused, shown, summary)` | `canvasConversation.ts` | 접힘, 포커스 없음, 보관 대화, 이미 본 seq |
| 칩 직렬화 `toMessage(segments)` · `fromMessage(text, anchors)` | `anchorField.ts` | 등장 순 번호, 같은 대상 반복, 칩 0개, `{{` 직접 입력, 반환된 초안 왕복, `combineQueued` 결과, 서로 다른 대상 32개 상한 |
| 한 줄 텍스트 `messageLine(text, anchors)` | 공용 모듈(main 모듈을 끌어오지 않는 곳) | 칩 없음, 칩 이름 치환, 같은 번호 반복, 앵커 없는 `{{n}}`(그대로 둠), 512자 자르기 |
| 칩 이름 `chipLabel(anchor, frames)` | 공용 모듈(`messageLine`과 같은 곳) | 프레임 제목/id, 요소 이름 매핑(heading·link·image·field·button·tag 그대로), doan-id/text 40자, 점(프레임 이름) |
| 점 앵커 `pointAnchor(click, frames)` | `canvasPicker.ts` | 프레임 안(offset), 겹친 프레임(가장 안쪽), 프레임 밖(앵커 없음), 유한하지 않은 값 |
| 칩 대상 찾기 `resolveChipTarget(anchor, reply)` | 같은 파일 | 스크립트 `anchors` 응답을 판단한다: doan-id 유일·중복, selector, 프레임 id, 점(프레임 있음·사라짐), 못 찾음, 캔버스 로드 안 됨(비활성) |
| 캔버스 대화 오류 보기 `canvasConversationError(code, mode, provider, project)` | `canvasConversation.ts` | §2 '오류 처리' 표의 모든 코드: Overview와 같은 코드는 같은 문구(`startErrorView`·`dockedRefusal` 재사용), 캔버스 전용(복원 중 busy, 새 대화 중 busy, 캔버스 로드 안 됨, 목록에 없음·ID 중복, resume 모드 거절 통일, 피커 비활성 이유, 칩 상한), 모르는 코드는 일반 문구. 오류 코드가 아닌 표의 행(고르기 중 다시 로드·이동, 권한 답 실패, 모델 목록 실패, 칩 대상 없음, `readError`)은 tasks에 적은 테스트 위치에서 본다 |

## 4. 형식·규칙·결정 영향

- **형식 변경**: 파일 형식은 없다. 앵커(`Anchor`)와 `{{n}}`, 대화 이벤트 JSONL은 이미 있다. 코멘트 JSON Schema와 파일은 그대로다. IPC 계약 하나가 바뀐다: `startConversation` `mode: "new"`가 `model`·`effort`·`attachments`를 받는다(§1). 대화 제목은 `{{n}}` 대신 칩 이름이 들어간 한 줄 텍스트가 된다.
- **규칙(ARCHITECTURE §1, `doan check`)**: 없다.
- **구조 결정**: 앱 코멘트 IPC가 사라진다. 코멘트 본문은 데이터라는 규칙(§2)과 append-only 이벤트는 CLI 쪽에 그대로 남는다. 선택 수명·`doan active`는 바뀌지 않는다. 캔버스 스크립트는 클릭하면 `select`를 보내기 전에 자기 `selected`·`anchor`를 바꾸고 클릭 좌표를 보내지 않으므로, 고르기는 스크립트의 내부 명령으로 한다(2026-11-01 user): 고르기 시작·취소 명령과 응답 `picked {target | point}`. 이 명령은 자기 seq를 쓰고 `selected`·`anchor`·hover를 건드리지 않으며, 고르기 중 스크립트 안의 Esc도 선택 해제가 아닌 취소다. 앱 내부 메시지라 형식이 아니다.
- **제품 결정**: PRODUCT가 바뀌는 곳은 tasks Z1에 모두 적었다(§1 문제 2·4, §3 In scope 2·3과 끝 문단, §4 Loop, §5 머리·항목 1·3·4·6, Dogfooding, §6 열린 질문). `buzz-canvas` Z1이 먼저 고친 본문을 기준으로 한다.

## 5. PoC

- **칩 필드와 IME(먼저)**: 지금 입력창은 textarea다. 인라인 칩을 담으려면 contenteditable 필드가 필요하고, 한글 IME 조합, 커서 이동, Backspace, 붙여넣기, capsule↔box 전환에서의 포커스 유지가 알려진 위험이다. tasks P1에서 `.scratch/`의 독립 PoC로 확인한다: 한글 조합 중 칩 삽입 대기, 조합 끝 뒤 칩 삽입, 칩 앞뒤 커서, 칩 단위 삭제, 순수 텍스트 붙여넣기, 마운트 유지. 추가로 확인한다: contenteditable에서 `/` 프리셋 목록 열기와 combobox ARIA, 이미지 붙여넣기는 첨부·텍스트는 순수 텍스트, Doan 입력창 사이의 잘라 붙이기에서 칩 유지, 칩 삽입·삭제 뒤 ⌘Z·⇧⌘Z, ⌥⌫·⌘⌫·Shift+화살표의 칩 단위 동작, 칩 바로 앞에서의 IME 조합. 통과하지 못하면 대안(칩을 입력창 위 줄에 따로 두고 text에 `{{n}}`만)을 사용자에게 묻는다.

### P1 결과 (2026-11-01)

- **환경**: Electron 45.0.0(Chromium 156.0.8078.48), macOS 26.6.2. `.scratch/anchor-field/`의 독립 페이지이고 앱에 연결하지 않았다.
- **확인 방법**: `node .scratch/anchor-field/probe.mjs`(Playwright `_electron`, 임시 userData·HOME, `app/runtime/`의 격리·정리·클립보드 복원)가 10개 항목을 모두 통과했다(exit 0, 두 번 실행). 한글 조합은 CDP `Input.imeSetComposition`·`Input.insertText`로 흉내 냈다. 키는 Playwright가 macOS 키 바인딩과 같은 편집 명령(`deleteWordBackward:`·`undo:`·`paste:` 등)으로 보냈다. 클립보드는 실제 시스템 클립보드를 쓰고 끝에 되돌렸다. 조합 중 칩 대기를 빼거나 단어 삭제를 칩에서 멈추는 규칙을 빼면 각각 1번·4번이 실패한다.
- **미검증**: 네이티브 한글 IME, 실제 키보드의 ⌘Z가 메뉴보다 렌더러에 먼저 가는지, 다른 앱으로 붙여넣기. 사람이 `node .scratch/anchor-field/open.mjs`로 확인한다.

| 항목 | 결과(흉내) | 확인한 것 |
|---|---|---|
| 한글 조합 중 칩 삽입 대기, 조합 끝 뒤 삽입 | 통과 | 조합 중 칩 넣기는 대기("pending")하고 DOM과 조합 글자를 건드리지 않는다. 조합이 이어져도 기다리고, 끝나면 확정된 글자 뒤에 칩이 들어가며 커서는 칩 뒤에 선다 |
| 칩 바로 앞에서의 IME 조합 | 통과 | 맨 앞 칩 앞, 두 칩 사이, 글자 뒤 칩 앞, 끝 칩 뒤에서 조합한 글자가 칩 밖에 들어가고 칩은 그대로다 |
| 칩 앞뒤 커서와 화살표 | 통과 | ←·→가 칩을 한 칸으로 건너고, DOM 커서가 칩 안에 서지 않는다. 두 칩 사이, 맨 앞 칩 앞, 끝 칩 뒤에서 입력할 수 있다 |
| 칩 단위 Backspace/Delete·⌥⌫·⌘⌫·Shift+화살표 | 통과 | ⌫·⌦는 칩 하나를 통째로 지운다. ⌥⌫·⌥⌦는 바로 옆이 칩이면 칩만 지우고, `[칩]world`에서 ⌥⌫는 world만 지운다(Chromium 기본은 칩까지 함께 지우므로 필드가 단어 삭제를 칩에서 멈춘다). ⌘⌫는 줄 머리까지 칩을 포함해 지우고 윗줄은 남긴다. Shift+←·→는 칩을 한 단위로 선택한다 |
| ⌘Z·⇧⌘Z로 칩 넣기·지우기 되돌리기 | 통과 | 칩 넣기와 지우기가 각각 한 단계이고 앵커까지 돌아온다. 입력도 되돌린다. 필드가 자체 기록을 갖고(1초 안의 입력은 한 단계) 키와 `beforeinput` historyUndo·historyRedo를 막는다 |
| 텍스트는 순수 텍스트, 이미지는 첨부 | 통과 | text/html이 함께 있어도 text/plain만 들어가고 필드에 요소가 생기지 않는다. PNG는 첨부 하나가 되고 필드는 그대로다 |
| Doan 입력창 사이 잘라 붙이기 | 통과 | ⌘A·⌘X 뒤 다른 필드에 ⌘V하면 칩 두 개와 앵커가 남는다. 부분 ⌘C(공백과 칩)도 칩을 유지한다. 바깥 textarea에는 칩 이름 텍스트가 들어간다. 클립보드에 text/plain과 Chromium 사용자 정의 형식 `application/x-doan-field+json`을 함께 쓴다 |
| `/` 프리셋 목록 열기와 combobox ARIA | 통과(차이 하나) | `/c`로 목록이 열리고, 접근성 트리에서 필드의 role·expanded·controls·activedescendant가 지금 textarea와 같다. ↓가 activedescendant를 옮기고, Enter로 고르면 목록이 닫히며 textbox·multiline으로 돌아간다. Esc는 필드를 비울 때까지 닫힘을 유지한다. 차이: Chromium은 contenteditable combobox에 aria-autocomplete를 노출하지 않는다(textarea는 "list") |
| 줄바꿈으로 capsule→box 전환 | 통과 | Shift+Enter로 box가 되어도 같은 요소에 포커스가 남는다. 조합 중 줄이 넘어가 box가 될 때 compositionend는 확정할 때 한 번만 오고 글자를 잃지 않는다. 칩을 넣어 box가 될 때도 같은 요소다 |
| `{text, anchors}` 왕복 | 통과 | 등장 순 번호의 메시지는 그대로 돌아온다. 칩이 없는 메시지, 앵커 없는 `{{n}}`(친 텍스트로 남음), 키 순서만 다른 같은 대상(같은 번호), 번호 순서가 뒤바뀐 메시지(등장 순으로 다시 매김)를 확인했다. 친 텍스트 검사는 칩을 빼고 본다. DOM에 그렸다 읽어도 값이 같다. 서로 다른 대상 33번째는 넣지 않고("limit"), 같은 대상 반복은 들어간다 |

- **항목 밖 발견(R1이 다룬다, 고르지 않았다)**:
  - Edit 메뉴에서 Undo·Redo를 마우스로 고르면 Chromium 편집 명령이 실행되고, Chromium 자체 되돌리기 기록이 비어 있으면 `beforeinput`이 오지 않는다. probe에서 Undo는 필드에 닿았지만 이어서 Redo는 닿지 않았다(필드가 Chromium의 되돌리기를 막으므로 Chromium의 다시 실행 기록이 비어 있다). 앱 Edit 메뉴는 `role: "undo"`·`role: "redo"`다(`app/src/main/index.ts`). 대안: 포커스가 칩 필드에 있을 때 메뉴 Undo·Redo를 renderer로 보내 필드가 처리한다.
  - aria-autocomplete 차이(위 표): 받아들이거나, ARIA 1.1 방식(바깥 요소가 combobox, 필드는 textbox와 aria-autocomplete)으로 노출할 수 있다. `.scratch/anchor-field/ax-variants.mjs`에서 Chromium이 이 방식의 textbox에는 autocomplete "list"를 노출했다.
- **R1 이식 기준**: `field-model.js`(세그먼트, `toMessage`·`fromMessage`, 칩은 한 칸)와 `field-dom.js`(DOM·선택·클립보드·되돌리기·IME). 글자 입력과 조합은 브라우저에 맡기고 `input` 뒤 DOM을 읽는다. 칩이 걸린 삭제, 붙여넣기, 자르기, 되돌리기는 모델에서 하고 같은 요소의 자식만 다시 그린다. 조합 중에는 다시 그리지 않는다. 한글은 음절마다 조합을 끝내고 같은 키 이벤트에서 다시 시작하므로, 대기 칩은 compositionend 다음 작업에서 새 조합이 없을 때만 넣는다. 포커스가 없는 필드에 선택을 놓으면 Chromium이 포커스를 옮기므로 커서만 기억한다. 앵커는 칩 노드의 WeakMap에 두고 DOM 속성에 쓰지 않는다. 칩은 `contenteditable="false"` span이고 숨긴 종류 접두어를 텍스트로 가진다.

## 6. POSTMORTEM에서 온 함정

- **2026-10-26 — late replies (ARCHITECTURE §7 'Late replies')**: start·send 응답이 그 사이의 대화 고르기·New·진입 요청을 덮지 않게 root(여기서는 캔버스) revision을 함께 들고 다닌다.
- **2026-10-25 — Navigation feedback read the previous React snapshot**: 칩 locate와 고르기 상태가 렌더 전 스냅샷을 읽지 않게, 동기 생산자의 상태를 콜백에 넘긴다.
- **2026-10-23 — Hover commands discarded pending selection replies**: 고르기 상태가 선택 seq와 hover seq 두 채널을 섞지 않게 한다. 고르기 클릭은 선택 메시지로 오지만 선택을 바꾸지 않아야 한다.
- **2026-10-30 — Removing a shared dialog class silently disabled two focus guards**: 코멘트 화면을 지울 때 `comments-*` 셀렉터·이름 문자열 검색으로 포커스 가드, 테스트, runtime 지원, 측정 스크립트의 다른 사용처를 찾는다.
- **2026-10-23 — Draft guards changed existing transition timing**: 코멘트 초안 가드를 걷어낼 때 `transition`의 타이밍에 기대던 경로(캔버스 열기, 선택, 이동)가 같은 순서로 동작하는지 테스트로 확인한다.
- **2026-10-30 — A renderer import of a main module left the built app's window blank**: `chipLabel`·`messageLine`·앵커 상한은 main과 renderer가 함께 쓰므로 `prompt.ts`(ajv까지 닿는다)에서 가져오지 않고 공용 모듈에 둔다. `rendererImports.test.ts`의 EXTRA_ROOTS에 새 renderer 파일을 더한다.
- **2026-10-23 — R-L recurrence (wait-then-focus must carry the intent)**: 고르기·Add to conversation 뒤 입력창 포커스 복귀는 시작할 때의 의도를 들고 가고, 포커스가 옮겨졌거나 IME 조합 중이면 포기한다. command 응답은 seq만이 아니라 응답 표시로 묶는다.
- **2026-10-30 — Timing tests failed under machine load**: 300ms 로딩, 1.2초 강조, 4초 "No longer in the canvas"는 fake timer로 보고, 대기보다 넉넉한 테스트 한도를 둔다.
