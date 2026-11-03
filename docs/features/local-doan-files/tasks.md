# local-doan-files — tasks

순서: 초안 → 형식(app-socket v2 schema·fixture) → Go 순수 함수 → CLI I/O → app main → app UI → guide → 승격.

## T0. 초안

- `/design-draft`가 `.doan/canvases/local-doan-files.html`을 그린다. 그릴 것: 셋업 폼·첫 실행·Add Projects 패널·clone 화면의 선택, 이미 로컬인 저장소의 사실 표시, Project Settings의 두 모드와 로컬 설명·조건문 안내(Copy), 전환 뒤 한 줄 안내, 이유별 비활성(Git 아님, `.git` 읽기 실패, exclude 쓰기 불가), 쓰기 실패, 로컬 'Not set up'.
- 검증: `doan check --repo . --json` 오류 0, `doan ls --repo . --json`에 나옴, 사용자가 앱에서 확인한다.

## T1. 형식

- app-socket v2: `project_select`·`project_clone`의 모드 필드, `changes` enum의 exclude 라벨. JSON Schema 정본, `schema/fixtures/app-socket-v2/`의 TS·Go 공유 fixture, `OnboardingChange`(`app/src/formats/types.ts`)(design §5). 이전 CLI·앱과의 호환을 확인한다.
- `ls`·`init`·`config` 결과는 schema가 아니라 T3의 Go deep-compare와 TS reader 테스트로 고정한다.
- 검증: `go test ./...`, `npm --prefix app test` green(fixture를 두 쪽이 읽음).
- **commit 경계**: `feat(formats): onboarding setup carries where Doan files are kept`

## T2. Go 순수 함수

- `gitLocation` 분리, 표식 쌍 더하기·빼기, 패턴 만들기, 모드 판단, init 파일 계획, config 전환 계획(design §4).
- 테스트: design §4 표의 Go 사례 전부. 실제 git을 쓰는 테스트(`cli/internal/repo/git_test.go`의 격리된 `HOME`/`GIT_CONFIG_*` 방식): `git worktree add`로 만든 worktree가 같은 exclude를 읽음, 쌍을 더한 뒤 `git status --porcelain`에 `.doan/`이 없음, 하위 root 패턴이 그 root만 덮음, submodule의 exclude 위치.
- 검증: `go test ./...`, `go vet ./...` 통과.
- **commit 경계**: `feat(cli): rules for keeping Doan files out of Git`

## T3. CLI 명령

- `init --storage`, 플래그 없는 `init`의 로컬 저장소 처리, `config --storage`, `ls`의 `storage`와 이유 값, onboarding `project select`/`project clone`의 모드, exclude 쓰기(design §2).
- 테스트(새 `cli/internal/cli/init_local_test.go` 등, 실제 `git status --porcelain`을 돌림):
  - `init --storage local` 뒤 `git status`가 비어 있음, `.gitattributes` 없음, exclude의 다른 줄 그대로, `created`에 exclude 라벨.
  - exclude 쓰기 실패 → config 없음, 재시도 → 쌍 있음, temp 파일 없음.
  - Git 아닌 폴더의 `init --storage local` → `usage_error`, 아무것도 쓰지 않음.
  - 이미 셋업된 checkout의 `init --storage local` → 거절과 `config` 안내.
  - 로컬 저장소의 새 worktree에서 플래그 없는 `init` → `.gitattributes` 없음.
  - `config --storage repo` → 빠진 attribute 줄을 먼저 더하고, 쌍을 빼고, `.doan/`이 `git status`에 다시 보이며, 결과의 `storage`·`.gitattributes`.
  - `config --storage local` 결과에 안내.
  - 경계: exclude 없음, `info/` 없음, 읽기 전용 exclude·`info/`(오류와 `ls`의 이유 값), 최종 파일 링크와 조상 디렉터리 링크, 상한 초과, 쌍 중복, HOME 위 `.git`, 없는 exclude를 두 writer가 동시에 만듦.
  - `ls` 결과의 deep-compare(`storage`, 이유 값).
- 검증: `go test ./...`, `go vet ./...` 통과.
- **commit 경계**: `feat(cli): choose where Doan files are kept with --storage`

## T4. app main

- 셋업 계획 코드(`plannedChanges`, `ATTRIBUTE_LINES`, `CLONE_CHANGES`, `initArgs`)의 모드, onboarding v2 처리, Settings IPC의 모드 쓰기, 쓰기 뒤 같은 group 전체 다시 읽기, Project Settings를 열 때 다시 읽기(design §3.1, §3.3).
- 테스트: `projects.test`·`states.test`·projectAdder 테스트에 모드별 `changes`와 init 인자; TS reader(`folderState.test.ts`, configBridge 테스트)의 `storage`와 이유 값; worktree A에서 모드를 쓰면 B도 다시 읽힘.
- 검증: `npm --prefix app test` green, typecheck 통과.
- **commit 경계**: `feat(app): plan setup and settings writes by storage mode`

## T5. app UI

- 셋업 폼·첫 실행·Add Projects 패널·clone 화면의 선택, 이미 로컬인 저장소의 사실 표시, Project Settings 모드 section(잠금, focus 복귀, 오류 alert, 조건문 안내와 Copy, 전환 뒤 안내, 이유별 비활성, 경로 줄), 로컬 'Not set up' 설명(design §3).
- 테스트: `projectSettingsRules.test.ts`의 모드별 문구·이유별 문장·focus 종류; 쓰는 동안 Settings target과 `doan://`이 버려짐; 셋업 폼이 이미 로컬인 group의 사실을 보임; Git 아닌 폴더에서 로컬 셋업 거절 이유가 폼에 보이고 선택이 유지됨.
- 검증: `npm --prefix app test` green, typecheck·build 통과. `/runtime-test`: 임시 git repo를 로컬로 셋업 → `git status` 깨끗함, 같은 repo에 `git worktree add`한 checkout의 Set Up이 사실을 보이고 `.gitattributes`를 쓰지 않음, Project Settings에서 레포로 바꿈 → 쌍 빠지고 `.gitattributes` 줄 생김·다른 worktree의 Project Settings도 바뀜, 로컬로 다시 바꿈 → 조건문 안내, Git 아닌 폴더 → 로컬 셋업 거절 이유, 첫 실행 setup 패널과 clone의 로컬 셋업. `/design-sync`로 초안과 비교.
- **commit 경계**: `feat(app): choose where Doan files are kept`

## T6. guide

- `skill.md`: 셋업의 모드(onboarding `project select`/`clone`, `init --storage`), `config --storage`, `skill.md:11`의 커밋 문장을 `ls`의 `storage`에 따라 다르게. skill 크기 예산(`skill_test.go`) 안에서.
- 검증: `go test ./...`(skill 크기 예산 포함). `npm --prefix app run package` 뒤 `/agent-eval`: `node eval/run.ts --scenarios O1,O2,O3,O3b --agents claude,codex` 통과(레포 모드 회귀 없음). onboarding이나 fake app이 바뀌었으면 `node .agents/skills/verify/scripts/verify.mjs --eval`. 에이전트가 로컬을 고르는지 보는 시나리오는 없으므로, 새 시나리오를 더하거나 공백을 `docs/USABILITY-EVAL.md`에 적는다.
- **commit 경계**: `docs(skill): set up a project with Doan files kept out of Git`

## T7. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md`: spec '바뀌는 PRODUCT·ARCHITECTURE 결정'의 PRODUCT 항목(§1 문제 4, §3 Out of scope 6, §5 item 0·1·8).
- `docs/ARCHITECTURE.md`: 같은 목록의 ARCHITECTURE 항목(§1, §2, §4 onboarding v2, §7 Settings IPC, §10, §12 `init`·`config`·`ls`와 exclude 라벨, §13 'Listing'·'Read-only Git metadata'의 쓰기 예외와 규칙).
- `docs/DESIGN.md`: `/design-sync` 값.
- `docs/BACKLOG.md`: 앱 밖 모드 변경이 focus 다시 읽기까지 늦게 보임, 사람이 쓴 ignore 규칙·`!.doan/`을 모드로 해석하지 않음, main checkout 안 worktree의 위쪽 탐색, `gitConfig.ts`의 TS `commondir` 읽기, 실제 앱에서 확인하지 못한 표면.
- README의 "what works"가 바뀌면 고친다.
- `docs/features/local-doan-files/` 삭제.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. 문서 전용 확인으로 `rg -n "local-doan-files" docs app cli .agents eval AGENTS.md` 결과 없음(`rg`는 AGENTS.md 'Commands'에 없는 대상 확인용 명령이다).
- **commit 경계**: 문서별로 나눈다, 마지막에 `docs(feature): remove local-doan-files documents`.
