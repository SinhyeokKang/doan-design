# config-error-source — design

## 1. 지금 흐름

| 단계 | 위치 | 지금 동작 |
|---|---|---|
| 저장소 찾기 | `cli/internal/repo/find.go` `Find` | `--repo`면 그 폴더만, 아니면 위로 올라가며 첫 `.doan/config.json`. config 단계의 실패는 `invalid_config`(정규 파일 아님, parse 실패), `unsupported_version`, `internal_error`(읽기 실패, `stat`이 '없음'·`ENOTDIR` 말고 다른 이유로 실패). 시작 경로의 I/O 실패도 `internal_error` |
| 실패를 envelope로 | `cli/internal/cli/run.go` `repository` | `repo.Error`의 `Code`·`Message`에 고정 `nextSteps`. 경로는 메시지 안에만 있다. `ls`, `check`, `export`, `work`, `open`, `config`(`config.go`의 `repository` 호출) 모두 이 길을 지난다 |
| `ls` 본문 | `cli/internal/cli/read.go` `List` | `scanCanvases`(나열 실패)·`repo.Scope`(I/O 실패)는 `internal(e)`로 명령 전체를 실패시킨다. 메시지는 OS 오류 그대로(절대 경로 포함) |
| envelope → 상태 | `app/src/main/folderState.ts` `folderState` | `repo_not_found` → `uninitialized`, 그 밖의 `ok: false` → `{ kind: "error", message }`, 종료 코드 0인 실패 envelope·envelope 아님·실행 실패 → `cliError` |
| 위로 다시 읽기 | `app/src/main/shell.ts` `refresh` | 손으로 추가한 root가 `uninitialized`면 cwd로 `ls`를 다시 돌린다. 다른 root가 나오면 re-root, 실패면 그 실패가 하위 폴더의 상태가 된다 |
| 화면 | `problemView.ts`, `homeCards.ts`, `projectSettingsRules.ts`, `ShellSidebar.tsx`, `ProjectOverview.tsx` | `error` = Config error(Retry, Show in Finder, Details), `cliError` = CLI error(Retry, Details, Remove from Doan). 사이드바 project menu와 Overview의 recovery menu는 어느 상태에서나 Show in Finder를 둔다 |
| Show in Finder | `app/src/main/index.ts` `folders:reveal` | 항목이 `error`이고 `<root>/.doan/config.json`이 파일이면 그 파일, 아니면 root |
| 첫 실행 등록 | `app/src/main/onboarding/projects.ts` `register`, `confirmProject` | `error` → `config_invalid`, `cliError` → `project_unavailable` |

## 2. 바꾸는 것

### 2.1 CLI: 설정 파일을 짚는 `error.config`

- `repo.Error`에 `Config string`을 더한다. `Find`는 `.doan/config.json`을 살피는 단계의 실패마다 그 파일의 경로(지금 메시지에 쓰는 `path`, 해석된 절대 경로)를 넣는다. 대상은 `Find`의 config 단계 다섯 갈래다: `stat` 실패('없음'·`ENOTDIR` 제외, 예: `.doan` 디렉터리 권한 000), 정규 파일 아님, 읽기 실패, parse 실패(`invalid_config`), `unsupported_version`. 시작 경로의 실패와 `repo_not_found`에는 넣지 않는다.
- `cli.Error`에 `Config string \`json:"config,omitempty"\``를 더하고, `repository()`가 `repo.Error.Config`를 옮긴다. 그래서 `repo.Find`를 거치는 모든 저장소 명령이 같은 필드를 낸다. `doan config`도 Find 단계의 실패에는 `config`가 붙고, 새 값을 검사하는 실패(`usage_error`)에는 붙지 않는다. `doan init`의 자체 검사(`init.go`)는 Find를 거치지 않아 붙지 않는다. `code`, `message`, `nextSteps`, `ExitCode`는 바꾸지 않는다.
- 사람용 출력은 지금처럼 `message`와 `nextSteps`만 쓴다. `config`는 `--json`에만 있다.
- 절대 경로인 이유: 부모 폴더의 config는 `--repo` 밖에 있고, 실패한 명령에는 기준이 될 root가 없다. `ls`의 `root`, `git`, `export`의 `output`처럼 명시적 예외로 ARCHITECTURE §12에 적는다. 메시지에 절대 경로를 더하지 않으므로 POSTMORTEM 2026-11-09의 규칙과 부딪치지 않는다.
- 설정 외 실패(`List`의 `scanCanvases`·`Scope` 실패)는 그대로 `internal_error`이고 `config`가 없다.

### 2.2 앱: 상태 분류

- `folderState.ts`의 지역 `Envelope` 타입의 `error`에 `config?: string`을 더한다.
- `FolderState`:
  - `{ kind: "error"; message: string; config: string }`: 종료 코드가 0이 아닌 실패 envelope에 `config`가 있을 때. 이것만 Config error다. code는 보지 않는다(`internal_error`라도 `config`가 있으면 `error`).
  - `{ kind: "cliError"; reason: string; code?: string }`: `config`가 없는 실패 envelope(`repo_not_found` 제외)도 여기로 온다. `reason`은 CLI의 `message`(빈 메시지면 지금 `cliReason`의 문장), `code`는 envelope의 `error.code`. `code`는 "CLI가 0이 아닌 종료 코드와 함께 envelope로 답했다"는 표시이며 화면에는 쓰지 않는다. code가 `invalid_config`여도 `config`가 없으면 `code`가 있는 `cliError`다.
  - 종료 코드 0인 실패 envelope, 실행 실패, 시간 초과, 읽을 수 없는 답은 지금처럼 `code` 없는 `cliError`다.
- `FolderEntry`의 `error`에 `config: string`(필수)을 더한다(`view.ts` `folderEntry`). `cliError` 항목은 지금 모양 그대로이며 `code`는 main 안에서만 쓴다.
- 화면 쪽 함수(`problemView`, `cardRow`, `projectSettingsPageView`, `canvasViewUpdate`, `sidebarSlot`, App의 Details)는 바꾸지 않는다. 같은 `error`·`cliError` 갈래가 이제 맞는 실패를 받을 뿐이다. `cliError`의 `reason`이 이제 설정 외 실패 envelope의 메시지도 받으므로 ARCHITECTURE §7 'Problem reasons'를 승격 때 고친다.

### 2.3 앱: `error`가 "Go가 root로 읽었다"는 뜻으로 쓰이던 곳

설정 외 실패가 `cliError`로 옮겨 가므로, `error`를 보고 판단하던 곳이 지금 동작을 지키도록 `cliError`의 `code`를 함께 본다.

| 위치 | 지금 | 바꾼 뒤 |
|---|---|---|
| `view.ts` `openDecision`(Add, Locate, `shell.ts` 폴더 열기) | `asRepo`가 `list`나 `error`면 고른 폴더를 저장. 거절하면 `error`는 메시지 그대로, `cliError`는 `doan CLI error: <reason>` | `asRepo`가 `list`, `error`, 또는 `code`가 있는 `cliError`면 저장. 거절 문구는 첫 실행 결과의 종류를 따르므로, 설정 외 실패의 거절에는 이제 `doan CLI error:` 머리가 붙는다. 주석 "failing on its own config"를 "answered with an envelope"로 고친다 |
| `addFlow.ts` `classifyPick`, `addProjects.ts`, `shell.ts`의 `asRepo` 조건 | `error`나 `cliError`면 `--repo`로 다시 묻는다 | 그대로 |
| `onboarding/projects.ts` `candidate` | `cliError` → 후보 아님, `error` → 계획한 후보 | `code` 없는 `cliError`만 후보 아님. `code`가 있는 `cliError`는 지금의 `error`처럼 계획한 후보 |
| `onboarding/projects.ts` `register`, `confirmProject` | `error` → `config_invalid`, `cliError` → `project_unavailable` | `error` → `config_invalid`, `code`가 있는 `cliError` → 새 `project_unreadable`(§2.5), `code` 없는 `cliError` → `project_unavailable` |

`config` 필드는 판단에 쓰지 않는다. `--repo <고른 폴더>`는 위로 올라가지 않으므로 그 실행의 `config`는 늘 고른 폴더의 것이며, 앱이 경로를 비교해 root를 정하지 않는다(POSTMORTEM 2026-10-22, 2026-10-21 "Success re-reads the stored path and never adopts `result.repo`").

### 2.4 앱: Show in Finder

- `folders:reveal`은 renderer에게서 저장된 root만 받는다(지금과 같음). main은 그 root의 항목이 `error`이고 그 `config` 경로가 있으면(`lstat` 성공, 파일이든 디렉터리든 종류는 보지 않음) 그 경로를, 없거나 확인할 수 없으면 root를 `shell.showItemInFolder`에 넘긴다. 이 판단을 순수 함수 `revealTarget(entry, exists)`로 뺀다.
- `config`는 main이 돌린 CLI의 답에서만 오고 renderer는 보내지 않는다. main은 그 경로가 있는지만 보고 읽지 않는다.
- `join(path, ".doan", "config.json")`과 `isFile` 판단을 지운다. 새 주석에는 `config.json`이라는 글자를 쓰지 않는다(아래 grep이 `index.ts`에서 비어야 한다). 이로써 Show in Finder는 더 이상 `.doan/config.json` 경로를 만들지 않는다. 앱의 다른 곳(`onboarding/projects.ts` `plannedChanges`, `watch.ts`, `canvasExport.ts`)은 지금처럼 `.doan/` 경로를 쓴다.

### 2.5 앱: 첫 실행의 설정 외 실패 (`project_unreadable`)

- 새 operation 실패 code `project_unreadable`. 첫 실행 등록이나 확인에서 `ls --repo`가 `code` 있는 `cliError`를 돌려줄 때 쓴다(§2.3 표).
- 소켓 답의 `message`는 고정 문장 "The project folder cannot be read."이다(`operations.ts` `OPERATION_MESSAGES`). `operations.ts`의 규칙("Fixed text only: provider output, OAuth text, paths and accounts never reach a message")과 v2 schema `$comment`를 지키려고 CLI 메시지는 소켓 답에 넣지 않는다.
- 창은 CLI의 메시지를 `detail`로 보인다. 그 메시지는 창 전용으로 전한다: 실패한 operation 기록이 이유를 따로 들고, 창 IPC(`onboarding:*` 답과 `onboarding:changed`)의 operation `error`에만 `detail`로 붙인다. 소켓 답의 operation `error`는 `additionalProperties: false`라 `detail`이 새면 CLI가 답을 거절하므로, 소켓 답에 `detail`이 없는 것을 테스트로 고정한다. 창 IPC와 소켓 답이 갈리는 지점은 `/tdd` 시작 때 `onboarding/service.ts`에서 확인한다.
- 화면(`Onboarding.tsx` `projectNotice`, clarify preset 적용, §8):
  - body: "Doan couldn’t read this folder. Fix the problem shown below and retry, or choose another folder."
  - detail: CLI의 메시지(`clone_failed`의 detail과 같은 자리, `ob-notice-detail selectable`)
  - actions: [Choose another folder(subtle), Retry]
- 이 화면은 `/design-draft`로 첫 실행 초안 `.doan/canvases/doan-onboarding.html`의 'Project · Configuration unreadable' 옆에 먼저 그리고, 사용자가 확인한 뒤 구현한다(tasks T0).

## 3. 영향 받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 형식 | `schema/cli-envelope.v1.schema.json`의 실패 `error`에 선택 필드 `config`와 `schema/fixtures/cli-envelope/{valid,invalid}` 사례. `schema/app-socket.v2.schema.json` `operationErrorCode`에 `project_unreadable`과 `schema/fixtures/app-socket-v2/response/valid/` 사례, `schema/fixtures/cli-envelope/onboarding/mapping.json` |
| CLI (Go) | `cli/internal/repo/find.go`(`Error.Config`, `Find`), `cli/internal/cli/envelope.go`(`Error.Config`, `ExitCode`에 `project_unreadable`), `cli/internal/cli/run.go`(`repository`) |
| app main | `folderState.ts`, `view.ts`(`FolderEntry`, `folderEntry`, `openDecision`), `onboarding/projects.ts`(`candidate`, `register`, `confirmProject`), `onboarding/operations.ts`(고정 문장, 창 전용 `detail`), `onboarding/service.ts`(창 IPC에만 `detail`), `index.ts`(`folders:reveal`) |
| app renderer | `Onboarding.tsx` `projectNotice`의 `project_unreadable` 갈래. 문제 overlay와 menu는 코드 변경 없음 |
| formats 타입 | `app/src/formats/types.ts` `OnboardingOperationErrorCode` |
| 초안 | 첫 실행 Project 단계의 `project_unreadable` 상태(`.doan/canvases/doan-onboarding.html`, T0) |
| skills | 없음. guide와 preset은 그대로 |
| `.doan/config.json`, `runtime.json` | 없음 |

## 4. 순수 함수 (`/tdd` 대상)

- Go `repo.Find`(임시 디렉터리 테스트): config 단계 다섯 갈래의 `Config`, 위로 찾다 부모의 깨진 config에서 멈출 때 부모 경로, `--repo`일 때 그 폴더의 경로, 시작 경로 실패와 `repo_not_found`에는 빈 값.
- Go `cli.Envelope`: `Config`가 있으면 `error.config`, 없으면 키 없음. 결과가 envelope schema를 통과. `ExitCode("project_unreadable") == 5`.
- Go `List` 통합: `.doan/canvases/<sub>`가 읽을 수 없으면(권한 000) `internal_error`이고 `config` 없음. `ls`가 아닌 명령(`check`나 `config`)의 Find 단계 실패에 `config`.
- TS `folderState`: `config` 있는 실패 → `error`(`internal_error`+`config`도 `error`), `config` 없는 실패 → `code`가 있는 `cliError`(`invalid_config`인데 `config` 없음 포함, 빈 메시지면 지금 문장), `repo_not_found` → `uninitialized`, 종료 코드 0 실패 envelope → `code` 없는 `cliError`, 깨진 envelope → `code` 없는 `cliError`.
- TS `folderEntry`: `error`의 `config`를 옮긴다.
- TS `openDecision`과 `classifyPick`: `asRepo`가 `error`, `code` 있는 `cliError`, `code` 없는 `cliError`일 때 각각 저장·저장·거절. 설정 외 실패를 거절할 때 문구가 `doan CLI error: <reason>`.
- TS `onboarding/projects.ts` `candidate`·`register`·`confirmProject`(주입된 `deps.ls`로): 위 표의 갈래. `project_unreadable`의 이유가 창 전용 `detail`에만 있고 소켓 답의 `message`는 고정 문장.
- TS `projectNotice("project_unreadable", …)`: body, detail, 두 action.
- TS `revealTarget(entry, exists)`: `error`이고 경로 있음(파일이나 디렉터리) → `config`, `error`이고 경로 없음이나 확인 실패 → root, 다른 종류 → root.

## 5. 형식 변경

- **`cli-envelope.v1`**: 실패 `error`에 `"config": { "type": "string", "pattern": "^/" }`를 더하고 `required`에는 넣지 않는다. `additionalProperties: false`는 그대로다.
  - **`v`는 올리지 않는다(§13 결정 4).** 이유: 새 필드는 선택이고, 이 schema로 envelope를 검증하는 쪽은 앱의 `folderState.ts`(`ls`와 `initOutcome`), `configBridge.ts`, `designSkills.ts`와 Go 테스트뿐이다. 앱은 번들된 CLI만 쓴다(ARCHITECTURE §7 'CLI lookup and local package'). eval runner는 app-socket schema만 읽는다. 이전 schema를 가진 읽는 쪽이 새 CLI 출력을 받는 경우는 개발 중 `DOAN_CLI`나 `PATH`의 `doan`이 다른 버전일 때뿐이다. 에이전트는 JSON을 읽을 뿐 schema로 거절하지 않는다. `error.code`가 enum이 아니어서 새 code에 `v`가 필요 없는 것(§12)과 같은 방향이다.
  - 두 언어가 읽는 fixture(이름표 `cli-envelope`로 `valid/`·`invalid/`를 도는 `app/src/formats/validate.test.ts`와 `cli/internal/formats/validate_test.go`): `valid/invalid-config-with-config.json`(`invalid_config`와 `config: "/tmp/repo/.doan/config.json"`), `invalid/relative-config.json`(`config: ".doan/config.json"`), `invalid/nonstring-config.json`(`config: 1`).
  - `app/src/main/folderState.test.ts`도 위 `valid/` fixture를 읽어 `error` 상태가 되는지 본다.
- **`app-socket.v2`**: `operationErrorCode` enum에 `project_unreadable`. `v`는 2 그대로다. 소켓 양쪽(앱과 CLI)이 한 빌드로 함께 나가고, v2에 `storage`를 더할 때도 `v`를 올리지 않았다(ARCHITECTURE §4 'Storage in onboarding'). 이전 CLI는 이 code를 받으면 답을 거절한다(`internal_error`).
  - fixture: `schema/fixtures/app-socket-v2/response/valid/project-select-failed-project-unreadable.json`(고정 `message`, `detail` 없음). 이 디렉터리는 Go와 TS의 schema 테스트가 함께 읽는다.
  - `schema/fixtures/cli-envelope/onboarding/mapping.json`에 `"project_unreadable": 5`. Go `cli/internal/formats/validate_test.go`, `cli/internal/cli/onboarding_test.go`, TS `validate.test.ts`가 읽는다.
- `result` 모양은 바뀌지 않는다.

## 6. 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 없음.
- ARCHITECTURE §12: 실패 envelope 설명에 `error.config`(설정 파일 때문에 실패했을 때 그 파일의 절대 경로, 명시적 예외, `v` 그대로)를 더한다.
- ARCHITECTURE §7 'Recovery': Show in Finder는 CLI가 짚은 `config` 경로가 있으면 그것을 고르고 아니면 root를 보이며, 더 이상 `.doan/config.json` 경로를 만들지 않는다. "This is the one place outside the watcher where TS builds a `.doan/` path, so the POSTMORTEM 2026-10-22 search finds it on purpose." 문장을 지운다.
- ARCHITECTURE §7 'Problem reasons': `cliError`의 `reason`이 `config` 없는 실패 envelope의 메시지도 받는다.
- ARCHITECTURE §13 'Discovery'의 괄호: Show in Finder가 CLI가 짚은 경로를 고른다로 고친다.
- ARCHITECTURE §4/§7 'First-run onboarding'에 `project_unreadable`과 창 전용 `detail`을 적을 자리가 있으면 적는다.
- PRODUCT §5 item 1(Show in Finder 문장)과 item 3 'Problem states': Config error는 CLI가 설정 파일을 짚은 실패이고, 그 밖의 읽기 실패는 CLI error로 보인다. Show in Finder는 그 경로를 고르며, 부모 폴더의 config일 수도 있다. item 0의 첫 실행 Project 단계에 읽을 수 없는 폴더의 안내.

## 7. 결정 영향

- **"Discovery stays in Go only", "The app never reads config itself"(ARCHITECTURE §13)**: 지킨다. 어느 파일이 잘못인지는 Go가 정해 이름으로 알려 주고, 앱은 그 경로가 있는지만 본다. Show in Finder가 `.doan/config.json` 경로를 만들던 예외가 없어진다.
- **Re-root(§13 'The app's folders')**: 바꾸지 않는다. `config`의 디렉터리를 root로 쓰지 않는다. 부모 config를 고치고 Retry하면 지금 규칙대로 부모 root로 re-root된다.
- **v2 소켓 답에 도구 출력·경로를 넣지 않음(`operations.ts`, v2 `$comment`)**: 지킨다. CLI 메시지는 창 전용 `detail`로만 간다.
- **serving scope, sandbox iframe, git 명령 없음**: 무관하다.

## 8. UI와 문구

- design preset `clarify`를 읽었다. 기준: 오류는 무엇이 실패했는지, 알면 왜, 어떻게 복구하는지를 말하고, 시스템이 모르는 원인이나 해결을 약속하지 않는다.
- 문제 overlay: 설정 외 실패는 지금 CLI error 장면을 그대로 쓴다(§13 결정 1). heading "Doan couldn’t read <name>"이 무엇이 실패했는지, 줄 "The doan command failed while reading it. Try again."이 실패한 주체와 복구를 말하고, Details가 원인(예: `open …/.doan/canvases/sub: permission denied`)을 보인다. 앱은 원인이 권한인지 버그인지 모르므로 더 구체적인 원인을 문구에 넣지 않는다. 지금 Config error 문구(".doan/config.json has an error")는 잘못이 없는 파일을 탓하므로 clarify 기준에 어긋나며, 이번 변경으로 그 문구가 맞는 경우에만 나온다. 확정 초안 `.doan/canvases/problem-project.html`과 DESIGN.md 'Problem rows'는 바뀌지 않는다. 부모 config에서 온 Config error도 줄 문구는 그대로다(§13 결정 5).
- 첫 실행 `project_unreadable`(§2.5): 무엇이 실패했는지("Doan couldn’t read this folder."), 왜(detail의 CLI 메시지), 어떻게 복구하는지("Fix the problem shown below and retry, or choose another folder.")를 말한다. 원인을 단정하지 않고, 이웃 code `config_invalid`의 문장 모양("… Fix it and retry, or choose another folder.")과 action 순서([Choose another folder, Retry])를 따른다. 지금 `project_unavailable`의 "This folder is no longer available"은 폴더가 그대로 있는 이 경우에 사실과 다르다. 이 상태는 `/design-draft`로 먼저 그린다.

## 9. POSTMORTEM에서 가져온 함정

- **2026-10-22 — Guessing the repo root in TS after a failed CLI run re-created a discovery rule differently**: "when the CLI does not answer a question about the repo, ask it again in a narrower form (`doan ls --repo <path>`) instead of inferring in TS. Grep for TS code that inspects repo markers: `grep -rnE '"\.doan"|config\.json' app/src | grep -v test` — only the watcher should match." → 잘못된 파일을 CLI가 이름으로 알려 주고, `folders:reveal`의 `.doan/config.json` 조합을 지운다. T4 검증: `index.ts`에서 이 grep이 비고, 저장소 전체 결과는 `index.ts`의 줄만 빠진다.
- **2026-11-09 — CLI path messages contradicted ARCHITECTURE §12 and §13**: "For any message that interpolates a CLI argument, test it with an absolute argument." → 메시지는 바꾸지 않고, 절대 경로는 구조화 필드에만 둔다. Go 테스트는 `--repo`에 절대 경로를 주는 경우와 cwd에서 찾는 경우를 함께 둔다.
- **2026-11-08 — A fake CLI mode meant for one root re-rooted another root its watcher re-read**: "a fake CLI mode that changes what one root's read publishes applies only to that root." → `shell.test.ts`의 fake CLI(`gitCli`, `autoCli`)를 config 실패 모드와 설정 외 실패 모드로 나눌 때 각 모드는 그 root에만 적용한다(T3).
- **2026-10-21(§13 'Re-root')**: "Success re-reads the stored path and never adopts `result.repo`." → `config`의 디렉터리를 root로 받아들이지 않는다.

## 10. 다른 feature와의 겹침: `monorepo-services`

진행 중인 `docs/features/monorepo-services/`와 겹치는 곳:

- **`repo.ParseConfig`·`Find`**: monorepo-services는 config v2와 런타임 검사(id 중복, path 중첩 → `invalid_config`)를 더한다(그 design §2.2). 검사가 `ParseConfig` 안에 있으면 `Find`를 거쳐 자동으로 `config`가 붙는다. `Find` 밖에서 `invalid_config`를 낸다면 같은 `config`를 붙여야 Config error로 보인다. monorepo-services T2·T3에 이 사례를 더하도록 그 conductor에게 알린다.
- **`read.go` `scanCanvases`와 `repo.Canvases`**: monorepo-services가 시그니처를 바꾼다. 이 feature는 그 함수를 바꾸지 않고 `List`의 실패를 그대로 둔다. 새 서비스 디렉터리의 읽기 실패도 `config` 없는 `internal_error`이므로 이 feature 뒤에는 CLI error로 보인다.
- **`folderState.ts`·`view.ts`**: monorepo-services는 `ls` 결과의 `services`를 읽으려고 같은 파일을 고칠 수 있다. 실패 갈래와 성공 갈래라 충돌은 작다.
- **`Onboarding.tsx`·`onboarding/projects.ts`**: monorepo-services는 셋업 패널에 서비스 목록을 더한다. 이 feature는 `projectNotice`의 실패 갈래 하나와 `register`·`confirmProject`의 실패 갈래만 고친다.
- **fixture**: monorepo-services는 `schema/fixtures/config/`와 app-socket v3·v4·v5를, 이 feature는 `schema/fixtures/cli-envelope/`와 app-socket v2를 고친다. 겹치지 않는다.
- **순서(§13 결정 7)**: 이 feature가 monorepo-services보다 먼저 병합한다. monorepo-services는 이 feature의 병합된 모양을 다시 읽고, 런타임 검사가 `Find` 밖에 있으면 같은 `config`를 붙인다.

## 11. `/agent-eval`

`--json` 실패 envelope에 필드가 더해지고 `doan onboarding`에 새 실패 code가 생기므로 AGENTS.md 'Workflow'의 "CLI output" 조건에 해당한다. 메시지와 guide는 바뀌지 않아 에이전트 행동의 변화는 예상하지 않지만, 마지막 통합 전에 모든 scenario로 한 round를 돌린다(T7).

## 12. PoC 의존

없음. Finder가 숨김 디렉터리(`.doan/`) 안의 파일을 고르는 것은 지금 `<root>/.doan/config.json`으로 이미 동작한다(PRODUCT §5 item 1). 부모 폴더의 숨김 디렉터리에서도 같은지는 T6에서 실제 앱으로 확인한다.

## 13. 결정 (사람)

1. **설정 외 `ls` 실패는 지금 CLI error 장면으로 보인다.** 새 문제 종류와 overlay 문구는 없다(§2.2, §8). 고르지 않은 안: 새 종류 "Read error", 모든 CLI error의 줄 문구 수정.
2. **Config error는 실패 envelope에 `error.config`가 있을 때다.** `Find`의 config 단계 실패 전부(읽기 권한 실패 포함)가 대상이다(§2.1, §2.2). 고르지 않은 안: code(`invalid_config`·`unsupported_version`)로 가르기, 새 code `unreadable_config`.
3. **필드는 `error.config`, 설정 파일의 절대 경로다**(§2.1, §5). Show in Finder는 그 경로가 있으면 종류와 관계없이 고르고, 없거나 확인할 수 없을 때만 프로젝트 폴더를 연다(§2.4). 고르지 않은 안: `error.root` 디렉터리, 저장소 기준 상대 경로.
4. **envelope `v`는 1 그대로이고 `config`는 선택 필드다**(§5). 고르지 않은 안: `cli-envelope.v2`.
5. **Config error overlay의 줄 문구는 부모 config일 때도 그대로다**(§8). 고르지 않은 안: 부모 config일 때나 늘 `displayPath(config)`를 보이기.
6. **Add·Locate에서 `--repo` 결과가 설정 외 실패인 폴더는 지금처럼 저장하고 CLI error로 보인다.** 첫 실행 등록과 확인은 새 code `project_unreadable`로 실패하고, 창은 "Doan couldn’t read this folder." 안내와 CLI 메시지(detail), [Choose another folder, Retry]를 보인다. 소켓 답의 메시지는 고정 문장이다(§2.3, §2.5). 고르지 않은 안: 거절, `project_unavailable` 재사용(그 문구 "This folder is no longer available"이 사실과 다름).
7. **이 feature가 `monorepo-services`보다 먼저 병합한다**(§10). 고르지 않은 안: monorepo-services 먼저, 순서 없음.
