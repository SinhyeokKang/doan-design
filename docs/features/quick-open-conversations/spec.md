# quick-open-conversations — spec

## 사용자

- **사람**(앱에서 보고, 가리키고, 말하는 사람)만 대상이다. 에이전트와 CLI는 바뀌지 않는다.

## 문제

- Quick Open(⌘K)은 저장된 모든 프로젝트와 worktree의 캔버스와 프레임만 찾는다(PRODUCT §5 item 3 'Quick Open'). 대화는 찾지 못한다.
- 지난 대화를 다시 찾는 길은 Overview의 Conversation 메뉴(프로젝트 대화), 캔버스 패널의 제목 메뉴(그 캔버스의 대화), Overview의 Canvas conversations 목록뿐이다. 어느 것이든 프로젝트와 캔버스를 먼저 알아야 하고, 프로젝트를 건너 찾을 수 없다.

## 범위 (사용자 결정, 2026-11-13)

- **검색 대상은 대화 제목뿐이다.** 메시지 본문은 찾지 않는다. 그래서 main이 기록 파일을 새로 읽지 않고, renderer가 이미 가진 대화 목록만 쓴다.
- **현재 대화와 보관된 대화를 모두 찾는다.** 프로젝트 대화와 캔버스 대화를, 저장된 정상 프로젝트와 worktree 전체에 걸쳐 찾는다. 소유자가 Doan이든 legacy external이든 목록에 있으면 찾는다.
- **탭**: All / Canvases / Frames / Conversations. 대화는 Conversations 탭과 All에 나온다.
- **All의 순서**: 대화 제목도 캔버스·프레임과 같은 순위 규칙(일치 점수, 그다음 현재 root → 같은 저장소의 다른 worktree → 다른 저장소)으로 경쟁하고, 결과는 최대 50개에서 프로젝트별로 묶인다.
- **열 수 없는 캔버스 대화는 뺀다.** 캔버스 대화의 캔버스가 그 root에 정확히 하나로 나열되지 않으면(삭제, 프로젝트 밖으로 이동, ID 중복) 결과에 넣지 않는다.
- **목록 상태**: 대화 목록을 아직 읽는 프로젝트는 기존 "Still reading <n> projects…" 줄에 포함한다. 목록을 읽지 못한 프로젝트의 대화는 결과에서 빠지고, 알림은 따로 없다(복구는 그 프로젝트 Overview의 Retry).

## 동작

- 대화 결과 행: 대화 아이콘, 이름은 대화 제목, 설명은 캔버스 대화면 캔버스 이름(파일 stem), 프로젝트 대화면 "Project conversation"이다. 보관된 대화는 설명 끝에 " · Archived"를 붙인다. 이름과 설명은 기존 행처럼 한 줄에서 말줄임표로 끝나고 `title`에 전체 글을 담는다. 접근 이름은 기존 행 규칙(`<이름> — <설명> · <프로젝트>`)을 따른다.
- 빈 검색어의 Conversations 탭: workspace에서는 그 root의 대화, Home에서는 모든 프로젝트의 대화를 최근 활동 순으로 최대 50개 보여 준다. 빈 검색어의 All은 지금처럼 캔버스만 보여 준다.
- 결과를 고르면 Quick Open을 닫고, 대화를 알림이나 strip의 Open과 같은 길로 연다.
  - 캔버스 대화: 그 캔버스를 열고 패널에 그 대화를 보여 준다. 보관된 대화는 메뉴에서 고른 것처럼 보이고, 보내면 복원된다(기존 규칙).
  - 프로젝트 대화: 그 root의 Overview에서 그 대화를 보여 준다.
  - Back/Forward, 선택, 초안은 그 길의 기존 규칙을 따른다. 이미 그 대화를 보여 주는 화면이면 아무것도 바뀌지 않는다.
- 빈 결과 문구:
  - 검색어가 있는 All: "No canvases, frames or conversations match"
  - 검색어가 있는 Conversations: "No conversations match"
  - 탭 하나가 비고 다른 종류에 일치가 있을 때: "<탭 문구>. <n> other results in All." (1개면 "1 other result in All.", 50 초과는 "50+"). 기존 Canvases·Frames 탭 문구 "<n> frames match in All." 등도 이 형태로 바뀐다.
  - 빈 검색어의 Conversations: "No conversations to show"
- 대화 목록이 바뀌면(새 대화, 제목, 보관, 삭제) 열려 있는 Quick Open의 결과도 따라 바뀐다.

## 완료 조건

- 저장된 두 프로젝트에 각각 대화가 있을 때, Home에서 ⌘K로 연 Quick Open에 제목 일부를 입력하면 두 프로젝트의 대화가 각 프로젝트 묶음 안에 나온다(단위 테스트와 실제 앱 확인).
- 보관된 캔버스 대화를 고르면 그 캔버스가 열리고 패널에 그 대화가 보이며, 프로젝트 대화를 고르면 그 root의 Overview에 그 대화가 보인다(실제 앱 확인).
- 캔버스가 목록에 없는 캔버스 대화는 어떤 검색어로도 나오지 않는다(단위 테스트).
- 대화 목록을 읽는 중인 프로젝트는 읽기 줄의 수에 포함되고, 읽기에 실패한 프로젝트의 대화는 결과에 없으며 오류 줄도 없다(단위 테스트).
- 탭은 All / Canvases / Frames / Conversations 네 개이고, 화살표 키 이동과 Tab 순환이 기존 규칙대로 동작한다(단위 테스트).
- PRODUCT §5 item 3 'Quick Open'과 DESIGN.md 'Quick Open'이 새 동작으로 고쳐져 있다.

## 범위 밖

- 메시지 본문 검색, 일치 구절 표시, 일치 메시지로의 스크롤.
- 대화 목록 읽기 실패를 Quick Open에서 알리거나 다시 읽는 것.
- 캔버스가 사라진 캔버스 대화를 여는 새 화면.
- CLI(`doan`)나 에이전트용 대화 검색.
