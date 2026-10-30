# zero-setup-agents — design

## 레퍼런스: ego lite

ego lite 0.6.2.5(`/Applications/ego lite.app`)와 공개 리포 `citrolabs/ego-lite`(MIT, commit `12407167`, 2026-10-30)에서 확인한 사실이다. 앱의 설치 코드는 공개 리포에 없어서, 프레임워크 바이너리 문자열과 이 머신에 쓰인 파일로 확인했다. 원본 자료는 세션 scratchpad에 있고 커밋하지 않는다.

**시작할 때 설정한다.** `ego Framework`의 `../../ego/browser/agent/ego_agent_browser_mode_manager.cc` / `MaybeSetupAgentsOnStartup` 옆에 다음 문자열이 모여 있다: `.local/share/ego`, `ego-skills`, `active_version_dir`, `Resources/ego-skills/ego-browser`, `SKILL.md`, `skills/ego-browser`, `.codex/rules/default.rules`, `prefix_rule(pattern=["ego-browser"], decision="allow")`, `Helpers/ego-browser`. 공개 install 문서는 "Onboarding registers the `ego-browser` command on the PATH", README는 "ego lite adds the `ego-browser` skill to every agent's skills directory"라고 쓴다.

**이 머신에 쓰인 것** (모두 2026-10-30 21:36, 같은 시각에 `ego lite --startup-ego-browser-service` 프로세스가 시작됐다):

```
~/.local/share/ego/active_version_dir -> /Applications/ego lite.app/Contents/Frameworks/ego Framework.framework/Versions/0.6.2.5
~/.local/share/ego/ego-skills         -> ~/.local/share/ego/active_version_dir/Resources/ego-skills/ego-browser
~/.local/bin/ego-browser              -> ~/.local/share/ego/active_version_dir/Helpers/ego-browser
~/.claude/skills/ego-browser          -> ~/.local/share/ego/ego-skills
~/.agents/skills/ego-browser          -> ~/.local/share/ego/ego-skills
~/.gemini/config/skills/ego-browser   -> ~/.local/share/ego/ego-skills
~/.codex/rules/default.rules          prefix_rule(pattern=["ego-browser"], decision="allow")
```

- MCP 등록은 없다(`~/.claude.json` user MCP는 `figma`, `malmoi`, `~/.codex/config.toml`에 ego 없음). `CLAUDE_CONFIG_DIR`은 따르지 않는다. Orca profile에서도 보이는 것은 profile의 `skills`가 `~/.claude/skills`를 가리키는 링크이기 때문이다.
- 버전이 바뀌면 `active_version_dir` 하나만 고치면 된다. 나머지 링크는 그 링크를 거쳐 가므로 그대로다.
- PATH: `~/.local/bin`이 PATH에 있는지는 `.zshrc`를 정규식(`$HOME/.local/bin`, `${HOME}/.local/bin`, `~/.local/bin`)으로 읽고 `whence -p`로 확인한다. 바이너리에는 `/usr/local/bin`, `export PATH="$HOME/.local/bin:$PATH"`, 그리고 관리자 권한 osascript 스크립트가 있다. 그 스크립트는 부모 디렉터리를 만들고, 대상이 링크이고 값이 다르면 지우고 다시 만들며, 대상이 없으면 만들고, 링크가 아닌 파일이 있으면 그대로 둔다. 이 로직은 관리자 권한 블록(`/usr/local/bin`) 안에 있다. 사용자 디렉터리 링크도 같은 로직으로 쓰는지는 추정이다.
- skill은 discovery stub이다. `ego-browser skill`이 번들 안 SDK 옆의 guide를 출력한다(`docs/ego-browser-skill-command.md`). Doan의 stub/guide 구조(ARCHITECTURE §6)와 같다.
- sandbox: CLI 바이너리에 "Agent note: ego-browser cannot connect to the ego_cli bootstrap from the default agent sandbox. Retry with Full Access or run ego-browser outside the agent sandbox."라는 문구가 있다. 그래서 Codex는 rule로 sandbox를 비켜 간다. Codex 문서 Rules(learn.chatgpt.com/docs/agent-configuration/rules): `allow`는 "outside the sandbox without prompting", "Codex scans `rules/` under every active config layer at startup … the user layer at `~/.codex/rules/`".
- 업데이트: 앱에 업데이터가 있고(`ego-browser upgrade`), CLI는 업데이트가 있으면 `[ego-browser:notice]` 한 줄로 에이전트에게 알린다(`package/ego-browser/src/update-notice.ts`). Doan의 자동 업데이트는 #9 `dist`라 이번 범위가 아니다.

**실험** (codex-cli 0.164.0, 이 머신의 Codex 설정은 `danger-full-access`라 `-s workspace-write -c approval_policy="never"`로 덮어씀, 가짜 앱 socket 사용):

| run | 조건 | 결과 |
|---|---|---|
| 1 | rule 없음 | ego-browser `listTaskSpaces` exit 0(사용자 rule 적용), `doan active` exit 3 `connect: operation not permitted`, workspace 밖 읽기 성공, workspace 밖 쓰기 `Operation not permitted` |
| 2 | 프로젝트 `.codex/rules/doan.rules`에 `prefix_rule(pattern=["doan"], decision="allow")` | `doan active` exit 0, 가짜 서버가 요청을 받음 |
| check | `codex execpolicy check` | `prefix_rule(pattern=["doan", ["active", "onboarding"]])`는 `doan active`·`doan onboarding start` allow, `doan init` 매칭 없음. `pattern=["doan"]`에서 절대경로 `…/doan active`는 `--resolve-host-executables`일 때만 매칭. 절대경로 패턴(`["/Users/x/.local/bin/doan"]`)은 그 경로에 그대로 매칭(tech 리뷰 확인) |

## 영향 받는 구성 요소

- **app (main)**: 새 모듈 하나가 시작할 때 링크, `/usr/local/bin/doan`(필요할 때), Codex rule 파일을 확인한다. Settings > Connections와 그 IPC, MCP 등록, stub 복사 쓰기를 지운다. `about:read`가 설치 결과를 함께 돌려준다. `PRESET_GUIDANCE`(`app/src/main/conversation/prompt.ts`)의 Connections 문구를 바꾼다.
- **app (renderer)**: Settings 카테고리에서 Connections를 지운다. About의 doan command 행 아래에, 건너뛴 항목이 있을 때만 항목별 알림 줄을 보인다('About 알림'). Agents lead의 "see Connections." 문장(`SettingsPage.tsx`)을 바꾼다.
- **app/runtime**: `real-state.ts`의 실제 상태 지문에 새 대상(`~/.local/share/doan`, `/usr/local/bin/doan`, `~/.codex/rules/doan.rules`, Cursor·Copilot·Gemini skill 위치)을 더한다. 앱 실행만으로 HOME에 쓰게 되므로, 이것이 없으면 실수로 실제 HOME에 쓴 프로브가 통과한다.
- **패키징**: stub을 `Resources/skills/doan/SKILL.md`로 번들에 넣는다(`app/package.json` `build.extraResources`, 원본은 지금의 `app/src/main/onboarding/SKILL.md`).
- **CLI (Go)**: `active`, `onboarding`의 `app_not_running` `nextSteps` 문구. 첫 단계 "Ask the user to open Doan"은 앱이 꺼진 경우도 덮으므로 남긴다. `cli/internal/cli/skill.md` guide의 Settings 안내. 이 문구를 단언하는 Go 테스트(`active_test.go`, `design_skill_test.go`, `skill_test.go`). 동작은 바뀌지 않는다.
- **skill stub**: "connecting this agent in Doan (Settings… > Connections)"를 "Applications에서 Doan을 열고 Settings… > About을 보라고 사람에게 안내"로 바꾼다. 대체 경로는 넣지 않는다. PATH는 `/usr/local/bin` 링크가 해결하므로, "다른 Doan 바이너리를 찾거나 실행하지 말라"는 문장(U-010)은 그대로 둔다.
- **eval**: `eval/scenarios/D4/rubric.md`, `D4b/rubric.md`가 기대하는 "Settings… > Connections" 안내를 새 문구로 바꾼다.
- **`doan mcp`**: 바뀌지 않는다.
- **formats**: 없음. runtime.json, socket 메시지, schema는 그대로다.

## 배치 (ego를 그대로 옮김)

```
~/.local/share/doan/current   -> <Doan.app>/Contents/Resources
~/.local/share/doan/skill     -> ~/.local/share/doan/current/skills/doan
~/.local/bin/doan             -> ~/.local/share/doan/current/bin/doan
/usr/local/bin/doan           -> ~/.local/share/doan/current/bin/doan   (~/.local/bin이 PATH에 없을 때만, 관리자 권한)
~/.agents/skills/doan         -> ~/.local/share/doan/skill      (Codex)
~/.claude/skills/doan         -> ~/.local/share/doan/skill      (Claude Code, ~/.claude가 있을 때)
~/.gemini/config/skills/doan  -> ~/.local/share/doan/skill      (Antigravity, ~/.gemini가 있을 때)
~/.codex/rules/doan.rules     prefix_rule(pattern=["doan"], decision="allow")   (~/.codex가 있을 때)
```

- 표의 `~`는 설명용이다. 실제 링크 값은 주입받은 HOME으로 만든 절대경로다(ego도 절대경로). `current`의 값은 `process.resourcesPath`를 realpath로 푼 경로다.
- 앱이 옮겨지거나 바뀌면 `current`만 다시 쓴다. 같은 경로에서 번들이 교체되면 아무것도 다시 쓰지 않아도 새 CLI·stub·guide가 쓰인다(완료 조건 2). 이 머신의 깨진 `~/.local/bin/doan`처럼 특정 빌드를 직접 가리키는 문제가 사라진다.
- 프로바이더 personal skill 위치는 agent-auth가 Doan 프로필에서 확인한 값을 출발점으로 삼는다(`app/src/main/agentAuth/providers.ts`: Claude `<config>/skills`, Codex `<CODEX_HOME>/skills`, Cursor `~/.cursor/skills`, Copilot `~/.copilot/skills`, Antigravity `<GEMINI_HOME>/skills`). 외부 세션이 공유 위치(`~/.agents/skills`, `~/.claude/skills`)도 읽는지는 확인되지 않았다. 두 곳을 다 읽는 프로바이더에 링크를 둘 다 두면 `doan` skill이 두 번 보인다(PRODUCT 'Open questions': Codex가 두 `doan` skill을 나열한 관찰). T0 측정: Claude는 `~/.claude/skills`만, Codex·Copilot은 `~/.agents/skills`, Cursor는 `~/.agents/skills`(설정에 따라 `~/.claude/skills`도), Antigravity 2.0.6은 `~/.gemini/config/skills`만 읽는다. 그래서 ego와 같은 세 링크면 다섯 모두에 닿는다. `~/.cursor/skills`·`~/.copilot/skills` 링크는 두지 않는다(두면 중복). Cursor는 `~/.agents`와 `~/.claude`의 링크가 같은 디렉터리로 풀릴 때 한 번만 보였다.
- Codex rule은 Doan 전용 파일 `doan.rules`에 쓴다. ego는 `default.rules`를 쓰지만, 그 파일은 Codex TUI가 사용자 승인을 저장하는 곳이라 Doan이 고치지 않는다. Codex는 `rules/` 아래 모든 `.rules`를 읽는다(Codex 문서). 허용 범위는 ego처럼 `doan` 전체다(사용자 결정). socket이 필요한 것은 `active`, `onboarding`뿐이지만, 모든 doan 명령이 sandbox 밖에서 승인 없이 실행된다. 그 결과 `--repo`가 가리키는 workspace 밖 임의 경로의 `.doan/`·`.gitattributes` 쓰기(`init`, `config`, `comment resolve`), userData `sessions.jsonl` 쓰기, socket을 거친 onboarding 쓰기(프로젝트 선택·초기화, clone, sign-in 시작)가 승인 없이 실행된다. ARCHITECTURE §5의 "keep human approval for MCP writes"와 반대 방향이므로 '결정 영향'에 적는다.
- **`/usr/local/bin`**: 시작할 때 이미 도는 로그인 셸 프로브(`app/src/main/index.ts`의 `shellForFacts`, `probeShell`)의 PATH에 `~/.local/bin`이 없을 때만 쓴다. ego처럼 `/usr/bin/osascript`의 `do shell script … with administrator privileges`로 부모 디렉터리를 만들고 링크를 쓴다. 대상의 소유 판정은 아래 규칙과 같다(Doan이 만든 링크만 교체). 사람이 대화상자를 취소하면 그 사실을 userData에 기록하고 다시 자동으로 묻지 않는다. About 알림이 rc 파일과 `export PATH="$HOME/.local/bin:$PATH"` 줄을 보인다(지금 Connections가 쓰는 `rcFileFor`·`PATH_LINE`을 About 알림용으로 옮긴다). 앱은 rc 파일을 직접 고치지 않는다.

## 언제, 어떤 복사본이 쓰는가

- main `app.whenReady` 뒤 한 번, 창 표시와 무관하게 비동기로 실행한다. 실패와 건너뛴 항목은 로그에 남기고, main이 이번 실행의 결과를 메모리에 둔다. 평소에는 UI가 없다(사용자 결정: 건너뛴 것이 있을 때만 About). 매 실행마다 같은 확인을 반복하므로, 사라지거나 깨진 링크와 나중에 생긴 프로바이더 폴더는 다음 실행에서 반영된다.
- 쓰는 조건: `app.isPackaged`이고, 번들 경로가 `/Applications/` 또는 `<HOME>/Applications/` 바로 아래이며, translocation 상태가 아니다. 개발 빌드, `npm run package`가 만든 `app/dist/mac-arm64/Doan.app`, 다른 worktree의 빌드는 쓰지 않는다. 번들 이름은 보지 않는다. 두 허용 위치에 복사본이 있으면 마지막에 실행한 쪽이 `current`를 가져간다(사용자 결정). 버전은 비교하지 않는다.
- 프로바이더 폴더(`~/.claude`, `~/.codex`, `~/.gemini`)는 만들지 않는다. 폴더가 있을 때만 그 안의 `skills/`, `config/skills/`(필요하면 생성)나 `rules/`에 쓴다. `~/.local/share/doan`, `~/.local/bin`, `~/.agents/skills`는 만든다(사용자 결정).
- HOME은 `os.homedir()`가 아니라 주입받는다. 테스트와 runtime 프로브는 임시 HOME 아래 `Applications/Doan.app` 복사본으로 실제 HOME을 건드리지 않고 같은 경로를 검증한다.
- 첫 실행(first run)과 무관하다. 첫 실행 화면은 바뀌지 않는다.

## About 알림

- 설치 결과는 기존 `about:read`의 `AboutRead`(`app/src/main/aboutView.ts`)에 필드 하나로 더한다. 새 채널을 만들지 않으므로 Retry, 창 focus 때 다시 읽기, Copy details(`about:copy`)가 같은 읽기를 공유한다. `about:read`는 설치 promise가 끝날 때까지 기다렸다가 답한다(AuthIpc의 첫 probe를 기다리는 것과 같은 방식). 그래서 결과가 아직 없을 때 "알림 없음"이 성공처럼 보이지 않는다.
- 결과는 항목 목록 `{target, path, reason, providers}`이다. 이유는 `foreign`, `write-failed`, `admin-cancelled`(PATH 줄 포함), `not-eligible`(`dev`, `outside-applications`, `translocated`)이다. 뒤에 오는 feature가 이유를 더할 수 있게 문자열이 아니라 목록으로 둔다.
- 항목마다 한 줄을 고정된 순서로 보인다: 조건 불충족 → CLI 링크(`current`, `~/.local/bin`, `/usr/local/bin`) → skill 링크 → Codex rule. 줄마다 영향받는 에이전트(CLI 링크는 전부, skill 링크는 해당 프로바이더, rule은 Codex), 경로, 할 일과 "then reopen Doan"을 담는다. 조건 불충족 문구는 에이전트 상태가 아니라 이 복사본을 말한다(예: "This copy doesn't set up agents. Open Doan directly from Applications."). Applications에 정상 복사본이 따로 있을 수 있기 때문이다.
- 알림은 live region이 아닌 정적 텍스트로 doan command 행 안에 둔다(DESIGN.md 'Lines under a row' helper 재사용). 아이콘은 `aria-hidden`, 경로는 선택 가능한 `<code>`. 버튼은 없다. Copy details에 알림 줄 전체를 넣어 키보드로도 경로를 복사할 수 있게 한다.
- 알림은 이번 실행의 결과다. 사람이 원인을 치워도 Doan을 다시 열기 전에는 바뀌지 않으며, 문구가 이것을 말한다.
- 문구를 만드는 `aboutNotice`는 `node:fs`를 import하지 않는 파일에 둔다(renderer import 경계, `rendererImports.test.ts`). 정확한 문구는 `/design-draft`에서 새 파일 `.doan/canvases/zero-setup-agents.html`에 정한다. 기존 `buzz-settings.html`은 main에 있는 화면의 draft라 고치지 않는다.

## draft 요청 (T0b)

- 상태: 사용자가 2026-10-31 draft round 1(`501db9fe`)을 확정했다. `/design-sync`는 `about-skipped`, `about-several`, `about-not-eligible`, `agents`를 비교 기준으로 쓴다.

- canvas: `.doan/canvases/zero-setup-agents.html`, id `zero-setup-agents`, width 2560. 출시된 About·Agents 창(`buzz-settings.html`의 `about`, `agents` 창과 `SettingsAbout.tsx`, `SettingsPage.tsx`)을 옮겨 그리고, 사이드바에서 Connections만 뺀다.
- frame:
  - `about` — Settings · About, 모두 설치됨(알림 없음).
  - `about-skipped` — 건너뛴 항목 하나(`~/.local/bin/doan` 자리에 Doan이 만들지 않은 파일).
  - `about-several` — 여러 항목: `admin-cancelled`(PATH 줄 포함), Claude skill 링크 foreign, Codex rule `write-failed`.
  - `about-not-eligible` — 이 복사본이 쓰는 조건을 만족하지 않음(Applications 밖).
  - `states-not-eligible` — 상태 타일: 개발 빌드, translocation.
  - `agents` — Settings · Agents, 새 lead 문장.
- 알림은 doan command 행 안의 `doan-preference-row-extra`에 두는 `doan-notice`다. 건너뛴 항목은 `warning`, 조건 불충족은 중립 알림이다. 둘 다 `CircleAlert` 아이콘을 단다(알림에는 항상 아이콘을 단다). 문구:
  - 제목(건너뛴 항목): "Doan couldn’t set up every agent"
  - 줄(항목마다, 영향받는 에이전트를 앞에): "All agents — `~/.local/bin/doan` is a file Doan didn’t create, so Doan left it alone. Remove or rename it, then reopen Doan." / "Claude Code — `~/.claude/skills/doan` is a folder Doan didn’t create. Remove or rename it, then reopen Doan." / "Codex — Doan couldn’t write `~/.codex/rules/doan.rules` (permission denied). Make `~/.codex/rules` writable, then reopen Doan." / "All agents — `~/.local/bin` isn’t on your shell’s PATH, and adding doan to `/usr/local/bin` was cancelled. Add this line to `~/.zshrc`, then open a new terminal:" + `export PATH="$HOME/.local/bin:$PATH"`. PATH 줄은 Doan을 다시 열 필요가 없으므로 "then reopen Doan"을 붙이지 않는다.
  - 조건 불충족 제목 "This copy doesn’t set up agents", 본문: Applications 밖 "It isn’t directly in the Applications folder. Open the Doan in Applications so your agents can use it." / 개발 빌드 "Development builds never set up agents. Open the Doan in Applications so your agents can use it." / translocation "macOS is running it from a temporary location. Move Doan to the Applications folder, then open it again."
  - Agents lead: "Doan signs in to each agent with its own connection, separate from your terminal. One account per agent. Agents you run in a terminal use Doan without any setup."

## 소유 판정

Doan이 만든 것만 고친다(PRODUCT §5 item 0의 "never overwrite something Doan did not create"를 유지). 판정은 순수 함수다.

- **ours**: `~/.local/share/doan/` 안의 링크는 모두 Doan이 관리하는 이름공간이므로 ours다(번들 이름과 무관). 그 밖의 대상은 링크이고 값이 같은 HOME 문자열로 만든 `<HOME>/.local/share/doan/` 아래 절대경로일 때 ours다.
- **legacy-ours**: Connect가 만든 옛 링크. `~/.local/bin/doan`의 값이 `.app/Contents/Resources/bin/doan`으로 끝나는 링크(대소문자 무시, 깨진 링크 포함: 이 머신의 `onboard-l2` 링크), Claude 링크 값이 정확히 `../../.agents/skills/doan`인 링크. 이 상대 꼴은 skills CLI나 Orca도 만드는 일반 꼴이라(`~/.claude/skills/orca-cli` 등), 다른 출처의 `doan` skill 링크도 교체될 수 있다. 이름이 `doan`이라 위험은 낮다고 보고 받아들인다.
- **missing**: 대상이 없다. 배타적으로 만든다. 부모 디렉터리는 위 '프로바이더 폴더' 규칙 안에서만 만든다.
- **foreign**: 그 밖의 모든 것(일반 파일, 디렉터리, 다른 곳을 가리키는 링크, 상대경로 링크, Connect가 복사한 `~/.agents/skills/doan/` 디렉터리). 건너뛴다.
- **상위 경로**: 디렉터리로 풀리는 상위 링크(dotfiles로 관리하는 `~/.claude` 등)는 따라간다. 깨졌거나, 순환하거나, 디렉터리가 아닌 상위는 `write-failed`로 건너뛴다(기존 `machine.ts`의 `blockedParent` 규칙). `~/.claude/skills`가 `~/.agents/skills`로 풀리면 두 대상이 같은 경로이므로 하나로 친다(PRODUCT §5 item 0의 기존 규칙).
- **의존**: `current`나 `skill`이 foreign이거나 쓰기에 실패하면, 그 링크를 거쳐 가는 항목(CLI 링크, skill 링크, Codex rule)을 모두 건너뛴다. 그렇지 않으면 Codex rule이 sandbox 밖 실행을 허용하는 `doan`이 남이 만든 대상을 거쳐 가게 된다. About에는 원인인 경로 하나만 보인다.
- `doan.rules`: 파일 내용이 지금 Doan이 쓰는 내용과 같으면 ours, 없으면 생성, 그 밖이면 foreign. 내용이 실제로 바뀌는 날 이전 내용을 ours 목록에 더한다(미리 만들지 않는다).
- 교체는 기존 machine.ts처럼 임시 이름에 만든 뒤 rename한다. 쓰기 직전에 다시 판정해 그사이 바뀌었으면 건너뛴다. 생성 중 EEXIST도 건너뛴다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `installEligibility(bundlePath, home, isPackaged)` → `eligible | dev | translocated | outside-applications`.
- `needsSystemLink(loginPath, home)` → 로그인 셸 PATH에 `~/.local/bin`이 없는지(지금의 `pathIncludes`를 옮긴다).
- `classifyTarget(kind, lstat, readlink, content)` → `ours | legacy-ours | missing | foreign`. 위 '소유 판정'의 모든 분기, 그리고 존재하는 대상과 깨진 대상을 둘 다 고정하는 fixture(POSTMORTEM 2026-10-25 'A new link state…').
- `plannedTargets(home, bundleResources, existingProviderDirs, needsSystemLink)` → 경로와 원하는 링크 값·파일 내용의 목록(위 배치 표). 없는 프로바이더 폴더의 항목은 빠진다.
- `plan(targets, observations)` → 항목별 `create | replace | keep | skip(reason)` 목록. 의존 항목 건너뛰기를 포함한다.
- `codexRuleText()` → rule 파일 내용.
- `aboutNotice(items)` → 항목별 알림 줄 목록(비면 알림 없음).
- 셸 쪽(lstat, readlink, symlink, rename)은 얇은 실행기로만 둔다.

## 지우는 것

- renderer: `SettingsConnections.tsx`, `ConnectionRows.tsx`, `connectionRowView.ts`, `onboardingView.ts`의 Connections 전용 부분(`PATH_LINE_TEXT` 포함), `settingsSections.ts`의 `connections`, `ShellSidebar.tsx`의 Connections 아이콘, Connections 잠금(Agents의 `stop_required` 잠금, `SettingsTargetQueue`, 메뉴 `locked`는 유지). 저장된 `settingsSection`/`settingsTab` `"connections"`는 `restore/uiState.ts`에서 `"about"`으로 옮긴다.
- main: `setupBroker.ts`, `setupCauses.ts`, `setupLock.ts`, `app/src/setup/connectionSummary.ts`, `machine.ts`의 `createMachine`과 CLI 링크·stub·Claude 링크·MCP 쓰기, `states.ts`의 `linkState`·`stubState`·`mcpState`·`mcpAddArgs`·`mcpRemoveArgs`, `setup:read/run/answer/check-again/status` 채널과 preload 메서드, `onboarding:copy`의 `pathLine` 분기와 `copyPathLine`, `index.ts`의 broker 호출(`drop`, `refresh`, `setOnboardingClosed`)과 창 focus에서 setup 상태를 다시 읽는 부분, `main/settings.ts`의 중복 `SettingsSection` 타입의 `"connections"`. `rcFileFor`·`pathIncludes`·`PATH_LINE`은 설치기와 About 알림으로 옮긴다.
- 테스트: 위 모듈의 테스트, `index.test.ts`의 mock, `timeouts.test.ts`·`race.test.ts`·`senderAllowed.test.ts`의 setup 항목, `uiState.test.ts`의 `"connections"` 복원 기대(About으로 옮겨지는 테스트로 바꾼다), `settingsSections.test.ts`.
- 유지: `probeShell`, `runProcess`, `findOnPath`, `parseShellProbe`, `isTranslocated`, `initArgs`(agent-auth·conversation·clone이 쓴다), `setup:open-external`/`openInstallPage`(첫 실행과 Agents의 Install/Update가 쓴다).

## 형식 변경

없음. JSON Schema, `v`, fixture가 바뀌지 않는다. CLI `nextSteps` 문구와 guide 텍스트만 바뀌므로 `/agent-eval` 라운드가 필요하다(AGENTS.md).

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. stub과 guide 문구는 출력 예산 테스트 안에 있어야 한다(POSTMORTEM 2026-10-29: `rg -n 'skillOutputBudget' cli/internal/cli`).

## 결정 영향

- PRODUCT §5 item 0: "First run … installs no skill or MCP", Settings > Connections와 그 상태·문구 규칙, Settings 카테고리 목록, "replaced, after a confirmation that shows the current and new values"(확인 없는 교체로 바뀜), 'Not included'의 "installing into `/usr/local/bin`, admin rights"와 "automatic repair after the app moves (open Settings)"(둘 다 하게 됨). ARCHITECTURE §7의 "Writes outside the repo happen only from a button"도 앱 실행이 버튼 없이 쓰는 것으로 바뀐다. 사용자 승인으로 이 feature를 시작했고, 마지막 task에서 고친다.
- PRODUCT §2 둘째 문단, §3 In scope 3, §5 item 13("Install skills for Claude Code and Codex"): 외부 에이전트 연동이 두 개에서 다섯 프로바이더로 넓어진다. MCP는 제공하되 앱이 등록하지 않는다.
- ARCHITECTURE §5 "keep human approval for MCP writes": Codex rule로 셸 `doan`의 모든 쓰기가 승인 없이 sandbox 밖에서 실행된다. MCP 쓰기의 승인 원칙은 그대로지만, 셸 경로는 반대가 된다(사용자 결정).
- PRODUCT 8번 `doan init`의 "installing the skill stub … belongs to Connect" 문장.
- ARCHITECTURE §6 'Two install paths, one source'와 "imported by main with Vite `?raw`, so … no resource path is looked up": agent-auth는 계속 `?raw`를 쓰고, 번들 리소스는 같은 원본을 빌드 때 복사한 것이라 앱이 리소스 경로를 찾지는 않는다. 다만 문장을 두 복사본 구조로 다시 써야 한다. §7 'Machine setup', 'Settings, setup status and first-prompt IPC'도 바뀐다.
- ARCHITECTURE §7 "The app never edits shell rc files or agent config files directly": Codex `rules/`에 Doan 전용 파일을 새로 쓰는 것으로 바뀐다. 기존 파일은 고치지 않는다는 원칙은 유지한다. 셸 rc 파일은 계속 건드리지 않는다. `/usr/local/bin`에 관리자 권한으로 쓰는 것이 새로 생긴다.
- PRODUCT 'Open questions'의 sandbox Codex 첫 실행 항목(U-006)과 Codex가 오래된 전역 stub을 읽는 항목: 각각 rule과 번들 링크로 해소될 수 있다. T6b 결과를 근거로 마지막 task에서 고치거나 지운다. 앱 대화 Codex의 skill 중복은 받아들인다(spec 비목표).

## POSTMORTEM에서 가져온 함정

- 2026-10-30 'Packaged-app probes failed…': 이 머신에 `design.doan.app` 복사본이 여럿 등록돼 있었다. 어느 복사본이든 실행되면 링크를 자기 쪽으로 돌리는 문제가 생기므로, 허용 위치 규칙으로 막는다. 허용 위치 두 곳의 복사본끼리는 마지막 실행이 이긴다. 임시 HOME에서 로그인이 필요하면 `Library/Keychains`만 실제 폴더로 링크하고 끝난 뒤 정리한다. 임시 복사본은 `lsregister -dump`로 전후를 비교하고 `-u`로 해제한다.
- 2026-10-30 'A dev-build measurement started an unisolated Electron…': 이제 앱 실행 자체가 HOME에 쓴다. 모든 runtime 프로브는 임시 HOME을 쓰고, 갱신한 `real-state.ts`로 실험 전후를 비교한다. 관리자 권한 대화상자는 임시 HOME으로 막히지 않으므로, 프로브는 PATH에 `~/.local/bin`이 있는 가짜 SHELL을 써서 `/usr/local/bin` 경로를 타지 않게 하고, 그 경로는 단위 테스트와 사람이 지켜보는 1회 확인으로만 검증한다.
- 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation': Connections 잠금을 지운 뒤에도 Agents 잠금과 `SettingsTargetQueue`가 유지되는지 확인한다.
- 2026-10-25 'A new link state silently removed replacement-guard coverage': foreign 판정 fixture는 존재하는 대상과 깨진 대상을 둘 다 두고, 보호 분기를 잠시 지워 테스트가 실패하는지 확인한다.
- 2026-10-29 'Codex cut the middle out of the doan guide…': stub과 guide 문구 변경은 출력 예산 테스트를 통과해야 한다.
- U-010(USABILITY-EVAL): stub의 "다른 Doan 바이너리를 찾거나 실행하지 말라"는 그대로 둔다. 대체 경로를 stub에 넣지 않는 이유다.

## PoC 의존

- **T0 프로바이더 표** (미확인): 다섯 프로바이더의 외부 세션이 (a) 어느 전역 위치에서 skill을 찾는지, 공유 위치(`~/.agents/skills`, `~/.claude/skills`)도 읽는지, (b) 자기 PATH에서 `doan`을 찾는지, (c) 기본 설정에서 셸 `doan active`가 unix socket에 닿는지, 막히면 Codex rule에 해당하는 허용 방식이 있는지. 실제 외부 에이전트를 실행하므로 사용자 허락이 필요하다(AGENTS.md 'Worker model boundary', 2026-10-31 허락받음). 이 결과로 배치 표의 링크 집합과 완료 조건 5의 처리를 정한다.
- 사용자 레이어 `~/.codex/rules/doan.rules`(이름이 `default.rules`가 아닌 파일)를 Codex가 실제로 읽는지: run2는 프로젝트 레이어였고, 사용자 레이어는 문서로만 뒷받침된다. T0에서 임시 HOME의 사용자 레이어로 확인한다.
