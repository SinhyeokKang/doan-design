# buzz-project — design

[spec](./spec.md)의 결정을 구현하는 방법이다. 공용 디자인 언어와 진행 규칙은 부모 [design.md](../buzz-restyle/design.md), 대화 프리미티브와 데이터는 [PRODUCT §5 항목 1 'Project conversations'](../../PRODUCT.md#5-mvp)과 [ARCHITECTURE §7 'Agent conversation runtime and IPC'](../../ARCHITECTURE.md#agent-conversation-runtime-and-ipc)를 따른다. 호스트가 연결할 것은 §8에 있다.

## 0. 초안 요청

- 캔버스: `.doan/canvases/buzz-project.html`, canvas id `buzz-project`. 창 1238×780(LNB 220, Overview 오른쪽 패널 폭은 지금 오른쪽 패널과 같다).
- 프레임:
  - `overview-thread`: 진행 중인 프로젝트 대화(사람·에이전트 메시지, 활동, docked 입력창), 오른쪽 캔버스 목록에 진행 상태가 섞인 행 몇 개.
  - `overview-new`: 새 대화 상태, 추천 칩, 오른쪽 목록 있음.
  - `overview-empty`: 캔버스는 있지만 대화가 없는 프로젝트(오른쪽 목록 빈 상태).
  - `overview-dropdown`: 대화 제목 드롭다운 열림(New, 프로젝트 대화 목록, 진행 상태).
  - `overview-worktrees`: 헤더 브랜치 칩의 워크트리 메뉴 열림.
  - `overview-list-states`: 오른쪽 목록의 행 상태(권한 요청·작업 중·안 본 종료·없음, 지워진 캔버스, 중복 ID, 썸네일 대기·실패·폭 없음).
  - `overview-promoted`: 보던 대화가 기존 캔버스 수정으로 승격된 직후(메인 초기화, 이동 알림 줄, 오른쪽 목록 맨 위에 그 캔버스 행).
  - `overview-notice`: 중복 ID 알림이 메인 위에 있는 상태.
  - `overview-narrow`: 960×600 창.
- 스레드·docked 입력창은 `buzz-conversation.html`의 보드를 그대로 쓴다. 이 초안에서는 다시 정하지 않는다.
- 셸(헤더, LNB)은 출하된 화면을 복사한다.

초안에서 정한 것. 사용자가 2026-10-31에 디자인을 확정했다(프레임 9개, `overview-worktrees` 포함).

- 문구
  - 새 대화 placeholder: "Ask or describe what to design, / for presets". 질문만이 아니라 그리기 요청도 받는 칸이라서다(clarify).
  - 기존 대화 placeholder: "Reply, / for presets".
  - 오른쪽 패널 제목: "Canvas conversations".
  - 오른쪽 빈 상태: "No canvas conversations yet." + "When a conversation draws or edits a canvas, the canvas shows here."
  - 드롭다운: "New conversation", 머리 "Conversations in <project>".
- 오른쪽 행
  - 썸네일 72×48(모서리 `radius-toolbar-icon`) 옆 첫 줄: 현재 대화의 공급자 로고(14px, 이름은 alt), 캔버스 이름, 상태 표시(LNB 슬롯과 같은 모양), 마지막 활동 시각(오른쪽 끝에 붙임, 짧은 표기: now, 3m, 1h, 1d, 그 뒤로는 날짜). 그 아래 미리보기 두 줄.
  - 행 안쪽 여백은 위아래 12, 좌우 8이다.
  - 행 사이는 행 안쪽 여백만큼 들인 1px `border-standard` 구분선이다. hover한 행의 위아래 구분선은 감춘다.
  - 특별한 행 문구: "No longer in <project>"(`ConversationThread.tsx` 승격 표시 줄과 같은 말), "2 canvases use this ID — run doan check", "Can't read this canvas — run doan check"(LNB 출하 문자열).
- 메인: 대화 열 최대 720px, 패널 안쪽 24px. 헤더 제목은 `sm` trigger 버튼이다.
- 메뉴 폭 360px, 오른쪽 패널 280px(출하 값)은 컴포넌트 상수다.

## 1. 영향 범위

| 영역 | 바뀌는 것 |
|---|---|
| renderer | `ProjectOverview.tsx`를 대화 화면으로 다시 만든다(헤더, 메인 스레드, 오른쪽 캔버스 목록). `RightPanel.tsx`의 `feedback` 자리를 캔버스 목록으로 바꾼다. Overview에서 상태줄을 감춘다. 썸네일 코드(`thumbnailView`, `ThumbnailRequests`, `useThumbnails`)는 자기 모듈로 옮겨 남긴다 |
| renderer 삭제 | `FeedbackPanel.tsx`, `feedbackGroups.ts`, `overviewOrder.ts`(`focusAfterRemoval`을 목록에 다시 쓰면 남김), Overview 카드와 `cardFacts`, `ChangedTime`·`PathTip`(다른 사용처가 없으면), `useProjectComments`·`countedRoots`·`ProjectCommentReads`, `OrphanSession`과 `showOrphans`·`reveal`·`comments.orphanIntent`, FirstPrompt 전체(`FirstPrompt.tsx`, `firstPromptView.ts`의 `newCanvasText` 말고, `useFirstPromptWait`·`FirstPromptContext`, `firstPrompt/`), 관련 테스트(`FeedbackPanel*.test`, `feedbackGroups.test`, `FirstPrompt.test`, `firstPromptView.test`, `firstPromptWait.test`, `ProjectOverview.test`의 카드) |
| main·preload 삭제 | `comments:project` 처리와 `main/projectComments.ts`, 캔버스 없는 코멘트 쓰기(`comments:orphan-mutate`·`orphan-status`), `onboarding:first-prompt`·`copyFirstPrompt`, `promptSentence.ts`, `newDesign`의 `subject` 경로(`conversation/ipc.ts`, `service.ts`), 그 preload 메서드와 `senderAllowed` 항목 |
| renderer 변경 | 캔버스 Comments의 ID 변경 알림에서 Show를 빼고 문구를 바꾼다. File 메뉴에 New Conversation(⌘N)을 더한다(main 메뉴) |
| restore | `UiState`에 최상위 선택 필드 `conversationByRoot: Record<root, conversationId>`를 더한다 |
| CLI·스킬·`doan check`·저장소 형식 | 없음. 캔버스 없는 코멘트는 CLI로 계속 다룬다 |

## 2. 화면 구성

### 2.1 헤더

- 현재 프로젝트(LNB와 같은 썸네일과 이름), 브랜치 칩, "/", 대화 제목 드롭다운 순서다. 좁은 창에서는 대화 제목이 먼저 줄어든다.
- **브랜치 칩**: 등록된 워크트리가 둘 이상이면 워크트리 선택 버튼이다. 메뉴는 LNB 프로젝트 메뉴의 `.shell-worktree` 행을 그대로 쓴다. 고르면 `showShellOverview(root)`를 부른다. 그래서 전환 보호를 지나고, Back/Forward에 워크트리 방문을 남기고, LNB의 선택 워크트리도 바뀐다. 문제·로딩 중인 워크트리 행은 LNB와 같이 처리한다. 워크트리가 하나면 읽기 전용 칩이다. 입력창에는 워크트리 선택을 두지 않는다. 대화는 시작한 워크트리에 묶이기 때문이다.
- **대화 드롭다운**: 제목은 대화 title이고, 새 대화 상태에서는 "New conversation"이다.
  - 메뉴: 맨 위에 New conversation, 그 아래 "Conversations in <project>"와 프로젝트 대화(최근 활동순). 항목은 오른쪽 캔버스 행과 같은 컴포넌트로 그린다(첫 줄: 공급자 로고, 제목, 진행 상태, 짧은 시각 / 둘째 줄: 미리보기 한 줄). 항목 사이에 구분선, 보이는 대화는 선택 채움(`affordance-backdrop-pressed`).
  - `menuitemradio`와 `aria-checked`, ↑/↓, Home/End, 제목 typeahead, 최대 높이를 넘으면 메뉴 안에서 스크롤한다. 긴 제목은 말줄임이고 접근 이름에 전체 제목이 있다.
  - 대화를 고르거나 New를 고르면 Back/Forward에 남기지 않는다.
  - New와 ⌘N: 새 대화 상태로 간다. 이미 새 대화 상태면 아무것도 바꾸지 않는다. ui-state 기억은 지운다.
  - 읽을 수 없는 대화(`readError`)는 index의 제목과 미리보기 자리에 "Can’t read this conversation"을 보인다. 고르면 스레드 읽기 실패 노티스(Retry)가 보인다.

### 2.2 메인

- **스레드**: `ConversationThread`. 스크롤·로딩·읽기 실패는 프리미티브 규칙을 따른다.
- **입력창**: `DockedComposer`. 기존 대화면 기존 대화 모드, 새 대화 상태면 새 대화 모드다.
  - placeholder: 새 대화 "Ask or describe what to design, / for presets", 기존 대화 "Reply, / for presets". 프리셋 칩만 있으면 Home과 같은 "Which canvas or screen? Add details…".
- **새 대화 상태**: 스레드 자리에 추천 칩이 입력창 바로 위에 왼쪽 정렬로 놓인다. 칩은 Home의 `suggestedPrompts`를 쓰고, Home과 같이 준비된 에이전트와 정상 프로젝트일 때만, 프리셋 목록을 읽어서 보인다.
- **승격 알림**: 승격으로 초기화된 새 대화 상태에서 추천 위에 "<title> moved to <canvas>."와 Open(그 캔버스 열기)을 한 줄로 보인다. 보내거나 New·다른 대화를 고르면 사라진다.
- **알림**: 중복 ID 알림은 메인 헤더 아래에 공용 notice로 보인다.

### 2.3 오른쪽 패널 (캔버스 목록)

- 목록은 현재 대화가 있는 캔버스만 담는다. 대화의 `canvas`와 목록 행은 `sameCanvas` 규칙(어느 쪽이든 ID가 있으면 ID, 없으면 경로)으로 맞춘다. 순서는 **현재 대화**의 `lastActivityAt` 최신순이고, 같으면 캔버스 경로순이다.
- **행**: 썸네일, 첫 줄(공급자 로고, 캔버스 이름, 현재 대화의 진행 상태, 오른쪽 끝 짧은 시각), 미리보기 두 줄.
  - 진행 상태 표시는 LNB 슬롯과 같은 원천(`slotsFromList`)에서 만든다. 둘이 렌더 사이에 어긋나지 않게 하기 위해서다.
  - 미리보기는 목록 요약의 `preview`다(`app/src/main/conversation/summary.ts`, ARCHITECTURE §7 'List and seen').
  - 짧은 시각은 `shortAgo(at, now)`: now, 3m, 1h, 1d, 그 뒤로는 날짜("Oct 28"). 접근 이름은 풀어 쓴다("3 minutes ago").
  - 상태 표시의 접근 이름: "Needs your answer", "Working", 안 본 종료는 "Finished, not seen".
- **열기**: 행을 누르면 `openShellCanvas(root, row)`로 캔버스를 연다(전환 보호, 방문 기록, 경로·id 재확인). 그 캔버스의 현재 대화에 `markSeen`을 부른다. 지난 대화는 캔버스에서 연다(C12).
- **썸네일**: `ThumbnailRequests`의 보이는 행 우선 캡처를 쓰되, 목록에 있는 캔버스 행만 넘긴다(전체 캔버스를 캡처하지 않는다). 가시성 관찰은 오른쪽 패널 스크롤러에서 한다. 캡처는 480px 폭이라 72×48 칸에 `object-fit: cover`로 맞춘다. 준비된 미리보기가 없으면 빈 스타일(inset 채움, 글리프 없음)이고, 접근 이름만 "Preview loading" 또는 "Preview unavailable"이다.
- **특별한 행**
  - 지워진 캔버스: 그 대화에 일이 남은 동안만 보인다. "No longer in <project>"이고 열 수 없다(`aria-disabled`, 이유는 `aria-describedby`).
  - 중복 ID: "2 canvases use this ID — run doan check"이고 열 수 없다.
  - 읽을 수 없는 캔버스: LNB 문구 "Can't read this canvas — run doan check"(출하 문자열 그대로)를 보이고, 열 수 있다. 캔버스 페이지가 자기 오류를 보인다.
- **빈 상태**: "No canvas conversations yet."과 "When a conversation draws or edits a canvas, the canvas shows here." 패널 폭은 그대로 둔다.
- **키보드**: 목록은 Tab 정지 하나(roving tabindex)다. ↑/↓와 Home/End로 행을 옮기고, Enter로 연다. 열 수 없는 행도 포커스를 받아 이유를 읽을 수 있다. 포커스된 행이 목록에서 빠지면 다음 행, 없으면 이전 행, 없으면 패널 제목으로 간다.
- 패널 영역에만 "Canvas conversations" 이름을 둔다(안쪽 목록에 같은 이름을 겹치지 않는다).

### 2.4 기본 대화, 진입점, 기억

- `pickOverviewConversation(list, remembered, request)`가 spec 결정 5의 순서로 고른다.
  - 요청된 대화가 아직 목록에 없으면 요청을 들고 목록을 다시 읽는다. 기본값으로 떨어지지 않는다.
  - 목록을 읽기 전에는 아무것도 고르지 않는다. 새 대화 상태를 잠깐 보였다가 바꾸지 않는다.
  - 기억한 대화가 승격됐으면 새 대화 상태다.
- **진입점(task R5)**: 다음이 모두 "요청된 대화"를 넘긴다. 프로젝트 대화면 그 root의 Overview를 그 대화로, 캔버스 대화면 그 캔버스를 연다.
  - Home Send(`HomeRun.openConversation`), 권한 토스트·알림(`notificationClick`)의 Open, docked의 `project_busy` "Open the running conversation", LNB 상태 슬롯 클릭.
  - 같은 Overview 안이면 화면을 옮기지 않고 메인 대화만 바꾸고, 그 항목으로 `scrollToItem`한다.
- **기억**: ui-state의 최상위 `conversationByRoot`. 대화를 고르거나 보낼 때 그 root의 값을 바꾸고, New와 승격 때 지운다.
  - 파싱은 기존 `entries(value, saved, …)` 도우미로 하고, 저장된 root 밖과 잘못된 id는 버린다. `savedUiState`에 넣고, root 제거 때 지운다.
  - 시작 복원이 취소되면 지금 `shellProjects`처럼 저장된 값이 다음 저장에서 사라질 수 있다. 같은 세션에서 마지막 대화를 잃는 정도라 받아들인다.
- **본 것(spec 결정 11)**: 메인에 보이는 프로젝트 대화는 창이 포커스를 가질 때 `markSeen`한다. 스크롤을 올린 채 새 내용이 와도 본 것으로 기록한다. 워크스페이스·Overview 진입만으로는 프로젝트 대화를 기록하지 않는다(지금 `homeRun.visit([slotKey(root)])`의 프로젝트 대화 부분을 바꾼다). 오른쪽 행으로 연 캔버스의 현재 대화는 기록한다.

### 2.5 상태와 포커스

- **목록 로딩**: 메인은 스레드와 같은 규칙(300ms 비움, 그 뒤 "Loading conversation…")이다. 제목 버튼은 비활성이다. 오른쪽 패널은 300ms 뒤 "Loading canvas conversations…"(`role="status"`). 입력창은 새 대화 모드로 쓸 수 있다. 다음 root를 읽는 동안 이전 root의 목록을 보이지 않는다.
- **목록 읽기 실패**: 오른쪽 패널과 드롭다운 본문에 "Couldn’t read conversations"와 Retry. 입력창은 새 대화 모드로 쓸 수 있다.
- **문제 상태 프로젝트**: spec 결정 12. 열려 있던 Overview가 문제 상태가 되면 Send는 `project_not_open` 이유 줄로 막고 스레드는 읽을 수 있다.
- **다른 대화의 응답 대기**: 메인이 다른 대화를 보이는 동안 같은 root의 프로젝트 대화가 응답을 기다리면 "<Provider> needs your answer in <project>." 토스트를 띄운다. Open은 그 대화를 메인에 열고 요청으로 스크롤한다.
- **승격 뒤 초기화**: 그 대화의 초안(조합 중 글자 포함)을 새 대화 초안으로 옮기고, 포커스가 입력 칸에 있었으면 그대로 둔다(같은 textarea key라 조합이 끊기지 않는다). 그 대화의 턴 끝을 이미 봤으면 승격 표시까지 `markSeen`한다.
- **포커스**
  - Home Send로 열림 → 입력 칸(지금 상태줄 Stop 대신; `focusCurrent`의 셀렉터를 바꾼다).
  - LNB·프로젝트 메뉴·Back/Forward·시작 복원으로 열림 → 포커스를 옮기지 않는다.
  - 드롭다운에서 대화나 New를 고름 → 입력 칸, 스레드는 맨 아래.
  - 드롭다운·워크트리 메뉴에서 Esc → 그 트리거로.
  - 워크트리를 고름 → 새 Overview의 브랜치 칩.
- **Tab 순서**: 헤더(브랜치 칩, 제목) → 알림 → 스레드 컨트롤(Jump to latest, 활동 토글, Copy, 링크) → 대기 메시지 Remove → 승격 알림 Open → 추천 → 입력창(칸 → Attach → Presets → Send → 모델 → effort) → 오른쪽 목록.

## 3. 순수 함수 (`/tdd` 대상)

| 함수 | 고정할 것 |
|---|---|
| `pickOverviewConversation(list, remembered, request)` | 결정 5의 순서, 목록 전에는 고르지 않음, 요청이 목록에 없으면 기다림, 승격된 기억은 새 대화, 지워진 대화 건너뛰기, 같은 활동 시각 |
| `projectConversationMenu(list, now)` | 프로젝트 대화만, 최근 활동순, 상태, 짧은 시각, 미리보기, `readError`, 승격된 대화 없음 |
| `canvasConversationRows(list, canvasRows, now)` | 현재 대화가 있는 캔버스만, `sameCanvas` 매칭, 현재 대화 활동순(같으면 경로순), 이름이 바뀐·옮겨진 같은 ID, 지워진 캔버스는 일이 남을 때만, 중복 ID, 읽을 수 없는 캔버스는 열 수 있음 |
| `overviewAfterListChange(current, list)` | 승격이면 새 대화 + 알림 + 초안 이동 + 본 것 seq, 다른 root의 알림 무시, 보관·지워짐 |
| `shortAgo(at, now)` | now·m·h·d·날짜 경계, 접근 이름 |
| `conversationByRoot` 파싱 | 필드 없음, 잘못된 값, 저장된 root 밖, root 제거 |
| 목록 키보드 | ↑/↓, Home/End, 열 수 없는 행 포함, 빠진 행 뒤 포커스 |

## 4. 형식과 결정 영향

- **형식**: ui-state에 최상위 선택 필드 하나를 더한다. `shellProjects`는 그룹 키로 묶이고 쓰기마다 필드를 다시 만들어서, 거기에 넣으면 사라진다. 이전 앱은 저장할 때 새 필드를 버릴 수 있다(ARCHITECTURE §7 'Shell memory'와 같은 정책). JSON Schema·CLI·저장소 형식은 바뀌지 않는다.
- **규약**: ARCHITECTURE §1과 `doan check`는 바뀌지 않는다.
- **PRODUCT**: §3(대화 UI 목록, FirstPrompt 문장), §5 항목 0의 'First prompt', 항목 1(Home Send 뒤 Overview, 상태줄, 슬롯·알림 진입점), 항목 3(Overview, Feedback 절 전체), 항목 5(캔버스 없는 코멘트, ID 변경 알림, "Overview then counts every resolve")를 현재 규칙으로 바꾼다. 캔버스 이동·삭제 때 Overview로 돌아오는 규칙과 중복 ID 알림은 유지한다.
- **ARCHITECTURE**: §2의 캔버스 없는 코멘트 쓰기, §3의 Overview 카드와 썸네일 큐("visible Overview cards first"), §7의 'FirstPrompt state'·first-prompt IPC·'Project comments'·'Overview counts'·UiState.
- **구조 결정**: 서빙 범위, sandbox iframe, append-only, 토큰·git 작업 없음은 건드리지 않는다. 캔버스 없는 코멘트 파일은 그대로 남고 CLI가 계속 다룬다.

## 5. PoC 의존

없다. 데이터와 프리미티브는 buzz-conversation이 만들었다(§8).

## 6. POSTMORTEM에서 가져올 함정

- **2026-10-25 Navigation feedback read the previous React snapshot**: 대화 전환과 목록 갱신 직후 이전 대화의 상태를 보이지 않게 한다. 렌더 사이 테스트를 둔다.
- **2026-10-25 Delayed startup restoration replaced newer navigation**: ui-state의 마지막 대화 복원은 사람이 그사이 고른 대화를 덮지 않는다.
- **2026-10-26 The invalidation read overtook the reply**: 목록 알림과 send 응답의 순서를 가정하지 않는다.
- **2026-10-30 Removing a shared dialog class silently disabled two focus guards**: Feedback과 카드 클래스를 지울 때 셀렉터 문자열을 검색한다.
- **2026-10-25 A failed embedded frame suppressed a healthy outer thumbnail**: 썸네일을 작은 행으로 옮겨도 캡처 실패 표시가 정상 썸네일을 가리지 않는다.

## 7. 조사 메모 (부모에서 옮김, 2026-10-31)

공식 문서·README·기사로 확인했고 실제 앱 화면은 보지 않았다. Claude Design 홈 배치는 서드파티 튜토리얼, Cursor Agents Window는 포럼 직원 답변, ChatGPT Projects는 검색 요약만 근거다. 화면 구성의 출발점은 사용자가 공유한 Aside 스크린샷이다. Aside 문서는 확인하지 않았다.

- 상태별 추천: Subframe은 저장소가 연결됐을 때만 "Import my design system…" 같은 starter prompt를 보이고, 누르면 입력창만 채운다([docs](https://docs.subframe.com/agent/overview.md)). Claude Design 관리자 가이드는 디자인 시스템이 없으면 결과가 평범하다고 적는다([support](https://support.claude.com/en/articles/14604406)).
- 대화 목록과 진행 상태:
  - v0는 프로젝트 하나에 채팅 여러 개를 붙이고 채팅 위에 연결된 프로젝트를 보인다([docs](https://www.v0.build/docs/projects)).
  - Conductor는 project → workspace → session 계층이다([docs](https://www.conductor.build/docs/concepts/workspaces-and-branches)).
  - Cursor는 Status로 묶으면 "Needs Attention"에 승인·질문 대기와 안 읽은 완료가 모인다([forum](https://forum.cursor.com/t/agents-approval-window/170388)).
  - Subframe은 실행 중 애니메이션과 안 읽은 완료 점만 쓴다([docs](https://docs.subframe.com/agent/managing-chats.md)).
- 대화에서 산출물로 넘어가기: Lovable은 Chat 모드에서 변경이 필요하면 "Start building" 카드를 띄운다([docs](https://docs.lovable.dev/features/projects/chat.md)).
- 캔버스 상태: Figma Dev Mode와 Doop은 승인 뒤 디자인이 바뀌면 자동으로 "Changed"/"Needs review"가 된다([Figma](https://help.figma.com/hc/en-us/articles/26781702258583), [Doop](https://github.com/kgoedecke/doop/wiki)).

## 8. buzz-conversation에서 받은 것

이 화면이 대화 스레드와 docked 입력창을 처음 놓는다. 두 컴포넌트는 preload를 부르지 않고 props로만 동작한다. 그래서 아래 연결은 모두 호스트인 이 자식이 한다. 규칙의 정본은 PRODUCT §5 항목 1 'Project conversations'와 ARCHITECTURE §7 'Agent conversation runtime and IPC'('List and seen', 'Queue', 'Restore', 'Renderer primitives')다.

- **`DockedComposer`**(`app/src/renderer/DockedComposer.tsx`, props 타입 `DockedComposerProps`, 순수 규칙 `dockedRules.ts`)
  - `mode`: `existing`·`archived`(대화 id와 공급자), `new`(root). archived에서 보내면 복구되고, new에서 보내면 시작(`startConversation`, newDesign)이다. placeholder는 호스트가 넘긴다.
  - `drafts`·`onDrafts`: 초안은 호스트가 `draftKey(mode)`로 들고 있어야 대화 전환·화면 이탈 뒤에도 남는다. 승격 뒤 초안을 새 대화 키로 옮기는 일(§2.5)도 호스트가 한다.
  - 모델: `picker`(호스트의 `modelPickerView`), `auth`, `provider`, `effort`, `onPickerOpen`, `onPickModel`, `onPickEffort`, `onSettings`. existing·archived에서는 컴포넌트가 그 공급자만 남긴다.
  - 프리셋·첨부: `presets`, `suggested`, `onPresetsOpen`, `onPresetsRetry`, `thumbnails`, `onAttach`, `onFiles`, `onAttachmentRemoved`. 칩을 초안에 넣는 일은 호스트가 한다.
  - 상태: `turn`(`idle`·`running`·`waiting`), `busy`(목록에서 만든 `DockedBusy`), `canvasGone`, `queued`.
  - 동작: `onSend` → `sendConversation`(new 모드는 `startConversation`), `onQueue` → `queueConversation`, `onStop` → `interruptConversation`, `onRemoveQueued` → `removeQueuedMessage`, `onOpen`(대화 열기, §2.4 진입점). `onSend`·`onQueue`는 `{ok: true}` 또는 `{error, missing?}`를 돌려준다. 거절 문구는 `dockedRefusal`이 정한다.
- **`ConversationThread`**(`app/src/renderer/ConversationThread.tsx`, props 타입 `ConversationThreadProps`, ref `scrollToItem(key)`)
  - `conversationId`는 필수다. 바뀌면 스크롤, 따라가기, 펼친 활동 줄이 처음부터 시작한다.
  - `items`는 `threadItems(events, root, live)` 결과다. `null`은 로딩, `"error"`는 읽기 실패다. 기록은 `onConversationEvent`를 먼저 구독하고 `readConversation`을 읽어 seq로 합친다.
  - `provider`, `project`, `liveAfter`(이 seq 뒤의 권한 요청만 alert), `canvasListed`.
  - `onOpenLink` → preload `openLink`(https만, main이 다시 확인한다).
  - `onCopy` → 클립보드 쓰기. preload에는 일반 텍스트를 쓰는 클립보드 채널이 아직 없어서, 연결 방법은 이 자식이 정한다.
  - `onAnswer` → `answerConversationPermission`, `onStop`, `onEditAndResend`, `onSignIn`, `onRetry`, `onOpenCanvas`.
- **preload 채널과 오류 코드**(계약은 `app/src/preload/index.ts`의 주석)
  - 목록: `listConversations`, `onConversationListChanged`, `markConversationSeen`. root마다 읽기는 하나만 진행하고, 그동안 온 알림은 끝난 뒤 한 번 더 읽는다. 응답과 알림의 순서는 가정하지 않는다(POSTMORTEM 2026-10-26).
  - 대기열: `queueConversation`, `removeQueuedMessage`, `takeConversationDraft`. 목록 요약에 `returnedDraft`가 있으면 초안을 한 번 가져간다. 첨부는 경로라서 `attachmentsFromPaths`로 다시 발급한다.
  - 복구: 보관 대화에 `sendConversation`. 별도 채널은 없다.
  - 오류 코드: `project_busy`, `busy`(대기열이 나가기를 기다리는 대화에 send, 또는 복구할 캔버스의 현재 대화가 일하는 중), `canvas_not_found`, `not_running`(일하지 않는 대화에 queue — send로 보낸다), `queue_limit`, `stale`, `attachment_missing`과 `missing`, `not_logged_in`, `rate_limited`.
  - 일하는 중 판단은 목록 요약의 `working`으로 한다. `phase`는 기록 기준이라 판정 대기·대기열 대기를 담지 않는다.
- **buzz-conversation이 미검증으로 넘긴 것**
  - docked 입력창의 실제 포커스와 한글 조합 유지. capsule↔box 전환 때 textarea가 다시 마운트되지 않는지, capsule 줄넘김 측정(`scrollHeight > lineHeight × 1.5`)이 실제 `field-sizing: content` 칸에서 맞는지 포함.
  - 빌드한 앱에서 스레드를 띄운 CSP 확인(POSTMORTEM 2026-10-30 'A renderer import of a main module left the built app's window blank').
  - `.doan/canvases/buzz-conversation.html`의 `docked-composer`·`thread-*` 보드와 `/design-sync`. Markdown 목록 기호의 실제 표시도 여기서 본다.