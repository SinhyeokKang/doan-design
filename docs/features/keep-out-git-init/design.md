# Git 저장소가 아닌 폴더에서 Keep out of Git — 설계

## 근거 문서

- PRODUCT §3 Out of scope 6 'Git operations': Doan이 실행하는 git 명령은 onboarding clone뿐이다. 이 기능이 `git init`을 두 번째 예외로 더한다(사용자 결정, scope gate에서 확인).
- PRODUCT §5 item 0 'Doan files': 두 라디오, 비 Git 폴더에서 Keep out of Git 거절, 실패 시 아무것도 쓰지 않음.
- ARCHITECTURE §7 'First-run onboarding' Clone: `locateGit`(개발자 디렉터리에 `usr/bin/git`이 있을 때만 `/usr/bin/git`, CLT 설치 창을 열지 않음), `cloneEnv`(프롬프트 끔), detached 그룹, stderr는 main에만.
- ARCHITECTURE §7 'Storage writes'와 §12 'Storage': 모든 Set Up 경로는 local 계획일 때만 `init`에 `--storage local`을 넘긴다(`initArgs`, `plannedChanges`, `CLONE_CHANGES`). Go만 Git 메타데이터를 해석한다. TypeScript는 Add 때 `.git` 존재만 `lstat`한다(§13).

## POSTMORTEM에서 걸리는 함정

- 2026-10-25 "Init published success before merge setup could fail": 실패할 수 있는 단계가 끝나기 전에 성공을 알리지 않는다. 여기서는 `git init`부터 `.doan/` 쓰기까지 전체가 끝나야 성공이다.
- 2026-10-24 "Setup writes to missing targets could overwrite a competitor": 없던 대상을 만들 때는 배타적으로 만든다. `git init` 직전에 `.git`이 생겼으면(경쟁자) 덮지 않고 거절한다. 되돌리기는 이번 실행이 만든 `.git`만 지운다.
- 2026-11-07 "Setup reported success while the project row still read Not set up": Set Up 뒤 자기 쓰기 이후의 읽기를 확인하는 `shell.initialize` 흐름을 그대로 탄다. `git init`이 만든 `.git`도 폴더 watcher를 깨운다.

## 흐름

`git init`은 Go CLI가 한다. 앱의 모든 경로가 이미 `doan init`·`doan config --storage`를 거치므로, 실행·되돌리기·git 위치 판정이 한 곳에 있다(사용자 결정: CLI 직접 실행도 `git init`, 단 `--git-init` 플래그가 있을 때만).

1. **판정 (Go)**: `doan ls`가 Set Up 안 된 폴더에 내는 `repo_not_found` 오류에 `details.storageReason: "not_git"`을 더한다. 폴더와 그 상위 어디에도 Git 저장소가 없을 때만이다(`repo.ReadStorage`의 `errNotGit`). TypeScript는 이 값만 읽고 상위 `.git`을 스스로 찾지 않는다(§13 유지). Set Up 된 프로젝트는 지금처럼 `ls`의 `storageReason: "not_git"`이 있다.
2. **계획 (TS)**: `plannedChanges(root, state, plan)`에서 plan이 `local`이고 state가 `notGit`이면 변경 목록에 `.git/`을 더한다. `FolderState`의 `uninitialized`가 `notGit?: true`를 가진다. `.git/`이 계획에 있으면 `initArgs`가 `--git-init`을 더한다.
3. **실행 (Go)**: `--storage local --git-init`이고 `ReadStorage`가 `not_git`이면, 다른 쓰기 전에 `git init`을 한다.
   - git 위치: TS `locateGit`과 같은 규칙을 Go에 둔다. 활성 개발자 디렉터리(`DEVELOPER_DIR`, `/var/db/xcode_select_link`, 없으면 `/Library/Developer/CommandLineTools`)에 `usr/bin/git`이 있을 때만 `/usr/bin/git`. `xcode-select`를 부르지 않아 CLT 설치 창이 열리지 않는다. 없으면 새 코드 `git_unavailable`, 아무것도 쓰지 않음.
   - 명령: cwd를 폴더로 둔 `git init --quiet --template=`. 템플릿이 비어 hook 견본이 복사되지 않는다. 환경은 clone처럼 프롬프트를 끄고(`GIT_TERMINAL_PROMPT=0`), stdin은 닫는다. 사용자의 `init.defaultBranch`는 따른다. stderr는 결과에 싣지 않는다.
   - 경쟁: 실행 직전 `.git`을 `lstat`해서 있으면 거절(`local_not_git`과 같은 계열의 새 메시지 "폴더가 바뀌었다"). 실행 뒤 `.git`이 디렉터리이고 `ReadStorage`가 저장소를 보는지 확인.
   - 그다음 기존 local 쓰기(exclude 쌍, `.doan/`).
   - 되돌리기: 이후 단계가 실패하면 이번 실행이 만든 `.git`을 지운다(실행 전 없었음을 확인한 경우만). 지우기에 실패하면 오류 NextSteps에 남은 `.git`을 적는다.
   - 결과: `created`(init) 또는 `written`(config)에 `.git/`이 들어간다.
   - `--git-init` 없이 `not_git`이면 지금처럼 `local_not_git`. NextSteps에 `--git-init`을 적는다. `--git-init`은 `--storage local`과만 쓸 수 있고(아니면 `usage_error`), 이미 저장소면 아무것도 하지 않는다.
4. **Project Settings (renderer)**: `storageReason: "not_git"`에서 Keep out of Git을 활성으로 바꾼다. 고르면 `.git/`을 만든다는 확인을 띄우고, 동의하면 `doan config --storage local --git-init`. 확인 없이 즉시 쓰는 다른 전환과 다르다. 확인의 모양은 `/design-draft`로 정한다.

## 영향 받는 구성요소

- **CLI (Go)**: `ls`의 `repo_not_found` details, `init.go`·`storage.go`(`--git-init`, `git init`, 되돌리기), 새 `repo/gitinit.go`(위치 판정·실행), `flags`, `envelope.go`(`git_unavailable`), `skill.md`(플래그와 코드).
- **app main**: `folderState.ts`(details 읽기, `STORAGE_REFUSALS`에 `git_unavailable`), `onboarding/states.ts` `initArgs`, `onboarding/projects.ts` `plannedChanges`·`planned`, `onboarding/projectAdder.ts`, `shell.ts` `initialize`, `configBridge.ts`(`--git-init`), `onboarding/operations.ts`(`git_unavailable` 문구).
- **renderer**: 변경 목록의 `.git/` 줄, `git_unavailable` 안내(`Onboarding.tsx`, Set Up 폼), `storageRules.ts`(`not_git`에서 local 활성), `ProjectSettingsPage.tsx`(확인).
- **형식**: 아래.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- TS `plannedChanges`: `notGit` + local이면 `.git/` 포함, repo·`kept`면 미포함.
- TS `folderState` 파싱: `repo_not_found`의 `details.storageReason`이 `not_git`일 때만 `notGit`.
- TS `initArgs`: `.git/` 계획이면 `--git-init`.
- TS `storageSectionView`: `not_git`에서 local 활성, 확인 필요 표시.
- Go `locateGit(developerDir, executable)`: 위치 판정.
- Go `gitInitDecision(storageInfo, flags)`: 할지, 거절할지, 아무것도 안 할지.
- Go `gitInitArgs`·`gitInitEnv`.
- Go 되돌리기 결정(만들었는지, 이후 실패했는지).

## 형식 변경

- `schema/`의 CLI 응답: `repo_not_found` 오류의 `details`에 선택 필드 `storageReason`(`"not_git"`). 선택 필드 추가라 `v`는 그대로. 이전 앱은 무시하고, 새 앱은 이전 CLI에서 필드가 없으면 지금처럼 `.git/` 없이 계획한다(그러면 `local_not_git` 거절이 그대로 온다).
- CLI 오류 코드 `git_unavailable` 추가(`envelope.go`의 목록, `schema/`), 앱 소켓 onboarding 오류 코드에도 추가(`schema/app-socket.v2.schema.json`). 이전 CLI의 `doan onboarding`이 모르는 코드를 어떻게 다루는지 확인한다(tasks 1).
- CLI 플래그 `--git-init`(`init`, `config`).
- fixture: Go와 TS가 같이 읽는 `repo_not_found` + `storageReason` 응답 하나.

## 컨벤션 영향

없음. canvas 컨벤션과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §3 Out of scope 6: `git init` 예외를 더한다. 조건: Keep out of Git으로 Set Up 하는, 어느 저장소 안에도 없는 폴더에서, 사람이 변경 목록을 보고 동의한 뒤. 커밋·브랜치·원격은 여전히 하지 않는다.
- ARCHITECTURE §7 Clone의 "the only git onboarding runs", §13의 "The only Git command Doan runs is onboarding's clone"을 고친다.
- ARCHITECTURE §12 'Storage'와 §13: Go가 처음으로 git 명령을 실행한다(`git init` 하나). 판정·실행·되돌리기는 Go가 하고, TS는 결과로 계획만 한다. TS가 상위 `.git`을 찾지 않는 원칙은 그대로다.
- PRODUCT §5 item 0 'Doan files'와 Project Settings 항목: 비 Git 폴더의 Keep out of Git 거절, Project Settings의 비활성 이유, '즉시 쓰고 확인 없음'의 예외.

## PoC 의존

- `git init --quiet --template=`이 macOS Apple Git에서 hook 견본 없이 `.git`을 만들고, 사용자의 전역 설정(`init.templateDir`, `init.defaultBranch`)과 어떻게 엮이는지. tasks 1에서 확인한다.
- 이전 버전 `doan onboarding`이 모르는 오류 코드를 받았을 때의 동작.

## 결정 질문 (답함)

1. 범위: PRODUCT §3 Out of scope 6에 `git init` 예외를 더한다.
2. CLI 직접 실행(`doan init`·`doan config`)도 `git init`을 한다.
3. Project Settings의 Include in Git → Keep out of Git 전환도 확인을 거쳐 `git init`을 한다.
4. CLI는 `--git-init` 플래그가 있을 때만 한다.
