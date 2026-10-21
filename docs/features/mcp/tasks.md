# mcp — tasks

명령: 검증은 AGENTS.md 'Commands'의 `go test ./...`·`go vet ./...`·`go run ./cli/cmd/doan`으로 한다. 다음은 'Commands'에 없어 **명령 미정 — 사용자 확인 필요**다.

- 의존성 추가 `go get github.com/modelcontextprotocol/go-sdk@<버전>`(네트워크 필요)
- 에이전트 등록: `claude mcp add --scope local doan -- <바이너리> mcp`, `codex mcp add doan -- <바이너리> mcp`와 해제(`claude mcp remove`, `codex mcp remove`). 사용자 설정을 바꾸므로 끝나면 해제한다.

브랜치: 태스크 0은 `.scratch/` 실험과 PRODUCT §6 기록뿐이므로 main에서 한다(문서 커밋만). 1~4는 `/ship bypass` 또는 `/orchestrate`로 `feat-mcp` 브랜치에서 하고 PR 하나로 끝낸다.

- [ ] **0. PoC 6 MCP 부분** (main, 코드 커밋 없음)
  - `.scratch/poc6-mcp/`에 SDK로 도구 하나(`ping` → 고정 문자열)를 내는 stdio 서버를 만든다. 리포의 `go.mod`를 건드리지 않도록 `.scratch/` 안에 별도 모듈을 둔다.
  - Claude Code와 Codex에 등록하고, 각 에이전트에서 도구 목록에 보이는지·호출 결과가 돌아오는지 확인한다. 서버가 `os.Getwd()`와 받은 인자를 stderr 로그 파일에 남겨 작업 디렉터리를 기록한다.
  - 같이 볼 것: SDK가 도구 인자 스키마 위반을 먼저 거절하는지, `structuredContent`와 텍스트 중 에이전트가 무엇을 쓰는지.
  - 검증: 두 에이전트에서 호출 결과를 받았다는 관찰을 PRODUCT §6 PoC 6 아래에 날짜·SDK 버전·에이전트 버전과 함께 적는다. 실패하면 여기서 멈추고 보고한다.
  - 등록을 해제한다.
  - 커밋: `docs(product): record PoC 6 MCP results`.
- [ ] **1. 인자 변환과 결과 변환** (순수)
  - `mcp.FlagsFrom`: 도구마다 정상 인자 → `Flags`·위치 인자, 알 수 없는 키·타입 오류 → `usage_error`, `canvas` 있음 → `CanvasSet`, `tokenCss` 있음 → `TokenCSSSet`, `ids` 순서 보존.
  - `mcp.Result`: 성공 → `isError: false`, `*Error` → `true`, `Exit 4` → `false`. 봉투가 `ValidateEnvelope`를 통과한다.
  - 검증: `go test ./...` 초록, `go vet ./...` 깨끗.
  - 커밋: `test(mcp): pin argument and result mapping` → `feat(mcp): ...`.
- [ ] **2. 서버와 `doan mcp`** (I/O)
  - 의존성 추가(명령 미정 — 위). 버전은 태스크 0에서 쓴 것.
  - SDK 메모리 전송 통합 테스트: `tools/list`의 이름과 인자 스키마, 도구마다 성공 한 번과 실패 한 번, 같은 임시 리포에서 도구 결과 봉투 = `cli.Run(... --json)` 출력(deep-equal), check error finding → `isError: false`, 서버가 stdout에 프로토콜 밖 바이트를 쓰지 않음.
  - `doan mcp --foo`·`doan mcp x` → `usage_error` exit 2.
  - 검증: `go test ./...` 초록, `go vet ./...` 깨끗, `go run ./cli/cmd/doan mcp`를 실행해 stdin에 `initialize`·`tools/list` JSON-RPC 줄을 넣으면 도구 목록이 나온다.
  - 커밋: `test(mcp): ...` → `feat(mcp): ...`.
- [ ] **3. 스킬 본문**
  - `skill.md`에 MCP 도구와 CLI 명령의 대응 표, `resolve_comments`의 `agent` 예를 더한다.
  - 테스트: 본문에 도구 이름 여섯 개가 있다.
  - 검증: `go test ./...` 초록.
  - 커밋: `test(cli): ...` → `feat(cli): ...`.
- [ ] **4. 실제 에이전트 확인** (수동)
  - 빌드한 `doan`을 Claude Code와 Codex에 `doan mcp`로 등록하고, 빈 임시 디렉터리에서 `init`, 그 리포에서 `ls`·`comments`·`check`·`resolve_comments`·`skill`을 한 번씩 호출해 결과를 handoff에 적는다. 끝나면 등록을 해제한다.
  - 검증: 수동 관찰(명령 미정 — 위).
- [ ] **5. 승격과 정리**
  - ARCHITECTURE §5: 도구 목록, 인자, 결과 모양(`isError` 규칙), `Context`(묻지 않음), 리포 선택, 동시 호출 가정, 서버 `instructions`.
  - ARCHITECTURE §8: 의존성 `github.com/modelcontextprotocol/go-sdk`와 버전, "기억에 기댄" 문장을 확인된 사실로 바꾼다.
  - ARCHITECTURE §6: 스킬 본문의 MCP 대응.
  - PRODUCT §6: PoC 6을 MCP 부분(통과)과 소켓 부분(6번 앞)으로 나눠 적는다. PRODUCT §7: PoC 6 MCP 부분을 이 피처의 태스크 0으로 둔 결정(2026-10-21 사용자)과 이 피처의 Q1~Q4 결정.
  - `docs/DIRECTORY.md`: `cli/internal/mcp/`.
  - 검증: 지우기 전에 grep으로 ARCHITECTURE에 도구 이름 여섯 개와 `isError`가 있는지 확인. 그 뒤 `docs/features/mcp/`가 없다.
  - 커밋: 문서별 `docs(architecture):`·`docs(product):`·`docs:` → `docs(feature): remove mcp feature docs after promotion`.
