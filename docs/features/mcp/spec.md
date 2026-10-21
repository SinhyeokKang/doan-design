# mcp — spec

MVP 피처 3번(PRODUCT §5 피처 분할). `doan mcp`가 stdio MCP 서버로 돌고, cli-core의 명령 본체를 MCP 도구로 내보낸다(PRODUCT §5 12, ARCHITECTURE §5).

## 사용자

- **에이전트**(Claude Code·Codex): 셸 명령 대신 MCP 도구로 캔버스 목록, open 코멘트, 검사 결과를 읽고 적용한 코멘트를 resolve한다. 도구 결과는 CLI의 `--json` 봉투와 같은 내용이라 스킬 설명이 하나로 충분하다.
- **사람**: 직접 쓰지 않는다. 8번 `onboard-dist`의 온보딩 2단계가 에이전트에 MCP를 등록한다. 이 피처에서는 사람이 손으로 등록해 확인한다.

## 문제

- PRODUCT §3 In scope 3(Deliver)은 CLI·MCP·스킬로 전달한다고 정했지만 MCP 서버가 없다. cli-core는 명령 본체를 `(Outcome, *Error)`로 분리해 두었을 뿐 감싸는 쪽이 없다.
- PRODUCT §6 PoC 6의 MCP 부분("`doan mcp`가 Claude Code와 Codex에 도구로 보인다")이 검증되지 않았다. ARCHITECTURE §8은 공식 MCP Go SDK가 있다고 "기억에 기대어" 적었다. 프록시로 확인한 최신은 `github.com/modelcontextprotocol/go-sdk` v1.8.0(2026-09-04, `go 1.25.0`)이다.

## 완료 조건

1. **PoC 6 MCP 부분**(태스크 0): `.scratch/`의 최소 Go 서버를 Claude Code와 Codex에 stdio로 등록하면, 두 에이전트가 도구 목록에서 그 도구를 보고 호출해 결과를 받는다. 두 에이전트가 서버를 띄울 때의 작업 디렉터리를 기록한다. 결과는 PRODUCT §6에 날짜와 함께 적는다.
2. **`doan mcp`**: 같은 바이너리의 하위 명령이다. stdin·stdout은 MCP 프로토콜만 쓰고, 로그는 stderr로만 보낸다. 다른 플래그나 위치 인자가 오면 `usage_error`(exit 2)로 끝난다.
3. **도구**: 아래 '도구 목록'의 도구가 `tools/list`에 나오고, 각 도구는 같은 이름의 CLI 명령 본체를 부른다. 같은 입력에서 도구 결과의 봉투는 `doan <명령> --json` 출력과 deep-equal이다.
4. **실패**: 명령 본체가 `*Error`를 돌려주면 도구 결과의 `isError`가 `true`이고 봉투는 `ok: false`다. `doan check`가 error finding을 내면 `isError`는 `false`이고 `ok: true`다(ARCHITECTURE §12 exit 4와 같다). 도구 인자가 스키마에 어긋나면 `usage_error` 봉투다.
5. **묻지 않음**: MCP 안에서는 stdin이 프로토콜 채널이므로 어떤 도구도 사람에게 묻지 않는다.
6. **테스트**: SDK의 메모리 전송으로 서버와 클라이언트를 이어, 도구 목록과 도구마다 성공·실패 한 번씩을 Go 테스트로 확인한다(`go test ./...`). 봉투는 `formats.ValidateEnvelope`를 통과한다.
7. `go vet ./...`가 깨끗하다.

## 비목표

- `active` 도구, `runtime.json`, 유닉스 소켓 — 6번 `select-inspect`(PoC 6의 소켓 부분도 그때 한다).
- 에이전트에 MCP를 자동 등록하는 일 — 8번 `onboard-dist`(온보딩 2단계).
- HTTP·SSE 전송, 인증. stdio만 둔다(ARCHITECTURE §5).
- MCP 리소스·프롬프트. 도구만 둔다.
- 코멘트 생성·수정·삭제·reopen 도구 — 에이전트는 resolve만 한다(PRODUCT §5).
