# overview-tabs — spec

프로젝트 Overview의 오른쪽 패널(지금은 Canvas conversations 목록 하나)을 탭으로 나누고, 프로젝트 자체를 보여 주는 탭을 더한다. 출처는 `docs/BACKLOG.md` 'Undecided'의 "Project Overview tabs: split the conversation list panel into tabs and add a project information tab (an overview of the project itself, not only its conversations)."다. 사용자는 2026-11-07에 이 feature를 시작하기로 했고, 같은 날 design.md §3의 질문 Q1–Q9에 답했고, `/feature-review`에서 승인된 지적도 반영했다.

**선행 조건**: `local-doan-files`가 main에 병합된 뒤 시작한다. Project 탭이 그 feature의 Doan 파일 모드를 보이기 때문이다(design Q5).

## 사용자

- **사람(앱 사용자)**: Overview에서 프로젝트 대화를 이어 가는 사람이다. 지금은 이 프로젝트가 어느 checkout과 branch인지, 캔버스·design-system 캔버스·프레임이 몇 개인지, 어떤 token CSS를 쓰고 무엇을 캔버스와 공유하는지, Doan 파일을 Git에 넣는지, 마지막으로 바뀐 캔버스가 무엇인지를 한 곳에서 볼 수 없다. 오른쪽 패널의 탭 하나에서 그것을 읽고, 설정을 바꾸려면 거기서 Project Settings로 간다. 그 탭을 보는 동안에도 캔버스 대화가 일하거나 답을 기다리면 탭에서 알 수 있고, worktree에 문제가 생기면 탭 안에서 고친다.
- **에이전트**: 바뀌는 것이 없다. CLI 출력, guide, skill stub, `doan check` 규칙은 그대로이므로 `/agent-eval` 대상이 아니다.

## 문제 (관찰된 사실)

- Overview의 오른쪽 패널은 Canvas conversations 목록 하나다(PRODUCT §5 item 3 'Canvas conversations', `app/src/renderer/RightPanel.tsx` `CanvasConversations`, `CanvasConversationList.tsx`). 패널 머리는 제목 `<h2>` 하나이고, 목록은 현재 대화가 있는 캔버스만 보인다.
- 프로젝트에 관한 사실이 여러 화면에 흩어져 있고, 일부는 어디에도 없다.
  - branch: Overview 헤더의 branch 칩. worktree가 둘 이상이면 칩 메뉴가 각 worktree의 branch와 경로를 보인다(`ProjectOverview.tsx`).
  - 경로, Token CSS, Shared with canvases: Project Settings 페이지에만 있다. 이 페이지는 프로젝트 메뉴에서 여는 별도 페이지다(PRODUCT §5 item 0 'Project Settings', `ProjectSettingsPage.tsx`).
  - 캔버스: 사이드바가 목록을 보이지만, 캔버스 수, design-system 캔버스 수, 프레임 수, 마지막으로 바뀐 캔버스는 어느 화면에도 없다.
- 앱은 이 사실을 대부분 이미 갖고 있다. renderer의 `FolderEntry`(main이 `doan ls` 결과를 좁힌 것: 캔버스 경로·id·정적 프레임·mtime·읽기 오류, `git`의 branch·detached)와, Project Settings가 쓰는 `config:read`(`doan config` 읽기, `app/src/main/configBridge.ts`)다. 출처 전체는 design.md §2에 있다.

## 완료 조건

1. Overview 오른쪽 패널 머리에 아이콘 없는 탭 두 개, Conversations와 Project가 있다. 머리는 고정되고 그 아래 몸만 스크롤되며, 탭을 바꾸면 몸의 스크롤이 맨 위로 돌아간다. 패널 폭, 폭 조절(handle·키보드·더블클릭), 이 기기에 기억하는 폭은 지금과 같고 두 탭이 같은 폭을 쓴다.
2. Conversations 탭은 지금의 Canvas conversations 목록과 같다. 행, 썸네일, 상태 표시, Delete, 키보드 이동, 빈 상태·읽는 중·읽기 실패가 바뀌지 않는다.
3. Project 탭은 healthy worktree에서 다음을 보인다: 경로(`~` 표기), branch(또는 `detached <7자리>`), Doan에 등록된 worktree 수, 캔버스 수와 design-system 캔버스 수, 정적 프레임 수(한 캔버스라도 1,000 상한에 걸리거나 읽을 수 없으면 `+`를 붙인다), 읽을 수 없는 캔버스가 있으면 "N canvases can't be read — run doan check", 마지막으로 바뀐 캔버스와 그 시각("5m ago" 꼴), Token CSS, Shared with canvases, Doan files, Project Settings 버튼. Git 저장소가 아니면(`doan ls`에 `git`이 없으면) Branch, Worktrees, Doan files 줄이 없다.
4. Doan files 줄은 `doan ls`의 `storage`를 보인다: `repo`는 "Include in Git", `local`은 "Keep out of Git (this Mac only)", `unknown`은 "Unknown"과 그 아래 Project Settings의 `git_unreadable` 이유 문장. 다른 이유 문장은 보이지 않는다. 읽기 전용이다. `doan ls`에서 온 이 값이 `doan config`로 읽는 Project Settings와 잠깐 다를 수 있다.
5. 캔버스, Git, Doan files 사실은 renderer가 받는 `FolderEntry`에서 계산하고, 목록이 바뀌면 같이 바뀐다. Token CSS와 Shared with canvases는 기존 `config:read`로 읽는다. 읽는 때는 Project 탭 내용이 마운트될 때(캔버스나 페이지에서 돌아올 때 포함), 그 탭이 보이는 동안 창이 focus를 얻을 때(60초 간격), 탭이 보이는 동안 같은 root가 `list`가 될 때, Retry다. workspace 화면이 아니거나 worktree가 `list`가 아니면 읽지 않는다. 읽는 동안에는 이전 값을 두고, 처음 읽기가 300 ms를 넘으면 읽는 중 줄을 보인다. 실패하면 그 구역에 "Couldn’t read this worktree’s settings."와 이유, Retry를 보인다. Project Settings 페이지를 떠난 직후의 읽기가 페이지 session 정리 때문에 실패로 보이지 않는다.
6. Project Settings 버튼은 프로젝트 메뉴의 Project Settings와 같은 경로(App의 `openProjectSettings`)로 그 worktree의 Project Settings 페이지를 연다. Project 탭에는 설정 편집 control이 없다.
7. Overview에 처음 들어오면 Conversations 탭이 보인다. 이번 실행 동안에는 마지막으로 고른 탭을 모든 프로젝트에서 공통으로 기억하고, 앱을 다시 시작하면 Conversations로 돌아간다. 탭 선택은 `ui-state.json`에 쓰지 않는다.
8. 키보드와 접근성: tablist는 Tab stop 하나(선택된 탭)이고, ←/→가 탭 사이를 순환하며 바로 선택한다. 두 tabpanel 요소는 늘 있고(선택되지 않은 것은 `hidden`), 각 탭의 `aria-controls`가 자기 tabpanel을, tabpanel의 `aria-labelledby`가 자기 탭을 가리킨다. Project tabpanel과, 비었거나 읽는 중인 Conversations tabpanel은 `tabIndex=0`이다. Canvas conversations 행을 지운 뒤 갈 행이 없을 때와, 포커스가 있던 목록이 비었을 때 포커스는 선택된 탭으로 간다(지금은 패널 제목 `<h2>`). recovery 버튼이 사라져 포커스가 떨어지면 선택된 tabpanel로 간다.
9. Project 탭이 선택된 동안, 이 worktree의 캔버스 대화 중 답을 기다리는 것이 있으면 Conversations 탭 이름 옆에 14px 손 아이콘이, 그렇지 않고 일하는 것이 있으면 14px spinner가 붙는다(사이드바 slot과 같은 판단과 뜻). 프로젝트 대화는 세지 않는다. 탭의 접근 가능한 이름이 그 수를 말한다(예: "Conversations, 1 needs your answer", "Conversations, 2 working"). 끝났지만 보지 않은 대화는 표시하지 않고, 탭은 저절로 바뀌지 않는다. Conversations 탭이 선택되어 있거나 목록이 읽는 중·읽기 실패면 표시가 없다.
10. 문제 상태는 열린 Overview의 프로젝트가 문제로 바뀐 때에만 생긴다(들어갈 때 문제인 프로젝트는 problem screen을 보인다, PRODUCT §5 item 3 'Problem states'). worktree가 읽는 중이면 Project 탭은 경로와 읽는 중 줄을 보인다. 문제(Missing, Not set up, Config error, CLI error)이면 경로, 문제 이름, 설명 줄, recovery 동작 묶음("Fix this worktree")을 보인다. 동작은 status band와 같은 목록·순서·이름이고(Set Up, Locate, Show in Finder, Retry, Details, Remove from Doan 중 그 문제의 것) 같은 처리기를 부른다. status band도 그대로 보이고, Details 열림 상태는 band와 탭이 공유하며 toast를 띄우지 않는다. 설명 줄은 band와 탭이 같은 함수에서 받고, Config error와 CLI error에도 이제 설명 줄이 있다. Locate나 Set Up이 root를 옮기면 새 root를 읽는 동안 Overview가 사라졌다가(포커스는 사이드바의 현재 행) 새 root에서 Project 탭으로 다시 보인다.
11. 헤더, 스레드, 입력창(docked composer), 썸네일 캡처 규칙은 바뀌지 않는다. Project 탭이 보이는 동안 화면에 보이는 Canvas conversations 행은 없으므로, 썸네일 visibility 보고도 비어 있다.
12. CLI 출력, JSON Schema, app socket 메시지, `ui-state.json` 형식, main IPC 채널이 바뀌지 않는다. `storage`와 이유 값이 renderer에 아직 오지 않으면 `FolderEntry`에 두 필드를 좁혀 넘기는 것만 바뀐다.
13. `/design-sync`가 `.doan/canvases/overview-tabs.html`의 frame과 구현을 computed style로 맞추고, `/runtime-test`가 격리된 실제 앱에서 다음을 확인한다: 탭 전환(마우스·키보드), Project 탭 값과 `doan ls`·`doan config` 결과의 일치(Doan files 포함), Project Settings에서 바꾼 뒤 돌아왔을 때의 다시 읽기, Delete 뒤 포커스, Project 탭 선택 중 캔버스 대화가 일하거나 답을 기다릴 때의 탭 표시, 문제 worktree의 Project 탭 recovery(Locate 또는 Retry), Project 탭이 보일 때 Overview의 portal 메뉴 하나와 Project Settings 버튼 tooltip(있다면)을 screenshot으로.

## 비목표

- 프로젝트 대화 수와 캔버스 대화 수. Conversations 탭과 제목 메뉴가 이미 대화를 나열한다.
- 댓글 수와 orphan 댓글 파일. 앱에는 댓글 화면이 없다(PRODUCT §3 In scope 2).
- Doan 파일 모드를 Project 탭에서 바꾸기. 바꾸는 곳은 Project Settings다.
- `monorepo-services`의 서비스 정보. 그 feature는 Overview를 바꾸지 않는다고 적었다(`docs/features/monorepo-services/design.md` §4.4).
- 건강한 worktree의 Project 탭에서 설정 편집, Show in Finder, worktree 전환 같은 동작. Project Settings 버튼 하나만 둔다. worktree 전환은 헤더 branch 칩이 맡는다. 문제 worktree의 recovery 동작은 예외다(완료 조건 10).
- 프로젝트 대화의 상태를 Conversations 탭 표시에 넣기(사용자 결정: 프로젝트 대화는 이미 메인 열, Conversation menu, 사이드바 slot에 보인다), 끝났지만 보지 않음 표시, 상태 표시의 live region.
- 탭 안의 아이콘.
- Git remote URL, project skill, design preset 목록. remote는 main의 onboarding 경로(`readGitRemotes`)만 읽는다.
- 모든 캔버스를 나열하는 탭. 사이드바가 맡는다(PRODUCT §5 item 1).
- 캔버스 페이지 대화 패널의 탭. 그 패널은 대화 전용이고 탭 틀이 없다는 것이 buzz-restyle의 결정이다(`docs/features/buzz-restyle/spec.md` '캔버스 페이지 방향').
- 탭 선택을 이 기기에 저장하기, 탭 전환 단축키.
