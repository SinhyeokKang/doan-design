# remove-mcp — design

## 영향 받는 구성 요소

- **CLI (Go)**: `cli/internal/cli/mcp.go`와 `mcp_test.go`·`mcp_config_test.go`를 지운다. `mcp_test.go`의 `mcpClient`·`callTool`은 다른 테스트 8개(`comments_resolution_test.go`, `config_test.go`, `design_skill_test.go`, `git_test.go`, `init_absolute_test.go`, `init_audit_test.go`, `onboarding_test.go`, `sessions_test.go`)가 쓴다. 이 파일들에서는 MCP 쪽 단언만 지우고 CLI 쪽 단언은 남긴다. `run_test.go`의 `TestMCP…` 세 개를 지우고, `doan mcp`가 `usage_error`로 바로 끝나는 테스트를 더한다. `run.go`의 `mcp` 분기와 help도 지운다. 세션 기록 예외는 `run.go`의 `run(..., recordSessions bool)` 인자이고, 이 인자를 `false`로 넘기는 곳은 `mcp.go`뿐이다. 이 변경으로 인자가 고아가 되므로 `run()`을 `Run()`으로 접는다. `sessions.go:24`의 주석도 고친다. `init` 등의 `nextSteps`에 있는 MCP 도구 이름을 지운다.
- **go.mod**: SDK를 쓰는 곳은 `mcp.go`·`mcp_test.go`뿐이다. `go mod tidy`를 실행하면 `github.com/modelcontextprotocol/go-sdk`와 그 간접 의존성(`google/jsonschema-go`, `segmentio/*`, `yosida95/uritemplate/v3`, `x/oauth2`, `x/sync`, `x/time` 등)이 빠진다. `x/sys`(`sessions.go`)와 `x/text`(`cli/internal/repo`)는 직접 의존성으로 옮겨 간다. 다른 모듈의 버전은 바뀌지 않아야 한다.
- **guide `cli/internal/cli/skill.md`**: 'MCP tools' 절, "Without the shell CLI, use MCP …"(:74), `app_not_running`의 "call the MCP `active` tool"(:55), `design-skill`의 MCP 괄호(:68)를 지운다. :74의 "Never install, change PATH, permissions or MCP registration"은 "Never install, change PATH or permissions"로 줄이고, `design_skill_test.go:291`의 단언도 바꾼다. 출력 예산 테스트(`skillOutputBudget`) 안에 있어야 한다.
- **design preset 본문** (`cli/internal/designskill/presets/*.md`, 20개 중 `clarify.md`를 뺀 19개): "or the MCP `design_skill` tool …" 같은 MCP 대안 문장을 지운다. 본문은 Impeccable 각색본이라 `notices/MODIFICATIONS.md`의 수정 기록을 맞춘다. `cli/internal/designskill/SOURCES.md:65`의 "or MCP `init`"도 지운다.
- **stub** `app/src/main/onboarding/SKILL.md`: :7 "When no shell is available, call the doan MCP `skill` tool instead."와 :19 "over MCP, call `design_skill`, with an `id` to read one."을 지운다. :12 "If neither works"는 셸 한 경로에 맞게 고친다. `stub.test.ts`에서 "neither" 단언, `` "`skill`" `` 확인, "neither the shell nor MCP" 테스트 이름을 바꾸고 20줄 제한을 지킨다. 기존 설치본의 stub fixture `fixtures/SKILL-c994913.md`는 과거 데이터라 그대로 둔다.
- **Hand off 지시문** `app/src/comments/projection.ts:79`의 `INSTRUCTION`: "Use the doan CLI or MCP tools to read the comments…"를 "Use the doan CLI to read the comments…"로 바꾼다. 같은 문장이 `projection.test.ts:67`, `eval/scenarios/H6/prompt.md`, `H7/prompt.md`에 있다. `H6|H7/scenario.test.ts`는 prompt가 `copyText()`와 같은지 단언하므로 셋을 함께 바꾼다. H6·H7은 제자리에서 고친다(아래 '결정' Q4). `.doan/canvases/agent-handoff.html` draft는 그 화면이 main에 있어 더는 source of truth가 아니므로 그대로 둔다.
- **`PRESET_GUIDANCE`** (`app/src/main/conversation/prompt.ts:35`): "do not suggest MCP"를 지운다. 이 금지문은 앱 대화 프로필에 MCP가 없는데 guide가 MCP fallback을 안내했기 때문에 있었다(ARCHITECTURE :650). guide에서 MCP가 빠지면 필요 없다. :34의 주석도 고친다.
- **brand**: `app/src/brand/candidates.ts`의 `SUBCOMMANDS`에서 `mcp`, `COMMAND_NOUNS`에서 `MCP`를 빼고, 짝인 Go regex(`brand_test.go:33`)와 공유 fixture `schema/fixtures/brand/cases.json`(:10 "Use the doan CLI or MCP tools.")를 함께 바꾼다. 서드파티 문자열을 인용한 fixture 항목은 남긴다.
- **코드 주석**: "CLI or MCP"처럼 MCP를 말하는 주석과 테스트 이름을 고친다(`preload/index.ts:136-174`, `onboarding/service.ts:16,43`, `projectAdder.ts:12,29`, `senderAllowed.ts:10`, `main/index.ts:367,653`, `App.tsx:219`, `Onboarding.tsx:600,629`, `agentSignIn.ts:225`, `agentAuthView.ts:120`, `agentStep.test.ts:447`, `index.test.ts:659`).
- **남기는 프로토콜 데이터**: `acpRunner.ts`의 `mcpServers: []`(ACP 필드), `transport.ts:166`의 `mcpToolCall`(Codex app-server item 종류), `codexIngress.test.ts`, ACP Copilot·Cursor fixture와 그 README.
- **eval**:
  - 시나리오: '결정' Q3·Q4대로 정리한다. `R7/checks.ts:4`는 `../R2b/inspect.ts`를 import하는데, 이 파일은 `R2/inspect.ts`와 같다. 새 R7b는 R2의 것을 가리킨다. `agent.test.ts:128,174`(R2b 사용), `scenario.test.ts:43-54`, `regression.test.ts`, `audit.test.ts`, `record.test.ts`의 R1b·R2b 사용, `D1/presets.ts:16-33`의 `transport: "mcp"`도 고친다. D4·D4b의 제목과 rubric에 있는 "nor MCP"는 지운다. 의도는 바뀌지 않으므로 §14가 허용하는 rubric 명확화에 해당한다. `shellCli: false`는 D4·D4b가 계속 쓰므로 남긴다.
  - doan MCP 배관: `workspace.ts`의 Claude `mcp.json` 작성, `agent.ts`의 Codex `mcp_servers.doan` 설정과 시나리오별 MCP 등록, `scenario.ts`의 `mcp` 필드, transcript의 doan 전용 파싱(`mcpDesignSkillIds`, `mcpInvoked`)을 지운다.
  - 남기는 일반 MCP 격리(Q5): Claude `--strict-mcp-config`와 transcript의 일반 `mcp__*` 인식(`transcript.ts:137-149`, `judge.ts:124`)은 남긴다. 실제 HOME의 다른 MCP(figma 등)가 eval 결과에 끼어들지 않게 하고, 경로 밖 도구 사용을 judge가 볼 수 있게 한다. Codex 쪽도 doan 항목을 빼고, 일반 격리가 필요한지 T2에서 판정한다.
  - Codex rule: 모든 workspace repo의 baseline 커밋에 `.codex/rules/doan.rules`를 넣는다. 에이전트마다 baseline이 같아지고, 에이전트의 diff나 judge가 이 파일을 에이전트 결과로 보지 않는다. 내용은 `app/src/main/agentSetup/plan.ts:57`의 `codexRuleText()`를 런타임에 import한다(Q6). `plan.ts`에는 확장자 없는 import가 있으므로 H6 `copy-text.ts`·`socket-app.test.ts`처럼 `registerHooks` resolver를 쓴다. Codex 실행에는 `-c approval_policy="never"`를 고정해, 결과가 실행하는 머신의 설정에 따라 달라지지 않게 한다.
  - `known-conditions.ts`의 R1b·R2·O1·O2 항목을 지운다. 표는 비지만 표와 `record.ts`의 `condition()`, §14 'Known conditions'는 남긴다(Q7).
- **공유 fixture** (ARCHITECTURE §11): envelope schema와 `v`는 바뀌지 않는다. 다음 fixture의 MCP 부분을 지운다: `schema/fixtures/cli-envelope/design-skill/cases.json`의 `mcp` 키와 설명(Go `design_skill_test.go:26,32`가 읽는다), `onboarding/mapping.json:3,8`의 MCP `onboarding_*`·`isError` 설명, 위 brand fixture.

## 결정 (사용자 확정)

- **Q1 MCP를 지운다**: T0·T6b에서 sandbox를 비켜 갈 방법이 없어 MCP가 꼭 필요한 프로바이더는 없었다. Codex는 앱이 쓴 rule, Antigravity는 한 번 승인으로 닿았다. MCP는 개발 중에만 쓰였으므로 처음부터 없던 것처럼 지운다. 남아 있는 등록을 안내하거나 지우는 장치는 두지 않는다.
- **Q2 eval의 Codex는 repo의 프로젝트 레이어 rule로 닿는다**: 실제 HOME에 rule을 쓰지 않는다. 근거는 evidence.md 'run2'이다. eval repo는 `/tmp` 아래의 trusted가 아닌 디렉터리라, run2 결과가 그대로 통하는지는 T1에서 확인한다. 통하지 않으면 T2로 가지 않고 결과와 후보(호출마다 `-c projects."<repo>".trust_level`, 임시 `CODEX_HOME`)를 가지고 사용자에게 묻는다.
- **Q3 MCP 전용 시나리오**: R2b(R2와 같은 과제), R1b(R1의 MCP판), D3·D3b(preset을 MCP로만 읽기), D10b(MCP `init` 다음 단계)는 지운다. R7(선택한 요소와 그 댓글 고치기)은 셸 시나리오로 바꾼다. USABILITY-EVAL의 과거 기록은 지우지 않는다.
- **Q4 시나리오 id**: R7은 전송 경로와 checks가 바뀌므로 지우고, 셸 버전을 새 id R7b로 만든다. H6·H7의 prompt는 앱의 Hand off 문구를 그대로 옮긴 것이어서, 앱과 같아야 하는 불변식을 지키는 수정으로 보고 제자리에서 고친다. ARCHITECTURE §14에 이 예외를 적는다.
- **Q5 eval 격리**: doan 전용 MCP 설정만 지우고 일반 MCP 격리는 남긴다.
- **Q6 rule 출처**: `codexRuleText()`를 런타임에 import한다. 복사본이 없으므로 '같은 값' 테스트는 두지 않는다.
- **Q7 known conditions**: 장치는 남기고 표만 비운다.
- **Q8 ARCHITECTURE 장 번호**: §5를 지우고 번호는 다시 매기지 않는다. §4 다음이 §6이다. '(removed)' 같은 표시는 두지 않는다. 다른 문서와 역사 기록의 § 참조가 그대로 맞는다.
- **Q9 guide 금지문**: guide에서 "MCP registration"을 빼고 'guide에 MCP가 없다' 단언은 예외 없이 둔다. D1·D4 checks의 `claude|codex mcp add` 금지는 에이전트 행동 검사라 남긴다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- eval workspace의 rule 파일 경로(`.codex/rules/doan.rules`)와 baseline 커밋 포함 여부. 내용은 `codexRuleText()`를 import하므로 따로 고정하지 않는다.
- 문구 단언: guide·stub·`nextSteps`·preset 본문·Hand off 지시문에 `MCP`가 없음을 고정하는 테스트(제거가 되돌아오지 않게).
- 복구 순서 단언: `app_not_running`·`app_launch_failed`의 `nextSteps`(`active.go:28`, `onboarding.go:60-63`)와 guide :55·:82가 Doan 열기 → sandbox 밖 실행 또는 승인 요청 → Applications의 Doan과 Settings… > About 순서를 담는다.

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT: §2 :21("Doan provides MCP but does not register it"), §3 In scope 3 :29, 세션 연결 :55, 이름 규칙 :93, item 0 :98·:104·:139, `doan config` :138, item 5 :190, item 6 :231(Hand off 지시문 인용), item 11 :241, 'MCP' 제목과 item 12 :243-245, item 13 :250·:251, 'Open questions' :275("changes CLI/MCP output"). item 12를 지운 뒤에도 item 번호는 다시 매기지 않는다(Q8과 같은 이유).
- ARCHITECTURE: §5 전체를 지운다. §5에 있던 "The shell path skips approval in Codex"(:211)는 zero-setup-agents의 결정이므로 §7 'Agent setup'으로 옮긴다. "MCP 쓰기는 사람 승인 유지"는 사라진다. 그 밖의 MCP 문장: §2 :84, §4 :182·:184·:190, §6 :254·:260, §7 :442·:650, §8 :655·:657(SDK 의존성), §9 :662, §10 :673, §11 :695·:698, §12 :717·:718·:732·:735-737·:758·:764·:765, §13 :777, §14 :825(일반 MCP 격리로 다시 쓴다)·:829(`shellCli`의 "MCP-only" 설명)와 지운 시나리오 id, H6·H7 제자리 수정 예외(Q4).
- README :24·:45, DESIGN :204, DIRECTORY의 지운 파일과 :41, AGENTS.md :81-84('Real-agent MCP check'와 MCP `DOAN_RUNTIME` 설명)·:108·:120, `.agents/skills`(`agent-eval:20,40,48`, `ship:17`, `feature:26,32`, `code-review:31`, `audit:27`).
- USABILITY-EVAL: U-001/U-002/U-014 등 MCP 관련 issue는 과거 기록으로 두고, MCP 경로가 없어졌다는 현재 상태를 덧붙인다.

## POSTMORTEM에서 가져온 함정

- 2026-10-29 'Codex cut the middle out of the doan guide…': guide 문구 변경은 출력 예산 테스트를 통과해야 한다.
- zero-setup-agents의 U-014: 복구 문구에서 경로 하나를 빼면 그 경로에 기대던 에이전트가 멈춘다. 이번에는 MCP 경로 자체가 없어지므로 eval Codex가 셸 경로로 닿게 하는 것(Q2)이 같은 변경 안에 있어야 한다.

## PoC 의존

- eval repo의 프로젝트 레이어 rule로 `codex exec -s workspace-write -c approval_policy="never"`가 셸 `doan active`를 sandbox 밖에서 실행하는가: zero-setup-agents 실험 run2(evidence.md)가 확인했다. 다만 run2는 실행한 디렉터리가 trusted였는지 기록하지 않았다. eval 러너를 통해서도 같은지 T1에서 한 시나리오(R2 Codex)로 확인한다.
- T1 결과(2026-10-31, codex-cli 0.164.0): 통과했다. 실행 전에 `~/.codex/rules/`에는 `default.rules`(`ego-browser` allow)만 있었고 `doan.rules`는 없었다. 사용자 `config.toml`은 `approval_policy = "never"`, `sandbox_mode = "danger-full-access"`이고, eval 호출의 `--sandbox workspace-write -c approval_policy="never"`가 실행 값을 정했다(stderr `approval: never`, `sandbox: workspace-write`). 실행 디렉터리 `/private/tmp/doan-eval-R2-codex-Ae8u9O/repo`는 사용자 config의 trusted project 목록에 없다. 임시로 R2 seed에 `.codex/rules/doan.rules`(`codexRuleText()`와 같은 내용)를 넣고, 패키지한 CLI로 `node eval/run.ts --scenarios R2 --agents codex --round remove-mcp-poc`를 실행했다. rollout에서 `doan active --json`이 exit 0으로 selection을 돌려받았고, R2-codex는 자동 검사 6개와 judge 모두 `pass`였다(25.6초). 따라서 trusted가 아닌 eval repo에서도 프로젝트 레이어 rule이 적용된다. 러너 자체는 실제 상태 검사에서 exit 1로 끝났다. 바뀐 것은 `keychain:provider-items` 하나였고, 원인은 실행 중(04:45:47Z)에 수정된 `Codex MCP Credentials` 항목이다. 이 항목은 Codex가 사용자 config의 MCP 서버 OAuth를 저장하는 곳이고, doan 경로는 바뀌지 않았다. USABILITY-EVAL 2026-10-31 행과 같은 현상이다. 증거는 `.scratch/agent-eval/remove-mcp-poc/`에 있다. 임시 변경은 되돌렸다.

## 검증 범위

- `/runtime-test`는 생략한다. 앱 변경은 문자열 상수(`projection.ts`, `prompt.ts`, stub)와 테스트 전용 brand 목록뿐이고, UI·IPC 동작은 바뀌지 않는다. 문자열은 단위 테스트(`projection.test.ts`, `prompt.test.ts`, `stub.test.ts`)가 고정하고, T6의 패키지 빌드가 stub을 실제로 쓴다.
