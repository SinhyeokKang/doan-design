# zero-setup-agents — tasks

순서: PoC → draft → 순수 함수 → 셸(I/O)·패키징 → 문구 → 제거·About(UI) → 실제 앱·에이전트 확인 → eval → 문서 승격 → MCP 제거 feature 착수.

## T0. 프로바이더 표 PoC (사용자 허락: 2026-10-31)

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

## T0b. About 알림과 Agents lead draft (`/design-draft`)

- 새 파일 `.doan/canvases/zero-setup-agents.html`에 About 화면을 옮겨 그리고, 알림 상태(없음, foreign 1개, 여러 항목, `admin-cancelled`와 PATH 줄, `not-eligible` 세 가지)를 그린다. 새 줄에는 '코드에 없음' 표시를 단다. Agents lead의 새 문장도 그린다. 기존 `buzz-settings.html`은 고치지 않는다.
- 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`가 오류 없음. 사용자가 앱에서 draft를 확인한다.

— commit: `docs(design): zero-setup-agents About notice draft`

## T1. 순수 함수 (`/tdd` → `/implement`)

- `installEligibility`, `needsSystemLink`, `classifyTarget`, `plannedTargets`, `plan`, `codexRuleText`, `aboutNotice`(design.md '순수 함수로 뺄 부분'). `/tdd`로 먼저 red를 확인한다.
- `classifyTarget` fixture: 존재하는 대상과 깨진 대상을 모두 둔다. legacy-ours 두 꼴, Connect가 복사한 디렉터리(foreign), 상대경로 링크(foreign), `~/.local/share/doan/` 안의 이름이 다른 번들(`Doan 2.app`)을 가리키는 `current`(ours), 디렉터리로 풀리는 상위 링크, 깨진 상위 링크, `~/.claude/skills`가 `~/.agents/skills`로 풀리는 경우.
- `plan` fixture: 두 번째 실행은 `keep`만, 앱 이동은 `current`만 `replace`, foreign `current`면 의존 항목 모두 `skip`, 없는 프로바이더 폴더는 항목 없음.
- `aboutNotice` fixture: 항목 없음, 한 개, 여러 개(고정 순서), `admin-cancelled`, `not-eligible` 세 종류.
- 검증: `npm --prefix app test` green. foreign 분기와 의존 건너뛰기를 잠시 지우면 해당 테스트가 실패하는 것을 확인한다(POSTMORTEM 2026-10-25).

— commit: `feat(app): agent setup planning functions`

## T2. 시작 시 설치 실행기, `/usr/local/bin`, 패키징, 실제 상태 보호

- main `whenReady` 뒤 비동기 실행. HOME, 번들 경로, 로그인 셸 PATH를 주입받는다. 쓰기 직전 재판정, 배타적 생성, 임시 이름 + rename 교체, EEXIST는 건너뜀. 결과는 메모리에 두고 로그를 남긴다.
- `/usr/local/bin`: `needsSystemLink`일 때만 osascript 관리자 권한 실행. 취소를 userData에 기록하고 다시 묻지 않는다. osascript 실행기는 주입해 테스트에서 가짜로 바꾼다.
- `app/package.json` `build.extraResources`에 `src/main/onboarding/SKILL.md` → `skills/doan/SKILL.md` 추가. agent-auth의 `?raw` import는 그대로.
- `app/runtime/real-state.ts` 지문에 새 대상 추가(design.md '영향 받는 구성 요소').
- 검증: `npm --prefix app test` — 임시 디렉터리를 HOME으로 쓰는 실행기 테스트: `~/.local`이 없는 HOME, 프로바이더 폴더 없음/있음, 읽기 전용 부모(쓰기 실패가 결과에 기록됨), 재판정 사이에 대상이 생김(EEXIST → skip), 두 번째 실행은 아무것도 쓰지 않음, 앱 이동으로 `current` 교체, 깨진 `current`, `needsSystemLink` 참/거짓, osascript 취소 후 재실행 시 다시 묻지 않음. `node --test 'app/runtime/*.test.ts'`. `npm --prefix app run typecheck`. `npm --prefix app run package` 후 `app/dist/mac-arm64/Doan.app/Contents/Resources/skills/doan/SKILL.md`가 원본과 같고 `Contents/Resources/bin/doan`이 있다.

— commit: `feat(app): install CLI and skill links on launch`

## T3. Codex rule 파일

- `~/.codex/rules/doan.rules`를 '소유 판정' 규칙으로 쓴다(`~/.codex`가 있을 때만).
- 검증: `npm --prefix app test` — 내용이 같으면 keep, 다르면 foreign, 없으면 생성, `~/.codex`가 없으면 항목 없음. 생성된 파일로 `codex execpolicy check --rules <file> -- doan active`와 `-- doan init`이 allow(command undecided — needs user confirmation: AGENTS.md 'Commands'에 없음. 읽기 전용이라 실제 상태를 바꾸지 않는다).

— commit: `feat(app): allow doan outside the Codex sandbox`

## T4. 에이전트가 읽는 문구

- stub(`app/src/main/onboarding/SKILL.md`): "Settings… > Connections"를 "Applications에서 Doan을 열고 Settings… > About을 보라고 사람에게 안내"로 바꾼다. "다른 Doan 바이너리를 찾거나 실행하지 말라"는 그대로.
- `cli/internal/cli/active.go`, `onboarding.go`의 `app_not_running` `nextSteps`: 첫 단계 "Ask the user to open Doan"은 남기고, MCP·Settings 안내를 sandbox 안내와 Settings… > About 안내로 바꾼다(T0 결과 반영).
- `cli/internal/cli/skill.md`의 해당 문장, `app/src/main/conversation/prompt.ts`의 `PRESET_GUIDANCE`.
- 문구를 단언하는 테스트: `active_test.go`, `design_skill_test.go`, `skill_test.go`.
- eval: `eval/scenarios/D4/rubric.md`, `D4b/rubric.md`의 기대 문구.
- 검증: `go test ./...`(출력 예산 테스트 포함, `rg -n 'skillOutputBudget' cli/internal/cli`로 범위 확인), `npm --prefix app test`, `rg -n -i 'connections|Settings…' app/src/main cli/internal/cli eval/scenarios`의 결과를 하나씩 판정해 Connections를 가리키는 것이 없다.

— commit: `feat(cli): point agents to Settings… > About instead of Connections`

## T5. Connections와 MCP 등록 제거

- design.md '지우는 것' 목록. 남기는 함수와 `setup:open-external`은 그대로. Agents lead 문장(`SettingsPage.tsx`)을 T0b draft대로 바꾼다.
- 검증: `npm --prefix app run typecheck`, `npm --prefix app test`(저장된 `"connections"`가 About으로 열리는 `uiState` 테스트, Agents `stop_required` 잠금과 `SettingsTargetQueue` 유지 테스트 포함), `go vet ./...`, `rg -n 'setup:(read|run|answer|check-again|status)' app/src`가 결과 없음, `node .agents/skills/verify/scripts/verify.mjs`.

— commit: `refactor(app): remove Settings > Connections and MCP registration`

## T5b. About 알림 (`/design-sync` 포함)

- `AboutRead`에 설치 결과 필드 추가, `about:read`가 설치 promise를 기다림, Copy details에 알림 줄 포함, About 렌더링(정적 텍스트, `aria-hidden` 아이콘, `<code>` 경로).
- `/design-sync`로 T0b draft와 computed style을 맞추고 DESIGN.md에 측정값을 남긴다.
- 검증: `npm --prefix app test`(설치가 끝나기 전 `about:read`가 기다림, 알림 있음·없음·조건 불충족, Copy details 내용), `npm --prefix app run typecheck`, `node .scratch/design-sync/zero-setup-agents/measure.mjs`(AGENTS.md 'Commands'의 focused measurement 형식).

— commit: `feat(app): show skipped agent setup in About`

## T6. 실제 앱 확인 (`/runtime-test`)

- `npm --prefix app run package` 후, 임시 HOME 아래 `Applications/Doan.app`에 복사본을 두고 `<tmp HOME>/Applications/Doan.app/Contents/MacOS/Doan --user-data-dir=<tmp>`를 `app/runtime/` `isolatedEnv`(임시 HOME/SHELL/`CLAUDE_CONFIG_DIR`/`CODEX_HOME`)로 실행한다. 가짜 SHELL은 PATH에 `~/.local/bin`을 포함해 관리자 권한 경로를 타지 않는다.
- 확인: 링크와 rule 파일이 생김, 두 번째 실행은 아무것도 바꾸지 않음, 번들을 다른 빌드로 바꿨을 때 `doan --version`과 stub이 새 것이 됨, 다른 이름의 복사본으로 옮긴 뒤 실행하면 `current`가 바뀜, foreign 대상을 둔 실행에서 About 알림이 보임, `app/dist/…`에서 실행한 복사본은 아무것도 쓰지 않고 About에 조건 불충족이 보임, Settings에 Connections가 없음.
- 실제 상태 보호: 갱신한 `real-state.ts`로 전후 비교. 임시 복사본은 `lsregister -dump`로 전후 비교 후 `lsregister -u`로 해제(POSTMORTEM 2026-10-30).
- 미검증 범위로 적는 것: translocation(단위 테스트만), 관리자 권한 대화상자(아래 1회 확인 전까지).
- 관리자 권한 경로 1회 확인: 사람이 지켜보는 가운데, PATH에 `~/.local/bin`이 없는 가짜 SHELL로 실행해 대화상자가 뜨고, 승인하면 `/usr/local/bin/doan`이 생기고, 취소하면 About에 PATH 줄이 보이는지 확인한다. 실제 `/usr/local/bin`에 쓰므로 실행 전에 사용자 승인을 받고, 끝난 뒤 링크를 지운다.
- 검증: 스크린샷과 파일 목록을 `.scratch/runtime-test/zero-setup-agents/`에 남긴다.

- 관리자 권한 경로 1회 확인 결과(2026-10-31, 사용자 입회, 최종 HEAD `96836a66`로 다시 만든 패키지): 승인하면 root 소유 `/usr/local/bin/doan`이 `<임시 HOME>/.local/share/doan/current/bin/doan`을 가리켰고 About에 알림이 없었다. 취소하면 `agent-setup.json`에 `{"adminCancelled":true}`가 남고 `/usr/local/bin`은 비었으며 About에 PATH 줄 알림이 보였다. 같은 userData로 다시 열자 대화상자가 뜨지 않았고 알림은 그대로였다. 확인 중 만든 `/usr/local/bin`은 지웠고(원래 없었다, `/usr/local`은 원래 있었다) 실제 상태 지문과 LaunchServices 등록은 확인 전과 같다. 첫 시도에서 사람이 스크립트의 링크 삭제 프롬프트를 취소해 2단계를 다시 했다. 증거는 `.scratch/orch/zero-setup-agents/evidence/e/admin/`.

## T6b. 앱이 만든 배치로 실제 에이전트 확인 (실행 시 사용자 허락 필요)

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

## T7. `/agent-eval`

- 바뀐 stub·guide·nextSteps로 라운드를 돌린다. `/agent-eval`은 두 모델 계열을 쓰는 상시 예외라 따로 허락받지 않는다(AGENTS.md 'Runtime differences').
- eval은 실제 HOME에 rule을 쓰지 않으므로, U-006 해소 여부는 이 라운드가 아니라 T6b로 판정한다.
- 검증: `npm --prefix app run package` 후 `node eval/run.ts --self-test`가 `self-test PASS`를 출력하고 exit 0. `node eval/run.ts --round zero-setup-agents` 결과를 `docs/USABILITY-EVAL.md`에 기록하고, 바뀐 문구에서 비롯된 새 issue 행이 없다.

— commit: `docs(eval): zero-setup-agents round`

## T8. 문서 승격

- PRODUCT: §2 둘째 문단, §3 In scope 3, §5 item 0(첫 실행, Settings 카테고리, Connections 항목, 확인 후 교체 규칙, 'Not included'의 `/usr/local/bin`·관리자 권한·앱 이동 후 복구), item 8 `doan init` 문장, item 13, 'Open questions'의 sandbox Codex 첫 실행·오래된 전역 stub 항목(T6b 근거). MCP 제거 항목은 지우지 않고 T0 결과를 덧붙인다.
- ARCHITECTURE: §5 승인 원칙과 셸 경로의 차이, §6 'Stub'(두 복사본 구조), §7 'Machine setup'을 새 배치·소유 판정·허용 위치·`/usr/local/bin` 규칙으로 교체, 'Settings, setup status and first-prompt IPC'에서 setup 채널 제거와 `AboutRead` 필드, "never edits … agent config files" 문장, §9 Distribution에 번들 skill 경로.
- DESIGN.md 'Settings': Reference window 목록, 사이드바 네 행 → 세 행, Header의 Check Again, Connections 행, Lock ink, About 알림 측정값(T5b).
- DIRECTORY.md의 지운 파일과 새 모듈. AGENTS.md 'Commands'의 packaged-app 실행 주의(실행만으로 HOME과 `/usr/local/bin`에 쓴다).
- 검증: `rg -n -i 'Settings(…)? > Connections|setup:read|ConnectionRows' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/DIRECTORY.md AGENTS.md app/src cli eval`가 결과 없음. POSTMORTEM, USABILITY-EVAL, `docs/features/`는 이력이라 검색에서 뺀다.

— commit: 문서별로 나눈다(`docs(product): …`, `docs(architecture): …`, `docs(design): …`, `docs(directory): …`, `docs(agents): …`).

## T9. MCP 제거 feature 착수와 정리

- 구현 PR이 main에 merge된 뒤 main에서 하는 문서 변경이다. `/feature`로 MCP 제거 feature를 시작한다. 입력은 PRODUCT 'Open questions'의 MCP 제거 항목과 T0·T6b 표다. sandbox를 비켜 갈 방법이 없어 MCP가 필요한 프로바이더가 있으면, 그 사실을 첫 결정 질문으로 올린다.
- 그 feature의 `docs/features/<slug>/`가 커밋되면 PRODUCT 'Open questions'의 MCP 제거 항목을 지운다.
- T0·T6b 표를 새 feature 문서로 옮긴 뒤 `docs/features/zero-setup-agents/`를 삭제한다.
- 검증: 새 feature의 spec·design·tasks 커밋이 있고, `rg -n 'zero-setup-agents' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/DIRECTORY.md AGENTS.md`가 결과 없음.

— commit: `docs(product): move MCP removal into its feature`, `docs(feature): complete zero-setup-agents`
