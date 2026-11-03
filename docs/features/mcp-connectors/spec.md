# mcp-connectors — spec

Doan 연결(PRODUCT §3 In scope 7)로 실행하는 대화에서 에이전트가 원격 MCP 서버(Notion, Atlassian(Jira), Figma 등)의 도구를 쓸 수 있게 한다. 사람은 설정의 새 카테고리 MCP Connectors에서 서버를 추가하고, 에이전트마다 그 provider의 공식 MCP OAuth로 연결한다. 이번 범위는 Claude Code와 Codex다.

## 사용자

- **사람(앱 사용자)**: 설정 > MCP Connectors에서 서버를 추가·연결·해제·삭제하고 에이전트별 상태를 본다. 대화에서는 "Notion의 ○○ 기획서를 읽고 시안을 그려줘"처럼 요청하고, 도구 호출은 기존 권한 요청으로 승인한다.
- **에이전트(Claude Code, Codex)**: Doan 연결 대화에서 연결된 서버의 MCP 도구를 일반 도구처럼 받는다. 에이전트용 guide·skill·CLI 출력은 바뀌지 않는다.

## 문제 (관찰된 사실)

- Doan 연결 대화는 Doan 전용 프로필(`<userData>/agent-auth/profiles/<provider>/`)로 실행되므로, 사람이 터미널에서 `~/.claude.json`이나 `~/.codex/config.toml`에 등록한 MCP 서버를 읽지 않는다. Doan 앱에는 MCP 서버를 등록할 화면이 없다.
- Claude는 claude.ai 계정의 커넥터가 Doan 대화에서도 로드된다(Doan Claude 프로필의 `claudeAiMcpEverConnected`에 `claude.ai Figma` 등이 기록됨, 2026-11-03 확인). Codex에는 이런 경로가 없다.
- ACP provider(Cursor·Copilot·Antigravity)는 `session/new`와 `session/load`에 `mcpServers: []`를 넘긴다(`app/src/main/conversation/acpRunner.ts`).

## PoC 결과 (2026-11-03, 격리 dev 앱, Notion `https://mcp.notion.com/mcp`)

격리 HOME·userData에서 다섯 provider에 Doan으로 로그인하고, 서버 이름 `notion-poc`로 Notion을 등록해 실제 Doan 대화에서 페이지 하나를 가져오게 했다. `.scratch/mcp-poc/evidence/`는 커밋하지 않으므로 관찰은 여기에 적는다.

| Provider (버전) | 등록 | MCP OAuth | Doan 대화에서 도구 호출 |
|---|---|---|---|
| Claude Code 2.1.317 | `claude mcp add --transport http --scope user`로 프로필 `.claude.json`에 들어감 | `claude mcp login <name>`은 TTY가 없으면 `stdin isn't a terminal`로 실패한다. pty(`script -q`)를 붙이면 `BROWSER` hook을 호출하고(링크 파일로 URL 수신) localhost 콜백을 기다린다. client는 CIMD(`https://claude.ai/oauth/claude-code-client-metadata`). 토큰은 프로필 키체인 항목 `Claude Code-credentials-<hash>`에 들어가고(수정 시각이 로그인 완료와 같음) 평문 파일은 없다 | 통과: `mcp__notion-poc__notion-fetch` |
| Codex 0.166.0 | `codex mcp add <name> --url`가 프로필 `config.toml`에 `[mcp_servers.<name>]`를 쓰고 OAuth를 바로 시작한다 | `BROWSER`를 따르지 않고 기본 브라우저를 직접 연다. `--no-browser`는 URL을 출력하고 콜백 URL을 붙여 넣으라고 요구한다. client는 CIMD(`https://chatgpt.com/oauth/codex/client.json`), 콜백 `127.0.0.1:<port>`. 토큰은 키체인 `Codex MCP Credentials`의 계정 `<name>\|<URL 해시>`에 들어가는데, 해시가 프로필이 아니라 URL에서 나와 사람의 터미널 Codex 항목(`notion\|eac663db915250e7`)과 같은 해시가 나왔다 | 첫 턴은 실패: 턴이 서버 연결 완료(3초 뒤)보다 먼저 시작돼 `omitting pending optional MCP server`로 빠졌다. 같은 대화의 두 번째 턴은 통과: `mcp__notion_poc__notion_fetch` |
| Cursor 2026.10.22 | `~/.cursor/mcp.json` | 브라우저를 직접 열고 DCR로 등록했지만 "Listening on localhost:8787"이라고 출력한 포트가 열리지 않아 콜백이 실패했다 | 계정 플랜 제한("Upgrade your plan")으로 확인하지 못함 |
| Copilot 1.0.105 | `copilot mcp add --transport http` | `mcp login` 명령이 없다. ACP 대화 안에서만 OAuth를 시작하고, `cancelled because its original requester or configuration changed`로 취소됐다. Doan이 턴마다 보내는 `session/set_config_option`이 원인이라는 것은 추정이다 | 실패 |
| Antigravity (pinned ACP 서버) | gemini-cli 형식으로 추정한 `settings.json`의 `mcpServers` | 시도되지 않음 | 실패: 도구가 로드되지 않았고, 에이전트가 셸로 Claude 프로필의 대화 기록을 읽어 답을 지어냈다 |

## 완료 조건

1. 설정 사이드바에 MCP Connectors 카테고리가 Agents와 Notifications 사이에 있다.
2. MCP Connectors에서 프리셋(Notion, Atlassian, Figma) 또는 `https://` URL로 서버를 추가할 수 있다. 추가된 서버는 행 하나로 보이고, 그 아래에 Doan 연결이 있는 Claude Code·Codex마다 상태가 하나씩 붙는다.
3. 에이전트별 상태는 `연결 필요`, `연결 중`, `연결됨`, `다시 연결 필요`, `확인 실패` 중 하나다. Doan 연결이 없거나 실행할 수 없는 provider는 상태 대신 그 이유와 설정 > Agents로 가는 동작을 보인다. Cursor·Copilot·Antigravity는 `이 에이전트에서는 아직 지원하지 않음`으로 보이고 동작이 없다.
4. "연결"을 누르면 그 provider의 공식 MCP 로그인이 실행된다. Claude는 기존 sign-in처럼 인증 링크가 연결을 누른 창에 오고, Codex는 CLI가 기본 브라우저를 연다(Doan은 링크를 따로 열지 않는다). 허용하면 상태가 `연결됨`이 되고, 취소하거나 실패하면 이전 상태로 돌아가며 이유를 보인다.
5. Doan은 MCP 토큰을 읽거나 저장하지 않는다. 토큰은 각 provider CLI가 프로필 키체인에 둔다. 평문 토큰 파일이 생기면 연결을 실패로 처리하고 그 파일을 지운다.
6. `연결됨`인 서버의 도구는 그 provider의 Doan 연결로 시작하는 새 대화·이어지는 대화의 **첫 턴부터** 보인다. 도구 호출은 기존 권한 요청 흐름을 그대로 탄다.
7. Doan이 등록한 서버 이름은 사람의 터미널 Claude Code·Codex 설정과 키체인 항목과 겹치지 않는다. 연결·해제·삭제·Doan sign-out이 터미널 쪽 MCP 설정과 토큰을 바꾸지 않는다.
8. 에이전트별 "연결 해제"는 그 provider의 MCP 토큰만 지우고 등록은 남긴다. 서버 "삭제"는 모든 provider에서 토큰과 등록을 지운다. Doan sign-out은 그 provider의 Doan MCP 토큰도 지운다.
9. 에이전트 계정을 교체 sign-in하면, 교체가 끝난 뒤 Doan이 새 프로필에 커넥터 등록을 다시 넣고 그 provider의 상태는 모두 `다시 연결 필요`가 된다. 이전 계정으로 받은 MCP 토큰은 로그아웃해서 새 계정이 쓰지 않게 한다. 교체가 끝나지 않으면 기존 프로필의 등록과 토큰은 그대로다.
10. 실행 중인 대화가 있는 provider에서 연결·해제·삭제를 하면, 그 변경은 다음에 시작하는 턴부터 적용된다고 알린다(실행 중인 턴은 바꾸지 않는다).

## 비목표

- Cursor·Copilot·Antigravity 지원. PoC에서 막힌 이유가 provider마다 달라 각각 별도 조사가 필요하다.
- stdio(로컬 명령) MCP 서버, 헤더·API 키 직접 입력, 프로젝트 단위 등록(`.mcp.json` 등 repo 파일).
- Doan 자체 OAuth client나 Doan을 거친 토큰 저장. ARCHITECTURE §7 'Agent authentication'의 "ships no OAuth client"를 유지한다.
- claude.ai 커넥터의 표시와 관리. Doan은 claude.ai 쪽 커넥터를 읽거나 추가·삭제하지 않는다. 카테고리 설명에 "Claude Code는 claude.ai 계정에 연결한 커넥터도 함께 쓴다" 한 줄만 둔다. 같은 서비스를 양쪽에 연결하면 Claude에서 도구가 두 벌 보일 수 있고, 이번 범위에서는 막지 않는다.
- 터미널 세션(legacy external 경로)에 MCP 서버를 넣는 것.
- 대화 안에서 연결을 시작하는 것. 대화는 sign-in을 제공하지 않는다는 기존 규칙(PRODUCT §3 In scope 7)을 MCP 연결에도 적용한다.
