# buzz-project — spec

`buzz-restyle`의 자식 7번이다. 프로젝트 Overview를 **프로젝트 대화 화면**으로 바꾼다([부모 spec 표 7번](../buzz-restyle/spec.md#자식-feature), [부모 '프로젝트 Overview 방향'](../buzz-restyle/spec.md)). 대화 스레드, `docked` 입력창, 대화 목록 데이터는 선행 자식 [`buzz-conversation`](../buzz-conversation/spec.md)이 만든다. 이 자식은 그것을 Overview에 배치하고, 화면 대조(`/design-sync`)와 빌드한 앱의 실제 확인을 처음으로 한다. 프로젝트→캔버스 LNB와 Overview 진입점은 buzz-shell 결과를 그대로 쓴다.

## 사용자

- **사람(앱 사용자)**
  - 프로젝트를 고르면(LNB 프로젝트 메뉴의 Overview, Home에서 보낸 직후, 알림·토스트의 Open) 그 프로젝트의 대화가 메인에 보인다. 질문하거나 아이데이션을 이어 갈 수 있다.
  - 메인 헤더에서 현재 프로젝트를 확인하고, 워크트리가 둘 이상이면 브랜치 칩으로 바꾸고, 대화 제목 드롭다운에서 프로젝트 대화를 고르거나 새로 시작한다(⌘N).
  - 오른쪽 패널에서 대화가 있는 캔버스를 최근 대화순으로 보고, 진행 상태(권한 요청·작업 중·안 본 종료)를 확인한다. 캔버스마다 현재 대화 하나만 나온다. 캔버스 대화는 항상 캔버스로 연다.
  - 보던 대화가 기존 캔버스를 고쳐 승격되면 Overview는 새 프로젝트 대화 상태로 돌아가고, "<title> moved to <canvas>." 줄과 Open이 남는다. 쓰던 초안은 새 대화로 옮겨진다.
- **에이전트**: 바뀌는 것이 없다. 프로젝트 대화로 받는 요청과 데이터 경계는 buzz-conversation이 정한다.

## 문제 (관찰된 사실)

1. **Overview가 캔버스 카드 목록이다.** 폴더별 카드(썸네일, 제목·파일, 프레임 수, 최근 변경, 열린 코멘트, "N resolved to review")와 오른쪽 Feedback 패널을 보인다(PRODUCT §5 항목 3).
   - 프로젝트에 대해 묻거나 아이데이션하는 대화를 둘 곳이 없다.
   - Home에서 보내면 Overview로 넘어오지만, 그 대화는 임시 상태줄로만 보인다(PRODUCT §5 항목 1).
2. **Home과 Overview의 추천이 어긋난다.** Home은 `.doan/canvases/`만 화면 초안으로 세어 추천한다. Overview는 `.doan/ds/` 섹션을 보이고, 캔버스가 없을 때 FirstPrompt를 보인다(부모 spec 표 7번).
3. **코멘트는 걷어낼 예정이다**(부모 결정, 2026-10-31 user). Overview의 Feedback 패널과 카드의 코멘트 수는 그 흐름과 맞지 않는다.

## 결정 (2026-10-31 user)

1. **배치**: 메인은 프로젝트 대화 스레드와 하단 `docked` 입력창, 오른쪽 패널은 캔버스 목록이다(사용자가 공유한 Aside 스크린샷 구조).
   - 입력창이 하단에 붙은 대화 화면이라 빈 대화라도 Home(가운데 `hero` 입력창, Doany, 인사말, 그라디언트)과 구분된다.
   - Overview에는 Doany, 인사말, 그라디언트를 쓰지 않는다.
2. **헤더**: 현재 프로젝트(썸네일, 이름, 브랜치 칩), "/", 대화 제목 드롭다운이다.
   - 드롭다운은 New와 프로젝트 대화(캔버스에 묶이지 않은 대화) 목록을 담는다. File > New Conversation(⌘N)도 Overview가 보일 때 New와 같다.
   - 워크트리가 둘 이상이면 브랜치 칩이 워크트리 선택이다. 프로젝트 메뉴의 Overview와 같은 동작이라, 그 워크트리의 Overview를 열고 Back/Forward에 워크트리 방문을 남긴다. 입력창에는 워크트리 선택이 없다.
   - 대화를 바꾸는 것은 Back/Forward에 남기지 않는다(프레임 점프와 같은 규칙).
3. **오른쪽 패널**: Feedback 패널 대신 **현재 대화가 있는 캔버스만** 최근 대화순으로 보인다.
   - 행은 썸네일, 첫 줄(공급자 로고, 캔버스 이름, 진행 상태, 오른쪽 끝의 짧은 시각), 현재 대화의 마지막 내용 미리보기(두 줄까지)다.
   - 캔버스마다 현재 대화 하나만 대표한다. 행을 펼치지 않는다. 지난 대화는 캔버스에서 연다(`buzz-canvas-conversation`의 보관 대화 버튼).
   - 대화가 없는 캔버스는 LNB에서 찾는다.
   - 지워진 캔버스의 행은 그 대화에 일이 남은 동안(실행 중·응답 대기·안 본 종료)만 보인다. 읽을 수 없는 캔버스의 행은 LNB처럼 열 수 있다.
4. **캔버스 대화는 항상 캔버스로**: 오른쪽 목록의 캔버스 행을 누르면 그 캔버스를 연다. 캔버스 페이지의 대화 패널은 `buzz-canvas-conversation`(C12)이 만든다. 그전까지는 캔버스 대화를 화면에서 읽거나 이어 갈 수 없고, 캔버스 페이지에는 지금의 임시 상태줄만 남는다.
5. **기본 대화**: Overview를 열면 다음 순서로 고른다.
   - 요청된 대화(Home Send, 권한 토스트·알림의 Open, "Open the running conversation"). 프로젝트 대화면 그 대화, 캔버스 대화면 그 캔버스를 연다.
   - 이 기기에서 그 root로 마지막에 본 프로젝트 대화. 그 사이 승격됐으면 새 대화 상태.
   - 없으면 가장 최근에 활동한 프로젝트 대화.
   - 그것도 없으면 새 대화 상태.
6. **승격 뒤**: 보고 있던 프로젝트 대화가 기존 캔버스를 고쳐 승격되면, 메인은 새 프로젝트 대화 상태로 초기화된다(buzz-conversation 결정 12).
   - 쓰던 초안(조합 중인 글자 포함)은 새 대화 초안으로 옮기고 입력창 포커스를 유지한다.
   - 메인에 "<title> moved to <canvas>."와 Open을 한 줄로 보인다. 보내거나 New·다른 대화를 고르면 사라진다.
   - 새 캔버스를 만든 턴은 지금 규칙대로 턴 도중 그 캔버스를 자동으로 연다. Overview에서 보고 있었어도 같다.
7. **빈 대화의 추천**: Home 추천과 같은 기준과 조건(`suggestedPrompts`, 준비된 에이전트와 정상 프로젝트, 프리셋 목록)으로 고른 추천을 입력창 위에 보인다. 칩은 입력창만 채우고 사람이 보낸다.
8. **FirstPrompt 삭제**: Overview 빈 상태가 유일한 사용처라 FirstPrompt를 통째로 지운다. 카드, 대기, 복사 채널, 문장 생성, `newDesign`의 `subject` 경로가 대상이다. 부모 공통 결정 10의 buzz-ds 공유 요소라 사용자 확인을 받았다.
9. **Feedback 패널과 캔버스 없는 코멘트**: Overview의 Feedback 패널과 그 읽기(`comments:project`)를 지운다.
   - 캔버스 없는 코멘트는 코멘트 제거 feature 전까지 CLI(`doan comments`, `doan check`)로만 다룬다. 앱의 캔버스 없는 코멘트 보기·Resolve·Reopen·Delete와 그 쓰기 경로를 지운다.
   - 캔버스 Comments의 ID 변경 알림은 Show 버튼을 빼고 `doan check`를 안내하는 문구로 바꾼다.
   - 프로젝트 단위 "N resolved to review" 진입이 사라진다. Review는 캔버스 Comments에서만 들어간다.
   - 캔버스 페이지의 Comments 패널과 Review는 C12가 걷어낼 때까지 그대로다.
10. **상태줄**: Overview에서는 임시 상태줄을 보이지 않는다. 메인이 다른 대화를 보이는 동안 그 root의 다른 프로젝트 대화가 응답을 기다리면 "<Provider> needs your answer in <project>." 토스트를 띄우고, Open은 그 대화를 메인에 연다. 캔버스 페이지에서는 상태줄을 C12까지 그대로 둔다.
11. **본 것**: 프로젝트 대화는 메인에 보이고 창이 포커스를 가질 때만 본 것으로 기록한다. 워크스페이스·Overview를 여는 것만으로는 기록하지 않는다(buzz-conversation의 방문 규칙을 대체). 오른쪽 행으로 캔버스를 열면 그 캔버스의 현재 대화를 본 것으로 기록한다(C12 전까지). 승격으로 메인이 초기화될 때, 그 대화의 턴 끝을 이미 봤으면 승격 표시까지 본 것으로 기록한다.
12. **문제 상태 프로젝트**: 처음부터 문제 상태(폴더 없음, 설정 오류, Not set up)인 프로젝트는 지금처럼 문제 화면과 고치는 방법을 보인다. 열려 있던 Overview가 문제 상태가 되면 지금처럼 상태 줄과 Go Home을 보이고, 스레드는 읽을 수 있게 두되 Send는 Home과 같은 이유 줄("<project> isn’t available. Fix it from its menu in the sidebar.")로 막는다.

## 완료 조건

- **메인 스레드**: Overview 메인에 선택한 프로젝트 대화가 buzz-conversation의 `ConversationThread`와 `docked` 입력창(기존·새 대화 모드)으로 보인다. 목록을 읽는 동안과 읽기 실패 상태가 design §2.5대로 보인다. 확인: 정적 마크업 테스트와 `/runtime-test`.
- **헤더**: 프로젝트, 브랜치 칩, 대화 드롭다운이 보인다. 확인: 정적 마크업 테스트.
  - 워크트리가 둘 이상이면 칩이 메뉴를 열고, 고르면 그 워크트리의 Overview가 열린다. 하나면 읽기 전용이다.
  - 드롭다운은 프로젝트 대화를 최근 활동순으로 보이고, 항목은 오른쪽 행과 같은 모양(로고, 제목, 상태, 짧은 시각, 미리보기 한 줄)이다. 승격된 대화는 목록에 없다. New와 ⌘N은 새 대화 상태로 간다. 새 대화 상태에서는 New가 선택 채움을 가지고, 다시 골라도 초안을 지우지 않는다.
- **기본 대화**: 결정 5의 순서로 고르고, 마지막에 본 대화는 이 기기의 ui-state에 root별로 저장된다. 확인: 순수 함수 테스트, ui-state 읽기·쓰기 테스트.
- **오른쪽 목록**: 현재 대화가 있는 캔버스만 최근 대화순으로 보인다. 확인: 순수 함수 테스트와 정적 마크업 테스트.
  - 행은 썸네일, 첫 줄(공급자 로고, 이름, 현재 대화의 진행 상태, 짧은 시각), 미리보기 두 줄이다.
  - 썸네일이 준비되지 않으면 빈 스타일이다.
  - 행을 누르면 캔버스가 열리고, 그 현재 대화가 본 것으로 기록된다.
  - 지워진 캔버스는 일이 남은 동안만, 중복 ID는 이유와 함께 열 수 없는 행으로, 읽을 수 없는 캔버스는 열 수 있는 행으로 보인다.
  - 비어 있으면 "No canvas conversations yet."과 설명 한 줄이다.
- **승격 뒤 초기화**: 보고 있던 대화가 기존 캔버스 수정으로 승격되면 메인이 새 대화 상태가 되고, 초안·포커스가 유지되고, 이동 알림 줄이 보이고, 그 캔버스 행이 목록 맨 위에 안 본 점 없이 생긴다. 확인: 순수 함수 테스트와 `/runtime-test`.
- **진입점**: Home Send, 권한 토스트·알림의 Open, "Open the running conversation"이 결정 5의 첫 규칙대로 대화를 연다. 확인: 순수 함수 테스트와 `/runtime-test`의 알림 클릭 probe.
- **추천**: 새 대화 상태에서 Home과 같은 추천 규칙과 조건으로 추천을 보인다. `.doan/ds/`만 있는 프로젝트에서도 Home과 같은 추천이 나온다. 확인: 순수 함수 테스트.
- **제거**: Overview 카드 목록, FirstPrompt 전체, Feedback 패널, `comments:project` 읽기, 캔버스 없는 코멘트의 앱 경로, ID 변경 알림의 Show, Overview 상태줄이 사라진다. 쓰지 않게 된 코드와 테스트를 지운다(design §1 목록). 확인: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`.
- **유지**: 캔버스 이동·삭제 때 Overview로 돌아오는 경로, 중복 ID 알림(토스트와 Overview 알림), LNB 진입점, 썸네일 캡처는 그대로 동작한다. 중복 ID 알림은 메인 헤더 아래에 보인다. 확인: 기존 테스트 통과와 `/runtime-test`.
- **화면 대조**: 초안 `.doan/canvases/buzz-project.html`과 `buzz-conversation.html`의 docked·스레드 보드를 빌드한 앱에서 `/design-sync`로 맞춘다.
- **실제 앱 확인**: `/runtime-test`로 확인한다(tasks V2).
  - buzz-conversation에서 넘긴 docked 입력창의 실제 포커스와 한글 조합 유지.
  - 스레드를 띄운 빌드 앱의 CSP(창이 비지 않음, Markdown 렌더링).
- **문서 반영**: 아래 문서가 현재 규칙으로 고쳐졌다(tasks Z1의 grep 목록).
  - PRODUCT §3, §5 항목 0(First prompt), 1, 3, 5(캔버스 없는 코멘트, ID 변경 알림).
  - ARCHITECTURE §2(캔버스 없는 코멘트 쓰기), §3(Overview 카드, 썸네일 큐), §7(FirstPrompt, 프로젝트 코멘트 IPC, UiState).
  - DESIGN.md의 'Design navigation'·'Feedback panel'·'Onboarding'(FirstPrompt)·'Home'(Strip width) 절.
  - 부모 spec 표 7·12번.

## 비목표

- 캔버스 페이지의 대화 패널, 캔버스 대화 읽기·이어 가기, 코멘트 화면 제거. `buzz-canvas-conversation`(C12)이 맡는다. C12는 오른쪽 행에서 들어온 캔버스를 그 현재 대화 탭으로 열고, 본 것 규칙을 "대화 패널이 보일 때"로 바꾼다.
- 대화가 없는 캔버스를 Overview에 보이는 일. LNB가 맡는다.
- 프로젝트 대화 이름 바꾸기, 지우기, 보관하기.
- 터미널 세션을 목록에 넣는 일.
- 캔버스 없는 코멘트를 앱에서 다루는 새 화면. 코멘트 제거 feature 전까지 CLI로만 다룬다.
- 코멘트 CLI·MCP·스킬·포맷의 제거(별도 feature).
