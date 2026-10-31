# remove-mcp — tasks

순서: PoC → eval이 셸로 닿게 하기 → eval 시나리오 정리 → eval의 doan MCP 배관 제거 → CLI·문구 제거 → 공유 gate → eval 라운드 → 문서 승격. eval이 셸 경로로 닿게 하는 일(T2)을 MCP fallback 문구 제거(T5·T6)보다 먼저 한다(U-014). `/runtime-test`는 생략한다(design.md '검증 범위').

## T1. PoC: eval repo의 프로젝트 레이어 rule (실제 에이전트 실행: `/agent-eval` 상시 예외 또는 사용자 허락)

- 실행 전에 실제 `~/.codex/rules/`에 `doan.rules`가 없음을 확인하고 기록한다. 있으면 사용자 레이어 rule 때문에 거짓 통과가 나오므로 멈추고 묻는다. Codex 실행의 `approval_policy` 값도 기록한다.
- 커밋하지 않는 임시 변경으로 R2 workspace의 repo에 `.codex/rules/doan.rules`(`codexRuleText()`와 같은 내용)를 넣는다(예: `eval/scenarios/R2/seed/.codex/rules/doan.rules`). Codex 호출에는 `-c approval_policy="never"`를 더한다. 끝나면 되돌린다. 실제 HOME에는 쓰지 않는다.
- 검증: `npm --prefix app run package` 후 `node eval/run.ts --scenarios R2 --agents codex --round remove-mcp-poc`에서 transcript의 `doan active`가 exit 0이고 R2-codex가 `pass`다. 실패하면 T2로 가지 않고 결과와 후보를 가지고 사용자에게 묻는다(design.md Q2). 결과를 design.md 'PoC 의존'에 적는다.

— commit: `docs(feature): remove-mcp PoC result`

## T2. eval: workspace baseline의 Codex rule (`/tdd` → `/implement`)

- 모든 workspace repo의 baseline 커밋에 `.codex/rules/doan.rules`를 넣는다. 내용은 `codexRuleText()`를 `registerHooks` resolver로 import한다. Codex 실행에 `-c approval_policy="never"`를 고정한다. `known-conditions.ts`에서 R2·O1·O2 항목을 지운다.
- 순수 함수 테스트: rule 파일 경로와 baseline 포함 여부(Claude·Codex workspace 모두).
- 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test`가 `self-test PASS`, exit 0.

— commit: `test(eval): reach Doan through the shell with a project Codex rule`

## T3. eval: MCP 전용 시나리오 정리

- R2b, R1b, D3, D3b, D10b, R7을 지우고 R7b를 셸 시나리오로 만든다(`doan active`·`doan comments` 기준 rubric·checks·fixtures, `inspect.ts`는 R2의 것). `known-conditions.ts`의 R1b 항목을 지운다.
- 지운 id를 쓰는 곳을 고친다: `agent.test.ts:128,174`, `scenario.test.ts:43-54`, `regression.test.ts`, `audit.test.ts`, `record.test.ts`, `D1/presets.ts:16-33`의 `transport: "mcp"`. D4·D4b 제목과 rubric의 "nor MCP"를 지운다.
- 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS·exit 0, `rg -n 'R1b|R2b|D3b?\b|D10b|\bR7\b' eval`의 남은 결과가 없다.

— commit: `test(eval): drop MCP-only scenarios`

## T4. eval: doan MCP 배관 제거

- `workspace.ts`의 Claude `mcp.json` 작성, `agent.ts`의 Codex `mcp_servers.doan` 설정과 시나리오별 MCP 등록, `scenario.ts`의 `mcp` 필드, transcript의 `mcpDesignSkillIds`·`mcpInvoked`를 지운다. Claude `--strict-mcp-config`와 일반 `mcp__*` 인식은 남긴다(design.md Q5). Codex 쪽 일반 격리가 필요한지 판정해 적는다.
- 검증: `node --test 'eval/**/*.test.ts'`(`agent.test.ts`가 `--strict-mcp-config`를 계속 단언), `node eval/run.ts --self-test` PASS·exit 0.

— commit: `test(eval): remove the doan MCP wiring`

## T5. CLI에서 MCP 제거

- `mcp.go`·`mcp_test.go`·`mcp_config_test.go`를 지운다. 다른 테스트 8개에서는 MCP 쪽 단언만 지우고 CLI 단언은 남긴다(design.md 'CLI'). `run_test.go`의 `TestMCP…`를 지우고 `doan mcp`가 `usage_error`로 바로 끝나는 테스트를 더한다. `run.go` 분기·help, `run()`의 `recordSessions` 인자, `nextSteps`의 MCP 도구 이름, 공유 fixture `design-skill/cases.json`·`onboarding/mapping.json`의 MCP 부분.
- `go.mod`·`go.sum`에서 SDK를 뺀다(`go mod tidy`; AGENTS.md 'Commands'에 없는 명령이다).
- 복구 순서 단언 테스트(design.md '순수 함수').
- 검증:
  - `go test ./...`, `go vet ./...`.
  - `go run ./cli/cmd/doan mcp --repo <tmp> --json`이 `usage_error` envelope를 낸다. `--json` 없이 stdin을 열어 둔 채(`go run ./cli/cmd/doan mcp` 단독) 실행해도 바로 exit 2로 끝난다.
  - `git diff go.mod go.sum`에서 SDK와 그 간접 의존성이 빠지고, `x/sys`·`x/text`가 직접 의존성으로 옮겨 가는 것 말고는 버전 변화가 없다.

— commit: `refactor(cli)!: remove the MCP server`

## T6. 에이전트와 사람이 읽는 문구에서 MCP 제거

- guide `skill.md`(:55, :68, :74, 'MCP tools' 절, `design_skill_test.go:291`), stub `SKILL.md`와 `stub.test.ts`, `PRESET_GUIDANCE`와 주석, preset 본문 19개와 `notices/MODIFICATIONS.md`·`SOURCES.md:65`, Hand off 지시문(`projection.ts:79`, `projection.test.ts:67`, `eval/scenarios/H6|H7/prompt.md`), brand(`candidates.ts`, `brand_test.go`, `schema/fixtures/brand/cases.json`), MCP를 말하는 코드 주석(design.md '코드 주석'). ACP `mcpServers`·`mcpToolCall`·fixture 같은 프로토콜 데이터는 남긴다. 문구는 Doan `clarify` preset을 먼저 적용한다.
- MCP가 다시 들어오지 않게 하는 단언 테스트(guide, stub, `nextSteps`, preset 본문, Hand off 지시문).
- 검증: `go test ./...`(출력 예산 포함), `npm --prefix app test`, `npm --prefix app run typecheck`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS, `rg -n -i 'mcp' cli app/src eval schema`의 남은 결과를 하나씩 판정해 프로토콜 데이터·일반 격리·과거 fixture만 남는다.

— commit: `feat(cli): point agents to the shell doan only`

## T7. 공유 gate

- 검증: `node .agents/skills/verify/scripts/verify.mjs --eval`가 exit 0.

## T8. `/agent-eval`

- 검증: `npm --prefix app run package` 후 `node eval/run.ts --self-test` PASS, `node eval/run.ts --round remove-mcp` 결과를 `docs/USABILITY-EVAL.md`에 기록한다. R2·O1·O2 Codex가 `pass`이고 `summary.md`에 known-condition 표시가 없으며, 이 변경으로 생긴 새 issue 행이 없다.

— commit: `docs(eval): remove-mcp round`

## T9. 문서 승격

- design.md '결정 영향'의 목록을 모두 고친다: PRODUCT, ARCHITECTURE(§5 삭제, 번호는 다시 매기지 않음, "The shell path skips approval in Codex"를 §7 'Agent setup'으로, §14의 일반 MCP 격리·`shellCli`·지운 시나리오 id·H6/H7 예외), README, DESIGN, DIRECTORY, AGENTS.md, `.agents/skills`, USABILITY-EVAL의 MCP issue 현재 상태.
- 검증:
  - `rg -n -i 'mcp' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/DIRECTORY.md AGENTS.md README.md .agents/skills`의 남은 결과가 ACP `mcpServers`나 eval의 일반 MCP 격리처럼 Doan MCP가 아닌 설명뿐이다.
  - `rg -n 'R1b|R2b|D3b?\b|D10b|\bR7\b' docs/ARCHITECTURE.md docs/DIRECTORY.md .agents/skills`의 결과가 없다(USABILITY-EVAL·POSTMORTEM의 과거 기록은 제외).
- 마지막으로 `docs/features/remove-mcp/`(evidence.md 포함)를 지운다.

— commit: 문서별로 나눈다.
