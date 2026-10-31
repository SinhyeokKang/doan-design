# remove-mcp — spec

Doan에서 MCP를 지운다. 외부 세션은 이제 설정 없이 `doan` CLI와 skill로 Doan을 쓴다(zero-setup-agents). ego lite도 MCP 없이 CLI만 제공한다. 근거 측정은 [evidence.md](./evidence.md)에 있다.

## 사용자

- **에이전트**: 외부 세션(Claude Code, Codex, Cursor, Antigravity, GitHub Copilot)과 앱 대화. 받는 것: guide, stub, `nextSteps`가 셸 `doan` 한 경로만 안내한다. MCP를 찾거나 등록하라는 안내가 없다.
- **사람**: 바뀌는 화면은 없다. MCP를 직접 등록해 둔 사람은 그 등록이 동작하지 않게 된다(`doan mcp`가 없는 명령이 된다).

## 문제 (관찰한 사실)

- 앱은 MCP를 등록하지 않지만 `doan mcp`, 도구 18개, guide의 MCP 절, 문구의 MCP fallback, MCP 전용 eval 시나리오 6개(D3, D3b, D10b, R1b, R2b, R7)와 그 known condition이 남아 있다(PRODUCT §5 item 12, ARCHITECTURE §5).
- 두 경로를 함께 안내하면 문구가 길어지고 회귀가 생긴다. zero-setup-agents의 eval에서 MCP fallback 문장이 빠지자 R2b·R7 Codex가 실패했다(USABILITY-EVAL U-014).
- T0·T6b에서 다섯 프로바이더 모두 셸 `doan`으로 앱에 닿았다. sandbox가 socket을 막은 것은 Codex(앱이 쓴 rule로 해결)와 Antigravity 2.28.2(에이전트가 sandbox 밖 실행을 요청하고 사람이 한 번 승인)뿐이다. Cursor는 T6b에서 측정하지 못했고 T0 결과만 있다.
- eval의 Codex는 실제 HOME에서 돌고 rule이 없어서, 셸 `doan active`와 `doan onboarding`이 socket에 닿지 못한다. 그래서 R2·O1·O2 Codex가 known condition으로 실패하고, R2b·R7은 MCP로 우회해 왔다.

## 완료 조건

1. `doan mcp`가 없다. 실행하면 다른 없는 명령과 같은 `usage_error`가 난다. MCP SDK 의존성이 `go.mod`에서 빠진다.
2. guide, stub, CLI `nextSteps`, `PRESET_GUIDANCE`, design preset 본문, 앱 문구에 MCP 안내가 없다. 복구 순서는 Doan 열기 → sandbox 밖 실행 또는 승인 요청 → Applications의 Doan과 Settings… > About이다. 문구는 Doan의 `clarify` preset을 먼저 적용한다.
3. eval에 MCP 전용 시나리오와 MCP 설정 코드가 없다. eval의 Codex는 설치된 Doan과 같은 rule로 셸 `doan`을 sandbox 밖에서 실행한다. R2·O1·O2 Codex의 socket known condition이 사라진다.
4. `/agent-eval` 라운드에서 이 변경으로 생긴 새 issue 행이 없다.
5. PRODUCT와 ARCHITECTURE에 MCP 설명이 없다(§3 In scope 3, §5 item 12, ARCHITECTURE §5, 세션 연결의 MCP 문장 등). PRODUCT 'Open questions'의 MCP 제거 항목은 이 feature가 커밋될 때 지운다.

## 비목표

- MCP를 대신할 새 경로(로컬 HTTP 등).
- 사람이 직접 등록해 둔 MCP 설정을 지우거나 알리는 일. 등록은 사람의 설정 파일이고 Doan은 처음부터 쓰지 않았다.
- Antigravity가 sandbox 밖 실행을 스스로 요청하는지 확인하는 일(별도 측정).
