# terminal-work-worktrees — design

spec 결정 1~4를 main(소켓 v3 처리, 폴더 목록)과 renderer(보드 안내, 사이드바)로 나눈다. CLI와 guide는 바뀌지 않는다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| app main socket | `app/src/main/runtime.ts` (`answerLine` v3) | 등록되지 않은 root의 `start`를 바로 거절하지 않고 자동 등록을 시도한 뒤 판단한다 |
| app main 폴더 | `app/src/main/shell.ts`, `folderStore.ts` | 자동 등록 추가, 자동 등록분 기록, 폴더가 사라진 자동 등록분 제거, 직접 추가 시 자동 표시 해제 |
| app main 순수 규칙 | 새 모듈(이름은 `/tdd`에서) | 같은 저장소 판단, 자동 등록분 정리 판단 |
| renderer | `agentIndicator.ts`, `CanvasAgent.tsx`, `conversationList.ts`(`withTerminalSlots`) | 같은 group 다른 worktree의 같은 경로 작업 → 안내 + Open |
| CLI·guide·형식 | 없음 | `doan work` 요청·응답, app-socket v3 모양, CLI 출력, guide는 그대로다 |

## 2. main

### 2.1 v3 `start`의 자동 등록

지금 순서는 schema → token → 등록된 root → `start` 경로 패턴이다(ARCHITECTURE §4 'Dispatch'). 바뀌는 것은 "등록된 root" 단계뿐이다.

1. root가 등록돼 있으면 지금과 같다.
2. 등록되지 않았고 `action === "start"`이며 경로 패턴이 맞으면, main이 `doan ls --json --repo <root>`(ARCHITECTURE §13 'The app's folders': 읽기는 항상 CLI)를 실행한다. 결과가 `kind: "list"`이고 `git.common`이 있으며, 그 값이 등록된 root 중 하나의 `common`(shell의 `Folder.common`, 마지막으로 본 `git.common`)과 같으면 그 root를 자동 등록한다. 비교는 Go가 돌려준 canonical 절대 경로의 문자열 비교다.
3. 등록에 성공하면 work를 적용하고 `{v:3, ok:true}`. 아니면 지금처럼 `project_not_open`. `done`은 등록하지 않는다(spec 완료 조건 6).
4. 순서상 token 확인 뒤에만 `doan ls`를 실행하므로, token이 없는 요청은 프로세스를 띄울 수 없다. 같은 root에 대한 동시 `start`는 진행 중인 등록 하나를 함께 기다린다(중복 등록 방지).
5. CLI의 응답 deadline(`activeTimeout` 2초, `cli/internal/cli/active.go:17`)을 넘지 않게 `doan ls` 실행에 시간 제한을 둔다. 넘으면 `project_not_open`으로 답하되 등록은 끝까지 진행해도 된다(다음 `start`가 등록된 root로 처리됨).

**왜 `doan ls`인가**: 앱은 Git 메타데이터를 직접 읽지 않는다. `git.common`은 이미 `ls`가 주는 값이고(ARCHITECTURE §4 `ls` 응답의 `git`), group도 이 값으로 묶인다(PRODUCT §5 item 1 "Registered roots sharing a Git common directory form one project group").

### 2.2 자동 등록분 기록

- `folders.json`은 `string[]` 그대로 둔다. 모양을 바꾸면 이전 버전 앱이 목록을 읽지 못해 빈 목록으로 시작한다(`readFoldersFileForPruning`이 string 배열이 아니면 null).
- 자동 등록한 root는 `<userData>/auto-folders.json`(`string[]`, temp file + rename)에 따로 적는다. 이 파일을 모르는 이전 버전 앱은 자동 등록분을 직접 추가한 worktree처럼 다룬다. 이는 받아들인다.
- `folders.json`에 없는 항목은 `auto-folders.json`에서 무시하고 다음 쓰기 때 뺀다.
- 사람이 Add Projects·Open Project로 같은 root를 추가하면 자동 표시를 지운다(spec 완료 조건 8). Remove from Doan은 지금처럼 group의 root를 모두 지우고 자동 표시도 함께 지운다.

### 2.3 사라진 자동 등록분 제거

- 폴더 새로고침에서 자동 등록 root의 경로가 없으면(`lstat` ENOENT, 상위 폴더 포함) 목록에서 빼고 토스트를 띄우지 않는다. 권한 오류·CLI 오류·`uninitialized`처럼 경로가 남아 있는 실패는 빼지 않고 지금의 문제 상태를 따른다. 지워졌다는 확신이 있을 때만 뺀다.
- 그 root를 보고 있었으면 Remove from Doan 뒤와 같은 규칙으로 이동한다(POSTMORTEM 2026-11-03 'removing the loaded project left an empty workspace', 2026-10-25 'Removing a project retained its remembered canvas': 기억한 캔버스·선택도 함께 지운다).
- 사라진 root의 work 항목은 다음 정리에서 빠진다(`applyWork`가 등록되지 않은 root를 버림).

### 2.4 화면을 옮기지 않음

자동 등록은 `onChange(entries)`로 목록만 알린다. 선택된 worktree, 열린 캔버스, Back/Forward, 기억한 선택은 바꾸지 않는다(spec 결정 3). 재진입 때 worktree를 고르는 규칙은 work 상태를 쓰지 않는다(ARCHITECTURE §4 'State': "never used to pick a worktree on re-entry").

## 3. renderer

### 3.1 다른 worktree 작업 안내

- 순수 함수 `siblingWork(work, target, entries)`: 열린 캔버스(root R, path P)와 같은 group(같은 `lastCommon`)에 속한 다른 root R'에서 P에 대한 WorkItem이 있으면 `{ root: R', label }`을 돌려준다. label은 R'의 branch, 없으면(detached 등) 폴더 이름이다. 여러 개면 가장 최근 항목 하나.
- R 자신의 작업(지금의 terminal 변형)이나 R의 앱 대화가 있으면 그쪽이 이긴다. 안내는 R에 아무 작업도 없을 때만 보인다.
- 보드에는 glow·dot field를 띄우지 않고 안내 줄만 띄운다(spec 완료 조건 3). 위치는 지금의 agent notice 자리(board 위 가운데)이고, 모양과 문구는 `/design-draft`에서 정한다. 문구 후보: `Agent is working on this canvas in <label>` + Open. `clarify` preset으로 확인한다.
- Open: R'의 project menu worktree 선택과 같은 경로로 R'를 고르고 P를 연다. R'에 P가 아직 목록에 없으면(새로 만드는 캔버스) R'의 Overview를 연다.

### 3.2 사이드바

- 프로젝트 행의 터미널 작업 slot은 지금 규칙(PRODUCT §5 item 1: 캔버스 행이 화면에 없으면 프로젝트 행)을 그대로 따른다. W가 선택된 worktree가 아니면 W의 캔버스 행이 없으므로 프로젝트 행에 뜬다. 누르면 그 캔버스를 연다. 이때 선택된 worktree가 W로 바뀌는지 지금 코드(`withTerminalSlots`, 프로젝트 행 클릭 경로)에서 확인하고, 바뀌지 않으면 W를 고르게 고친다.

## 4. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수 | 위치 | 고정할 사례 |
|---|---|---|
| `autoRegisterRoot(view, registered)` | 새 main 모듈 | `git.common`이 등록된 root의 common과 같음 → 등록, 다름·없음·`list`가 아님 → 거절, 이미 등록됨 |
| `pruneAuto(list, auto, missing)` | 같은 모듈 | 사라진 자동 등록분만 빠짐, 직접 추가분은 남음, 권한 오류는 missing이 아님 |
| `autoAfterAdd(auto, root)` / `autoAfterRemove` | 같은 모듈 | 직접 추가 시 자동 표시 해제, 제거 시 함께 해제 |
| `siblingWork(work, target, entries)` | `agentIndicator.ts` | 같은 group 다른 root 같은 path → 안내, 다른 group·다른 path → 없음, 자기 root 작업·앱 대화가 이김, branch 없음 → 폴더 이름 |
| `answerLine` v3 분기 | `runtime.ts` | 등록 시도 경로, `done`은 등록 안 함, token 실패 시 `ls` 실행 안 함, deadline 초과 |

## 5. 형식·conventions·결정 영향

- JSON Schema, app-socket v3 요청·응답 모양, CLI 출력, guide는 바뀌지 않는다. 새 파일 `<userData>/auto-folders.json`은 앱 내부 저장이다(ARCHITECTURE §7 device-local storage에 적는다).
- ARCHITECTURE §1 'Conventions'와 `doan check`는 바뀌지 않는다. `/agent-eval`은 필요 없다(guide·CLI 출력 변경 없음). 다만 `delivered`가 worktree에서 true가 되는 것은 W3 시나리오의 기대와 맞는지 확인한다.
- **바뀌는 결정**(승격 task에서 고침):
  - PRODUCT §3 Out of scope 4 "Terminal work signals (`doan work`) only show work": 등록된 프로젝트의 worktree를 목록에 더할 수 있다는 예외.
  - PRODUCT §5 item 1 "Only registered worktrees appear": 자동 등록 규칙과 사라진 자동 등록분 제거.
  - ARCHITECTURE §3 'Design navigation and thumbnail rendering' 'Shell tree' "Git-discovered worktrees are never added": work 신호로 온 worktree는 예외.
  - ARCHITECTURE §4 'Error codes'의 `project_not_open` 설명과 'Dispatch' 순서.
- **No git operations**(PRODUCT §3 Out of scope 6): Doan은 git 명령을 실행하지 않는다. `git.common`은 Go `ls`의 기존 읽기다.
- **표시 identity root + path**(POSTMORTEM 2026-11-01): 그대로다. 다른 worktree의 작업은 그 캔버스의 작업 표시가 아니라 별도 안내로만 보인다.

## 6. PoC 의존

없다. `ls`의 `git.common`, group 묶기, 터미널 slot의 off-screen 규칙은 이미 동작한다. 실제 앱 확인은 구현 뒤 `/runtime-test`에서 Orca가 아닌 일반 `git worktree add`로 만든 worktree로 한다(같은 Git 동작).

## 7. POSTMORTEM에서 가져온 함정

- **2026-11-01 'agent indicator kept another worktree's conversation'**: worktree는 캔버스 id와 경로를 공유한다. 안내는 root가 다른 작업을 이 캔버스의 작업으로 그리지 않는다.
- **2026-11-03 'removing the loaded project left an empty workspace'**, **2026-10-25 'Removing a project retained its remembered canvas'**: 자동 제거도 보고 있던 화면과 기억한 선택을 정리한다.
- **2026-11-02 Locate/Set Up re-root(focus 이벤트)**: 목록을 바꾸는 새 경로(자동 등록, 자동 제거)가 renderer에 필요한 focus·변경 이벤트를 빠짐없이 보내는지 main 테스트로 고정한다.
- **2026-10-31 workTarget 링크 탈출**: 자동 등록 판단은 `workTarget`이 이미 검증한 root만 받는다.

## 8. 읽은 design preset

없음(UI 문구와 모양은 `/design-draft`에서 `clarify`, `harden`을 읽는다).
