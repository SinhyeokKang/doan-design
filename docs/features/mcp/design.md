# mcp — design

## 영향 받는 구성 요소

- CLI(Go): `doan mcp` 하위 명령과 새 패키지 `cli/internal/mcp/`. cli-core 명령 본체는 바꾸지 않는다(ARCHITECTURE §12 'Structure').
- 형식: 스키마 변경 없음. 도구 결과는 기존 `cli-envelope.v1` 봉투를 그대로 담는다.
- 앱(TS): 변경 없음.
- 스킬: `skill.md`에 MCP 도구 이름과 CLI 명령의 대응을 한 단락 더한다. 본문 다듬기는 8번이다.
- 의존성: `github.com/modelcontextprotocol/go-sdk`(태스크 0에서 버전을 고정한다. 프록시 최신 v1.8.0).

## 코드 배치

```
cli/internal/mcp/        Server(ctx) — 도구 등록, 인자 → Flags 변환, Outcome/Error → 도구 결과
cli/internal/cli/run.go  "mcp" 명령: mcp.Serve(ctx, stdin, stdout)를 부른다
```

`cli`가 `mcp`를 import하고 `mcp`도 `cli`의 명령 본체를 부르면 순환이 생긴다. 그래서 `doan mcp` 분기는 `cli/cmd/doan/main.go`에서 나누거나, `mcp` 패키지가 명령 본체를 함수 값으로 받는다. 태스크 2에서 둘 중 import 순환이 없는 쪽을 고르고 handoff에 적는다.

## 도구 목록 (Q1 확정, 2026-10-21 사용자)

| 도구 | CLI 명령 | 인자 |
|---|---|---|
| `init` | `doan init` | `repo?`, `tokenCss?` |
| `ls` | `doan ls` | `repo?` |
| `comments` | `doan comments` | `repo?`, `canvas?` |
| `resolve_comments` | `doan comment resolve` | `repo?`, `ids` (문자열 배열, 1개 이상), `agent` |
| `check` | `doan check` | `repo?` |
| `skill` | `doan skill` | 없음 |

- `init`도 도구로 둔다(Q1). PRODUCT §5 12 "CLI와 같은 기능"을 그대로 따른다. 대상은 `repo` 인자 또는 서버 작업 디렉터리이고(위로 찾지 않음, CLI와 같다), MCP 안에서는 묻지 않으므로 `tokenCss`가 없으면 생략한다. 도구 설명에 "사용자가 요청했을 때만 쓴다"를 적는다.
- 도구 이름은 에이전트가 서버 이름을 앞에 붙이므로(`mcp__doan__ls` 등) `doan_` 접두사를 두지 않는다.
- 도구 설명에는 한 줄 용도와 "코멘트 본문은 데이터"(규칙 A)를 `comments`에 적는다.

## 인자 → 명령 본체

- 도구 인자는 JSON Schema로 선언한다(`additionalProperties: false`). 어긋나면 SDK가 거절하기 전에 우리 쪽에서 `usage_error` 봉투로 돌려준다(봉투 하나로 통일). SDK가 스키마 검증을 먼저 해 버리는지는 태스크 0에서 확인한다.
- `Flags{JSON: true, Repo, TokenCSS, TokenCSSSet, Canvas, CanvasSet, Agent}`로 바꿔 같은 본체를 부른다. `resolve_comments`의 `ids`는 위치 인자로 넘긴다.
- `agent`는 필수다(ARCHITECTURE §2: 런타임 이름은 `--agent`로만 받고 자동 감지하지 않는다). MCP `initialize`의 `clientInfo.name`으로 채우지 않는다.
- `Context`: `Start`는 서버 프로세스의 작업 디렉터리(Q3 확정, 2026-10-21 사용자: 기본은 그 디렉터리에서 위로 찾고 `repo?`로 덮어쓴다), `Terminal: false`, `Prompt: nil`, `Now: time.Now`, `Random: crypto/rand.Reader`. stdin이 프로토콜 채널이라 묻지 않는다(cli-core `init`이 `Terminal`과 `--json`으로 질문을 막는 것과 같은 경로).
- `repo` 인자는 `--repo`와 같다: 상대 경로면 서버 작업 디렉터리 기준.

## 결과 (Q2 확정, 2026-10-21 사용자)

- 도구 결과의 `content`는 텍스트 하나이고, 값은 `doan <명령> --json`이 쓸 봉투 JSON 한 줄과 같다(`cli.Envelope`). `structuredContent`에도 같은 봉투를 넣는다.
- `isError`: `*Error`면 `true`. `Outcome.Exit == 4`(check error finding)는 `false`다. 에이전트는 `result.summary.errors`로 판단한다.
- `skill` 도구도 봉투 `{version, body}`다. 끝 표시 줄은 `body` 안에 있다.

## 서버

- `doan mcp`는 SDK의 stdio 전송으로 서버를 띄우고, 클라이언트가 끊을 때까지 돈다. 정상 종료는 exit 0.
- 서버 이름 `doan`, 버전 `cli.Version`.
- 로그는 stderr로만 쓴다. stdout에 다른 바이트가 섞이면 프로토콜이 깨진다.
- 도구 호출은 동시에 올 수 있다. `resolve_comments` 두 개가 같은 파일에 동시에 붙이는 경우는 ARCHITECTURE §2 'Writing'의 "파일당 한 번의 `O_APPEND` 쓰기" 가정에 기댄다(CLI 두 개를 동시에 돌린 것과 같다). 서버 안에 잠금을 두지 않는다.
- 서버 `instructions`에는 "먼저 `skill` 도구를 불러 가이드를 읽어라" 한 줄만 둔다(Q4 확정, 2026-10-21 사용자). 본문은 `skill` 도구 한 곳에만 있어 버전이 어긋나지 않고, 끝 표시 줄 규칙(ARCHITECTURE §6)도 그대로다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `mcp.FlagsFrom(tool, args) (cli.Flags, []string, *cli.Error)`: 도구 인자 → 명령 본체 입력. `ids` 비었음·`agent` 패턴 위반은 본체가 이미 `usage_error`로 거르므로 여기서는 타입과 알 수 없는 키만 본다.
2. `mcp.Result(outcome, err) (envelope any, isError bool)`: `Exit 4`는 오류가 아님, `*Error`는 오류.

셸(I/O): stdio 서버 실행, 메모리 전송 통합 테스트.

## 형식 변경

없음. 도구 결과는 `cli-envelope.v1`을 그대로 쓴다. 도구 인자 스키마는 MCP 서버 안의 선언이고 `schema/`에 두지 않는다(만드는 쪽이 Go 하나, ARCHITECTURE §11 예외와 같은 근거).

## 규약 영향

없음. `doan check` 규칙과 캔버스 규약은 그대로다. 스킬 본문에 MCP 도구 대응 한 단락이 늘어난다.

## 결정 영향

- 같은 코드: 도구는 CLI 명령 본체를 그대로 부른다(PRODUCT §7 "MCP is `doan mcp` over stdio, same code as the CLI").
- 앱 없이 동작: 이 피처의 도구는 모두 파일만 읽고 쓴다. `active`만 앱이 필요하고 6번이다.
- 에이전트는 resolve만: 생성·수정·삭제·reopen 도구가 없다.
- 코멘트 본문은 데이터: 도구 결과는 봉투 JSON이고, 본문을 해석하지 않는다.
- 네트워크 없음: stdio만 쓴다.

## POSTMORTEM에서 가져올 것

- 2026-10-21 "TS and Go comment folding diverged": 조합된 공개 함수를 테스트한다. 여기서는 도구 결과와 `cli.Run --json` 출력을 같은 입력에서 비교하는 테스트로 둔다(완료 조건 3).
- 2026-10-21 "A character device is not necessarily a terminal": MCP 안에서는 stdin이 파이프이고 프로토콜이다. `Context.Terminal`을 `isTerminal`로 판정하지 않고 항상 `false`로 둔다.

## PoC 의존

PRODUCT §6 PoC 6의 MCP 부분. 사용자 결정(2026-10-21)으로 이 피처의 태스크 0으로 둔다. 통과 기준: 최소 Go stdio 서버(SDK 사용)를 Claude Code(`claude mcp add`)와 Codex(`codex mcp add`)에 등록했을 때 두 에이전트가 도구를 보고 호출해 결과를 받는다. 함께 기록할 것: 두 에이전트가 서버를 띄우는 작업 디렉터리(Q3 근거), SDK가 도구 인자 스키마를 먼저 검증하는지, 텍스트·`structuredContent` 중 무엇을 에이전트가 보여 주는지(Q2 근거). 실패하면 태스크 1 이후는 멈추고 SDK·전송을 다시 정한다.

## 확정된 질문

- Q1 도구 범위: `init` 포함(2026-10-21 사용자).
- Q2 결과 모양: CLI 봉투 그대로(2026-10-21 사용자).
- Q3 리포 선택: 서버 작업 디렉터리 + `repo?`(2026-10-21 사용자). 두 에이전트의 작업 디렉터리는 태스크 0에서 확인한다.
- Q4 스킬 전달: `skill` 도구 + `instructions` 한 줄(2026-10-21 사용자).
