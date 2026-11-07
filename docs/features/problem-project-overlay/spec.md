# problem-project-overlay — spec

문제가 생긴 프로젝트(Missing, Not set up, Config error, CLI error)와 읽는 중인 프로젝트를, 창 폭의 status band 대신 본문 패널 위의 블러 오버레이로 보인다. 초안은 `.doan/canvases/problem-project.html`(commit `89764cc3`, 수정 `e81758a6`)이고, 사용자가 2026-11-07 검토에서 정한 결정은 그 캔버스의 머리말과 캡션, 그리고 design.md §3에 있다.

**PRODUCT 영향**: PRODUCT §5 item 3 'Problem states'(들어갈 때 문제면 problem screen, 열린 Overview는 스레드를 읽을 수 있게 둔 채 status band와 Go Home), item 1의 문제 행 규칙("Problem rows do not open workspaces", 펼친 문제 프로젝트의 status line, "A loaded workspace that becomes unhealthy stays visible with its status strip and Go Home", Remove from Doan의 "workspace status line" 진입점)을 바꾼다. 마지막 task에서 고친다.

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

1. 작업 화면(workspace)에 불러온 프로젝트가 문제이거나 읽는 중이면, 열린 캔버스가 없을 때는 그 프로젝트의 Overview를, 열린 캔버스가 있을 때는 캔버스 페이지를 그대로 그리고, 그 본문 패널(Overview는 메인과 오른쪽 열, 캔버스 페이지는 캔버스 영역과 대화 패널) 위에 오버레이를 덮는다. 헤더와 사이드바는 움직이지 않고 그대로 쓸 수 있다. 오버레이 뒤의 본문은 포인터와 키보드로 조작할 수 없다(inert).
2. status band(`ProblemActions`, `.ws-recovery`/`.ws-status`/`.ws-detail`)와 그 grid 행, 캔버스 영역의 문제 문장(`CanvasPane` `problemMessage`), Overview 입력창의 문제 이유 줄, 사이드바 문제 행 아래 줄(`shell-empty`)이 없다.
3. 오버레이는 본문 패널 안쪽(24px 모서리 안)을 흰색 60% 바탕과 `--blur-sm` 배경 블러로 덮는다. macOS '투명도 줄이기'에서는 블러 없이 불투명한 `--surface-panel`이다.
4. 문제 종류마다 오버레이 가운데에 컨테이너 없이 32px 종류 아이콘(선 두께 1.5), heading 크기(24/1.1, 500) 제목, `--text-subtle` 설명 한 줄, sm 버튼 줄을 가운데 정렬로 보인다. 문구, 아이콘, 버튼은 design.md §4.2 표와 같다. 주 동작 하나만 채운 버튼이고 맨 앞에 온다. Remove from Doan은 ghost이고, Go Home은 없다.
5. Config error의 Details는 버튼 줄 아래에서 CLI 메시지를 inset 바탕 상세 블록으로 펼친다. toast를 띄우지 않는다.
6. 읽는 중(`loading`)이면 처음 300 ms(`LOADING_DELAY_MS`)는 아무것도 덮지 않는다. 그 뒤에는 블러 없이 불투명 패널에 16px spinner와 body-sm "Reading project"(`--text-subtle`)만 보이고, 상태로 알린다(`role="status"`). 제목, 아이콘, 동작은 없다.
7. 오버레이가 문제 종류로 나타나면 포커스는 그 제목(`tabIndex=-1`)으로 간다. Tab 한 번에 주 동작에 닿는다. Overview 입력창에 쓰던 글은 그 대화의 초안으로 남는다.
8. 사이드바 프로젝트 행 끝의 문제 이름 글자(`shell-problem`) 대신 그 종류의 16px 아이콘을 행 상태 칸(`row-slot`)에 `--text-subtle`로 보인다. 읽는 중이면 14px spinner다. 문제 아이콘은 그 칸의 대화 상태 표시보다 우선한다. 아이콘의 tooltip과 접근 가능한 이름은 오버레이 제목과 같다.
9. 사이드바에서 열려 있지 않은 문제 프로젝트 행을 누르면 다른 프로젝트 행처럼 그 Overview로 가고 오버레이를 보인다(지금은 펼치기만 한다).
10. worktree가 여럿인 프로젝트에서 한 worktree가 문제면, 다른 worktree로 옮기는 길은 사이드바 프로젝트 … 메뉴의 worktree 목록이다. 오버레이가 Overview 헤더의 worktree chip을 덮으므로, chip은 이 동안 쓸 수 없다.
11. 회복 동작은 지금 band와 같은 처리기(`App.tsx` `action(name, root)`)를 부르고, Remove from Doan은 지금의 확인 alert를 거친다. Locate나 Set Up이 root를 옮기면 지금처럼 새 root를 따라간다.
12. 문제가 풀려 `list`가 되면 오버레이가 사라지고, 같은 Overview나 캔버스 페이지를 그대로 쓴다.
13. Home 입력창의 project picker, Project Settings 페이지의 문제 notice, 실행 시 문제 root면 Home에서 시작하는 규칙, Quick Open의 unavailable 안내는 바뀌지 않는다.
14. CLI 출력, JSON Schema, app socket, `ui-state.json`, main IPC가 바뀌지 않는다.
15. `/design-sync`가 확정된 초안의 프레임과 구현을 computed style로 맞추고, `/runtime-test`가 격리된 실제 앱에서 다음을 확인한다: 열린 Overview가 Missing으로 바뀜, 문제 프로젝트에 들어감(사이드바 행), 열린 캔버스의 프로젝트가 문제로 바뀜, Locate로 회복, Config error Details, 읽는 중 300 ms 규칙, 사이드바 아이콘 tooltip, 오버레이 뒤 본문 inert와 제목 포커스, 오버레이가 보일 때 사이드바 프로젝트 메뉴(portal)가 오버레이 위에 열림(screenshot).

## 비목표

- Project Settings 페이지, Home project picker, Quick Open의 문제 표시를 바꾸기.
- 오버레이에 worktree 전환 동작을 넣기(사용자 결정: 사이드바 프로젝트 메뉴).
- 실행 시 문제 root를 Home 대신 그 프로젝트에서 시작하기.
- 문제 종류나 회복 동작 자체를 바꾸기(Set Up 양식, Locate 선택, Remove 확인 문구).
- 자동 등록된 worktree의 숨김 규칙(PRODUCT §5 item 1: 읽을 수 없는 자동 등록 worktree는 문제 행으로 보이지 않는다)을 바꾸기.
- 다크 모드(앱은 Light only).
