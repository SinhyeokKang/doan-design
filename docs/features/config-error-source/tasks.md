# config-error-source — tasks

선행 조건: design §13의 결정 1–7. 이 feature는 `monorepo-services`보다 먼저 병합한다(design §13 결정 7, design §10).

순서: 초안 → 형식 → Go → TS 순수 함수와 main → Show in Finder → 첫 실행 화면 → 실제 앱 확인 → agent eval → 승격.

## T0. 초안 (첫 실행 `project_unreadable`)

- `/design-draft`가 첫 실행 초안 `.doan/canvases/doan-onboarding.html`의 'Project · Configuration unreadable' 옆에 `project_unreadable` 상태를 그린다(design §2.5, §8). 그 skill의 규칙상 기존 초안을 고칠 수 없으면 새 초안 파일에 그린다. 그릴 것: body "Doan couldn’t read this folder. Fix the problem shown below and retry, or choose another folder.", 긴 CLI 메시지 detail(절대 경로 포함, 줄바꿈), [Choose another folder, Retry].
- 검증: `doan check --json` 오류 0, `doan ls --json`에 나옴, 사용자가 앱에서 초안을 확인한다. `/tdd`의 UI 테스트(T5)는 그 뒤에 쓴다.
- **commit 경계**: `docs(design): draft the unreadable folder state in first run`

## T1. 형식

- `schema/cli-envelope.v1.schema.json`의 실패 `error`에 선택 필드 `config`(`type: string`, `pattern: "^/"`). `schema/fixtures/cli-envelope/valid/invalid-config-with-config.json`, `invalid/relative-config.json`, `invalid/nonstring-config.json`(design §5).
- `schema/app-socket.v2.schema.json` `operationErrorCode`에 `project_unreadable`, `schema/fixtures/app-socket-v2/response/valid/project-select-failed-project-unreadable.json`, `schema/fixtures/cli-envelope/onboarding/mapping.json`에 `"project_unreadable": 5`, Go `ExitCode` 목록(`cli/internal/cli/envelope.go`), TS `OnboardingOperationErrorCode`(`app/src/formats/types.ts`).
- 검증: `go test ./...`와 `npm --prefix app test` green. 두 쪽이 같은 `cli-envelope/{valid,invalid}`, `app-socket-v2/`, `onboarding/mapping.json`을 읽고, 기존 fixture는 그대로 통과한다.
- **commit 경계**: `feat(formats): name the config file in CLI failures and add project_unreadable`

## T2. CLI: `error.config`

- `repo.Error.Config`와 `Find`의 config 단계 다섯 갈래, `cli.Error.Config`(`json:"config,omitempty"`), `repository()`가 옮김(design §2.1).
- 테스트(`cli/internal/repo/repo_test.go`, `cli/internal/cli/run_test.go`, `cli/internal/cli/list_partial_test.go`). 경로 기대값은 기존 helper `real()`(`repo_test.go`)로 만들고, 권한 사례는 `unreadable()`(`list_partial_test.go`, root로 돌면 skip)을 쓴다.
  - `ls --repo <root>`에서 다섯 갈래, 각각 지금 code와 종료 코드에 `config`는 `<root>/.doan/config.json`의 절대 경로:
    - 깨진 config(`invalid_config`)
    - 지원하지 않는 `v`(`unsupported_version`)
    - 디렉터리인 config(`invalid_config`)
    - 읽을 수 없는 config, 권한 000(`internal_error`)
    - `.doan` 디렉터리 권한 000, `stat` 실패(`internal_error`)
  - config 없는 하위 폴더를 cwd로 `ls` → 부모의 깨진 config에서 멈추고 `config`는 부모의 경로.
  - `--repo`에 절대 경로를 준 경우와 cwd에서 찾은 경우 모두(POSTMORTEM 2026-11-09).
  - `ls`가 아닌 명령 하나(`check`나 `config`)의 Find 단계 실패에 같은 `config`. `doan config`의 새 값 `usage_error`에는 없음.
  - 설정 외 실패에는 `config` 없음: 서빙 범위의 I/O 실패(권한 000인 `serve` 디렉터리)나 시작 경로의 `EACCES`, `repo_not_found`, 시작 경로가 파일. `TestListEnumerationFailuresStayWhole`에 "`config` 없음" 단언을 더한다.
  - 모든 실패 envelope가 `formats.ValidateEnvelope`를 통과한다.
- 검증: `go test ./...`, `go vet ./...` 통과.
- **commit 경계**: `feat(cli): failures caused by a config file name it`

## T3. app: 상태 분류와 첫 실행 main

- `folderState`의 지역 `Envelope`에 `config?: string`, `FolderState`의 `error`(`config` 필수)와 `cliError`(`code` 선택), `folderEntry`의 `config`, `openDecision`(주석 "failing on its own config" → "answered with an envelope"), `onboarding/projects.ts`의 `candidate`·`register`·`confirmProject`, `operations.ts`의 고정 문장과 창 전용 `detail`, `service.ts`가 창 IPC에만 `detail`을 붙임(design §2.2, §2.3, §2.5).
- 새 테스트:
  - `folderState.test.ts`: T1의 `valid/` fixture를 읽어 `error`, `internal_error`+`config` → `error`, `invalid_config`인데 `config` 없음 → `code` 있는 `cliError`, 종료 코드 0 실패 envelope → `code` 없는 `cliError`.
  - `view.test.ts`(`openDecision`): 설정 외 실패의 저장과, 거절 문구의 `doan CLI error:` 머리.
  - `addFlow.test.ts`(`classifyPick`): `asRepo`의 세 갈래.
  - `onboarding/projects.test.ts`: `candidate`, `register`·`confirmProject`의 `config_invalid`·`project_unreadable`·`project_unavailable`. `project_unreadable`의 이유가 창 전용 `detail`에만 있고 소켓 답은 고정 `message`이며 v2 schema를 통과한다.
- 바뀌는 기존 테스트:
  - `shell.test.ts`: fake CLI `gitCli`·`autoCli`의 실패 모드를 config 실패(`config` 있음 → `error`)와 설정 외 실패(→ `cliError`)로 나눈다. 각 모드는 그 root에만 적용한다(POSTMORTEM 2026-11-08). 실제 CLI를 쓰는 "a broken ancestor becomes an error on the old row" 테스트(약 611행)의 `toEqual`에 `config`(부모의 경로)를 더한다.
  - `cli.test.ts`와 `autoFolders.test.ts`: `error` 기대값에 `config`, 또는 설정 외 실패면 `cliError`.
  - renderer 테스트 fixture 중 `kind: "error"` 항목(`FolderEntry`의 `config`가 필수가 되므로): `problemView`, `homeCards`, `projectSettingsRules`, `canvasView`, `App.problemOverlay` 등 `rg -n 'kind: "error"' app/src --glob '*.test.*'`로 찾는다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `fix(app): only a named config file makes a Config error`

## T4. app main: Show in Finder

- `folders:reveal`이 `revealTarget(entry, exists)`(`lstat` 성공 여부)를 쓰고, `join(path, ".doan", "config.json")`과 `isFile` 판단을 지운다. 새 주석에는 `config.json`이라는 글자를 쓰지 않는다(design §2.4).
- 테스트: `app/src/main/index.test.ts` 'locate and reveal'의 "reveal selects .doan/config.json for a Config error project, else the root"를 `config` 경로 기준으로 고친다. 자기 config, 부모 config, 사라진 config(→ root). config가 디렉터리인 기존 사례는 남기되 기대값을 그 디렉터리 경로를 고르는 것으로 바꾼다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과. `grep -nE '"\.doan"|config\.json' app/src/main/index.ts`가 비고, `grep -rnE '"\.doan"|config\.json' app/src | grep -v test`는 변경 전과 비교해 `index.ts`의 줄만 빠진다(POSTMORTEM 2026-10-22).
- `/verify`(`node .agents/skills/verify/scripts/verify.mjs`) 통과.
- **commit 경계**: `fix(app): Show in Finder selects the config path the CLI named`

## T5. 첫 실행 화면

- `Onboarding.tsx` `projectNotice`에 `project_unreadable` 갈래: T0 초안대로 body, detail(창 전용 `detail`), [Choose another folder(subtle), Retry](design §2.5).
- 테스트: `projectNotice("project_unreadable", …)`의 body·detail·action, Onboarding 렌더 테스트에서 detail이 `ob-notice-detail selectable`로 보임.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `/verify` 통과.
- **commit 경계**: `feat(app): first run says when a folder cannot be read`

## T6. 실제 앱 확인 (`/runtime-test`)

- 격리한 HOME·userData·`DOAN_RUNTIME`과 T2의 CLI로 앱을 띄워 확인한다(AGENTS.md 'Commands'의 dev 실행).
  1. 등록한 프로젝트의 `.doan/canvases/<sub>`를 `chmod 000`한 뒤 앱을 띄우거나 다시 시작한다 → 사이드바 항목과 overlay가 CLI error(Retry, Details, Remove from Doan)이고, Details에 CLI 메시지가 보인다. 권한을 되돌리고 Retry → 목록으로 돌아온다.
  2. 부모 폴더에 깨진 `.doan/config.json`을 두고, 하위 폴더를 격리 userData의 `folders.json`에 손으로 넣은 뒤 앱을 띄운다 → Config error. overlay의 Show in Finder와 menu 하나(사이드바 project menu나 Overview의 recovery menu)의 Show in Finder가 부모의 `.doan/config.json`을 고른다. 부모 config를 고치고 Retry → overlay가 사라지고 항목이 부모 root로 바뀐다(ARCHITECTURE §13 'Re-root').
  3. 회귀: 자기 config가 깨진 프로젝트의 Show in Finder가 그 프로젝트의 `.doan/config.json`을 고른다.
  4. 첫 실행 Project 단계에서 `.doan/canvases/<sub>`가 권한 000인 설정된 폴더를 골라 등록 → `project_unreadable` 안내와 detail, 두 action.
- 검증: Finder의 선택은 화면 캡처로 확인한다. 스크린샷과 관찰을 `.scratch/runtime-test/config-error-source/`에 남기고 PR 본문에 적는다. 확인 뒤 연 Finder 창을 닫는다.
- **commit 경계**: 없음(코드 변경이 없으면).

## T7. `/agent-eval`

- 실패 envelope에 필드가 더해지고 `doan onboarding`에 새 code가 생겼으므로 마지막 통합 전에 모든 scenario(`eval/scenarios/`의 전체, onboarding O1–O4 포함)로 한 round를 돌린다(design §11, AGENTS.md 'Workflow'). `npm --prefix app run package` 뒤 `node eval/run.ts`.
- 검증: 결과를 `docs/USABILITY-EVAL.md`에 기록한다. 이 변경 때문에 생긴 문제가 없어야 한다.
- **commit 경계**: `docs(eval): round for the config field in CLI failures`

## T8. 승격과 정리

- `docs/PRODUCT.md`(영어): §5 item 1의 Show in Finder 문장(CLI가 짚은 설정 경로를 고르며 부모 폴더의 것일 수 있다, 없으면 폴더), item 3 'Problem states'에 Config error와 CLI error를 가르는 기준(설정 파일을 짚은 실패만 Config error, 그 밖의 읽기 실패는 CLI error), item 0 첫 실행 Project 단계의 읽을 수 없는 폴더 안내. 같은 문단의 Project Settings 문장도 맞는지 본다.
- `docs/ARCHITECTURE.md`(영어, design §6):
  - §12 실패 envelope에 `error.config`(설정 파일 때문에 실패했을 때 그 절대 경로, 명시적 예외, `v` 그대로).
  - §7 'Recovery': Show in Finder는 더 이상 `.doan/config.json` 경로를 만들지 않는다. "This is the one place outside the watcher where TS builds a `.doan/` path, so the POSTMORTEM 2026-10-22 search finds it on purpose." 문장을 지운다. TS가 `.doan/` 경로를 전혀 만들지 않는다고 쓰지 않는다(`plannedChanges`, `watch.ts`, `canvasExport.ts`가 만든다).
  - §7 'Problem reasons': `cliError`의 `reason`이 `config` 없는 실패 envelope의 메시지도 받는다.
  - §13 'Discovery'의 괄호.
  - §4/§7 'First-run onboarding': `project_unreadable`과 창 전용 `detail`.
- `docs/BACKLOG.md`:
  - 'Known defects'의 두 대상 줄을 지운다.
  - 'Known defects'에 더한다: `unsupported_version`도 ".doan/config.json has an error. Fix it, then retry."를 보이지만 그 파일 자체는 잘못이 없다(이 버전이 읽지 못하는 새 형식일 뿐).
  - 'Undecided'에 더한다: 읽을 수 없는 캔버스 하위 디렉터리를 `ls` 전체 실패 대신 행 오류로 넘길지.
- `docs/DESIGN.md`: T0 초안에서 첫 실행 화면에 새로 잰 값이 있으면.
- `docs/features/config-error-source/`를 지운다.
- 검증: 문서만 바뀌므로 고친 절을 코드와 눈으로 대조하고, T4의 grep과 `go test ./...`·`npm --prefix app test`가 여전히 green.
- **commit 경계**: 문서마다 하나(`docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`), 마지막에 `docs(feature): remove config-error-source`.
