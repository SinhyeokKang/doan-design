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
- 지금 Doan은 Codex의 MCP 도구 승인 요청에 답하지 못해 Codex의 쓰기 도구가 실패한다(2026-11-04 PoC). 대화가 소유한 모르는 서버 요청은 턴 전체를 `session_unavailable`로 끝낸다(`app/src/main/conversation/transport.ts` `normalizeCodex`).

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

1. 설정 사이드바에 MCP Connectors 카테고리가 Agents와 Notifications 사이에 있다. Claude Code와 Codex가 둘 다 Doan에 sign-in되어 있지 않으면 카테고리를 보이지 않는다. 이때 이 카테고리를 여는 동작(실패 toast의 "Open MCP Connectors" 등)은 설정 > Agents를 열고, 저장된 설정 섹션이 `mcp`여도 Agents로 복원한다. Claude Code와 Codex가 모두 sign-in되지 않은 상태가 되면(sign-out 등) 보던 MCP Connectors 페이지가 Agents로 바뀐다. 이때 포커스는 Agents 페이지 제목으로 가고, 페이지 live region이 "MCP Connectors is available while Claude Code or Codex is signed in."을 한 번 읽어 준다.
2. 페이지는 Doan에 sign-in된 에이전트마다 섹션 하나다(Claude Code, Codex 순서. sign-in되지 않은 에이전트의 섹션은 없다). 섹션 안에는 프리셋 세 개와 URL 서버 전체가 목록으로 보이고, 항목마다 그 에이전트의 연결 상태와 동작 버튼이 있다. 항목의 형식은 온보딩 Agent 단계의 provider 행(로고, 이름, 상태 한 줄, 오른쪽 버튼)을 재사용한다. 각 섹션은 에이전트 이름을 label로 가진 group이다.
   - 목록: 프리셋(Notion, Atlassian, Figma)은 추가하지 않아도 항상 있다. 사람이 URL로 추가한 서버가 그 뒤에 온다. URL 서버 목록은 모든 에이전트 섹션이 같이 쓴다(한 번 추가하면 모든 섹션에 보이고, 연결은 에이전트마다 따로 한다).
   - 로고: 프리셋은 각 서비스의 브랜드 로고(provider 로고와 같은 방식의 로컬 에셋), URL 서버는 공통 아이콘을 쓴다.
   - URL 추가: 페이지 머리 오른쪽의 "Add server by URL" 버튼 → compact dialog(URL 필드, Cancel/Add, Enter 제출, Escape 닫기). 잘못된 URL은 필드 아래 인라인 오류로 보인다. 같은 URL(프리셋 URL 포함)은 거절하고 "Already added as <name>."을 보인다. 같은지는 정규화한 URL로 비교한다(앞뒤 공백 제거, scheme·호스트 소문자, 기본 포트 443 제거, 경로 끝의 슬래시 하나 제거). 형식이 맞으면 접속할 수 없는 URL도 추가되고, 실패는 Connect 때 호스트 이름이 들어간 CLI 실패 문구로 보인다.
   - 표시 이름: 프리셋은 서비스 이름, URL 서버는 호스트이고 상태 줄 아래에 전체 URL이 보인다. 내부 이름 `doan-<slug>`는 보이지 않는다. 이름 편집은 이번 범위가 아니다.
   - URL 서버 항목에만 … 메뉴가 있고 그 안에 Remove가 있다. 프리셋은 지울 수 없고 연결·해제만 한다.
   - 빈 상태는 없다(프리셋이 항상 있다). `mcp-connectors.json`을 읽을 수 없으면 Settings storage의 notice 형식을 쓰되, 읽을 수 없는 파일은 기본값으로 읽지 않고 URL 추가·삭제를 막는다. 그동안 프리셋은 Claude와 Codex 모두에서 연결·해제할 수 있다. 단, 그 서버에 미뤄 둔 MCP 로그아웃 기록이나 메모리 차단(완료 조건 8)이 있으면 그 에이전트의 Connect는 막힌다. 파일이 더 새로운 `v`이면 같은 notice를 보이고 URL 서버를 보이지 않는다.
   - 포커스: Settings > Agents 규칙(`app/src/renderer/SettingsAgents.tsx`의 `focusLost` 감시)을 쓴다. 포커스가 있던 버튼이 사라지거나 비활성이 되면 포커스는 그 항목의 행 group(`role=group`, `tabIndex=-1`)으로 간다. URL 추가 뒤에는 첫 섹션의 새 항목 행 group으로 가고(화면 안으로 스크롤) 추가를 한 번 읽어 준다. dialog와 메뉴를 Cancel·Escape로 닫으면 연 버튼(Add server by URL, 그 항목의 … 버튼)으로 돌아간다. Remove 뒤에는 같은 섹션의 다음 항목(없으면 앞 항목)으로 간다.
   - 읽어 주기: 페이지에 live region을 하나만 둔다(항목마다 role=status를 두지 않는다). 사람이 일으킨 변화와 백그라운드에서 생긴 변화(connected, disconnected, failed, added, removed, 백그라운드에서 생긴 `Reconnect needed`·`Couldn’t check`)만 에이전트 이름을 넣어 읽어 준다. 처음 `Checking`에서 상태가 정해지는 것은 읽지 않는다.
   - 접근 이름에는 서버와 에이전트가 들어간다(예: "Connect Notion for Codex").
   - Cursor·Copilot·Antigravity는 섹션을 만들지 않고, 카테고리 설명에 "Cursor, Antigravity and GitHub Copilot can’t use these servers yet." 한 줄만 둔다.
3. 항목의 상태는 `Checking`(상태를 읽는 중, 동작 비활성), `Not connected`(Connect), `Connecting`(연결 중), `Connected`(Disconnect), `Disconnecting`(해제 중), `Removing`(삭제 중), `Reconnect needed`(Reconnect), `Couldn’t check`(확인 실패, Retry) 중 하나다. 진행 상태 문구는 말줄임표 없는 현재분사다. 앱 UI 문구는 영어다(PRODUCT §5). 그 밖의 문구 형식은 Settings > Agents를 따른다. sign-in은 되어 있지만 실행할 수 없는 에이전트(만료, 업데이트 필요)는 섹션 머리에 그 이유와 설정 > Agents로 가는 동작을 보이고, 목록의 버튼을 비활성으로 둔다.
   - Reconnect와 연결 실패의 Retry는 Connect와 같은 sign-in 흐름을 실행한다.
   - Disconnect를 누르면 `Disconnecting`이 되고 동작이 비활성이다. 실패하면 이전 상태로 돌아가고 이유와 Retry가 있는 alert를 보인다.
   - Remove는 확인 뒤 alert를 닫고, 항목을 남긴 채 `Removing`으로 두고 동작을 비활성으로 한다. 파일 수정까지 성공한 뒤에만 목록에서 뺀다. 어느 단계든 실패하면 항목에 오류 alert와 Retry를 보인다.
   - 한 에이전트에서 시도가 하나 진행 중이면 그 에이전트 섹션의 다른 Connect 버튼은 비활성이고, 이유를 tooltip으로 보인다. 어느 에이전트든 그 서버를 연결하는 중이면 그 서버의 Remove는 비활성이다.
   - 그 provider의 sign-in·sign-out·교체가 진행 중이면(agentAuth `admit()`가 `busy`) Connect는 실패 alert "Codex is busy signing in or out. Try again in a moment."(에이전트 이름은 그 provider)와 Retry를 보인다.
   - 실패 alert는 그 항목의 다음 Connect·Retry·Cancel까지 남는다. 페이지를 떠났다 돌아와도 남는다.
4. Connect를 누르면 그 provider의 공식 MCP 로그인이 실행된다. 흐름은 Settings > Agents sign-in 규칙(PRODUCT §5 항목 0)을 따른다.
   - Claude: 인증 링크가 Connect를 누른 창에 오고 자동으로 열린다. 행에는 Open again과 Cancel이 있다. 브라우저 허용을 5분까지 기다리고, 넘으면 실패로 끝내고 "Claude Code stopped waiting for <Notion> to allow access. Try again, and allow access in the browser tab that opens."를 보인다.
   - Codex: CLI가 기본 브라우저를 직접 연다(Doan은 링크를 따로 열지 않는다). 행에는 "Codex opened your default browser. Allow access to <Notion> there, then return here."와 Cancel만 있다.
   - 허용하면 상태가 `Connected`가 된다. 취소하면 이전 상태로 조용히 돌아간다. 실패하면 이전 상태로 돌아가고 이유와 Retry를 보인다(실패 이유별 문구는 `/design-draft`에서 Agents alert 형식으로 정했다).
   - 페이지를 떠나도 시도는 이어진다. MCP Connectors가 보이지 않을 때 실패하면 "Open MCP Connectors" 동작이 있는 toast를 띄운다. 앱을 종료하면 시도는 취소된다.
5. Doan은 MCP 토큰을 읽거나 저장하지 않는다. 토큰은 각 provider CLI가 OS 키체인에 둔다(Claude는 프로필 키체인 항목 안, Codex는 `Codex MCP Credentials`의 `<서버 이름>|<URL 해시>` 항목). Doan은 평문 토큰 파일이 있는지 경로만 확인하고 내용은 읽지 않는다. 확인하는 경로는 Claude 프로필의 `.credentials.json`이다. 이 파일이 생기면 연결을 실패로 처리하고 그 파일을 지운다. Codex는 keyring 저장을 강제하므로 확인할 경로가 없다(design '토큰 저장 확인').
6. `Connected`인 서버의 도구는 그 provider의 Doan 연결로 시작하는 새 대화·이어지는 대화의 **첫 턴부터** 보인다. 단, Codex에서 서버 준비가 1초를 넘으면 대화에 "Waiting for <Notion>" activity 줄을 보이고, 10초 안에 끝나지 않으면 그 서버 없이 턴을 시작하며 그 줄을 "<Notion> wasn’t ready, so this turn started without it."로 바꾼다. 도구 호출은 기존 권한 요청 흐름을 그대로 탄다.
   - Codex가 MCP 도구 승인을 요청하면(읽기 전용 표시가 없는 도구) 대화에 권한 요청 "Run <tool> on <Notion>"이 Allow / Deny로 보이고, Codex가 session 승인을 제공할 때만(`persist`에 `session`이 있을 때) Allow for this session이 함께 보인다. 승인 요청이 오면 Allow로 쓰기 도구가 실행되고, Deny로 그 호출은 실패하고 턴은 이어진다.
   - Claude의 MCP 도구 권한 요청도 summary가 "Run <tool> on <Notion>"이다. 도구 입력은 summary와 history에 복사하지 않는다.
   - Codex 권한 모드별 동작(2026-11-04 probe): Default와 Accept edits에서는 승인 요청이 보인다. Plan에서는 승인이 필요한 Codex MCP 도구가 실패한다(Plan은 읽기 전용이다). 읽기 전용 도구는 실행된다. Bypass에서는 묻지 않고 실행된다.
   - MCP 도구 승인이 아닌 Codex elicitation(폼 입력 등)은 Doan이 거절로 답한다. 그 도구 호출은 실패하고 턴은 이어진다.
7. Doan이 등록한 서버 이름은 사람의 터미널 Claude Code·Codex 설정과 키체인 항목과 겹치지 않는다. 연결·해제·삭제·Doan sign-out이 터미널 쪽 MCP 설정과 토큰을 바꾸지 않는다.
8. 항목의 "연결 해제"(Disconnect)는 그 provider의 MCP 토큰만 지우고 등록은 남긴다. URL 서버의 "삭제"(Remove)는 모든 provider에서 토큰과 등록을 지우고 목록에서 뺀다. Disconnect는 확인 없이 바로 실행한다. Remove는 되돌릴 수 없으므로 compact alert "Remove <Notion> from Doan’s agents?"(본문 "Claude Code and Codex disconnect from it. Your terminal setup is not changed.", 버튼 Cancel / Remove(destructive), Escape는 취소)를 거치고, alert가 열린 동안 Settings 페이지를 잠근다. 연결 시도 중인 커넥터는 Remove가 비활성이다. Doan sign-out은 그 provider의 Doan MCP 토큰도 지운다. MCP 로그아웃이 실패해도 sign-out은 진행하고, 그 서버를 미뤄 둔 로그아웃으로 기록해 다음 시작 때 다시 시도한다. 기록이 남은 동안 그 서버의 그 에이전트 Connect는 막히고, 행에 "Doan is still disconnecting the previous account. Try again later."가 보인다. Connect를 누르면 재시도를 먼저 하고, 성공했을 때만 연결을 시작한다. Doan은 새 sign-out 확인을 만들지 않는다. 실행 중인 대화를 멈춰야 할 때만 뜨는 기존 Settings > Agents 확인의 본문에 "Its MCP connectors need connecting again."을 한 줄 더한다.
9. 에이전트 계정을 교체 sign-in하면, 교체가 끝난 뒤 그 provider의 상태는 모두 `Reconnect needed`가 된다. 이전 계정으로 받은 MCP 토큰은 로그아웃해서 새 계정이 쓰지 않게 한다. Codex는 서버마다 이전 계정의 로그아웃이 성공한 뒤에만 새 프로필에 등록을 넣는다. 실패한 서버는 완료 조건 8의 미뤄 둔 로그아웃 규칙을 따른다. 같은 계정으로 다시 sign-in하면 Claude는 MCP 로그아웃을 하지 않는다. Codex는 계정을 구별할 저장된 id가 없어 교체 때마다 로그아웃한다. 교체가 끝나지 않으면 기존 프로필의 등록과 토큰은 그대로다.
10. 실행 중인 대화가 있는 provider에서 Connect·Disconnect·Remove가 성공하면, 그 에이전트 섹션의 바뀐 항목 아래에 info notice "Applies from <Claude Code>’s next turn. The running turn keeps its current tools."를 보인다. notice는 섹션마다 하나이고, 변경이 여러 번이면 마지막으로 바뀐 항목 아래로 갱신된다. 상태 변화는 페이지 live region이 한 번 읽어 주고, 실행 중인 턴이 끝나면 notice를 없앤다. 이 안내에는 toast를 쓰지 않는다. 실행 중인 턴은 바꾸지 않는다.

## 비목표

- Cursor·Copilot·Antigravity 지원. PoC에서 막힌 이유가 provider마다 달라 각각 별도 조사가 필요하다.
- stdio(로컬 명령) MCP 서버, 헤더·API 키 직접 입력, 프로젝트 단위 등록(`.mcp.json` 등 repo 파일).
- Doan 자체 OAuth client나 Doan을 거친 토큰 저장. ARCHITECTURE §7 'Agent authentication'의 "ships no OAuth client"를 유지한다.
- claude.ai 커넥터의 표시와 관리. Doan은 claude.ai 쪽 커넥터를 읽거나 추가·삭제하지 않는다. 카테고리 설명에 "Claude Code는 claude.ai 계정에 연결한 커넥터도 함께 쓴다" 한 줄만 둔다. 같은 서비스를 양쪽에 연결하면 Claude에서 도구가 두 벌 보일 수 있고, 이번 범위에서는 막지 않는다.
- 터미널 세션(legacy external 경로)에 MCP 서버를 넣는 것.
- 대화 안에서 연결을 시작하는 것. 대화는 sign-in을 제공하지 않는다는 기존 규칙(PRODUCT §3 In scope 7)을 MCP 연결에도 적용한다.
- MCP 도구 승인이 아닌 elicitation(폼 입력)에 답하는 화면. 이번 범위에서는 거절로 답한다.
