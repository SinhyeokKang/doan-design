# mcp — tasks

명령: 검증은 AGENTS.md 'Commands'의 `go test ./...`·`go vet ./...`·`go run ./cli/cmd/doan`으로 한다. 다음은 'Commands'에 없어 **명령 미정 — 사용자 확인 필요**다.

- 의존성 추가 `go get github.com/modelcontextprotocol/go-sdk@<버전>`(네트워크 필요)
- 에이전트 일회성 등록(사용자 전역 설정을 바꾸지 않는다). 서버 이름은 기존 등록과 겹치지 않게 `doan-poc6`(태스크 0)·`doan-mcp-check`(태스크 4)처럼 고유하게 준다.
  - Claude Code: `claude -p --mcp-config <tmp.json> --strict-mcp-config "<프롬프트>"`
  - Codex: `codex exec -c 'mcp_servers.<이름>.command="<바이너리>"' -c 'mcp_servers.<이름>.args=["mcp"]' "<프롬프트>"`
- Codex 호출: 태스크 0·4에 한해 에이전트가 `codex exec`로 돌린다(AGENTS.md 모델 경계, 2026-10-21 사용자 허락).

브랜치: 태스크 0은 `.scratch/` 실험과 PRODUCT §6 기록뿐이므로 main에서 한다(문서 커밋만). 1~5는 `/orchestrate` 한 번으로 `feat-mcp` 브랜치에서 하고 PR 하나로 끝낸다(승격 문서도 같은 PR).

- [ ] **0. PoC 6 MCP 부분** (main, 코드 커밋 없음 · 완료 조건 1)
  - `.scratch/poc6-mcp/`에 SDK로 도구 하나(`ping` → 고정 문자열, 같은 값을 `structuredContent`에도)를 내는 stdio 서버를 만든다. 리포의 `go.mod`를 건드리지 않도록 `.scratch/` 안에 별도 모듈을 둔다. 서버는 `os.Getwd()`와 받은 인자를 stderr 로그 파일에 남긴다.
  - 시작 전과 끝난 뒤에 `claude mcp list`·`codex mcp list` 출력이 같은지 본다(일회성 설정이 전역에 남지 않았는지).
  - Claude Code와 Codex를 이 리포 디렉터리에서 일회성 설정으로 띄워 `ping`이 도구 목록에 보이는지, 호출 결과가 돌아오는지 확인한다.
  - 검증: PRODUCT §6 PoC 6 아래에 다음을 날짜·SDK 버전·에이전트 버전과 함께 적는다. 하나라도 비면 통과가 아니다.
    - 두 에이전트에서 호출 결과를 받았는지
    - 두 에이전트가 서버를 띄운 작업 디렉터리
    - 텍스트와 `structuredContent` 중 에이전트가 무엇을 보여 주는지
  - 멈춤 조건: 호출이 실패하면 여기서 멈추고 보고한다. 작업 디렉터리가 프로젝트 디렉터리가 아니면 멈추고 Q3를 다시 묻는다.
  - 커밋: `docs(product): record PoC 6 MCP results`.
- [ ] **1. 인자 → argv** (순수 · 완료 조건 3, 4)
  - `argv(tool, raw)`: 도구마다 정상 인자 → argv, `nil` 인자 → `{}`와 같음, 알 수 없는 키·타입 오류 → `usage_error`, 상대 `repo` → `usage_error`, `canvas`·`tokenCss`가 빈 문자열이어도 `--canvas=`·`--token-css=`로 넘김, `ids` 순서 보존, `-`로 시작하는 id는 `--` 뒤에 둠, 모든 argv 끝에 `--json`이 있음.
  - 검증: `go test ./...` 초록, `go vet ./...` 깨끗.
  - 커밋: `test(cli): pin mcp argument to argv mapping` → `feat(cli): map mcp tool arguments to cli argv`.
- [ ] **2. 서버와 `doan mcp`** (I/O · 완료 조건 2, 3, 4, 5, 6, 8, 9)
  - 의존성 추가(명령 미정 — 위). 버전은 태스크 0에서 쓴 것.
  - 비교용 fixture 리포: 캔버스 `foo`와 `foo-bar`, `doan:width`가 없는 캔버스, 빈 캔버스, 알 수 없는 `v` 줄, union 병합 뒤처럼 같은 `id`의 이벤트가 두 줄인 코멘트 파일, 열린 코멘트 둘 이상.
  - SDK 메모리 전송 통합 테스트:
    - `tools/list`의 이름이 정확히 여섯이고, 인자 스키마가 design의 표와 같다. 서버 `instructions`가 한 줄이다.
    - 같은 리포 상태에서 도구 결과 봉투 = `cli.Run(... --json)` 출력(파싱한 JSON 비교). 읽기 도구(`ls`·`comments`·`check`·`skill`)는 fixture 하나에서, `resolve_comments`는 같은 내용의 사본 두 개에서, `init`은 빈 디렉터리 두 개에서 `result.repo`를 정규화해 비교한다.
    - 도구별 실패: `ls`·`check`는 `repo`가 없고 작업 디렉터리 위로 `.doan`이 없음 → `repo_not_found`, `comments`는 없는 `canvas` → `canvas_not_found`, `resolve_comments`는 `ids: []`·잘못된 `agent` → `usage_error`, 없는 id → `comment_not_found`, `init`은 리포 밖 `tokenCss` → `usage_error`, 모든 도구에서 알 수 없는 키·상대 `repo` → `usage_error`. 각각 `isError: true`.
    - check error finding → `isError: false`, `ok: true`.
    - 이미 초기화된 리포에 `init` → `initialized: false`. `tokenCss` 없는 `init` → 묻지 않고 `tokenCss` 없는 설정.
    - 알 수 없는 도구 이름 → JSON-RPC 오류(봉투 아님).
    - 같은 파일의 서로 다른 id 두 개에 `resolve_comments`를 동시에 → 둘 다 resolved, 접은 결과에 `invalid_event` 없음.
    - 봉투는 `formats.ValidateEnvelope`를 통과한다.
  - `cli.Run` pipe 테스트: stdin·stdout을 `io.Pipe`로 넘겨 `["mcp"]`를 돌리고 `initialize`·`notifications/initialized`·`tools/list`를 보낸 뒤 stdin을 닫는다. stdout의 모든 줄이 JSON-RPC로 파싱되고, exit 0이다.
  - `doan mcp --foo`·`doan mcp --json`·`doan mcp --repo x`·`doan mcp x` → `usage_error` exit 2. `doan help` 출력에 `mcp`가 있다.
  - 검증: `go test ./...` 초록, `go vet ./...` 깨끗, `go run ./cli/cmd/doan mcp`의 stdin에 위 JSON-RPC 세 줄을 넣고 응답을 받은 뒤 stdin을 닫으면 `result.tools`의 이름이 정확히 `init`·`ls`·`comments`·`resolve_comments`·`check`·`skill` 여섯이다.
  - 커밋: `test(cli): pin mcp tool list, envelope parity and stdio exit` → `feat(cli): serve cli commands over mcp stdio`.
- [ ] **3. 스킬 본문** (완료 조건 7)
  - `skill.md`에 MCP 도구와 CLI 명령의 대응 표, `resolve_comments`의 `agent` 예, "`nextSteps`는 CLI 명령을 말하므로 표로 도구에 대응시켜라"를 더한다.
  - 테스트: 본문에 대응 표의 행(예: `` `resolve_comments` ``와 `doan comment resolve`가 같은 행), `agent`를 넣은 `resolve_comments` 예, `nextSteps` 대응 문장이 있다. 바꾸기 전에는 빨갛다.
  - 검증: `go test ./...` 초록.
  - 커밋: `test(cli): require mcp mapping in skill body` → `feat(cli): document mcp tools in skill body`.
- [ ] **4. 실제 에이전트 확인** (수동 · 완료 조건 10)
  - 빌드한 `doan`을 Claude Code와 Codex에 일회성 설정(`doan mcp`)으로 등록한다. 시작 전과 끝난 뒤의 `claude mcp list`·`codex mcp list`가 같아야 한다.
  - 모든 호출에 임시 디렉터리의 절대 경로를 `repo`로 넘긴다(이 리포에 쓰지 않도록). 순서: `init` → 캔버스 하나와 그 캔버스의 열린 코멘트 한 줄을 미리 넣는다 → `ls`·`comments`·`check`·`resolve_comments`·`skill`.
  - 검증(명령 미정 — 위): 두 에이전트에서 모든 도구가 `ok: true`이고, `resolve_comments`의 `resolved`에 그 id가 있고, 코멘트 JSONL에 `resolve` 이벤트가 한 줄 늘고 `by.name`이 넘긴 `agent`와 같다. 결과를 handoff에 적는다.
- [ ] **5. 승격과 정리** (`feat-mcp`, 같은 PR)
  - ARCHITECTURE §5: 도구 목록, 인자, 결과 모양(`isError` 규칙), argv로 `cli.Run`을 부르는 방식, 묻지 않음, 리포 선택(절대 `repo`), 동시 호출 가정, 서버 `instructions`, 저수준 `AddTool`과 `IOTransport`.
  - ARCHITECTURE §12: 명령 목록에 `doan mcp`(모든 플래그 거절, `--json` 예외, `emit` 생략과 종료 코드), usage. 'Structure'의 "`doan mcp`가 같은 본체를 감싼다"를 "`cli.Run`을 감싼다"로 고친다.
  - ARCHITECTURE §13: MCP의 `repo`는 절대 경로만 받는다.
  - ARCHITECTURE §8: 의존성 `github.com/modelcontextprotocol/go-sdk`와 버전, 함께 들어온 간접 의존성 목록. "기억에 기댄" 문장을 확인된 사실로 바꾼다.
  - ARCHITECTURE §6: 스킬 본문의 MCP 대응과 `nextSteps` 안내.
  - PRODUCT §6: PoC 6을 MCP 부분(통과)과 소켓 부분(6번 앞)으로 나눠 적는다.
  - PRODUCT §7: PoC 6 MCP 부분을 이 피처의 태스크 0으로 둔 결정, Q1~Q4, `agent`를 `clientInfo`로 채우지 않음, `repo` 절대 경로만, 태스크 0·4의 Codex 호출 허락(모두 2026-10-21 사용자).
  - `docs/DIRECTORY.md`: `cli/internal/cli/`에 MCP 서버(`mcp.go`)를 더한다.
  - AGENTS.md 'Commands': 의존성 추가나 일회성 등록 명령이 굳어졌으면 더한다.
  - 검증: 지우기 전에 grep으로 ARCHITECTURE에 도구 이름 여섯 개와 `isError`가 있는지 확인. 그 뒤 `docs/features/mcp/`가 없다.
  - 커밋: 문서별 `docs(architecture): promote mcp decisions`·`docs(product): record mcp decisions`·`docs: list mcp server in directory layout` → `docs(feature): remove mcp feature docs after promotion`.
