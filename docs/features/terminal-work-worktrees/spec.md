# terminal-work-worktrees — spec

터미널 에이전트가 등록된 프로젝트의 **등록되지 않은 worktree**(Orca가 세션마다 만드는 worktree 등)에서 `doan work start`를 보내면, 앱이 그 worktree를 프로젝트의 worktree로 자동 등록하고 작업 표시를 보인다. 같은 경로의 캔버스를 다른 checkout에서 보고 있던 사람에게는 보드에 안내와 Open을 띄운다.

PRODUCT §3 In scope 1 'Show'(에이전트가 쓴 것을 앱이 보여 준다)를 worktree에서 일하는 에이전트까지 넓히는 feature다.

## 사용자

- **사람(앱 사용자)**: Orca 같은 도구로 worktree마다 에이전트를 돌리는 사람이다. 에이전트가 캔버스를 고치는 동안 사이드바와 보드에서 그 작업을 보고, 한 번에 그 worktree의 캔버스로 옮겨 실제 편집을 본다.
- **에이전트**: 바뀌는 것이 없다. 지금처럼 `doan work start`/`done`을 보내고, 등록된 저장소의 worktree에서는 `delivered: true`를 받는다.

## 문제 (관찰된 사실)

- 앱은 등록된 root에서 온 work 신호만 받는다. 등록되지 않은 root는 `project_not_open`으로 거절하고(`app/src/main/runtime.ts` `answerLine` v3), CLI는 `delivered: false`만 돌려준다. ARCHITECTURE §12 'CLI output contract'는 `project_not_open`이 "another worktree of a saved repository"도 덮는다고 적고, guide는 `delivered:false`를 보고하거나 다시 보내지 말라고 한다(`cli/internal/cli/skill.md:42`, ARCHITECTURE §4 'Terminal work over app-socket v3' 'Best effort').
- Orca는 에이전트 세션마다 worktree(`~/orca/workspaces/<repo>/<name>/`)를 만든다. 사람이 앱에 등록하는 것은 보통 main checkout 하나다(이 기기 `folders.json`: `/Users/sinhyeok/code/doan-design` 하나). 그래서 Orca 에이전트의 캔버스 작업은 앱에 표시되지 않는다(사용자 보고, 2026-11-03. 조사: worktree `conv-delete-C`에서 `doan work start` → `delivered:false`, v3 socket → `project_not_open`).
- 같은 경로라도 main checkout의 캔버스는 worktree의 편집을 보여 주지 않는다. 표시 identity는 root + path다(ARCHITECTURE §4 'Terminal work over app-socket v3' 'State', POSTMORTEM 2026-11-01).
- 등록된 root에서는 같은 흐름이 동작한다(실험: Orca 터미널의 Claude가 `~/code/doan-design`에서 start·done 모두 `delivered:true`).

## 이미 정한 것 (사용자 결정)

1. 등록된 프로젝트와 같은 Git 저장소의 **다른 worktree**에서 `doan work start`가 오면, 앱은 그 worktree를 그 프로젝트의 worktree로 자동 등록하고 작업 표시를 보인다. 같은 checkout 안의 다른 doan root(모노레포의 다른 패키지)는 자동 등록하지 않는다.
2. 자동 등록된 worktree의 폴더가 사라지면 목록에서 조용히 빠진다. 폴더는 남아 있는데 목록을 읽지 못하면(`uninitialized`, CLI 오류, 권한 오류) 등록은 유지한 채 목록에서 숨기고, 다시 읽히면 보인다. 사람이 직접 추가한 worktree는 지금처럼 문제 상태로 남는다.
3. 자동 등록해도 앱 화면은 그 worktree로 넘어가지 않는다. 사람이 같은 경로의 캔버스를 같은 프로젝트의 다른 checkout에서 보고 있으면 보드에 그 worktree에서 작업 중이라는 안내와 Open을 띄운다. Open은 그 worktree의 같은 캔버스로 옮긴다.
4. 보고 있던 자동 등록 worktree가 사라지거나 숨겨지면, 그 worktree로 오기 전에 선택돼 있던 같은 group의 worktree(기억이 없으면 main checkout, 그것도 없으면 group의 첫 worktree)로 간다. 같은 경로의 캔버스가 그 worktree의 목록에 있으면 그 캔버스를, 없으면 그 worktree의 Overview를 연다. 토스트는 없다.
5. 첫 `start`가 응답 기한을 넘겨 `delivered:false`로 끝나도, 앱은 등록을 끝까지 진행하고 성공하면 그 `start`의 작업 표시도 적용한다.
6. 자동 등록분이 쌓이는 것을 줄이는 worktree별 제거는 이번 범위가 아니다. 알려진 한계로 `docs/BACKLOG.md`에 적는다.

## 왜 work 신호는 등록할 수 있는가

PRODUCT §5 item 3 'Deep links'는 링크와 `doan open`이 프로젝트를 추가하지 못하게 한다. 아무 웹 페이지나 링크를 열 수 있기 때문이다. v3 work 신호는 다르다. 0600 runtime token을 읽을 수 있는 로컬 프로세스만 보낼 수 있고, 등록 대상도 이미 등록된 프로젝트와 같은 저장소의 다른 worktree로 한정된다. 새 프로젝트를 만들지 않고 이미 있는 group에 worktree만 더한다.

## 완료 조건

1. 등록된 프로젝트 P의 등록되지 않은 worktree W에서 `doan work start <canvas> --json`이 응답 기한 안에 등록을 마치면 `delivered: true`로 끝난다. W는 P의 group에 worktree로 들어가 등록된 worktree가 보이는 모든 곳(사이드바 project menu, branch chip, Home composer의 worktree tray, Project Settings)에 목록 맨 끝으로 보이고, 재시작 뒤에도 남는다. W가 별도 프로젝트 카드로 보이는 순간은 없다.
2. 기한을 넘기면 응답은 `delivered: false`지만, 등록이 끝나면 W가 완료 조건 1처럼 들어가고 그 `start`의 작업 표시도 보인다(결정 5). 그 사이 같은 W에서 온 `done`은 등록이 끝난 뒤 적용된다.
3. W에서 목록에 있는 캔버스가 사이드바에 보이지 않는 동안(선택된 worktree가 W가 아님) P의 프로젝트 행에 터미널 작업 스피너가 뜬다(PRODUCT §5 item 1의 off-screen 규칙 그대로). 스피너를 누르면 W가 선택된 worktree가 되고 W의 그 캔버스가 열린다. W에 아직 목록에 없는 경로(새로 만드는 캔버스)는 W가 그 경로를 목록에 올릴 때부터 스피너가 뜬다.
4. 사람이 P의 다른 checkout R에서 같은 경로의 캔버스를 보고 있고 R에 그 캔버스의 작업(터미널 작업, 앱 대화)이 없으면, 보드에 W의 branch(없으면 폴더 이름)를 말하는 안내와 Open이 뜬다. R에 작업이 있으면 R의 표시가 이기고 안내는 없다. R의 캔버스에는 glow·dot field를 띄우지 않는다. 같은 경로를 여러 worktree가 작업 중이면 가장 나중에 `start`를 받은 worktree 하나를 말한다. 안내는 W의 작업이 끝나면(`done` 또는 만료) 사라진다.
5. Open은 W를 선택하고 W의 같은 캔버스를 연다. 기록에는 캔버스 방문 하나가 남아 Back으로 R의 캔버스로 돌아간다. W가 그 사이 사라졌으면 지금의 사라진 대상 처리(토스트)를 따른다.
6. W를 열면 지금의 터미널 작업 표시(glow, dot field, Stop 없는 "Agent is working")가 그대로 보인다.
7. 앱 화면, 선택된 worktree, Back/Forward 기록은 자동 등록만으로 바뀌지 않는다.
8. 등록된 어떤 root와도 같은 저장소의 다른 worktree가 아닌 root(다른 저장소, 같은 checkout의 다른 doan root), Git 저장소가 아닌 root, 목록을 읽을 수 없는 root(`.doan/config.json`이 없는 브랜치 등)는 지금처럼 `project_not_open`이고 아무것도 등록하지 않는다. `work done`은 아무것도 등록하지 않는다.
9. 자동 등록된 W의 폴더가 사라지면 W는 목록에서 빠지고, Missing 상태 줄·문제 행·토스트는 한 번도 보이지 않는다. W를 보고 있었으면 결정 4대로 이동한다. W의 기억한 캔버스와 선택도 함께 지워진다.
10. 자동 등록된 W가 폴더는 남은 채 목록을 읽지 못하면 W는 목록에서 숨고 문제 행으로 보이지 않는다(그래서 group 전체를 지우는 Remove from Doan을 W 때문에 마주치지 않는다). 보고 있었으면 결정 4대로 이동한다. 다시 읽히면 보인다.
11. 사람이 Add Projects, Open Project, Locate로 W를 직접 추가하거나 다시 가리키면 W는 직접 추가한 worktree가 된다(완료 조건 9·10을 따르지 않음). Remove from Doan은 자동 등록분을 포함해 group의 worktree를 모두 목록에서 뺀다.
12. 캔버스 picking 안내(`Click a frame or an element, or Shift-click a spot` + Esc)는 상단 가운데 column이 아니라 하단 Canvas tools 바로 위(8px)에 뜬다. 상단 column은 에이전트 안내만 쓰므로, 에이전트 안내가 생기거나 사라져도 picking 안내는 움직이지 않는다. 안내의 모양·문구·접근성은 바뀌지 않는다(사용자 결정, design §3.6).

## 바뀌는 PRODUCT·ARCHITECTURE 결정

승격 task(T4)에서 현재 규칙으로 고쳐 쓴다.

- PRODUCT §3 Out of scope 4 "Terminal work signals (`doan work`) only show work": 등록된 프로젝트의 다른 worktree를 목록에 더할 수 있다는 예외.
- PRODUCT §5 item 1: "Only registered worktrees appear"에 자동 등록·숨김·제거 규칙, 사라진 자동 등록분에 대한 Missing·Remove 문단의 예외, 터미널 slot 클릭이 그 worktree를 고른다는 것.
- PRODUCT §5 item 2 'Terminal work': 다른 worktree 작업 안내와 Open.
- `docs/DESIGN.md` 'Picking hint'의 위치(에이전트 안내 아래 → Canvas tools 위).
- PRODUCT §5 item 10 `doan work`: `start`가 worktree를 등록할 수 있다는 것.
- ARCHITECTURE §3 'Shell tree' "Git-discovered worktrees are never added": work 신호로 온 worktree는 예외.
- ARCHITECTURE §4 'Terminal work over app-socket v3': 'Dispatch' 순서, 'Best effort', 'State'의 "Unregistered roots are dropped".
- ARCHITECTURE §12 'CLI output contract'의 `project_not_open` 설명.
- ARCHITECTURE §7과 §11 기기 로컬 파일 목록: `auto-folders.json`.

## 비목표

- 등록된 프로젝트가 없는 저장소의 자동 등록. 프로젝트 추가는 지금처럼 사람이 한다.
- 같은 checkout 안의 다른 doan root 자동 등록(결정 1).
- `doan open`·링크·`doan active`·`comments` 등 다른 명령으로 자동 등록하기.
- 자동으로 그 worktree로 화면을 옮기기(결정 3).
- worktree의 캔버스 내용을 다른 checkout에서 미리 보여 주기.
- worktree별 목록 제거와 자동 등록분 개수 제한(결정 6).
- 앱 대화의 다른 worktree 안내. 이번 안내는 터미널 작업만 다룬다.
- `.doan/config.json`이 없는 worktree(local mode 등). `doan work start`가 CLI의 `repo.Find`에서 먼저 실패하므로 앱에 신호가 오지 않는다.
- Orca 외 도구별 처리. 규칙은 Git 저장소 기준이다.

## 결정 (지휘자 판단, /feature-review에서 확인)

7. **자동 등록 판단은 main이 `doan ls --json --repo <root>`의 `git.worktrees`로 한다.** 등록된 root 중 하나가 W의 `git.worktrees`에 있으면 같은 저장소의 다른 worktree다. Git 메타데이터는 Go만 해석한다는 규칙(ARCHITECTURE §13 'Read-only Git metadata')과, 앱의 읽기는 CLI를 거친다는 규칙(§13 'The app's folders')을 지킨다.
