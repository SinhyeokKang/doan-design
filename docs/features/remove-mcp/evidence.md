# remove-mcp — 근거: 프로바이더 표

zero-setup-agents에서 옮겨 온 측정 기록이다. T0은 손으로 만든 배치, T6b는 앱이 만든 배치로 측정했다. 이 feature의 판단 근거이며, 이 feature가 끝나면 결론만 PRODUCT·ARCHITECTURE로 승격하고 이 파일은 함께 지운다.

## T0(zero-setup-agents). 프로바이더 표 PoC (사용자 허락: 2026-10-31)

- 환경: 임시 HOME(`<tmp>/home`)에 `Library/Keychains`만 실제 폴더로 링크한다(POSTMORTEM 2026-10-30). 실제 HOME의 옛 Connect 항목(복사된 `~/.agents/skills/doan/`, 깨진 `~/.local/bin/doan`)은 건드리지 않는다. 각 CLI가 임시 HOME에서 로그인이 필요하면 그 안에서 로그인하고, 끝난 뒤 그 로그인이 만든 Keychain 항목을 지우고 확인한다.
- 배치: design.md 배치 표를 손으로 만든다. `current`는 `go build -o <tmp>/Resources/bin/doan ./cli/cmd/doan`과 원본 stub을 담은 임시 `Resources`를 가리킨다. 가짜 앱 socket과 `DOAN_RUNTIME`을 쓴다. PATH에는 `<tmp>/home/.local/bin`을 넣는다.
- 측정: 다섯 프로바이더의 외부 CLI(`claude -p`, `codex exec`, `cursor-agent -p`, `copilot -p`, Antigravity CLI)에 (1) 사용 가능한 skill 목록에 `doan`이 몇 번 보이는지, (2) `doan skill`이 실행되는지, (3) `doan active --json --repo <tmp repo>`가 가짜 서버에 닿는지를 시킨다. 각 CLI의 기본 sandbox·승인 설정은 덮어쓰지 않는다. Codex는 `-s workspace-write -c approval_policy="never"`로 사용자 레이어 `doan.rules`가 있을 때와 없을 때를 비교한다.
- 실제 상태 보호: 실행 전후로 실제 HOME의 skill 위치, `~/.local/bin`, `~/.codex/rules`, 각 에이전트 설정 파일의 목록과 해시를 비교한다.
- 기록: 아래 표. 원본 로그는 `.scratch/zero-setup-agents/t0/`.
- 검증: 다섯 행이 모두 채워지고, 배치 표의 링크 집합과 완료 조건 5의 처리가 design.md에 반영된다. Claude·Codex 명령은 AGENTS.md 'Real-agent MCP check'와 같은 일회성 호출이다. Copilot·Cursor 명령은 아래 '측정 명령'과 Cursor 항목에 있다. Antigravity는 GUI 앱이라 computer-use로 조작했다.

2026-10-31 측정. 임시 HOME에 후보 위치마다 이름이 다른 probe skill(`probe-agents`, `probe-claude`, `probe-codex`, `probe-cursor`, `probe-copilot`, `probe-gemini`, `probe-antigravity`)을 두고 skill 목록을 물었다(측정 A). 그다음 `~/.agents/skills/doan`과 `~/.claude/skills/doan`만 두고 `doan skill`과 `doan active`를 시켰다(측정 B). 가짜 앱 socket을 썼다. 실행 전후 실제 HOME 지문은 같았고, Codex는 실제 `~/.codex/auth.json` 사본을 쓴 뒤 지웠다(사본은 바뀌지 않았다).

| 프로바이더 | 읽는 전역 skill 위치 | `doan` 보인 횟수 | `doan skill` | `doan active` | 허용 방식 |
|---|---|---|---|---|---|
| Claude Code 2.1.314 | `~/.claude/skills`만(측정 A) | 1 | 성공, end marker 있음 | 가짜 앱에 닿음(exit 0). sandbox 기본값 꺼짐 | 필요 없음 |
| Codex 0.164.0 | `~/.agents/skills`, `<CODEX_HOME>/skills`(측정 A) | 1 | 성공, end marker 있음 | rule 없음: `connect: operation not permitted`(exit 3). 사용자 레이어 `~/.codex/rules/doan.rules` 있음: 닿음(exit 0) | 사용자 레이어 rule 확인 |
| GitHub Copilot CLI 1.0.105 | `~/.copilot/skills`, `~/.agents/skills`(측정 A). `~/.claude/skills`는 읽지 않음 | 1 | 성공, end marker 있음 | 닿음(exit 0) | 필요 없음 |
| Cursor CLI 2026.10.22 | `~/.cursor/skills`, `~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills`(측정 A). 번들 코드상 `~/.cursor`·`~/.agents`는 항상, `~/.claude`·`~/.codex`·`~/.grok`은 third-party 설정이 켜졌을 때(`index.js`의 `Ds`, `Xs`). 이 계정은 켜져 있었다 | 1(`~/.agents`와 `~/.claude`의 두 링크가 같은 디렉터리로 풀리는데 한 번만 보임) | 성공, end marker 있음 | 닿음(exit 0). 기본 설정의 sandbox는 꺼져 있고, `--sandbox enabled`에서도 닿음 | 필요 없음 |
| Antigravity 2.0.6(앱) | `~/.gemini/config/skills`만(측정 A, 실제 HOME에 probe를 두고 앱 agent에 물음). `~/.agents`, `~/.claude`, `~/.gemini/skills`, `~/.gemini/antigravity/skills`는 읽지 않음 | 측정 B 안 함(실제 HOME에 doan 링크를 두지 않음) | 측정 안 함 | 명령 승인 대화상자("Allow running this command?")에서 "allow this time"을 고른 뒤 닿음(exit 0) | 필요 없음(승인만) |
| Antigravity IDE 2.5.5 | 측정 안 함. 이 머신에서 로그인돼 있지 않다("To use the agent, please login") | – | – | – | – |

- 측정 명령: Claude `claude -p "<prompt>" --allowedTools 'Bash(doan:*)'`, Codex `codex exec -s workspace-write -c 'approval_policy="never"' "<prompt>"`, Copilot `copilot -p "<prompt>" --allow-tool 'shell(doan)'`, 모두 `env -i`로 임시 HOME과 깨끗한 환경에서 실행했다(`.scratch/zero-setup-agents/t0/run.sh`).
- Cursor: 이 머신의 `cursor-agent`는 로그인돼 있지 않아서, 임시 HOME에서 `AGENT_CLI_CREDENTIAL_STORE=file NO_OPEN_BROWSER=1 cursor-agent login`을 실행하고 로그인 URL을 ego 브라우저에서 승인했다. 측정 뒤 `cursor-agent logout`으로 토큰을 지웠다. 측정 명령은 `env AGENT_CLI_CREDENTIAL_STORE=file cursor-agent -p "<prompt>" --output-format text --trust`이고, 임시 `cli-config.json`의 allow에 `Shell(doan)`을 더했다.
- Antigravity 2.0.6: 터미널 agent CLI가 없어 computer-use로 앱을 조작했다. 실제 HOME의 후보 위치 여섯 곳(`~/.agents/skills`, `~/.claude/skills`, `~/.gemini/skills`, `~/.gemini/antigravity/skills`, `~/.gemini/config/skills`, `~/.gemini/antigravity-ide/skills`)에 probe skill을 두고, 끝난 뒤 지웠다. 앱의 bugshot-2 프로젝트에 "Listing Available Skills" 대화가 남았다. socket 측정은 절대경로 CLI와 `DOAN_RUNTIME`을 명령에 넣어 했다.
- ego도 같은 세 곳에 링크를 둔다: `~/.agents/skills/ego-browser`, `~/.claude/skills/ego-browser`, `~/.gemini/config/skills/ego-browser`. 모두 2026-10-30 21:36에 생겼고 `~/.local/share/ego/ego-skills`를 가리킨다(홈 아래에서 `~/.local/share/ego`를 가리키는 링크를 모두 찾아 확인).
- 결론: skill 링크는 ego와 같은 세 곳이다. `~/.claude/skills`(Claude Code), `~/.agents/skills`(Codex, Copilot, Cursor), `~/.gemini/config/skills`(Antigravity). sandbox 우회가 필요한 것은 Codex뿐이고 사용자 레이어 rule로 해결된다. 그래서 완료 조건 5에서 T9로 넘길 프로바이더가 없다. 실행 전후 실제 HOME의 내용은 같았고, probe를 넣고 빼면서 디렉터리 mtime만 바뀌었다.

— commit: `docs(feature): zero-setup-agents provider matrix` (문서만, 지금 브랜치).

## T6b(zero-setup-agents). 앱이 만든 배치로 실제 에이전트 확인 (실행 시 사용자 허락 필요)

- T6과 같은 임시 HOME에서 앱이 만든 링크와 rule로 T0의 측정을 다시 한다. 앱 대화 Codex의 skill 중복이 Codex를 헷갈리게 하지 않는지도 본다.
- 검증: T0 표와 같은 열로 결과를 이 파일에 남기고, 링크 집합이 T0에서 정한 집합과 같다.

2026-10-31 측정. T6 프로브가 남긴 임시 HOME에서 패키지 앱(`<임시 HOME>/Applications/Doan.app`)을 다시 띄웠다. 설치 실행기는 모든 항목을 `keep`으로 판정했다. 앱이 만든 배치는 `~/.local/share/doan/{current,skill}`, `~/.local/bin/doan`, `~/.agents/skills/doan`, `~/.claude/skills/doan`, `~/.gemini/config/skills/doan`, `~/.codex/rules/doan.rules`이고, `~/.cursor/skills/doan`과 `~/.copilot/skills/doan`은 없다. 이 링크 집합은 T0에서 정한 집합과 같다. 가짜 socket 대신 실행 중인 앱의 socket을 썼고, 앱에 임시 repo를 프로젝트로 등록했다. 측정 명령과 `env -i` 환경은 T0과 같고, PATH에서 실제 `~/.local/bin`은 뺐다(에이전트 CLI는 절대경로로 실행).

| 프로바이더 | 읽는 전역 skill 위치 | `doan` 보인 횟수 | `doan skill` | `doan active` | 허용 방식 |
|---|---|---|---|---|---|
| Claude Code 2.1.314 | `~/.claude/skills/doan`(앱이 만든 링크, T0에서 Claude가 읽는 유일한 위치) | 1 | 성공, end marker `v0.1.0` 있음 | 앱에 닿음(exit 0) | 필요 없음 |
| Codex 0.164.0 | `~/.agents/skills/doan`(Codex가 `r0/doan/SKILL.md`로 보고) | 1 | 성공, end marker 있음 | `-s workspace-write`, `approval_policy="never"`, 앱이 쓴 `~/.codex/rules/doan.rules`로 닿음(exit 0). `doan onboarding status`도 sandbox 밖에서 앱에 닿았다(앱이 `session_stale`로 답함, exit 3) | 앱이 쓴 사용자 레이어 rule |
| GitHub Copilot CLI 1.0.105 | `~/.agents/skills/doan`(Copilot이 이 경로를 보고) | 1 | 성공, end marker 있음 | 앱에 닿음(exit 0) | 필요 없음 |
| Cursor CLI 2026.10.22 | 측정 못 함 | – | – | – | – |
| Antigravity 2.28.2(앱) | `~/.gemini/config/skills/doan`(Antigravity가 이 경로를 보고) | 1 | 성공(절대경로 CLI), end marker 있음 | 기본 preset에서는 승인을 묻지 않고 sandbox 안에서 실행해 `connect: operation not permitted`(exit 3). sandbox 밖 실행을 요청하라고 하자 "Allow run doan active --json?"가 떴고, "Yes, allow this time"을 고른 뒤 닿음(exit 0) | 에이전트가 sandbox 밖 실행을 요청하고 사람이 한 번 승인 |

- Cursor: 임시 HOME 로그인(`AGENT_CLI_CREDENTIAL_STORE=file NO_OPEN_BROWSER=1 cursor-agent login`, ego 브라우저에서 승인)은 성공했다. 그러나 계정이 사용 한도에 걸려("You've hit your usage limit") `-p` 실행이 모두 exit 1로 끝났다(`--model auto`도 같음). 로그아웃한 뒤 `cursor-agent status`가 "Not logged in"이고, 임시 HOME에 토큰 파일이 남지 않았다.
- Antigravity: 앱이 2.0.6(T0)에서 2.28.2로 바뀌었다. T0에서는 첫 실행에서 명령 승인 대화상자가 떴지만, 2.28.2는 기본 preset에서 명령을 sandbox에 넣어 승인 없이 실행하고 socket 연결을 막는다. 에이전트는 `app_not_running`의 `nextSteps`("run `doan` outside the sandbox or request approval")를 받았고, sandbox 밖 실행을 요청하자 승인 한 번으로 닿았다. 에이전트가 스스로 다시 요청하는지는 확인하지 않았다(프롬프트가 재시도를 막았다). T0과 같이 실제 HOME `~/.gemini/config/skills/doan`에 임시 HOME의 `~/.local/share/doan/skill`을 가리키는 링크를 측정 동안만 두었고, 끝난 뒤 지웠다. 앱의 bugshot-2 프로젝트에 "Doan Skill and Runtime Diagnostics" 대화가 남았다. 앱을 처음 띄울 때 보안 안내(데이터 공유 체크박스는 끈 채로)를 수락했다.
- 앱 대화 Codex의 skill 중복: 실제 앱 대화 대신 같은 skill 배치를 `codex exec`로 재현했다(`CODEX_HOME`=프로필 stub `skills/doan/SKILL.md`를 둔 임시 폴더, HOME=임시 HOME). Codex는 `doan`을 두 번 나열했고(`r0`, `r1`), 하나를 골라 `doan skill`을 정상 실행했다. 헷갈린 흔적은 없다. 이 재현에서 `doan active`는 sandbox에 막혔다. `CODEX_HOME`이 프로필이면 `~/.codex/rules`가 사용자 레이어가 아니기 때문이다. 실제 앱 대화는 앱의 명령 승인 흐름을 쓰므로 이 결과로 판단하지 않는다.
- 실제 상태 보호: 실행 전후로 실제 HOME 지문(T0 `snapshot.sh` 항목과 `app/runtime/real-state.ts`)을 비교했다. 바뀐 것은 Antigravity 앱이 스스로 쓴 것뿐이다(`~/.gemini/config/config.json`, `node_modules/`, `plugins/`, `~/.gemini/sandbox/`, `~/.gemini/jetski-standalone-oauth-token`, Keychain 항목 `gemini`의 수정 시각). 이것들은 Antigravity 상태라 지우지 않았다. `~/.claude`의 mtime 변화는 같은 시각 다른 워커의 Claude 실행(`~/.claude/projects/-private-tmp-doan-eval-…`)에서 왔다. Codex 인증은 실제 `~/.codex/auth.json` 사본을 쓴 뒤 지웠고, 원본 해시는 그대로다. 임시 HOME의 `Library/Keychains` 링크도 지웠다.
- 원본 로그와 스크린샷: `.scratch/zero-setup-agents/t6b/`.

