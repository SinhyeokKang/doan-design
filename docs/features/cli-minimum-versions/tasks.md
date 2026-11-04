# cli-minimum-versions — tasks

순서: 실험(사용자 버전 → 설치 → 정적 검사 → 실제 앱 확인) → 사람의 결정 → 테스트 → 상수 → 실제 앱 확인 → verify → 문서 승격.

mcp-connectors가 main에 합쳐진 뒤 main에서 시작한다. D1에서 어느 provider도 낮추지 않기로 정하면 A·C를 건너뛰고 Z로 간다.

## E. 실험 (PoC)

- [x] E0. 사용자 버전을 모은다. 사람이 테스터들에게 Settings > About의 Copy details를 받아 준다. provider마다 가장 오래된 설치 버전을 범위의 하한으로 두고, 그 하한부터 지금 최소 버전 바로 아래까지의 릴리스 목록을 만든다. 사람은 그 목록 전체의 내려받기를 한 번에 승인한다. 테스터는 A, B…로만 적고 이름과 경로는 적지 않는다. 후보가 없는 provider와 지금 최소 버전 이상인데 Update를 보는 테스터는 spec.md '범위'를 따른다. Antigravity는 design.md 'Antigravity'의 코드 근거를 적는다.
  - 검증: 'E 결과'에 테스터별(익명) provider 버전, provider별 릴리스 목록과 그 승인, Antigravity의 코드 근거가 있다. 릴리스 목록 조회는 AGENTS.md 'Commands'에 없는 명령이라 사용한 명령을 함께 적는다.
- [x] E1. E0에서 승인된 목록의 릴리스를 모두 사람의 설치본 옆에 설치한다. 목록 밖의 버전은 받지 않는다. 방법은 design.md '실험 환경' '후보 CLI 설치'와 '자체 업데이트'(wrapper script, 끄는 switch와 그 출처)를 따른다. 그렇게 설치할 수 없는 후보는 이유를 적고 뺀다.
  - 검증: 설치된 후보의 `--version`이 그 버전을 출력하고, 설치 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다. 설치 명령과 비교 스크립트는 AGENTS.md 'Commands'에 없으므로(`.scratch` 스크립트) 'E 결과'에 함께 적는다.
- [x] E2. 정적 검사(로그인 없음, 임시 HOME): design.md '정적 검사'를 provider마다 돌린다. credential 격리를 먼저 보고, 확인되지 않은 후보는 E3에서 sign-in하지 않는다. 결과로 provider마다 실제 앱에서 확인할 첫 후보를 정한다(정적 검사를 통과한 가장 오래된 버전). Claude Code는 C2에서 실패한 릴리스도 'E 결과'에 적는다(D1에서 쓴다).
  - 검증: `.scratch/cli-minimum-versions/static/`의 스크립트(AGENTS.md 'Commands'에 없음). 'E 결과' 정적 표에 버전 × 항목의 통과·실패를 적는다.
- [x] E3. 실제 앱 확인(Doan 연결, Claude Code·Codex·Cursor·Copilot): 실험 worktree에서 `minimumVersions.ts`와 floor를 후보 값으로 잠시 바꾼 dev 앱(커밋하지 않음), 실제 HOME, 후보별 userData, 후보 bin을 맨 앞에 둔 PATH를 출력하는 가짜 `SHELL`로 design.md '통과 기준' 1~9를 돌린다. 실제 HOME은 AGENTS.md의 dev 실행 규칙에서 벗어난 것이므로 design.md '실험 환경' 'HOME과 로그인'의 조건을 지킨다. 후보의 registry 모양 때문에 `io.ts`를 고쳐야 하면 design.md 'floor'의 조건 안에서 실험 빌드에 넣고, 통과 기준 4와 10을 그 빌드로 본다. 에이전트가 probe를 돌리고, 사람은 sign-in을 자기 브라우저에서 승인한다. Copilot은 상태 확인과 대화 턴마다 요청을 쓰므로 후보마다 쓸 요청 수를 어림해 사람에게 미리 알린다. 스크린샷과 결과는 `.scratch/cli-minimum-versions/live/`에 둔다. 첫 후보가 실패하면, 그 실패 원인보다 새로운 릴리스 가운데 정적 검사를 통과한 가장 오래된 버전을 두 번째 후보로 같은 확인을 한다(design.md '후보 고르기'). 후보는 provider마다 두 개 이하다.
  - 검증: `go build -o <tmp>/doan ./cli/cmd/doan`, `DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<후보별 userData>`, 그 위의 `.scratch` probe. 'E 결과' 실제 앱 표에 후보 × 항목의 통과·실패를 적는다. probe마다 전후의 후보 `--version`이 같고, 단계 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다(적어 둔 새 항목만 다르다).
- [x] E4. 실제 앱 확인(legacy external, Claude Code·Codex): 가짜 셸이 임시 `CLAUDE_CONFIG_DIR`·`CODEX_HOME`을 출력하게 하고 design.md '통과 기준' 10을 돌린다. 터미널은 design.md '실험 환경' 'legacy external'대로 갖춘다(같은 프로필 경로, `<tmp>/doan`과 `DOAN_RUNTIME`, 임시 프로필의 skill). 사람은 그 임시 프로필에 터미널에서 로그인한다. Codex 후보가 0.164.0 미만이면 X15를 본다.
  - 검증: E3과 같은 명령. 'E 결과'에 적고, 후보별 userData의 `sessions.jsonl`에 그 세션의 줄이 있고, 실제 runtime의 `sessions.jsonl`에는 없다. 단계 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다.
- [x] E5. 실험 worktree의 임시 변경(상수, floor, `io.ts`)을 되돌린다. 후보 CLI와 후보별 userData는 Z0까지 남긴다.
  - 검증: 실험 worktree에서 `git status --porcelain`에 `app/` 아래 변경이 없다.

### E 결과

(E0~E4가 채운다. 날짜, CLI 버전, 경로, 항목별 결과, 조용한 실패를 본 방법. 테스터는 익명으로 적는다.)

#### E0 (2026-11-05)

- **테스터 버전**: 없다. 사용자가 테스터들의 버전을 모른다고 했다. 그래서 하한을 테스터 버전 대신 날짜로 잡았다(사용자 결정, orch.md): 2026-09-28 이후의 정식 릴리스(`x.y.z`, prerelease와 플랫폼 패키지 제외)부터 지금 최소 버전 바로 아래까지.
- **릴리스 목록**(`npm view <pkg> time --json`, 2026-11-05 조회). 내려받기는 체인 '상시 권한'의 규칙 승인을 따른다.
  - Claude Code `@anthropic-ai/claude-code` 26개: 2.1.284~2.1.296, 2.1.299~2.1.311(2.1.297·2.1.298은 npm에 없다).
  - Codex `@openai/codex` 11개: 0.158.0, 0.159.0~0.159.3, 0.160.0, 0.160.1, 0.161.0, 0.162.0, 0.162.1, 0.163.0.
  - Copilot `@github/copilot` 15개: 1.0.89~1.0.98, 1.0.100~1.0.104(1.0.99는 npm에 없다).
  - Cursor: 후보 없음. 설치 경로가 `downloads.cursor.com/lab/<version>-<build hash>/darwin/arm64/agent-cli-package.tar.gz`라 build hash를 알아야 하는데, `downloads.cursor.com/lab/`과 `anysphere-binaries` S3 목록은 403이고 cursor.com/changelog·/cli·/docs/cli/changelog에도 버전 hash가 없다(`curl`, 2026-11-05). design '후보 CLI 설치'대로 E1에서 빼고 D1에서 지금 값(2026.10.22)을 유지한다.
- **Antigravity 코드 근거**: 최소 버전이 필요 없다. `MINIMUM_VERSIONS`에 키가 없고 도구 사실은 늘 `supported`다(`agentAuth/facts.ts:24`). Doan이 고정 버전 1.3.0 압축 파일을 SHA-256으로 확인하며 받고(`agentAuth/antigravity.ts:12-21`), sign-in 때 `initialize`의 `agentInfo.version`이 1.3.0인지 확인한다(`agentAuth/manager.ts:604-610` `acpOpen`). About은 늘 "Downloaded by Doan"이다(`aboutView.ts:34`). 사람이 Antigravity에서 Update를 볼 길이 없다.

#### E1 (2026-11-05)

- **설치**: 목록의 52개를 모두 설치했고 실패는 없다. 명령은 `npm install --prefix .scratch/cli-minimum-versions/clis/<provider>-<version> --no-audit --no-fund <pkg>@<version>`이다(`.scratch/cli-minimum-versions/install.sh`). 각 후보의 `--version`이 그 버전을 출력했다.
- **자체 업데이트 끄기**: PATH의 후보 항목은 wrapper(`.scratch/cli-minimum-versions/bin/<env>/<provider>`)이고, wrapper가 아래 switch를 설정한 뒤 후보를 `exec`한다(`live/env.sh`).
  - Claude Code: `DISABLE_AUTOUPDATER=1`. Claude Code settings 문서의 환경 변수이고, 후보 실행 파일에도 이 문자열이 있다(정적 표 `bin:DISABLE_AUTOUPDATER`).
  - Copilot: `COPILOT_AUTO_UPDATE=false`. 1.0.104 실행 파일의 loader가 이 값과 `--no-auto-update`를 읽는다(`process.env.COPILOT_AUTO_UPDATE?.toLowerCase()==="false"`).
  - Codex: switch가 없다. npm 빌드는 TUI에서 업데이트 안내만 보이고 스스로 설치하지 않는다.
- **사람의 상태 보호**: 비교 스크립트는 `.scratch/cli-minimum-versions/state/state.ts`다(`snap <name>`, `diff <a> <b>`). `app/runtime/real-state.ts`의 fingerprint에 Keychain 항목 목록(service·account·수정 시각), `~/.local/bin/claude`·`cursor-agent` 링크와 versions 목록, 전역 npm의 Codex·Copilot 버전, `~/Library/Caches/copilot/pkg/darwin-arm64` 목록을 더해 비교한다. 설치 전후가 같았다.
- **Copilot의 패키지 풀기**: Copilot은 처음 실행될 때 자기 패키지를 `~/Library/Caches/copilot/pkg/darwin-arm64/<version>`에 푼다. 도구 사실 probe가 실제 HOME에서 후보 `--version`을 돌려 `1.0.89`가 그곳에 생겼다(사람의 1.0.105는 그대로다). Z0에서 지운다.

#### E2 정적 검사 (2026-11-05, 로그인 없음, 임시 HOME)

스크립트는 `.scratch/cli-minimum-versions/static/`의 `claude.mjs`, `codex.py`, `copilot.mjs`이고, 결과 원본은 같은 디렉터리의 `*.json`·`*.txt`다.

| provider | 버전 | 항목 | 결과 |
|---|---|---|---|
| Claude Code | 2.1.284~2.1.311 (26개) | C1 `--version`. C2: 번들 SDK 0.3.312 `query()`로 후보를 띄워 초기화와 `supportedModels()`까지 간다. 옵션은 Doan과 같고(`settingSources`, `includePartialMessages`, `sessionId`, `canUseTool`, model·effort), 권한 모드 acceptEdits·plan·bypassPermissions(`allowDangerouslySkipPermissions`)와 `managedSettings.forceLoginOrgUUID`를 각각 따로 띄운다. C3 `auth login/status/logout`·`status --json`. C10 `mcp add/login/logout/remove/list/get`·`--transport`·`--scope`. C11: Keychain 이름에 `CLAUDE_CONFIG_DIR`의 sha256 앞 8자리를 붙이는 코드. 문자열 `forceLoginOrgUUID`, "managed settings require a first-party login", `CLAUDE_CODE_SESSION_ID`, `user_message_uuids` | 26개 모두 모든 항목 통과. **C2 실패 릴리스 없음** |
| Codex | 0.158.0~0.163.0 (11개) | `app-server generate-json-schema --experimental`로 만든 schema에서 X4~X13의 method(`initialize`, `account/read`, `model/list`, `thread/start`·`resume`, `turn/start`·`steer`·`interrupt`, `config/read`, `config/mcpServer/reload`, 알림과 승인 요청, `mcpServer/startupStatus/updated`, `mcpServer/elicitation/request`)와 필드(`ThreadStartParams.ephemeral`, `TurnStartParams.model/effort/approvalPolicy/sandboxPolicy`, `TurnSteerParams.expectedTurnId/clientUserMessageId`, `userMessage.clientId`)를 본다. X3 `login status`·`logout`, X13 `mcp` 하위 명령과 `add --url`·`list --json`. X2: 실행 파일의 `cli_auth_credentials_store`, `mcp_oauth_credentials_store`, `allow_login_shell` 문자열. 문자열 `thread-writer-locks` | 11개 모두 모든 항목 통과 |
| Copilot | 1.0.89~1.0.104 (15개) | P1 `--version`. `login`, `--acp`, `-p`·`--available-tools`, `--no-auto-update`. P4: `--acp --stdio`에 `initialize`만 보낸다(`protocolVersion` 1, `loadSession`, `authMethods` `copilot-login`). P2: 풀린 패키지(1.0.89~1.0.91은 `app.js`, 이후는 `cli-main.js`)의 `storeTokenPlaintext`와 `copilot-cli` | 15개 모두 모든 항목 통과. help에 `--stdio`는 없지만 `--acp --stdio`의 initialize가 응답했다 |

첫 후보는 정적 검사를 통과한 가장 오래된 버전이다: Claude Code 2.1.284, Codex 0.158.0, Copilot 1.0.89.

#### E3 실제 앱 확인 — Doan 연결 (2026-11-05)

- **환경**: 실험 빌드(`live/exp.sh set claude=2.1.284 codex=0.158.0 copilot=1.0.89`. `CLAUDE_REGISTRY_FLOOR`는 2.1.284, `CODEX_ROLLOUT_FLOOR`는 0.158.0, `io.ts`는 바꾸지 않음)를 `npm --prefix app run build`로 만들었다. 실행은 Playwright `_electron`의 driver(`live/driver.mjs`, mcp-connectors BF driver를 고친 것)로 했다. 실제 HOME, 후보별 userData(`.scratch/cli-minimum-versions/userData/<env>`), 후보 wrapper를 맨 앞에 둔 PATH를 출력하는 가짜 셸(`shells/<env>.sh`), `go build`한 `doan`, scratchpad의 임시 repo를 썼다. 스크린샷은 `live/shots/<env>/`에 있다.
- **sign-in**: Claude Code는 Doan이 `BROWSER` hook으로 받은 localhost 콜백 링크를 ego-browser에서 승인했다. Codex·Copilot의 `login`은 기본 브라우저(Chrome)를 직접 열었고, 사람이 Chrome에서 승인했다(Copilot은 이미 승인한 GitHub 앱이라 바로 끝났다). Doan이 "Open again"으로 넘긴 링크는 Claude는 `claude.com/cai/oauth/authorize`(redirect `localhost/callback`), Codex는 `auth.openai.com/oauth/authorize`, Copilot은 `github.com/login/oauth/authorize`(redirect `127.0.0.1/callback`)였다.
- **환경 이름**: e3a는 지금 설치본으로 sign-in한 뒤 PATH만 후보로 바꾼 환경, e3b는 후보로 새로 sign-in한 뒤 PATH를 지금 설치본으로 바꾼 환경이다. c3a·c3b는 Copilot의 같은 두 환경이다.

| 통과 기준 | Claude Code 2.1.284 | Codex 0.158.0 | Copilot 1.0.89 |
|---|---|---|---|
| 1(a) 지금 설치본 sign-in → PATH만 후보 → 다시 시작 | 통과(Connected, About 2.1.284 Supported) | 통과(0.158.0) | 통과(Check 뒤 Connected). 공용 프로필 복사본은 이 checkout의 dev 앱에서 vault를 읽지 못해(지금 설치본 Cursor도 `check_failed`) 쓰지 않고, 1.0.105로 새로 sign-in했다 |
| 1(b) 후보 sign-in → PATH를 지금 설치본으로 | 통과(2.1.318) | 통과(0.166.0) | 통과(1.0.105, Check 뒤 Connected) |
| 2 새 sign-in, credential 위치, 교체 취소 | 통과. 새 Keychain 항목은 `Claude Code-credentials-<프로필 hash>` 하나뿐이고 사람의 기본 항목은 같다. `doan onboarding sign-in` 뒤 `cancel`해도 connected·ready | 통과. 새 항목은 `Codex Auth\|cli\|<hash>` 하나이고 평문 `auth.json`이 없다. 교체 취소 뒤에도 connected, check 성공 | 통과. vault `copilot.bin`에만 저장되고 프로필에 평문 `config.json`이 남지 않는다. 공유 `copilot-cli` 항목은 그대로다. 교체 취소 뒤에도 connected |
| 3 새 대화, 고른 모델 | 통과(Haiku 4.5를 골랐고 답이 `claude-haiku-4-5-20251001`) | 통과(GPT-5.6-Luna를 골랐고 rollout의 `model`이 `gpt-5.6-luna`) | 통과. 모델은 Auto 하나뿐이고 1.0.105도 같다(`acpRunner.ts`의 "Copilot's only model") |
| 4 다시 시작 뒤 resume, 후보 대화를 지금 설치본으로 resume | 통과. 2.1.284 registry로도 resume됐다(`io.ts` 수정 불필요). 2.1.318에서도 resume | 통과. 0.166.0에서도 resume | 통과(`session/load`). 1.0.105에서도 resume |
| 5 권한 요청 허용·거절 | 통과(Bash 허용, Write 거절 뒤 파일 없음) | 통과(workspace 밖 쓰기 escalation 허용·거절) | 통과(명령 허용, 다음 요청 거절) |
| 6 권한 모드 | 통과. Accept edits는 묻지 않고 쓰고, Plan은 파일을 쓰지 않고 plan 파일과 ExitPlanMode 승인을 거친 뒤 composer가 Default가 되고, Full access는 묻지 않고 실행 | 통과. Default는 workspace 밖 쓰기를 묻고, Plan(read-only)은 workspace 쓰기가 `operation not permitted`, Accept edits는 workspace 쓰기, Full access는 workspace 밖 쓰기를 묻지 않음 | 통과. Default는 묻고, Plan은 파일 없이 plan만 쓰고, Full access는 묻지 않음 |
| 7 Send now, Stop | 통과(같은 턴 안에서 echo, Stop) | 통과(같은 턴 안에서 읽힘, Stop). Stop 뒤 실행 중이던 명령(`python3 … sleep`)이 끝까지 돈다. 0.166.0도 같아서 후보의 차이가 아니다 | 해당 없음 |
| 8 MCP | 통과(Notion Connect, 대화의 `notion-search` 호출, Disconnect. URL 서버 Add·Remove) | 통과(같은 항목. "Waiting for Notion" 뒤 "wasn’t ready" 줄 없이 도구가 불렸다) | 해당 없음 |
| 9 조용한 실패 | 통과. `apiKeyHelper` repo가 "Claude Code refused to run: this project’s Claude settings supply their own API key."로 거절된다. skill 목록에 `doan`이 있고, 도구 셸에 `CLAUDE_CODE_SESSION_ID`가 있다 | 통과. 서버를 연 뒤 rollout이 하나뿐이고(ephemeral), `command -v doan`이 번들 `doan`이고, `doan skill`을 읽고, `CODEX_THREAD_ID`가 있다. 0.158.0도 `thread-writer-locks/<id>.lock`을 만든다 | 통과. 모드 목록에 Default·Plan·Full access가 매핑되고, "Using skill: doan", `command -v doan`이 번들 `doan`이다 |

- Copilot 요청은 이 링크에서 약 9개를 썼다(상태 확인 3, 대화 턴 6).

#### E4 실제 앱 확인 — legacy external (2026-11-05)

- **환경**: 가짜 셸 `shells/e4.sh`가 임시 `CLAUDE_CONFIG_DIR`·`CODEX_HOME`(`legacy/e4/claude`, `legacy/e4/codex`)을 출력한다. 터미널은 `live/term.sh`(`env -i`로 에이전트 변수를 지운 셸)와 `live/term-e4.sh`(같은 프로필 문자열, PATH 맨 앞의 `go build`한 `doan`, `DOAN_RUNTIME=<e4 userData>/runtime.json`)로 갖췄다. 임시 프로필에는 `skills/doan`을 복사해 두었다.
- **로그인**: Claude는 `claude auth login`의 `BROWSER` 링크를 ego-browser에서 승인했다. Codex는 `codex login`이 연 Chrome에서 사람이 승인했다. Codex 임시 프로필의 `config.toml`에 `cli_auth_credentials_store = "keyring"`을 두어 터미널과 Doan 실행이 같은 저장소를 읽게 했다. 처음에는 로그인할 때만 `-c`로 지정해서 Doan 실행이 "Codex’s sign-in expired"로 거절했다(설정 불일치. 후보의 문제가 아니다).
- **세션 연결**: `claude -p`와 `codex exec`가 각각 `doan check`를 돌렸고, e4 userData의 `sessions.jsonl`에 두 줄(`claude`, `codex`)이 생겼다. 같은 canvas hash가 이미 기록돼 있으면 `doan check`가 새 줄을 쓰지 않으므로, 두 번째 세션은 canvas를 바꾼 뒤 check했다. Codex의 도구 셸은 로그인 셸이 PATH를 다시 만들어 사람의 `~/.local/bin/doan`이 앞에 왔으므로 `-c allow_login_shell=false`로 돌렸다. 실제 runtime의 `sessions.jsonl`에는 실험 줄이 없다. 설정 중에 지휘자 셸이 `DOAN_RUNTIME` 없이 `doan check`를 한 번 돌려 실제 `sessions.jsonl`에 지휘자 세션 줄이 하나 생겼고, 그 줄만 지워 실험 전과 같게 되돌렸다.

| 통과 기준 10 | Claude Code 2.1.284 | Codex 0.158.0 |
|---|---|---|
| canvas 패널의 "Continue the … session from your terminal"로 이어 가기 | 통과(터미널에서 기억시킨 단어를 답함) | 통과 |
| 지금 설치본(2.1.318, 0.166.0)으로 이어 가기 | 통과 | 통과 |
| 터미널이 세션을 잡고 있을 때 | 통과: `sendConversation`이 `session_in_use`(registry의 살아 있는 pid) | 통과: `session_in_use`(0.158.0이 writer lock을 잡는다. X15에 기댈 필요가 없다) |

- **관찰(버전과 무관)**: 이미 연 canvas 대화에서 `session_in_use`로 거절되면 패널은 "Couldn’t send your message. Try again."만 보인다. resume 모드의 "Couldn’t continue the terminal session: it’s in use in another terminal."이 아니다. 앱 코드 경로의 문제이므로 이 feature에서는 바꾸지 않고 보고만 한다.

#### E5 (2026-11-05)

- `live/exp.sh reset`으로 `minimumVersions.ts`·`sessions.ts`를 되돌렸다. `git status --porcelain`에 `app/` 아래 변경이 없다. 후보 CLI, 후보별 userData, legacy 프로필은 Z0까지 남긴다.
- **단계별 상태 비교**: 모든 단계 전후가 같았다. 다른 것은 단계 전에 예상한 새 Keychain 항목뿐이다: 프로필 6개의 `Claude Code-credentials-{cdbec310,37635edc,5db37fed}`(e3a·e3b·legacy e4), `Codex Auth|cli|{68e11cd6…,f61d7514…,73386666…}`, 그리고 Copilot 패키지 캐시의 `1.0.89`. Codex MCP OAuth 항목은 Disconnect 뒤 남지 않았다. 남은 `c3a-copy-unused` userData(공용 프로필 복사본)도 Z0에서 지운다.

### D1 결정 (2026-11-05)

사용자가 미리 정한 규칙(orch.md: 통과 기준을 모두 통과한 가장 오래된 후보, Claude Code는 C2 실패 릴리스보다 위)을 적용했다.

| provider | 지금 | 새 최소 버전 | floor |
|---|---|---|---|
| Claude Code | 2.1.312 | **2.1.284** (C2 실패 릴리스 없음) | `CLAUDE_REGISTRY_FLOOR` 2.1.312 → 2.1.284 |
| Codex | 0.164.0 | **0.158.0** | `CODEX_ROLLOUT_FLOOR` 0.163.0 → 0.158.0 |
| Copilot | 1.0.105 | **1.0.89** | 없음 |
| Cursor | 2026.10.22 | 유지(옛 버전을 받을 경로 없음) | 없음 |

- POSTMORTEM 2026-10-29: `rg -n 'loginClears: true' app/src/main/agentAuth/providers.ts`의 결과는 Codex 한 줄(`providers.ts:126`)이다. E3 통과 기준 2에서 세 후보 모두 교체 sign-in을 취소한 뒤 연결이 남았으므로 바꿀 것이 없다.
- Codex를 0.164.0 아래로 내리지만 0.158.0도 writer lock을 만들므로, PRODUCT 'Live terminal policy'와 `io.ts:116` 주석의 사실은 그대로다.

- **A1 rg 결과**: `rg -n '2\.1\.312|2\.1\.311|0\.164\.0|0\.163\.0|0\.162\.|1\.0\.105|1\.0\.104' app/src`로 옛 경계와 한 단계 아래 값을 찾았다.
  - 고침(새 경계 `2.1.284`·`0.158.0`·`1.0.89`, 한 단계 아래 `2.1.283`·`0.157.0`·`1.0.88`): `sessions.test.ts`(버전 표, `MINIMUM_VERSIONS`·floor 기대값, 저장 버전 표, 최소 버전 아래 사실), `facts.test.ts`(stub 출력과 경계 표), `about.test.ts`("Doan needs X or later."와 최소 버전 아래 Codex 값 `0.163.0` → `0.157.0`), `SettingsAbout.test.tsx:61`(같은 Codex 값), `prepare.test.ts`(최소 버전 아래 stub `0.162.0` → `0.157.0`, Codex rollout 표 `valid-0.163.0` → `valid-0.158.0`, `wrong-version`), `io.test.ts`(floor 아래 registry 버전 `2.1.310`·`2.1.311` → `2.1.283`, floor 위 `2.1.312` → `2.1.284`), `account.test.ts`(최소 버전 아래 Copilot `1.0.104` → `1.0.88`, Claude `2.1.310` → `2.1.283`; 뒤의 것은 `rg` 패턴에 없던 값이라 전체 `npm test`에서 잡혔다). 숫자 비교 사례 `copilot 1.0.99`는 새 최소 버전 위가 되어 `1.0.9`로 바꿨다.
  - 고치지 않음, 새 경계에서도 최소 버전 이상이라 뜻이 같다: `prepare.test.ts`·`prepareMcp.test.ts`·`account.test.ts`의 정상 stub 출력과 Codex rollout 기본값 `0.164.0`, `sessions.test.ts`의 파싱 예시와 `facts`의 `2.1.312`, `io.test.ts`의 registry fixture `2.1.312`, `ipc.test.ts`의 Copilot `1.0.105`(ToolFacts를 그대로 통과시키는 fixture), 모양이 틀려 거절되는 `v0.164.0`·`0.164.0 x` 등(버전 크기와 무관).
  - 고치지 않음, 관측 사실이라 최소 버전과 무관하다: `runners.test.ts`, `transport.test.ts`, `models.test.ts`, `identity.test.ts`, `manager.test.ts`, `providers.test.ts`의 주석·설명에 적힌 CLI 버전, `io.test.ts`의 `2.1.312` 주석.

── commit: `docs(feature): record cli-minimum-versions PoC results` ──

## D. 결정

- [x] D1. **사람의 결정**: E 결과를 보고 Claude Code, Codex, Cursor, Copilot마다 새 최소 버전을 정하거나 지금 값을 유지한다. 새 최소 버전은 design.md '통과 기준'을 모두 통과한 후보 중에서만 고른다. 새 최소 버전이 floor 아래면 그 floor도 새 최소 버전으로 내린다(Claude Code는 floor가 지금 최소 버전과 같아서 낮추면 반드시 해당한다). Claude Code는 새 최소 버전과 지금 최소 버전 사이에 C2에서 실패한 릴리스가 있으면 새 최소 버전을 그 릴리스보다 위로 잡는다. 결정을 'E 결과' 밑에 적는다.
  - 검증: 사람의 확인.

── commit: `docs(feature): cli-minimum-versions decisions` ──

## A. 테스트와 상수 (D1에서 낮추기로 정한 provider가 있을 때)

- [ ] A1. 테스트 먼저(`/tdd`): `sessions.test.ts`의 버전 표와 `MINIMUM_VERSIONS`·floor 기대값, `facts.test.ts`의 경계, `about.test.ts`의 "Doan needs X or later." 문구, `prepare.test.ts`의 최소 버전 아래 stub(지금 `codex-cli 0.162.0`)과 Codex rollout 버전 표, `io.test.ts`의 floor 아래 registry 버전을 새 경계로 바꾼다. 최소 버전 아래를 뜻하는 fixture 값(`SettingsAbout.test.tsx:61`의 Codex `0.163.0` 등)이 새 경계에서 뜻이 바뀌면 고친다. 빠짐을 막기 위해 옛 경계 값과 그 한 단계 아래 값으로 `rg -n` 한 결과를 'E 결과' 밑에 남기고, 고치지 않은 줄은 이유를 적는다. E3에서 Claude registry 모양이 달랐으면 그 기록의 fixture를 `io.test.ts`에 더한다.
  - 검증: `npm --prefix app test` — 새 경계 테스트가 red.
- [ ] A2. 구현: `minimumVersions.ts`, `sessions.ts`의 floor, (E3에서 registry 모양이 달랐으면) `io.ts`의 registry 기록 판정. 버전을 근거로 적거나 옛 규칙을 적은 주석(`minimumVersions.ts:1-2`의 "raising one is a decision…", `sessions.ts:10-11`의 floor 주석, `providers.ts`의 provider 주석, `io.ts:70`, `io.ts:116`(Codex를 0.164.0 아래로 내린 경우), `io.ts:142-145`, `conversation/fixtures/README.md`)은 사실이 바뀐 곳만 고친다. `rg -n 'loginClears: true' app/src/main/agentAuth/providers.ts`의 결과가 E3의 통과 기준 2 결과와 맞는지 본다(POSTMORTEM 2026-10-29).
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`.

── commit: A1은 `test(conversation): pin the lowered provider CLI minimums`, A2는 `feat(conversation): accept older provider CLIs` (`/ship`의 test → 구현 커밋 순서) ──

## C. 확인

- [ ] C1. `/runtime-test`: E3과 같은 checkout, 실제 HOME(design.md 'HOME과 로그인'), 커밋된 코드로 한다. 낮춘 provider마다 새 최소 버전과 정확히 같은 CLI를 쓴다. Settings > Agents가 Update 없이 Connected, About이 "Doan needs <새 버전> or later."다. 새 최소 버전보다 patch 하나 낮은 버전은 `--version`만 출력하는 stub 실행 파일을 가짜 셸 PATH에 두고 Update를 확인한다. 대화 기능 증거는 E3·E4의 같은 버전 결과를 다시 쓴다. A2에서 `io.ts`를 고쳤으면 통과 기준 4(resume)와 10을 다시 본다. Copilot의 Connected는 요청 하나를 쓰는 Retry가 필요하므로 사람에게 미리 알린다.
  - 검증: `DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<후보별 userData>`와 `.scratch` probe, 스크린샷. 단계 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다.
- [ ] C2. `/code-review`, 필요하면 `/refactor`. `/refactor`가 코드를 바꾸면 `refactor:` 커밋을 따로 만든다.
  - 검증: 보고서에 남은 지적이 없다.
- [ ] C3. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` exit 0.

`/agent-eval`은 하지 않는다. guide, CLI 출력·메시지, `doan check` 규칙, skill stub이 바뀌지 않는다(design.md '`/agent-eval`').

## Z. 정리와 승격

- [ ] Z0. 실험 정리: 실험이 만든 것만 지운다.
  - 후보별 userData의 연결을 앱에서 sign-out하고 Keychain 항목이 없어졌는지 본 뒤 userData를 지운다. 커밋된 앱이 그 후보 버전을 거절해서 sign-out하지 못하면 그 후보 값을 넣은 실험 빌드로 sign-out한다. sign-out이 `stop_required`로 거절되면 대화를 멈춘 뒤 다시 한다(BACKLOG: 그대로 앱을 끄면 Codex Keychain 항목이 남는다).
  - 통과 기준 8이 만든 MCP 연결은 Remove하고, Codex MCP OAuth의 Keychain 항목과 Claude MCP token이 남지 않았는지 본다. 실제 계정을 연결했으면 그 서비스에서 OAuth 승인도 거둔다.
  - 임시 legacy 프로필은 그 프로필에서 `claude auth logout`·`codex logout`을 돌린 뒤 지운다. 그 프로필의 Keychain 항목은 앱의 sign-out이 지우지 않는다.
  - `.scratch/cli-minimum-versions/clis/`를 지운다. 실험 전에 있던 `doan Safe Storage`는 지우지 않는다(design.md '사람의 상태 보호').
  - 검증: 실험 시작 전에 적어 둔 design.md '사람의 상태 보호'의 비교 대상과 같다. 사람의 사용으로 바뀐 항목은 그 사실을 적는다. 실험이 만든 Keychain 항목이 하나도 남지 않았다.
- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거와 E 결과 요약은 커밋 메시지에 둔다.
  - PRODUCT §3 'Transport and evidence boundary'(PRODUCT.md:58): Claude Code·Codex의 최소 버전 숫자. Cursor·Copilot의 숫자는 PRODUCT에 적지 않는다(원천은 `minimumVersions.ts`). floor를 내렸으면 "fixed floors that do not follow the minimums"를 floor가 낮아진 최소 버전을 따라 내려간다는 규칙으로 고친다. Codex를 0.164.0 아래로 내렸으면 'Live terminal policy'(PRODUCT.md:62)의 writer lock 문장도 그 버전의 사실에 맞춘다.
  - ARCHITECTURE §7 'Agent authentication' 'Versions'(ARCHITECTURE.md:530): 최소 버전을 낮출 때 그 버전이 통과 기준을 모두 통과해야 한다는 규칙(올릴 때의 규칙은 그대로), provider 표면을 더하는 feature는 그 표면을 지금 최소 버전에서 확인하거나 최소 버전을 올리는 결정을 한다는 규칙, Antigravity에 최소 버전이 없는 이유. 'Transport and environment'(:433-434): floor는 낮아진 최소 버전을 따라 내려간다는 규칙. steer 관찰 버전(:437), writer lock 버전(:442), effort 관찰(:506), 0.163.0 관찰(:459)은 사실이 바뀐 곳만. 'Known limits'(:576-578)는 사실이 바뀐 곳만.
  - 어느 provider도 낮추지 않았으면 PRODUCT는 그대로 두고, ARCHITECTURE에는 위 두 규칙과 Antigravity에 최소 버전이 없는 이유만 더한다. 실험 관찰(어느 버전이 어느 항목에서 실패했는지)은 커밋 메시지에 남긴다.
  - 그리고 `docs/features/cli-minimum-versions/`를 지운다.
  - 검증: `grep -n 'verified minimums' docs/PRODUCT.md`의 숫자가 `MINIMUM_VERSIONS`와 같다. floor를 내렸으면 `grep -n 'do not follow the minimums' docs/PRODUCT.md docs/ARCHITECTURE.md`의 결과가 없다. ARCHITECTURE.md:530 부근에 낮출 때의 규칙과 provider 표면 규칙이 있다. `docs/features/cli-minimum-versions/`가 없다.

── commit: `docs(product): lower the provider CLI minimum versions` / `docs(architecture): evidence for changing a CLI minimum` / `docs(feature): remove cli-minimum-versions docs` ──
