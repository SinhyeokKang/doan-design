# remove-mcp — design

## 영향 받는 구성 요소

- **CLI (Go)**: `cli/internal/cli/mcp.go`와 `mcp_test.go`·`mcp_config_test.go`를 지운다. `run.go`의 `mcp` 분기, help, MCP 전용 세션 기록 예외(`sessions.go`), `init` 등의 `nextSteps`에 있는 MCP 도구 이름을 지운다. `go.mod`·`go.sum`에서 `github.com/modelcontextprotocol/go-sdk`를 뺀다(go mod tidy).
- **guide `cli/internal/cli/skill.md`**: MCP 절과 "Without the shell CLI, use MCP …" 문장, 복구 단계의 MCP fallback을 지운다. 출력 예산 테스트(`skillOutputBudget`) 안에 있어야 한다.
- **design preset 본문** (`cli/internal/designskill/presets/*.md` 19개): "or the MCP `design_skill` tool …" 같은 MCP 대안 문장을 지운다. 본문은 Impeccable 각색본이라 `notices/MODIFICATIONS.md`의 수정 기록을 맞춘다.
- **stub** `app/src/main/onboarding/SKILL.md`: "neither the shell nor MCP" 문장을 셸 한 경로로 줄인다. `stub.test.ts`의 단언과 20줄 제한.
- **앱**: `PRESET_GUIDANCE`의 "do not suggest MCP"(앱 대화 프로필에는 MCP가 없으므로 이 금지문 자체가 필요 없다), `acpRunner.ts`의 `mcpServers: []`는 ACP 프로토콜 필드라 남긴다. `brand/candidates.ts`, onboarding 문구, `agentAuthView.ts` 등은 grep 결과를 하나씩 판정한다(ACP의 `mcpServers`, Copilot·Cursor fixture처럼 프로토콜 데이터는 남긴다).
- **eval**: MCP 전용 시나리오 정리(아래 '결정'), `workspace.ts`의 Claude `mcp.json` 작성과 `agent.ts`의 Codex MCP `-c` 설정, `scenario.ts`의 `mcp` 필드, `known-conditions.ts`의 MCP·socket 조건, transcript 파서의 MCP 호출 인식, 관련 테스트.
- **formats**: 없음. CLI 응답 envelope, schema, socket 메시지는 그대로다.

## 결정 (사용자 확정, 2026-10-31)

- **Q1 MCP를 지운다**(사용자 답 "지운다"): T0·T6b에서 sandbox를 비켜 갈 방법이 없어 MCP가 꼭 필요한 프로바이더는 없었다. Codex는 앱이 쓴 rule, Antigravity는 한 번 승인으로 닿았다.
- **Q2 eval의 Codex는 repo의 프로젝트 레이어 rule로 닿는다**(사용자 답): 실제 HOME에 rule을 쓰지 않는다. eval workspace의 repo에 프로젝트 레이어 rule `.codex/rules/doan.rules`를 baseline 커밋에 넣는다(zero-setup-agents design.md 실험 run2에서 프로젝트 레이어 rule로 `doan active`가 닿았다). 내용은 앱의 `codexRuleText()`와 같아야 한다.
- **Q3 MCP 전용 시나리오: 5개 삭제, R7만 셸로**(사용자 답): R2b(R2와 같은 과제), R1b(R1의 MCP판), D3·D3b(preset을 MCP로만 읽기), D10b(MCP `init` 다음 단계)는 지운다. R7(선택한 요소와 그 댓글 고치기)은 셸 시나리오로 바꾼다. USABILITY-EVAL의 과거 기록은 지우지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- eval workspace의 Codex rule 파일 내용과 경로를 정하는 함수(`codexRuleText()`와 같은 값을 돌려주는지 테스트로 고정).
- `known-conditions`에서 MCP·socket 조건을 뺀 결과(남는 조건 목록 테스트).
- 문구 단언: guide·stub·`nextSteps`·preset 본문에 `MCP`가 없음을 고정하는 테스트(제거가 되돌아오지 않게).

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §3 In scope 3("through the CLI, MCP and skills"), §5 item 12(MCP 전체), §2·item 0·item 1의 MCP 문장, 세션 연결의 "MCP `check` never records" 문장.
- ARCHITECTURE §5 전체, §4·§6·§7의 MCP 문장, §14 eval의 MCP 시나리오 설명. §5에 있던 "MCP 쓰기는 사람 승인 유지"는 사라지고, Codex에서 셸 쓰기가 승인 없이 실행된다는 결정(zero-setup-agents)만 남는다.
- USABILITY-EVAL: U-001/U-002/U-014 등 MCP 관련 issue는 과거 기록으로 두고, MCP 경로가 없어졌다는 현재 상태를 덧붙인다.

## POSTMORTEM에서 가져온 함정

- 2026-10-29 'Codex cut the middle out of the doan guide…': guide 문구 변경은 출력 예산 테스트를 통과해야 한다.
- zero-setup-agents의 U-014: 복구 문구에서 경로 하나를 빼면 그 경로에 기대던 에이전트가 멈춘다. 이번에는 MCP 경로 자체가 없어지므로 eval Codex가 셸 경로로 닿게 하는 것(Q2)이 같은 변경 안에 있어야 한다.

## PoC 의존

- eval repo의 프로젝트 레이어 rule로 `codex exec -s workspace-write -c approval_policy="never"`가 셸 `doan active`를 sandbox 밖에서 실행하는가: zero-setup-agents 실험 run2가 확인했다. eval 러너를 통해서도 같은지 첫 task에서 한 시나리오(R2 Codex)로 확인한다.
