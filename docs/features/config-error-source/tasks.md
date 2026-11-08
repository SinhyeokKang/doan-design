# config-error-source — tasks

선행 조건: design §13의 결정 1–7. 이 feature는 `monorepo-services`보다 먼저 병합한다(결정 7, design §10).

순서: 형식 → Go → TS 순수 함수 → main shell → 실제 앱 확인 → agent eval → 승격. 초안은 없다(design §8).

## T1. 형식

- `schema/cli-envelope.v1.schema.json`의 실패 `error`에 선택 필드 `config`(`type: string`, `pattern: "^/"`). `schema/fixtures/cli-envelope/valid/invalid-config-with-config.json`, `invalid/relative-config.json`, `invalid/nonstring-config.json`(design §5).
- 검증: `go test ./...`와 `npm --prefix app test` green. 두 쪽이 같은 `valid/`·`invalid/`를 읽고, 기존 fixture는 그대로 통과한다.
- **commit 경계**: `feat(formats): name the config file in CLI failures`

## T2. CLI: `error.config`

- `repo.Error.Config`와 `Find`의 config 단계 다섯 갈래, `cli.Error.Config`(`json:"config,omitempty"`), `repository()`가 옮김(design §2.1).
- 테스트(`cli/internal/repo/repo_test.go` 또는 새 `find_test.go`, `cli/internal/cli/run_test.go`):
  - `ls --repo <root>`에서 깨진 config, 지원하지 않는 `v`, 디렉터리인 config, 읽을 수 없는 config(권한 000) → 각각 지금 code와 종료 코드, `config`는 `<root>/.doan/config.json`의 절대 경로.
  - config 없는 하위 폴더를 cwd로 `ls` → 부모의 깨진 config에서 멈추고 `config`는 부모의 경로.
  - `--repo`에 절대 경로를 준 경우와 cwd에서 찾은 경우 모두(POSTMORTEM 2026-11-09).
  - `.doan/canvases/<sub>` 권한 000 → `internal_error`, `config` 없음. `repo_not_found`, 시작 경로가 파일 → `config` 없음.
  - 모든 실패 envelope가 `formats.ValidateEnvelope`를 통과한다.
- 검증: `go test ./...`, `go vet ./...` 통과.
- **commit 경계**: `feat(cli): failures caused by a config file name it`

## T3. app: 상태 분류 (순수 함수)

- `folderState`의 `error`(`config` 있음)와 `cliError`(`code` 선택), `folderEntry`의 `config`, `openDecision`, `onboarding/projects.ts` `candidate`, 새 `revealTarget(entry, isFile)`(design §2.2–§2.4, §4).
- 테스트: `folderState.test.ts`(T1의 `valid/` fixture를 읽어 `error`가 되는지 포함), `view.test.ts`, `addFlow.test.ts`(`classifyPick`), `onboarding/projects.test.ts`(`candidate`·`register`·`confirmProject`의 갈래), `revealTarget` 사례. 기존 테스트 중 `internal_error`를 Config error로 기대하던 것은 `cliError`로 고친다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `fix(app): only a named config file makes a Config error`

## T4. app main: Show in Finder

- `folders:reveal`이 `revealTarget`을 쓰고, `join(path, ".doan", "config.json")`을 지운다. 주석을 새 규칙(CLI가 짚은 파일을 고름)으로 고친다(design §2.4).
- 테스트: `app/src/main/index.test.ts`의 'locate and reveal'에 `config`가 있는 `error` 항목(자기 config, 부모 config, 파일이 사라진 config). fake CLI 모드는 그 root에만 적용한다(POSTMORTEM 2026-11-08).
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과. `grep -rnE '"\.doan"|config\.json' app/src | grep -v test`에서 `index.ts`가 사라지고 watcher와 화면 문구(`ProblemOverlay.tsx` `CONFIG_FILE`, `projectSettingsRules.ts`·`Onboarding.tsx`의 문장)만 남는다(POSTMORTEM 2026-10-22).
- `/verify`(`node .agents/skills/verify/scripts/verify.mjs`) 통과.
- **commit 경계**: `fix(app): Show in Finder selects the config file the CLI named`

## T5. 실제 앱 확인 (`/runtime-test`)

- 격리한 HOME·userData·`DOAN_RUNTIME`과 T2의 CLI로 앱을 띄워 확인한다(AGENTS.md 'Commands'의 dev 실행).
  1. 등록한 프로젝트의 `.doan/canvases/<sub>`를 `chmod 000` → 사이드바 항목과 overlay가 CLI error(Retry, Details, Remove from Doan)이고, Details에 CLI 메시지가 보인다. 권한을 되돌리고 Retry → 목록으로 돌아온다.
  2. 부모 폴더에 깨진 `.doan/config.json`, 하위 폴더를 손으로 추가해 둔 상태(하위 폴더를 먼저 추가한 뒤 부모 config를 깨거나, 저장된 `folders.json`에 넣고 시작) → Config error, Show in Finder가 부모의 `.doan/config.json`을 고른다. Finder 선택은 `osascript -e 'tell application "Finder" to get selection as alias list'`나 화면 캡처로 확인한다.
  3. 회귀: 자기 config가 깨진 프로젝트의 Show in Finder가 그 프로젝트의 `.doan/config.json`을 고른다.
- 검증: 세 확인의 스크린샷과 관찰을 `.scratch/runtime-test/config-error-source/`에 남기고 PR 본문에 적는다. Finder는 실제 Finder를 쓰므로 확인 뒤 연 창을 닫는다.
- **commit 경계**: 없음(코드 변경이 없으면).

## T6. `/agent-eval`

- 실패 envelope에 필드가 더해졌으므로 마지막 통합 전에 한 round를 돌린다(design §11, AGENTS.md 'Workflow'). `npm --prefix app run package` 뒤 `node eval/run.ts`.
- 검증: 결과를 `docs/USABILITY-EVAL.md`에 기록한다. 이 변경 때문에 생긴 문제가 없어야 한다.
- **commit 경계**: `docs(eval): round for the config field in CLI failures`

## T7. 승격과 정리

- `docs/PRODUCT.md`(영어): §5 item 1의 Show in Finder 문장(CLI가 짚은 설정 파일을 고르며 부모 폴더의 것일 수 있다, 파일이 없으면 폴더), item 3 'Problem states'에 Config error와 CLI error를 가르는 기준(설정 파일을 짚은 실패만 Config error, 그 밖의 읽기 실패는 CLI error). 같은 문단의 Project Settings 문장도 맞는지 본다.
- `docs/ARCHITECTURE.md`(영어): §12 실패 envelope에 `error.config`(설정 파일 때문에 실패했을 때 그 절대 경로, 명시적 예외, `v` 그대로), §7 'Recovery'(CLI가 짚은 파일을 고름, TS는 `.doan/` 경로를 만들지 않음), §13 'Discovery'의 괄호, §11 fixture 설명이 필요하면.
- `docs/BACKLOG.md`: 'Known defects'의 두 줄을 지운다. 비목표로 남긴 "읽을 수 없는 하위 디렉터리를 행 오류로 넘기기"를 'Undecided'에 더할지 사용자에게 묻는다.
- `docs/features/config-error-source/`를 지운다.
- 검증: 문서만 바뀌므로 `/doc-check` 대상 절을 눈으로 대조하고, 위 grep과 `go test ./...`·`npm --prefix app test`가 여전히 green.
- **commit 경계**: 문서마다 하나(`docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`), 마지막에 `docs(feature): remove config-error-source`.
