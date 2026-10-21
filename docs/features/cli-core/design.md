# cli-core — design

## 영향 받는 구성 요소

- CLI(Go): 실행 파일 `doan`과 명령 여섯 개. 이 피처의 본체다.
- 형식: 스키마 변경 없음. 기존 `config.v1`·`comment-event.v1`·`cli-envelope.v1`과 `formats.FoldText`를 그대로 쓴다(아래 '형식 변경').
- 앱(TS): 변경 없음.
- `doan mcp`: 이 피처가 만든 명령 본체(`cli/internal/cli`의 명령 함수)를 3번 `mcp`가 감싼다. 그래서 명령 본체는 `io.Writer`·`os.Exit`에 직접 닿지 않고 `(result, error)`를 돌려준다.
- 스킬: `doan skill`이 출력하는 본문(영문, 바이너리에 내장).

## 코드 배치

```
cli/cmd/doan/main.go          os.Args·stdin·stdout·종료 코드만 연결 (얇게)
cli/internal/cli/             명령 디스패치, 플래그 파싱, 봉투, 사람용 출력, 명령 본체
cli/internal/repo/            리포 찾기, config 읽기, 리포 안 경로 해석
cli/internal/canvas/          HTML 한 장 → Canvas 모델 (순수)
cli/internal/check/           Canvas들 + 토큰 정의 → findings (순수)
cli/internal/comments/        코멘트 파일 목록·읽기, resolve 이벤트 만들기(순수)와 붙이기(I/O)
cli/internal/formats/         (기존) 스키마 검증·접기
```

- 의존성 추가: `golang.org/x/net/html` 하나(HTML 파싱). 플래그 파싱은 표준 `flag`를 쓰되, 표준 `flag`는 첫 비플래그 인자에서 멈추므로(`doan comment resolve cmt_x --json`에서 `--json`을 놓친다) 인자를 플래그와 위치 인자로 먼저 나누는 작은 함수를 둔다. 이 함수는 순수 함수이고 테스트 대상이다.
- 버전: `-ldflags "-X .../cli.Version=..."`로 넣고 기본값은 `dev`. 빌드·배포 설정은 8번.

## 공통 규칙

### 리포 찾기 (`repo.Find`)

- `--repo <경로>`가 있으면 그 디렉터리만 본다(위로 올라가지 않는다).
- 없으면 현재 디렉터리부터 파일시스템 루트까지 올라가며 `.doan/config.json`이 있는 첫 디렉터리를 리포 루트로 삼는다. `.git` 위치는 보지 않는다(git 연산 없음, PRODUCT §3 Out of scope 6).
- config 판정 순서(ARCHITECTURE §12 코드와 맞춘다):
  1. 파일이 없다 → `repo_not_found`
  2. JSON 파싱 실패 또는 객체 아님 → `invalid_config`
  3. `v`가 숫자인데 1이 아니다 → `unsupported_version` (접기의 `unknown_version`과 같은 순서: 스키마보다 먼저)
  4. `config.v1` 스키마 위반 → `invalid_config`

### 리포 안 경로 해석 (`repo.Resolve`)

config의 `tokenCss`·`serve`, 프레임의 `data-doan-implements`, 캔버스의 로컬 `<link>`·`@import`는 모두 이 함수를 거친다.

- 입력은 리포 루트와 리포 상대(또는 캔버스 상대) 경로. `filepath.Clean` 후 `filepath.EvalSymlinks`로 실제 경로를 구하고, 그 결과가 리포 루트(이것도 `EvalSymlinks`한 값) 밖이면 "리포 밖"으로 판정한다.
- 판정 결과는 셋: 리포 안에 있음 / 없음 / 리포 밖. 호출한 쪽이 이를 에러 코드나 finding으로 바꾼다.
- 이유: 스키마는 `..`와 절대 경로만 막는다. 심링크로 리포 밖을 가리키는 경우는 런타임에서만 잡힌다(ARCHITECTURE §3 `.doan/config.json` v1: "Normalization and symlink checks are runtime work").

### 출력

- `--json`: stdout에 봉투 한 줄. 성공 `{v: 1, ok: true, result}`, 실패 `{v: 1, ok: false, error: {code, message, nextSteps}}`. stderr에는 아무것도 쓰지 않는다.
- `--json` 없음: stdout에 사람이 읽는 텍스트, 실패는 stderr에 `error: <message>`와 `nextSteps` 줄들. 텍스트 모양은 테스트로 고정하지 않는다(에이전트는 `--json`을 쓴다).
- 결과의 선택 키는 생략하고 `null`을 쓰지 않는다. 빈 목록은 `[]`(ARCHITECTURE §2 '접기' 출력 규칙과 같다).

### 에러 코드 추가

ARCHITECTURE §12는 `error.code`를 패턴으로만 정하므로 `v`를 올리지 않고 추가한다.

| 코드 | 종료 | 언제 | `nextSteps` 예 |
|---|---|---|---|
| `comment_not_found` | 2 | resolve 대상 id가 어느 코멘트 파일에도 없거나 삭제됨 | "Run `doan comments --all --json` to list comment ids" |
| `canvas_not_found` | 2 | `--canvas <id>`에 맞는 캔버스도 코멘트 파일도 없음 | "Run `doan ls --json`" |

이미 설정된 리포에 `init`을 실행하는 것은 에러가 아니다(아래 `doan init`).

## 명령

### `doan init [--token-css <path>]`

- 대상: `--repo`가 있으면 그 디렉터리, 없으면 현재 디렉터리. 리포 찾기를 하지 않는다(만드는 명령이므로).
- `.doan/config.json`이 이미 있으면 아무것도 쓰지 않고 `{initialized: false, repo}`로 성공한다. config가 망가져 있어도 덮어쓰지 않는다(사람이 고칠 일이다). PRODUCT §5 온보딩 3단계 "이미 설정된 리포는 건너뛴다"와 같다.
- 없으면 차례로:
  1. `--token-css`를 받는다. 없고 stdin이 터미널이며 `--json`이 아니면 한 번 묻는다(빈 입력 = 없음). 그 외에는 `tokenCss`를 생략한다. 값은 `config.v1` 스키마 규칙과 `repo.Resolve`로 검사해 파일이 리포 안에 있어야 한다. 아니면 `usage_error`로 아무것도 쓰지 않고 실패한다.
  2. `design/` 디렉터리를 만든다(있으면 그대로).
  3. `.doan/config.json`을 `{v: 1, tokenCss?}`로 쓴다. `serve`는 쓰지 않는다(기본 `[]`).
  4. `.gitattributes`에 `.doan/comments/*.jsonl merge=union` 줄이 정확히 같은 줄로 없으면 끝에 붙인다. 파일이 개행 없이 끝나면 개행을 먼저 넣는다.
- 결과: `{initialized: true, repo, created: [경로...]}`. `created`는 실제로 새로 만들거나 바꾼 리포 상대 경로.
- 스킬 설치는 하지 않는다(Q3 → 8번 `onboard-dist`).

### `doan ls`

- 캔버스 찾기(`repo.Canvases`): `design/` 아래를 재귀로 돌며 확장자가 `.html`인 일반 파일. 이름이 `.`으로 시작하는 디렉터리·파일은 건너뛴다. 심링크는 따라가지 않는다. 경로 순으로 정렬.
- 결과: `{canvases: [{path, id?, title?, width?, frames: [{id, title?, implements?}], comments: {open, resolved}}]}`
  - `path`는 리포 상대, `/` 구분자.
  - `id`·`width`가 없거나 규칙에 어긋나면 생략한다. 이유는 `doan check`가 알려 준다.
  - `title`은 `<title>` 텍스트. 앞뒤 공백 처리는 아래 'Canvas 모델'의 규칙을 따른다.
  - `comments`는 그 캔버스 id의 코멘트 파일을 접은 결과의 개수. 파일이 없으면 `{open: 0, resolved: 0}`.

### `doan comments [--canvas <id>] [--all]`

- 대상 파일: `.doan/comments/*.jsonl`(하위 디렉터리 없음). 파일 이름에서 `.jsonl`을 뗀 것이 캔버스 id다.
- 각 파일을 `formats.FoldText`로 접는다.
- 결과: `{comments: [...], warnings: [...]}`
  - 코멘트: 접기 결과 필드 전부 + `canvas`(id) + `canvasPath?`(그 id의 캔버스가 있을 때) + `outdated`(캔버스가 있고 현재 파일 바이트의 `sha256:`가 `canvasHash`와 다를 때 `true`, 캔버스가 없으면 생략).
  - 기본은 `status: open`만. `--all`이면 전부.
  - 정렬: `canvas` → 접기 결과 순서(`createdAt` → `comment`).
  - 경고: 접기 경고 + `file`(리포 상대 경로). 정렬: `file` → 접기 경고 순서.
- `--canvas <id>`가 캔버스에도 코멘트 파일에도 없으면 `canvas_not_found`.

### `doan comment resolve <cmt_id>... --agent <name>`

- `--agent`(Q2): `^[a-z0-9-]+$`(스키마의 에이전트 `name` 패턴). 없거나 패턴에 어긋나면 `usage_error`.
- 순서:
  1. 모든 코멘트 파일을 접어 `comment id → (파일, 상태)` 표를 만든다.
  2. 인자의 id가 하나라도 표에 없으면(삭제된 코멘트 포함) `comment_not_found`로 아무것도 쓰지 않는다. 메시지에 없는 id를 모두 적는다.
  3. open인 것만 resolve 이벤트를 만든다. 이미 resolved인 것은 건너뛴다(접기 규칙에서도 반복 resolve는 조용한 no-op이다).
  4. 파일마다 이벤트들을 한 번의 쓰기로 붙인다.
- 이벤트(`comments.NewResolve`, 순수): `{v: 1, id: "evt_"+UUIDv4, at, type: "resolve", comment, by: {kind: "agent", name}}`. 시계·난수는 인자로 받는다(테스트에서 고정).
- `at` 규칙(ARCHITECTURE §2 'Writing'): `max(지금, 파일의 최대 at + 1ms)`. 파일의 최대 `at`은 `ParseLines`가 받아들인 이벤트에서 구한다. 같은 파일에 여러 개를 붙이면 앞 이벤트의 `at + 1ms`가 다음의 하한이다. `at` 형식은 UTC 밀리초 고정 패턴이다.
- 붙이기(I/O): `O_APPEND`로 열고 한 번의 `Write`. 파일이 비어 있지 않고 개행으로 끝나지 않으면 개행을 먼저 붙인다(안 그러면 앞 줄과 합쳐져 두 이벤트가 다 `invalid_event`가 된다). 앱이 같은 파일에 동시에 쓰는 경우는 로컬 파일시스템의 작은 `O_APPEND` 쓰기가 줄 단위로 섞이지 않는다는 가정에 기댄다. 잠금은 두지 않는다.
- 쓰기 전에 만든 이벤트를 `ValidateCommentEvent`로 검증한다(실패하면 `internal_error`).
- 결과: `{resolved: [cmt_id...], alreadyResolved: [cmt_id...]}`.
- 여러 id를 받지만 `--all` 같은 일괄 옵션은 두지 않는다(에이전트 규칙 E: 적용한 것만 resolve, 일괄 금지).

### `doan check`

- 인자 없음. 리포 전체를 본다(캔버스 id 중복처럼 리포 단위 규칙이 있다).
- 결과: `{findings: [...], summary: {errors, warnings}}`. finding: `{severity: "error"|"warning", code, message, path?, canvas?, frame?, element?, token?, url?, target?}`. 정렬: `path` → `severity`(error 먼저) → `code` → 나머지 키.
- error가 하나라도 있으면 exit 4(`ok: true`). 아니면 exit 0.

### `doan skill`

- 바이너리에 내장한 영문 본문(`cli/internal/cli/skill.md`, `go:embed`)을 그대로 출력하고, 마지막 줄 `[doan:skill] end of guide v<Version>`을 붙인다.
- `--json`: `{version, body}`. `body`는 끝 표시 줄을 포함한 전체 텍스트.
- 본문 범위(Q3): 캔버스 규약 10개와 에이전트 규칙 A–H(ARCHITECTURE §1), 이 피처의 명령 사용법. 8번이 다듬는다.

## Canvas 모델 (`canvas.Parse(path, bytes) → Canvas`, 순수 — `/tdd` 대상)

`golang.org/x/net/html`로 파싱한다(브라우저와 같은 HTML5 파싱 규칙).

| 필드 | 출처 | 규칙 |
|---|---|---|
| `ID` | `<head>` 안 첫 `<meta name="doan:canvas">`의 `content` | 값을 그대로 쓴다(공백 제거 없음). 패턴 검사는 check가 한다(Q1). 두 개 이상이면 `Dup` 표시 |
| `Width` | `<meta name="doan:width">`의 `content` | `^[1-9][0-9]*$`일 때만 정수. 아니면 `WidthRaw`만 남긴다. 두 개 이상이면 `Dup` 표시 |
| `Title` | `<title>` 텍스트 | 앞뒤의 SP·HT·LF·CR·FF만 벗긴다(HTML의 ASCII whitespace). 다른 유니코드 공백은 그대로 |
| `Frames` | `data-doan-frame` 속성을 가진 요소, 문서 순서 | `{ID, Title?(data-doan-title), Implements?(data-doan-implements)}` |
| `DoanIDs` | `data-doan-id` 값, 문서 순서 | 중복 판정용 |
| `VarRefs` | `<style>` 텍스트와 `style` 속성 안 `var(--이름` | 이름 목록 |
| `VarDefs` | `<style>`·`style` 속성 안 `--이름:` 선언 | 이름 집합 |
| `Colors` | `<style>`·`style` 속성의 선언 값 안 hex·`rgb(`·`rgba(` | 선택자(`#id`)는 제외하기 위해 선언 값(`:` 뒤 `;`·`}` 전)만 본다 |
| `LocalCSS` | `<link rel="stylesheet" href>`와 `<style>` 안 `@import`의 상대 경로 | 셸이 읽어 `VarDefs`·`Colors`를 더한다 |
| `ExternalURLs` | `script[src]`·`link[href]`·`img[src]`·`iframe[src]`·`source[src]`와 CSS `url(...)`·`@import` 중 `http:`·`https:`·`//`로 시작하는 것 | 캔버스마다 중복 제거 |

- 속성 값은 HTML 파서가 돌려준 그대로 쓰고 따로 공백을 자르지 않는다. POSTMORTEM 2026-10-21("TS and Go comment folding diverged…"): 언어 기본 trim은 문자 집합이 다르다. 앱(TS)이 4·5번에서 같은 값을 읽게 되면 이 표의 규칙을 그대로 따르고, 그때 공유 픽스처를 둔다. 이 피처에서는 Go만 읽으므로 공유 픽스처를 만들지 않는다.
- CSS는 파서 없이 주석(`/* */`)과 문자열을 건너뛰는 작은 스캐너로 읽는다(`canvas.ScanCSS(text) → {refs, defs, colors, imports, urls}`, 순수). 토큰 CSS 파일과 로컬 CSS 파일도 같은 스캐너를 쓴다.
- 스크립트가 런타임에 만드는 스타일은 보지 않는다(정적 검사).

## 검사 규칙 (`check.Run(input) → []Finding`, 순수 — `/tdd` 대상)

입력: `[]Canvas`(로컬 CSS 스캔 결과를 합친 것), 토큰 CSS 스캔 결과(없으면 nil), 코멘트 파일의 캔버스 id 목록, `exists(path) → 안/없음/밖` 함수.

| 코드 | 수준 | 조건 | 근거 |
|---|---|---|---|
| `missing_canvas_id` | error | `doan:canvas` meta 없음 | 규약 2 |
| `invalid_canvas_id` | error | id가 `^[a-z0-9]+(-[a-z0-9]+)*$`에 어긋남, 또는 meta가 두 개 이상 | 규약 2, Q1 |
| `duplicate_canvas_id` | error | 같은 id의 캔버스가 둘 이상(파일마다 하나씩) | 규약 8 |
| `missing_width` | error | `doan:width` meta 없음 | 규약 3, PRODUCT §7 |
| `invalid_width` | error | 값이 양의 정수가 아님, 또는 meta가 두 개 이상 | 규약 3 |
| `duplicate_frame_id` | error | 한 캔버스 안에서 같은 `data-doan-frame` 값이 둘 이상 | 규약 8 |
| `empty_frame_id` | error | `data-doan-frame=""` | 규약 4 |
| `duplicate_doan_id` | error | 한 캔버스 안에서 같은 `data-doan-id` 값이 둘 이상 | 규약 8 |
| `undefined_token` | error | `var(--x)`의 `--x`가 토큰 CSS·캔버스의 `<style>`·`style` 속성·로컬 CSS 어디에도 선언되지 않음. `var()`에 대체값이 있어도 error | 규약 7, PRODUCT §5 |
| `implements_not_found` | error | `data-doan-implements` 경로가 리포 안에 없음 | 규약 6 |
| `path_outside_repo` | error | `data-doan-implements`·로컬 CSS 경로가 리포 밖을 가리킴 | design '리포 안 경로 해석' |
| `local_css_not_found` | error | 캔버스가 링크한 로컬 CSS가 없음 | 규약 7 |
| `token_css_not_found` | error | config의 `tokenCss` 파일이 없음 | 규약 7 |
| `external_url` | warning | 외부 URL(캔버스마다 URL 하나에 한 건) | 규약 9 |
| `hardcoded_color` | warning | config에 `tokenCss`가 있고, 캔버스나 로컬 CSS(토큰 CSS 파일 자신은 제외)의 선언 값에 hex·`rgb()`·`rgba()`가 있음 | 규약 10 |
| `orphan_comment_file` | warning (Q4) | `.doan/comments/<id>.jsonl`의 id를 가진 캔버스가 없음 | PRODUCT §5 11 |

- 프레임 id와 `data-doan-id`는 서로 다른 이름 공간이다. 둘이 같은 값이어도 중복이 아니다.
- `implements`·로컬 CSS 경로의 기준: `data-doan-implements`는 리포 상대(PRODUCT §4 예시 `app/projects/new/page.tsx`), 로컬 CSS는 캔버스 파일 상대(규약 7).
- 코멘트 파일의 접기 경고는 check에 넣지 않는다. `doan comments`가 `warnings`로 돌려준다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `cli.SplitArgs(args) → (flags, positionals)` — 플래그 위치 무관 파싱
2. `repo.ParseConfig(bytes) → (Config, errorCode)` — 판정 순서 1~4
3. `canvas.ScanCSS(text)` — 주석·문자열 건너뛰기, 선언 값 안 색만
4. `canvas.Parse(path, bytes) → Canvas`
5. `check.Run(input) → []Finding` — 위 표 전부, 정렬 포함
6. `comments.NextAt(lastAt, now) → at` 와 `comments.NewResolve(...)`
7. `cli.Envelope(result | error) → JSON`, 에러 코드 → 종료 코드 표

셸(I/O): `repo.Find`, `repo.Resolve`, 캔버스·코멘트 파일 나열, 붙이기, `init`의 파일 쓰기. 이것들은 임시 디렉터리 통합 테스트로 확인한다.

## 형식 변경

- JSON Schema: 없음. `v`도 그대로다.
- 명령별 `result` 모양은 스키마로 만들지 않는다. 만드는 쪽이 Go 하나뿐이고 읽는 쪽이 에이전트라 두 구현이 어긋날 위험이 없다. 봉투 스키마의 `result`는 이미 `{}`(아무 값)다. 대신 각 명령의 `result` 모양을 승격 때 ARCHITECTURE §12에 적고, Go 통합 테스트가 봉투를 `ValidateEnvelope`로 검증한 뒤 `result`를 기대 JSON과 deep-equal로 비교한다.
- 새 `error.code` 두 개(`comment_not_found`, `canvas_not_found`)는 패턴 안이므로 `v` 변경 없음. ARCHITECTURE §12 표에 추가한다.

## 규약 영향

- ARCHITECTURE §1 규약 2: 캔버스 id의 문자 집합을 정한다(Q1). id가 `.doan/comments/<id>.jsonl` 파일 이름이 되기 때문이다.
- `doan check` 규칙과 수준(위 표)이 처음으로 확정된다. 규약 10개의 "measured mechanically" 범위를 승격 때 ARCHITECTURE §1에 적는다.

## 결정 영향

- git 연산 없음: `init`은 `.gitattributes` 파일 한 줄만 쓴다(ARCHITECTURE §2가 이미 허용). 리포 찾기는 `.git`을 보지 않는다.
- append-only: resolve는 줄을 붙이기만 한다. 기존 줄을 고치거나 지우지 않는다.
- 토큰 처리 없음·네트워크 없음: CLI는 네트워크 요청을 하지 않는다.
- 에이전트는 resolve만: CLI에 생성·수정·삭제·reopen 명령이 없다.
- PRODUCT §5 8 "`doan init` … installs skills"를 바꾼다(Q3). 승격 때 PRODUCT §5와 §7에 적는다.

## 확정된 질문 (2026-10-21 사용자)

- **Q1 캔버스 id 문자 집합**: 소문자 kebab `^[a-z0-9]+(-[a-z0-9]+)*$`. id가 코멘트 파일 이름이 되는데, macOS는 파일 이름의 대소문자를 구분하지 않아 `Foo`와 `foo`가 충돌한다. 이 패턴이면 그런 충돌이 없고 `../`·공백도 경로에 들어가지 않는다. 어기면 `invalid_canvas_id`(error). 프레임 id·`data-doan-id`는 파일 이름이 되지 않으므로 제한하지 않는다(비어 있으면 안 될 뿐).
- **Q2 에이전트 이름**: `--agent <name>` 플래그 필수. 환경 변수나 자동 감지는 두지 않는다. 읽는 곳이 하나뿐이라 추측이 없고, 스킬이 명령 예시에 넣어 준다.
- **Q3 스킬 범위**: 이 피처는 `doan skill` 본문과 끝 표시까지만 만든다. Claude Code·Codex에 스텁을 설치하는 일은 에이전트 감지와 묶여 있어 8번 `onboard-dist`(온보딩 2단계)로 미룬다. `doan init`은 스킬을 설치하지 않는다.
- **Q4 `orphan_comment_file` 수준**: warning. 캔버스를 일부러 지운 경우에도 생긴다. error로 두면 에이전트가 check를 통과하려고 코멘트 파일을 지울 수 있는데, 이는 삭제는 사람만 한다는 규칙(PRODUCT §5)과 충돌한다.

## PoC 의존

없음. 이 피처의 명령은 파일만 읽고 쓴다. PoC 6(소켓·Go MCP SDK)은 3번·6번 전에, PoC 4(서빙 범위)는 4번 전에 한다.
