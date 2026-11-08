# config-error-source — spec

`doan ls`가 실패한 프로젝트를 앱이 Config error로 보이는 기준을 "CLI가 잘못된 설정 파일을 이름으로 짚었을 때"로 좁힌다. CLI는 설정 파일 때문에 실패하면 그 파일의 절대 경로를 실패 envelope의 새 필드 `error.config`에 넣는다. 앱은 그 필드가 있을 때만 Config error로 보이고, Show in Finder는 그 경로를 고른다. 설정과 무관한 실패는 CLI error로 보인다.

대상: `docs/BACKLOG.md` 'Known defects'의 두 줄.

> - Every `ls` failure other than a missing repository, not only a broken `.doan/config.json`, reaches the app as an `error` entry, so an `internal_error` such as an unreadable `.doan/canvases/<sub>` shows as Config error, says `.doan/config.json` has an error, and Show in Finder selects that file although it has no fault.
> - A Config error that comes from a parent folder's config through the upward re-read shows the subfolder in Show in Finder, where there is no file to fix; selecting the parent's config needs the CLI to name the config path in its error, since the app must not guess it.

## 사용자

- **사람(앱 사용자)**: 문제 프로젝트를 문제 overlay, 사이드바 project menu, Overview의 recovery menu(branch chip), Project Settings 페이지에서 본다. 설정 파일이 잘못됐을 때만 Config error와 ".doan/config.json has an error"를 보고, Show in Finder로 고칠 파일 바로 그 자리에 간다. 설정과 무관하게 읽기가 실패하면 CLI error(Retry, Details, Remove from Doan)를 보고, Details에서 CLI의 메시지로 원인을 읽는다.
  - CLI error overlay에는 Show in Finder가 없다. 사이드바와 Overview의 menu는 어느 상태에서나 Show in Finder로 프로젝트 폴더를 연다.
  - 첫 실행에서 고른 폴더를 설정과 무관한 이유로 읽을 수 없으면, 새 안내("Doan couldn’t read this folder.")와 CLI의 메시지를 보고 Retry하거나 다른 폴더를 고른다.
- **에이전트**: 저장소 명령(`ls`, `check`, `export`, `work`, `open`, `config` 등)의 `--json` 실패 envelope에서, 설정 파일 때문에 실패했을 때 `error.config`로 그 파일의 절대 경로를 받는다. `code`, `message`, `nextSteps`와 종료 코드는 그대로이므로 에이전트의 행동은 바뀌지 않는다. `doan onboarding`에는 새 실패 code `project_unreadable`이 생긴다. guide는 바꾸지 않는다.

## 문제 (관찰된 사실)

1. 앱의 `folderState`(`app/src/main/folderState.ts`)는 `ok: false` envelope 중 `repo_not_found`만 `uninitialized`로 두고 나머지를 모두 `{ kind: "error", message }`로 만든다. 이 `error`가 화면에서 Config error다(`problemView.ts` `scene`, `homeCards.ts` `cardRow`, `projectSettingsRules.ts`).
2. 그래서 설정과 무관한 `internal_error`도 Config error가 된다. 예: `.doan/canvases/<sub>`를 읽을 수 없으면 `repo.Canvases`의 `WalkDir`가 실패하고, `List`(`cli/internal/cli/read.go`)가 `internal(e)`로 `ls` 전체를 실패시킨다. 서빙 범위 계산(`repo.Scope`)의 I/O 실패도 같다. 화면은 ".doan/config.json has an error. Fix it, then retry."라고 말하고, Show in Finder는 아무 잘못이 없는 `<root>/.doan/config.json`을 고른다(`app/src/main/index.ts` `folders:reveal`).
3. 손으로 추가한 폴더가 `ls --repo <폴더>`에서 `repo_not_found`이면, 앱은 그 폴더를 cwd로 `ls`를 다시 돌린다(위로 다시 읽기, `shell.ts` `refresh`). 그때 부모 폴더의 `.doan/config.json`이 깨져 있으면 `invalid_config`가 와서 하위 폴더가 Config error가 된다. 하지만 `folders:reveal`은 `<root>/.doan/config.json`이 파일일 때만 그것을 고르고 아니면 root를 보이므로, 고칠 파일이 없는 하위 폴더가 Finder에 열린다.
4. 실패 envelope에는 문제가 된 설정 파일의 경로가 구조화된 필드로 없다. `invalid_config` 메시지에 절대 경로가 들어 있지만("Cannot read config: <path>"), 앱이 메시지를 해석해 경로를 꺼내면 추측이 된다(POSTMORTEM 2026-10-22).
5. 첫 실행에서 설정과 무관한 실패는 `config_invalid`("This folder’s Doan configuration couldn’t be read.")가 되고, 이번 변경 뒤 그대로 `project_unavailable`로 옮기면 그 문구("This folder is no longer available…")도 사실과 다르다(`app/src/renderer/Onboarding.tsx` `projectNotice`).

## 완료 조건

1. 저장소 명령의 `repo.Find`가 `.doan/config.json`을 살피다 실패하면(그 경로의 `stat`이 '없음'·`ENOTDIR` 말고 다른 이유로 실패, 정규 파일이 아님, 읽기 실패, parse 실패, 지원하지 않는 `v`), `--json` 실패 envelope의 `error`에 `config`(그 파일의 절대 경로)가 있다. `code`, `message`, `nextSteps`, 종료 코드는 지금과 같다. `ls`가 아닌 명령(`check`나 `config`)도 같은 필드를 낸다. 이 경우를 Go 테스트가 고정한다.
2. 위로 올라가며 찾다가 부모 폴더의 깨진 config에서 멈추면, `config`는 그 부모의 `.doan/config.json`이다. `--repo`로 한 폴더만 볼 때는 그 폴더의 config다.
3. 설정 파일과 무관한 실패(`.doan/canvases/<sub>`를 읽을 수 없음, 서빙 범위의 I/O 실패, 시작 경로 자체의 I/O 실패, `repo_not_found`)의 envelope에는 `config`가 없다.
4. `schema/cli-envelope.v1.schema.json`이 `error.config`를 선택 필드로 받고, Go와 TypeScript가 같은 `schema/fixtures/cli-envelope/{valid,invalid}` fixture로 검증한다. envelope의 `v`는 1 그대로다(design §13 결정 4).
5. 앱은 `config`가 있는 실패만 Config error로 보인다. `.doan/canvases/<sub>`를 읽을 수 없는 프로젝트는 CLI error로 보이고, Details는 CLI의 메시지를 그대로 보인다(design §13 결정 1).
6. Config error의 Show in Finder(문제 overlay, 사이드바 project menu, Overview의 recovery menu, Project Settings 페이지 머리)는 `config` 경로가 있으면(파일이든 디렉터리든) 그 경로를 고르고, 없거나 확인할 수 없으면 프로젝트 폴더를 연다. 부모 config에서 온 Config error는 부모의 `.doan/config.json`을 고른다.
7. Show in Finder는 더 이상 `.doan/config.json` 경로를 만들지 않는다. `grep -nE '"\.doan"|config\.json' app/src/main/index.ts`의 결과가 비고, `grep -rnE '"\.doan"|config\.json' app/src | grep -v test`(POSTMORTEM 2026-10-22의 검색)는 지금과 비교해 `index.ts`의 줄만 빠진다.
8. 폴더를 추가하거나 Locate할 때 어느 폴더를 저장할지는 지금과 같다. `--repo <고른 폴더>`가 설정 외 실패를 돌려주면 그 폴더는 저장되고 CLI error로 보인다. 거절할 때는 설정 외 실패의 문구에 `doan CLI error:` 머리가 붙는다(design §13 결정 6).
9. 첫 실행에서 등록이나 확인이 설정 외 실패를 받으면 새 code `project_unreadable`로 실패한다. 창은 "Doan couldn’t read this folder." 안내, CLI의 메시지(detail), [Choose another folder, Retry]를 보인다. 소켓 답의 `message`는 고정 문장이고 CLI 메시지를 담지 않는다(design §13 결정 6).
10. 부모 config가 깨진 하위 폴더 프로젝트에서 부모 config를 고치고 Retry하면 overlay가 사라지고, 그 항목은 지금 규칙(ARCHITECTURE §13 'Re-root')대로 부모 root로 바뀐다.
11. 실제 앱에서 확인한다: 읽을 수 없는 `.doan/canvases/<sub>`가 있는 프로젝트가 CLI error overlay를 보이고, 부모 config가 깨진 하위 폴더 프로젝트의 Show in Finder(overlay와 menu 하나)가 부모의 config를 고르며, 완료 조건 10이 성립한다.

## 비목표

- 읽을 수 없는 하위 디렉터리를 `ls`가 행 오류로 넘기고 나머지를 나열하는 것. 지금 규칙("Whole-set failures fail the command", ARCHITECTURE §12)을 바꾸는 일이라 이번에는 하지 않고, 승격 때 `docs/BACKLOG.md` 'Undecided'에 남긴다.
- 새 문제 종류(예: Read error)와 그 문구, 문제 overlay 초안(design §13 결정 1).
- Config error overlay의 줄 문구(".doan/config.json has an error. Fix it, then retry.") 변경. 부모 config일 때도 줄은 그대로다(design §13 결정 5). `unsupported_version`일 때도 이 줄이 나오는 것은 승격 때 BACKLOG 'Known defects'에 남긴다.
- `doan init`이 스스로 하는 config 검사(`cli/internal/cli/init.go`)와 `doan config`가 새 값을 검사하는 실패(`usage_error`)에 `config` 필드를 붙이는 것. `doan config`도 `repo.Find`를 거치므로(`config.go` `repository`), Find 단계의 실패에는 `config`가 붙는다.
- 사람용(비 `--json`) 출력. `config`는 JSON envelope에만 있다.
- guide(`cli/internal/cli/skill.md`)와 `doan help` 문구 변경.
- 부모 config가 사라졌을 때 다시 읽기를 바꾸는 것.
