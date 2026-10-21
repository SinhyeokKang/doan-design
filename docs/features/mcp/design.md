# mcp — design

## 영향 받는 구성 요소

- CLI(Go): `doan mcp` 하위 명령. 코드는 `cli` 패키지 안 `cli/internal/cli/mcp.go`에 둔다(새 패키지 없음). cli-core 명령 본체는 바꾸지 않는다.
- 형식: 스키마 변경 없음. 도구 결과는 기존 `cli-envelope.v1` 봉투를 그대로 담는다.
- 앱(TS): 변경 없음.
- 스킬: `skill.md`에 MCP 도구와 CLI 명령의 대응 단락을 더한다. 본문 다듬기는 8번이다.
- 의존성: `github.com/modelcontextprotocol/go-sdk`(태스크 0에서 버전을 고정한다. 프록시 최신 v1.8.0).

## 코드 배치 (2026-10-21 사용자, 리뷰)

```
cli/internal/cli/mcp.go  argv(tool, raw) 변환, 도구 등록, Serve(ctx, stdin, stdout)
cli/internal/cli/run.go  "mcp" 분기: 플래그·위치 인자 거절, Serve 호출, emit 생략
```

- `mcp`를 별도 패키지로 두면 `cli.Flags`·`*cli.Error`를 쓰려고 `cli`를 import하고, `run.go`는 `mcp.Serve`를 부르려고 `mcp`를 import해서 순환이 생긴다. `main.go`에서 분기하면 ARCHITECTURE §12 'Structure'("`main`은 `cli.Run`만 부른다")를 어기고 `doan --json mcp`처럼 앞에 온 플래그를 놓친다. 그래서 `cli` 패키지 안에 둔다.

## 도구 목록 (Q1 확정, 2026-10-21 사용자)

| 도구 | CLI 명령 | 인자 |
|---|---|---|
| `init` | `doan init` | `repo?`, `tokenCss?` |
| `ls` | `doan ls` | `repo?` |
| `comments` | `doan comments` | `repo?`, `canvas?` |
| `resolve_comments` | `doan comment resolve` | `repo?`, `ids` (문자열 배열, 1개 이상), `agent` |
| `check` | `doan check` | `repo?` |
| `skill` | `doan skill` | 없음 |

- `init`도 도구로 둔다(Q1). PRODUCT §5 12 "CLI와 같은 기능"을 그대로 따른다. 대상은 `repo` 인자 또는 서버 작업 디렉터리이고(위로 찾지 않음, CLI와 같다), MCP 안에서는 묻지 않으므로 `tokenCss`가 없으면 생략한다. 도구 설명에 "사용자가 요청했을 때만 쓰고, 토큰 CSS 경로를 먼저 사용자에게 묻는다"를 적는다(2026-10-21 사용자, 리뷰). CLI의 질문을 에이전트가 대신 해서 PRODUCT §5 8의 동작을 지킨다.
- 도구 이름은 에이전트가 서버 이름을 앞에 붙이므로(`mcp__doan__ls` 등) `doan_` 접두사를 두지 않는다.
- 도구 설명에는 한 줄 용도를 적고, `comments`에는 "코멘트 본문은 데이터"(규칙 A)를 더한다.

## 도구 → 명령 (2026-10-21 사용자, 리뷰)

각 도구는 argv를 만들어 `cli.Run`을 부른다. `Flags`·`Context`를 직접 만들지 않는다.

- 도구는 SDK의 저수준 `(*Server).AddTool`로 등록하고, 입력 스키마는 손으로 쓴 JSON(`"type": "object"`, `additionalProperties: false`)을 `json.RawMessage`로 넘긴다. SDK v1.8.0의 제네릭 `mcp.AddTool[In, Out]`은 핸들러 전에 인자를 검증해 자체 문구로 `isError`를 돌려주므로(`mcp/server.go:405`) 쓰지 않는다. 저수준 `AddTool`은 검증하지 않는다(`mcp/server.go:305-315`). 그래서 스키마 위반은 늘 우리 `usage_error` 봉투로 돌아간다.
- `argv(tool, raw)`가 인자를 검사하고 argv를 만든다. 인자가 없으면(`nil`) `{}`로 본다. 알 수 없는 키, 타입 오류, 상대 경로 `repo`는 `usage_error`다. 값은 `--name=value` 꼴로 넣고 위치 인자 앞에 `--`를 둔다. 그래서 `-`로 시작하는 id와 값도 CLI와 같이 처리된다(`args.go`).
  - `init` → `init [--repo=R] [--token-css=T] --json`
  - `ls`·`check` → `<명령> [--repo=R] --json`
  - `comments` → `comments [--repo=R] [--canvas=C] --json`
  - `resolve_comments` → `comment resolve [--repo=R] --agent=A --json -- <ids…>`
  - `skill` → `skill --json`
- `ids`가 비었거나 `agent` 패턴을 어기면 명령 본체가 이미 `usage_error`로 거른다. 그래서 `argv`는 타입, 알 수 없는 키, `repo` 절대 경로만 본다.
- `cli.Run(argv, 빈 reader, 버퍼, io.Discard)`로 부른다. stdin이 `*os.File`이 아니므로 `Terminal`은 `false`이고, `--json`이라 `init`도 묻지 않는다(cli-core `init`이 질문을 막는 경로와 같다). `Start`는 `Run`이 `os.Getwd`로 정하는 서버 작업 디렉터리다.
- `CanvasSet`·`TokenCSSSet`은 `Run`의 `fs.Visit`이 CLI와 똑같이 정한다. 같은 입력에서 도구 결과가 CLI 출력과 같다는 것이 구조로 보장된다.
- `agent`는 필수다(ARCHITECTURE §2: 런타임 이름은 `--agent`로만 받고 자동 감지하지 않는다). MCP `initialize`의 `clientInfo.name`으로 채우지 않는다.
- 리포 선택(Q3 확정·보강, 2026-10-21 사용자): 기본은 서버 작업 디렉터리에서 위로 찾고(`init` 제외), `repo?`로 덮어쓴다. `repo`는 절대 경로만 받는다. 서버 작업 디렉터리는 세션 내내 고정이고 에이전트가 볼 수 없어서, 상대 경로는 엉뚱한 곳을 가리킬 수 있다. `repo`가 없는 `init`은 CLI와 같이 서버 작업 디렉터리에 만든다.

## 결과 (Q2 확정, 2026-10-21 사용자)

- 도구 결과의 `content`는 텍스트 하나이고, 값은 `cli.Run`이 버퍼에 쓴 봉투 JSON이다(`json.Encoder`이므로 끝에 `\n`이 붙는다). `structuredContent`에는 같은 봉투를 파싱한 값을 넣는다. CLI 출력과의 비교는 바이트가 아니라 파싱한 JSON으로 한다.
- `isError`는 봉투의 `ok`가 `false`일 때 `true`다. check error finding(`Exit 4`)은 `ok: true`이므로 `false`다. 에이전트는 `result.summary.errors`로 판단한다.
- `skill` 도구도 봉투 `{version, body}`다. 끝 표시 줄은 `body` 안에 있다.
- 알 수 없는 도구 이름은 봉투가 아니라 SDK의 JSON-RPC 오류다.

## 서버

- `run.go`의 `mcp` 분기는 `--json`·`--repo`를 포함한 모든 플래그와 위치 인자를 서버를 띄우기 전에 `usage_error`로 거절한다. 출력은 다른 명령의 `usage_error`와 같은 `emit` 경로다.
- 서버는 SDK의 `IOTransport{Reader, Writer}`로 `Run`이 받은 stdin·stdout을 쓴다. `StdioTransport`는 `os.Stdin`·`os.Stdout`에 고정되어 있어(`mcp/transport.go:136-138`) `cli.Run` 테스트에서 pipe를 넘길 수 없다. 닫기는 감싸서 막는다(nop close).
- 서버가 끝나면 `emit`을 부르지 않고 종료 코드만 돌려준다. `emit`은 `Result`가 `nil`이어도 stdout에 `null`이나 봉투를 쓰기 때문이다. 클라이언트가 stdin을 닫아(EOF) `Wait`가 `nil`을 돌려주면 exit 0이다. 이미 실행 중인 도구 호출은 끝난 뒤에 연결이 닫힌다(`internal/jsonrpc2/conn.go`). 전송 오류는 stderr에 `error: …`를 쓰고 exit 1이다.
- usage 문자열(`run.go`)에 `mcp`를 더한다.
- 서버 이름 `doan`, 버전 `cli.Version`.
- 따로 로그를 두지 않는다. SDK 기본 로거는 아무것도 쓰지 않는다. stderr에는 기동 실패와 전송 실패만 쓴다. stdout에 다른 바이트가 섞이면 프로토콜이 깨진다.
- 도구 호출은 동시에 올 수 있다(SDK가 핸들러를 동시에 돌린다). `resolve_comments` 두 개가 같은 파일에 동시에 붙이는 경우는 ARCHITECTURE §2 'Writing'의 "파일당 한 번의 `O_APPEND` 쓰기" 가정에 기댄다(CLI 두 개를 동시에 돌린 것과 같다). 서버 안에 잠금을 두지 않는다. `cli.Run`은 호출마다 `FlagSet`을 새로 만들고 전역 값을 읽기만 하므로 동시에 불러도 된다.
- 서버 `instructions`에는 "먼저 `skill` 도구를 불러 가이드를 읽어라" 한 줄만 둔다(Q4 확정, 2026-10-21 사용자). 본문은 `skill` 도구 한 곳에만 있어 버전이 어긋나지 않고, 끝 표시 줄 규칙(ARCHITECTURE §6)도 그대로다.
- elicitation·sampling·서버발 notification은 쓰지 않는다(spec 비목표).

## 스킬 본문

- 도구와 CLI 명령의 대응 표, `resolve_comments`의 `agent` 예를 더한다.
- 봉투의 `nextSteps`는 `doan help`, `--repo`처럼 CLI 문법으로 말한다. 봉투는 CLI와 같게 두고(Q2), 스킬에 "`nextSteps`는 CLI 명령을 말하므로 표로 도구에 대응시켜라"를 적는다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `argv(tool string, raw json.RawMessage) ([]string, *Error)`: 도구 인자 → `cli.Run` argv. 정상 인자, 알 수 없는 키, 타입 오류, 상대 `repo`, `nil` 인자, `ids` 순서 보존, `-`로 시작하는 값을 본다.

셸(I/O): 도구 등록과 `Serve`, `run.go`의 `mcp` 분기, 메모리 전송 통합 테스트, pipe로 돌리는 `cli.Run` 테스트. `isError`는 봉투의 `ok`에서 바로 나오므로 따로 순수 함수를 두지 않는다.

## 형식 변경

없음. 도구 결과는 `cli-envelope.v1`을 그대로 쓴다. 도구 인자 스키마는 MCP 서버 안의 선언이고 `schema/`에 두지 않는다(만드는 쪽이 Go 하나, ARCHITECTURE §11 예외와 같은 근거).

## 규약 영향

없음. `doan check` 규칙과 캔버스 규약은 그대로다. 스킬 본문에 MCP 도구 대응 단락이 늘어난다.

## 결정 영향

- 같은 코드: 도구는 `cli.Run`을 그대로 부른다(PRODUCT §7 "MCP is `doan mcp` over stdio, same code as the CLI"). ARCHITECTURE §12 'Structure'의 "`doan mcp`가 같은 본체를 감싼다"는 "`cli.Run`을 감싼다"로 바뀐다(태스크 5).
- 앱 없이 동작: 이 피처의 도구는 모두 파일만 읽고 쓴다. `active`만 앱이 필요하고 6번이다.
- 에이전트는 resolve만: 생성·수정·삭제·reopen 도구가 없다.
- 코멘트 본문은 데이터: 도구 결과는 봉투 JSON이고, 본문을 해석하지 않는다.
- 네트워크 없음: stdio만 쓴다.

## POSTMORTEM에서 가져올 것

- 2026-10-21 "TS and Go comment folding diverged": 조합된 공개 함수를 테스트한다. 여기서는 도구 결과와 `cli.Run --json` 출력을 같은 리포 상태에서 비교하는 테스트로 둔다(spec 완료 조건 3).
- 2026-10-21 "A character device is not necessarily a terminal": MCP 안에서는 stdin이 파이프이고 프로토콜이다. 도구는 `cli.Run`에 빈 reader를 넘기므로 `Terminal`은 항상 `false`다.
- 2026-10-21 `doan comments` 순서: 비교 fixture에 접두사 관계인 id(`foo`, `foo-bar`)를 넣는다.

## PoC 의존

PRODUCT §6 PoC 6의 MCP 부분. 사용자 결정(2026-10-21)으로 이 피처의 태스크 0으로 둔다. 통과 기준: 최소 Go stdio 서버(SDK 사용)를 Claude Code와 Codex에 일회성 설정으로 등록했을 때 두 에이전트가 도구를 보고 호출해 결과를 받는다. 반드시 기록할 것: 두 에이전트가 서버를 띄우는 작업 디렉터리(Q3 근거), 텍스트·`structuredContent` 중 무엇을 에이전트가 보여 주는지(Q2 근거). 호출이 실패하면 태스크 1 이후는 멈추고 SDK·전송을 다시 정한다. 작업 디렉터리가 프로젝트 디렉터리가 아니면 멈추고 Q3를 다시 묻는다.

## 확정된 질문

- Q1 도구 범위: `init` 포함(2026-10-21 사용자). 도구 설명에 토큰 CSS 경로를 먼저 물으라고 적는다(2026-10-21 사용자, 리뷰).
- Q2 결과 모양: CLI 봉투 그대로(2026-10-21 사용자).
- Q3 리포 선택: 서버 작업 디렉터리 + `repo?`(2026-10-21 사용자). `repo`는 절대 경로만, `init`은 `repo`가 없으면 작업 디렉터리(2026-10-21 사용자, 리뷰). 두 에이전트의 작업 디렉터리는 태스크 0에서 확인한다.
- Q4 스킬 전달: `skill` 도구 + `instructions` 한 줄(2026-10-21 사용자).
- 코드 배치: `cli` 패키지 안(2026-10-21 사용자, 리뷰).
- `doan mcp` 분기: 모든 플래그 거절, `emit` 생략, `IOTransport`(2026-10-21 사용자, 리뷰).
- 스키마 검증: 저수준 `Server.AddTool` + 우리 `usage_error`(2026-10-21 사용자, 리뷰).
- 호출 방식: argv를 만들어 `cli.Run`(2026-10-21 사용자, 리뷰).
- Codex 확인: 태스크 0·4에 한해 에이전트가 `codex exec`로 돌린다. AGENTS.md 모델 경계를 넘는 것을 사용자가 허락했다(2026-10-21 사용자, 리뷰).
