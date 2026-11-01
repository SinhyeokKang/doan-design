# buzz-canvas-conversation — design

## 0. 초안

`/design-draft`가 새 파일 `.doan/canvases/buzz-canvas-conversation.html`을 그린다. 셸·캔버스 헤더·보드·도구모음은 `buzz-canvas.html`(확정), 스레드·docked 입력창은 `buzz-conversation.html`·`buzz-project.html`(출하)에서 가져온다. 대화 드롭다운은 `buzz-canvas.html`의 `conversation-menu` 참고 프레임을 그대로 쓴다.

| 프레임 | 내용 |
|---|---|
| `panel-thread` | 현재 대화가 있는 캔버스: 헤더 드롭다운(대화 제목), 스레드(칩이 든 사람 메시지), docked 입력창(Pick from canvas 포함), 도구모음 Add to conversation(비활성) |
| `panel-new` | 대화가 없는 캔버스의 새 대화: Overview 새 대화 패턴(빈 본문, 입력창 바로 위 추천 칩 — Home·Overview와 같은 quiet `suggestion` 버튼과 간격, 공급자 선택기와 Settings 기본값, placeholder "Ask about this canvas, / for presets") |
| `panel-new-replace` | 대화가 있던 캔버스에서 메뉴의 New conversation: 같은 새 대화 상태, 더하는 것 없음(Overview 패턴). 첫 전송이 새 대화를 현재로 만들고 이전 대화는 메뉴의 이전 대화로 간다 |
| `panel-resume` | 세션 연결이 있는 캔버스: "Continue the <Provider> session from your terminal"(기본, 선택지에는 공급자 로고를 넣지 않음)과 "Start a new conversation" 선택. 이어 가기면 모델 줄에 같은 에이전트·effort 트리거를 chevron 없이 비활성으로 둔다("Terminal session", "Default", 툴팁 "Set in your terminal") |
| `panel-menu` | 대화 드롭다운(새 대화, 현재·이전 대화, 상태) |
| `panel-archived` | 이전 대화 읽기와 보관 표시, 보내면 다시 현재가 됨 |
| `panel-permission` | 스레드 안 권한 요청 선택지와 캔버스 작업 표시 |
| `panel-failed` | 실패한 턴과, 칩이 든 반환된 초안 |
| `panel-states` | 목록 읽는 중, 목록 읽기 실패, 대화 읽기 실패, 시작 거절, 캔버스가 사라짐, 캔버스가 로드되지 않음(피커 비활성) |
| `chips-composer` | 프레임·요소·점 칩이 든 입력창(box) |
| `picker-mode` | 고르기 상태: 위쪽 가운데 안내 캡슐("Click a frame, an element or an empty spot" + Esc), hover 후보, 눌린 피커 |
| `add-tool` | 선택이 있을 때 Add to conversation 활성과 툴팁, 칩이 들어간 입력창 |
| `chip-locate` | 보낸 칩을 눌러 대상 강조, 대상을 찾지 못함("Not in the current canvas") |
| `open-badge` | 접힌 패널의 Show conversation에 새 소식 점(답 대기) |
| `narrow` | 960×600, 패널 최소 폭 320(`max(320px, 28dvw)`, `buzz-canvas` 폭 규칙). 칩이 들어가면 입력창이 box가 되어 글자와 칩이 도구 위에서 줄바꿈된다 |

재사용(2026-11-01 user 검수): 새로 그리지 않고 출하 단위를 쓴다. 대화 드롭다운 = Overview `conv-menu`·`conv-item`·`cv-head`. 스레드·입력창·추천 칩(`ov-suggestions`·`suggestion`, quiet 버튼)·알림·표시 = Overview·buzz-conversation. 세션 이어 가기 선택 = 온보딩의 선택 카드(`ob-choice-list`·`doan-panel ob-choice`, 숨긴 radio). 시작·전송 거절 = 입력창 아래 `composer-reason docked-reason`. 빈 본문 = Overview 오른쪽 패널의 `rp-empty`. 새로 만드는 단위는 인라인 앵커 칩(공통 결정 2), 고르기 안내(캔버스 작업 안내 캡슐 재사용), 열기 버튼 새 소식 점(사이드바 슬롯의 안 본 점과 같은 크기·색)뿐이다.

선택 카드 라디오(2026-11-01 user, 공용 선택 카드 변경): 오른쪽 체크 아이콘을 없애고, 그 자리를 카드 왼쪽 위의 보이는 라디오가 대신한다. 라디오는 16px(`--size-icon`) 원이고 제목 첫 줄(`--type-label-sm-line-height`)의 가운데에 맞춘다. 제목이 두 줄이 되어도 라디오는 첫 줄에 남는다. 꺼짐은 `--border-prominent` 테두리와 `--surface-panel` 채움, 켜짐은 `--affordance-prominent` 채움과 6px(`--space-1h`) `--text-on-prominent` 점(체크박스 `doan-checkbox`와 같은 색). 숨긴 native radio·카드 포커스 외곽선·Enter 고르기는 그대로다. 이 변경은 이 화면만이 아니라 `ob-choice`를 쓰는 모든 곳(온보딩 Your projects, Add Projects의 폴더 안 저장소)에 반영한다.

모델·effort(2026-11-01 user 질문에 대한 답, 출하된 `dockedPicker` 규칙): 기존·보관 대화는 공급자를 바꿀 수 없어 그 공급자의 모델만 고를 수 있고, 트리거 접근 이름에 공급자가 붙는다("Model: Opus 5.5 (Claude Code)"). effort는 그 모델의 단계만. 새 대화는 Home과 같은 공급자 선택기와 Settings 기본값. 터미널 세션 이어 가기는 모델·effort·첨부를 받지 않는다. 모양은 같게 두고 고를 수만 없게 한다: 같은 xs 트리거, chevron 없음, `aria-disabled`, 툴팁 "Set in your terminal"(2026-11-01 user).

## 1. 영향 범위

- **renderer**
  - 캔버스 대화 호스트: Overview의 `overviewRun.ts`·`dockedSupport.ts`·`overviewConversation.ts`가 하는 일(목록 읽기, 대화 고르기, 시작·전송·대기열·복원·초안·본 것)을 캔버스 하나에 맞춘 호스트로 둔다. 공통 부분은 함수로 나누고, 프로젝트 대화와 캔버스 대화만 다른 부분(어떤 대화가 대상인지, 새 대화의 시작 모드)을 분기한다. 새 파일 이름은 구현에서 정한다(예: `canvasRun.ts`).
  - 대화 패널: `buzz-canvas`의 껍데기 본문을 스레드·입력창으로 바꾸고, 헤더 제목을 드롭다운 트리거로 바꾼다(Overview 헤더의 `projectConversationMenu`·`conv-menu` 재사용).
  - 칩 필드: `ComposerParts.tsx`의 `ComposerField`를 칩을 담는 필드로 바꾼다. 인터페이스 `{text, anchors}`는 그대로이고(ARCHITECTURE §7 'Renderer primitives'), Home·Overview의 입력창도 같은 필드를 쓴다(그쪽에는 칩을 넣는 길이 없을 뿐).
  - 피커와 도구: 입력창의 피커 버튼, 도구모음의 Add to conversation, 캔버스 고르기 상태(`CanvasController`가 다음 클릭을 칩으로 돌려주는 한 번짜리 모드, 빈 곳 클릭은 점 앵커).
  - 칩 locate: 보낸 메시지 칩의 대상 찾기와 뷰 이동·강조. 지금 코멘트 locate(`CanvasController.locate`, `locateView`)를 칩용으로 옮겨 쓴다.
  - 상태줄: 캔버스 페이지에서 `ConversationStripView`를 그리지 않는다.
  - 열기 버튼 새 소식 점: `buzz-canvas`가 만든 Show conversation 버튼에 점과 접근 이름을 더한다.
  - 코멘트 제거: `CommentsPanel.tsx`, `CommentPins.ts`, `ReviewBar.tsx`, `HandOffDialog.tsx`, `useComments.tsx`, `CommentsSession.ts`, `commentAnchors.ts`와 테스트, `App.tsx`의 연결, `CanvasController`의 핀·코멘트 경로, 초안 가드(`setCommentDraftGuard`, `comments:transition`).
- **preload·main**
  - 앱 전용 코멘트 IPC(`comments:*`, `app/src/main/comments/`의 앱 쪽 서비스)와 Quit의 코멘트 가드를 지운다(2026-11-01 user). 코멘트 파일 형식과 CLI가 쓰는 Go 코드는 그대로다.
  - 대화 IPC는 바뀌지 않는다. 캔버스 대화 시작은 기존 `startConversation`(`mode: "new"`, `canvas`), 이어 가기는 `sendConversation`, 터미널 세션은 `conversationResumeTarget`과 `mode: "resume"`이다.
  - 메뉴: Go > Next/Previous Resolved Comment를 지운다(`menuState` `resolvedNav`).
- **CLI·스킬·형식**: 바뀌지 않는다.

## 2. 상호작용 규칙

### 대화 패널

- 헤더: Overview 오른쪽 패널 제목 줄 자리의 대화 드롭다운. 트리거는 현재 보이는 대화의 제목(새 대화 상태면 "New conversation"), 메뉴는 New conversation → "Conversations on <canvas>" → 이 캔버스의 대화(현재 대화 먼저, 그다음 최근 활동 순, 공급자 로고·제목·상태·시각·한 줄 미리보기). Overview 메뉴(`conv-menu`, `conv-item`)와 같은 행이다.
- 기본으로 보이는 대화: 요청된 대화(Overview 행, 알림 등) → 이 캔버스의 현재 대화 → 새 대화 상태. 보관 대화는 사람이 메뉴에서 고를 때만 보인다.
- 보관 대화: 읽기 상태로 보이고, 입력창 위에 "Sending makes this the canvas's current conversation." 안내가 있다. 보내면 복원(백엔드 restore)이다.
- 본 것: 패널이 펴져 있고, 창이 포커스를 가지고, 그 대화가 보일 때 `markSeen`. 접힌 패널, 다른 화면, 창 포커스 없음에서는 기록하지 않는다.
- 상태: 목록 읽는 중(300ms 뒤 "Loading conversation…"), 읽기 실패("Couldn’t read conversations"와 Retry), 대화 하나 읽기 실패(그 대화만 오류)는 Overview와 같다.

### 패널을 여는 규칙 (2026-11-01 user)

- 연다: Overview 캔버스 행, 알림·권한 토스트의 Open, Overview 승격 알림의 Open, 사이드바 슬롯에서 캔버스 대화로 가기, Add to conversation.
- 열지 않는다: 에이전트의 턴 시작, 권한 요청, 턴 종료. 이때는 캔버스 작업 표시와 사이드바 슬롯이 알린다.
- 새 소식 점: 패널이 접혀 있으면 캔버스 헤더의 Show conversation 버튼 오른쪽 위에 accent 점(사이드바 슬롯의 안 본 점과 같은 모양)을 둔다. 조건은 이 캔버스의 현재 대화가 답을 기다리거나(`phase: waiting`), 본 적 없는 끝이 있을 때다. 버튼 접근 이름에 "Show conversation, needs your answer" / "Show conversation, new activity"를 더한다. 패널을 펴서 그 대화가 보이면 본 것 규칙대로 사라진다. 일하는 중(`running`)은 캔버스 작업 표시가 알리므로 점을 두지 않는다.

### 칩 필드

- 칩은 인라인 원자다: 커서는 칩 앞뒤에만 서고, Backspace/Delete는 칩 하나를 통째로 지운다. 칩 모양은 공통 결정 2의 "인라인 앵커 칩"(연한 accent 채움 + 진한 accent 글자)이다.
- 칩 이름: 프레임 "<프레임 이름>"(아이콘 Frame), 요소 "<tag> <doan-id>" 또는 `<tag> “<text>”`(최대 40자), 점 "Point in <프레임>"(프레임이 없으면 "Point on canvas"). 전체 대상은 `title`.
- 값: 필드는 `{text, anchors}`를 준다. text의 칩 자리는 `{{n}}`(1부터, 등장 순)이고, 같은 대상을 두 번 넣으면 같은 번호를 쓴다(백엔드는 반복을 허용). 사람이 `{{`나 `}}`를 직접 치면 지금처럼 Send가 막힌다.
- 대기열 합치기와 반환된 초안은 백엔드의 `combineQueued`가 번호를 다시 매긴 `{text, anchors}`를 돌려주므로, 필드는 그것을 칩으로 다시 그린다.
- 붙여넣기는 순수 텍스트만 넣는다. 칩을 복사해 다른 곳에 붙이면 칩 이름 텍스트가 된다.
- IME: 조합 중에는 칩을 넣지 않고 조합이 끝난 뒤 넣는다. 칩 삽입과 capsule↔box 전환에서 필드 요소를 다시 마운트하지 않는다(POSTMORTEM·ARCHITECTURE의 docked 규칙).

### 피커와 Add to conversation

- 입력창 피커("Pick from canvas", 입력창 카드 아래 모델 줄의 왼쪽 끝 xs 아이콘 버튼; 에이전트·effort는 오른쪽, 2026-11-01 user): 누르면 캔버스가 한 번 고르기 상태가 된다. 보드 커서가 십자, 위쪽 가운데에 "Click a frame, an element or an empty spot. Esc to cancel." 안내, hover 후보는 지금 hover 외곽선. 누르면 앵커가 정해지고 칩이 커서 위치에 들어가며 입력창 포커스가 돌아온다. 고르기는 현재 선택·`doan active`를 바꾸지 않는다. Esc·피커 다시 누르기·다른 화면으로 가기는 취소다.
- 빈 곳: 캔버스 문서의 빈 곳이나 보드 여백을 누르면 점 앵커(`point {frameId?, dx, dy}`, 프레임 안이면 그 프레임 기준 offset, 밖이면 보드 기준)다.
- Add to conversation(도구모음, `buzz-canvas`가 만든 `role="toolbar"`에 더함): 현재 선택(프레임·요소)이 있을 때 활성. 누르면 패널을 펴고(접혀 있었으면) 입력창 커서 위치(포커스가 없었으면 끝)에 선택의 칩을 넣고 입력창에 포커스를 준다. 보관 대화가 보이는 중이면 그 입력창에 넣는다.
- 단축키는 두지 않는다(비목표 아님, 초안 뒤 판단).

### 칩 locate

- 보낸 메시지(스레드의 사람 말풍선)와 입력창의 칩을 누르면 대상을 찾아 뷰를 옮기고 1.2초 강조한다(Quick Open 프레임 이동과 같은 하이라이트). 찾는 순서: 요소는 유일한 `data-doan-id` → selector, 프레임은 frame id, 점은 그 프레임의 offset(프레임이 없으면 보드 좌표).
- 찾지 못하면 칩 옆에 "Not in the current canvas"를 잠시 보인다. 다른 캔버스의 대화가 보이는 일은 없다(패널은 열린 캔버스의 대화만).
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
| 캔버스를 찾을 수 없음(`canvas_not_found`: 옮겨져 목록에서 빠짐, ID 중복) | 입력창 대신 `canvasGoneText` 줄 | 캔버스 페이지 자체의 missing·중복 ID 안내를 따른다(`buzz-canvas`·기존 규칙) |
| 대기열 거절(`queue_limit`, `not_running`) | `queue_limit`은 notice, `not_running`은 보내기로 바꿔 다시 시도(기존 규칙) | — |
| 첨부 문제(`attachment_missing`·`attachment_limit`) | 첨부 칩의 이동됨 표시와 notice(기존 규칙) | 칩 지우기 |
| 칩 앵커 문제(`bad_request`가 앵커 때문) | 보내기 전에 막는다: 앵커는 renderer가 `validAnchor`와 같은 상한으로 만들고, 상한을 넘는 selector는 가장 가까운 맞는 조상으로 바꾼다(선택과 같은 규칙) | — |
| 프로젝트 문제(`project_not_open`, missing·not set up·config error) | 입력창 비활성, 이유 줄 "<project> isn’t available. Fix it from its menu in the sidebar." | 사이드바 메뉴 |
| 준비된 에이전트 없음(`no_agent`, 새 대화) | 이유 줄 "No agent is ready to run."과 "Sign in to an agent…" | Settings > Agents |
| 턴 실패(`turn.failed`: `process_exited`·`rate_limited`·`session_in_use`·`unknown` 등) | 스레드의 실패 항목(기존 `threadItems`), 캔버스 작업 표시는 사라짐 | 다시 보내기. 대기열은 반환된 초안으로 입력창에 돌아온다 |
| 사람이 멈춤·로그아웃·앱 재시작으로 끊긴 턴 | 스레드의 중단 항목, 만료된 권한 요청 표시 | 다시 보내기 |
| 권한 요청 답 전송 실패 | 그 권한 항목 아래 오류 줄(기존 Overview 규칙) | 다시 고르기 |
| 캔버스가 로드되지 않음(로딩, 실패, 폭 없음, 목록에 없는 페이지) | 대화는 그대로 쓸 수 있다. 입력창 피커와 Add to conversation은 비활성이고 이유 툴팁 "Pick from canvas isn’t available until the canvas loads." | 캔버스 Reload |
| 칩 대상을 찾지 못함(locate) | 칩 옆 "Not in the current canvas" | — |
| 고르기 중 캔버스가 다시 로드됨 | 고르기 상태를 유지하고 새 문서에 적용 | Esc로 취소 |
| 고르기 중 다른 캔버스·화면으로 이동 | 고르기 취소, 칩 없음 | — |
| 터미널 세션 이어 가기 불가(`conversationResumeTarget`의 `available: false`, 또는 이어 가기 전송이 `session_unavailable`·`session_in_use`) | 연결이 없으면 선택지를 보이지 않는다. 이어 가기 전송이 거절되면 입력창 아래 notice("Couldn’t continue the terminal session: <이유>. Start a new conversation instead.")와 새 계정 연결로 바꾸는 버튼 | 새 대화로 시작 |
| 모델 목록 읽기 실패 | 모델 "Default"(기존 규칙) | — |

## 3. 순수 함수 (`/tdd` 대상)

| 함수 | 파일(안) | 경우 |
|---|---|---|
| 캔버스 대화 고르기 `pickCanvasConversation(list, canvas, requested)` | `canvasConversation.ts` | 요청된 대화, 현재 대화, 없음(새 대화), 보관 대화 요청, 목록 읽기 실패, 옮겨진 캔버스(`sameCanvas`), 승격 직후 |
| 캔버스 대화 메뉴 `canvasConversationMenu(list, canvas, shown)` | 같은 파일 | 현재 먼저·최근 활동 순, 상태(Needs your answer, Working, Finished not seen), 보관 표시, 빈 목록 |
| 패널 열기 판단 `panelOpenFor(trigger)` · 새 소식 점 `openButtonBadge(summary, panelOpen)` | `rightPanelOpen.ts` | 각 진입 경로(열기)와 에이전트 이벤트(열지 않음); 점: 답 대기, 본 적 없는 끝, 일하는 중(없음), 펴져 있음(없음), 보관 대화만 있음(없음) |
| 새 대화 시작 방식 `newConversationMode(resumeTarget, prefs)` | `canvasConversation.ts` | 연결 있음(이어 가기 기본, 새 계정 연결 선택 가능), 연결 없음·`available: false`(새 대화만), 이어 가기 거절 뒤 새 대화로 바꿈 |
| 본 것 판단 `shouldMarkSeen(panelOpen, focused, shown, summary)` | `canvasConversation.ts` | 접힘, 포커스 없음, 보관 대화, 이미 본 seq |
| 칩 직렬화 `toMessage(segments)` · `fromMessage(text, anchors)` | `anchorField.ts` | 등장 순 번호, 같은 대상 반복, 칩 0개, `{{` 직접 입력, 반환된 초안 왕복, `combineQueued` 결과 |
| 칩 이름 `chipLabel(anchor, frames)` | 같은 파일 | 프레임 제목/id, 요소 doan-id/text 40자, 점(프레임 안·밖) |
| 점 앵커 `pointAnchor(click, frames)` | `canvasPicker.ts` | 프레임 안(offset), 겹친 프레임(가장 안쪽), 밖(보드 기준), 유한하지 않은 값 |
| 칩 대상 찾기 `resolveChipTarget(anchor, layout)` | 같은 파일 | doan-id 유일·중복, selector, 프레임 id, 점, 못 찾음 |
| 캔버스 대화 오류 보기 `canvasConversationError(code, mode, provider, project)` | `canvasConversation.ts` | §2 '오류 처리' 표의 모든 코드: Overview와 같은 코드는 같은 문구(`startErrorView`·`dockedRefusal` 재사용), 캔버스 전용(복원 중 busy, 캔버스 로드 안 됨, 피커 비활성 이유), 모르는 코드는 일반 문구 |

## 4. 형식·규칙·결정 영향

- **형식 변경**: 없다. 앵커(`Anchor`)와 `{{n}}`, 대화 IPC, 대화 이벤트 JSONL은 이미 있다. 코멘트 JSON Schema와 파일은 그대로다.
- **규칙(ARCHITECTURE §1, `doan check`)**: 없다.
- **구조 결정**: 앱 코멘트 IPC가 사라진다. 코멘트 본문은 데이터라는 규칙(§2)과 append-only 이벤트는 CLI 쪽에 그대로 남는다. 선택 수명·`doan active`는 바뀌지 않는다. 캔버스 스크립트의 hover·선택 메시지는 그대로 쓰고, 고르기 상태는 renderer가 다음 선택 메시지를 칩으로 가로채는 방식이라 새 캔버스 메시지가 필요한지는 구현에서 확인한다(필요하면 내부 메시지라 형식 아님).
- **제품 결정**: PRODUCT §3 In scope 2(코멘트로 가리킴)와 §4 Loop, §5 항목 1('A canvas conversation cannot be read or continued in the app yet'), 항목 4·5(코멘트 CRUD, Review, Hand Off)가 바뀐다(tasks Z).

## 5. PoC

- **칩 필드와 IME(먼저)**: 지금 입력창은 textarea다. 인라인 칩을 담으려면 contenteditable 필드가 필요하고, 한글 IME 조합, 커서 이동, Backspace, 붙여넣기, capsule↔box 전환에서의 포커스 유지가 알려진 위험이다. tasks P1에서 `.scratch/`의 독립 PoC로 확인한다: 한글 조합 중 칩 삽입 대기, 조합 끝 뒤 칩 삽입, 칩 앞뒤 커서, 칩 단위 삭제, 순수 텍스트 붙여넣기, 마운트 유지. 통과하지 못하면 대안(칩을 입력창 위 줄에 따로 두고 text에 `{{n}}`만)을 사용자에게 묻는다.

## 6. POSTMORTEM에서 온 함정

- **2026-10-26 — late replies (ARCHITECTURE §7 'Late replies')**: start·send 응답이 그 사이의 대화 고르기·New·진입 요청을 덮지 않게 root(여기서는 캔버스) revision을 함께 들고 다닌다.
- **2026-10-25 — Navigation feedback read the previous React snapshot**: 칩 locate와 고르기 상태가 렌더 전 스냅샷을 읽지 않게, 동기 생산자의 상태를 콜백에 넘긴다.
- **2026-10-23 — Hover commands discarded pending selection replies**: 고르기 상태가 선택 seq와 hover seq 두 채널을 섞지 않게 한다. 고르기 클릭은 선택 메시지로 오지만 선택을 바꾸지 않아야 한다.
- **2026-10-30 — Removing a shared dialog class silently disabled two focus guards**: 코멘트 화면을 지울 때 `comments-*` 셀렉터·이름 문자열 검색으로 포커스 가드, 테스트, runtime 지원, 측정 스크립트의 다른 사용처를 찾는다.
- **2026-10-23 — Draft guards changed existing transition timing**: 코멘트 초안 가드를 걷어낼 때 `transition`의 타이밍에 기대던 경로(캔버스 열기, 선택, 이동)가 같은 순서로 동작하는지 테스트로 확인한다.
