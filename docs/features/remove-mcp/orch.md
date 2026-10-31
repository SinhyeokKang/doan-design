# remove-mcp — orch

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 hash: `68f3bd55`(main)
- 통합 브랜치: `feat-remove-mcp`
- 모델 경계: 사용자가 이 세션에서 Codex 워커를 허락했다("Codex 워커 허용"). 구현은 Claude가 맡고, Codex는 교차 리뷰와 기계적인 문서 배치에 쓴다.

## 결정 기록

- 지휘자 판단 — T1(실제 Codex로 R2 한 번)과 T8(`/agent-eval` 라운드)의 실제 에이전트 실행은 AGENTS.md '/agent-eval' 상시 예외로 진행한다. 근거: 둘 다 `node eval/run.ts`로 실행하고, 실제 HOME에는 쓰지 않는다.
- 지휘자 판단 — T7 공유 gate(`verify.mjs --eval`)는 통합 HEAD에서 지휘자가 돌린다(orchestrate §4).
- 지휘자 판단 — USABILITY-EVAL의 MCP issue 현재 상태(T9 일부)는 라운드를 기록하는 V 배치가 맡는다. D 배치와 같은 파일을 동시에 고치지 않기 위해서다.
- 지휘자 판단 — `/runtime-test`는 생략한다(design.md '검증 범위').
- 지휘자 판단 — R-C 🟡: C가 'MCP tools' 절과 함께 지운 "Use `init` only when the user asks…" 규칙은 셸 경로에도 필요하다(`doan init --json`도 묻지 않는다). 그래서 guide의 `doan init` 줄로 옮기고 테스트로 고정했다. 근거: 기존 동작을 유지하는 쪽이 더 확실히 검증된다.
- 지휘자 판단 — R-E ⚪2: `transcript.ts`의 `mcp__doan__` 출력 발췌 분기는 doan 전용 파싱이므로 지웠다(design.md 'eval'). 일반 `mcp__*` 인식은 남겼다.
- 지휘자 판단 — eval의 Codex 격리는 `mcp_servers.doan.enabled=false`로 남겼다(E 차이 2). 근거: Codex에는 `--strict-mcp-config`가 없고, 이 머신의 `~/.codex/config.toml`에 옛 `[mcp_servers.doan]` 등록이 남아 있다.
- 관찰 — T1 PoC 라운드에서 Codex가 실제 Keychain의 `Codex MCP Credentials` 항목을 갱신해 real-state 검사가 exit 1로 끝났다. 사용자의 다른 MCP(malmoi) OAuth 때문이며, doan 경로는 바뀌지 않았다. R2-codex는 `pass`였다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| E | T1–T4 | `eval/` 전체(H6·H7의 `prompt.md` 제외), design.md 'PoC 의존' | 없음 | Claude Opus high: PoC 판정, eval 러너 배선, R7b 시나리오 설계에 판단이 필요하고, 틀리면 이후 라운드가 모두 흔들린다 | tasks T1–T4의 검증 줄. T1이 실패하면 멈추고 ask | 완료: 통합 `c53f7874`–`627e4596`(5 커밋), 수정 1라운드 |
| C | T5–T6 | `cli/`, `go.mod`·`go.sum`, `schema/fixtures/`, `app/src/`, `eval/scenarios/H6/prompt.md`·`H7/prompt.md` | 없음 | Claude Opus medium: 테스트 8개에서 MCP 쪽만 덜어 내는 작업은 넓지만 대체로 기계적이고, 문구에는 `clarify`를 적용해야 한다 | tasks T5·T6의 검증 줄 | 완료: 통합 `979939f8`–`763a33f7`(3 커밋), 수정 1라운드 |
| R-E | E 리뷰 | 없음(보고만) | E | Codex gpt-6-astra medium: 다른 모델 계열의 독립 리뷰 | `/code-review` 보고 | 완료: 🔴·🟡 0, ⚪ 2(E 수정 1라운드에 반영) |
| R-C | C 리뷰 | 없음(보고만) | C | Codex gpt-6-astra medium: 다른 모델 계열의 독립 리뷰 | `/code-review` 보고 | 완료: 🔴 0, 🟡 1(init 전제 규칙, C 수정 1라운드에 반영), ⚪ 1 |
| G | T7 | 없음 | E·C 통합 | 지휘자 | `node .agents/skills/verify/scripts/verify.mjs --eval` exit 0 | 통과: `627e4596`에서 `verify.mjs --eval` PASS |
| V | T8 + USABILITY-EVAL의 MCP issue 현재 상태 | `docs/USABILITY-EVAL.md` | G | Claude Opus medium: `/agent-eval` 절차를 따르고, 실패를 분류하는 데 판단이 든다 | tasks T8의 검증 줄 | 진행 중 |
| D | T9(USABILITY-EVAL 제외) | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/DIRECTORY.md`, `README.md`, `AGENTS.md`, `.agents/skills/` | G | Codex gpt-6.1-sol high: design.md '결정 영향'의 줄 목록을 따라 고치는 일이라 판단보다 단계가 많다 | tasks T9의 검증 줄 | 완료: 통합 문서별 13 커밋(끝 `5f6d7dfc`) |
| R-D | D 리뷰 | 없음(보고만) | D | Claude Opus medium: 결정이 현재 규칙으로 바르게 옮겨졌는지 다른 계열이 본다 | 문서 리뷰 보고 | 완료: 🔴·🟡 0, ⚪ 3(수정 불필요) |

- 겹침: E와 C는 파일이 겹치지 않아 병렬로 돌린다(C는 eval에서 H6·H7의 `prompt.md`만 만진다). V와 D는 파일이 겹치지 않아 병렬로 돌린다. 기능 디렉터리 삭제(T9 마지막 줄)는 V·D를 통합한 뒤 지휘자가 한다.
- tasks 항목 매핑: T1–T4 → E, T5–T6 → C, T7 → G, T8 → V, T9 → D·V·지휘자. 주인이 없는 항목은 없다.
