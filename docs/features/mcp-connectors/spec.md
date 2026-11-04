# mcp-connectors — spec

Doan 연결(PRODUCT §3 In scope 7)로 실행하는 대화에서 에이전트가 원격 MCP 서버(Notion, Atlassian(Jira), Figma 등)의 도구를 쓸 수 있게 한다. 사람은 설정의 새 카테고리 MCP Connectors에서 서버를 추가하고, 에이전트마다 그 provider의 공식 MCP OAuth로 연결한다. 이번 범위는 Claude Code와 Codex다.

## 사용자

- **사람(앱 사용자)**: 설정 > MCP Connectors에서 서버를 추가·연결·해제·삭제하고 에이전트별 상태를 본다. 대화에서는 "Notion의 ○○ 기획서를 읽고 시안을 그려줘"처럼 요청하고, 도구 호출은 기존 권한 요청으로 승인한다.
- **에이전트(Claude Code, Codex)**: Doan 연결 대화에서 연결된 서버의 MCP 도구를 일반 도구처럼 받는다. 에이전트용 guide·skill·CLI 출력은 바뀌지 않는다.

## 문제

기획서와 티켓이 Notion·Jira에 있으면 Doan 대화의 에이전트가 그 spec을 읽지 못해 캔버스를 그릴 수 없다. 사람은 spec을 복사해 대화에 붙여 넣어야 한다. 리뷰 단위가 spec(티켓) 하나라는 PRODUCT §4 'Unit of review'와 바로 이어지는 문제다. PRODUCT §1·§3에는 아직 없으며, 이 feature가 끝나면 Z1에서 추가한다(범위 확장은 사용자가 승인함).

### 관찰된 사실

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

1. 설정 사이드바에 MCP Connectors 카테고리가 Agents와 Notifications 사이에 있다. Claude Code와 Codex가 둘 다 Doan에 sign-in되어 있지 않으면 카테고리를 보이지 않는다. 이때 이 카테고리를 여는 동작(실패 toast의 "Open MCP Connectors" 등)은 설정 > Agents를 연다. 페이지를 보는 중에 마지막 sign-in이 끝나면(sign-out 등) 설정 > Agents로 옮긴다.
2. 페이지는 Doan에 sign-in된 에이전트마다 섹션 하나다(Claude Code, Codex 순서. sign-in되지 않은 에이전트의 섹션은 없다). 섹션 안에는 그 에이전트가 쓸 수 있는 MCP 서버가 목록으로 보이고, 항목마다 그 에이전트의 연결 상태와 동작 버튼이 있다. 항목의 형식은 온보딩 Agent 단계의 provider 행(로고, 이름, 상태 한 줄, 오른쪽 버튼)을 재사용한다.
   - 목록: 프리셋(Notion, Atlassian, Figma)은 추가하지 않아도 항상 있다. 사람이 URL로 추가한 서버가 그 뒤에 온다. URL 서버 목록은 모든 에이전트 섹션이 같이 쓴다(한 번 추가하면 모든 섹션에 보이고, 연결은 에이전트마다 따로 한다).
   - 로고: 프리셋은 각 서비스의 브랜드 로고(provider 로고와 같은 방식의 로컬 에셋), URL 서버는 공통 아이콘을 쓴다.
   - URL 추가: 페이지 머리 오른쪽의 "Add server by URL" 버튼 → compact dialog(URL 필드, Cancel/Add, Enter 제출, Escape 닫기). 잘못된 URL은 필드 아래 인라인 오류로 보인다. 같은 URL(프리셋 URL 포함)은 거절하고 "Already added as <name>."을 보인다.
   - 표시 이름: 프리셋은 서비스 이름, URL 서버는 호스트이고 상태 줄 아래에 전체 URL이 보인다. 내부 이름 `doan-<slug>`는 보이지 않는다. 이름 편집은 이번 범위가 아니다.
   - URL 서버 항목에만 … 메뉴가 있고 그 안에 Remove가 있다. 프리셋은 지울 수 없고 연결·해제만 한다.
   - 빈 상태는 없다(프리셋이 항상 있다). `mcp-connectors.json`을 읽을 수 없거나 더 새로운 `v`이면 Settings storage 규칙과 같은 notice를 보이고 URL 추가·삭제를 막는다. 프리셋의 연결·해제는 막지 않는다.
   - 포커스: URL 추가 뒤에는 첫 섹션의 새 항목 버튼으로, Remove 뒤에는 같은 섹션의 다음 항목(없으면 앞 항목)으로 간다.
   - Cursor·Copilot·Antigravity는 섹션을 만들지 않고, 카테고리 설명에 "Cursor, Antigravity and GitHub Copilot can’t use these connectors yet." 한 줄만 둔다.
3. 항목의 상태는 `Checking…`(상태를 읽는 중, 동작 비활성, role=status), `Not connected`(Connect), `Connecting…`(연결 중), `Connected`(Disconnect), `Reconnect needed`(Reconnect), `Couldn’t check`(확인 실패, Retry) 중 하나다. 앱 UI 문구는 영어다(PRODUCT §5). 문구 형식은 Settings > Agents를 따른다. sign-in은 되어 있지만 실행할 수 없는 에이전트(만료, 업데이트 필요)는 섹션 머리에 그 이유와 설정 > Agents로 가는 동작을 보이고, 목록의 버튼을 비활성으로 둔다.
4. Connect를 누르면 그 provider의 공식 MCP 로그인이 실행된다. 흐름은 Settings > Agents sign-in 규칙(PRODUCT §5 항목 0)을 따른다.
   - Claude: 인증 링크가 Connect를 누른 창에 오고 자동으로 열린다. 행에는 Open again과 Cancel이 있다.
   - Codex: CLI가 기본 브라우저를 직접 연다(Doan은 링크를 따로 열지 않는다). 행에는 "Codex opened your default browser. Allow access to <Notion> there, then return here."와 Cancel만 있다.
   - 허용하면 상태가 `Connected`가 된다. 취소하면 이전 상태로 조용히 돌아간다. 실패하면 이전 상태로 돌아가고 이유와 Retry를 보인다(실패 이유별 문구는 `/design-draft`에서 Agents alert 형식으로 정한다).
   - 페이지를 떠나도 시도는 이어진다. MCP Connectors가 보이지 않을 때 실패하면 "Open MCP Connectors" 동작이 있는 toast를 띄운다. 앱을 종료하면 시도는 취소된다.
5. Doan은 MCP 토큰을 읽거나 저장하지 않는다. 토큰은 각 provider CLI가 OS 키체인에 둔다(Claude는 프로필 키체인 항목 안, Codex는 `Codex MCP Credentials`의 `<서버 이름>|<URL 해시>` 항목). 평문 토큰 파일이 생기면 연결을 실패로 처리하고 그 파일을 지운다.
6. `Connected`인 서버의 도구는 그 provider의 Doan 연결로 시작하는 새 대화·이어지는 대화의 **첫 턴부터** 보인다. 단, Codex에서 서버 준비가 10초 안에 끝나지 않으면 그 서버 없이 턴을 시작하고, 대화에 그 사실을 한 줄로 보인다. 도구 호출은 기존 권한 요청 흐름을 그대로 탄다. Codex가 MCP 도구 승인을 요청하면(읽기 전용이 아닌 도구) 대화에 권한 요청 "Run <tool> on <Notion>"이 Allow / Deny / Allow for this session으로 보인다. 지금은 이 요청이 거부되어 Codex의 쓰기 도구가 실패한다(2026-11-04 PoC).
7. Doan이 등록한 서버 이름은 사람의 터미널 Claude Code·Codex 설정과 키체인 항목과 겹치지 않는다. 연결·해제·삭제·Doan sign-out이 터미널 쪽 MCP 설정과 토큰을 바꾸지 않는다.
8. 항목의 "연결 해제"(Disconnect)는 그 provider의 MCP 토큰만 지우고 등록은 남긴다. URL 서버의 "삭제"(Remove)는 모든 provider에서 토큰과 등록을 지우고 목록에서 뺀다. Disconnect는 확인 없이 바로 실행한다. Remove는 되돌릴 수 없으므로 compact alert "Remove <Notion> from Doan’s agents?"(본문 "Claude Code and Codex disconnect from it. Your terminal setup is not changed.", 버튼 Cancel / Remove(destructive), Escape는 취소)를 거치고, alert가 열린 동안 Settings 페이지를 잠근다. 연결 시도 중인 커넥터는 Remove가 비활성이다. Doan sign-out은 그 provider의 Doan MCP 토큰도 지우고 등록은 남긴다. MCP 로그아웃이 실패해도 sign-out은 진행하고, 다음 시작 때 다시 시도한다. 그동안 그 커넥터의 연결은 막힌다. Settings > Agents의 sign-out 확인 본문에 "Its MCP connectors need connecting again."을 한 줄 더한다.
9. 에이전트 계정을 교체 sign-in하면, 교체가 끝난 뒤 Doan이 새 프로필에 커넥터 등록을 다시 넣고 그 provider의 상태는 모두 `다시 연결 필요`가 된다. 이전 계정으로 받은 MCP 토큰은 로그아웃해서 새 계정이 쓰지 않게 한다. 교체가 끝나지 않으면 기존 프로필의 등록과 토큰은 그대로다.
10. 실행 중인 대화가 있는 provider에서 Connect·Disconnect·Remove가 성공하면, 그 provider 줄 아래에 info notice "Applies from <Claude Code>’s next turn. The running turn keeps its current tools."를 보인다. 상태 변화는 role=status로 한 번 읽어 주고, 실행 중인 턴이 끝나면 notice를 없앤다. toast는 쓰지 않는다. 실행 중인 턴은 바꾸지 않는다.

## 비목표

- Cursor·Copilot·Antigravity 지원. PoC에서 막힌 이유가 provider마다 달라 각각 별도 조사가 필요하다.
- stdio(로컬 명령) MCP 서버, 헤더·API 키 직접 입력, 프로젝트 단위 등록(`.mcp.json` 등 repo 파일).
- Doan 자체 OAuth client나 Doan을 거친 토큰 저장. ARCHITECTURE §7 'Agent authentication'의 "ships no OAuth client"를 유지한다.
- claude.ai 커넥터의 표시와 관리. Doan은 claude.ai 쪽 커넥터를 읽거나 추가·삭제하지 않는다. 카테고리 설명에 "Claude Code는 claude.ai 계정에 연결한 커넥터도 함께 쓴다" 한 줄만 둔다. 같은 서비스를 양쪽에 연결하면 Claude에서 도구가 두 벌 보일 수 있고, 이번 범위에서는 막지 않는다.
- 터미널 세션(legacy external 경로)에 MCP 서버를 넣는 것.
- 대화 안에서 연결을 시작하는 것. 대화는 sign-in을 제공하지 않는다는 기존 규칙(PRODUCT §3 In scope 7)을 MCP 연결에도 적용한다.
