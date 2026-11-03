# terminal-work-worktrees — spec

터미널 에이전트가 등록된 프로젝트의 **등록되지 않은 worktree**(Orca가 세션마다 만드는 worktree 등)에서 `doan work start`를 보내면, 앱이 그 worktree를 프로젝트의 worktree로 자동 등록하고 작업 표시를 보인다. 같은 경로의 캔버스를 다른 checkout에서 보고 있던 사람에게는 보드에 안내와 Open을 띄운다.

## 사용자

- **사람(앱 사용자)**: Orca 같은 도구로 worktree마다 에이전트를 돌리는 사람이다. 에이전트가 캔버스를 고치는 동안 사이드바와 보드에서 그 작업을 보고, 한 번에 그 worktree의 캔버스로 옮겨 실제 편집을 본다.
- **에이전트**: 바뀌는 것이 없다. 지금처럼 `doan work start`/`done`을 보내고, 등록된 저장소의 worktree에서는 `delivered: true`를 받는다.

## 문제 (관찰된 사실)

- 앱은 등록된 root에서 온 work 신호만 받는다. 등록되지 않은 root는 `project_not_open`으로 거절하고(`app/src/main/runtime.ts` `answerLine` v3), CLI는 `delivered: false`만 돌려준다. guide는 이 실패를 보고하지 말라고 한다(ARCHITECTURE §4 'Error codes': "`project_not_open` covers … another worktree of a saved repository").
- Orca는 에이전트 세션마다 worktree(`~/orca/workspaces/<repo>/<name>/`)를 만든다. 사람이 앱에 등록하는 것은 보통 main checkout 하나다(이 기기 `folders.json`: `/Users/sinhyeok/code/doan-design` 하나). 그래서 Orca 에이전트의 캔버스 작업은 앱에 표시되지 않는다(사용자 보고, 2026-11-03. 조사: worktree `conv-delete-C`에서 `doan work start` → `delivered:false`, v3 socket → `project_not_open`).
- 같은 경로라도 main checkout의 캔버스는 worktree의 편집을 보여 주지 않는다. 표시 identity는 root + path다(ARCHITECTURE §4 'State', POSTMORTEM 2026-11-01).
- 등록된 root에서는 같은 흐름이 동작한다(실험: Orca 터미널의 Claude가 `~/code/doan-design`에서 start·done 모두 `delivered:true`).

## 이미 정한 것 (사용자 결정)

1. 등록된 프로젝트와 같은 Git 저장소(같은 common directory)의 등록되지 않은 worktree에서 `doan work start`가 오면, 앱은 그 worktree를 그 프로젝트의 worktree로 자동 등록하고 작업 표시를 보인다.
2. 자동 등록된 worktree의 폴더가 사라지면 목록에서 조용히 빠진다. 사람이 직접 추가한 worktree는 지금처럼 문제 상태로 남는다.
3. 자동 등록해도 앱 화면은 그 worktree로 넘어가지 않는다. 사람이 같은 경로의 캔버스를 같은 프로젝트의 다른 checkout에서 보고 있으면 보드에 그 worktree에서 작업 중이라는 안내와 Open을 띄운다. Open은 그 worktree의 같은 캔버스로 옮긴다.

## 완료 조건

1. 등록된 프로젝트 P의 등록되지 않은 worktree W에서 `doan work start <canvas> --json`이 `delivered: true`로 끝난다. W는 P의 project group에 worktree로 들어가고(사이드바 project menu·branch chip의 worktree 목록), 재시작 뒤에도 남는다.
2. W의 캔버스가 사이드바에 보이지 않는 동안(선택된 worktree가 W가 아님) P의 프로젝트 행에 터미널 작업 스피너가 뜬다(PRODUCT §5 item 1의 off-screen 규칙 그대로). 행을 누르면 W의 그 캔버스가 열린다.
3. 사람이 P의 다른 checkout에서 같은 경로의 캔버스를 보고 있으면, 보드에 W의 branch(없으면 폴더 이름)를 말하는 안내와 Open이 뜬다. glow·dot field는 그 checkout의 캔버스에 띄우지 않는다(그 캔버스는 바뀌지 않으므로). Open은 W를 선택하고 같은 캔버스를 연다. 안내는 W의 작업이 끝나면(`done` 또는 만료) 사라진다.
4. W를 열면 지금의 터미널 작업 표시(glow, dot field, Stop 없는 "Agent is working")가 그대로 보인다.
5. 앱 화면, 선택된 worktree, Back/Forward 기록은 자동 등록만으로 바뀌지 않는다.
6. 등록된 어떤 프로젝트와도 같은 저장소가 아닌 root, Git 저장소가 아닌 root, 읽을 수 없는 root는 지금처럼 `project_not_open`이고 아무것도 등록하지 않는다. `work done`은 아무것도 등록하지 않는다.
7. 자동 등록된 W의 폴더가 사라지면(다음 폴더 새로고침에서) W는 목록에서 빠지고 문제 상태나 토스트를 남기지 않는다. W를 보고 있었으면 지금 Remove from Doan 뒤처럼 그 프로젝트의 다른 worktree나 Overview로 간다(구체 규칙은 design).
8. 사람이 Add Projects로 W를 직접 추가하면 W는 직접 추가한 worktree가 된다(완료 조건 7을 따르지 않음). Remove from Doan은 자동 등록분을 포함해 group의 worktree를 모두 목록에서 뺀다.

## 비목표

- 등록된 프로젝트가 없는 저장소의 자동 등록. 프로젝트 추가는 지금처럼 사람이 한다.
- `doan open`·링크·`doan active`·`comments` 등 다른 명령으로 자동 등록하기.
- 자동으로 그 worktree로 화면을 옮기기(결정 3).
- worktree의 캔버스 내용을 다른 checkout에서 미리 보여 주기.
- Orca 외 도구별 처리. 규칙은 Git 저장소 기준이다.

## 결정 (지휘자 판단, /feature-review에서 확인)

4. **자동 등록 판단은 main이 `doan ls --json --repo <root>`의 `git.common`으로 한다.** 앱은 Git을 직접 읽지 않는다는 규칙(ARCHITECTURE §13 'The app's folders')을 지킨다.
