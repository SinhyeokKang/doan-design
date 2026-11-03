# local-doan-files — design

spec 결정 1~8을 CLI(파일 쓰기와 판단), app main(셋업 계획, onboarding v2, Settings IPC), renderer(셋업·Project Settings UI)로 나눈다. Git 메타데이터 해석과 exclude 쓰기는 Go만 한다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| CLI repo | `cli/internal/repo/git.go`(helper 분리), 새 파일 | `gitLocation(root, home)` 분리, exclude 경로 찾기, 표식 쌍 읽기·더하기·빼기 |
| CLI 명령 | `cli/internal/cli/init.go`, `config.go`, `config_ops.go`, `ls` | `init --storage`, `config --storage`, `ls`의 `storage`와 이유 값, 결과 필드 |
| CLI onboarding | onboarding `project select`/`project clone` 명령 | 모드 인자 |
| formats | `schema/app-socket.v2.schema.json`, `schema/fixtures/app-socket-v2/`, `app/src/formats/types.ts`(`OnboardingChange`) | `project_select`·`project_clone`의 모드 필드, `changes` enum에 exclude 라벨 |
| app main | `app/src/main/onboarding/projects.ts`(`plannedChanges`, `ATTRIBUTE_LINES`), `projectAdder.ts`(`CLONE_CHANGES`), `states.ts`(`initArgs`), `configBridge.ts`, folder 다시 읽기 | 모드에 따른 셋업 계획과 init 인자, 모드 쓰기, 쓰기 뒤 group 전체 다시 읽기 |
| renderer | `ProjectSetupDialog.tsx`, `Onboarding.tsx`(setup 패널), clone 화면(`projectStep.ts`), `ProjectSettingsPage.tsx`, `projectSettingsRules.ts` | 모드 선택, Project Settings 모드 section, 안내 |
| guide | `cli/internal/cli/skill.md` | 셋업의 모드, `skill.md:11`의 커밋 문장을 모드별로, `config --storage` |

## 2. CLI

### 2.1 exclude 위치와 표식 쌍

- **위치**: `<common dir>/info/exclude`. 실제 git으로 확인했다(리뷰, git 2.39.5): linked worktree는 common dir의 `info/exclude`를 따르고 `.git/worktrees/<name>/info/exclude`는 무시한다. submodule은 `.git` 파일이 가리키는 `<superproject>/.git/modules/<name>/info/exclude`를 따른다.
- **helper**: `ReadGit`(`cli/internal/repo/git.go`)의 위치 찾기 부분을 `gitLocation(root, home) → (tree, gitdir, common, rel)`로 뽑아 두 곳이 같이 쓴다. `ReadGit`은 HEAD를 읽지 못하는 등 exclude와 상관없는 이유로도 nil이 되므로 그대로 쓰지 않는다. 조상 디렉터리 링크는 `ReadGit`처럼 따른다(POSTMORTEM 2026-10-24 'Setup rejected linked configuration directories'). 최종 `info/exclude`는 `Lstat`하고, 링크이거나 정규 파일이 아니면 거절한다. 홈 위의 `.git`은 지금처럼 무시하므로 로컬을 고를 수 없다.
- **상한**: `gitFileLimit`(4 KiB)는 exclude에 맞지 않는다. exclude 전용 상한(예: 1 MiB)을 두고, 넘으면 쓰지 않고 모드를 이유와 함께 "알 수 없음"으로 보인다.
- **표식 쌍**: gitignore는 줄 끝 주석이 없다. `/.doan/  # doan: local`은 줄 전체가 패턴이 되어 아무것도 무시하지 않는다(리뷰에서 실제 git으로 확인). 그래서 표식 주석 줄 바로 다음에 패턴 줄을 둔다.

  ```
  # doan: local
  /<rel>/.doan/
  ```

  `rel`은 Git 최상위 기준의 Doan root 상대 경로이고, 최상위 root면 `/.doan/`이다(spec 결정 6). `rel`의 gitignore 특수 문자(`* ? [ \ !`, 맨 앞 `#`, 끝 공백)는 escape한다. 판단과 제거는 이 쌍만 본다. 사람이 쓴 줄은 건드리지도 모드로 해석하지도 않는다(spec 완료 조건 12).
- **더하기**: `O_WRONLY|O_APPEND|O_CREAT|O_NOFOLLOW`로 연다. 파일이 줄바꿈으로 끝나지 않으면 앞에 줄바꿈을 넣고, 기존 CRLF 방식을 따른다(`init.go`의 `.gitattributes` 쓰기와 같음). 파일을 통째로 덮어쓰지 않으므로 다른 writer가 그 사이 더한 줄을 잃지 않는다. 파일이 없으면 배타적으로 만든다(POSTMORTEM 2026-10-24 'Setup writes to missing targets could overwrite a competitor'). `info/`가 없으면 0755로 만든다.
- **빼기**: 읽고, 쌍을 걸러, 같은 폴더의 고유 이름 temp 파일에 기존 권한으로 쓴다(`writeConfig`, `config.go`와 같은 방식). rename 직전에 원본을 다시 읽어 처음 읽은 내용과 다르면 거절하고, 실패하면 temp를 지운다. 표식 쌍이 여러 번 있으면 모두 뺀다.
- git 명령은 실행하지 않는다.

### 2.2 모드 판단

- `storage`: `"repo" | "local" | "unknown"`. 쌍이 있으면 `local`, exclude를 읽었는데 쌍이 없거나 파일이 없으면 `repo`, `.git`이나 exclude를 읽지 못하면 `unknown`이다.
- 로컬로 바꿀 수 없는 이유: `"not_git" | "git_unreadable" | "exclude_unwritable" | null`(이름은 `/tdd`에서). 앱은 이유마다 다른 문장을 보인다.
- `.git/index`는 읽지 않는다(spec 결정 3). index v4 경로 압축, split·sparse index까지 해석하는 파서가 안내 하나에 비해 크다.

### 2.3 명령

- `doan init --storage local|repo`(기본 `repo`, 플래그 이름은 `init`과 `config`가 같다):
  - `local`: `.gitattributes`를 쓰지 않고 exclude 쌍을 더한다. exclude 쓰기는 config 게시(`init.go`의 rename) 전에 한다. 실패하면 아무것도 만들지 않는다. 그래야 재시도가 no-op 경로에 빠져 `.doan/`이 git에 보이는 채로 남지 않는다(POSTMORTEM 2026-10-25 'Init published success before merge setup could fail'). 결과의 `created`에 exclude 라벨을 적는다(아래 '라벨').
  - Git 저장소가 아니면 `usage_error`이고 아무것도 쓰지 않는다. 메시지가 이유를 말한다.
  - 이미 셋업된 checkout(유효한 config, `initialized:false`)에서 `--storage local`은 거절하고 `doan config --storage local`을 안내한다. init은 계속 no-op로 남는다.
  - 플래그 없는 `init`도 그 root의 모드를 읽어 `local`이면 `.gitattributes`를 건너뛴다(spec 완료 조건 3).
- `doan config --storage local|repo`:
  - `local`: exclude 쌍을 더한다. `.gitattributes`는 건드리지 않는다(이미 있는 줄은 무해하고, 지우면 팀 파일을 바꾼다). 결과에 spec 결정 3의 안내를 싣는다.
  - `repo`: 빠진 `.gitattributes`의 Doan 두 줄을 init의 줄 함수로 먼저 더하고(ARCHITECTURE §2 'required' 불변식), 그다음 exclude 쌍을 뺀다. 결과에 `.gitattributes`를 적는다.
  - 결과에 새 `storage`를 돌려준다(`tokenCss`·`serve` 쓰기의 응답처럼). Project Settings는 `doan config`로 읽으므로(`ProjectSettingsPage.tsx`) 이 값을 그대로 쓴다.
- `doan ls`: `storage`와 이유 값. guide가 에이전트에게 모드에 따라 다른 커밋 지침을 주려면 에이전트가 모드를 볼 수 있어야 한다.
- `doan onboarding project select`/`project clone`: 셋업할 때 모드를 받아 `init --storage`로 넘긴다.
- **라벨**: linked worktree와 submodule에서는 `.git`이 파일이라 `.git/info/exclude`가 실제 경로가 아니다. 결과와 `changes`에는 고정 라벨(예: `.git/info/exclude`)을 쓰고, 저장소 상대 경로가 아니라고 §12에 적는다. TS는 common dir을 직접 찾지 않는다(§13; `gitConfig.ts`가 이미 `commondir`을 읽는 것은 별도 문제로 남긴다).

## 3. app

### 3.1 셋업

- 모든 셋업 경로가 같은 "Doan files" 선택을 쓴다: Set Up 폼(`ProjectSetupDialog.tsx`), 첫 실행·Add Projects의 setup 패널(`Onboarding.tsx`의 "Set up this folder for Doan", 지금은 바뀌는 파일 목록 없이 한 문장), clone 화면("Clone and continue"/"Clone and add"). 기본값은 레포다.
- 선택지는 두 개의 radio다. 서로 배타적이고 설명이 필요한 선택에 쓰는 macOS 방식이다. 이름 후보는 "Include in Git" / "Keep out of Git (this Mac only)"이다. "Commit with the repository"는 Doan이 커밋한다는 뜻으로 읽히므로 쓰지 않는다. CLI help와 guide에도 같은 두 말을 쓴다.
- 바뀌는 파일 목록은 모드를 따른다. 로컬이면 `.gitattributes` 대신 exclude 라벨이 나온다. TS의 계획 코드(`plannedChanges`, `ATTRIBUTE_LINES`, `CLONE_CHANGES`, `initArgs`)가 모드를 받는다.
- 그 root의 모드가 이미 로컬이면(같은 저장소의 다른 worktree가 셋업됨) 선택지 대신 "이 프로젝트의 모든 worktree에서 Git 밖에 둔다"는 사실을 보인다. 레포를 골라 다른 worktree의 모드를 바꾸는 일이 셋업 폼에서 일어나지 않게 한다. 셋업 전 폴더는 `ls`가 `repo_not_found`라 모드를 모른다. 이때는 같은 group의 다른 root의 `storage`를 쓰고, group이 없으면 선택지를 보인다.
- Git 저장소가 아닌 폴더에서도 선택지는 보인다. 로컬을 고르고 셋업하면 init이 거절하고, 폼은 로컬 선택을 유지한 채 이유를 보인다(spec 결정 7). 셋업 전 폴더의 Git 여부를 알려고 새 읽기를 더하지 않는다.
- Set Up이 이미 셋업된 저장소로 re-root되면 고른 모드는 쓰지 않고, re-root 안내가 그 저장소의 모드를 말한다.

### 3.2 Project Settings

- 모드 section은 같은 두 radio다. 확인 없이 바로 저장하고 Saving/Saved와 오류를 보인다(PRODUCT §5 item 0 'Project Settings': 값은 바로 저장). 파일을 옮기거나 지우지 않고 되돌릴 수 있으므로 확인을 두지 않는다.
- section은 "이 프로젝트의 모든 worktree에 적용된다"고 말한다.
- 쓰는 동안 `projectSettingsLocked`에 `writing`으로 들어가 페이지 잠금을 따른다. 그 사이 온 Settings target과 `doan://`은 다른 쓰기처럼 버린다(POSTMORTEM 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation'). Saving 동안 비활성인 radio가 focus를 `<body>`로 떨어뜨리지 않게 `FocusAfterWrite`에 종류를 더해 선택된 radio로 돌린다. 쓰기가 실패하면 radio는 실제 모드로 돌아가고, 오류는 section 아래 자기 줄에 `role="alert"`로 보인다. 결정 3의 안내는 `role="status"`다.
- 로컬 설명은 spec 완료 조건 5의 내용이고, 결정 3의 조건문 안내가 그 아래 항상 보인다. 명령은 code chip과 Copy 버튼(`copyText.ts`)으로 보이고, 이 프로젝트 폴더에서 실행한다고 말한다.
- 레포 → 로컬 전환 뒤에는 Doan의 `.gitattributes` 줄이 남아 있다는 것을, 로컬 → 레포 전환 뒤에는 `.doan/`이 이제 `git status`에 보이고 커밋하면 팀에 간다는 것을 Saved 옆 한 줄로 보인다.
- 경로 줄: 레포는 지금 문구, 로컬은 "Stored in `.doan/config.json` in this worktree, on this Mac only."(후보). 로컬 모드에서는 Token CSS·Shared 설정도 checkout마다 따로라는 뜻이다.
- `storage`가 `unknown`이거나 이유 값이 있으면 radio를 비활성으로 두고 이유 문장을 보인다. Config error와 Read failed에서는 모드 section을 숨긴다(두 section 대신 안내 하나라는 지금 규칙).
- 로컬 저장소의 셋업되지 않은 worktree의 'Not set up' 안내(`projectSettingsRules.ts`)는 로컬 모드라 이 checkout에 아직 Doan 파일이 없다고 설명한다.
- 문구는 `/design-draft` 때 `clarify` preset으로 정한다.

### 3.3 다시 읽기

- 폴더 watcher는 `.doan/`만 본다(`app/src/main/watch.ts`). exclude는 common dir에 있어 보이지 않는다.
- 앱에서 모드를 쓰면 main이 같은 group의 모든 root를 다시 읽는다. 그래서 다른 worktree의 Project Settings도 같은 모드를 보인다(POSTMORTEM 2026-11-03 'Locate on the Project Settings page…': 변화를 만드는 모든 경로가 알린다).
- Project Settings를 열 때 모드를 다시 읽는다. 앱 밖의 `doan config --storage`는 창 focus 때의 다시 읽기(60초 제한, `app/src/main/index.ts`)에서 보인다. exclude 감시는 두지 않는다. 이 한계는 BACKLOG에 적는다.

## 4. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수 | 위치 | 고정할 사례 |
|---|---|---|
| 표식 쌍 더하기·빼기 | Go | 빈 파일, 끝 줄바꿈 없음, CRLF, 이미 있음, 쌍 중복(빼기는 모두, 더하기는 없음), 사람이 쓴 `.doan` 줄은 그대로, 다른 바이트 보존, local→repo→local 왕복 |
| 패턴 만들기 | Go | 최상위 root `/.doan/`, 하위 root `/<rel>/.doan/`, 특수 문자 escape |
| 모드 판단 | Go | 쌍 있음·없음, exclude 없음, `info/` 없음, Git 아님, `.git` 읽기 실패, 상한 초과, 최종 파일 링크, 홈 위 `.git` |
| exclude 위치 | Go `gitLocation` | 일반 저장소, linked worktree, submodule, 조상 디렉터리 링크 |
| init 파일 계획 | Go `init.go` | 로컬이면 `.gitattributes` 없음·exclude 있음, 플래그 없는 init이 로컬 저장소에서 `.gitattributes` 건너뜀, 이미 셋업된 곳의 `--storage local` 거절 |
| config 전환 계획 | Go | repo 전환이 빠진 attribute 줄을 먼저 더함 |
| 셋업 계획 | TS `projects.ts`·`projectAdder.ts`·`states.ts` | 모드별 `changes`와 init 인자 |
| 설정 화면 규칙 | `projectSettingsRules.ts` 등 | 모드별 문구, 이유별 비활성 문장, 로컬 'Not set up' 설명, 셋업 폼의 사실 표시 |

## 5. 형식 변경

- `ls`·`init`·`config` 결과에는 JSON Schema가 없다. 결과 모양은 ARCHITECTURE §12가 정하고 Go만 만들며, 통합 테스트가 deep-compare한다(§11의 예외). 그래서 §12 문장, Go deep-compare 테스트, TS reader(`folderState.ts`, `configBridge.ts`) 테스트로 고정한다. TS reader는 모르는 키를 무시하므로 `v`는 올리지 않는다.
- app-socket v2: `project_select`·`project_clone`에 모드 필드, `changes` enum에 exclude 라벨. JSON Schema 정본과 `schema/fixtures/app-socket-v2/`의 TS·Go 공유 fixture를 고치고, `OnboardingChange`(`app/src/formats/types.ts`)를 맞춘다. socket 객체는 모르는 속성을 거절하므로 필드 추가가 이전 CLI·앱과 맞는지(버전 협상) `/tdd`에서 확인한다.
- `.doan/config.json`은 바뀌지 않는다(spec 결정 8).

## 6. Conventions·결정 영향

- 바뀌는 결정은 spec '바뀌는 PRODUCT·ARCHITECTURE 결정'에 모았다. ARCHITECTURE §1의 "`.doan/` is committed"도 그중 하나다.
- `doan check`는 바뀌지 않는다.
- **No git operations**(PRODUCT §3 Out of scope 6): git 명령은 실행하지 않는다. exclude 쌍 쓰기만 예외다.
- **guide·CLI 출력 변경**: `/agent-eval`이 필요하다.
- **terminal-work-worktrees와의 관계**: 로컬 모드의 새 worktree에는 `.doan/config.json`이 없어 `doan work start`가 CLI의 `repo.Find`에서 먼저 실패하고 앱에 신호가 오지 않는다. 그 worktree는 자동 등록되지 않는다.
- **위쪽 탐색**: main checkout 안에 놓인 worktree(예: `.claude/worktrees/x`)는 자기 config가 없으면 위쪽 탐색이 main checkout의 `.doan/config.json`을 찾는다(ARCHITECTURE §13 'Discovery'). 로컬 모드에서 그 worktree의 에이전트는 main checkout의 `.doan/`에 쓴다. 지금 규칙의 결과이고, 문서에 적는다.

## 7. PoC 의존

없음. 리뷰에서 실제 git 2.39.5로 확인했다: 줄 끝 주석 표식은 동작하지 않음, 주석 줄 + 패턴 줄은 동작함, linked worktree는 common dir의 exclude를 따름, submodule은 `.git/modules/<name>/info/exclude`를 따름, `info/` 없는 저장소(`git init --template=`)와 CRLF 줄, 고정 패턴 `/.doan/`은 `sub/.doan/`을 덮지 않음, `.gitignore`의 `!/.doan/`이 exclude를 이김, `git worktree remove`(force 없음)가 ignore된 `.doan/`을 경고 없이 지움. 구현에서는 T2 테스트가 실제 `git worktree add`와 `git status --porcelain`으로 다시 확인한다(테스트가 git을 실행하는 것은 개발 도구이고 제품 동작이 아니다. 선례: `cli/internal/repo/git_test.go`).

## 8. POSTMORTEM에서 가져온 함정

- **2026-10-25 'Init published success before merge setup could fail'**: exclude를 config 게시 전에 쓰고, 실패하면 아무것도 만들지 않는다. 레포 전환은 빠진 merge 줄을 먼저 더한다.
- **2026-10-24 'Setup writes to missing targets could overwrite a competitor'**: 없는 exclude는 배타적으로 만들고, 있는 파일은 append로만 더한다.
- **2026-10-24 'Setup rejected linked configuration directories'**: 조상 디렉터리 링크는 따르고 최종 파일 링크만 거절한다. 두 경우를 따로 테스트한다.
- **2026-10-31 'A linked default directory served its unconfigured target'**: 링크로 다른 곳을 가리키는 대상에 쓰지 않는다.
- **2026-10-25 'Startup cache collection deleted a live thumbnail temporary file'**: temp 파일은 고유 이름을 쓰고, 실패하면 지운다.
- **2026-10-25 'A forwarded Settings target discarded a pending setup confirmation'**, **2026-10-24 'Focus did not return to the row when Set Up… closed from outside'**: 모드 쓰기는 페이지 잠금과 focus 복귀 규칙을 따른다.
- **2026-11-03 'Locate on the Project Settings page…'**: 모드 변화를 만드는 모든 경로가 group의 다시 읽기를 일으킨다.
