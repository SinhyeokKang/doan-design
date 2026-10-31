# buzz-project — design

[spec](./spec.md)의 결정을 구현하는 방법이다. 공용 디자인 언어와 진행 규칙은 부모 [design.md](../buzz-restyle/design.md), 대화 프리미티브와 데이터는 [buzz-conversation design](../buzz-conversation/design.md)을 따른다.

## 0. 초안 요청

- 캔버스: `.doan/canvases/buzz-project.html`, canvas id `buzz-project`. 창 1238×780(LNB 220, Overview 오른쪽 패널 폭은 지금 오른쪽 패널과 같다).
- 프레임:
  - `overview-thread`: 진행 중인 프로젝트 대화(사람·에이전트 메시지, 활동, docked 입력창), 오른쪽 캔버스 목록에 진행 상태가 섞인 행 몇 개.
  - `overview-new`: 새 대화 상태, 추천 칩, 오른쪽 목록 있음.
  - `overview-empty`: 대화도 캔버스도 없는 프로젝트(오른쪽 목록 빈 상태).
  - `overview-dropdown`: 대화 제목 드롭다운 열림(New, 프로젝트 대화 목록, 진행 상태).
  - `overview-list-states`: 오른쪽 목록의 행 상태(권한 요청·작업 중·안 본 종료·없음, 지워진 캔버스, 중복 ID, 썸네일 대기·실패·폭 없음).
  - `overview-promoted`: 보던 대화가 승격된 직후(메인 초기화, 오른쪽 목록 맨 위에 새 캔버스 행).
  - `overview-notice`: 중복 ID 알림이 메인 위에 있는 상태.
  - `overview-narrow`: 960×600 창.
- 스레드·docked 입력창은 `buzz-conversation.html`의 보드를 그대로 쓴다. 이 초안에서는 다시 정하지 않는다.
- 셸(헤더, LNB)은 출하된 화면을 복사한다.

초안 round 1(2026-10-31)에서 그린 것. 사용자 확인 전이다.

- 문구
  - 새 대화 placeholder: "Ask or describe what to design, / for presets". 질문만이 아니라 그리기 요청도 받는 칸이라서다(clarify).
  - 기존 대화 placeholder: "Reply, / for presets".
  - 오른쪽 패널 제목: "Canvas conversations".
  - 오른쪽 빈 상태: "No canvas conversations yet." + "When a conversation draws or edits a canvas, the canvas shows here."
  - 드롭다운: "New conversation", 머리 "Conversations in <project>".
- 오른쪽 행
  - 썸네일 72×48(모서리 `radius-toolbar-icon`) 옆 첫 줄: 현재 대화의 공급자 로고(14px, 이름은 alt), 캔버스 이름, 상태 표시(LNB 슬롯과 같은 모양), 마지막 활동 시각(오른쪽 끝에 붙임, 짧은 표기: now, 3m, 1h, 1d, 그 뒤로는 날짜). 그 아래 미리보기 두 줄.
  - 행 사이는 행 안쪽 여백만큼 들인 1px `border-standard` 구분선이다. hover한 행의 위아래 구분선은 감춘다.
  - 열 수 없는 행 문구: "No longer in <project>."(buzz-conversation 표시 줄과 같은 말), "2 canvases use this ID — run doan check", "Can’t read this canvas — run doan check". 
- 메인: 대화 열 최대 720px, 패널 안쪽 24px. 헤더 제목은 `sm` trigger 버튼이다.
- 메뉴 폭 360px, 오른쪽 패널 280px(출하 값)은 컴포넌트 상수다.

## 1. 영향 범위

| 영역 | 바뀌는 것 |
|---|---|
| renderer | `ProjectOverview.tsx`를 대화 화면으로 다시 만든다(메인 스레드, 헤더 드롭다운, 오른쪽 캔버스 목록). `RightPanel.tsx`의 Overview 자리를 Feedback에서 캔버스 목록으로 바꾼다. Overview에서 상태줄을 감춘다. `FeedbackPanel.tsx`·`feedbackGroups.ts`와 Overview 카드·FirstPrompt 사용처를 지운다(쓰는 곳이 남지 않을 때만) |
| restore | `UiState`에 root별 마지막 프로젝트 대화(`shellProjects[root].conversation`)를 선택 필드로 더한다 |
| main | 없음. 대화 목록·알림·markSeen은 buzz-conversation의 것을 쓴다. Overview에서 더 이상 쓰지 않는 `comments:project` 읽기는 캔버스 페이지가 쓰는 동안 그대로 둔다 |
| CLI·스킬·`doan check`·저장소 형식 | 없음 |

## 2. 화면 구성

### 2.1 메인

- **헤더**(메인 패널 위쪽 줄): 대화 제목 드롭다운.
  - 제목은 대화 title이고, 새 대화 상태에서는 "New conversation"이다.
  - 메뉴: 맨 위에 New, 그 아래 프로젝트 대화(최근 활동순). 행마다 title, 진행 상태 표시(슬롯과 같은 순서와 모양), 마지막 활동 시각.
  - 메뉴는 공용 `doan-menu`를 쓴다.
- **스레드**: `ConversationThread`. 스크롤·로딩·읽기 실패는 프리미티브 규칙을 따른다.
- **입력창**: `DockedComposer`. 기존 대화면 기존 대화 모드, 새 대화 상태면 새 대화 모드다. placeholder는 이 자식이 정한다(clarify로 문구를 정한다).
- **새 대화 상태**: 스레드 자리에 추천 칩이 입력창 바로 위에 왼쪽 정렬로 놓인다. 칩은 Home의 `suggestedPrompts`를 쓴다. 다른 장식은 없다.
- **알림**: 중복 ID 알림은 메인 헤더 아래에 공용 notice로 보인다.

### 2.2 오른쪽 패널 (캔버스 목록)

- 목록은 대화가 있는 캔버스만 담는다. 순서는 그 캔버스 대화들의 마지막 활동 최신순이다.
- **행**: 썸네일(작게), 캔버스 이름, 그 캔버스 현재 대화의 미리보기와 진행 상태. 캔버스마다 현재 대화 하나만 대표하고 펼치지 않는다(2026-10-31 user).
- **미리보기**(2026-10-31 user): 이름 아래 두 줄까지(caption, subtle, 두 줄 넘으면 말줄임). 내용은 상태에 따라 다르다.
  - 응답 대기: "Needs your answer: <권한 요약>".
  - 실행 중: 마지막 활동 요약.
  - 그 밖: 에이전트의 마지막 답을 Markdown 기호를 걷어낸 일반 텍스트로.
  - 이 값은 buzz-conversation의 목록 요약에 `preview` 필드로 받는다. main이 fold에서 만들고 길이를 자른다.
  - 행을 누르면 캔버스를 연다. 지금 열기 경로와 draft 보호를 그대로 쓴다.
  - 지난 대화는 캔버스에서 연다(C12의 보관 대화 버튼).
- **썸네일**: 지금 `ThumbnailRequests`의 보이는 행 우선 캡처를 그대로 쓴다. 썸네일 틀은 항상 자리를 지킨다. 준비된 미리보기가 없으면(대기, 캡처 실패, `doan:width` 없음, 읽기 실패, 사라진 캔버스) 빈 스타일(inset 채움, 글리프 없음)을 보이고 이유는 글자로 쓰지 않는다. 접근 이름만 "Preview loading" 또는 "Preview unavailable"이다(2026-10-31 user).
- **열 수 없는 행**: 지워진 캔버스, 중복 ID, 읽기 실패는 이유를 한 줄로 보이고 누를 수 없다.
- **빈 상태**: "No canvas conversations yet."(clarify로 문구를 정한다).
- **키보드**: 목록은 `role="list"`의 행 버튼이다. Tab으로 들어오고, ↑/↓와 Home/End로 행을 옮기고, Enter로 캔버스를 연다.

### 2.3 기본 대화와 기억

- Overview를 열 때 `pickOverviewConversation`이 고른다. 순서는 ui-state의 마지막 대화(아직 프로젝트 대화일 때), 가장 최근 활동한 프로젝트 대화, 새 대화 상태다.
- Home Send가 넘겨주는 대화 id가 있으면 그것을 고른다.
- 대화를 고르거나 보낼 때 ui-state의 root별 기억을 바꾼다.
- **`markSeen`**: 메인에 그 대화가 보이고 창이 포커스를 가질 때 부른다(buzz-conversation §2.1의 호스트 규칙).

### 2.4 승격과 바뀌는 목록

- 목록 알림(`conversation:listChanged`)을 받으면 대화 목록을 다시 읽는다. 보고 있던 대화가 `canvas`를 갖게 되면(승격) 메인을 새 대화 상태로 바꾸고 ui-state 기억을 지운다.
- 입력창에 쓰던 초안은 새 대화 초안으로 옮기지 않고 그 대화 id에 남긴다. 그 대화는 이제 캔버스 대화라서 C12에서 이어 쓴다.

## 3. 순수 함수 (`/tdd` 대상)

| 함수 | 고정할 것 |
|---|---|
| `pickOverviewConversation(list, remembered, handoff)` | 결정 5의 순서, 승격·지워진 대화 건너뛰기 |
| `projectConversationMenu(list)` | 프로젝트 대화만, 최근 활동순, 상태 표시, 승격된 대화 없음 |
| `canvasConversationRows(list, canvasRows)` | 현재 대화가 있는 캔버스만, 캔버스당 현재 대화 하나, 마지막 활동순, 상태별 미리보기 선택, 지워진 캔버스·중복 ID·읽기 실패 |
| `overviewAfterListChange(current, list)` | 승격이면 새 대화 상태, 보관·지워짐 처리 |
| `ui-state` 선택 필드 검증 | 알 수 없는 값 버리기, 저장된 root 밖 버리기 |

## 4. 형식과 결정 영향

- **형식**: ui-state에 선택 필드 하나를 더한다. 이전 앱은 저장할 때 그 필드를 버릴 수 있다(ARCHITECTURE §7 'Shell memory'와 같은 정책). JSON Schema·CLI·저장소 형식은 바뀌지 않는다.
- **규약**: ARCHITECTURE §1과 `doan check`는 바뀌지 않는다.
- **PRODUCT §5 항목 3**: Overview 문단(카드, 코멘트 수, FirstPrompt, Feedback 절 전체)을 현재 규칙으로 바꾼다. 캔버스 이동·삭제 때 Overview로 돌아오는 규칙과 중복 ID 알림은 유지한다.
- **PRODUCT §5 항목 1**: Home Send 뒤 Overview가 그 대화를 연다는 것과 Overview에 상태줄이 없다는 것을 적는다.
- **구조 결정**: 서빙 범위, sandbox iframe, append-only, 토큰·git 작업 없음은 건드리지 않는다.

## 5. PoC 의존

없다. 데이터와 프리미티브는 buzz-conversation이 먼저 만든다.

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
