# Git 저장소가 아닌 폴더에서 Keep out of Git — 설계

## 근거 문서

- PRODUCT §3 Out of scope 6 'Git operations': Doan이 실행하는 git 명령은 onboarding clone 하나뿐이다. Doan이 쓰는 Git 설정은 exclude 쌍과 `.gitattributes` 줄뿐이다. 이 기능은 `git init`을 두 번째 예외로 더한다(사용자 결정).
- PRODUCT §3 'Launch environment': 실행한 터미널의 환경은 Doan이 실행하는 git에 닿지 않는다.
- PRODUCT §5 item 0 'Doan files'와 Project Settings 항목에서 이 기능과 관련된 규칙은 다음과 같다.
  - Set Up에는 두 라디오가 있고, 비 Git 폴더에서 Keep out of Git을 고르면 거절한다.
  - 실패하면 아무것도 쓰지 않는다.
  - Project Settings의 저장 방식은 확인 없이 즉시 쓰고, 쓴 뒤 포커스는 선택된 쪽으로 간다.
  - 페이지는 Share 확인이나 쓰기가 열려 있는 동안 잠긴다.
- ARCHITECTURE §4 'Storage in onboarding', §7 'First-run onboarding' Clone(`locateGit`, `cloneEnv`), §7 'Storage writes', §11 'Shared formats', §12 'Storage'와 'Structure'(명령 본문은 환경을 읽지 않고 `Context`로 받는다), §13(Go만 Git 메타데이터를 해석하고, HOME과 그 위의 `.git`은 무시한다).

## POSTMORTEM에서 걸리는 함정

- **2026-10-25 "Init published success before merge setup could fail"**: 실패할 수 있는 단계가 끝나기 전에 성공을 알리지 않는다. 여기서는 저장소 만들기부터 `.doan/` 쓰기까지 전부 끝나야 성공이다.
- **2026-10-24 "Setup writes to missing targets could overwrite a competitor"**: 없던 대상은 배타적으로 만든다. 되돌리기는 이번 실행이 만든 것만 지운다. 아래 '실행'의 `.git` 확보가 이 규칙을 따른다.
- **2026-11-07 "Setup reported success while the project row still read Not set up"**: Set Up 뒤에는 자기 쓰기 이후의 읽기를 확인하는 `shell.initialize` 흐름을 그대로 탄다. `.git` 생성도 폴더 watcher를 깨운다.
- **2026-11-07 "The eval fake's auth status comparison broke…"**: onboarding DTO와 소켓 스키마가 바뀌므로 `verify.mjs --eval`을 돌린다.

## 흐름

저장소는 Go CLI가 만든다. 앱의 모든 경로가 이미 `doan init`이나 `doan config --storage`를 거치므로, 실행·되돌리기·git 위치 판정이 한 곳에 모인다. 사용자 결정은 두 가지다. CLI 직접 실행도 저장소를 만든다. 단, `--git-init` 플래그가 있을 때만이다.

### 1. 판정 (Go)

`doan ls`가 config 없는 폴더에 내는 `repo_not_found` 오류(`repo/find.go`의 "No config")에 선택 필드 `error.storageReason`을 더한다.

- 값은 `"not_git"`이다. `repo.ReadStorage`가 `errNotGit`을 낼 때만 붙는다.
- 다음 경우에는 붙지 않는다: 다른 명령의 `repo_not_found`, 경로가 없는 폴더, 디렉터리가 아닌 경로.
- HOME과 그 위의 `.git`은 저장소로 치지 않는다(§13). 따라서 dotfiles 저장소 아래 폴더도 `not_git`이다.
  - 이런 폴더에는 새 저장소를 중첩해 만든다(사용자 결정).
  - HOME 자체와 그 상위는 `not_git`이지만, 실행 단계에서 거절한다.

이미 Set Up 된 프로젝트는 지금처럼 `doan ls`의 `storageReason: "not_git"`을 가진다.

### 2. 계획 (TS)

- `FolderState`의 `uninitialized`가 `notGit?: true`를 가진다. 이 값은 사이드바 엔트리를 거쳐 Set Up 폼까지 간다.
- `plannedChanges(root, state, plan)`: plan이 `local`이고 `notGit`이면 `.git/`을 더한다. `repo`이거나 `kept`면 더하지 않는다.
- 소켓 v2 `OnboardingChange` enum에 `.git/`을 추가한다.
- 화면에 `.git/`을 보여 준 경우에만 `--git-init`을 넘긴다. 근거는 경로마다 다르다.
  - Set Up 폼: 다이얼로그가 보여 준 목록
  - 첫 실행과 Add Projects: 동의 토큰에 묶인 inspection
  - `initArgs`는 이 근거를 인자로 받는다.
- 실행 직전 다시 읽은 결과가 달라도 플래그의 의미는 그대로다.
  - 이미 저장소면 Go가 아무것도 하지 않는다.
  - 화면에 없던 `not_git`이면 지금처럼 `local_not_git`으로 거절한다.

### 3. 실행 (Go)

`--storage local --git-init`이고 `ReadStorage`가 `not_git`이면, 다른 쓰기보다 먼저 저장소를 만든다.

- **거절 (아무것도 쓰지 않음)**
  - 폴더가 HOME이거나 그 상위면 거절한다. 코드는 `local_not_git`이고 message와 NextSteps가 HOME 전용이다("Doan doesn’t create a Git repository in your home folder…"). NextSteps에 `--git-init`을 적지 않는다.
  - `--git-init`과 `--storage repo`를 함께 쓰거나, `--git-init`만 쓰면 `usage_error`다.
  - 이미 저장소면 `--git-init`은 아무것도 하지 않는다.
- **git 위치**: clone(TS `locateGit`)과 같은 규칙을 Go에 둔다(사용자 결정).
  - PATH에서 처음 찾은 `git`을 쓴다.
  - 그것이 `/usr/bin/git`이면, 활성 개발자 디렉터리에 `usr/bin/git`이 있을 때만 쓴다. 활성 개발자 디렉터리는 `DEVELOPER_DIR`, `/var/db/xcode_select_link`, 없으면 `/Library/Developer/CommandLineTools` 순서로 찾는다.
  - `xcode-select`를 부르지 않으므로 CLT 설치 창이 열리지 않는다.
  - PATH, 개발자 디렉터리, git 실행기는 `Context`로 주입한다(§12 'Structure'). 앱이 실행하는 CLI에는 로그인 셸 PATH와 clone이 쓰는 `DEVELOPER_DIR`을 넘긴다. 그래서 clone과 판정이 같다.
  - git이 없으면 기존 코드 `git_missing`(exit 5)으로 거절한다. 아무것도 쓰지 않는다.
- **환경**: 허용 목록으로 새로 만든다.
  - 넘기는 것: `HOME`, 주입된 `PATH`, `DEVELOPER_DIR`, `LANG`, `GIT_TERMINAL_PROMPT=0`.
  - `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_CONFIG_*`, `GIT_CONFIG_PARAMETERS`, `GIT_OBJECT_DIRECTORY`를 포함한 나머지 `GIT_*`는 모두 넘기지 않는다.
  - stdin은 닫고, stderr는 결과에 싣지 않는다.
- **`.git` 확보 (경쟁)**: 먼저 `os.Mkdir(<folder>/.git)`로 빈 디렉터리를 배타적으로 만든다.
  - `EEXIST`면 다른 프로세스가 만든 것이다. 손대지 않고 거절한다.
  - 만들었으면 그 dev/ino를 기록한다.
  - 그다음 `git init --quiet --template=`을 실행한다. 빈 `.git` 디렉터리에 init이 되는지는 PoC로 확인한다. 안 되면 임시 형제 폴더에 init한 뒤 rename하는 방식으로 바꾼다.
- **명령**: `--template=`으로 hook 견본을 복사하지 않는다. 사용자의 `init.defaultBranch`와 `init.defaultObjectFormat`은 따른다.
  - sha256 저장소를 Go `ReadGit`이 읽는지는 PoC로 확인한다.
  - `git init`이 실패하면(권한, 읽기 전용 볼륨, Xcode 라이선스 미동의 등) CLI 전용 새 코드 `git_init_failed`로 거절하고 되돌린다.
- **확인**: init 뒤 `ReadStorage`가 저장소를 보는지 확인한다. 보지 못하면 실패로 보고 되돌린다.
- **나머지 쓰기**: 기존 local 쓰기다. exclude 쌍은 `info/`를 배타적으로 만드는 기존 경로로 쓴다. `--template=`이면 `info/exclude`가 없기 때문이다. 그다음 `.doan/`을 쓴다. `configStorage`는 init 뒤 다시 읽은 storage로 판단한다.
- **되돌리기**: 저장소를 만든 뒤 이후 단계가 실패하면, `.git`의 dev/ino가 기록과 같을 때만 지운다.
  - 지우기에 실패하면 기존 코드 `cleanup_failed`를 낸다. message와 NextSteps에 남은 `.git`의 경로를 적는다.
  - 되돌리기 범위는 `.git`뿐이다. 지금 init은 config rename이 실패해도 `.doan/canvases/`와 exclude 쌍을 남기고, 이 동작은 바꾸지 않는다.
- **결과**: init의 `created`, config의 `written`에 `.git/`이 들어간다.
- **`--git-init` 없이 `not_git`**: 지금처럼 `local_not_git`이다. NextSteps는 "Ask the user first; pass --git-init only when they agree to create a Git repository here"다. `skill.md`에도 같은 규칙을 적는다.

### 4. 화면 (renderer)

- **Set Up 폼** (`ProjectSetupDialog.tsx`): Keep out of Git이고 `notGit`이면 Will add 목록 맨 위에 `.git/ — a new Git repository` 줄을 둔다. ", if missing" 접미는 붙이지 않는다.
- **첫 실행과 Add Projects 설정 패널** (`Onboarding.tsx`): Keep out of Git이고 inspection 후보가 `notGit`이면 저장 방식 카드 아래에 "Doan will run `git init` here to create a Git repository." 한 줄을 둔다(사용자 결정). 라디오를 바꿀 때 이 줄도 바로 바뀐다.
- **Project Settings** (`ProjectSettingsPage.tsx`, `storageRules.ts`)
  - `not_git`에서 Keep out of Git을 활성으로 바꾼다. 이유 문장은 "This folder isn't a Git repository. Choosing Keep out of Git creates one here."이다.
  - 고르면 Share 확인과 같은 `SettingsDialog`를 연다(사용자 결정).
    - 모달이고, 포커스는 Cancel에 있다. Escape는 Cancel이다. 주 버튼은 prominent "Create Repository"이고, 경고색은 쓰지 않는다.
    - 제목: "Create a Git repository in `<folder>`?" `<folder>`는 페이지 경로 줄과 같은 `~/…` 경로다(사용자 결정).
    - 설명: "Keep out of Git needs a Git repository. Doan will run `git init` here, then keep `.doan/` out of it. Doan makes no commit, branch or remote, and the repository stays if you switch back to Include in Git."
    - 대화상자는 `aria-describedby`로 설명을 잇는다. 공용 `SettingsDialog`를 고치므로 Share 확인 창도 같이 바뀐다(사용자 결정).
  - 창이 열려 있는 동안 페이지를 잠근다(`projectSettingsLocked`). deep link를 버리는 것과 포커스 반환을 미루는 것도 Share 확인과 같다.
  - 다음 경우에는 창을 닫는다.
    - 프로젝트가 Missing이 되거나 reroot된다.
    - 다시 읽은 결과에서 `storageReason`이 사라진다(밖에서 저장소가 생김). 이때는 즉시 쓰는 일반 전환으로 돌아간다.
  - Create Repository를 누르면 `doan config --storage local --git-init`을 실행한다.
    - 성공하고 결과의 `written`에 `.git/`이 있으면, 안내 줄을 "Created a Git repository here. Doan's lines stay in .gitattributes."로 한다.
    - Cancel이든 성공이든 포커스는 선택된 쪽으로 간다. Cancel이면 Include in Git이다.
- **HOME과 그 위** (사용자 결정): 앱은 HOME 경로를 알고 있으므로 이 폴더들에서는 `notGit`을 계획에 쓰지 않는다. `.git/` 줄, 패널 한 줄, 확인 창이 나오지 않는다. Keep out of Git으로 Set Up 하면 거절되고 전용 문구를 보여 준다: "Doan doesn’t create a Git repository in your home folder. Choose Include in Git, or choose a folder inside it." Include in Git으로 Set Up 된 홈 폴더 프로젝트의 Project Settings에서는 Keep out of Git이 비활성이고, 이유는 "Doan doesn’t create a Git repository in your home folder." 한 문장이다(사용자 결정).
- **오류 문구** (화면별, 사용자 결정)
  - `git_missing`
    - Set Up 폼: "Git isn't installed, so Doan can't create a repository here. Install the Command Line Tools with `xcode-select --install`, then try again, or choose Include in Git."
    - 설정 패널: "…`xcode-select --install`, then check again, or choose Include in Git." (Check again 버튼이 있다)
    - Project Settings: "…`xcode-select --install`, then choose Keep out of Git again."
  - `git_init_failed`: Set Up 폼은 "Couldn't create a Git repository here, so nothing was set up.", Project Settings는 "Couldn't create a Git repository here, so nothing changed." 한 문장만 보여 준다. 복구 문장은 없다(사용자 결정). 설정 패널은 소켓의 기존 `init_failed`로 받으므로 출시 문구 "Couldn't set up this folder. Check folder access and try again."를 그대로 쓴다(사용자 결정).
  - 설정 패널의 오류 버튼: `git_init_failed`와 `cleanup_failed`는 기존 Set Up 거절처럼 Choose another folder와 Retry다. `git_missing`은 Choose another folder와 Check again이다(사용자 결정).
  - `cleanup_failed`: Set Up 폼과 패널은 "Setup failed, and Doan couldn't remove the Git repository it created at `<path>/.git`. Remove it or keep it, then try again.", Project Settings는 "Couldn't switch to Keep out of Git, and Doan couldn't remove the Git repository it created at `<path>/.git`. Remove it or keep it, then try again."
  - 실패 뒤에는 폴더를 다시 읽는다(사용자 결정). `.git`이 남았으면 저장소로 읽힌다. Project Settings는 이유 줄이 사라지고 Keep out of Git이 즉시 쓰는 일반 전환이 된다. 오류는 다음 동작까지 남는다. Set Up 폼은 Will add에서 `.git/` 줄이 빠지고, 설정 패널은 카드 아래 `git init` 줄이 빠진다.
  - 오류 문장은 선택해 복사할 수 있다(`selectable`).
- **코드 칩** (사용자 결정): `git init`, `.doan/`, `xcode-select --install`, `<path>/.git`은 세 화면 모두 코드 칩이다. Set Up 폼은 `CHIPS`에 더하고, 설정 패널 알림과 Project Settings 메시지·확인 창 설명에도 같은 칩 렌더링을 둔다.
- **스크린리더** (사용자 결정): 저장소를 만든다는 고지를 동의 버튼에 `aria-describedby`로 잇는다. 설정 패널은 제출 버튼 → 카드 아래 한 줄, Set Up 폼은 Set Up Project → Will add 목록이다.
- **Project Settings의 이유 문장**은 이제 정보 문장이라 경고 아이콘 없이 보여 준다.
- 커밋 안내("If `.doan/` was committed before…")는 PRODUCT 규칙대로 새 저장소에서도 항상 보여 준다(사용자 결정).
- 기존 `local_not_git` 문구 세 곳은 그대로 둔다. 이전 CLI를 쓸 때와, ls와 init 사이에 상황이 바뀐 경우에 여전히 맞는 문장이기 때문이다.

## 받아들인 위험

앱은 CLI를 10초(`CLI_TIMEOUT_MS`) 뒤 SIGKILL로 끝낸다. 그 시점이 저장소를 만든 뒤라면, 되돌리기가 돌지 않아 `.git/`과 exclude 쌍이 남고 config는 없을 수 있다. 다음 Set Up은 그 폴더를 저장소로 보고 정상 진행하므로 스스로 복구된다. `git init`이 10초 안에 충분히 끝나는지는 PoC에서 잰다. 앱 종료나 cancel로 중단돼도 같다.

## 초안 요청

- 경로: `.doan/canvases/keep-out-git-init.html`, 캔버스 id `keep-out-git-init`. 이 화면들의 기존 초안(`doan-project-settings.html`, `doan-onboarding.html`, `doan-add-projects.html`)은 고치지 않는다.
- 프레임과 상태:
  - `setup-form`: Set Up 폼. Include in Git(`.git/` 없음), Keep out of Git + 비 Git(`.git/` 줄 있음), `git_missing`, `git_init_failed`, `cleanup_failed` 오류.
  - `setup-panel`: 첫 실행과 Add Projects 설정 패널. Keep out of Git + 비 Git의 카드 아래 한 줄, 같은 세 오류.
  - `project-settings`: 저장 방식 섹션. `not_git`의 새 이유 문장, 확인 창, 쓰는 중(잠김), 성공 안내 줄, 실패.
  - `copy`: 모든 문구와 접근 가능한 이름.
- `/design-sync`는 앞의 셋을 비교한다.
- 사용자가 초안을 확정했다(질문 라운드의 답 포함).

## 영향 받는 구성요소

- **CLI (Go)**
  - `ls.go`, `repo/find.go`: `error.storageReason`
  - `envelope.go`: `Error.StorageReason`, 코드 `git_init_failed`와 exit 값
  - `init.go`, `storage.go`: `--git-init`, 확보, 되돌리기
  - 새 `repo/gitinit.go`: 위치 판정, 환경, 실행
  - `run.go`, `Context`: PATH, 개발자 디렉터리, 실행기 주입
  - flags
  - `onboarding.go`: 코드별 steps 표
  - `skill.md`
- **app main**
  - `folderState.ts`: `notGit` 읽기, `STORAGE_REFUSALS`에 새 코드
  - `onboarding/states.ts` `initArgs`
  - `onboarding/projects.ts` `plannedChanges`·`planned`
  - `onboarding/projectAdder.ts`
  - `shell.ts` `initialize`, `cli.ts` `runInit`: 인자, 그리고 CLI 환경에 PATH·`DEVELOPER_DIR` 전달
  - `configBridge.ts`: `--git-init`
  - `onboarding/operations.ts`: 문구
- **renderer**: `ProjectSetupDialog.tsx`, `Onboarding.tsx`, `storageRules.ts`, `ProjectSettingsPage.tsx`, 그리고 사이드바 엔트리에서 폼까지 `notGit`을 넘기는 경로(`App`)
- **형식**: 아래 '형식 변경'

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- **TS**
  - `plannedChanges`: `notGit` + local이면 `.git/` 포함. repo나 `kept`면 미포함.
  - `folderState` 파싱: `repo_not_found`의 `error.storageReason`이 `not_git`일 때만 `notGit`.
  - `initArgs(…, gitInit)`.
  - `storageSectionView`: `not_git`에서 local 활성, 확인이 필요하다는 표시, 새 이유 문장.
  - 안내 줄: `written`에 `.git/`이 있을 때의 문장.
- **Go**
  - `locateGit(path, developerDir, executable)`
  - `gitInitDecision(storage, root, home, flags)`: 만듦, 거절(HOME, usage), 아무것도 안 함 중 하나를 고른다.
  - `gitEnv(base)`: 허용 목록
  - `gitInitArgs`
  - 되돌리기 결정(`.git`을 만들었는지, dev/ino가 같은지, 이후 단계가 실패했는지)
  - `repo_not_found`에 `storageReason`을 붙일지 정하는 결정

## 형식 변경

- `schema/cli-envelope.v1.schema.json`: error에 선택 필드 `storageReason`(`"not_git"`)을 더한다.
  - `error.config` 선례(ARCHITECTURE §12)를 따라 선택 필드이므로 `v`는 1 그대로다.
  - 호환: TS는 envelope를 엄격하게 검증한다. 그래서 이전 앱이 새 CLI를 만나면, Set Up 안 된 폴더의 `doan ls`가 `cliError`가 된다. 패키지 앱은 번들된 CLI만 쓰므로, 이 경우는 `DOAN_CLI`를 쓰는 개발 환경에서만 생긴다. 새 앱이 이전 CLI를 만나면 필드가 없으므로 `.git/` 없이 계획하고, 기존 `local_not_git` 거절이 그대로 온다.
- CLI 오류 코드 `git_init_failed`(exit 2, init과 config 전용): `envelope.go` 목록, `schema/fixtures/cli-envelope/onboarding/mapping.json`이 다루면 그곳, `app/src/formats/types.ts`의 코드 union.
- `schema/app-socket.v2.schema.json`: `OnboardingChange` enum에 `.git/`을 추가한다. storage를 요청하지 않으면 내지 않는다. 소켓 오류 코드는 기존 `git_missing`과 `cleanup_failed`를 재사용하고, 새 코드는 없다. `git_init_failed`는 onboarding에서 기존 `init_failed`로 옮긴다.
- CLI 플래그 `--git-init`(`init`, `config`).
- fixture
  - `repo_not_found` + `storageReason` envelope 하나: Go와 TS가 같이 읽는다.
  - `.git/`이 든 inspect 응답 하나: `schema/fixtures/app-socket-v2/`.

## 컨벤션 영향

없다. 캔버스 컨벤션과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **PRODUCT §3 Out of scope 6**: `git init` 예외를 더한다.
  - 조건 1: 어느 저장소에도 속하지 않은 폴더(HOME과 그 위 제외)에서만 한다.
  - 조건 2: Keep out of Git으로 Set Up 하거나 전환할 때만 한다.
  - 조건 3: 사람이 동의한 뒤에만 한다. 동의 방식은 경로마다 다르다. 앱은 보인 변경이나 확인 창, CLI는 `--git-init`이다.
  - "the only Git setting Doan writes" 문장도 고친다. `git init`이 `.git/config`를 만들기 때문이다.
  - 커밋, 브랜치, 원격, pull, fetch는 여전히 하지 않는다.
- **PRODUCT §5 item 0 'Doan files'와 Project Settings 항목**
  - 비 Git 폴더에서 Keep out of Git을 고를 때의 동작
  - Project Settings에서 저장 방식을 바꿀 때 확인 없이 즉시 쓴다는 규칙의 예외
  - 비활성 이유 문장
  - 잠금 문장에 새 확인 창 추가
- **ARCHITECTURE**: 다음 문장들을 고친다.
  - §4 'Storage in onboarding'
  - §7 Clone의 "the only git onboarding runs"
  - §7 'Storage writes'
  - §12 'Storage'
  - §13의 "The only Git command Doan runs is onboarding's clone"
  - Go가 처음으로 git 명령을 실행한다(`git init` 하나). 판정, 실행, 되돌리기는 Go가 한다. TS가 상위 `.git`을 찾지 않는 원칙은 그대로다.

## PoC 의존

모두 tasks 1에서 확인한다.

- `git init --quiet --template=`을 Apple Git과 Homebrew git에서 확인한다.
  - 미리 만든 빈 `.git` 디렉터리에 init되는가?
  - hook 견본 없이 만들어지는가?
  - 전역 `init.templateDir`과 `init.defaultBranch`를 어떻게 다루는가?
- `init.defaultObjectFormat=sha256` 저장소를 Go `ReadGit`과 `ReadStorage`가 읽는가?
- `git init` 시간: 중앙값과 최댓값이 10초 타임아웃에 비해 충분히 작은가?

## 결정 질문 (답함)

1. 범위: PRODUCT §3 Out of scope 6에 `git init` 예외를 더한다.
2. CLI 직접 실행(`doan init`, `doan config`)도 저장소를 만든다. 단, `--git-init`이 있을 때만이다. 에이전트는 사람이 동의했을 때만 이 플래그를 붙인다.
3. Project Settings의 Include in Git → Keep out of Git 전환도 확인 창을 거쳐 저장소를 만든다. 확인 창의 모양, 잠금, 포커스는 위 '화면'과 같다.
4. HOME과 그 위에서는 거절한다. dotfiles 저장소 아래 폴더에는 중첩 저장소를 만든다.
5. git 위치는 clone과 같은 규칙이다.
6. 경쟁 상황에서는 `.git`을 먼저 배타적으로 확보한다.
7. 첫 실행과 Add Projects 설정 패널은 저장 방식 카드 아래에 한 줄을 보여 준다.
8. 초안 질문 라운드(5개): 위 '화면'의 오류 문구, 패널 버튼, 확인 창 제목의 경로, `.git` 경로 칩.
9. 디자인 프리셋 검수(critique, audit, clarify) 라운드(6개): HOME에서 미리 숨김, 화면별 오류 문구, 세 화면 코드 칩, 스크린리더 연결 세 곳, 실패 뒤 다시 읽은 상태, 커밋 안내 유지.
