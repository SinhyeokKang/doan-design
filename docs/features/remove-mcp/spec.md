# remove-mcp — spec

Doan에서 MCP를 지운다. 외부 세션은 이제 설정 없이 `doan` CLI와 skill로 Doan을 쓴다(zero-setup-agents). ego lite도 MCP 없이 CLI만 제공한다. 근거 측정은 [evidence.md](./evidence.md)에 있다. MCP는 개발 중에만 쓰였고 실제 사용자가 없으므로, 처음부터 없던 것처럼 지운다.

## 사용자

- **에이전트**: 외부 세션(Claude Code, Codex, Cursor, Antigravity, GitHub Copilot)과 앱 대화. 받는 것: guide, stub, `nextSteps`, Hand off 지시문이 셸 `doan` 한 경로만 안내한다. MCP를 찾거나 등록하라는 안내가 없다.
- **사람**: Hand off 대화상자의 지시문 미리보기("Show instruction")와 복사되는 문구에서 "or MCP tools"가 빠진다(PRODUCT §5 item 6). 그 밖의 화면은 바뀌지 않는다.

## 문제 (관찰한 사실)

- 앱은 MCP를 등록하지 않지만 `doan mcp`, 도구 18개, guide의 MCP 절, 문구의 MCP fallback, MCP 전용 eval 시나리오 6개(D3, D3b, D10b, R1b, R2b, R7)와 그 known condition이 남아 있다(PRODUCT §5 item 12, ARCHITECTURE §5).
- 두 경로를 함께 안내하면 문구가 길어지고 회귀가 생긴다. zero-setup-agents의 eval에서 MCP fallback 문장이 빠지자 R2b·R7 Codex가 실패했다(USABILITY-EVAL U-014).
- T0·T6b에서 다섯 프로바이더 모두 셸 `doan`으로 앱에 닿았다. sandbox가 socket을 막은 것은 Codex(앱이 쓴 rule로 해결)와 Antigravity 2.28.2(에이전트가 sandbox 밖 실행을 요청하고 사람이 한 번 승인)뿐이다. Cursor는 T6b에서 측정하지 못했고 T0 결과만 있다.
- eval의 Codex는 실제 HOME에서 돌고 rule이 없어서, 셸 `doan active`와 `doan onboarding`이 socket에 닿지 못한다. 그래서 R2·O1·O2 Codex가 known condition으로 실패하고, R2b·R7은 MCP로 우회해 왔다.

## 완료 조건

1. `doan mcp`가 없다. 실행하면 다른 없는 명령과 같은 `usage_error`가 나고, stdin을 열어 둔 채 실행해도 바로 끝난다. MCP SDK 의존성이 `go.mod`에서 빠진다.
2. guide, stub, CLI `nextSteps`, `PRESET_GUIDANCE`, design preset 본문, Hand off 지시문에 MCP 안내가 없다. `app_not_running`·`app_launch_failed`의 복구 순서는 Doan 열기 → sandbox 밖 실행 또는 승인 요청 → Applications의 Doan과 Settings… > About이다. 다른 실패 경로의 복구 안내는 MCP 부분만 빠지고 나머지는 그대로다. 문구는 Doan의 `clarify` preset을 먼저 적용한다.
3. eval에 MCP 전용 시나리오와 doan MCP 설정 코드가 없다. eval의 Codex는 workspace repo의 프로젝트 레이어 rule(앱의 `codexRuleText()`와 같은 내용)로 셸 `doan`을 sandbox 밖에서 실행한다. `/agent-eval` 라운드에서 R2·O1·O2 Codex가 셸로 앱에 닿아 통과한다.
4. `/agent-eval` 라운드에서 이 변경으로 생긴 새 issue 행이 없다.
5. 다음 문서에 MCP 설명이 없다: PRODUCT, ARCHITECTURE, README, DESIGN, DIRECTORY, AGENTS.md, `.agents/skills`. 남는 것은 ACP `mcpServers`나 eval의 일반 MCP 격리처럼 Doan MCP가 아닌 설명뿐이다. 지운 시나리오 id(R1b, R2b, D3, D3b, D10b, R7)도 현재 상태를 설명하는 문서에 남지 않는다. USABILITY-EVAL과 POSTMORTEM의 과거 기록은 그대로 둔다.

## 비목표

- MCP를 대신할 새 경로(로컬 HTTP 등).
- Antigravity가 sandbox 밖 실행을 스스로 요청하는지 확인하는 일(별도 측정).
