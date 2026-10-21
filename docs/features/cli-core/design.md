# cli-core — design

## 영향 받는 구성 요소

- CLI(Go): 실행 파일 `doan`과 명령 여섯 개. 이 피처의 본체다.
- 형식: 스키마 변경 없음. 기존 `config.v1`·`comment-event.v1`·`cli-envelope.v1`과 `formats.ParseLines`·`formats.FoldText`를 그대로 쓴다(아래 '형식 변경').
- 앱(TS): 코드 변경 없음. 8번 온보딩이 `doan init --json`을 호출한다(Q9).
- `doan mcp`: 3번 `mcp`가 이 피처의 명령 본체를 MCP 도구로 감싼다. 그래서 명령 본체는 `io.Writer`·`os.Exit`에 직접 닿지 않고 `(Outcome, *Error)`를 돌려준다(아래 '명령 본체').
- 스킬: `doan skill`이 출력하는 본문(영문, 바이너리에 내장).

## 코드 배치

```
cli/cmd/doan/main.go          os.Exit(cli.Run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)) 한 줄
cli/internal/cli/             Run, 명령 디스패치, 인자 파싱, 봉투, 사람용 출력, 명령 본체, skill.md
cli/internal/repo/            리포 찾기, config 읽기, 리포 안 경로 해석, 캔버스·코멘트 파일 나열
cli/internal/canvas/          HTML 한 장 → Canvas, CSS 스캐너 (순수)
cli/internal/check/           check 입력 → findings (순수)
cli/internal/comments/        MaxAt·NextAt·NewResolve(순수)와 붙이기(I/O)
cli/internal/formats/         (기존) 스키마 검증·접기
```

- 의존성 추가: `golang.org/x/net/html` 하나(HTML 파싱). 승격 때 ARCHITECTURE §8에 적는다.
- 버전: `-ldflags "-X .../cli.Version=..."`로 넣고 기본값은 `dev`. 빌드·배포 설정은 8번.

## 공통 규칙

### `cli.Run(args, stdin, stdout, stderr) int`

테스트가 호출하는 공개 함수다. 인자 파싱 → 명령 본체 → 봉투 직렬화 → 종료 코드까지 모두 여기서 일어나고, `main`은 이 함수만 부른다. POSTMORTEM 2026-10-21("test the composed public function")을 따른 것이다.

### 명령 본체

- 시그니처: `func(ctx Context, flags, positionals) (Outcome, *Error)`. `Outcome{Result any, Exit int}`, `Error{Code, Message, NextSteps []string}`.
- `Context`는 시작 디렉터리, stdin이 터미널인지, 질문 함수(`Prompt func(question string) (string, error)`), 시계, 난수를 담는다. 명령 본체는 `os.Getwd`·`os.Stdin`·`time.Now`를 직접 부르지 않는다.
- `Exit`는 성공일 때 0, check가 error finding을 냈을 때 4. 에러의 종료 코드는 `error.code` → 종료 코드 표가 정한다. 3번 `mcp`도 같은 값을 쓴다.

### 인자 파싱 (`cli.SplitArgs(args, fs *flag.FlagSet) (positionals, error)`)

- 표준 `flag`는 첫 비플래그 인자에서 멈춘다(`doan comment resolve cmt_x --json`에서 `--json`을 놓친다). 그래서 `fs.Parse`를 반복하며 `fs.Arg(0)`을 위치 인자로 떼어 낸다. `--` 뒤는 다시 파싱하지 않고 모두 위치 인자로 둔다.
- 명령마다 `FlagSet`을 만들고 공통 플래그 `--json`·`--repo`를 함께 등록한다. 그래서 `doan --json ls`처럼 명령 이름 앞에 와도 된다. 명령 이름은 첫 위치 인자(`comment resolve`는 두 개)다.
- `fs.SetOutput(io.Discard)`. 기본 출력이 stderr라서 그대로 두면 "`--json`이면 stderr 비움"이 깨진다.
- 값을 받는 플래그는 `--canvas foo`·`--canvas=foo` 둘 다 받는다. 값 없이 끝나면 `usage_error`. 같은 플래그를 두 번 주면 표준 `flag`대로 마지막 값을 쓴다. `-json`처럼 대시 하나도 표준 `flag`대로 받는다.
- 파싱이 실패해도 봉투 형식을 정해야 하므로, 파싱 전에 `--` 앞 인자에서 `--json`·`-json`을 먼저 찾는다.
- `-h`·`--help`·`doan help`: 사용법을 stdout에 쓰고 exit 0. `--json`이면 `result: {usage}`.

### 리포 찾기 (`repo.Find(start, repoFlag)`)

- 시작 디렉터리를 인자로 받는다(`os.Chdir` 없음). 시작 디렉터리와 찾은 루트는 `filepath.EvalSymlinks`한 값을 쓴다(macOS의 `/var` → `/private/var` 같은 차이 때문).
- `--repo <경로>`가 있으면 그 디렉터리만 본다(위로 올라가지 않는다). 없는 경로이거나 파일이면 `repo_not_found`.
- 없으면 시작 디렉터리부터 파일시스템 루트까지 올라가며 `.doan/config.json`이 있는 첫 디렉터리를 고른다. 중첩되면 안쪽이 이긴다. `.doan/`만 있고 `config.json`이 없으면 계속 올라간다. `.git` 위치는 보지 않는다(git 연산 없음, PRODUCT §3 Out of scope 6).
- 안쪽 config가 깨져 있으면 바깥으로 넘어가지 않고 그 에러로 끝난다. `config.json`이 일반 파일이 아니면(디렉터리 등) `invalid_config`.

### config 읽기 (`repo.ParseConfig(bytes) (Config, code)`, 순수)

판정 순서(접기의 `unknown_version`과 같은 순서):

1. `json.Decoder`에 `UseNumber()`로 파싱한다. 실패하거나 객체가 아니면 → `invalid_config`. BOM으로 시작하는 파일·빈 파일·`[]`·`null`도 여기서 걸린다.
2. `v`가 숫자인데 `Float64()` 값이 1이 아니면 → `unsupported_version`. `1e400`처럼 float64 범위를 넘는 숫자도 여기다. `Unmarshal`을 쓰면 overflow가 에러가 되어 `invalid_config`로 갈라진다(POSTMORTEM 2026-10-21과 같은 종류). `1.0`은 1이다.
3. `config.v1` 스키마 위반(`v` 없음, `v: "1"` 포함) → `invalid_config`.

TS(앱)가 4번에서 config를 읽게 되면 이 순서를 따르고 그때 공유 픽스처를 둔다.

### 리포 안 경로 해석 (`repo.Resolve(root, base, p) (state, realRel)`)

config의 `tokenCss`·`serve`, `--token-css`, 프레임의 `data-doan-implements`, 캔버스의 로컬 CSS 링크와 `@import`가 모두 이 함수를 거친다.

1. 어휘 검사 먼저: 절대 경로(`/x`)는 "밖". `base`에 붙여 `filepath.Clean`한 결과를 `filepath.Rel(root, ...)`로 바꿨을 때 `..`로 시작하면 "밖". 그래서 존재하지 않는 `../x`도 "없음"이 아니라 "밖"이다.
2. `filepath.EvalSymlinks`. `ENOENT`면 "없음"(끊어진 심링크 포함).
3. 실제 경로를 `filepath.Rel(realRoot, real)`로 바꿨을 때 `..`로 시작하면 "밖". 문자열 접두사로 비교하지 않는다(`/repo`와 `/repo2`를 구분하려고).
4. 아니면 "안". 리포 상대 실제 경로(`/` 구분)를 함께 돌려준다.

이유: 스키마는 `..`와 절대 경로만 막는다. 심링크로 리포 밖을 가리키는 경우는 런타임에서만 잡힌다(ARCHITECTURE §3 `.doan/config.json` v1).

### 파일 나열 (`repo.Canvases`, `repo.CommentFiles`)

- 캔버스: `design/` 아래를 재귀로 돈다. 확장자가 `.html`(대소문자 무시)인 일반 파일만 캔버스다. `.htm`은 아니다. 이름이 `.`으로 시작하는 디렉터리·파일은 건너뛰고, 심링크는 따라가지 않는다. 리포 상대 경로 순으로 정렬한다. `design/`이 없으면 빈 목록.
- 코멘트 파일: `.doan/comments/` 바로 아래의 일반 파일 중 이름이 `.jsonl`로 끝나는 것. 하위 디렉터리와 심링크는 건너뛴다(심링크를 따라가면 리포 밖을 읽거나 쓸 수 있다). 파일 이름에서 `.jsonl`을 뗀 문자열이 캔버스 id다. 디렉터리가 없으면 빈 목록.
- `ls`·`comments`·`resolve`·`check` 모두 이 두 함수의 결과로 캔버스 id와 코멘트 파일을 **정확한 문자열로** 맞춘다. 인자나 id로 `.doan/comments/<id>.jsonl` 경로를 조립해 열지 않는다. macOS는 파일 이름의 대소문자를 구분하지 않아서, 경로를 조립하면 `foo`로 `FOO.jsonl`이 열리고 `check`의 orphan 판정과 어긋난다. `--canvas ../x`로 리포 밖을 읽는 일도 같은 방법으로 막힌다.

### 출력

- `--json`: stdout에 봉투 한 줄. 성공 `{v: 1, ok: true, result}`, 실패 `{v: 1, ok: false, error: {code, message, nextSteps}}`. stderr에는 아무것도 쓰지 않는다.
- `--json` 없음: stdout에 사람이 읽는 텍스트, 실패는 stderr에 `error: <message>`와 `nextSteps` 줄들. 텍스트 모양은 테스트로 고정하지 않는다(에이전트는 `--json`을 쓴다).
- 사람용 텍스트에서는 U+0000–U+001F(LF·HT 제외), U+007F, U+0080–U+009F를 `\u00XX`로 바꿔 쓴다. 코멘트 본문은 데이터이고(ARCHITECTURE §6) git으로 받은 남의 본문에 터미널 제어 시퀀스가 들어 있을 수 있다. 이스케이프는 순수 함수 `cli.EscapeControl`로 둔다.
- 결과의 선택 키는 생략하고 `null`을 쓰지 않는다. 빈 목록은 `[]`(ARCHITECTURE §2 'Reading' Output 규칙과 같다). Go의 nil 슬라이스는 `null`로 직렬화되므로 `nextSteps`와 결과 목록은 항상 빈 슬라이스로 초기화한다.
- UTF-8이 아닌 바이트가 든 파일에서 나온 문자열은 `encoding/json`이 U+FFFD로 바꾼다. 봉투는 그래도 스키마를 통과한다.

### 스키마 검증 호출

`formats.Validate*`는 디코드된 JSON 값(`any`)을 받는다(`validate_test.go`가 `json.Unmarshal` 뒤 호출). Go 구조체는 `json.Marshal` → `json.Unmarshal`로 `any`를 만든 뒤 검증한다. resolve 이벤트와 통합 테스트의 봉투 검증이 이 경로를 쓴다.

### 에러 코드 추가

ARCHITECTURE §12는 `error.code`를 패턴으로만 정하므로 `v`를 올리지 않고 추가한다.

| 코드 | 종료 | 언제 | `nextSteps` 예 |
|---|---|---|---|
| `comment_not_found` | 2 | resolve 대상 id가 어느 코멘트 파일에도 없거나 삭제됨, 또는 id 형식이 아님 | "Run `doan comments --json` to list open comment ids" |
| `canvas_not_found` | 2 | `--canvas <id>`에 맞는 캔버스도 코멘트 파일도 없음 | "Run `doan ls --json`" |

표에 없는 코드는 exit 1로 처리한다(구현 실수를 숨기지 않기 위해).

## 명령

### `doan init [--token-css <path>]`

- 대상: `--repo`가 있으면 그 디렉터리, 없으면 시작 디렉터리. 리포 찾기를 하지 않는다(만드는 명령이므로). `--repo`가 없는 경로이거나 파일이면 `usage_error`이고 디렉터리를 만들지 않는다.
- 조상 디렉터리에 이미 `.doan/config.json`이 있어도 막지 않는다(Q10). 그 아래에서는 리포 찾기가 안쪽 리포를 고른다.
- 대상에 `.doan/config.json`이 이미 있으면 `repo.ParseConfig`로 읽는다.
  - 유효하면 아무것도 쓰지 않고 `{initialized: false, repo, tokenCss?, created: []}`로 성공한다. `--token-css`는 무시한다. PRODUCT §5 온보딩 3단계 "이미 설정된 리포는 건너뛴다"와 같다.
  - 깨졌으면 그 코드(`invalid_config`·`unsupported_version`)로 실패하고 덮어쓰지 않는다(Q11). 앱 온보딩이 이 리포를 "설정됨"으로 보고 넘어간 뒤 나중에 에러를 만나는 일을 막는다.
- 없으면 차례로:
  1. 토큰 CSS 경로를 정한다. `--token-css`가 있으면 그 값. 없고 stdin이 터미널이며 `--json`이 아니면 `Context.Prompt`로 한 번 묻는다(빈 입력 = 없음). 그 외에는 생략한다. 앱은 `--json --token-css`로 호출하므로 묻지 않는다(Q9).
  2. 값은 대상 디렉터리 기준 상대 경로다. `ToSlash(Clean(...))`로 저장 형태를 만들고, 그 값으로 만든 config가 `ValidateConfig`를 통과하며 `repo.Resolve`가 "안"이고 일반 파일이어야 한다. 아니면 `usage_error`이고 아무것도 쓰지 않는다.
  3. `design/` 디렉터리를 만든다(있으면 그대로).
  4. `.doan/config.json`을 `{v: 1, tokenCss?}`로 쓴다. `serve`는 쓰지 않는다(기본 `[]`).
  5. `.gitattributes`에서 줄 끝 CR을 뗀 줄 중 `.doan/comments/*.jsonl merge=union`과 정확히 같은 줄이 없으면 끝에 붙인다. 파일이 개행 없이 끝나면 개행을 먼저 넣는다. 기존 파일이 CRLF를 쓰면 CRLF로 붙인다.
- 결과(앱과의 계약, Q9): `{initialized, repo, tokenCss?, created: [경로...]}`. `repo`는 실제 절대 경로, `created`는 실제로 새로 만들거나 바꾼 리포 상대 경로(정렬). `tokenCss`가 없으면 `hardcoded_color` 검사가 꺼진 상태다.
- 스킬 설치는 하지 않는다(Q3 → 8번 `onboard-dist`).

### `doan ls`

- 결과: `{canvases: [{path, id?, title?, width?, frames: [{id, title?, implements?}], comments: {open, resolved}}]}`
  - `path`는 리포 상대, `/` 구분자. 정렬은 `repo.Canvases` 순서.
  - `id`·`width`가 없거나 규칙에 어긋나면 생략한다. 이유는 `doan check`가 알려 준다.
  - `comments`는 그 캔버스 id와 정확히 같은 이름의 코멘트 파일을 접은 결과의 개수. 파일이 없거나 id가 없으면 `{open: 0, resolved: 0}`.

### `doan comments [--canvas <id>]`

- 각 코멘트 파일을 `formats.FoldText`로 접는다.
- 결과: `{comments: [...], warnings: [...]}`
  - 코멘트: `status: open`인 것만. 접기 결과 필드 전부 + `canvas`(id) + `canvasPath?` + `outdated?`.
  - `canvasPath`·`outdated`는 그 id의 캔버스가 정확히 하나일 때만 둔다. `outdated`는 현재 파일 바이트의 `sha256:` + 소문자 hex가 `canvasHash`와 다르면 `true`, 같으면 `false`. 캔버스가 없거나 같은 id가 둘 이상이면 둘 다 생략한다(어느 파일인지 추측하지 않는다. 원인은 check의 `duplicate_canvas_id`).
  - 정렬: `canvas` → 접기 결과 순서(`createdAt` → `comment`).
  - 경고: 접기 경고 + `file`(리포 상대 경로). 정렬: `file` → 접기 경고 순서. `unknown_version` 줄도 여기로 온다.
- `--canvas <id>`: 나열한 캔버스 id와 코멘트 파일 이름을 정확한 문자열로 비교한다. 둘 다 없으면 `canvas_not_found`. 캔버스만 있으면 빈 목록.
- resolved 코멘트 조회(`--all`)는 두지 않는다(Q12).

### `doan comment resolve <cmt_id>... --agent <name>`

- `--agent`(Q2): `^[a-z0-9-]+$`(스키마의 에이전트 `name` 패턴). 없거나 패턴에 어긋나면 `usage_error`. id가 하나도 없어도 `usage_error`. 같은 id를 여러 번 주면 하나로 합친다.
- 순서:
  1. `repo.CommentFiles`의 모든 파일을 접어 `comment id → [(파일, 상태)]` 표를 만든다.
  2. 인자의 id가 하나라도 표에 없으면(삭제된 코멘트, 형식이 틀린 문자열 포함) `comment_not_found`로 아무것도 쓰지 않는다. 메시지에 없는 id를 모두 적는다.
  3. 같은 `cmt_` id가 두 파일에 있으면(파일을 복사한 경우) 각 파일에서 따로 판정한다. 파일마다 따로 접히므로 어느 쪽도 잃지 않는다.
  4. open인 것만 resolve 이벤트를 만든다. 이미 resolved면 건너뛴다(접기 규칙에서도 반복 resolve는 조용한 no-op이다).
  5. 파일마다 그 파일의 이벤트들을 한 번의 `Write`로 붙인다.
- 순수 함수:
  - `comments.MaxAt(ParseResult) (at, ok)`: `ParseLines`가 받아들인 이벤트의 `at` 중 최댓값(문자열 비교 = 시간 비교, 형식이 고정돼 있으므로). 마지막 줄의 값이 아니다. union merge 뒤에는 줄 순서가 `at` 순서와 다르다(PRODUCT §6 PoC 5).
  - `comments.NextAt(maxAt, ok, now) at`: `now`를 UTC로 바꾸고 밀리초 아래는 버린다. `max(now, maxAt + 1ms)`. `23:59:59.999Z + 1ms`는 다음 날 `00:00:00.000Z`. 같은 파일에 여러 개를 붙이면 앞 이벤트의 `at`이 다음 호출의 `maxAt`이다.
  - `comments.NewResolve(comment, agent, at, rand io.Reader) Event`: `{v: 1, id: "evt_" + 소문자 UUIDv4, at, type: "resolve", comment, by: {kind: "agent", name}}`. UUID의 version·variant 비트를 RFC 9562대로 세운다.
- 붙이기(I/O): `O_APPEND`로 열고 한 번의 `Write`. 파일이 비어 있지 않고 `\n`으로 끝나지 않으면 `\n`을 먼저 붙인다(안 그러면 앞 줄과 합쳐져 두 이벤트가 다 `invalid_event`가 된다).
  - 동시 쓰기: 로컬 파일시스템에서 한 번의 작은 `O_APPEND` 쓰기는 다른 쓰기와 줄 단위로 섞이지 않는다는 가정에 기댄다. 이 가정은 앱(7번)도 줄 묶음을 한 번의 쓰기로 붙일 때만 성립하므로, 승격 때 ARCHITECTURE §2 'Writing'에 두 쪽이 따를 규칙으로 적는다. 잠금은 두지 않는다.
  - 여러 파일에 쓰다가 중간에 실패하면 일부만 쓰인 채 `internal_error`로 끝난다. 다시 실행하면 이미 쓴 것은 `alreadyResolved`가 되므로 멱등이다.
- 쓰기 전에 만든 이벤트를 `ValidateCommentEvent`로 검증한다(실패하면 `internal_error`).
- 결과: `{resolved: [cmt_id...], alreadyResolved: [cmt_id...]}`(각각 정렬).
- `--all` 같은 일괄 옵션은 두지 않는다(에이전트 규칙 E: 적용한 것만 resolve, 일괄 금지).

### `doan check`

- 인자 없음. 리포 전체를 본다(캔버스 id 중복처럼 리포 단위 규칙이 있다).
- 결과: `{findings: [...], summary: {errors, warnings}}`.
- finding: `{severity: "error"|"warning", code, message, path, canvas?, frame?, element?, token?, url?, target?, value?}`. `path`는 항상 있다(아래 '귀속').
- 정렬: `path` → `severity`(error 먼저) → `code` → `canvas` → `frame` → `element` → `token` → `url` → `target` → `value`. `message`는 테스트로 고정하지 않는다.
- `summary.errors > 0`이면 `Outcome.Exit = 4`(`ok: true`). 아니면 0.

### `doan skill`

- 바이너리에 내장한 영문 본문(`cli/internal/cli/skill.md`, `go:embed`)을 그대로 출력하고, 마지막 줄 `[doan:skill] end of guide v<Version>`을 붙인다. 개발 빌드는 `vdev`.
- `--json`: `{version, body}`. `body`는 끝 표시 줄을 포함한 전체 텍스트.
- 본문 범위(Q3): 캔버스 규약 10개와 에이전트 규칙 A–H(ARCHITECTURE §1), 이 피처의 명령 사용법(`--agent` 예 포함), "토큰은 캔버스가 링크한 로컬 CSS로 정의한다"(Q5·Q6). 8번이 다듬는다.

## Canvas 모델 (`canvas.Parse(path, bytes) → Canvas`, 순수 — `/tdd` 대상)

`golang.org/x/net/html`로 파싱한다(브라우저와 같은 HTML5 파싱 규칙).

공통 규칙:

- **속성**: 같은 이름의 속성이 두 번 나오면 첫 번째만 쓴다(브라우저와 같다). 값은 파서가 돌려준 그대로 쓰고 따로 공백을 자르지 않는다.
- **`<template>`**: 그 안의 요소는 렌더되지 않으므로 보지 않는다.
- **meta 범위**: `doan:canvas`·`doan:width`는 `<head>` 안의 것만 센다. `name`은 ASCII 대소문자를 무시하고 비교한다. body 안에서만 발견되면(HTML5 파서는 meta 앞에 본문 내용이 있으면 meta를 body로 보낸다) "없음"으로 보고 `BodyMeta` 표시를 남긴다. check가 메시지에 "found in body"를 붙인다.

| 필드 | 출처 | 규칙 |
|---|---|---|
| `ID` | `<meta name="doan:canvas">`의 `content` | 값 그대로. 두 개 이상이면 `IDDup` 표시. 패턴 검사는 check가 한다(Q1) |
| `Width` | `<meta name="doan:width">`의 `content` | `^[1-9][0-9]*$`이고 `strconv.Atoi`가 성공할 때만 정수. 아니면 `WidthRaw`만 남긴다(`" 375"`·`"375px"`·`"+1"`·`"012"`·overflow는 모두 무효). 두 개 이상이면 `WidthDup` 표시 |
| `Title` | 첫 `<title>`의 텍스트 | ASCII whitespace(TAB·LF·FF·CR·SP)를 앞뒤에서 벗기고 연속된 것을 SP 하나로 줄인다. 브라우저 `document.title`과 같은 규칙이다. 다른 유니코드 공백(NBSP·U+0085·U+FEFF)은 그대로 |
| `Frames` | `data-doan-frame` 속성을 가진 요소, 문서 순서 | `{ID, Title?(data-doan-title), Implements?(data-doan-implements)}`. 값 없는 속성은 `""` |
| `DoanIDs` | `data-doan-id` 값, 문서 순서 | 중복·빈 값 판정용 |
| `Styles` | `<style>` 텍스트들과 `style` 속성 값들 | `ScanCSS`로 스캔한 결과. `<style>`은 스타일시트 모드, `style` 속성은 선언 목록 모드 |
| `Links` | `<link href>` 중 `rel`을 ASCII whitespace로 나눈 토큰에 `stylesheet`가 있는 것(대소문자 무시) | href 원문 |
| `ExternalURLs` | 아래 '외부 URL' | 캔버스마다 중복 제거, 정렬 |

### href → 로컬 경로

- 앞뒤의 U+0000–U+0020을 벗긴다(브라우저 URL 파서와 같다).
- 스킴(`^[A-Za-z][A-Za-z0-9+.-]*:`)이 있거나 `//`로 시작하면 로컬이 아니다. 그중 `http:`·`https:`(대소문자 무시)와 `//`는 외부 URL이고, 나머지 스킴(`data:`·`file:` 등)은 무시한다.
- `?`·`#` 뒤를 떼고 percent-decode한다. `/`로 시작하면 서버 루트 기준이라 앱에서 풀리지 않으므로 `repo.Resolve`가 "밖"으로 판정한다. 나머지는 캔버스 파일 기준 상대 경로다(규약 7).

### 외부 URL

다음 속성 값과 CSS의 `url(...)`·`@import` 중 위 규칙으로 외부인 것:

- `script[src]`, `link[href]`(rel 무관), `img[src]`, `img[srcset]`·`source[srcset]`(후보 URL마다), `iframe`·`video`·`audio`·`source`·`embed`·`track`의 `[src]`, `video[poster]`, `object[data]`
- SVG `use`·`image`의 `[href]`·`[xlink:href]`

## CSS 스캐너 (`canvas.ScanCSS(text, mode) → Scan`, 순수 — `/tdd` 대상)

CSS 파서 없이 한 번 훑는다. 결과: `{Defs: 이름 집합, Refs: [{name, hasFallback}], Colors: [값], Imports: [href], URLs: [href]}`.

- **건너뛰기**: 주석 `/* … */`(닫히지 않으면 끝까지), 문자열 `'…'`·`"…"`(백슬래시 이스케이프, 닫히지 않으면 줄 끝까지). 문자열 안 내용은 `url()`·`@import`의 인자일 때만 쓴다.
- **`url(…)`**: 함수 이름은 대소문자 무시. 따옴표가 없으면 `)`까지, 있으면 문자열 규칙으로 통째로 읽어 `URLs`에 넣고 안쪽은 색·선언으로 보지 않는다. 그래서 `url(#fade)`·`url(data:…;…)`가 오판되지 않는다.
- **선언**: 중괄호 깊이를 추적한다. 깊이 0의 내용(선택자·`@media` 조건 같은 prelude)은 선언으로 보지 않는다. 블록 안에서 블록 시작이나 `;` 바로 다음에 `이름 :` 형태가 오면 선언이다. 이름은 `--`로 시작하는 커스텀 속성 이름이거나 CSS 식별자다. 값은 `;`·`}`·`{`에서 끝난다. `{`에서 끝나면 그것은 선언이 아니라 중첩 규칙의 선택자(`a:hover #add {`)이므로 버린다. 선언 목록 모드(`style` 속성)는 처음부터 깊이 1로 시작한다.
- **커스텀 속성 이름**: `--` 다음에 ASCII 영숫자·`-`·`_`·U+0080 이상 문자. 대소문자를 구분한다. 선언 이름이면 `Defs`에 넣는다.
- **참조**: 선언 값 안의 `var(`(대소문자 무시) 다음 CSS 공백(SP·HT·LF·CR·FF)을 건너뛰고 커스텀 속성 이름을 읽는다. 대체값(`,` 뒤)이 있으면 `hasFallback`, 대체값 안의 `var()`도 참조로 센다.
- **색**: 선언 값(커스텀 속성 선언과 `var()` 대체값 포함, Q13) 안에서
  - `#` 다음 hex 숫자가 정확히 3·4·6·8자리이고 그 뒤가 식별자 문자가 아닌 것(5·7자리는 색이 아니다)
  - `rgb(`·`rgba(`(대소문자 무시), 앞이 식별자 문자가 아닌 것
  - 한계: `hsl()`·`oklch()`·이름 색(`red`)은 잡지 않는다(규약 10은 hex·rgb만 말한다).
- **`@import`**: 깊이 0에서 `@import` 다음의 문자열 또는 `url()`을 `Imports`에 넣는다.

스크립트가 런타임에 만드는 스타일은 보지 않는다(정적 검사).

## 검사 규칙 (`check.Run(Input) → []Finding`, 순수 — `/tdd` 대상)

### 입력 (셸이 만든다)

```
Input{
  Canvases       []canvas.Canvas (각각 Path 포함)
  Reach          map[캔버스 Path][]CSSRef   // 캔버스가 닿는 CSS 파일들
  CSS            map[실제 리포 상대 경로]canvas.Scan
  TokenCSS       {Configured bool, Path, State: 안|없음|밖, RealPath}
  Served         func(실제 리포 상대 경로) bool
  Implements     map[경로]State
  CommentFileIDs []string
}
CSSRef{From: 캔버스 Path 또는 CSS 파일 경로, Href, State, RealPath, Direct bool}
```

- `Reach`는 셸이 만든다. 캔버스의 `Links`와 `<style>` 안 `@import`(Direct)에서 시작해, 찾은 CSS 파일의 상대 경로 `@import`를 리포 안에서 재귀로 따라간다. 방문 집합으로 순환을 막는다. 파일 경로는 `repo.Resolve`의 실제 경로로 정규화하므로 `./tokens.css`와 `../tokens.css`가 같은 파일이면 같은 키다.
- CSS 파일 안에서 해석할 수 없는 `@import`(로컬 파일이 없거나 `tailwindcss` 같은 패키지 이름)는 따라가지 않고 finding도 만들지 않는다. 캔버스가 직접 링크하거나 `<style>`에서 import한 것(Direct)만 `local_css_not_found` 대상이다.
- `Served(p)`: `p`가 `design/` 아래이거나, config의 `tokenCss`와 같거나, `serve` 항목과 같거나 그 아래면 참(경로 세그먼트 단위 비교). 앱의 서빙 범위(ARCHITECTURE §3)와 같은 목록이다.

### 정의가 닿는 범위 (Q5·Q6)

캔버스의 `undefined_token` 판정에 쓰는 정의 집합 = 캔버스의 `Styles.Defs` ∪ 그 캔버스의 `Reach`에 있는 모든 CSS 파일의 `Defs`. config의 `tokenCss`라도 캔버스가 링크하지 않았으면 세지 않는다. 브라우저에서 실제로 풀리는 정의와 같게 하려는 것이다. 외부(CDN) 스타일시트의 정의는 볼 수 없으므로 세지 않고, 그 토큰을 쓰면 error다(Q6).

### 규칙

| 코드 | 수준 | 조건 | 근거 |
|---|---|---|---|
| `missing_canvas_id` | error | `<head>`에 `doan:canvas` meta 없음 | 규약 2 |
| `invalid_canvas_id` | error | id가 `^[a-z0-9]+(-[a-z0-9]+)*$`에 어긋남, 또는 meta가 두 개 이상 | 규약 2, Q1 |
| `duplicate_canvas_id` | error | 유효한 같은 id의 캔버스가 둘 이상(파일마다 한 건). id가 없거나 무효인 캔버스는 이 판정에 넣지 않는다 | 규약 8 |
| `missing_width` | error | `<head>`에 `doan:width` meta 없음 | 규약 3, PRODUCT §7 |
| `invalid_width` | error | 값이 양의 정수가 아님, 또는 meta가 두 개 이상 | 규약 3 |
| `duplicate_frame_id` | error | 한 캔버스 안에서 같은 `data-doan-frame` 값이 둘 이상 | 규약 8 |
| `empty_frame_id` | error | `data-doan-frame`이 `""` | 규약 4 |
| `duplicate_doan_id` | error | 한 캔버스 안에서 같은 `data-doan-id` 값이 둘 이상 | 규약 8 |
| `empty_doan_id` | error | `data-doan-id`가 `""` | 규약 5 |
| `undefined_token` | error | 참조한 `--x`가 위 '정의가 닿는 범위'에 없음. 대체값이 있어도 error | 규약 7, PRODUCT §5, Q5·Q6 |
| `implements_not_found` | error | `data-doan-implements` 경로(리포 상대)가 리포 안에 없음. `""`도 여기 | 규약 6 |
| `path_outside_repo` | error | `data-doan-implements`·로컬 CSS 경로가 리포 밖(심링크·절대 경로 포함) | design '리포 안 경로 해석' |
| `local_css_not_found` | error | 캔버스가 직접 링크하거나 `<style>`에서 import한 로컬 CSS가 없음 | 규약 7 |
| `css_not_served` | error | 캔버스가 닿는 로컬 CSS가 리포 안에 있지만 `Served`가 거짓. config의 `serve`에 넣으면 풀린다 | ARCHITECTURE §3, Q8 |
| `token_css_not_found` | error | config의 `tokenCss` 파일이 없거나 리포 밖 | 규약 7 |
| `external_url` | warning | 외부 URL(캔버스·CSS 파일마다 URL 하나에 한 건) | 규약 9 |
| `hardcoded_color` | warning | config에 `tokenCss`가 있고, 캔버스나 닿는 CSS 파일(토큰 CSS 파일 자신은 제외)의 색 | 규약 10, Q13 |
| `orphan_comment_file` | warning | 코멘트 파일 이름의 id와 같은 id의 캔버스가 없음 | PRODUCT §5 11, Q4 |

- 프레임 id와 `data-doan-id`는 서로 다른 이름 공간이다. 둘이 같은 값이어도 중복이 아니다.
- 토큰 CSS 파일 자신의 `var()` 참조와 색은 검사하지 않는다(리포의 코드다).
- 연쇄: `tokenCss`가 없으면 `token_css_not_found` 하나를 내고, 그 파일을 링크한 캔버스는 `local_css_not_found`, 그 토큰을 쓴 곳은 `undefined_token`을 따로 낸다. 각각 고칠 곳이 다르다.

### 귀속 (`path`)

- 캔버스 HTML에서 나온 것: 캔버스 경로.
- CSS 파일에서 나온 것(`undefined_token`·`hardcoded_color`·`external_url`): 그 CSS 파일의 실제 리포 상대 경로. 여러 캔버스가 같은 파일에 닿아도 `(path, code, token|value|url)`마다 한 건만 낸다. `undefined_token`이면 그 토큰이 풀리지 않는 캔버스 중 경로가 가장 앞인 것을 `canvas`에 적는다.
- `local_css_not_found`·`css_not_served`·`path_outside_repo`: 링크한 캔버스 경로, `target`에 href.
- `token_css_not_found`: `.doan/config.json`, `target`에 `tokenCss` 값.
- `orphan_comment_file`: 코멘트 파일 경로.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `cli.SplitArgs(args, fs)`, `cli.EscapeControl(s)`, `cli.Envelope(...)`와 에러 코드 → 종료 코드 표
2. `repo.ParseConfig(bytes)`
3. `canvas.ScanCSS(text, mode)`, `canvas.Parse(path, bytes)`, href → 로컬 경로 변환
4. `check.Run(Input)`
5. `comments.MaxAt`, `comments.NextAt`, `comments.NewResolve`

셸(I/O): `repo.Find`, `repo.Resolve`, `repo.Canvases`, `repo.CommentFiles`, `Reach` 만들기, 붙이기, `init`의 파일 쓰기, `cli.Run`. 이것들은 임시 디렉터리 통합 테스트로 확인한다.

## 형식 변경

- JSON Schema: 없음. `v`도 그대로다.
- 명령별 `result` 모양은 스키마로 만들지 않는다. 만드는 쪽이 Go 하나뿐이라 두 구현이 어긋날 위험이 없다. 봉투 스키마의 `result`는 이미 `{}`(아무 값)다. 이는 ARCHITECTURE §11 "JSON Schema가 CLI 응답 형식의 정본"에서 벗어나는 결정이므로, 승격 때 §11에 "`result` 모양은 §12에 산문으로 둔다(생산자가 Go 하나)"를 날짜와 함께 적고 PRODUCT §7에 한 줄 넣는다. 통합 테스트는 봉투를 `ValidateEnvelope`로 검증한 뒤 `result`를 기대 JSON과 deep-equal로 비교한다.
- 새 `error.code` 두 개(`comment_not_found`, `canvas_not_found`)는 패턴 안이므로 `v` 변경 없음. ARCHITECTURE §12 표에 추가한다.

## 규약 영향

- 규약 2: 캔버스 id는 소문자 kebab(Q1).
- 규약 7: 토큰은 캔버스가 링크한 로컬 CSS로 정의한다. 링크하지 않은 토큰 CSS와 외부 스타일시트의 정의는 check가 세지 않는다(Q5·Q6). 링크한 로컬 CSS는 서빙 범위 안에 있어야 한다(Q8).
- 규약 10: 커스텀 속성 선언과 `var()` 대체값의 hex·rgb도 경고한다(Q13).
- `doan check` 규칙 18개와 수준(위 표)을 승격 때 ARCHITECTURE §1에 적는다.

## 결정 영향

- git 연산 없음: `init`은 `.gitattributes` 파일 한 줄만 쓴다(ARCHITECTURE §2가 이미 허용). 리포 찾기는 `.git`을 보지 않는다.
- append-only: resolve는 줄을 붙이기만 한다. 기존 줄을 고치거나 지우지 않는다.
- 토큰 처리 없음·네트워크 없음: CLI는 네트워크 요청을 하지 않는다.
- 에이전트는 resolve만: CLI에 생성·수정·삭제·reopen 명령이 없다.
- 코멘트 본문은 데이터: 사람용 출력에서 제어 문자를 이스케이프한다.
- 서빙 범위: CLI는 서빙하지 않지만, 앱과 같은 범위 목록으로 `css_not_served`를 판정한다.
- PRODUCT §5 8 "`doan init` … installs skills"를 바꾸고(Q3), 온보딩 3단계가 `doan init --json`을 호출한다고 정한다(Q9). tasks 0에서 PRODUCT에 적는다.

## 확정된 질문 (2026-10-21 사용자)

- **Q1 캔버스 id 문자 집합**: 소문자 kebab `^[a-z0-9]+(-[a-z0-9]+)*$`. id가 코멘트 파일 이름이 되는데, macOS는 파일 이름의 대소문자를 구분하지 않아 `Foo`와 `foo`가 충돌한다. 이 패턴이면 그런 충돌이 없고 `../`·공백도 경로에 들어가지 않는다. 어기면 `invalid_canvas_id`(error). 프레임 id·`data-doan-id`는 파일 이름이 되지 않으므로 제한하지 않는다(비어 있으면 안 될 뿐).
- **Q2 에이전트 이름**: `--agent <name>` 플래그 필수. 환경 변수나 자동 감지는 두지 않는다. 읽는 곳이 하나뿐이라 추측이 없고, 스킬이 명령 예시에 넣어 준다.
- **Q3 스킬 범위**: 이 피처는 `doan skill` 본문과 끝 표시까지만 만든다. Claude Code·Codex에 스텁을 설치하는 일은 에이전트 감지와 묶여 있어 8번 `onboard-dist`(온보딩 2단계)로 미룬다. `doan init`은 스킬을 설치하지 않는다.
- **Q4 `orphan_comment_file` 수준**: warning. 캔버스를 일부러 지운 경우에도 생긴다. error로 두면 에이전트가 check를 통과하려고 코멘트 파일을 지울 수 있는데, 이는 삭제는 사람만 한다는 규칙(PRODUCT §5)과 충돌한다.

리뷰에서 확정 (2026-10-21 사용자, `/feature-review`):

- **Q5 토큰 정의 범위**: 캔버스가 실제로 닿는 정의만 센다(`<style>`·`style` 속성·링크한 로컬 CSS와 그 `@import`). 링크하지 않은 토큰 CSS는 세지 않는다. 브라우저에서 풀리는 것과 같아서 링크 누락을 잡는다(규약 7).
- **Q6 외부 CSS의 토큰**: error 유지. 토큰은 리포의 로컬 CSS에서만 온다고 본다('Tie to code'). 스킬 본문에 적는다.
- **Q7 진행 방식**: 태스크 1~8은 `/orchestrate` 한 번으로 진행한다. 브랜치 `feat-cli-core` 하나, PR 하나.
- **Q8 서빙 범위 밖 CSS**: `css_not_served` error. 사람이 보는 화면이 깨지고, 에이전트가 config의 `serve`로 고칠 수 있다.
- **Q9 앱 온보딩**: 앱이 번들의 `doan init --json --token-css`를 호출한다. TS로 다시 구현하지 않는다(POSTMORTEM과 같은 어긋남 방지). `init`의 `result`는 앱과의 계약이다.
- **Q10 중첩 init**: 허용. 하위 폴더에도 리포를 만들 수 있고, 리포 찾기는 안쪽을 고른다.
- **Q11 깨진 config에서 init**: `invalid_config`(또는 `unsupported_version`)로 실패하고 덮어쓰지 않는다.
- **Q12 `--all`**: 두지 않는다. 쓰는 시나리오가 없다.
- **Q13 하드코딩 색 범위**: 커스텀 속성 선언(`--local: #fff`)과 `var()` 대체값(`var(--x, #fff)`)도 경고한다. 규약 10의 문장 그대로다.

## PoC 의존

없음. 이 피처의 명령은 파일만 읽고 쓴다. PoC 6(소켓·Go MCP SDK)은 3번·6번 전에, PoC 4(서빙 범위)는 4번 전에 한다. `css_not_served`는 서빙 범위 **목록**(ARCHITECTURE §3, 결정됨)만 쓰고 서버 구현에는 기대지 않는다.
