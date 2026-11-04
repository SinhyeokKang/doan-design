# mcp-connectors PoC 원본 (2026-11-04)

`.scratch/mcp-poc/`는 커밋되지 않아 다른 머신에서 볼 수 없으므로, task A0(픽스처 추출)에 필요한 원본만 여기에 옮겼다. 계정 식별자(이메일, 계정 id, 이름, 아바타 URL), OAuth `state`·`code_challenge` 값, 홈 경로, thread id는 지웠거나 자리표시자로 바꿨다. 토큰 값은 처음부터 들어 있지 않다. 이 디렉터리는 feature 디렉터리와 함께 Z1에서 지운다.

- `fixtures/`: P1·P3 상태 명령 출력. `claude mcp get`(등록 전, 인증 필요, 연결됨, 해제 뒤, Atlassian 연결됨), `claude mcp list`(인증 필요), `codex mcp list --json`(등록 전, 인증 필요, 연결됨, 해제 뒤).
- `p2/`: Codex app-server probe(`probe.mjs`, stdio echo 서버 `echo-mcp.mjs`)와 로그. `probe.log`는 재읽기·reload·`mcpServer/startupStatus/updated`, `probe-approval.log`와 `probe-accept.log`는 `mcpServer/elicitation/request`와 응답, `probe-mode-bypass.log`·`probe-mode-plan.log`는 권한 모드별 결과다. `McpServerElicitationRequest*.json`은 Codex 0.166.0 `codex app-server generate-json-schema`에서 뽑은 요청·응답 스키마다(전체 스키마는 같은 명령으로 다시 만든다).
- `links/`: Claude `mcp login`이 `BROWSER` hook으로 넘긴 인가 링크 세 개(Notion CIMD, Atlassian·Figma DCR). `mcpAuthLink` 픽스처용이다.
- `p4b/`: node-pty 패키징 설정 diff(`config-changes.patch`), node-pty 전후 `codesign` 출력, 패키지 앱 pty probe 결과.
- `notes/`: P1, P2–P4 관찰 기록(영문 메모).

P3 도구 호출 기록(`claude -p`, `codex exec` 출력)은 계정 정보가 많아 옮기지 않았다. 결과는 design.md 'PoC 결과'와 `notes/`에 있다.
