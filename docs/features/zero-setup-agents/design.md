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
~/.codex/rules/default.rules          prefix_rule(pattern=["ego-browser"], decision="allow")
```

- MCP 등록은 없다(`~/.claude.json` user MCP는 `figma`, `malmoi`, `~/.codex/config.toml`에 ego 없음). `CLAUDE_CONFIG_DIR`은 따르지 않는다. Orca profile에서도 보이는 것은 profile의 `skills`가 `~/.claude/skills`를 가리키는 링크이기 때문이다.
- 버전이 바뀌면 `active_version_dir` 하나만 고치면 된다. 나머지 링크는 그 링크를 거쳐 가므로 그대로다.
- 링크를 쓰는 방식(바이너리 안의 셸 스크립트): 부모 디렉터리를 만들고, 대상이 링크이고 값이 다르면 지우고 다시 만들며, 대상이 없으면 만들고, 링크가 아닌 파일이 있으면 그대로 둔다. `~/.local/bin`이 PATH에 있는지는 `.zshrc`를 정규식으로 읽고 `whence -p`로 확인하며, 관리자 권한 osascript로 `/usr/local/bin`에 링크를 만드는 경로도 있다. 이 feature는 `/usr/local/bin` 경로를 따르지 않는다(spec 비목표).
- skill은 discovery stub이다. `ego-browser skill`이 번들 안 SDK 옆의 guide를 출력한다(`docs/ego-browser-skill-command.md`). Doan의 stub/guide 구조(ARCHITECTURE §6)와 같다.
- sandbox: CLI 바이너리에 "Agent note: ego-browser cannot connect to the ego_cli bootstrap from the default agent sandbox. Retry with Full Access or run ego-browser outside the agent sandbox."라는 문구가 있다. 그래서 Codex는 rule로 sandbox를 비켜 간다. Codex 문서 Rules(learn.chatgpt.com/docs/agent-configuration/rules): `allow`는 "outside the sandbox without prompting", "Codex scans `rules/` under every active config layer at startup … the user layer at `~/.codex/rules/`".
- 업데이트: 앱에 업데이터가 있고(`ego-browser upgrade`), CLI는 업데이트가 있으면 `[ego-browser:notice]` 한 줄로 에이전트에게 알린다(`package/ego-browser/src/update-notice.ts`). Doan의 자동 업데이트는 #9 `dist`라 이번 범위가 아니다.

**실험** (codex-cli 0.164.0, 이 머신의 Codex 설정은 `danger-full-access`라 `-s workspace-write -c approval_policy="never"`로 덮어씀, 가짜 앱 socket 사용):

| run | 조건 | 결과 |
|---|---|---|
| 1 | rule 없음 | ego-browser `listTaskSpaces` exit 0(사용자 rule 적용), `doan active` exit 3 `connect: operation not permitted`, workspace 밖 읽기 성공, workspace 밖 쓰기 `Operation not permitted` |
| 2 | 프로젝트 `.codex/rules/doan.rules`에 `prefix_rule(pattern=["doan"], decision="allow")` | `doan active` exit 0, 가짜 서버가 요청을 받음 |
| check | `codex execpolicy check`, `prefix_rule(pattern=["doan", ["active", "onboarding"]], decision="allow")` | 좁힌 rule은 `doan active`·`doan onboarding start` allow, `doan init` 매칭 없음. 절대경로 `…/doan active`는 `--resolve-host-executables`일 때만 매칭 |

## 영향 받는 구성 요소

- **app (main)**: 새 모듈 하나가 시작할 때 링크와 Codex rule 파일을 확인한다. Settings > Connections와 그 IPC, MCP 등록, stub 복사 쓰기를 지운다.
- **app (renderer)**: Settings 카테고리에서 Connections를 지운다. About의 doan command 행 아래에, 건너뛴 항목이 있을 때만 알림 한 줄을 보인다('About 알림').
- **패키징**: stub을 `Resources/skills/doan/SKILL.md`로 번들에 넣는다(`app/package.json` `build.extraResources`, 원본은 지금의 `app/src/main/onboarding/SKILL.md`).
- **CLI (Go)**: `active`, `onboarding`의 `app_not_running` `nextSteps` 문구. `cli/internal/cli/skill.md` guide의 MCP/Settings 안내. 동작은 바뀌지 않는다.
- **skill stub**: Settings > Connections 안내를 지우고 `~/.local/bin/doan` 대체 경로를 넣는다.
- **`doan mcp`**: 바뀌지 않는다.
- **formats**: 없음. runtime.json, socket 메시지, schema는 그대로다.

## 배치 (ego를 그대로 옮김)

```
~/.local/share/doan/current   -> <Doan.app>/Contents/Resources
~/.local/share/doan/skill     -> ~/.local/share/doan/current/skills/doan
~/.local/bin/doan             -> ~/.local/share/doan/current/bin/doan
~/.agents/skills/doan         -> ~/.local/share/doan/skill      (Codex)
~/.claude/skills/doan         -> ~/.local/share/doan/skill      (Claude Code)
<T0 결과에 따라> ~/.cursor/skills/doan, ~/.copilot/skills/doan, ~/.gemini/skills/doan -> ~/.local/share/doan/skill
~/.codex/rules/doan.rules     prefix_rule(pattern=["doan"], decision="allow")
```

- 앱이 옮겨지거나 바뀌면 `current`만 다시 쓴다. 같은 경로에서 번들이 교체되면 아무것도 다시 쓰지 않아도 새 CLI·stub·guide가 쓰인다(완료 조건 2). 이 머신의 깨진 `~/.local/bin/doan`처럼 특정 빌드를 직접 가리키는 문제가 사라진다.
- 프로바이더 personal skill 위치는 agent-auth가 Doan 프로필에서 확인한 값을 출발점으로 삼는다(`app/src/main/agentAuth/providers.ts`: Claude `<config>/skills`, Codex `<CODEX_HOME>/skills`, Cursor `~/.cursor/skills`, Copilot `~/.copilot/skills`, Antigravity `<GEMINI_HOME>/skills`). 외부 세션이 공유 위치(`~/.agents/skills`, `~/.claude/skills`)도 읽는지는 확인되지 않았다. 두 곳을 다 읽는 프로바이더에 링크를 둘 다 두면 `doan` skill이 두 번 보인다(PRODUCT 'Open questions': Codex가 두 `doan` skill을 나열한 관찰). T0가 프로바이더마다 링크가 하나만 보이는 최소 집합을 정한다.
- Codex rule은 Doan 전용 파일 `doan.rules`에 쓴다. ego는 `default.rules`를 쓰지만, 그 파일은 Codex TUI가 사용자 승인을 저장하는 곳이라 Doan이 고치지 않는다. Codex는 `rules/` 아래 모든 `.rules`를 읽는다(Codex 문서). 허용 범위는 ego처럼 `doan` 전체다(사용자 결정). socket이 필요한 것은 `active`, `onboarding`뿐이지만, 모든 doan 명령이 sandbox 밖에서 승인 없이 실행된다. doan의 쓰기 명령은 repo 안의 `.doan/`, `.gitattributes`와 userData의 `sessions.jsonl`만 쓴다(ARCHITECTURE §4, §12).

## 언제, 어떤 복사본이 쓰는가

- main `app.whenReady` 뒤 한 번, 창 표시와 무관하게 비동기로 실행한다. 실패와 건너뛴 항목은 로그에 남기고, main이 마지막 결과를 메모리에 둔다. 평소에는 UI가 없다(사용자 결정: 실패할 때만 About에 한 줄). 매 실행마다 같은 확인을 반복하므로, 사라지거나 깨진 링크는 다음 실행에서 복구된다.
- 쓰는 조건: `app.isPackaged`이고, 번들 경로가 `/Applications/` 또는 `<HOME>/Applications/` 바로 아래이며, translocation 상태가 아니다. 개발 빌드, `npm run package`가 만든 `app/dist/mac-arm64/Doan.app`, 다른 worktree의 빌드는 쓰지 않는다.
- HOME은 `os.homedir()`가 아니라 주입받는다. 테스트와 runtime 프로브는 임시 HOME 아래 `Applications/Doan.app` 복사본으로 실제 HOME을 건드리지 않고 같은 경로를 검증한다.
- 첫 실행(first run)과 무관하다. 첫 실행 화면은 바뀌지 않는다.

## About 알림

- main은 마지막 설치 결과(건너뛴 항목의 경로와 이유: foreign, 쓰기 실패)를 둔다. About이 보일 때 새 main 전용 invoke 채널로 읽는다(`senderAllowed.ts`에 추가, preload에 메서드 하나). 쓰는 조건을 만족하지 않는 실행(개발 빌드, 허용 위치 밖)도 이유를 한 줄로 보인다. 그래야 Applications 밖에서 실행한 사람이 에이전트가 Doan을 못 찾는 이유를 안다.
- 건너뛴 항목이 없으면 아무것도 보이지 않는다. 버튼은 없다. 사람이 원인을 치우면 다음 실행에서 다시 시도한다.
- 문구는 결과에서 만드는 순수 함수다. 정확한 문구와 위치는 `/design-draft`에서 정한다(About 화면의 기존 draft는 `.doan/canvases/buzz-settings.html`).

## 소유 판정

Doan이 만든 것만 고친다(PRODUCT §5 item 0의 "never overwrite something Doan did not create"를 유지). 판정은 순수 함수다.

- **ours**: 링크이고 값이 `~/.local/share/doan/` 아래를 가리킨다. `current`는 링크이고 값이 `…/Doan.app/Contents/Resources` 꼴이다.
- **legacy-ours**: Connect가 만든 옛 링크. `~/.local/bin/doan`의 값이 `.app/Contents/Resources/bin/doan`으로 끝나는 링크(대소문자 무시, 깨진 링크 포함: 이 머신의 `onboard-l2` 링크), Claude 링크 값이 정확히 `../../.agents/skills/doan`인 링크.
- **missing**: 대상이 없다. 만든다(부모 디렉터리 생성 포함, 배타적 생성).
- **foreign**: 그 밖의 모든 것(일반 파일, 디렉터리, 다른 곳을 가리키는 링크, Connect가 복사한 `~/.agents/skills/doan/` 디렉터리). 건너뛴다.
- `doan.rules`: 파일 내용이 Doan이 쓰는 내용의 어느 버전과 같으면 ours로 보고 교체, 없으면 생성, 그 밖이면 foreign.
- 교체는 기존 machine.ts처럼 임시 이름에 만든 뒤 rename한다. 쓰기 직전에 다시 판정해 그사이 바뀌었으면 건너뛴다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `installEligibility(bundlePath, home, isPackaged)` → `eligible | dev | translocated | outside-applications`.
- `classifyTarget(kind, lstat, readlink, content)` → `ours | legacy-ours | missing | foreign`. 위 '소유 판정'의 모든 분기, 그리고 존재하는 대상과 깨진 대상을 둘 다 고정하는 fixture(POSTMORTEM 2026-10-25 'A new link state…').
- `plannedTargets(home, bundleResources, providers)` → 경로와 원하는 링크 값·파일 내용의 목록(위 배치 표).
- `plan(targets, observations)` → 항목별 `create | replace | keep | skip(foreign)` 목록.
- `codexRuleText()` → rule 파일 내용과, ours 판정에 쓸 이전 버전 목록.
- `aboutNotice(result)` → About 알림 문구 또는 없음.
- 셸 쪽(lstat, readlink, symlink, rename)은 얇은 실행기로만 둔다.

## 지우는 것

- renderer: `SettingsConnections.tsx`, `ConnectionRows.tsx`, `connectionRowView.ts`, `onboardingView.ts`의 Connections 전용 부분, `settingsSections.ts`의 `connections`, Connections 잠금(Agents의 `stop_required` 잠금은 유지).
- main: `setupBroker.ts`, `setupCauses.ts`, `app/src/setup/connectionSummary.ts`, `machine.ts`의 `createMachine`과 CLI 링크·stub·Claude 링크·MCP 쓰기, `states.ts`의 `linkState`·`stubState`·`mcpState`·`mcpAddArgs`·`mcpRemoveArgs`·`rcFileFor`·`pathIncludes`, `setup:read/run/answer/check-again/status` 채널과 preload 메서드, 창 focus에서 setup 상태를 다시 읽는 부분.
- 유지: `probeShell`, `runProcess`, `findOnPath`, `parseShellProbe`, `isTranslocated`, `initArgs`(agent-auth·conversation·clone이 쓴다), `setup:open-external`/`openInstallPage`(첫 실행과 Agents의 Install/Update가 쓴다).

## 형식 변경

없음. JSON Schema, `v`, fixture가 바뀌지 않는다. CLI `nextSteps` 문구와 guide 텍스트만 바뀌므로 `/agent-eval` 라운드가 필요하다(AGENTS.md).

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. stub과 guide 문구는 출력 예산 테스트 안에 있어야 한다(POSTMORTEM 2026-10-29: `rg -n 'skillOutputBudget' cli/internal/cli`).

## 결정 영향

- PRODUCT §5 item 0: "First run … installs no skill or MCP", "Writes outside the repo happen only from a button", Settings > Connections와 그 상태·문구 규칙, Settings 카테고리 목록. 앱 실행이 버튼 없이 쓰는 것으로 바뀐다. 사용자 승인으로 이 feature를 시작했고, 마지막 task에서 PRODUCT를 고친다.
- PRODUCT §2 직전 문단과 §3 In scope 3: 외부 에이전트 연동이 Claude Code·Codex 두 개에서 다섯 프로바이더로 넓어진다. MCP는 제공하되 앱이 등록하지 않는다.
- PRODUCT 8번 `doan init`의 "installing the skill stub … belongs to Connect" 문장.
- ARCHITECTURE §6 'Two install paths, one source'와 §7 'Machine setup', 'Settings, setup status and first-prompt IPC'.
- ARCHITECTURE §7 "The app never edits shell rc files or agent config files directly": Codex `rules/`에 Doan 전용 파일을 새로 쓰는 것으로 바뀐다. 기존 파일은 고치지 않는다는 원칙은 유지한다. 셸 rc 파일은 계속 건드리지 않는다.
- PRODUCT 'Open questions'의 sandbox Codex 첫 실행 항목(U-006)과 Codex가 오래된 전역 stub을 읽는 항목: 각각 rule과 번들 링크로 해소될 수 있다. 마지막 task에서 결과를 확인해 고치거나 지운다.

## POSTMORTEM에서 가져온 함정

- 2026-10-30 'Packaged-app probes failed…': 이 머신에 `design.doan.app` 복사본이 여럿 등록돼 있었다. 어느 복사본이든 실행되면 링크를 자기 쪽으로 돌리는 문제가 생기므로, 허용 위치 규칙으로 막는다.
- 2026-10-30 'A dev-build measurement started an unisolated Electron…': 이제 앱 실행 자체가 HOME에 쓴다. 모든 runtime 프로브는 임시 HOME을 쓰고, 실제 HOME의 링크와 `~/.codex/rules`를 실험 전후로 비교한다.
- 2026-10-25 'A new link state silently removed replacement-guard coverage': foreign 판정 fixture는 존재하는 대상과 깨진 대상을 둘 다 두고, 보호 분기를 잠시 지워 테스트가 실패하는지 확인한다.
- 2026-10-29 'Codex cut the middle out of the doan guide…': stub과 guide 문구 변경은 출력 예산 테스트를 통과해야 한다.

## PoC 의존

- **T0 프로바이더 표** (미확인): Cursor CLI, Copilot CLI, Antigravity의 외부 세션이 (a) 어느 전역 위치에서 skill을 찾는지, 공유 위치(`~/.agents/skills`, `~/.claude/skills`)도 읽는지, (b) 기본 설정에서 셸 `doan active`가 unix socket에 닿는지, 막히면 Codex rule에 해당하는 허용 방식이 있는지. Claude Code와 Codex도 같은 표로 다시 확인한다. 실제 외부 에이전트를 실행해야 하므로 실행할 때 사용자 허락이 필요하다(AGENTS.md 'Worker model boundary'). 이 결과로 배치 표의 링크 집합과 완료 조건 4의 처리를 정한다.
- Codex 실제 실행에서 절대경로 호출(`~/.local/bin/doan active`)이 rule에 맞는지: `execpolicy check`는 `--resolve-host-executables`일 때만 맞았다. stub이 대체 경로를 안내하므로 T0에서 함께 확인한다.
