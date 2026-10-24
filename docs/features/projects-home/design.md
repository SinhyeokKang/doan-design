# projects-home — 설계

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 앱 renderer | `App.tsx`에 화면 상태 `home \| workspace(root)`를 추가한다. 새 컴포넌트: `Home`(카드 목록), `ProjectCard`, `AddProjectsDialog`(하위 저장소 체크 목록), `WorktreeOfferDialog`, `Toast`(Undo), 작업공간 상단 바(← 홈, 저장소 이름, 브랜치 전환기). 작업공간의 `Sidebar`는 현재 루트의 항목 하나만 받는다(트리 모양은 지금 그대로 두고, `design-nav`가 바꾼다). 기존 `projectRow.ts`의 상태별 문구와 동작은 카드 뷰 모델로 옮긴다. |
| 앱 main | `folders.ts`: `insertAt`·`replaceAt` 추가. `index.ts`: 새 IPC(`folders:add`, `folders:remove`, `folders:restore`, `folders:locate`, `folders:reveal`, `folders:add-paths`)와 메뉴 변경. `view.ts`: `FolderEntry`에 `doan ls`의 `git`과 `changedAt?`을 담는다. `.git`의 내용은 해석하지 않는다. 존재 여부(`lstat`)만 본다(아래 '추가 흐름' 3단계). |
| preload | 위 IPC와 드래그 앤 드롭 경로 변환(`webUtils.getPathForFile`)을 노출한다. |
| CLI(Go) | `doan ls` 결과에 선택 필드 `git`을 더한다(사용자 결정 Q1, 2026-10-24). 해석은 새 Go 패키지 함수(`cli/internal/repo` 아래 git 해석)가 맡는다. MCP `ls`는 같은 출력을 돌려준다. |
| 스킬(가이드) | 본문은 바뀌지 않는다. 다만 `ls` 출력이 바뀌므로 `/agent-eval`을 돌린다(AGENTS.md). |
| 공유 형식 | comment event·config·envelope 스키마는 바뀌지 않는다(아래 '형식 변경'). |

## 디자인 레퍼런스

Sorcerer(github.com/gbrasil720/sorcerer, MIT)는 2026-10-22 테마 결정(다크, 주황 강조색 하나, 시스템 산세리프 하나)의 레퍼런스다. 홈 카드 목록, 추가 흐름, 작업공간 상단 내비게이션의 초안을 그릴 때 이 저장소의 해당 화면을 직접 확인해 참고한다. 무엇을 가져왔는지는 초안에 출처와 함께 적는다(AGENTS.md 'Leave evidence for references'). 이 문서를 쓰는 시점에는 아직 확인하지 않았다.

## 화면 구조

- **창은 하나다**(ARCHITECTURE §7). 홈과 작업공간은 같은 창 안의 두 화면이고, IPC 발신자 검사(`fromWindow`)는 그대로다.
- **홈**: 상단 바(doan, + Add project, 앱 수준 상태 자리 — `app-setup`이 채운다) 아래에 저장소 카드 격자.
  - 카드에는 저장소 이름과 … 메뉴(Show in Finder, Remove from doan)가 있다. 그 아래 워크트리마다 한 줄: 브랜치 또는 `detached <짧은 sha>`, 캔버스 수, 열린 코멘트 수, 최근 변경 시각, 줄별 … 메뉴(Show in Finder, Remove from doan). Project settings 항목은 `app-setup`이 Settings 창을 만들 때 이 메뉴에 더한다.
  - 줄을 누르면 그 워크트리의 작업공간으로 간다.
  - git 저장소가 아닌 프로젝트는 브랜치 없이 한 줄이다.
- **문제 상태 줄**: 줄 안에 상태 칩과 바로 쓸 버튼을 둔다. 긴 경로 문단은 툴팁과 Show in Finder로 옮긴다.

  | 상태 (`FolderEntry.kind`) | 칩 | 버튼 |
  |---|---|---|
  | `uninitialized` | Not set up | Set Up…, Remove |
  | `notFound` | Missing | Locate…, Remove |
  | `error` | Config error | Show in Finder(`.doan/config.json`을 선택해 보여줌), Retry |
  | `cliError` | CLI error | Retry, Remove |
  | `loading` | Reading… | — |
- **작업공간**: 상단 바 `← | <저장소 이름> ▾ <브랜치> | 캔버스 경로`. ▾를 누르면 같은 카드의 다른 워크트리 목록이 나오고, 고르면 그 워크트리 작업공간으로 간다. 그 아래는 지금의 3단 레이아웃이다(사이드바는 현재 루트만).
- **홈으로 가기**는 작업공간을 숨길 뿐, 언로드하지 않는다. 열린 캔버스, 보기, 선택, 코멘트 초안이 그대로 남아서, 같은 작업공간으로 돌아오면 이어서 본다. 온보딩 마법사가 내비게이션이 아닌 것과 같은 원칙이다(ARCHITECTURE §7 'Onboarding').
- **다른 작업공간으로 전환**(홈에서 다른 줄을 누르거나 브랜치 전환기를 쓰는 경우)은 지금 사이드바에서 다른 프로젝트의 캔버스를 여는 것과 같은 내비게이션이다. 그래서 코멘트 초안 가드(Save/Discard/Keep writing)와 선택 해제 규칙을 그대로 따른다(ARCHITECTURE §3 'Selection lifetime', 'Transitions').
- **첫 실행 이후 화면**: 저장된 프로젝트가 없으면 홈의 빈 상태(+ Add project, 드롭 안내)를 보여준다. 재실행했을 때 어느 화면에서 시작할지는 `design-nav`가 정한다. 이 기능에서는 항상 홈에서 시작한다.

## 프로젝트 추가 흐름

입력은 두 가지다. 하나는 `folders:add`(대화상자; 여러 폴더를 고를 수 있게 `multiSelections`)이고, 다른 하나는 `folders:add-paths`(드롭)다. 둘 다 main에서 경로마다 아래 순서로 판단한다.

1. 경로가 디렉터리가 아니면 버린다(드롭된 파일 등). 모두 버려졌으면 메시지 상자를 띄운다.
2. 지금 규칙(ARCHITECTURE §13 'Opening')대로 `doan ls --json`을 그 폴더에서 실행한다.
   - list면 `result.root`를 저장한다. 하위 폴더를 골라도 저장소 루트로 모인다.
   - `repo_not_found`가 아닌 실패는 지금처럼 처리한다.
3. `repo_not_found`이면:
   - a. 그 폴더나 조상에 `.git`이 있으면(아래 git 해석, 위로 찾기) 그 git 작업 트리의 루트를 "Not set up"으로 저장한다. 고른 폴더가 하위 폴더였다면 루트로 모은다. 이 규칙은 2026-10-24 re-root와 같은 방향이다.
   - b. 없으면 고른 폴더는 저장소가 아니다. **그 폴더를 저장하지 않는다.** 바로 아래 자식 디렉터리(숨김 제외, 최대 200개) 중 `.git`이 있는 것을 후보로 모은다. 후보마다 `doan ls --json --repo <child>`로 doan 설정 여부를 묻는다(TS로 `.doan/`을 판단하지 않는다 — POSTMORTEM 2026-10-22).
   - 후보가 있으면 renderer에 체크 목록을 돌려준다(`AddProjectsDialog`). 이미 doan이 설정된 저장소는 기본으로 체크하고, 안 된 저장소는 체크하지 않는다. 사용자가 고른 것만 2단계부터 다시 처리해 저장한다.
   - 후보가 없으면 "No repositories found in <folder>."를 보여준다.
4. 저장한 항목의 `doan ls` 결과에 `git.worktrees`가 있고 아직 저장되지 않은 루트가 있으면, `WorktreeOfferDialog`로 함께 추가할지 묻는다(기본은 모두 체크).
5. 새로 저장한 카드로 스크롤하고 잠깐 강조한다.

## git 해석 (읽기 전용, Go `doan ls`)

결과 모양: `doan ls` → `{root, scope, canvases, git?}`. `git`은 `{common, branch?, detached?, worktrees: [root…]}`다.
- `common`은 common dir의 realpath이고, `worktrees`는 같은 저장소의 작업 트리 루트 목록이다(자기 자신 포함, 바이트 순서).
- `.git`이 없거나 해석에 실패하면 `git`을 생략한다. 명령은 실패하지 않는다.
- 설정 안 된 저장소(`repo_not_found`)는 결과가 없으므로 브랜치를 모른다. 그 카드는 브랜치 없이 한 줄로 보인다.

해석 규칙:
- `.git` 항목을 `lstat`한다.
  - 디렉터리면 그 안의 `HEAD`를 읽고, common dir은 `.git`이다.
  - 파일이면 `gitdir: <path>` 줄로 워크트리 git 디렉터리를 찾는다. 그 안의 `HEAD`와 `commondir` 파일(상대 경로면 그 디렉터리 기준)을 읽는다.
- `HEAD`가 `ref: refs/heads/<name>`이면 브랜치, 40·64자리 16진수면 detached다.
- 다른 워크트리: `<common>/worktrees/*/gitdir`의 내용은 각 워크트리의 `.git` 파일 경로다. 그 부모 디렉터리가 워크트리 루트다. main 작업 트리 루트는 `<common>`의 부모다(bare 저장소는 main 작업 트리가 없다).
- 묶는 키는 common dir의 realpath다. 홈 카드 이름은 main 작업 트리 루트의 basename이다. main 작업 트리가 목록에 없으면 첫 워크트리의 basename을 쓴다.
- `doan ls`를 실행할 때마다 한 번 읽는다. 크기 상한은 `HEAD`·`.git` 파일 4 KiB, `worktrees/` 항목 200개다. 실행하는 git 명령은 없다.
- 앱(TS)은 `.git`의 내용을 해석하지 않는다. 추가 흐름의 3a(조상 중 git 작업 트리 찾기)와 3b(하위 저장소 후보 고르기)에서는 `.git` 항목이 있는지만 `lstat`으로 본다. doan 설정 여부와 브랜치는 CLI 결과로만 안다.

## 제거·복구

- `folders:remove {path}`: 지금의 `folders:close`와 같은 해제(watcher, 서버 키, 선택·초안 규칙)를 한 뒤 `{index}`를 돌려준다. 카드 단위 Remove는 그 카드의 모든 워크트리 경로를 한 번에 보내고 `{removed: [{path, index}]}`를 받는다.
- 토스트: "<name> removed. Files stay in the repo." + Undo. 8초 동안 또는 다음 제거 전까지 떠 있다. Undo를 누르면 `folders:restore {items}`를 보낸다. main은 각 경로를 `insertAt`으로 원래 자리에 다시 넣고 여는 절차(새 서버 키, watcher)를 다시 밟는다. 이미 다시 추가된 경로는 건너뛴다.
- `folders:locate {path}`: 폴더 대화상자에서 고른 폴더를 위 추가 흐름의 1~3a 규칙으로 판단한다. 저장 가능하면 `replaceAt`으로 같은 자리를 바꾼다. 이미 목록에 있는 경로면 옛 항목만 지운다.
- `folders:reveal {path, target: "root" | "config"}`: `shell.showItemInFolder`. 경로는 renderer가 아니라 main의 저장 목록에서 찾는다.
- Retry는 지금의 `folders:reopen`이다.

## 최근 변경 시각

- `changedAt`은 `doan ls` 목록에 있는 캔버스 파일들의 mtime 최댓값(main `fs.stat`)이다. 캔버스가 0개면 없다. 다시 읽을 때마다 갱신한다.
- CLI에 필드를 더하지 않는다. 앱 표시용이고, `doan ls` 출력을 바꾸면 `/agent-eval`을 다시 돌려야 하기 때문이다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- Go(`go test ./...`): `parseGitFile(text) → gitdir`, `parseHead(text) → branch | detached`, `parseCommondir(text, base) → path`, `worktreeRoots(common, gitdirContents) → []string`(중복·잘못된 줄 제거). 파일 I/O와 분리한 순수 함수로 둔다.
- TS: `groupProjects(entries) → HomeCard[]` (저장 순서 유지, `git.common` 기준으로 묶기, 첫 등장 위치에 카드 배치, 카드 이름 규칙)
- `cardRow(entry) → {chip?, actions, summary}` (위 상태 표 — `projectRow.ts`를 대신한다)
- `classifyPick(lsResult, gitRoot) → store | scan | refuse` (추가 흐름 2~3단계 판정)
- `folders.insertAt`, `folders.replaceAt`
- `latestChange(mtimes) → number | undefined`
- `toastState` 리듀서(제거 → 표시, 다음 제거가 앞의 것을 대체, Undo·만료)

## 형식 변경

- JSON Schema 공유 형식(comment event, `.doan/config.json`, CLI envelope)은 바뀌지 않는다. envelope `v`도 그대로다.
- `doan ls`의 `result`에 선택 필드 `git`이 생긴다. CLI result 모양은 Go만 만들기 때문에 스키마가 아니라 ARCHITECTURE §12의 산문으로 관리한다(2026-10-21 결정). 거기에 날짜와 함께 더한다. 필드를 더하기만 하므로 기존 독자는 깨지지 않는다.
- `folders.json`은 지금처럼 경로 배열이다. 워크트리 묶음은 저장하지 않고 `doan ls`를 읽을 때마다 계산한다.
- `FolderEntry`(IPC 타입)에 `git?`과 `changedAt?`을 더한다. IPC 타입은 공유 형식이 아니다(ARCHITECTURE §11).

## 컨벤션 영향

없다. 캔버스 컨벤션과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **No git operations(PRODUCT §3 Out of scope 6)**: Go가 `.git` 안의 작은 텍스트 파일을 읽기만 한다. 실행하는 git 명령, 쓰기, 브랜치 조작은 없다. 앱은 이미 `git config user.name`을 읽기 전용으로 읽는다(ARCHITECTURE §2). 브랜치 전환기는 이미 추가된 워크트리 사이를 오가는 것이지 checkout이 아니다.
- **Discovery stays in Go only(ARCHITECTURE §13, POSTMORTEM 2026-10-22)**: 사용자 결정 Q1에 따라 git 해석도 Go에 둔다. TS는 `.git` 항목이 있는지만 `lstat`으로 본다(설정 안 된 폴더의 git 루트 찾기, 하위 후보 고르기). 내용 해석과 doan 설정 판단은 하지 않는다.
- **에이전트용 출력 변경**: `doan ls`(CLI·MCP) 결과에 `git`이 생기므로 `/agent-eval`을 돌린다(AGENTS.md). 가이드 본문은 바꾸지 않는다.
- **Renderer는 열거형·불투명 ID·저장 루트만 보낸다(ARCHITECTURE §7 onboarding 계약)**: 드래그 앤 드롭은 renderer가 임의 경로를 보내는 첫 IPC다. main은 이 경로를 대화상자에서 고른 경로와 똑같이 취급한다. 존재하는 디렉터리인지 확인하고, realpath를 구하고, 위 판단 순서를 밟는다. 그 밖의 IPC(reveal, remove, restore, locate)는 저장 목록에 있는 경로만 받는다.
- **대체되는 결정**:
  - 2026-10-22 Layout V1(사이드바에 Projects 트리) → 홈 + 작업공간
  - canvas-view Q5 "One sidebar holds folders, canvases and the open canvas's frame list"
  - 2026-10-22 display names(같은 basename이면 부모 폴더) → 저장소 카드 + 브랜치
  - 2026-10-22 Reopen/Close 행 동작과 상태 칩 문구 → 위 상태 표
  - 2026-10-24 Not initialized 행 문구
  - app-shell Q6(하위 폴더 → 루트)은 유지하고, 3a·3b로 확장한다.
  - 메뉴: File > Open Project…(⌘O) → Add Project…(⌘O). Go to Home(⇧⌘H)을 추가한다.
- e2e는 역할·접근 이름으로만 읽는다(2026-10-22 결정). 카드·줄·메뉴·토스트에 접근 이름을 준다.

## POSTMORTEM에서 가져올 함정

- **2026-10-22 "Guessing the repo root in TS…"**: CLI가 답하지 않는 저장소 질문은 TS로 추론하지 말고, 더 좁은 형태로 CLI에 다시 묻는다. 하위 저장소 후보의 doan 상태는 `doan ls --repo <child>`로 묻는다. grep: `grep -rnE '"\.doan"|config\.json' app/src | grep -v test` — 여전히 watcher만 걸려야 한다.
- **2026-10-21 "Filesystem APIs did not match 'missing' and 'same file'…"**: `.git` 파일과 `gitdir` 경로에 `ENOTDIR`, 끊어진 심볼릭 링크, 루프, 대소문자 차이를 테스트한다.
- **2026-10-24 "Focus did not return to the row when Set Up… closed from outside"**: 모달(추가 체크 목록, 워크트리 제안, Set Up)이 열린 동안 뒤의 요소에 포커스를 주지 않는다. 닫히고 언마운트된 뒤 카드로 포커스를 옮긴다.
- **2026-10-24 "The onboarding wizard lost keys and clicks to focus and modal stacking"**: 새 대화상자는 다른 모달이 열려 있을 수 있으므로 모달로 쌓고, 키는 창에서 처리한다.
- **2026-10-23 tooltip 두 건**: 카드의 경로 툴팁을 e2e에서 읽을 때 `hoverTooltip`을 쓴다.

## PoC 의존

없다. `.git` 해석과 `webUtils.getPathForFile`은 단위 테스트와 e2e로 확인한다. 드래그 앤 드롭은 Playwright로 실제 드롭을 만들기 어려울 수 있다. 그때는 main의 `folders:add-paths` 경로를 e2e로 확인하고, 실제 드롭은 수동 확인 항목으로 남긴다(tasks 참조).

## 확인 질문 답

- **Q1** (2026-10-24 사용자): 브랜치·워크트리 정보는 Go CLI가 `doan ls` 결과의 `git` 필드로 준다. 추천안(앱 main 해석) 대신 이 안을 골랐다. 저장소 해석을 Go 한 곳에 모으는 대신 `/agent-eval`이 필요하다.
