# cli-minimum-versions — spec

Doan이 받아들이는 provider CLI 최소 버전(지금 Claude Code 2.1.312, Codex 0.164.0, Cursor 2026.10.22, Copilot 1.0.105)을 더 오래된 버전으로 낮출 수 있는지 실험한다. 실제 앱에서 확인된 버전이 있으면 그 버전까지 낮춘다. 이번 작업은 실험에서 출발하고, 새 최소 버전은 실험 결과를 보고 사람이 정한다. Antigravity는 Doan이 받는 고정 버전 서버라 최소 버전이 없고, 이번 작업에서 새로 두지 않는다(design.md 'Antigravity').

## 사용자

- **사람**: 첫 실행 Agent 단계와 Settings > Agents의 provider 행에서 Update를, Home agent picker에서 "Needs an update"와 "Update…"를(`agentAuthView.ts:163`, `:211`), Settings > About에서 "Update needed"와 "Doan needs X or later."를 보는 사람(PRODUCT.md:95, :116). 최소 버전이 낮아지면 지금 설치된 더 오래된 CLI로 sign-in, 새 대화, resume, 권한 요청, 권한 모드, Send now(Claude Code·Codex), MCP Connectors(Claude Code·Codex)를 쓴다.
- **에이전트**: 바뀌는 것이 없다. `doan` CLI, guide, skill stub, `doan check` 규칙은 그대로다. 대화를 실제로 돌리는 provider CLI의 버전 범위만 넓어진다.

## 문제

- 제품 담당자의 관찰: 지금은 대부분의 사용자가 Update를 본다. 사용자들이 실제로 어떤 버전을 쓰는지는 repo에 기록이 없다.
- 지금 최소 버전은 기능이 요구해서 정한 값이 아니다. 실제 앱에서 마지막으로 확인한 그 시점의 설치본이다.
  - agent-auth가 Claude Code를 2.1.310에서 그때 설치본 2.1.312로, Codex를 0.163.0에서 0.164.0으로 올렸다(`4148412a`, `5e9954cd`, 2026-10-28).
  - 같은 날(커밋은 2026-10-29) 정확한 버전 고정이 최소 버전으로 바뀌었다. 그 증거는 네 CLI를 "exactly the minimums"(Claude Code 2.1.312, Codex 0.164.0, Cursor 2026.10.22-27dcf5f, Copilot 1.0.105)에 두고 돌린 실제 앱 확인 한 번이다(`c518a979`, `e47e7929`, 2026-10-29).
- 그래서 최신보다 몇 릴리스만 뒤인 CLI도 거절된다. 2026-11-02 기준 최신은 Codex 0.166.0, Claude Code 2.1.316이었고, 지금 이 Mac에는 Claude Code 2.1.318, Codex 0.166.0, Cursor 2026.10.22-27dcf5f, Copilot 1.0.105가 깔려 있다.
- 최소 버전을 바꾸려면 그 버전을 실제 앱에서 확인해야 한다. PRODUCT §3은 최소 버전을 "verified minimums"라고 부른다(PRODUCT.md:58). ARCHITECTURE §7 'Versions'는 올릴 때의 증거만 정해 두었다: sign-in 유지, 새 대화, resume, 권한 요청 하나(ARCHITECTURE.md:530). 낮출 때의 규칙은 없다.
- 지금까지 남은 오래된 버전의 증거는 일부 기능에 한정된다.
  - permission-mode PoC: Codex 0.163.0 app-server에서 `turn/start` override 유지와 ephemeral `thread/start`만 확인했다(`94edc615`).
  - queue-send-now T0 PoC: steer를 Codex 0.164.0·0.166.0, Claude Code 2.1.312·2.1.317에서 확인했다(`8ae29594`).
  - MCP Connectors PoC는 Claude Code 2.1.317·2.1.318과 Codex 0.166.0에서만 했다(`1123749b`, `91f53ec4`의 mcp-connectors PoC 표. 그 디렉터리는 이 feature가 시작되기 전에 지워진다). 지금 최소 버전에서도 MCP 증거는 없다.

## 완료 조건

1. **사용자 버전.** 테스터들이 Settings > About의 Copy details로 보낸 provider별 설치 버전이 tasks.md 'E 결과'에 있다. 사람이 모으기를 마쳤다고 알린 시점까지 받은 것을 쓴다. 테스터는 A, B…로만 적고, 이름과 경로(Copy details에 들어 있는 HOME·CLI 경로)는 적지 않는다. 이 repo는 공개된다.
2. **실험 기록.** provider마다 후보 버전별로 design.md '확인 목록'의 항목마다 통과·실패·미확인을 'E 결과'에 적는다. 정적 검사(로그인 없음)와 실제 앱 확인을 따로 적고, 날짜·CLI 버전·경로(Doan 연결 / legacy external)를 함께 적는다. 실제 앱 확인은 provider마다 후보 두 개 이하다. Antigravity는 최소 버전이 필요 없다는 근거를 코드로 적는다(`facts.ts:24`, `aboutView.ts:34`, `manager.ts:604-610`, design.md 'Antigravity').
3. **결정.** 사람이 실험 결과를 보고 provider마다 새 최소 버전을 정하거나, 지금 값을 유지하기로 정한다(tasks.md D1). 새 최소 버전은 design.md '통과 기준'을 모두 통과한 버전 중에서만 고른다.
4. **낮춘 경우의 동작.**
   - 새 최소 버전과 정확히 같은 CLI는 Settings > Agents에서 Update가 아니라 Sign in이나 Connected로 보인다. 새 최소 버전보다 patch 하나 낮은 버전(`--version`만 출력하는 stub 실행 파일로 확인)은 지금처럼 Update로 보인다. 최소 버전 아래는 계속 거절한다.
   - Settings > About은 "Doan needs <새 버전> or later."를 보인다.
   - stored-session floor(`CLAUDE_REGISTRY_FLOOR`, `CODEX_ROLLOUT_FLOOR`)가 새 최소 버전보다 높으면 새 최소 버전까지 같이 내린다. 그래서 새 최소 버전의 CLI로 만든 대화는 resume된다.
5. **실제 앱 확인.** 낮춘 provider마다 새 최소 버전에서 design.md '통과 기준'이 모두 통과한다.
6. **사람의 설치본 보호.** 실험의 각 단계 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다. 그 단계가 만들기로 적어 둔 항목만 다를 수 있고, 설명할 수 없는 차이가 나오면 실험을 멈춘다. Z0이 끝난 뒤에는 실험이 만든 항목도 남지 않는다.
7. **문서.** tasks.md Z1이 적은 문장이 현재 규칙으로 바뀌고, 이 디렉터리가 지워진다. 그 문장에는 PRODUCT.md:58의 숫자와 "fixed floors that do not follow the minimums", ARCHITECTURE.md:530의 낮출 때의 규칙, :434의 floor 서술이 들어간다. 올릴 때의 규칙(ARCHITECTURE.md:530)은 그대로 둔다. 어느 provider도 낮추지 않기로 정한 경우에는 ARCHITECTURE에 낮출 때의 규칙과 Antigravity에 최소 버전이 없는 이유만 더하고, 실험 관찰은 커밋 메시지에 남긴 뒤 디렉터리를 지운다.

## 범위

- **provider**: 다섯 provider 모두. Claude Code, Codex, Cursor, Copilot은 최소 버전을 낮출 후보를 찾는다. Antigravity는 최소 버전이 필요 없다는 판단과 그 근거만 확인한다.
- **경로**: Doan 연결 대화, 그리고 터미널 세션을 이어 가는 legacy external 경로(Claude Code·Codex만 있다, ARCHITECTURE §7 'Agent conversation runtime and IPC' 둘째 문단, ARCHITECTURE.md:430). legacy external은 임시 `CLAUDE_CONFIG_DIR`·`CODEX_HOME`으로 확인한다.
- **후보가 없는 provider**: 테스터의 가장 오래된 버전이 이미 지금 최소 버전 이상이거나 그 provider를 설치한 테스터가 없으면, 그 provider는 E1~E4를 건너뛰고 D1에서 지금 값을 유지한다. 테스터가 지금 최소 버전 이상인데도 다른 이유로 Update를 본다면(`version_incompatible` 등) 이 feature의 전제와 다르므로 E1 전에 사람에게 보고한다.
- **순서**: mcp-connectors가 main에 합쳐진 뒤 main에서 시작한다. 확인 목록의 MCP 항목이 그 코드에 기댄다.

## 비목표

- 최소 버전을 올리는 것, 최대 버전·검증된 상한·새 버전 경고. 상한을 두지 않는 것은 이미 정해져 있다(ARCHITECTURE.md:530).
- 최소 버전 아래의 CLI를 기능을 줄여 받아들이는 버전별 기능 게이팅. 사람이 거절 유지로 정했다.
- provider CLI를 Doan이 설치하거나 번들하는 것. Doan은 Antigravity 서버 말고는 provider CLI를 설치하지 않는다(ARCHITECTURE.md:530).
- Antigravity 서버의 고정 버전(1.3.0)과 번들 Claude Agent SDK(`BUNDLED_CLAUDE_SDK` 0.3.312, `prepare.ts:18`)를 바꾸는 것. 오래된 Claude Code가 이 SDK와 맞지 않으면 그 버전은 후보에서 빠진다.
- Update 문구, Update 버튼의 이동 대상, 버전 표시 화면을 바꾸는 것.
- 사용자 버전 통계를 모으는 기능. Doan에는 서버가 없다(PRODUCT §3 Out of scope 5). 사용자 버전은 테스터에게 Copy details를 받아 모은다.
