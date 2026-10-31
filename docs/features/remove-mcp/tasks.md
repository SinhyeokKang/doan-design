# remove-mcp — tasks

순서: PoC → eval이 셸로 닿게 하기 → CLI·문구 제거 → eval 시나리오 정리 → eval 라운드 → 문서 승격.

## T1. PoC: eval repo의 프로젝트 레이어 rule

- eval workspace의 repo에 `.codex/rules/doan.rules`(`codexRuleText()`와 같은 내용)를 넣고 R2를 Codex로 한 번 돌려 `doan active`가 가짜 앱에 닿는지 본다. 실제 HOME에는 쓰지 않는다.
- 검증: `npm --prefix app run package` 후 `node eval/run.ts --scenarios R2 --agents codex --round remove-mcp-poc`에서 `doan active` exit 0, R2-codex 통과. 결과를 design.md 'PoC 의존'에 적는다.

## T2. eval: Codex rule과 MCP 설정 제거 (`/tdd` → `/implement`)

- workspace가 rule 파일을 baseline 커밋에 넣는다(순수 함수: 경로와 내용). Claude `mcp.json` 작성, Codex MCP `-c` 설정, `scenario.ts`의 `mcp` 필드, transcript의 MCP 호출 인식, `known-conditions.ts`의 MCP·socket 조건(R1b, R2, O1, O2)을 지운다.
- 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test`가 `self-test PASS`, exit 0.

— commit: `test(eval): reach Doan through the shell with the Codex rule`

## T3. eval: MCP 전용 시나리오 정리

- R2b, R1b, D3, D3b, D10b를 지운다. R7을 셸 시나리오로 바꾼다(`mcp` 제거, rubric·checks·fixtures를 셸 `doan active`·`doan comments` 기준으로).
- 검증: `node eval/run.ts --self-test` PASS, `node --test 'eval/**/*.test.ts'`.

— commit: `test(eval): drop MCP-only scenarios`

## T4. CLI에서 MCP 제거

- `mcp.go`와 테스트, `run.go` 분기·help, `sessions.go`의 MCP 예외, `nextSteps`의 MCP 도구 이름. `go.mod`·`go.sum`에서 SDK 제거(`go mod tidy`, 사용자 요청 범위).
- 검증: `go test ./...`, `go vet ./...`, `go run ./cli/cmd/doan mcp --repo <tmp>`가 `usage_error`(AGENTS.md 'Commands'의 `go run ./cli/cmd/doan <command> [--repo <path>] [--json]`).

— commit: `refactor(cli): remove the MCP server`

## T5. 에이전트가 읽는 문구에서 MCP 제거

- guide `skill.md`(MCP 절, fallback 문장), stub `SKILL.md`, `PRESET_GUIDANCE`, preset 본문 19개와 `notices/MODIFICATIONS.md`, 앱의 MCP 문구(grep 결과를 하나씩 판정: ACP `mcpServers`·fixture 같은 프로토콜 데이터는 남긴다). 문구는 Doan `clarify` preset을 먼저 적용한다.
- MCP가 다시 들어오지 않게 하는 단언 테스트(guide, stub, `nextSteps`, preset 본문).
- 검증: `go test ./...`(출력 예산 포함), `npm --prefix app test`, `rg -n -i 'mcp' cli app/src eval`의 남은 결과를 하나씩 판정.

— commit: `feat(cli): point agents to the shell doan only`

## T6. `/agent-eval`

- 검증: `npm --prefix app run package` 후 `node eval/run.ts --self-test` PASS, `node eval/run.ts --round remove-mcp` 결과를 `docs/USABILITY-EVAL.md`에 기록하고 이 변경으로 생긴 새 issue 행이 없다. R2·O1·O2 Codex가 셸로 앱에 닿는다.

— commit: `docs(eval): remove-mcp round`

## T7. 문서 승격

- PRODUCT: §2, §3 In scope 3, §5 item 0·1·12, 세션 연결 문장, 'Open questions'(MCP 제거 항목은 feature 커밋 때 이미 지움). ARCHITECTURE: §5 삭제와 장 번호 참조, §4·§6·§7·§14의 MCP 문장. USABILITY-EVAL: MCP issue의 현재 상태. DIRECTORY: 지운 파일.
- 검증: `rg -n -i 'mcp' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DIRECTORY.md AGENTS.md README.md`의 남은 결과가 ACP `mcpServers` 같은 프로토콜 설명뿐이다.
- 마지막으로 `docs/features/remove-mcp/`(evidence.md 포함)를 지운다.

— commit: 문서별로 나눈다.
