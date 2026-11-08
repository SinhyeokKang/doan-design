# provider-profile-isolation — spec

`docs/BACKLOG.md` 'Known defects'의 네 줄을 다룬다.

- 격리 HOME으로 띄운 runtime probe에서도 Antigravity가 실제 `~/.gemini/antigravity-cli/`에 쓴다(로그, crash log, `cli.log`). 격리 HOME의 `Library/Keychains`를 실제 폴더에 링크한 상태에서는 Antigravity 대화가 실제 Keychain 항목 `gemini | antigravity`도 바꿨다(2026-11-03 13:35:40, language server가 "You are not logged into Antigravity"를 남긴 같은 초). 사람의 `agy` 로그인이 바뀌었는지는 확인하지 않았다.
- 한 provider의 agent가 다른 provider의 Doan profile을 읽는다. 2026-11-03 MCP PoC에서 Antigravity 대화가 shell 도구로 `<userData>/agent-auth/profiles/claude/projects/` 아래 Claude transcript를 읽고 그 내용으로 답했다.
- Antigravity 대화가 프로젝트 밖에서 일했다. `session/new`의 `cwd`가 프로젝트인데, agent가 Doan userData의 `<profile>/.gemini/antigravity-cli/skills/`에 파일을 쓰고 `ls -la`를 실행했다(permission request의 `TargetFile`·`Cwd`, 2026-11-05 agent-questions D2). 원인은 모른다.
- 로그아웃이 `stop_required`로 답한 동안 앱을 종료하면 그 profile의 Keychain 항목(`Codex Auth`)이 남는다. userData를 지워도 지워지지 않는다(그 profile 경로로 `codex logout`을 실행하면 지워진다). 종료가 로그아웃을 끝내야 하는지, 보류된 로그아웃을 기록해야 하는지는 정해지지 않았다.

## 사용자

- **사람**(앱에서 보고, 가리키고, 말하는 사람). Doan에 둘 이상의 provider를 연결해 쓰는 사람이 대상이다. 이번 라운드가 끝나면:
  - Doan에 연결된 provider A의 agent가 Doan이 가진 provider B의 대화 기록과 자격 증명 작업 사본을 읽지 못한다.
  - Doan의 Antigravity가 사람의 `agy` 로그인(Keychain 항목)과 실제 `~/.gemini/antigravity-cli/`를 바꾸지 않는다.
  - 화면은 바뀌지 않는다. 막힌 읽기는 agent의 도구 실패로 대화에 보인다. 예외: P1에서 Antigravity의 실제 상태 쓰기를 막을 방법이 없고 그 쓰기가 사람의 `agy` 로그인을 바꾸면, Antigravity의 로그인과 새 대화를 막고 Settings > Agents에 이유를 보인다(결정 Q6).
- **agent**(Doan 연결 대화에서 도는 agent). Doan userData 중 허용된 경로 밖을 읽거나 쓰면 실패한다. 자기 profile, `doan` CLI(`work`·`open`·`handoff`), 붙여넣은 이미지 첨부는 지금처럼 쓴다. 저장소, 사람의 실제 HOME, 네트워크는 지금과 같다.
- **개발자**(runtime probe를 돌리는 사람과 agent). 격리 HOME probe가 실제 `~/.gemini/antigravity-cli/`와 실제 Keychain 항목을 바꾸지 않는다.

## 보호 범위 (결정 Q1)

결정: **Doan 연결 대화에서 도는 agent로부터 Doan userData의 다른 provider 데이터를 지킨다.** 승격 때 ARCHITECTURE §7의 "The app does not sandbox the agent"를 이 범위로 좁혀 고친다.

- 지키는 것: 다른 provider의 profile 전체(대화 기록, 설정, 실행 중에만 있는 평문 작업 사본 — Cursor `.cursor/auth.json`, Antigravity `acp_token.json`, Copilot `.copilot/config.json`의 GitHub token), Doan 자신의 대화 기록(`<userData>/conversations/`, 모든 provider의 대화가 들어 있다), vault와 metadata, 그 밖의 userData 파일.
- 지키지 않는 것: 같은 사용자로 도는 다른 프로세스(사람의 터미널 agent, Orca 등)가 userData를 읽는 것. macOS 파일 권한은 같은 uid의 프로세스를 구분하지 못한다(profile은 이미 0700이다).
- 고르지 않은 것: agent 전체 sandbox(PRODUCT §3 'Resume and permissions'를 바꾼다), 막지 않고 문서화만 하기(Copilot GitHub token의 평문 작업 사본처럼 Doan 때문에 생긴 노출이 남는다).

## 문제 (관찰된 사실)

1. **profile 사이에 경계가 없다.** 모든 profile이 `<userData>/agent-auth/profiles/<profile>/`(0700) 아래 있고 agent는 같은 uid로 sandbox 없이 돈다(ARCHITECTURE §7 'Agent conversation runtime and IPC'). 그래서 한 agent가 다른 profile의 transcript를 읽었다. vault provider의 평문 작업 사본은 그 provider의 run이 도는 동안 profile에 있으므로, 같은 때 도는 다른 provider의 agent가 읽을 수 있다(관찰되지는 않았다).
2. **Antigravity가 Doan 밖의 상태를 바꾼다.** Doan은 Antigravity 프로세스에 `HOME=<profile>`과 `GEMINI_HOME=<profile>/.gemini`를 준다(`agentAuth/environment.ts`). 그런데도 실제 `~/.gemini/antigravity-cli/`에 쓰기가 생겼고, 실제 Keychain 항목 `gemini | antigravity`가 바뀌었다. 어느 프로세스가 어떤 방법으로 home을 찾는지는 확인하지 않았다. 이것은 ARCHITECTURE §7의 "it never reads, copies or changes those external credentials"와 어긋난다.
3. **Antigravity가 자기 profile 안에서 일했다.** ACP 서버의 프로세스 cwd는 프로젝트다(`conversation/acpRunner.ts`의 `spawn`이 `input.cwd`를 쓴다). 그러니 프로세스 cwd 문제는 아니다. 추정: `HOME`이 profile이라 agent가 `~/.gemini/antigravity-cli/skills`(ACP 서버의 skill 경로 중 하나, POSTMORTEM 2026-11-07)를 자기 skill 경로로 보고 거기서 일했다. 확인되지 않았다.
4. **확인하지 않은 로그아웃이 종료로 사라진다.** 로그아웃이 `stop_required`를 받으면 renderer가 확인 대화상자를 연다(`renderer/agentAuthView.ts` `replyEffect`). 사람이 답하지 않고 종료하면 로그아웃은 실행되지 않고, 연결과 Keychain 항목이 그대로 남아 다음 실행에서도 연결된 상태다. 그 뒤 사람이 userData를 지우면 Keychain 항목은 고아가 된다. 이것은 `stop_required`와 무관하게 연결된 Claude Code·Codex라면 모두 같다.

## 완료 조건

1. **Antigravity 실제 상태.** 격리 HOME(`Library/Keychains`를 실제 폴더에 링크한 경우 포함)의 dev 앱에서 Antigravity 연결 확인, 대화 한 턴, 로그아웃을 해도 `app/runtime/real-state.ts`의 실제 `~/.gemini/antigravity-cli` fingerprint와 Keychain 항목 `gemini | antigravity`의 수정 시각이 바뀌지 않는다. 실제 HOME에서 도는 경우에도 Antigravity 프로세스가 `<real HOME>/.gemini/antigravity-cli/`에 쓰지 않는다는 것을 PoC 결과로 보인다. 막을 방법이 없으면 P1 결과에 따라 나눈다(결정 Q6): 사람의 `agy` 로그인을 바꾸면 Antigravity의 로그인과 새 대화가 막힌다. 로그·설정 파일 쓰기뿐이면 ARCHITECTURE §7 'Known limits'에 적는다.
2. **profile 경계.** 다섯 provider의 Doan 연결 대화에서 agent의 shell 명령과 파일 도구가 다른 provider의 profile, `<userData>/conversations/`, vault·metadata 파일을 읽지도 쓰지도 못한다. Ask first와 Full access 두 모드에서 확인한다(Accept edits와 Plan은 둘 사이에 있으므로 단위 테스트로 같은 fence가 붙는 것만 확인한다).
3. **지금 되는 것은 그대로.** fence 안에서도 로그인 유지(Keychain), 새 대화와 재시작 뒤 resume, `doan work update`·`doan open`·`doan handoff`, 붙여넣은 이미지 첨부, Codex Ask first의 자체 sandbox 명령 실행과 sandbox 밖 실행 요청, MCP connectors, Claude·Codex의 turn-end 사용량 읽기, Claude 다음 메시지 제안이 된다.
4. **fail closed.** fence를 세울 수 없으면(실행 파일이 없음, 정책 파일을 쓸 수 없음, 경로가 정책에 넣을 수 없는 문자를 가짐) 그 run은 시작하지 않고 기존 시작 실패로 끝난다. 새 실패 코드와 문구는 없다. 단위 테스트로 확인한다(결정 Q5).
5. **Antigravity profile 작업.** 문제 3의 원인을 PoC로 분류했고, 결과에 따른 처리(fence에 포함 또는 Non-goal로 기록)가 ARCHITECTURE에 있다.
6. **로그아웃과 종료.** 확인하지 않은 로그아웃이 종료로 취소되고 연결이 남는다는 것, userData를 지워도 Claude Code·Codex의 Keychain 항목이 남는다는 것이 ARCHITECTURE §7 'Known limits'에 있다. 동작은 바꾸지 않는다(결정 Q4).
7. **BACKLOG 정리.** 네 줄이 해결되어 지워지거나, 남는 부분이 ARCHITECTURE 'Known limits'나 BACKLOG의 새 줄로 옮겨진다.

## Non-goals

- **agent 전체 sandbox.** 실제 HOME, 다른 저장소, 네트워크는 막지 않는다. ARCHITECTURE §7 "The app does not sandbox the agent"와 PRODUCT §3 'Resume and permissions'의 "Ask first applies the user's own permission and sandbox settings"를 유지한다. 이번 fence는 Doan userData의 경로만 막는다.
- **같은 사용자의 다른 프로세스로부터 userData 보호.** 같은 uid이므로 OS 파일 권한으로 막을 수 없다. 사람의 터미널 agent는 지금처럼 userData를 읽을 수 있다.
- **legacy external run에 fence 붙이기.** 터미널 세션 resume은 사람 자신의 profile과 설정으로 돈다. 같은 agent를 터미널에서 돌리면 어차피 userData를 읽을 수 있어 막는 효과가 없고, 사람의 sandbox 설정과 겹칠 위험만 생긴다.
- **대화가 아닌 provider 프로세스에 fence 붙이기**(로그인, 상태 확인, 로그아웃, 모델 목록, 사용량 fresh read, MCP connector 명령, Codex identity lookup). 이들은 model의 도구 호출을 실행하지 않는다(결정 Q2). 예외: P1에서 Antigravity가 design §3.2 경로 2(fence로 막기)로 가면 Antigravity 서버를 띄우는 모든 곳에 fence를 붙인다.
- **자기 profile 안의 데이터 보호.** agent가 자기 provider의 대화 기록이나 자기 작업 사본을 읽는 것은 provider 자신의 데이터다. 단, P3에서 agent 동작으로 밝혀지면 Antigravity가 자기 skill 경로에 쓰는 것은 막는다(결정 Q3).
- **userData를 지운 뒤 남는 Keychain 항목 정리.** PRODUCT §5 item 0 'Agent setup'의 Not included가 uninstall flow를 뺀다. Doan은 userData 삭제를 알 수 없고, 사람의 다른 Keychain 항목을 읽거나 지우지 않는다(ARCHITECTURE §7 'Agent authentication'). 같은 경로로 다시 로그인하면 Codex는 로그인 전에 기존 로그인을 지우고(`loginClears`), Claude는 덮어쓴다.
- **종료가 보류된 로그아웃을 끝내거나 기록하기.** 하지 않는다(결정 Q4). 답하지 않은 확인은 취소와 같고, 연결이 남아 보이므로 사람이 다시 로그아웃할 수 있다.
- **tool-fact probe의 `~/.codex`, `~/.local/share/cursor-agent` 쓰기.** ARCHITECTURE §7 'Known limits'가 이미 받아들인 한계다. 이번 라운드는 Antigravity의 실제 상태 쓰기만 다룬다.
- **대화 기록 암호화.** provider가 자기 형식으로 profile에 쓰는 파일이다.
- **Antigravity "Tool call was approved but never executed."**(BACKLOG) — 다른 결함이다.
