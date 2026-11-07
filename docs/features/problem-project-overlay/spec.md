# problem-project-overlay — spec

문제가 생긴 프로젝트(Missing, Not set up, Config error, CLI error)와 읽는 중인 프로젝트를, 창 폭의 status band 대신 본문 패널 위의 블러 오버레이로 보인다. 초안은 `.doan/canvases/problem-project.html`(commit `89764cc3`, 수정 `e81758a6`)이다. 사용자가 2026-11-07 초안 검토와 `/feature-review`에서 정한 결정은 그 캔버스의 머리말과 캡션, 그리고 design.md §3에 있다.

**PRODUCT·ARCHITECTURE 영향**: 마지막 task(T7)에서 아래 문장을 이 문서의 규칙으로 고친다.

- PRODUCT §5 item 3 'Problem states'(들어갈 때 문제면 problem screen, 열린 Overview는 스레드를 읽을 수 있게 둔 채 status band와 Go Home을 보임).
- PRODUCT §5 item 1의 문제 행 규칙:
  - "Problem rows do not open workspaces"
  - 펼친 문제 프로젝트의 status line
  - "A loaded workspace that becomes unhealthy stays visible with its status strip and Go Home"
  - Remove from Doan의 "workspace status line" 진입점
- PRODUCT §5 item 1의 대화 strip 문단(L212, "on a problem workspace only"): 문제 workspace가 이제 Overview나 캔버스 페이지 위 오버레이다.
- PRODUCT §5 item 1의 행 slot 우선순위(L213, L214)와 숨긴 사이드바 점(L178): 문제 아이콘이 slot 순서에 들어간다.
- PRODUCT §5 item 3 Overview 헤더의 worktree chip(L256): 오버레이가 chip을 덮는 동안에는 chip을 쓸 수 없다.
- ARCHITECTURE §7 'Memory'의 "Problem/loading rows never enter workspaces; a loaded workspace that turns unhealthy stays with its status actions".

## 사용자

- **사람(앱 사용자)**: 프로젝트 폴더가 옮겨졌거나 설정이 깨진 것을 알게 되고, 그 자리에서 고친다. 지금은 문제가 창 맨 위 띠, 사이드바 두 줄, 캔버스 영역 문장, 입력창 이유 줄에 흩어져 있고, 띠 때문에 사이드바가 아래로 밀린다.
- **에이전트**: 바뀌는 것이 없다. CLI 출력, guide, skill stub, `doan check` 규칙이 그대로이므로 `/agent-eval` 대상이 아니다.

## 문제 (관찰된 사실)

2026-11-07 main(`bdd63af7`)으로 빌드한 격리 앱에서, 폴더를 옮긴 임시 프로젝트로 확인했다(`.scratch/runtime-test/problem-project/`).

- status band(`Home.tsx` `ProblemActions`, `.ws-recovery`)가 창 grid에 행 하나(47px)를 더해 헤더 아래 창 폭 전체를 덮는다. 사이드바 열도 덮어서 사이드바가 47px 아래로 밀린다. 모서리는 0이고, 본문 패널의 둥근 위 모서리에 간격 없이 붙는다.
- band 바탕(`--surface-inset` #f5f5f6)과 셸 바탕(`--bg-app` #f1f1f2)의 대비는 약 1.04:1이다. 회복 버튼(`subtle`)의 바탕이 band와 같은 색이라 ghost 버튼과 구분되지 않는다(DESIGN 'Intended exceptions'의 임시 예외).
- 들어갈 때 문제인 프로젝트는 Overview가 아니라 그 아래 깔린 빈 캔버스 페이지를 보인다(`App.tsx` `healthyOverview`는 `list`일 때만, `keptOverview`는 열려 있던 경우만). 캔버스가 없는데 Frames, 확대, Reload, 도구 줄, "Conversations about this canvas will show here." 대화 패널이 보이고, 가운데에 "Use Locate above." 문장이 band를 가리킨다.
- 같은 문제를 한 화면에서 band의 chip과 문장, 사이드바 행 끝 이름, 사이드바 아래 줄(펼친 프로젝트의 그룹 자리 대체 문구, `ShellSidebar.tsx` `shell-empty`), 캔버스 영역 문장, 입력창 이유 줄이 반복한다.
- 사이드바에서 열려 있지 않은 문제 프로젝트 행을 누르면 펼치기만 하고 화면을 옮기지 않는다(`App.tsx` `toggleProject`). 회복은 행의 … 메뉴에서만 할 수 있다.

## 완료 조건

1. 작업 화면(workspace)에 불러온 프로젝트가 문제이거나 읽는 중이면, 열린 캔버스가 없을 때는 그 프로젝트의 Overview를, 열린 캔버스가 있을 때는 캔버스 페이지를 그대로 그리고, 그 본문 패널 위에 오버레이를 덮는다.
   - 덮는 범위: Overview는 메인과 오른쪽 열, 캔버스 페이지는 캔버스 영역(캔버스 머리의 Frames, 확대, Reload, 도구 줄 포함)과 대화 패널이다.
   - 앱 헤더(`.shell-top`), 사이드바, 사이드바 폭 조절 handle은 덮지 않고 그대로 쓸 수 있다.
   - Missing과 Not set up은 지금처럼 열린 캔버스를 닫으므로(`canvasView.ts` `canvasViewUpdate`) Overview + 오버레이가 된다. 캔버스 페이지 위 오버레이는 Config error와 CLI error에서 생긴다.
2. 오버레이 뒤의 본문은 포인터와 키보드로 조작할 수 없다(inert). 오버레이가 보이는 동안 덮인 본문을 노리는 앱 메뉴와 단축키가 꺼진다: View의 확대·축소·Actual Size·Fit·Reload Canvas(⌘= ⌘- ⌘0 ⌘1 ⌘R), Pick from Canvas(⌘L), New Conversation(⌘N), 캔버스 도구 키(V, H, Space, Esc 단계). 진행 중이던 pick·capture는 취소된다.
3. status band(`ProblemActions`, `.ws-recovery`/`.ws-status`/`.ws-detail`)와 그 grid 행, 캔버스 영역의 문제 문장(`CanvasPane` `problemMessage`, `CanvasController`의 "Use Locate above."·"Use Set Up above."), Overview 입력창의 문제 이유 줄, 사이드바 문제 행 아래 줄(`shell-empty` 분기)이 없다. 오버레이가 덮는 동안에는 문제 kind에서 온 캔버스 영역 오류 notice도 그리지 않는다.
4. 오버레이는 본문 패널 안쪽(24px 모서리 안)을 `--surface-panel` 60% 바탕과 `--blur-sm` 배경 블러로 덮는다. macOS '투명도 줄이기'에서는 블러 없이 불투명한 `--surface-panel`이다.
5. 문제 종류마다 오버레이 가운데에 scene을 가운데 정렬로 보인다. scene은 컨테이너 없이 32px 종류 아이콘(선 두께 1.5), heading 크기(24/1.1, 500) 제목, `--text-subtle` 설명 한 줄, sm 버튼 줄로 이루어진다.
   - 문구, 아이콘, 버튼은 design.md §4.2 표와 같다.
   - 주 동작 하나만 채운 버튼이고 맨 앞에 온다. Remove from Doan은 ghost이고, Go Home은 없다.
   - 최소 창(960×600)에서 제목이 여러 줄이거나 Details가 길어도 오버레이 안을 스크롤해 모든 버튼에 닿는다.
6. Config error의 Details는 버튼 줄 아래에서 CLI 메시지를 inset 바탕 상세 블록으로 펼친다. toast를 띄우지 않는다.
7. 문제 workspace에 Home에서 시작했거나 Overview에서 보낸 그 root의 대화가 있으면, 지금의 임시 대화 strip이 오버레이에 덮이지 않고 본문 위에 남는다. 거기서 Stop, Dismiss, 권한 응답, 질문 답, Edit on Home을 지금처럼 쓴다. 오버레이에 가려진 대화로 가는 Open은 보이지 않는다.
8. 읽는 중(`loading`):
   - 오버레이가 없던 상태에서 읽기 시작하면, 처음 300 ms(`LOADING_DELAY_MS`)는 아무것도 덮지 않는다. 그 뒤에는 블러 없이 불투명 패널에 16px spinner와 body-sm "Reading project"(`--text-subtle`)만 보이고, 상태로 알린다(`role="status"`). 제목, 아이콘, 동작은 없다.
   - 문제 scene이 떠 있는 동안 Retry, Locate, Set Up으로 읽기 시작하면 scene이 그대로 남는다. 버튼은 `aria-disabled`로 막히고 누른 버튼에 spinner가 돈다. 포커스는 그 버튼에 남는다.
   - 같은 kind로 다시 실패하면 포커스와 Details 펼침이 그대로이고, live region이 제목을 다시 읽는다. 다른 kind가 되면 제목으로 포커스가 간다. `list`가 되면 완료 조건 14를 따른다.
9. 포커스와 알림:
   - 사람이 들어와서 오버레이를 만났거나(행 누르기, Back/Forward), 오버레이가 나타날 때 포커스가 덮인 본문이나 `body`에 있었으면 포커스가 제목(`tabIndex=-1`)으로 간다. Tab 한 번에 주 동작에 닿는다. 제목은 설명 줄을 `aria-describedby`로 가진다.
   - 그 밖의 경우(사이드바·헤더·검색에 포커스가 있거나 메뉴가 열려 있음)에는 포커스를 옮기지 않고, 오버레이의 polite live region이 제목을 읽는다.
   - Set Up 양식이나 Remove alert가 열려 있는 동안에는 제목 포커스를 미룬다.
   - Overview 입력창에 쓰던 글은 그 대화의 초안으로 남는다.
10. 오버레이가 문제 scene이나 읽는 중 패널을 보이는 동안, 덮인 Overview 스레드와 캔버스 대화 패널은 "본 것"으로 처리되지 않는다. 풀리면 그때 보인 것으로 처리한다.
11. 사이드바 프로젝트 행:
    - 행 끝의 문제 이름 글자(`shell-problem`) 대신 그 종류의 16px 아이콘을 행 상태 칸(`row-slot`)에 `--text-subtle`로 보인다.
    - 읽는 중이면 `LOADING_DELAY_MS` 뒤에만 14px spinner를 보인다.
    - 상태 칸의 순서는 권한 요청·질문, 문제 아이콘, working, unseen이다. 프로젝트의 어느 worktree든 답을 기다리는 대화가 있으면 그 표시가 문제 아이콘을 이긴다.
    - 아이콘의 hover tooltip은 오버레이 제목과 같고, 읽는 중이면 `Reading <name>`이다. 행 자체가 이 문장을 접근 가능한 설명(`aria-describedby`)으로 가진다. 아이콘은 `aria-hidden`이다.
    - 펼친 문제 프로젝트는 그룹 자리에 아무것도 없고, 그 행은 `aria-expanded`와 빈 `role="group"`을 갖지 않는다.
12. 사이드바에서 문제 프로젝트에 들어가는 길:
    - 열려 있지 않은 문제 프로젝트 행을 누르면 다른 프로젝트 행처럼 그 Overview로 가고 오버레이를 보인다(지금은 펼치기만 한다).
    - 불러온 문제 프로젝트의 행을 Home이나 캔버스 페이지에서 누르면 지금처럼 그 Overview로 가고 오버레이를 보인다. 오버레이가 덮은 Overview에서 누르면 제목으로 포커스를 옮기고 덮인 대화 선택을 바꾸지 않는다.
    - 프로젝트 … 메뉴의 Overview 항목은 문제 root에서도 켜져 있고 행 누르기와 같은 곳으로 간다.
13. worktree가 여럿인 프로젝트에서 한 worktree가 문제면, 다른 worktree로 옮기는 길은 사이드바 프로젝트 … 메뉴의 worktree 목록이다. 오버레이가 Overview 헤더의 worktree chip을 덮으므로, chip은 이 동안 쓸 수 없다.
14. 회복 동작은 지금 band와 같은 처리기(`App.tsx` `action(name, root)`)를 부른다.
    - Remove from Doan은 지금의 확인 alert를 거친다. 불러온 프로젝트를 지우면 Overview에서든 캔버스 페이지에서든 Home으로 간다.
    - Locate나 Set Up이 root를 옮기면 지금처럼 새 root를 따라간다. 새 root가 아직 문제거나 읽는 중이면 그 root의 오버레이를 보인다.
    - 문제가 풀려 `list`가 되면 오버레이가 사라지고, 같은 Overview나 캔버스 페이지를 그대로 쓴다. Set Up 성공도 같다. 포커스가 오버레이 안에 있었으면 Overview는 입력창으로, 캔버스 페이지는 캔버스 영역으로 간다.
15. Home 입력창의 project picker, Project Settings 페이지의 문제 notice, 실행 시 문제 root면 Home에서 시작하는 규칙, Quick Open의 unavailable 안내, deep link와 `doan open`이 문제 프로젝트에서 toast 하나만 띄우고 움직이지 않는 규칙은 바뀌지 않는다.
16. CLI 출력, JSON Schema, app socket, `ui-state.json`, main IPC가 바뀌지 않는다.
17. `/design-sync`가 확정된 초안의 프레임과 구현을 computed style로 맞춘다. `/runtime-test`가 격리된 실제 앱에서 다음을 확인한다:
    - 열린 Overview가 Missing으로 바뀜
    - 문제 프로젝트에 들어감(사이드바 행, 메뉴의 Overview)
    - 열린 캔버스의 프로젝트가 Config error로 바뀜
    - Locate로 회복, Set Up 성공, Retry 중 busy와 같은 kind 재실패
    - Remove from Doan으로 Home
    - Config error Details
    - 읽는 중 300 ms 규칙
    - 사이드바 아이콘 tooltip과 권한 요청이 이기는 행
    - 오버레이 뒤 본문 inert와 꺼진 단축키
    - 제목 포커스
    - 문제 workspace의 대화 strip
    - 최소 창
    - 오버레이가 보일 때 사이드바 프로젝트 메뉴(portal)와 toast가 오버레이 위에 그려짐(screenshot)
    - 스크롤과 창 크기 변경 중 블러 끊김

## 비목표

- Project Settings 페이지, Home project picker, Quick Open의 문제 표시를 바꾸기.
- 오버레이에 worktree 전환 동작을 넣기(사용자 결정: 사이드바 프로젝트 메뉴).
- 실행 시 문제 root를 Home 대신 그 프로젝트에서 시작하기.
- 문제 종류나 회복 동작 자체를 바꾸기(Set Up 양식, Locate 선택, Remove 확인 문구, 동작 집합).
- Missing·Not set up에서 열린 캔버스를 유지하기(목록 반영 규칙 `canvasViewUpdate`는 그대로다).
- CLI error의 원인(`reason`)을 오버레이에 보이기, Show in Finder가 숨김 폴더 `.doan/`을 보이지 않는 문제. T7에서 BACKLOG에 적는다.
- 자동 등록된 worktree의 숨김 규칙(PRODUCT §5 item 1: 읽을 수 없는 자동 등록 worktree는 문제 행으로 보이지 않는다)을 바꾸기.
- 다크 모드(앱은 Light only).
