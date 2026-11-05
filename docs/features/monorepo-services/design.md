# monorepo-services — design

결정 1–3은 spec '이미 정한 것', 결정 4–16은 맨 끝 '결정 (사람)'에 있다. 모두 사람이 정했다.

## 0. 결정 1의 비용 (사람이 서비스 먼저를 골랐다)

종류 먼저(`.doan/canvases/<id>/`)였다면 지금의 나열·서빙·check·export·watcher가 하위 폴더로 이미 다뤘다. 서비스 먼저(`.doan/services/<id>/{canvases,ds,assets}`)는 세 기본 디렉터리 밖에 새 캔버스·assets 위치를 만들므로, 다음을 모두 이 기능에서 바꿔야 한다. 각 항목의 설계와 task가 아래에 있다.

| 영역 | 지금 아는 위치 | 바꿀 곳 | 절 |
|---|---|---|---|
| 캔버스 나열·`doan ls` | `.doan/canvases`, `.doan/ds` | `cli/internal/repo/files.go` `Canvases`(호출처 `cli/internal/cli/read.go` `scanCanvases`, `export.go`) | §2.3 |
| 서빙 범위·export 경계 | 기본 디렉터리 세 개, `MetadataPath` | `cli/internal/repo/scope.go` `defaultServeDirs`·`MetadataPath`; export는 `repo.Scope`를 그대로 씀 | §2.4 |
| `doan check`의 token 판단 | 최상위 `tokenCss` | `cli/internal/check/`의 `hardcoded_color`·`token_css_not_found`, 새 경고 | §2.5 |
| 댓글 경로 | `.doan/comments/<id>.jsonl` | 바꾸지 않음. 고아 판단이 서비스 캔버스를 보게 함 | §2.6 |
| watcher | 고정 watcher(`.doan/canvases`·`ds` 재귀, `.doan/assets` 재귀, `.doan`, `.doan/comments`) | `app/src/main/watch.ts`, `designChange.ts` | §4.5 |
| 사이드바 group 닫힘 저장 | `ds`·`canvases` 두 id | `app/src/restore/uiState.ts` `parseGroups`, `app/src/renderer/shellNavigation.ts` `reconcileProjects` | §4.3 |
| 경로 분류 | `canvasPath.ts` `CANVAS_DIRS` | `canvasPath.ts`와 사용처 11곳(§4.6) | §4.6 |
| work·open·링크 경로 | `^\.doan/(canvases|ds)/[^/]+\.html$` | `work_rules.go`·`open_rules.go`, `runtime.ts`, `deepLinks.ts`, app-socket v3·v4 schema | §2.7 |
| 이전 CLI·앱 | — | 동작을 정하고 문서에 적음 | §2.8 |

## 1. 영향 받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 형식 | `.doan/config.json` v2(`services`), `schema/config.v2.schema.json`과 fixture, `unknown-version.json`을 v3으로. app-socket v3·v4(그리고 먼저 병합된 v5, §8.1) `path` pattern과 fixture, `open-link/cases.json` |
| CLI (Go) | `repo` 패키지의 config·나열·scope, `check`, `config`의 서비스 쓰기, `ls`의 `services`, `work`·`open` 경로, 새 후보 찾기 명령(가칭 `doan detect-services`)과 새 패키지(가칭 `cli/internal/workspace`) |
| skills | guide(`cli/internal/cli/skill.md`), 배치 디렉터리를 말하는 preset, 새 eval scenario |
| app main | watcher, `canvasPath.ts` 사용처, `runtime.ts`·`deepLinks.ts` 경로, 후보 찾기 reader와 `ProjectAdder`의 창 전용 IPC, Settings IPC의 서비스 쓰기(`configBridge.ts`, 새 channel은 `senderAllowed.ts` 허용 목록에) |
| app renderer | 셋업 패널 서비스 목록, Project Settings Services 구역, 사이드바 서비스 group, Quick Open·composer 제안의 경로 판단 |
| ui-state | `app/src/restore/uiState.ts` `parseGroups`(닫힘 id `ds`·`canvases`만 남김), `app/src/renderer/shellNavigation.ts` `reconcileProjects`(`["ds", "canvases"]` 고정)가 서비스 group id를 받게 |

바뀌지 않는 것: Doan root 탐색(`find.go`), `doan init`, 댓글 파일 위치와 `.gitattributes` 두 줄, app-socket v2, project group, 자동 등록.

## 2. 디렉터리·형식·CLI 규칙

### 2.1 디렉터리

```
.doan/
  config.json                  v1(서비스 없음) 또는 v2
  canvases/ ds/ assets/        공유(서비스에 속하지 않음), 지금 그대로
  services/<id>/canvases/      서비스의 화면·기능 캔버스 (하위 폴더 허용)
  services/<id>/ds/            서비스의 design-system 캔버스
  services/<id>/assets/        서비스의 캔버스 전용 assets
  comments/<canvas id>.jsonl   지금 그대로, 서비스 캔버스 포함
```

- 서비스는 config가 정한다. `.doan/services/` 아래 config에 없는 디렉터리는 서비스가 아니다(나열·서빙 안 함, §2.5 경고). 이렇게 하면 서비스 캔버스가 있는 저장소의 config는 항상 v2이고, 이전 CLI는 서비스 캔버스를 조용히 빠뜨리는 대신 프로젝트 전체를 거절한다(§2.8).
- 서비스 캔버스에서의 상대 링크: `.doan/services/web/canvases/home.html`에서 서비스 assets는 `../assets/logo.svg`(공유 캔버스에서 공유 assets로 가는 링크와 같은 모양), 공유 assets는 `../../../assets/x.svg`, 저장소 파일은 `../../../../packages/ui/tokens.css`. guide에 이 예를 적는다(§5).
- 셋업은 세 폴더를 만든다. 빈 디렉터리는 git이 추적하지 않으므로 clone한 곳에는 없을 수 있고, 그래도 오류가 아니다.

### 2.2 `.doan/config.json` v2

```json
{ "v": 2, "tokenCss": "packages/ui/tokens.css", "serve": [],
  "services": [ { "id": "web", "path": "apps/web", "tokenCss": "apps/web/src/theme.css" },
                { "id": "api-docs", "path": "services/api-docs" } ] }
```

- `id`: `^[a-z0-9]+(-[a-z0-9]+)*$`. 디렉터리 이름이 되므로 캔버스 id와 같은 이유(macOS 대소문자 무시, `../`, 공백; ARCHITECTURE §1 convention 2)로 같은 패턴을 쓴다. 목록에서 유일.
- `path`: 서비스 소스 디렉터리의 저장소 상대 경로. 에이전트가 cwd로 서비스를 정할 때와 후보 목록의 "Added" 판단에 쓴다. 서빙하지 않는다. `tokenCss`·`serve`와 같은 경로 패턴(절대, `..`, 빈 문자열, 모두 `.` 거부). 서로 같거나 한쪽이 다른 쪽 안이면 안 된다.
- `tokenCss`(선택): 서비스 token CSS. 없으면 최상위 `tokenCss`. 규칙은 최상위와 같다(regular file, 저장소 안, on-disk spelling).
- 버전: `services`가 비어 있지 않으면 `v: 2`, 비면 `services` 없이 `v: 1`. 서비스 없는 프로젝트의 파일은 바이트가 그대로다. 이전 CLI의 `repo.ParseConfig`는 `v != 1`을 `unsupported_version`으로 거절한다. v1에 필드만 더하면 `additionalProperties: false` 때문에 `invalid_config`가 되므로 버전을 올린다.
- 정적 schema가 못 잡는 것(id 중복, path 중첩)은 런타임 검사가 `invalid_config`로 거절한다. `path`나 서비스 폴더가 없는 것은 거절하지 않는다.
- 두 branch가 각각 같은 id의 서비스를 더하고 병합하면 id가 겹쳐 프로젝트 전체가 `invalid_config`(Config error)가 된다. 사람이나 에이전트가 config를 고쳐야 하며, 런타임 검사 사례로 고정한다.
- 서비스 폴더의 판단(대소문자): 디스크의 `.doan/services/<이름>`이 config id와 바이트까지 같을 때만 서비스 폴더다. macOS에서 config `web`, 디스크 `Web`이면 `canvasesIn`은 준 문자열로 경로를 만들어 나열하지만 `Scope`는 `Resolve`의 on-disk spelling으로 범위를 만든다(`cli/internal/repo/scope.go`). 그래서 나열되는데 서빙되지 않는다. 이를 막으려고 나열과 scope 모두 이 경우를 "폴더 없음"으로 다루고, `doan check`가 그 디렉터리에 경고한다(POSTMORTEM 2026-10-21).

### 2.3 나열과 `doan ls`

- `repo.Canvases(root)`는 config를 받도록 시그니처가 바뀐다(호출처: `cli/internal/cli/read.go`의 `scanCanvases`, `cli/internal/cli/export.go`). 지금의 두 디렉터리에 더해 config의 서비스마다 `.doan/services/<id>/canvases`와 `.doan/services/<id>/ds`를 같은 `canvasesIn`으로 걷는다. `.doan/services`, `.doan/services/<id>`, 각 하위 디렉터리가 링크면 건너뛴다(지금 `.doan`·기본 디렉터리와 같은 lstat 규칙). 결과는 지금처럼 path byte 순.
- `doan ls` 결과에 `services: [{id, path, tokenCss?}]`(config 순서)를 더한다. 캔버스 행에는 필드를 더하지 않는다. 서비스와 종류는 경로가 정한다(ARCHITECTURE §1 "The directory is the only type marker"와 같은 방식).
- 다른 명령은 나열을 그대로 쓰므로 함께 따라온다: `doan check`의 대상, `doan comments`의 `canvasPath`, `doan export`의 "listed canvas" 검사, `doan open`의 목록 확인.

### 2.4 서빙 범위와 export 경계

- `defaultServeDirs(root)`도 config를 받도록 시그니처가 바뀐다(호출처는 `Scope` 하나). config의 서비스마다 `.doan/services/<id>/{canvases,ds,assets}`를 기본 디렉터리로 더한다. `.doan`, `.doan/services`, `.doan/services/<id>`, 그 디렉터리 자신 중 하나라도 링크면 빼고(POSTMORTEM 2026-10-31), 같은 목록을 `files.go`와 `scope.go`가 함께 쓴다.
- `MetadataPath(p)`는 config를 모르고(`scope.go`) id 모양만 보면 config에 없는 `.doan/services/<x>/canvases`도 `serve`로 서빙된다. 그래서 `MetadataPath(p, serviceIDs)`로 바꿔 config의 id를 받는다. config에 있는 서비스의 `.doan/services/<id>/{canvases,ds,assets}`와 그 아래만 서빙 가능, `.doan/services`와 `.doan/services/<id>` 자체, config에 없는 id, 그 밖의 이름은 metadata로 막는다. 그래서 `serve`에 `.doan/services`나 `.doan/services/<x>`를 적어도 서비스 밖 파일이나 설정되지 않은 서비스 폴더가 나가지 않는다. `doan config --add-serve`의 ".doan metadata 거절" 규칙도 이 함수를 따른다.
- 서비스 `tokenCss`가 regular file이고 저장소 안이면 범위에 더한다.
- export는 지금처럼 `repo.Resolve`와 `repo.Scope`로 경계를 정하므로(ARCHITECTURE §3 'Exported canvas and viewer') 따로 바꾸지 않는다. 출력 파일을 `.doan` 디렉터리 안에 쓰지 못하는 규칙도 그대로다. 테스트로만 고정한다.

### 2.5 `doan check`

- token 파일 예외: 지금 `check.go`는 최상위 `tokenCss` 파일 하나를 `undefined_token`·`hardcoded_color` 둘 다에서 뺀다(`tokenFile`). 이를 경로로 정한다. 최상위 `tokenCss`와 모든 서비스 `tokenCss` 파일은 어느 캔버스가 먼저 닿든 두 검사에서 빠진다. 공유 CSS의 finding은 `cssSeen`으로 한 번만 내므로, 예외를 "닿은 캔버스의 token"으로 정하면 나열 순서가 결과를 바꾼다. 경로로 정하면 순서와 무관하다.
- `hardcoded_color`: 캔버스가 서비스 캔버스이고 그 서비스에 `tokenCss`가 있으면 그 파일을 예외 파일로 쓰고, 없으면 최상위 `tokenCss`. 둘 다 없으면 지금처럼 검사하지 않는다. 같은 CSS 파일을 여러 서비스 캔버스가 닿으면 그 CSS 파일의 finding은 지금처럼 한 번이며, "configured" 판단은 그 파일에 닿은 캔버스 중 token이 설정된 것이 하나라도 있으면 참으로 한다(T2에서 사례로 고정).
- `token_css_not_found`: 서비스 `tokenCss`에도 적용한다. 경로는 `.doan/config.json`, 메시지에 서비스 id.
- 새 경고 `service_not_configured`: `.doan/services/<x>/` 아래 `.html`이 있는데 `<x>`가 config에 없을 때(디스크 이름과 config id가 대소문자만 다른 경우 포함, §2.2), 그 디렉터리에 하나. 에이전트가 config에 없는 서비스 폴더에 쓰고 캔버스가 보이지 않는 상황을 잡는다. 메시지는 "config에 서비스를 더하려면 사람에게 묻거나 Project Settings를 쓰라"는 안내이며, 폴더를 지우라고 하지 않는다.
- `no_canvases`, `css_not_served`, `path_outside_repo`, `undefined_token`: 규칙은 그대로이고 나열·scope가 넓어진 결과를 쓴다.

### 2.6 댓글

- `.doan/comments/<canvas id>.jsonl` 그대로다. 캔버스 id가 저장소 전체에서 유일하므로(`duplicate_canvas_id`) 서비스 캔버스도 같은 디렉터리에 둔다. `.gitattributes`의 `.doan/comments/*.jsonl merge=union`도 그대로라 기존 저장소에 새 줄이 필요 없다.
- `repo.OrphanFiles`와 `ls` `orphans`는 서비스 캔버스까지 포함한 나열로 판단한다. 이전 CLI는 v2를 거절하므로 서비스 캔버스의 댓글을 고아로 잘못 보고하지 않는다(§2.8).
- Move to Trash가 댓글 파일을 함께 옮기는 조건(PRODUCT §5 item 1)은 그대로다.

### 2.7 work·open·링크 경로

- 지금 `workCanvasPath`(`cli/internal/cli/work_rules.go`, `open_rules.go`가 씀), `runtime.ts`의 `start` 검사, `deepLinks.ts`의 `canvas` 검사, app-socket v3·v4 `path` pattern이 `^\.doan/(canvases|ds)/[^/]+\.html$`만 받는다. 서비스 캔버스와 하위 폴더 캔버스는 모두 거절된다.
- 네 곳을 한 규칙으로 바꾼다: `.doan/canvases/`·`.doan/ds/`·`.doan/services/<id>/canvases/`·`.doan/services/<id>/ds/` 아래(`<id>`는 id 패턴), 하위 폴더 허용, 어느 조각도 비거나 `.`으로 시작하지 않음, `.html`(대소문자 무시는 나열 규칙과 같게). 이 규칙은 경로 모양만 본다. 서비스가 config에 있는지는 뒤따르는 나열 확인이 본다. `work start`는 나열을 확인하지 않으므로(ARCHITECTURE §4 "a path not yet listed waits in the set") config에 없는 서비스 경로도 받지만 화면에는 보이지 않는다. `open`과 링크는 main의 목록 확인이 거절한다.
- 공유 `.doan/canvases/`·`.doan/ds/`의 하위 폴더 캔버스도 받는다(결정 16).
- `v`는 그대로 두고 pattern만 넓힌다(결정 14). fixture: `schema/fixtures/app-socket-v3`·`app-socket-v4`·`open-link/cases.json`에 서비스·하위 폴더 허용 사례와 `..`·숨은 조각·잘못된 id 거절 사례.
- 링크 보안 경계(ARCHITECTURE §7 'Deep links')는 그대로다.

### 2.8 이전 CLI·앱의 동작

- 이전 CLI(서비스를 모름)는 v2 config가 있는 프로젝트에서 저장소 명령마다 `unsupported_version`(exit 2)을 낸다. 그 nextSteps는 지금 문구("Check --repo and .doan/config.json; run `doan init` …", `cli/internal/cli/run.go`)라 오해를 줄 수 있지만 바꿀 수 없다. 이전 `doan init`은 깨진 config를 덮어쓰지 않으므로 v2 config가 지워지지 않는다(ARCHITECTURE §12 init).
- 이전 앱은 그 프로젝트를 Config error 행으로 보이고 Details에 이유를 보인다.
- 같은 기기에서 앱을 이전 버전으로 내리면 그 기기의 대화 기록 전체를 읽지 못한다. 대화 index는 userData마다 하나이고(`app/src/main/conversation/store.ts` `ConversationStore`), `parseIndex`는 항목 하나라도 검사(`validEntries`의 `entries.every`)에 실패하면 index 전체를 `{ok: false, code: "invalid"}`로 돌려준다. 이전 앱의 `validCanvas`는 서비스 캔버스 경로를 모르므로, 서비스 캔버스에 묶인 대화가 하나라도 있으면 다른 프로젝트의 대화까지 모두 읽지 못한다. 앱을 다시 올리면 그대로 돌아온다. 사람이 이 비용을 다시 확인하고 받아들였다(결정 6).
- 새 CLI·앱은 v1 config를 지금처럼 읽고 쓴다. 서비스가 없는 프로젝트는 이전 Doan과 계속 함께 쓸 수 있다.
- 새 CLI가 이전 앱에 서비스 캔버스로 `work start`를 보내면 이전 앱의 schema가 거절하고 `delivered: false`로 끝난다(best effort). `open`은 실패한다. CLI는 앱 번들에 함께 들어 있으므로 보통은 함께 갱신된다.

### 2.9 `doan config`

- `--add-service <id>=<path>`(반복; `<path>`는 있는 디렉터리만 받고 on-disk spelling으로 저장한다. 없거나 디렉터리가 아니면 `usage_error`), `--remove-service <id>`(반복), `--service <id> --token-css <path>` / `--service <id> --clear-token-css`. 결과 `{repo, tokenCss?, serve, services, changed, created}`에 먼저 병합된 `local-doan-files`의 `storage`가 함께 있다(§8.1). `created`는 새로 만든 서비스 폴더.
- 더하기: `.doan/services/<id>/{canvases,ds,assets}`를 먼저 만들고(있으면 그대로, 경로에 링크가 있으면 거절), config를 마지막에 publish한다(POSTMORTEM 2026-10-25 'Init published success…'). 한 호출의 서비스는 모두 되거나 모두 안 된다.
- 빼기: 그 서비스의 `canvases/`나 `ds/` 아래 캔버스가 하나라도 있으면 거절하고 경로 수를 알린다(결정 12). 비어 있으면 config에서만 지운다. 빈 폴더는 남는다.
- 앱의 쓰기는 `doan config`로만 하고 root별로 직렬화한다. 에이전트는 사람이 요청할 때만 바꾼다(PRODUCT §5 item 0).

## 3. CLI: 후보 찾기

### 3.1 명령

`doan detect-services [<folder>] [--json]`(가칭). `<folder>`가 없으면 cwd. Doan root를 찾지 않는다(`--repo` 없음). 결과:

```
{ folder,                  // real 절대 경로 (ls의 root처럼 명시적 예외)
  members: [{ path,        // folder 기준 상대 경로, '/' 구분, on-disk spelling
              id,          // 제안 id (§3.4)
              sources }],  // ["package.json", "pnpm-workspace.yaml", "go.work", "Cargo.toml", "pyproject.toml", "settings.gradle", "pom.xml", "scan"]
  skipped: [{ source, pattern?, reason }],
  truncated }
```

폴더가 없거나 디렉터리가 아니면 `usage_error`. 설정 파일이 없으면 실패가 아니라 대체 검색 결과. 설정 파일 하나가 깨져도 실패하지 않고 `skipped`에 남는다. 메시지에 절대 경로를 넣지 않는다. guide에는 넣지 않는다(`doan help`에 한 줄).

### 3.2 adapter

고른 폴더 바로 아래 파일만 읽는다(1 MiB까지). 지원하는 모양 밖이면 그 파일 전체를 `skipped`(`unsupported`)로 둔다.

| adapter | 읽는 것 | member 조건 |
|---|---|---|
| `package.json` | `workspaces`: 문자열 배열 또는 `{ "packages": [...] }` (npm, yarn, bun). `!`는 제외 | `package.json` 있음 |
| `pnpm-workspace.yaml` | 최상위 `packages:`의 문자열 목록. 블록과 한 줄 흐름, 따옴표·주석. `!`는 제외 | `package.json` 있음 |
| `go.work` | `use ./x`와 `use ( ... )` 블록, `//` 주석 | `go.mod` 있음 |
| `Cargo.toml` | `[workspace]`의 `members`, `exclude` 문자열 배열 | `Cargo.toml` 있음 |
| `pyproject.toml` | `[tool.uv.workspace]`의 `members`, `exclude` | `pyproject.toml` 있음 |
| `settings.gradle`, `settings.gradle.kts` | `include 'a', ':b:c'`, `include("a", "b")`의 문자열 인자. `:`는 `/`로. `projectDir` 재지정·변수·함수 호출은 읽지 않음 | `build.gradle` 또는 `build.gradle.kts` 있음 |
| `pom.xml` | 최상위 `<modules><module>`(Go `encoding/xml`). 한 단계만 | `pom.xml` 있음 |

TOML·YAML은 필요한 모양만 읽는 작은 파서로 한다(새 의존성 없음; `go.mod`에 TOML·YAML 라이브러리가 없다). nx·turbo·lerna는 대부분 패키지 매니저 workspace 위에 있어 따로 읽지 않는다.

### 3.3 펼치기와 대체 검색

- 패턴: 각 조각이 그대로의 이름이거나 `filepath.Match` 패턴. `**`, 절대 경로, `..`, 빈 패턴은 `skipped`. 깊이는 패턴의 조각 수.
- 건너뛰는 이름: `.`로 시작, `node_modules`, `vendor`, `target`, `build`, `dist`, `out`. 링크는 따라가지 않는다.
- 대체 검색: 어느 adapter도 member를 내지 않았을 때만, 깊이 1–3에서 manifest(`package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `build.gradle`, `build.gradle.kts`)가 있는 디렉터리. 출처 `scan`. 찾은 디렉터리 아래로는 내려가지 않는다.
- 거르기: 고른 폴더 자신 제외, 중첩 member 중 안쪽 제외(서비스 path 중첩 금지), 같은 디렉터리는 출처를 합쳐 한 줄, byte 순 200개까지와 `truncated`. 디렉터리 항목 읽기 수에도 상한(값은 T3에서 정하고 테스트로 고정).
- 읽을 수 없는 디렉터리는 "없음"이 아니라 `skipped`의 `unreadable`.

### 3.4 제안 id

디렉터리 이름을 소문자로, `[a-z0-9]` 밖의 문자 줄을 `-` 하나로, 앞뒤 `-` 제거. 비면 `service`. 겹치면 모두 부모 이름을 붙이고(`apps-web`, `services-web`), 그래도 겹치거나 config의 기존 id와 겹치면 `-2`, `-3`.

## 4. app

### 4.1 셋업 패널(첫 실행·Add Projects)

- 조건: 창이 시작한 inspection에서 로컬 폴더(URL로 찾은 기존 폴더 포함)를 inspect한 결과가 "고른 폴더 자신 하나, 셋업 필요"일 때. `list`인 폴더, 하위 저장소가 여럿인 폴더, URL clone은 지금 그대로다. CLI(`doan onboarding project inspect`/`select`)가 이끄는 inspection에는 후보를 찾지 않고 목록도 보이지 않는다. 창에만 목록이 있으면 창과 에이전트가 다른 상태를 보게 되기 때문이다(PRODUCT §5 item 0 "The window and the agent see one state"). 그때 서비스는 Project Settings에서 더한다.
- 사이드바 project menu의 Set Up(`ProjectSetupDialog.tsx`)은 바꾸지 않는다. 서비스는 Project Settings에서 더한다.
- main: `ProjectAdder`가 `doan detect-services <folder> --json`을 돌려 그 inspection(`generation`)에 묶는다. `OnboardingInspection`(app-socket v2)에는 넣지 않고 창 전용 IPC로 읽는다(`inspection_stale` 규칙 포함).
- 화면: 지금 setup 패널에 서비스 목록(체크박스, id, 경로, 출처; 처음 선택 없음; `skipped`·`truncated` 줄)을 더한다. 고른 서비스가 있으면 바뀌는 파일 목록에 `.doan/services/<id>/` 줄을 renderer만 더한다. inspection의 `changes`는 바꾸지 않는다(app-socket v2 `changes`는 enum이다, `schema/app-socket.v2.schema.json`). 모양과 문구는 `/design-draft`가 정한다.
- 후보 찾기 상태: `detect-services`가 도는 동안 Set Up을 막지 않고 목록 자리에 "Looking for services…"를 보인다. 찾기가 실패하거나 시간을 넘기면 이유 한 줄을 보이고 서비스 없이 셋업을 이어 갈 수 있다. 후보가 0개면 목록을 보이지 않는다. 문구는 `/design-draft`에서 다듬는다.
- 키보드: 목록(최대 200줄)은 Tab으로 들어가고 Space로 체크를 바꾼다. 실행 뒤나 실패 뒤 focus는 Retry로 간다.
- 실행: 지금의 `project_select`(initialize) 뒤, 고른 서비스가 있으면 창 전용 IPC `{ inspectionId, ids }`로 main이 `doan config --repo <root> --add-service <id>=<path>...`를 한 번 부른다. id·path는 inspection의 member에서 꺼낸다(ARCHITECTURE §7 'Main boundary').
- 실패: 셋업은 됐고 서비스 쓰기만 실패하면 프로젝트는 등록·셋업된 채 남고 이유와 Retry(서비스 쓰기만)를 보인다. 사람은 Retry 없이 다음으로 넘어갈 수 있고, 화면은 Project Settings에서 서비스를 고칠 수 있다고 알린다. 실행 중에는 select처럼 페이지가 잠긴다.

### 4.2 Project Settings Services 구역

- 건강한 worktree에서 Token CSS, Shared with canvases 다음. 줄마다 id, path, 서비스 token CSS(Change/Clear, 없으면 "Uses project token CSS"와 Choose), Remove.
- "Add from workspace…": main이 worktree root로 `doan detect-services`를 돌려 결과를 page session에 묶어 두고, 같은 목록을 대화상자로 보인다. renderer는 고른 id만 보내고, main은 그 결과의 member에서 id·path를 꺼낸다(ARCHITECTURE §7 'Settings IPC' 'Config bridge'의 one-use choice와 같은 방식). 새 channel은 `senderAllowed.ts` 허용 목록에 더한다. config에 있는 path나 그 안의 member는 "Added"로 비활성.
- 대화상자 상태: 읽는 중, 후보 0개("No services found in this project's workspace settings."), 실패(이유와 Retry). 문구는 `/design-draft`에서 다듬는다.
- config에 있는데 폴더가 없는 서비스(예: clone 직후): Settings 줄은 다른 서비스와 같게 보이고, 사이드바는 빈 서비스 group의 빈 줄 문구를 보인다.
- Remove: 서비스에 캔버스가 있으면 비활성이며 이유(캔버스 수, 옮기거나 지운 뒤 뺄 수 있음)를 보인다. 비어 있으면 확인 뒤 config에서 지운다.
- 저장 표시·오류·잠금·열린 캔버스 다시 읽기는 지금 Project Settings 규칙을 따른다. Add from workspace… 대화상자와 Remove 확인이 열려 있는 동안 페이지가 잠긴다(`projectSettingsRules.ts` `projectSettingsLocked`, ARCHITECTURE §7 'Settings IPC' 'Lock and incoming targets').

### 4.3 사이드바 서비스 group

- `ls` `services`가 비면 지금 두 group 그대로.
- 있으면: config 순서로 서비스마다 group(머리: id), 마지막에 공유 group(이름은 초안에서). group 안에서 design-system 캔버스가 먼저, 화면 캔버스가 뒤, 각각 지금 정렬 규칙. 하위 폴더는 지금처럼 폴더.
- 개수, 빈 줄, 닫힘 기억(group id `service:<id>`, `shared`), 상태 slot, 키보드 이동은 지금 규칙(`sidebarGroups.ts`).
- 닫힘 저장: 지금 `app/src/restore/uiState.ts` `parseGroups`는 `ds`·`canvases`만 남기고(`uiState.test.ts`의 "keeps a sidebar project's closed groups under their fixed ids"가 `ds2` 같은 다른 id를 버리는 것을 고정), `app/src/renderer/shellNavigation.ts` `reconcileProjects`는 `["ds", "canvases"]`를 고정해 쓴다. 이대로면 `service:<id>`·`shared`의 닫힘이 저장 때 사라진다. 두 곳이 `service:<id>`(id 패턴)와 `shared`도 받게 한다. 이 두 파일은 `canvasPath`를 import하지 않아 §4.6의 grep에 잡히지 않았다.
- 닫힘은 project(같은 저장소의 worktree 묶음)마다 기억한다(PRODUCT §5 item 1). worktree마다 서비스가 다르면, 다른 worktree에 없는 `service:<id>`의 닫힘도 그 project에 그대로 남고 그 서비스가 있는 worktree에서만 쓰인다. `reconcileProjects`의 "모든 이전 project가 닫았을 때만 닫힘" 규칙은 서비스 id에도 같다.

### 4.4 그 밖의 화면

- Quick Open(`quickOpen.ts` `listedIn`)은 서비스 캔버스의 위치를 `.doan/services/<id>/canvases/`처럼 지금(`.doan/ds/`, `.doan/canvases/`)과 같은 모양으로 보인다.
- composer 제안(`homeComposer.ts`): 화면 초안은 공유와 서비스의 `canvases/` 전부, `document` 조건의 "`.doan/ds/`가 비어 있음"은 공유와 서비스의 `ds/` 전부가 비어 있음으로 읽는다.
- Overview는 바꾸지 않는다.

### 4.5 watcher

- `watch.ts`의 `watchFolder(root, refresh)`는 config를 모른다. 그래서 config를 넘기지 않고, `.doan/assets`처럼 `.doan/services`를 늘 재귀로 본다(없으면 걸지 않음). 이벤트는 경로 모양으로 나눈다: `<id>/canvases/`·`<id>/ds/` 아래 `.html` 이름은 그 행의 `rev`만, `<id>/assets/` 아래와 그 밖의 이름은 `servedRev`를 올린다(`designChange.ts`의 지금 분류와 같음). config에 없는 서비스 폴더의 이벤트도 같은 분류로 다시 읽기를 부르지만, 목록은 Go가 정하므로 결과가 바뀌지 않는다. `doanDirs`에 `services`를 더해 `.doan` 아래 `services`의 생성·삭제를 다시 읽기(`BOTH`)로 한다.
- `.doan/services`나 서비스 폴더가 링크면 보지 않는다(나열·scope와 같은 정책).
- 서비스가 더해지거나 빠진 뒤의 config 변경은 지금처럼 `.doan` watcher가 다시 읽기를 부른다.

### 4.6 `canvasPath.ts`와 사용처

- `canvasDir(path)`가 `.doan/services/<id>/canvases|ds/`도 `canvases`·`ds` 종류로 돌려주고, 새 `canvasService(path)`가 서비스 id나 null을 돌려준다. `CANVAS_DIRS`에 기대는 코드는 이 함수로 바꾼다. 나열 규칙(`canvasKind`)은 CLI `files.go`와 같게 유지한다.
- 사용처(지금 `canvasPath` import grep): `watch.ts`, `designChange.ts`, `canvasTrash.ts`(Move to Trash 경계), `thumbnails.ts`, `conversation/acp.ts`·`transport.ts`(activity의 `insideDesign`), `conversation/store.ts`(`validCanvas`), `sidebarGroups.ts`, `quickOpen.ts`, `QuickOpenDialog.tsx`, `homeComposer.ts`. 각 사용처의 테스트에 서비스 경로 사례를 더한다. 이 grep 밖에서 group id를 고정한 `uiState.ts`·`shellNavigation.ts`는 §4.3에서 다룬다.
- `canvasPath.ts`는 config를 모른다. 경로 모양만 보고, 그 서비스가 실제로 있는지는 main의 목록(`ls`)이 정한다.

## 5. guide·preset·eval

- guide 'Project files'와 convention 1에 서비스 규칙: "`doan ls` lists `services` when the project has them. Put a service's canvases in `.doan/services/<id>/canvases/`, its design-system canvases in `.doan/services/<id>/ds/` and its canvas-only assets in `.doan/services/<id>/assets/`; work for the whole repository or several services stays in `.doan/canvases/`, `.doan/ds/` and `.doan/assets/`. Never create a service folder that `services` does not list. Take the service from the user's words, then the open canvas's folder, then a working directory inside `services[].path`; ask when it is still unclear. Link the service's `tokenCss`, else the project's." 상대 링크 예(§2.1), `doan config` 서비스 플래그와 "change only when the user asks", `work start`·`open` 줄의 경로 표현, `service_not_configured` 경고 대처.
- 배치 디렉터리를 말하는 preset(`cli/internal/designskill/presets/*.md` 중 `.doan/ds/`·`.doan/canvases/`를 쓰는 19개)에 서비스가 있으면 guide 규칙을 따르라는 한 문장. 어느 파일에 넣을지는 T5에서 grep 결과로 정한다.
- eval 새 scenario: 서비스 둘과 `packages/ui/tokens.css`가 있는 seed. 과제는 한 서비스의 화면 캔버스. 통과: `.doan/services/<id>/canvases/`에 있음, 공유 token CSS를 맞는 상대 경로로 링크, `doan check` 오류 0, config 바꾸지 않음. guide 변경이므로 `/agent-eval`(AGENTS.md 'Workflow').

## 6. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수 | 쪽 | 사례 |
|---|---|---|
| config v1·v2 parse와 런타임 검사 | Go | v1 그대로, v2, 빈 `services`의 v2 거절, id 패턴·중복(두 branch 병합으로 생긴 중복 포함), path 중첩, 서비스 `tokenCss` 패턴, v3 → `unsupported_version` |
| 서비스 디렉터리 목록(`serviceDirs(config)`) | Go | 나열·scope·`MetadataPath`가 함께 쓰는 목록, 서비스 없음 → 지금 세 개, 디스크 이름과 id의 대소문자가 다르면 폴더 없음 |
| `MetadataPath(p, serviceIDs)` | Go | `.doan/services`, `.doan/services/<id>`, `.doan/services/<id>/{canvases,ds,assets}`와 그 아래, config에 없는 id, 다른 이름, 잘못된 id |
| 서비스 쓰기 계획 | Go | v1 → v2, 마지막 서비스 빼면 v1, 캔버스 있는 서비스 빼기 거절, 변화 없으면 그대로, 기존 id·중첩 path 거절, `created` |
| `tokenFor(canvasPath, config)` | Go | 서비스 캔버스와 서비스 token, 없으면 최상위, 공유 캔버스, `ds/`, 비슷한 id(`web` vs `web2`) |
| token 파일 예외(경로로 판단) | Go | 최상위·서비스 token 파일 모두 `undefined_token`·`hardcoded_color`에서 빠짐, 캔버스 나열 순서를 바꿔도 결과 같음 |
| `service_not_configured` 판단 | Go | config에 없는 폴더의 `.html`, 있는 폴더, 빈 폴더, 링크 |
| 캔버스 경로 규칙(§2.7) | Go·TS | 공유·서비스·하위 폴더 허용, 빈 조각·`.` 조각·`..`·잘못된 id·백슬래시·제어 문자 거절. Go `workCanvasPath`, TS `runtime.ts`·`deepLinks.ts`·`canvasPath.ts`가 같은 fixture 통과 |
| adapter 7개 parse | Go | §3.2 모양마다 정상·지원 밖·깨짐, BOM, 주석, 따옴표 |
| `classifyPattern`, `filterMembers`, `proposeIDs` | Go | `**`·절대·`..`·빈 → skipped, `!`/`exclude`, 자기 자신·중첩 안쪽 제외, 출처 합치기, 200개, id 정규화·충돌·기존 id |
| `canvasDir`·`canvasService` | TS | 공유·서비스, `ds`, 비슷한 접두(`.doan/servicesx/`), 잘못된 id, 서비스 폴더 자체 |
| `sidebarGroups` 확장 | TS | 서비스 없음 → 지금 그대로, config 순서 + 공유, ds 먼저, 닫힘 기억 id, 빈 서비스 group |
| `parseGroups`(`uiState.ts`)·`reconcileProjects`(`shellNavigation.ts`) | TS | `service:<id>`·`shared` 닫힘이 저장·다시 읽기 뒤 남음, 잘못된 id 버림, 서비스가 다른 worktree를 묶은 project |
| watcher 분류 | TS | 경로 모양으로: 서비스 캔버스 → 행 `rev`, 서비스 assets → `servedRev`, `services` 생성·삭제 → 다시 읽기, 링크, config 없이 동작 |
| 서비스 목록 행·Remove 규칙 | TS | 처음 선택 없음, "Added", 고른 수와 바뀌는 파일, 캔버스 있는 서비스 Remove 비활성 |

## 7. 형식 변경

- `schema/config.v2.schema.json`을 새로 두고 v1은 그대로. Go(`cli/internal/formats/validate.go`)와 TS(`app/src/formats/validate.ts`)가 같은 파일을 읽고, `schema/fixtures/config/{valid,invalid}`에 v2 사례를 더한다.
- 지금 `schema/fixtures/config/invalid/unknown-version.json`은 `{"v": 2}`이고 `cli/internal/repo/config_test.go`가 이 파일에 `unsupported_version`을 기대한다. `TestParseConfigBoundaries`의 `{"v":2,"x":1}`도 같다. v2를 받으면 둘 다 `invalid_config`가 되므로, 이 fixture와 경계 사례를 v3으로 바꾼다.
- app-socket v3·v4 `path` pattern을 넓히고(§2.7) fixture를 더한다. `v`는 그대로.
- `ls`·`config`·`detect-services` 결과 모양은 Go deep-compare와 TS reader 테스트로 고정하고 ARCHITECTURE §12에 적는다(envelope `result`는 schema가 정하지 않음).
- app-socket v2, `runtime.json`, comment event, `sessions.v1`(캔버스 path에 디렉터리 제한 없음)은 그대로다.

## 8. Conventions·결정 영향

- **ARCHITECTURE §1 'Project directory'·convention 1·7**: 서비스 폴더와 그 상대 링크 규칙. "The directory is the only type marker"는 그대로이고 서비스도 경로로 정해지되, 서비스가 있는지는 config가 정한다. `doan check`에 `service_not_configured` 경고가 더해지고 `hardcoded_color`·`token_css_not_found`의 대상이 넓어진다.
- **서빙 범위(ARCHITECTURE §3)**: 기본 디렉터리가 config의 서비스만큼 늘어난다. 설정과 댓글은 여전히 서빙하지 않고, 서비스 `path`도 서빙하지 않는다. export 경계는 같은 scope다.
- **PRODUCT §3 Out of scope 2(캔버스 형식 강제 안 함)**: 서비스 폴더는 놓는 위치이고, 서비스가 없으면 아무 규칙도 없다.
- **git 명령 없음(Out of scope 6)**, **셋업은 사람이 고를 때만**, **앱은 캔버스 내용을 쓰지 않음(Out of scope 7)**: 지킨다. 앱은 `doan config`로 config와 빈 폴더만 만든다.
- **"Discovery stays in Go only"(ARCHITECTURE §13)**: 후보 찾기와 서비스 디렉터리 목록은 Go가 낸다. TS의 `canvasPath.ts`는 경로 모양만 본다.
- **이전 Doan과의 호환**: §2.8. 서비스를 더한 저장소는 이전 Doan에서 열리지 않고, 같은 기기에서 앱을 내리면 대화 기록 전체를 읽지 못한다(결정 6).

## 8.1 다른 feature와의 순서

사람이 정했다: `local-doan-files`와 `canvas-handoff`가 먼저 병합하고, 이 feature는 그 뒤에 병합한 모양에 맞춘다. `/tdd`는 두 feature가 main에 병합된 뒤 시작하고, 시작할 때 병합된 모양을 다시 읽어 이 문서의 해당 절을 고친다.

- **`local-doan-files`**: 같은 셋업 패널(`Onboarding.tsx`)과 Project Settings 구역(`ProjectSettingsPage.tsx`, `projectSettingsRules.ts`)을 고치고, `doan config` 결과에 `storage`를 더한다(`docs/features/local-doan-files/design.md` §1·§2.3). 이 feature는 `config` 결과에서 `services`를 `storage` 옆에 두고(§2.9), 셋업 패널의 모드 선택과 서비스 목록, Project Settings의 모드 구역과 Services 구역을 함께 배치한다.
- **`canvas-handoff`**: `doan handoff`가 `workTarget`을 지나고, 새 app-socket v5의 `path` pattern은 `^\.doan/canvases/[^/]+\.html$`이다(`docs/features/canvas-handoff/design.md` §3). 이 feature는 v3·v4와 함께 v5 `path` pattern과 `schema/fixtures/app-socket-v5/`도 공유·서비스 `canvases/`와 그 하위 폴더까지 넓힌다(§2.7, 결정 14·16). v5가 `.doan/ds/`를 받지 않는 것은 그 feature의 결정이므로 서비스 `ds/`도 받지 않는다.

## 9. PoC 의존

- 없음.
- 확인할 가정: 셋업이 만든 빈 서비스 폴더가 clone 뒤 없어도 나열·scope·watcher·사이드바가 문제없다. T3·T6 테스트에 "config에 서비스가 있고 폴더가 없음" 사례를 넣는다.

## 10. POSTMORTEM에서 가져온 함정

- **2026-10-31 — A linked default directory served its unconfigured target**: "default directories are served only when neither `.doan` nor the directory itself is a symlink … When adding a default directory, add it to the lstat-checked lists in both `files.go` and `scope.go`." → 서비스 기본 디렉터리를 두 파일이 같은 목록(`serviceDirs`)으로 쓰고, 링크된 `.doan/services`·서비스 폴더·하위 디렉터리마다 `scope`와 `canvases`를 함께 단언하는 테스트를 둔다.
- **2026-10-28 재발(위 2026-10-21 항목) — linked `.doan/` ancestor**: "Checking only `canvases/` with lstat let discovery traverse a linked `.doan/` into another directory." → `.doan/services`와 `.doan/services/<id>`도 조상으로 lstat한다. watcher도 같다.
- **2026-10-22 — Guessing the repo root in TS after a failed CLI run re-created a discovery rule differently**: "ask it again in a narrower form … instead of inferring in TS." → 서비스가 있는지, 어떤 캔버스가 나열되는지는 Go가 정하고, `canvasPath.ts`는 경로 모양만 본다.
- **2026-10-25 — An unreadable add pick was offered for set-up as a folder without repos**: 읽지 못한 디렉터리는 `unreadable`이며 "후보 없음"이 아니다. 권한 거부 사례를 테스트에 넣는다.
- **2026-10-21 — Filesystem APIs did not match "missing" and "same file" as the product means them**: on-disk spelling, ENOTDIR·NUL·링크 루프. → member `path`, 서비스 `path`·`tokenCss`는 on-disk spelling으로 저장한다.
- **2026-10-25 — Init published success before merge setup could fail**: 폴더 먼저, config 마지막 publish.
- **2026-10-22 — A served directory wiped and rebuilt silently stopped live reload**, **2026-10-22 — Filtering root `fs.watch` events by known names loses the root's own deletion on macOS**: 서비스 assets 디렉터리가 지워졌다 다시 생기는 경우와 `.doan/services` 자체의 삭제를 watcher 테스트에 넣는다.
- **2026-11-03 — Locate on the Project Settings page closed the page …**: 서비스 쓰기 뒤 folder 목록과 `servedRev` 변경이 main에서 나가는지 main 테스트로 고정한다.
- **2026-10-25 — A static draft's overflow match hid an unusable checklist**: 200줄 목록의 스크롤 끝 Set Up과 실행 중 focus를 `/runtime-test`에서 본다.

## 11. BACKLOG 후보 (BACKLOG.md는 고치지 않음)

- 모델 기반 후보 정리: 연결된 에이전트에게 읽기 전용으로 후보를 보여 서비스와 라이브러리를 나누게 하는 것. Doan이 에이전트를 먼저 깨우는 일이 되므로 PRODUCT §3 Out of scope 4와의 관계를 먼저 정해야 한다.
- Gradle `projectDir` 재지정, Maven 하위 pom, `**` 패턴.
- 공유 캔버스를 서비스로 옮기면서 상대 링크를 고치는 도구.
- 서비스별 composer 제안, Home·Overview에서 서비스 고르기.

## 12. 참고한 디자인 preset

`doan design-skill --json`(설치된 CLI 0.1.0)으로 목록을 보고 `shape`와 `harden`만 읽었다. 반영: §4의 상태(후보 없음, skipped, 잘림, 서비스 쓰기 실패와 Retry, "Added", Remove 비활성 이유, 폴더 없는 서비스)와 많은 줄 처리.

## 결정 (사람)

spec '이미 정한 것' 1–3에 이어, 아래 4–16도 사람이 정했다. 각 항목의 이유는 그 결정을 고를 때 쓴 것이다.

4. **서비스 id (사람)**: member 디렉터리 이름을 id 패턴으로 바꾼 값을 쓰고, 겹치면 부모 이름을 붙인다(§3.4). 만든 뒤에는 바꾸지 않는다. 이유: 목록 화면에 입력칸과 검증 오류가 늘지 않고, 대부분의 workspace에서 디렉터리 이름이 이미 서비스 이름이다. 고르지 않은 안: 줄마다 사람이 id를 고치는 것.
5. **서비스는 config가 정한다 (사람)**: config v2의 `services`가 서비스 목록이다. 목록에 없는 `.doan/services/<x>/`는 나열·서빙하지 않고 `doan check`가 `service_not_configured`로 경고한다(§2.1·§2.5). 이유: 디렉터리만으로 정하면 이전 CLI가 서비스 캔버스를 조용히 빠뜨리고 그 댓글을 고아로 보고하지만, config v2는 이전 CLI가 프로젝트 전체를 `unsupported_version`으로 거절하게 해 드러난다. 서비스별 token CSS와 cwd 판단에도 config가 필요하다. 고르지 않은 안: `.doan/services/` 아래 디렉터리가 곧 서비스이고 config는 v1.
6. **이전 Doan과의 호환 (사람)**: 서비스가 있는 저장소는 이전 Doan에서 Config error로 열리지 않는 것을 받아들인다. 같은 기기에서 앱을 이전 버전으로 내리면, 서비스 캔버스에 묶인 대화가 하나라도 있는 동안 그 기기의 대화 기록 전체(다른 프로젝트 포함)를 앱을 다시 올릴 때까지 읽지 못한다. 사람이 이 사실을 다시 확인하고 받아들였다. 서비스가 없는 프로젝트는 이전 Doan과 그대로 함께 쓴다(§2.8). 이유: 서비스 먼저 배치에서 이전 CLI는 서비스 캔버스를 어차피 나열하지 못하고, 일부만 보이는 것보다 거절이 안전하다. 고르지 않은 안: config v1을 유지하고 별도 파일을 두어 이전 Doan이 공유 캔버스만이라도 읽게 하는 것.
7. **서비스별 token CSS (사람)**: 프로젝트 token CSS가 기본이고, 서비스마다 선택적으로 따로 정한다(Project Settings, §2.2·§4.2). 이유: 공유 token(결정 1의 목적)과 서비스 고유 theme가 둘 다 흔하고, 셋업 화면에 picker를 늘리지 않는다. 고르지 않은 안: 프로젝트 token CSS 하나만, 셋업 때 서비스마다 고르기.
8. **제안하는 곳 (사람)**: 셋업되지 않은 폴더의 첫 실행·Add Projects 셋업 패널과, 셋업된 프로젝트의 Project Settings Services 구역(§4.1·§4.2). 이유: 이미 Doan을 쓰는 모노레포와 clone 흐름에는 Project Settings가 유일한 길이고, 서비스 token CSS와 빼기도 둘 곳이 필요하다. 고르지 않은 안: 셋업 패널만.
9. **사이드바 묶음 (사람)**: 서비스마다 group 하나와 공유 group 하나를 두고, group 안에서 design system을 먼저 보인다. 서비스가 없으면 지금 그대로다(§4.3). 이유: 서비스별로 한곳에 모이고, 하위 group을 두는 안보다 한 단계 얕아 220px 사이드바에서 들여쓰기가 덜 깊다. 행 아이콘이 이미 design system과 화면을 구분한다. 고르지 않은 안: 서비스 group 안에 Design system·Canvases 하위 group.
10. **adapter와 대체 검색의 한계 (사람)**: 일곱 adapter를 §3.2의 모양만 읽고, 어느 adapter도 member를 내지 않을 때만 깊이 3까지 대체 검색한다. `**`는 펼치지 않는다(§3.2·§3.3). 이유: workspace 설정이 저장소의 선언이므로 우선하고, 대체 검색을 늘 섞으면 `examples/`·`tools/`의 manifest가 후보를 늘린다. 고르지 않은 안: 대체 검색을 늘 합치기, Gradle 빼기.
11. **후보 자격과 처음 선택 (사람)**: member 전부(라이브러리 포함)를 보이고 처음 선택은 없다. 이미 서비스인 path와 그 안의 member는 "Added"로 비활성이다(§4.1·§4.2). 이유: 결정 2·3대로 사람이 고르고, 라이브러리가 많은 저장소에서 전부 체크는 빼는 일이 더 많다. 고르지 않은 안: 전부 처음에 체크.
12. **서비스 빼기 (사람)**: 서비스의 `canvases/`·`ds/`에 캔버스가 있으면 빼기를 거절하고 이유를 보인다. 비어 있으면 확인 뒤 config에서만 지운다(§2.9·§4.2). 이유: config가 서비스를 정하므로(결정 5) 폴더를 남긴 채 빼면 캔버스가 조용히 사라지고, 폴더를 휴지통으로 옮기면 Move to Trash 말고 앱이 파일을 옮기는 새 예외가 생긴다. 고르지 않은 안: config에서만 지우고 폴더를 남김, 서비스 폴더를 휴지통으로 옮김.
13. **에이전트가 서비스를 정하는 방법 (사람)**: guide 규칙으로 정한다. 사람의 말 → 열린 캔버스의 폴더 → cwd가 `services[].path` 안 → 그래도 모르면 묻는다. `ls`는 목록만 준다(§5). 이유: 앱 대화의 cwd는 저장소 최상위라 cwd 판단이 드물고, 필드는 eval에서 필요가 보이면 더한다. 고르지 않은 안: `doan ls`가 cwd가 속한 서비스를 따로 돌려줌.
14. **work·open·링크 경로 (사람)**: app-socket v3·v4 `path` pattern을 버전 그대로 넓힌다(§2.7). 새 CLI가 이전 앱에 서비스 캔버스로 `open`을 보내면 실패한다. 이유: 넓히기만 하므로 이전 CLI의 요청은 모두 그대로 맞고, CLI는 앱 번들에 함께 들어 있어 보통 함께 갱신된다. 버전을 올리면 dispatch와 fixture 디렉터리가 두 벌이 된다. 고르지 않은 안: 새 버전(v5·v6).
15. **기존 `.doan/` 하나짜리 프로젝트의 이전 (사람)**: 아무것도 저절로 옮기지 않는다. 서비스가 없으면 v1과 지금 사이드바 그대로이고, 서비스를 더해도 기존 캔버스는 공유 group에 남는다. 옮기는 것은 사람이나 에이전트의 파일 작업이다. 이유: 공유 캔버스와 서비스 캔버스는 깊이가 두 단계 달라서, 옮기면 캔버스 안의 상대 링크를 고쳐야 한다. 앱은 캔버스 내용을 쓰지 않는다(PRODUCT §3 Out of scope 7). 고르지 않은 안: 서비스를 더할 때 앱이 기존 캔버스를 옮김.
16. **공유 폴더의 하위 폴더 캔버스 (사람)**: `doan work start`·`doan open`·`doan://` 링크는 공유 `.doan/canvases/`·`.doan/ds/`의 하위 폴더 캔버스도 받는다(spec 완료 조건 9, §2.7). 이유: `ls`(`files.go` `canvasesIn`의 재귀)와 Move to Trash(PRODUCT §5 item 1 "subdirectories included")가 이미 하위 폴더를 다루므로, 서비스와 공유에 한 규칙을 쓰는 편이 단순하다. 고르지 않은 안: 서비스 폴더만 하위 폴더를 받음.
