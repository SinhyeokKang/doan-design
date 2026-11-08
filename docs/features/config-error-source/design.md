# config-error-source — design

## 1. 지금 흐름

| 단계 | 위치 | 지금 동작 |
|---|---|---|
| 저장소 찾기 | `cli/internal/repo/find.go` `Find` | `--repo`면 그 폴더만, 아니면 위로 올라가며 첫 `.doan/config.json`. config 단계의 실패는 `invalid_config`(정규 파일 아님, parse 실패), `unsupported_version`, `internal_error`(읽기 실패, `stat`이 "없음"·`ENOTDIR` 말고 다른 이유로 실패). 시작 경로의 I/O 실패도 `internal_error` |
| 실패를 envelope로 | `cli/internal/cli/run.go` `repository` | `repo.Error`의 `Code`·`Message`에 고정 `nextSteps`. 경로는 메시지 안에만 있다 |
| `ls` 본문 | `cli/internal/cli/read.go` `List` | `scanCanvases`(나열 실패)·`repo.Scope`(I/O 실패)는 `internal(e)`로 명령 전체를 실패시킨다. 메시지는 OS 오류 그대로(절대 경로 포함) |
| envelope → 상태 | `app/src/main/folderState.ts` `folderState` | `repo_not_found` → `uninitialized`, 그 밖의 `ok: false` → `{ kind: "error", message }`, envelope가 아니거나 실행 실패 → `cliError` |
| 위로 다시 읽기 | `app/src/main/shell.ts` `refresh` | 손으로 추가한 root가 `uninitialized`면 cwd로 `ls`를 다시 돌린다. 다른 root가 나오면 re-root, 실패면 그 실패가 하위 폴더의 상태가 된다 |
| 화면 | `problemView.ts`, `homeCards.ts`, `projectSettingsRules.ts`, `ShellSidebar.tsx`, `ProjectOverview.tsx` | `error` = Config error(Retry, Show in Finder, Details), `cliError` = CLI error(Retry, Details, Remove from Doan) |
| Show in Finder | `app/src/main/index.ts` `folders:reveal` | 항목이 `error`이고 `<root>/.doan/config.json`이 파일이면 그 파일, 아니면 root |

## 2. 바꾸는 것

### 2.1 CLI: 설정 파일을 짚는 `error.config`

- `repo.Error`에 `Config string`을 더한다. `Find`는 `.doan/config.json`을 살피는 단계의 실패마다 그 파일의 경로(지금 메시지에 쓰는 `path`, 해석된 절대 경로)를 넣는다. 대상은 지금 `Find`의 config 단계 다섯 갈래다: `stat` 실패(없음·`ENOTDIR` 제외), 정규 파일 아님, 읽기 실패, parse 실패(`invalid_config`), `unsupported_version`. 시작 경로의 실패와 `repo_not_found`에는 넣지 않는다.
- `cli.Error`에 `Config string \`json:"config,omitempty"\``를 더하고, `repository()`가 `repo.Error.Config`를 옮긴다. 그래서 `repo.Find`를 거치는 모든 저장소 명령이 같은 필드를 낸다. `code`, `message`, `nextSteps`, `ExitCode`는 바꾸지 않는다.
- 사람용 출력은 지금처럼 `message`와 `nextSteps`만 쓴다. `config`는 `--json`에만 있다.
- 절대 경로인 이유: 부모 폴더의 config는 `--repo` 밖에 있고, 실패한 명령에는 기준이 될 root가 없다. `ls`의 `root`, `git`, `export`의 `output`처럼 명시적 예외로 ARCHITECTURE §12에 적는다. 메시지에 절대 경로를 더하지 않으므로 POSTMORTEM 2026-11-09의 규칙과 부딪치지 않는다.
- 설정 외 실패(`List`의 `scanCanvases`·`Scope` 실패)는 그대로 `internal_error`이고 `config`가 없다.

### 2.2 앱: 상태 분류

- `FolderState`:
  - `{ kind: "error"; message: string; config: string }`: 실패 envelope에 `config`가 있을 때. 이것만 Config error다.
  - `{ kind: "cliError"; reason: string; code?: string }`: `config`가 없는 실패 envelope(`repo_not_found` 제외)도 여기로 온다. `reason`은 CLI의 `message`(빈 메시지면 지금 `cliReason`의 문장), `code`는 envelope의 `error.code`. `code`는 "CLI가 envelope로 답했다"는 표시이며 화면에는 쓰지 않는다. 실행 실패·시간 초과·읽을 수 없는 답은 지금처럼 `code` 없이 온다.
- `exitCode === 0`인 실패 envelope는 지금처럼 `cliError`다.
- `FolderEntry`의 `error`에 `config`를 더한다(`view.ts` `folderEntry`). `cliError` 항목은 지금 모양 그대로이며 `code`는 main 안에서만 쓴다.
- 화면 쪽 함수(`problemView`, `cardRow`, `projectSettingsPageView`, `canvasViewUpdate`, `sidebarSlot`, App의 Details)는 바꾸지 않는다. 같은 `error`·`cliError` 갈래가 이제 맞는 실패를 받을 뿐이다.

### 2.3 앱: `error`가 "Go가 root로 읽었다"는 뜻으로 쓰이던 곳

설정 외 실패가 `cliError`로 옮겨 가므로, `error`를 보고 판단하던 곳이 지금 동작을 지키도록 `cliError`의 `code`를 함께 본다.

| 위치 | 지금 | 바꾼 뒤 |
|---|---|---|
| `view.ts` `openDecision`(Add, Locate, `shell.ts` 폴더 열기) | `asRepo`가 `list`나 `error`면 고른 폴더를 저장 | `asRepo`가 `list`, `error`, 또는 `code`가 있는 `cliError`면 저장. 거절 메시지는 지금처럼 첫 실행 결과에서 |
| `addFlow.ts` `classifyPick`, `addProjects.ts`, `shell.ts`의 `asRepo` 조건 | `error`나 `cliError`면 `--repo`로 다시 묻는다 | 그대로 |
| `onboarding/projects.ts` `candidate` | `cliError` → 후보 아님, `error` → 계획한 후보 | `code` 없는 `cliError`만 후보 아님. `code`가 있는 `cliError`는 지금의 `error`처럼 계획한 후보 |
| `onboarding/projects.ts` `register`, `confirmProject` | `error` → `config_invalid`, `cliError` → `project_unavailable` | 그대로(설정 외 실패는 이제 `project_unavailable`. 결정 6) |

`config` 필드는 판단에 쓰지 않는다. `--repo <고른 폴더>`는 위로 올라가지 않으므로 그 실행의 `config`는 늘 고른 폴더의 것이며, 앱이 경로를 비교해 root를 정하지 않는다(POSTMORTEM 2026-10-22, 2026-10-21 "Success re-reads the stored path and never adopts `result.repo`").

### 2.4 앱: Show in Finder

- `folders:reveal`은 renderer에게서 저장된 root만 받는다(지금과 같음). main은 그 root의 항목이 `error`이고 그 `config`가 파일이면 그 파일을, 아니면 root를 `shell.showItemInFolder`에 넘긴다. 이 판단을 순수 함수 `revealTarget(entry, isFile)`로 뺀다.
- `config`는 main이 돌린 CLI의 답에서만 오고 renderer는 보내지 않는다. main은 지금처럼 그 파일이 있는지만 보고 읽지 않는다.
- `join(path, ".doan", "config.json")`을 지운다. 이로써 ARCHITECTURE §7 'Recovery'와 §13 'Discovery'의 "TS가 `.doan/` 경로를 만드는 유일한 예외"가 없어진다.

## 3. 영향 받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 형식 | `schema/cli-envelope.v1.schema.json`의 실패 `error`에 선택 필드 `config`. `schema/fixtures/cli-envelope/{valid,invalid}` 사례 |
| CLI (Go) | `cli/internal/repo/find.go`(`Error.Config`, `Find`), `cli/internal/cli/envelope.go`(`Error.Config`), `cli/internal/cli/run.go`(`repository`) |
| app main | `folderState.ts`, `view.ts`(`FolderEntry`, `folderEntry`, `openDecision`), `onboarding/projects.ts`(`candidate`), `index.ts`(`folders:reveal`) |
| app renderer | 코드 변경 없음. 같은 갈래가 맞는 실패를 받는다 |
| skills | 없음. guide와 preset은 그대로 |
| `.doan/config.json`, `runtime.json`, app socket | 없음 |

## 4. 순수 함수 (`/tdd` 대상)

- Go `repo.Find`(임시 디렉터리 테스트): config 단계 다섯 갈래의 `Config`, 위로 찾다 부모의 깨진 config에서 멈출 때 부모 경로, `--repo`일 때 그 폴더의 경로, 시작 경로 실패와 `repo_not_found`에는 빈 값.
- Go `cli.Envelope`: `Config`가 있으면 `error.config`, 없으면 키 없음. 결과가 envelope schema를 통과.
- Go `List` 통합: `.doan/canvases/<sub>`가 읽을 수 없으면(권한 000) `internal_error`이고 `config` 없음.
- TS `folderState`: `config` 있는 실패 → `error`, 없는 실패 → `code`가 있는 `cliError`(빈 메시지면 지금 문장), `repo_not_found` → `uninitialized`, `exitCode === 0` 실패 → `cliError`, 깨진 envelope → `code` 없는 `cliError`.
- TS `folderEntry`: `error`의 `config`를 옮긴다.
- TS `openDecision`과 `classifyPick`: `asRepo`가 `error`, `code` 있는 `cliError`, `code` 없는 `cliError`일 때 각각 저장·저장·거절.
- TS `onboarding/projects.ts` `candidate`·`register`(주입된 `deps.ls`로): 위 표의 갈래.
- TS `revealTarget(entry, isFile)`: `error`이고 파일 있음 → `config`, `error`이고 파일 없음 → root, 다른 종류 → root.

## 5. 형식 변경

- `schema/cli-envelope.v1.schema.json`의 실패 `error`에 `"config": { "type": "string", "pattern": "^/" }`를 더하고 `required`에는 넣지 않는다. `additionalProperties: false`는 그대로다.
- **`v`는 올리지 않는다(결정 4).** 이유: 새 필드는 선택이고, 이 schema로 envelope를 검증하는 쪽은 앱(번들된 CLI만 쓴다, ARCHITECTURE §7 'CLI lookup and local package')과 eval runner(같은 저장소)뿐이다. 이전 schema를 가진 읽는 쪽이 새 CLI 출력을 받는 경우는 개발 중 `DOAN_CLI`나 `PATH`의 `doan`이 다른 버전일 때뿐이다. 에이전트는 JSON을 읽을 뿐 schema로 거절하지 않는다. `error.code`가 enum이 아니어서 새 code에 `v`가 필요 없는 것(§12)과 같은 방향이다.
- 두 언어가 읽는 fixture(이름표 `cli-envelope`로 `valid/`·`invalid/`를 도는 `app/src/formats/validate.test.ts`와 `cli/internal/formats/validate_test.go`):
  - `valid/invalid-config-with-config.json`: `invalid_config`와 `config: "/tmp/repo/.doan/config.json"`.
  - `invalid/relative-config.json`: `config: ".doan/config.json"`.
  - `invalid/nonstring-config.json`: `config: 1`.
- `app/src/main/folderState.test.ts`도 위 `valid/` fixture를 읽어 `error` 상태가 되는지 본다.
- `result` 모양은 바뀌지 않는다.

## 6. 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 없음.
- ARCHITECTURE §12: 실패 envelope 설명에 `error.config`(설정 파일 때문에 실패했을 때 그 파일의 절대 경로, 명시적 예외)를 더한다.
- ARCHITECTURE §7 'Recovery'와 §13 'Discovery'의 괄호: Show in Finder가 CLI가 짚은 파일을 고르며 TS는 `.doan/` 경로를 만들지 않는다로 고친다.
- PRODUCT §5 item 1(Show in Finder 문장)과 item 3 'Problem states': Config error는 CLI가 설정 파일을 짚은 실패이고, 그 밖의 읽기 실패는 CLI error로 보인다. Show in Finder는 그 파일을 고르며, 부모 폴더의 config일 수도 있다.

## 7. 결정 영향

- **"Discovery stays in Go only", "The app never reads config itself"(ARCHITECTURE §13)**: 지킨다. 어느 파일이 잘못인지는 Go가 정해 이름으로 알려 주고, 앱은 그 파일이 있는지만 본다. 앱이 `.doan/` 경로를 만드는 유일한 예외가 없어져 규칙이 오히려 단순해진다.
- **Re-root(§13 'The app's folders')**: 바꾸지 않는다. `config`의 디렉터리를 root로 쓰지 않는다.
- **serving scope, sandbox iframe, git 명령 없음**: 무관하다.

## 8. UI와 문구

- design preset `clarify`를 읽었다. 기준: 오류는 무엇이 실패했는지, 알면 왜, 어떻게 복구하는지를 말하고, 시스템이 모르는 원인이나 해결을 약속하지 않는다.
- 설정 외 실패는 지금 CLI error 장면을 그대로 쓴다(결정 1). heading "Doan couldn’t read <name>"이 무엇이 실패했는지, 줄 "The doan command failed while reading it. Try again."이 실패한 주체와 복구를 말하고, Details가 원인(예: `open …/.doan/canvases/sub: permission denied`)을 보인다. 앱은 원인이 권한인지 버그인지 모르므로 더 구체적인 원인을 문구에 넣지 않는다. 지금 Config error 문구(".doan/config.json has an error")는 잘못이 없는 파일을 탓하므로 clarify 기준에 어긋나며, 이번 변경으로 그 문구가 맞는 경우에만 나온다.
- 새 문구가 없으므로 확정 초안 `.doan/canvases/problem-project.html`과 DESIGN.md 'Problem rows'는 바뀌지 않고, `/design-draft`는 필요 없다. 부모 config에서 온 Config error도 줄 문구는 그대로다(결정 5).

## 9. POSTMORTEM에서 가져온 함정

- **2026-10-22 — Guessing the repo root in TS after a failed CLI run re-created a discovery rule differently**: "when the CLI does not answer a question about the repo, ask it again in a narrower form (`doan ls --repo <path>`) instead of inferring in TS. Grep for TS code that inspects repo markers: `grep -rnE '"\.doan"|config\.json' app/src | grep -v test` — only the watcher should match." → 잘못된 파일을 CLI가 이름으로 알려 주고, `folders:reveal`의 `.doan/config.json` 조합을 지운다. 이 grep 결과를 T4 검증에 넣는다(`ProblemOverlay.tsx`의 `CONFIG_FILE`은 화면 문구라 남는다).
- **2026-11-09 — CLI path messages contradicted ARCHITECTURE §12 and §13**: "For any message that interpolates a CLI argument, test it with an absolute argument." → 메시지는 바꾸지 않고, 절대 경로는 구조화 필드에만 둔다. Go 테스트는 `--repo`에 절대 경로를 주는 경우와 cwd에서 찾는 경우를 함께 둔다.
- **2026-11-08 — A fake CLI mode meant for one root re-rooted another root its watcher re-read**: "a fake CLI mode that changes what one root's read publishes applies only to that root." → `shell.test.ts`나 reveal 테스트에서 `config`를 붙인 `error` 모드나 설정 외 실패 모드를 더하면 그 root에만 적용한다.
- **2026-10-21(§13 'Re-root')**: "Success re-reads the stored path and never adopts `result.repo`." → `config`의 디렉터리를 root로 받아들이지 않는다.

## 10. 다른 feature와의 겹침: `monorepo-services`

진행 중인 `docs/features/monorepo-services/`와 겹치는 곳:

- **`repo.ParseConfig`·`Find`**: monorepo-services는 config v2와 런타임 검사(id 중복, path 중첩 → `invalid_config`)를 더한다(그 design §2.2). 검사가 `ParseConfig` 안에 있으면 `Find`를 거쳐 자동으로 `config`가 붙는다. `Find` 밖에서 `invalid_config`를 낸다면 같은 `config`를 붙여야 Config error로 보인다. monorepo-services T2·T3에 이 사례를 더하도록 그 conductor에게 알린다.
- **`read.go` `scanCanvases`와 `repo.Canvases`**: monorepo-services가 시그니처를 바꾼다. 이 feature는 그 함수를 바꾸지 않고 `List`의 실패를 그대로 둔다. 새 서비스 디렉터리의 읽기 실패도 `config` 없는 `internal_error`이므로 이 feature 뒤에는 CLI error로 보인다.
- **`folderState.ts`·`view.ts`**: monorepo-services는 `ls` 결과의 `services`를 읽으려고 같은 파일을 고칠 수 있다. 실패 갈래와 성공 갈래라 충돌은 작다.
- **fixture**: monorepo-services는 `schema/fixtures/config/`를, 이 feature는 `schema/fixtures/cli-envelope/`를 고친다. 겹치지 않는다.
- **순서(결정 7)**: 이 feature가 monorepo-services보다 먼저 병합한다. 작고, monorepo-services의 새 실패 경로가 처음부터 맞는 분류를 받는다. monorepo-services는 이 feature의 병합된 모양을 다시 읽고, 런타임 검사가 `Find` 밖에 있으면 같은 `config`를 붙인다.

## 11. `/agent-eval`

`--json` 실패 envelope에 필드가 더해지므로 AGENTS.md 'Workflow'의 "CLI output" 조건에 해당한다. 메시지와 guide는 바뀌지 않아 에이전트 행동의 변화는 예상하지 않지만, 마지막 통합 전에 한 round를 돌린다(T6).

## 12. PoC 의존

없음. Finder가 숨김 디렉터리(`.doan/`) 안의 파일을 고르는 것은 지금 `<root>/.doan/config.json`으로 이미 동작한다(PRODUCT §5 item 1). 부모 폴더의 숨김 디렉터리에서도 같은지는 T5에서 실제 앱으로 확인한다.

## 13. 결정 (사람)

1. **설정 외 `ls` 실패는 지금 CLI error 장면으로 보인다.** 새 문제 종류와 새 문구는 없다(§2.2, §8). 고르지 않은 안: 새 종류 "Read error", 모든 CLI error의 줄 문구 수정.
2. **Config error는 실패 envelope에 `error.config`가 있을 때다.** `Find`의 config 단계 실패 전부(읽기 권한 실패 포함)가 대상이다(§2.1, §2.2). 고르지 않은 안: code(`invalid_config`·`unsupported_version`)로 가르기, 새 code `unreadable_config`.
3. **필드는 `error.config`, 설정 파일의 절대 경로다**(§2.1, §5). 고르지 않은 안: `error.root` 디렉터리, 저장소 기준 상대 경로.
4. **envelope `v`는 1 그대로이고 `config`는 선택 필드다**(§5). 고르지 않은 안: `cli-envelope.v2`.
5. **Config error overlay의 줄 문구는 부모 config일 때도 그대로다**(§8). 고르지 않은 안: 부모 config일 때나 늘 `displayPath(config)`를 보이기.
6. **Add·Locate·첫 실행에서 `--repo` 결과가 설정 외 실패인 폴더는 지금처럼 저장하고 CLI error로 보인다.** 첫 실행 등록은 `project_unavailable`로 실패한다(§2.3). 고르지 않은 안: 거절.
7. **이 feature가 `monorepo-services`보다 먼저 병합한다**(§10). 고르지 않은 안: monorepo-services 먼저, 순서 없음.
