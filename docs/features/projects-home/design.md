# projects-home — 설계

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 앱 renderer | `App.tsx`에 화면 상태 `home \| workspace(root)`를 둔다. 새 컴포넌트: `Home`(카드 목록), `ProjectCard`, `AddProjectsDialog`(체크 목록), `SetUpFolderConfirm`, `Toast`(공통), `DropOverlay`, 작업공간 상단 바(←, 브레드크럼, 워크트리 전환기), 작업공간 상태 줄. 작업공간의 `Sidebar`는 현재 루트의 항목 하나만 받는다(트리 모양은 지금 그대로 두고, `design-nav`가 바꾼다). `projectRow.ts`의 상태별 문구와 동작은 줄 뷰 모델(`cardRow`)로 옮긴다. |
| 앱 main | `folders.ts`: `insertAt`·`replaceAt`. `index.ts`: 새 IPC(`folders:add`, `folders:add-paths`, `folders:scan`, `folders:scan-cancel`, `folders:add-candidates`, `folders:confirm-folder`, `folders:remove`, `folders:restore`, `folders:locate`, `folders:reveal`). 메뉴 변경(File, Edit의 Undo Remove, 새 Go 메뉴). 경로별 마지막 `git.common` 기억. 창 포커스 시 다시 읽기. `view.ts`: `FolderEntry`에 `git?`, `CanvasRow`에 `mtimeMs?`, `FolderEntry`에 `changedAt?`. |
| preload | 위 IPC, 드롭 경로 변환(`webUtils.getPathForFile`), 토스트·메뉴 이벤트를 노출한다. 기존 `openFolder()`는 계약 그대로 남긴다(마법사용). |
| CLI(Go) | `doan ls` 결과에 선택 필드 `git`(아래 'git 해석'). 해석은 `cli/internal/repo` 아래 새 파일이 맡고, I/O와 분리한 순수 함수를 둔다. `Context`에 홈 디렉터리 값을 더한다(`Run`이 채움 — 명령 본문은 환경을 읽지 않는 규칙 유지, ARCHITECTURE §12 'Structure'). MCP `ls`는 같은 출력을 돌려준다. |
| 스킬(가이드) | 본문은 바뀌지 않는다. `ls` 출력이 바뀌므로 `/agent-eval`을 돌린다(AGENTS.md). |
| 공유 형식 | JSON Schema(comment event·config·envelope)는 바뀌지 않는다(아래 '형식 변경'). |

## 디자인 레퍼런스

- Sorcerer(github.com/gbrasil720/sorcerer, MIT)를 기본 레퍼런스로 삼는다. 2026-10-22 테마 결정(다크, 주황 강조색 하나, 시스템 산세리프 하나)의 출처다.
- 필요하면 AGENTS.md가 꼽은 레퍼런스 서비스(Claude Design, Orca, ego-browser, Storybook 등)도 직접 확인한다(사용자 허용 2026-10-25).
- 홈 카드 목록, 추가 흐름, 작업공간 상단 내비게이션의 초안을 그릴 때 해당 화면을 확인한다. 가져온 것은 초안에 출처와 함께 적는다(AGENTS.md 'Leave evidence for references'). 이 문서를 쓰는 시점에는 아직 확인하지 않았다.

## 화면 구조

### 창과 화면

- 메인 창은 하나다(ARCHITECTURE §7). 홈과 작업공간은 같은 창 안의 두 화면이다.
- 이 기능의 IPC는 지금처럼 메인 창의 main frame만 받는다. `app-setup`이 Settings 창을 더할 때 허용 목록으로 바꾼다.

### 홈

- 상단 바에는 doan과 + Add Project가 있다. 연결 상태 칩은 `app-setup`이 더한다. 그 아래는 저장소 카드 격자다.
- 카드에는 저장소 이름(줄 뷰 모델 `groupProjects`의 이름 규칙)과 카드 메뉴(…·우클릭: Remove all)가 있다.
- 워크트리마다 한 줄이 있다. 줄의 내용:
  - 브랜치 또는 `detached <앞 7자리>`
  - 캔버스 수
  - 열린 코멘트 수(0보다 클 때)
  - 최근 변경(상대 시각, 툴팁에 절대 시각. 값이 없으면 "—")
  - 줄 메뉴(…·우클릭: Show in Finder, Remove from doan)
- 로드된 작업공간의 줄에는 "Open"을 표시하고 `aria-current`를 준다. 선택이 있으면 "Selected: <프레임 제목 또는 요소 태그·id>"도 표시한다.
- 정상 줄을 누르면 그 작업공간으로 간다. 문제 상태 줄을 누르면 그 줄의 첫 동작 버튼으로 포커스만 옮긴다.
- 빈 상태(저장된 프로젝트 없음): "Add a project to see its design canvases.", Add Project…, 드롭 안내.

### 문제 상태 줄

긴 경로 문단 대신 칩과 버튼을 둔다.

| 상태 (`FolderEntry.kind`) | 칩 | 버튼 |
|---|---|---|
| `uninitialized` | Not set up | Set Up…, Remove |
| `notFound` | Missing | Locate…, Remove |
| `error` | Config error | Show in Finder(루트), Retry, Details(오류 문구 펼침) |
| `cliError` | CLI error | Retry, Remove |
| `loading` | Reading… | — |

### 작업공간

- 상단 바: `← | <저장소 이름> › [<브랜치> ▾] › <캔버스 표시 이름>`
  - 저장소 이름: 이 기능에서는 누를 수 없다. `design-nav`가 개요로 가는 동작을 붙인다.
  - 브랜치 칩만 워크트리 전환기를 연다. 목록은 같은 카드의 다른 줄(문제 상태 줄은 비활성)이다.
  - 캔버스 표시 이름은 지금은 `design/` 기준 경로다. `design-nav`가 제목 우선으로 바꾼다.
- 그 아래는 지금의 3단 레이아웃이다. 사이드바는 현재 루트만 받는다.
- **작업공간 상태 줄**: 로드된 작업공간의 프로젝트가 문제 상태가 되면(폴더 삭제·이동, `git worktree remove`, config 깨짐, CLI 오류) 상단 바 아래에 칩·해당 동작·Go Home을 보인다. 홈으로 자동으로 튕기지 않는다. 캔버스 화면은 지금 규칙(사라진 캔버스는 뷰를 지움, 일시 오류는 마지막 뷰 유지)을 따른다. 코멘트 초안은 지금 규칙대로 유지한다.

### 메모리 모델 (R3)

- 로드된 작업공간은 최대 하나다.
- 홈으로 가면 작업공간을 `visibility: hidden` + `inert`로 숨기고 언로드하지 않는다. `display: none`은 쓰지 않는다. iframe 크기가 0이 되면 높이 동결 규칙(ARCHITECTURE §3 'Height')이 잘못 걸리기 때문이다.
- 숨겨진 동안에도 열린 캔버스, 보기, 선택, 코멘트 초안은 그대로다. `doan active`는 그 선택을 계속 돌려준다. 홈의 줄 표시("Open · Selected: …")로 사람이 그 사실을 볼 수 있다.
- 다른 루트의 작업공간으로 들어가면 내비게이션이다. 코멘트 초안 가드를 먼저 거치고, 선택을 해제한다(ARCHITECTURE §3 'Selection lifetime', 'Transitions').
  - 가드 문구에 원래 프로젝트와 캔버스 이름을 넣는다. 홈에서 보이지 않는 작업공간의 초안이기 때문이다.
  - Keep writing은 원래 작업공간으로 돌아가 초안에 포커스를 준다.
- renderer는 루트별 마지막 캔버스와 보기(배율·위치)를 메모리 맵에 기억한다. 작업공간에 다시 들어갈 때 그 캔버스가 아직 목록에 있으면 열고 보기를 적용한다. 없으면 작업공간 첫 화면을 연다. 디스크 저장과 재실행 복원은 `design-nav`가 한다.
- 워크트리 전환기: 대상 워크트리에 지금 캔버스와 같은 canvas id가 있으면 그것을 연다. 없으면 대상 루트에 기억된 캔버스로 가고, 그것도 없으면 첫 화면을 연다.
- 이 기능에서는 앱을 시작하면 항상 홈이다.

### 포커스와 키보드

- 홈으로 가면 로드된 작업공간의 줄에 포커스를 준다. 없으면 첫 카드에 준다.
- 작업공간으로 돌아오면 떠날 때 포커스가 있던 요소로 되돌린다. 그 요소가 사라졌으면 사이드바 트리로 보낸다.
- 카드 격자는 Tab으로 카드 사이를 이동한다. 카드 안에서는 ↑↓로 줄 사이를 이동하고, Enter로 연다.
- 모달(체크 목록, 확인, Set Up, 초안 가드)이 열린 동안에는 뒤의 요소에 포커스를 주지 않는다. 닫히고 언마운트된 뒤 원래 줄로 보낸다(POSTMORTEM 2026-10-24).

### 메뉴와 화면별 활성

- File: Add Project…(⌘O), Close Window(⌘W).
- Edit: 제거 토스트가 떠 있는 동안에만 기본 Undo 항목 자리에 "Undo Remove"(⌘Z)를 둔다. 받아들인 한계: 그 몇 초 동안 텍스트 입력란의 ⌘Z도 제거를 되돌린다. 홈에는 텍스트 입력란이 없다.
- 새 Go 메뉴: Home(⇧⌘H). Quick Open(⌘K)은 `design-nav`가 이 메뉴에 더한다(Finder의 Go 메뉴 관례).

| 메뉴 항목 | 홈 | 작업공간(캔버스 없음) | 작업공간(캔버스 열림) | 모달 열림 |
|---|---|---|---|---|
| Add Project… ⌘O | ✓ | ✓ | ✓ | — |
| Home ⇧⌘H | — | ✓ | ✓ | — |
| Zoom In/Out, Actual Size, Fit, Reload Canvas | — | — | ✓ | — |
| Undo Remove ⌘Z | 토스트가 있을 때 | 토스트가 있을 때 | 토스트가 있을 때 | — |

- 창이 숨겨진 상태에서 ⌘O를 누르면 창을 보이고 추가 대화상자를 연다. 2026-10-22 "Cmd+O shows the same window"를 넓힌 것이다.
- 활성 상태는 renderer가 화면을 바꿀 때 main에 알리고, main이 메뉴 항목의 `enabled`를 갱신한다.

### 공통 토스트

- 이 기능에서 정의하고, `design-nav`와 `app-setup`이 같은 컴포넌트를 쓴다.
- 창 아래 가운데에 하나만 뜬다. 새 토스트가 앞 토스트를 바꾼다. `role="status"`이고, 동작 버튼은 최대 하나다.
- 기본 8초 동안 떠 있다. 마우스를 올리거나 포커스가 있거나 창이 숨겨진 동안에는 타이머가 멈춘다.

## 프로젝트 추가 흐름

### 입력

- `folders:add`: 대화상자, `multiSelections`.
- `folders:add-paths {paths}`: 드롭. renderer가 `webUtils.getPathForFile`로 바꾼 절대 경로 문자열 배열이다. 32개 이하이고, 각 경로는 4,096자 이하다. 비문자열·상대 경로는 거부한다.
- 마법사의 `openFolder()`는 바꾸지 않는다(단일 선택, 루트 또는 null).

### 판정

main이 경로마다 판단한다(R1).

1. **디렉터리 확인.** realpath를 구하고, 디렉터리가 아니면 버린다. 모두 버려졌으면 토스트로 "Only folders can be added."를 보인다.
2. **doan 저장소인지 묻기.** 지금 규칙(ARCHITECTURE §13 'Opening')대로 그 폴더에서 `doan ls --json`을 실행한다.
   - list면 `result.root`를 저장한다.
   - `repo_not_found`가 아닌 실패는 지금처럼 처리한다.
   - 이미 저장된 루트면 저장하지 않고, 그 카드로 스크롤하고 강조한다.
3. **`repo_not_found`이면 조상으로 올라가지 않는다.**
   - ① 고른 폴더 자체에 `.git` 항목이 있으면(`lstat`) 그 폴더를 Not set up으로 저장한다.
   - ② 없으면 스캔한다. 바로 아래 자식 디렉터리(숨김 제외, 심볼릭 링크는 따라가지 않음, 이름순 최대 200개) 중 `.git` 항목이 있는 것이 후보다. 후보마다 `doan ls --json --repo <child>`로 doan 설정 여부를 묻는다.
     - 동시 실행은 4개, 하나당 기존 10초 제한이다. 진행은 이벤트로 알리고, Cancel(`folders:scan-cancel`)은 남은 실행을 끝낸다.
     - 후보는 main이 발급한 불투명 ID로 renderer에 간다. 표시용 이름과 경로는 함께 가지만, renderer는 ID만 돌려보낸다(`folders:add-candidates {scanId, ids}`). `chooseTokenCss`의 `choiceId`와 같은 패턴이다.
     - 후보의 상태는 셋이다: doan 설정됨, Not set up, Already added(비활성). CLI 실패·타임아웃은 "Couldn't read"로 비활성이다. 기본 체크는 doan 설정됨만이다.
   - ③ 후보가 없으면 `SetUpFolderConfirm`으로 "<folder> isn't a repository. Set it up as a doan project?"를 묻는다(`folders:confirm-folder {confirmId}`).
     - 확인하면 Not set up으로 저장하고 설정 폼(기존 `ProjectSetupDialog`)을 바로 연다.
     - 취소하면 아무것도 저장하지 않는다.
     - 이 확인은 고른 폴더가 HOME이거나 HOME보다 위일 때도 그대로 묻는다. 기본값이 아니라 명시적 선택이기 때문이다.
4. **워크트리 하위 항목.** 저장할 저장소의 `git.worktrees` 중 아직 저장되지 않은 것은 체크 목록에서 그 저장소 아래 하위 항목으로 함께 보이고, 기본으로 체크되지 않는다(R6).
   - 저장소를 하나만 추가해서 체크 목록이 필요 없던 경우에도, 저장되지 않은 워크트리가 있으면 같은 대화상자를 그 워크트리 항목만으로 띄운다.
5. **강조.** 홈에 있으면 새로 저장한 카드로 스크롤하고 잠깐 강조한다. 작업공간에 있으면 "Added <name>" 토스트에 Open 동작을 둔다.

### 드롭

- `dragenter`부터 `DropOverlay`가 창 전체를 덮는다. 캔버스 iframe(OOPIF)도 덮어서, 드롭 이벤트가 renderer에 오게 한다.
- 모달이 열려 있으면 오버레이를 띄우지 않고 드롭을 무시한다.
- 창 탐색은 지금처럼 막혀 있다(ARCHITECTURE §7).

## git 해석 (읽기 전용, Go `doan ls`)

### 결과 모양

`doan ls` → `{root, scope, canvases, git?}`이고, `git`은 아래와 같다.

```
{
  common: string,        // common dir의 realpath (절대 경로)
  main?: string,         // main 작업 트리에 해당하는 doan 루트 (절대 경로)
  branch?: string,       // refs/heads/ 아래 이름
  detached?: string,     // 전체 sha (40 또는 64자리 16진수)
  worktrees: string[]    // 같은 저장소 워크트리별 doan 루트 (자기 자신 포함, 절대 경로, 바이트 순서, 최대 200개)
}
```

- `common`, `main`, `worktrees`는 절대 경로다. ARCHITECTURE §12의 "repo-relative paths" 규칙의 예외이며, `root`와 같은 취급이다.
- `.git`이 없거나 해석에 실패하면 `git`을 생략한다. 명령은 실패하지 않는다.
- 설정 안 된 저장소(`repo_not_found`)는 결과가 없으므로 브랜치를 모른다. 그 줄은 브랜치 없이 보인다.

### 해석 규칙

- **git 작업 트리 찾기.** doan 루트에서 위로 올라가며 `.git` 항목(파일 또는 디렉터리)이 있는 첫 디렉터리를 찾는다(R2). 그 디렉터리가 홈 디렉터리이거나 그 위면 무시하고 `git`을 생략한다(dotfiles 저장소가 모든 프로젝트를 한 카드로 묶지 않게).
- **`.git` 읽기.**
  - 디렉터리면 그 안의 `HEAD`를 읽고, common dir은 그 `.git`이다.
  - 파일이면 `gitdir: <path>` 줄로 워크트리 git 디렉터리를 찾는다(상대 경로면 `.git` 파일이 있는 디렉터리 기준). 그 안의 `HEAD`를 읽는다. `commondir` 파일이 있으면 그 경로(상대면 그 git 디렉터리 기준)가 common이고, 없으면 그 git 디렉터리가 common이다(submodule).
- **HEAD.** `ref: refs/heads/<name>`이면 브랜치, 40·64자리 16진수면 detached다. 그 밖(예: reftable의 placeholder, `refs/heads/` 밖의 ref)이면 둘 다 생략한다. CRLF와 끝 개행은 허용한다.
- **main 작업 트리.** `basename(common) == ".git"`이고, 그 부모의 `.git`이 디렉터리이며 realpath가 common과 같을 때만 그 부모를 main 작업 트리로 인정한다. 아니면 main이 없다(bare, submodule, separate-git-dir).
- **다른 워크트리.**
  - 각 `<common>/worktrees/<name>/gitdir`의 내용(절대 경로이거나, 그 `<name>` 디렉터리 기준 상대 경로)은 그 워크트리의 `.git` 파일 경로다. 그 부모가 워크트리 작업 트리다.
  - 작업 트리 목록(main 포함)을 realpath + 디스크 표기로 바꾼다(POSTMORTEM 2026-10-21). 없는 것(prunable)은 뺀다.
- **doan 루트 매핑(R2).** 현재 doan 루트의 작업 트리 기준 상대 경로 `rel`을 구한다. 각 작업 트리에 `rel`을 붙인 경로가 디렉터리로 있으면 그 realpath를 `worktrees`에 넣는다. `main`도 같은 방식으로 매핑하고, 없으면 생략한다.
- **상한.** `HEAD`·`.git`·`gitdir`·`commondir` 파일은 4 KiB, `worktrees/` 항목은 200개다. 넘으면 그 항목만 버린다.
- 실행하는 git 명령은 없다.

### 앱 쪽 처리

- 앱(TS)은 `.git`의 내용을 해석하지 않는다. 추가 흐름 3단계에서 "이 폴더나 이 자식에 `.git` 항목이 있는가"만 `lstat`으로 본다.
- 묶는 키는 `git.common`이다. main은 저장 경로별로 마지막에 본 `common`을 메모리에 기억한다. 그래서 줄이 list가 아닌 상태(Missing, Config error, CLI error)가 되어도, 앱을 다시 켜기 전까지는 같은 카드에 남는다.
- 카드 이름은 `main`의 basename이다. `main`이 없으면 카드 안 첫 줄 루트의 basename이다.
- 브랜치 표시 갱신: root watcher는 `.git/HEAD`를 보지 않는다. 그래서 창이 포커스를 얻을 때 저장된 모든 루트를 다시 읽는다. 60초에 한 번으로 제한하고, `app-setup`의 상태 읽기와 같은 스로틀을 쓴다.

## 제거·복구

- **`folders:remove {paths}`**(줄 하나 또는 카드의 모든 줄)
  - 대상에 로드된 작업공간이 있으면 지금의 `folders:close`처럼 코멘트 초안 가드를 거친다. 가드는 한 번만 띄운다.
  - 취소되면 `{kind: "cancelled"}`를 돌려준다.
  - 통과하면 각 경로를 해제(watcher, 서버 키, 선택)하고 `{kind: "removed", removalId, label}`을 돌려준다. 로드된 작업공간을 지웠으면 renderer는 홈으로 간다.
- **`removalId`.** main이 `{paths, indexes}`를 보관하는 불투명 ID다. 다음 제거나 renderer의 만료 알림이 오면 버린다.
- **`folders:restore {removalId}`.** 보관한 경로를 `insertAt`으로 원래 자리에 넣고, 여는 절차(새 서버 키, watcher)를 다시 밟는다. 그 사이 다시 추가된 경로는 건너뛴다. 선택과 작업공간은 되돌리지 않는다.
- **토스트.** "<label> removed. Files stay on disk." + Undo. `label`은 줄 하나면 "<저장소> (<브랜치>)", 카드면 "<저장소> and N worktrees"다.
- **`folders:locate {path}`.** 저장 목록에 있는 경로만 받는다. 폴더 대화상자에서 고른 폴더를 추가 흐름의 1~3① 규칙으로 판단하고, 저장할 수 있으면 `replaceAt`으로 같은 자리를 바꾼다. 고른 경로가 이미 다른 자리에 저장돼 있으면 옛 항목만 지운다.
- **`folders:reveal {path}`.** 저장 목록에 있는 경로만 받는다. `shell.showItemInFolder(root)`로 루트만 보인다. TS가 `.doan/config.json` 경로를 조립하지 않는다(re-root 규칙상 그 config가 다른 곳에 있을 수 있다).
- **Retry**는 지금의 `folders:reopen`이다.

## 최근 변경 시각

- `CanvasRow.mtimeMs`: `doan ls` 목록의 각 캔버스 파일 mtime(main `fs.stat`)이다. 그 사이 지워진 파일(ENOENT)은 값을 비운다.
- `FolderEntry.changedAt`: 그 최댓값이다. 캔버스가 0개면 없다.
- 다시 읽을 때마다 갱신한다. CLI에 넣지 않는다(앱 표시용).
- `design-nav`(개요 카드)와 `app-setup`(가장 최근 캔버스 열기)이 이 값을 쓴다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- Go(`go test ./...`, 파일 I/O 없음):
  - `parseGitFile(text) → gitdir`
  - `parseHead(text) → branch | detached | none`
  - `parseCommondir(text, base) → path`
  - `isMainWorktree(common, parentGitIsSameDir) → bool`
  - `mapWorktrees(trees, rel) → []string`
  - `worktreeGitdirs(entries) → []string`(중복·잘못된 줄 제거)
  - `ignoreAtOrAboveHome(dir, home) → bool`
- TS:
  - `groupProjects(entries, lastCommon) → HomeCard[]`(저장 순서 유지, `common` 기준 묶기, 첫 등장 위치에 카드 배치, 카드 이름 규칙)
  - `cardRow(entry, loaded, selection) → {chip?, actions, summary, current}`(상태 표, Open·Selected 표시)
  - `classifyPick({isDir, ls, hasGit, children}) → store | duplicate | scan | confirm | drop`
  - `scanCandidates(children, lsResults, saved) → Candidate[]`(상태·기본 체크·워크트리 하위 항목)
  - `folders.insertAt`, `folders.replaceAt`
  - `latestChange(mtimes)`
  - `toastState` 리듀서(표시, 교체, 일시정지, 만료, Undo)
  - `menuState(screen, modal, toast) → enabled map`
  - `switchTarget(currentCanvasId, targetRows, remembered) → canvas | null`(워크트리 전환기)

## 형식 변경

- JSON Schema 공유 형식(comment event, `.doan/config.json`, CLI envelope)은 바뀌지 않는다. envelope `v`도 그대로다.
- `doan ls`의 `result`에 선택 필드 `git`이 생긴다(위 모양). CLI result 모양은 Go만 만들기 때문에 스키마가 아니라 ARCHITECTURE §12의 산문으로 관리한다(2026-10-21 결정). 필드를 더하기만 하므로 기존 독자는 깨지지 않는다.
- `folders.json`은 지금처럼 경로 배열이다. 묶음은 저장하지 않는다.
- IPC 타입(`FolderEntry.git?`, `FolderEntry.changedAt?`, `CanvasRow.mtimeMs?`)은 공유 형식이 아니다(ARCHITECTURE §11).

## 컨벤션 영향

없다. 캔버스 컨벤션과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **No git operations(PRODUCT §3 Out of scope 6)**: Go가 `.git` 안의 작은 텍스트 파일을 읽기만 한다. git 명령 실행, 쓰기, 체크아웃은 없다. 앱은 이미 `git config user.name`을 읽기 전용으로 읽는다(ARCHITECTURE §2).
- **Discovery stays in Go(ARCHITECTURE §13, POSTMORTEM 2026-10-22)**: git 해석과 doan 판단은 Go에 둔다. TS는 `.git` 항목이 있는지만 `lstat`으로 보고, 조상으로 올라가지 않는다(R1).
- **에이전트용 출력 변경**: `doan ls`(CLI·MCP) 결과에 `git`이 생기므로 `/agent-eval`을 돌린다. 가이드 본문은 바꾸지 않는다.
- **Renderer → main 계약(ARCHITECTURE §7: enums, opaque IDs, stored roots only)**: 드롭(`folders:add-paths`)만 renderer가 임의 경로를 보내는 예외다. main은 이를 대화상자 결과와 같이 검증한다. 스캔 후보·확인·제거 복구는 main이 발급한 ID만 받는다. reveal과 locate는 저장 목록의 경로만 받는다.
- **대체되거나 바뀌는 결정**:
  - PRODUCT §7 2026-10-22 Layout V1(사이드바에 Projects 트리) → 홈 + 작업공간
  - canvas-view Q5 "One sidebar holds folders, canvases and the open canvas's frame list"
  - 2026-10-22 display names(같은 basename이면 부모 폴더) → 저장소 카드 + 브랜치
  - 2026-10-22 Reopen/Close 행 동작과 상태 칩 문구 → 위 상태 표
  - 2026-10-22 Close Window 행의 "File menu: Open Project… (Cmd+O)"와 "Cmd+O show the same window" → Add Project…(⌘O), 숨긴 창이면 보이고 대화상자를 연다
  - 2026-10-24 "Not initialized rows say … / Choose Set Up… in the sidebar" → 줄 칩 "Not set up". 열린 캔버스 메시지는 "The project <name> is not set up. Use Set Up… on Home."으로 바꾼다
  - ARCHITECTURE §13 cli-core 세부 "`.git` is not consulted" → 저장소 탐색(`.doan/config.json`)에서는 여전히 쓰지 않는다. `git` 결과 필드를 위해서만 읽는다
  - ARCHITECTURE §13 'Opening'의 "On `repo_not_found` it stores the folder's real path" → R1의 3단 판정
  - ARCHITECTURE §13 "worktrees have different roots and stay separate" → 저장 경로는 그대로 따로이고, 홈 표시만 묶는다
  - app-shell Q6(하위 폴더 → 루트)은 유지한다
- e2e는 역할·접근 이름으로만 읽는다(2026-10-22 결정). 카드·줄·메뉴·토스트·오버레이에 접근 이름을 준다.

## POSTMORTEM에서 가져올 함정

- **2026-10-22 "Guessing the repo root in TS…"**: doan 판단은 `doan ls --repo <child>`로 묻는다. grep: `grep -rnE '"\.doan"|config\.json' app/src | grep -v test` — 여전히 watcher만 걸려야 한다(reveal이 config 경로를 조립하지 않는 이유).
- **2026-10-21 "Filesystem APIs did not match 'missing' and 'same file'…"**: `.git` 파일과 `gitdir`·`commondir` 경로에 `ENOTDIR`, 끊어진 심볼릭 링크, 루프, 대소문자 차이를 테스트한다. 워크트리 경로는 realpath·디스크 표기로 비교한다.
- **2026-10-24 "Focus did not return to the row when Set Up… closed from outside"**: 모달이 열린 동안 뒤에 포커스를 주지 않는다.
- **2026-10-24 "The onboarding wizard lost keys and clicks to focus and modal stacking"**: 새 대화상자는 모달로 쌓고, 키는 창에서 처리한다.
- **2026-10-23 tooltip 두 건**: 줄의 툴팁을 e2e에서 읽을 때 `hoverTooltip`을 쓴다.
- **2026-10-23 "Draft guards changed existing transition timing"**: 홈 진입(숨기기)은 가드를 거치지 않고, 다른 루트 진입·제거는 거친다. 둘 다 e2e로 확인한다.

## PoC 의존

없다.
- `.git` 해석은 단위 테스트로 확인한다.
- `webUtils.getPathForFile`은 Electron 45의 공식 API이고, sandbox preload에서도 쓸 수 있는지는 구현 첫 작업에서 확인한다.
- 실제 Finder 드롭은 Playwright로 만들 수 없으면 수동 확인으로 남긴다.

## 확인 질문 답

- **Q1** (2026-10-24 사용자): 브랜치·워크트리 정보는 Go CLI가 `doan ls` 결과의 `git` 필드로 준다(추천안이던 "앱 main 해석" 대신).
- **R1** (2026-10-25 리뷰): 조상 찾기 없이 3단 판정(추천안).
- **R2** (2026-10-25 리뷰): 모노레포에서 Go가 위로 찾고 같은 상대 경로로 매핑한다(추천안).
- **R3** (2026-10-25 리뷰): 작업공간은 하나만 로드하고, 선택을 유지하며, 같은 캔버스를 연다(추천안).
- **R6** (2026-10-25 리뷰): 워크트리 제안은 기본 체크 해제(추천안).
- 나머지 리뷰 보완(제거 ID, `git` 모양, 상태 정의, 메뉴 활성 표, 토스트 등)은 일괄 승인(2026-10-25)으로 반영했다.
