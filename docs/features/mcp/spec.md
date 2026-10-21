# mcp — spec

MVP 피처 3번(PRODUCT §5 피처 분할). `doan mcp`가 stdio MCP 서버로 돌고, cli-core의 명령을 MCP 도구로 내보낸다(PRODUCT §5 12, ARCHITECTURE §5).

## 사용자

- **에이전트**(Claude Code·Codex): 셸 명령 대신 MCP 도구로 캔버스 목록, open 코멘트, 검사 결과를 읽고 적용한 코멘트를 resolve한다. 도구 결과는 CLI의 `--json` 봉투와 같아서 봉투와 종료 규칙은 스킬에 한 번만 설명하면 된다(도구와 명령의 대응만 더한다).
- **사람**: 직접 쓰지 않는다. 8번 `onboard-dist`의 온보딩 2단계가 에이전트에 MCP를 등록한다. 이 피처에서는 등록을 일회성 설정으로 해서 확인한다.

## 문제

- PRODUCT §1 문제 1: 런타임에 따라 에이전트가 디자인 초안에 닿지 못한다. PRODUCT §3 In scope 3(Deliver)은 CLI·MCP·스킬로 전달한다고 정했지만 MCP 서버가 없어서, 셸보다 MCP 도구를 먼저 쓰는 에이전트에게 닿는 길이 하나 비어 있다.
- cli-core는 명령 본체를 `(Outcome, *Error)`로 분리해 두었을 뿐 MCP로 감싸는 쪽이 없다.
- PRODUCT §6 PoC 6의 MCP 부분("`doan mcp`가 Claude Code와 Codex에 도구로 보인다")이 검증되지 않았다. ARCHITECTURE §8은 공식 MCP Go SDK가 있다고 "기억에 기대어" 적었다. 프록시로 확인한 최신은 `github.com/modelcontextprotocol/go-sdk` v1.8.0(2026-09-04, `go 1.25.0`)이고, 리포의 `go 1.27.0`과 맞는다.

## 도구 목록

| 도구 | CLI 명령 | 인자 |
|---|---|---|
| `init` | `doan init` | `repo?`, `tokenCss?` |
| `ls` | `doan ls` | `repo?` |
| `comments` | `doan comments` | `repo?`, `canvas?` |
| `resolve_comments` | `doan comment resolve` | `repo?`, `ids` (문자열 배열, 1개 이상), `agent` |
| `check` | `doan check` | `repo?` |
| `skill` | `doan skill` | 없음 |

## 확정된 결정 (2026-10-21 사용자)

- Q1 도구 범위: `init`을 포함한다. 도구 설명에 "사용자가 요청했을 때만 쓰고, 토큰 CSS 경로를 먼저 사용자에게 묻는다"를 적는다.
- Q2 결과 모양: CLI 봉투를 그대로 쓴다.
- Q3 리포 선택: 서버 작업 디렉터리를 기본으로 하고 `repo?`로 덮어쓴다. `repo`는 절대 경로만 받는다(상대 경로는 `usage_error`). `repo`가 없는 `init`은 CLI와 같이 서버 작업 디렉터리에 만든다.
- Q4 스킬 전달: `skill` 도구와 서버 `instructions` 한 줄.
- `agent`는 필수다. MCP `initialize`의 `clientInfo.name`으로 채우지 않는다(ARCHITECTURE §2).

## 완료 조건

1. **PoC 6 MCP 부분**(태스크 0): `.scratch/`의 최소 Go 서버를 Claude Code와 Codex에 stdio로 등록하면, 두 에이전트가 도구 목록에서 그 도구를 보고 호출해 결과를 받는다. 두 에이전트가 서버를 띄울 때의 작업 디렉터리, 텍스트와 `structuredContent` 중 에이전트가 무엇을 쓰는지를 PRODUCT §6에 날짜와 함께 적는다.
2. **`doan mcp`**: 같은 바이너리의 하위 명령이다. stdin·stdout은 MCP 프로토콜만 쓴다. stderr에는 기동 실패와 전송 실패만 쓴다. `-h`·`--help`(ARCHITECTURE §12대로 usage, exit 0)를 빼고 `--json`·`--repo`를 포함한 모든 플래그와 위치 인자는 `usage_error`(exit 2)로 끝난다. 클라이언트가 stdin을 닫으면 exit 0으로 끝난다.
3. **도구**: 위 '도구 목록'의 여섯 도구가 정확히 `tools/list`에 나오고, 각 도구는 대응하는 CLI 명령을 부른다. 같은 리포 상태에서 도구 결과의 봉투는 `doan <명령> --json` 출력과 파싱한 JSON으로 같다. 리포를 바꾸는 도구(`init`, `resolve_comments`)는 같은 내용의 리포 사본 두 개에서 비교한다.
4. **실패**: 명령이 `*Error`를 돌려주면 도구 결과의 `isError`가 `true`이고 봉투는 `ok: false`다. `doan check`가 error finding을 내면 `isError`는 `false`이고 `ok: true`다(ARCHITECTURE §12 exit 4와 같다). 도구 인자가 스키마에 어긋나거나 `repo`가 상대 경로면 우리 핸들러가 검사해 `usage_error` 봉투와 `isError: true`를 돌려준다.
5. **묻지 않음**: `tokenCss` 없이 `init` 도구를 부르면 묻지 않고 `tokenCss` 없는 설정을 만들며, stdout에 프로토콜 밖 바이트가 없다.
6. **서버 안내**: 서버 `instructions`는 "먼저 `skill` 도구를 불러 가이드를 읽어라" 한 줄이다.
7. **스킬 본문**: `skill.md`에 도구와 CLI 명령의 대응 표, `resolve_comments`의 `agent` 예, "`nextSteps`는 CLI 명령을 말하므로 표로 도구에 대응시켜라"가 있다.
8. **테스트**: SDK의 메모리 전송으로 서버와 클라이언트를 이어, 도구 목록과 도구마다 성공·실패 사례를 Go 테스트로 확인한다(`go test ./...`). 봉투는 `formats.ValidateEnvelope`를 통과한다.
9. `go vet ./...`가 깨끗하다.
10. **실제 에이전트**(태스크 4): 빌드한 `doan mcp`를 Claude Code와 Codex에 일회성 설정으로 등록하고, 여섯 도구를 한 번씩 불러 결과를 받는다.

## 비목표

- `active` 도구, `runtime.json`, 유닉스 소켓 — 6번 `select-inspect`(PoC 6의 소켓 부분도 그때 한다).
- 에이전트에 MCP를 자동 등록하는 일 — 8번 `onboard-dist`(온보딩 2단계).
- HTTP·SSE 전송, 인증. stdio만 둔다(ARCHITECTURE §5).
- MCP 리소스·프롬프트. 도구만 둔다.
- MCP elicitation·sampling·서버발 notification. 사람에게 묻거나 에이전트를 깨우는 길은 두지 않는다(PRODUCT §3 Out of scope 3 Conversation, 4 Waking the agent).
- 코멘트 생성·수정·삭제·reopen 도구 — 에이전트는 resolve만 한다(PRODUCT §5).
