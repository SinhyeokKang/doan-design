# provider-commands — design

## 영향받는 구성
- **앱 main**
  - `conversation/skills.ts`: 명령 목록을 파싱한다.
  - runner 보내기 경로: Claude는 Agent SDK, Codex는 app-server 요청, ACP는 `acp.ts`·`acpRunner.ts`를 쓴다.
  - 세션 연결: `runners.ts:181`의 세션 id 고정 검사와 `store.ts`의 `SessionBinding`을 바꾼다.
- **앱 renderer**
  - `/` 목록, Presets 팝오버, 하이라이트, 보내기 조립(PRODUCT §5 'Project skills'의 Lists·Highlight·Sending 규칙)
  - 큐 행, 스레드의 경계와 카드
- **CLI, 스킬, 캔버스 형식**: 영향 없음.

## 순수 함수로 뗄 부분 (`/tdd` 대상)
- `parseClaudeCommands(commands)`: `builtin: true` 항목 중 허용 목록에 있는 것만 고른다.
- `parseAcpCommands(update)`: `available_commands_update`에서 허용 목록에 있는 명령만 고른다.
- 허용 목록: 프로바이더별로 PoC에서 확인한 명령과 확인 CLI 버전을 담는 고정 표다(아래 '허용 목록'). `minimumVersions.ts`처럼 버전을 함께 적는다. Claude와 Codex는 확인 버전 이상이면 표 그대로 쓴다(결정 9). ACP는 이 표와 서버가 알려 준 목록의 교집합을 쓴다.
- `commandRequest(provider, text)`: 보낼 텍스트를 프로바이더 요청으로 바꾼다. Claude와 ACP는 텍스트를 그대로 보낸다. Codex는 `/compact` → `thread/compact/start`, `/review` → `review/start`로 바꾼다. `/review` 뒤 텍스트가 없으면 target은 `uncommittedChanges`, 있으면 그 텍스트를 `custom`으로 보낸다(결정 11).
- `classifyFirstWord(text, lists)`: 첫 단어를 다음 넷 중 하나로 판정한다.
  - 허용 명령
  - 목록 밖 내장 명령(카드 대상)
  - 프로젝트 스킬: 이름이 명령과 같으면 스킬이 우선한다.
  - 일반 텍스트
  - 한글이 붙은 경우(`/compact해줘`)는 스킬 하이라이트 규칙과 같게 끊는다.
- 보내기 조립: 첫 단어가 명령이면 프리셋·스킬 고정 줄을 붙이지 않는다. 명령 뒤의 텍스트는 인자로 보낸다.
- 큐 규칙: 명령은 다른 메시지와 합치지 않는 별도 큐 행이 되고, Send now 대상이 아니다.
- 경계 뷰: 프로바이더 세션 기록 이벤트를 경계 행으로 바꾼다. Claude 압축은 `system` `compact_boundary`(`fixtures/claude-context.json:97`), Claude 지움은 새 세션 기록 첫머리의 `/clear` 명령 줄, Codex 압축은 `contextCompaction` 아이템 하나뿐인 턴을 쓴다(PoC: `thread/compacted`는 오지 않는다). Copilot 압축은 결과 텍스트로 이번 실행에서만 경계를 만든다.
- 숨길 기록: Claude `/compact` 뒤의 요약 `user` 메시지와 `<local-command-stdout>` 줄, Codex `/review`의 `interrupted` 자식 턴(`rootTurnId`가 리뷰 턴)은 스레드에 보이지 않는다.
- 카드 뷰: 명령 이름과 프로바이더에서 문구와 행동을 정한다.

## 형식 변경
- IPC 타입: `SkillSummary`에 행 종류(`skill` | `command`)를 추가한다. 디스크 형식이 아니므로 JSON Schema는 바뀌지 않는다.
- 대화 기록: 바꾸지 않는다(결정 4). 경계는 프로바이더 세션 기록에서 다시 만들고, 카드는 기록에 남기지 않는다.
- 세션 연결(`SessionBinding`): 필드는 그대로 두고 값만 새 id로 다시 쓴다(결정 5). 형식이 바뀌어야 한다면 PoC 뒤 이 절을 다시 열고, schema·`v`·TS/Go 공유 fixture(ARCHITECTURE §11)를 이 feature에 추가한다.
- **PoC 뒤 다시 연 항목(정함).**
  - 세션 연결: 형식 변경이 필요 없다. `/clear`가 동작하는 프로바이더는 Claude뿐이다. 새 id는 `system/init`의 `session_id`로 받아 기존 필드에 다시 쓴다.
  - 대화 기록: Copilot `/compact`의 경계는 이번 실행에서만 보인다(결정 4의 예외). `session/load` 재생에 압축 기록이 없고, Copilot 내부 파일 `session-state/<id>/events.jsonl`에만 남기 때문이다. 대화 기록 형식은 바꾸지 않는다.

## 허용 목록 (PoC 2026-11-17)

| 프로바이더 | 확인 버전 | 목록에 두는 명령 | 결과 표시 |
|---|---|---|---|
| Claude Code | CLI 2.1.326, SDK 0.3.312 | `/compact`, `/clear`, `/init`, `/review`, `/context`, `/usage` | compact·clear는 경계, 나머지는 일반 답변 |
| Codex | 0.167.1 | `/compact`, `/review` | compact는 경계(요청 매핑), review는 일반 답변(요청 매핑) |
| Cursor | 2026.10.22 | `/copy-request-id` | 일반 답변 |
| GitHub Copilot | 1.0.105 | `/compact`, `/init`, `/review`, `/context`, `/usage`, `/session`, `/rename` | compact는 이번 실행에서만 경계. `/context`는 고정폭 텍스트 |
| Antigravity | 1.3.0 | 없음 | — |

- Claude `/cost`는 목록에 `/usage`로 있으므로 `/usage`를 쓴다.
- Claude `builtin: true` 목록의 번들 스킬(`deep-research`, `design`, `code-review`, `simplify` 등)은 이번 범위가 아니다. 표에 없는 명령은 목록에 나오지 않는다.
- 카드 대상(결정 2, 동작 안 함으로 확인된 명령):
  - Claude `/model`
  - Copilot `/model`
  - Antigravity `/logout`(보내면 Doan 연결 인증을 지운다), `/plan`(결정 12)
  - 모든 프로바이더의 비목표 명령(`/model`, `/config`, `/login`, `/logout`, `/permissions`, `/theme`)
  - Codex·Cursor·Antigravity의 `/clear`, `/compact` 등 표에 없는 후보 명령. 이 프로바이더들은 목록 밖 명령을 모델에 보내면, 실제로 하지 않은 일을 했다고 답한다(PoC).
- ACP 서버가 알려 주지만 PoC로 확인하지 않은 명령은 목록에도 카드에도 두지 않는다. 사람이 직접 치면 그대로 보낸다(결정 10).

## ACP 명령 목록의 수명
- ACP 서버는 `available_commands_update`를 보낸다. 시점은 서버마다 다르다(PoC): Cursor는 `session/new` 응답 뒤 한 번, Copilot은 응답 전과 직후, 그리고 프롬프트마다, Antigravity는 응답 직후다. `session/load` 때도 온다. 그래서 응답 전에 온 update도 받아야 한다. 지금 runner는 prompting 중인 `session/update`만 처리한다.
- 세션이 열려 있으면 마지막 update를 대화별로 보관해 목록으로 쓴다. 세션이 없으면(첫 메시지 전) 명령 행을 보이지 않는다. 이것은 스킬 목록의 "읽기 전에는 행 없음" 규칙과 같다.
- 연결이 바뀌면 그 연결로 받은 목록만 쓴다. 다음 postmortem 항목과 같은 이유다: 2026-11 "The Codex model list stayed the previous account's…"(`skills.ts:56` 주석이 가리키는 항목).

## 규칙·결정 영향
- PRODUCT §5 'Project skills'의 "not its built-in commands" 문구를 바꾼다.
- PRODUCT 'Resume and permissions'·'Session identity'에 예외를 둔다. 사람이 고른 `/clear`가 세션 id를 바꾸면, 대화가 새 id를 따라간다.
- 모두 마지막 task에서 고친다.

## PoC 의존 (task 1이 먼저다)
- Claude: SDK 대화에 후보 명령을 텍스트로 보내고 오는 메시지를 기록한다. 압축 경계는 fixture에 이미 있으므로 `/clear`의 세션 id 변화와 텍스트 결과 명령을 중심으로 본다.
- Codex: `thread/compact/start`, `review/start`의 실제 응답과 이벤트, `/clear`에 대응하는 요청이 있는지 확인한다. 요청 이름은 `codex app-server generate-json-schema`(0.167.1)로 확인했다.
- ACP 세 프로바이더: `available_commands_update`가 오는 시점과 내용, 그 명령을 보냈을 때의 결과를 확인한다.
- 결과는 프로바이더×명령 표로 남긴다. 각 칸은 '동작함 / 표시 필요 / 동작 안 함' 중 하나와 기대 결과, 확인 버전이다.

### PoC 결과 (task 1, 2026-11-17)

**확인 방법.** `.scratch/provider-commands-poc/`에서 프로바이더마다 격리 프로필을 썼다. HOME은 임시 디렉터리로 두고, `CLAUDE_CONFIG_DIR`·`CODEX_HOME`·`GEMINI_HOME`·`DOAN_RUNTIME`도 그 안을 가리켰다. 작업 디렉터리는 빈 git 저장소다. 실제 HOME, `~/.claude`, `~/.codex`, userData는 쓰지 않았다.
- Claude: `runners.ts`처럼 Agent SDK `query()`를 턴마다 새로 열고 `resume`으로 이었다. 가짜 HOME에는 로그인 Keychain이 없어서 `claude auth login`이 저장에 실패했다. 그래서 `claude setup-token` 토큰을 `CLAUDE_CODE_OAUTH_TOKEN`으로 넘겼다.
- Codex: `codex app-server`에 `thread/start`·`turn/start`·`thread/compact/start`·`review/start`·`thread/read`를 직접 보냈다. 로그인은 `cli_auth_credentials_store="file"`이다.
- ACP: `acpRunner.ts`와 같은 `initialize` → `session/new`/`session/load` → `session/prompt` 순서로 보냈다. 권한 요청은 allow_once로 답했다.

**확인 버전.**

| 프로바이더 | 확인 버전 |
|---|---|
| Claude Code | CLI 2.1.326, Agent SDK 0.3.312 |
| Codex | codex-cli 0.167.1 (app-server) |
| Cursor | cursor-agent 2026.10.22-27dcf5f (`agent acp`) |
| GitHub Copilot | 1.0.105 (`--acp --stdio`) |
| Antigravity | ACP 서버 1.3.0 (`agy_acp_server.par`) |

**판정 기준.**
- 동작함: 텍스트로 보내면 프로바이더가 명령으로 처리하고, 결과가 일반 답변이나 일반 턴으로 와서 지금 표시로 충분하다.
- 표시 필요: 명령으로 처리되지만 경계, 실행 라벨, 요청 매핑, 기록 정리처럼 Doan 쪽 처리가 더 있어야 한다.
- 동작 안 함: 명령으로 처리되지 않는다. 텍스트가 모델에 일반 메시지로 가거나, 대응하는 요청이 없다.

#### 프로바이더×명령 표

| 명령 | Claude Code | Codex | Cursor | GitHub Copilot | Antigravity |
|---|---|---|---|---|---|
| `/compact` | **표시 필요.** `system/status`(`compacting`) → `status: null, compact_result: success` → `system/compact_boundary`(`trigger: manual`, `pre_tokens`·`post_tokens`) → 요약 `user` 메시지와 `<local-command-stdout>Compacted </local-command-stdout>` → `result` success(`result: ""`, `num_turns: 0`). 기대: "Compacting…" 뒤 압축 경계와 컨텍스트 링 갱신. 요약 메시지와 stdout 줄은 숨긴다. | **표시 필요.** `thread/compact/start`로 보낸다. 응답은 곧바로 `{}`이고, 사용자 메시지 없는 턴이 따로 열린다(`turn/started` → `item/started` `contextCompaction` → `thread/tokenUsage/updated` → `item/completed` → `turn/completed`). `thread/compacted` 알림은 오지 않았다. 텍스트 `/compact`는 동작 안 함이다(모델이 "Context compacted."라고만 답하고 압축은 없다). | **동작 안 함.** 목록에 없다. 모델이 대화 요약을 답으로 쓸 뿐이다. | **표시 필요.** 모델 호출 없이 "Compacted conversation history and removed 1 message and 0 tokens." 텍스트와 `usage_update`가 온다. 재시작 뒤 경계를 ACP로 다시 만들 수 없다(아래 '재시작 뒤 경계'). | **동작 안 함.** 목록에 없다. 모델이 요약을 지어 답하고, `usage_update`의 `used`는 계속 늘었다(12172 → 12293). |
| `/clear` | **표시 필요.** `conversation_reset`(`trigger: clear`)이 온 뒤, 다음 `system/init`부터 새 `session_id`가 온다(5625b508… → bda22031…). `result`는 success, `result: ""`이다. `conversation_reset.new_conversation_id`(94d0fd20…)는 새 세션 id와 **다르다**. 새 id로 `resume`하면 이어진다. 기대: 지움 경계, 대화가 init의 새 `session_id`를 따라간다. | **동작 안 함.** app-server에 대응 요청이 없다(스키마 0.167.1). TUI의 `/clear`는 "clear the terminal and start a new chat"(바이너리 문자열)이고, 이것은 새 thread다. 텍스트 `/clear`는 모델이 "Ready for a new task."라고 답할 뿐이다. | **동작 안 함.** 목록에 없다. 모델이 "컨텍스트를 비웠다"라고 답하지만 지우지 않는다. | **동작 안 함.** 목록에 없다. 모델에 그대로 가서 직전 답("hello")을 되풀이했다. | **동작 안 함.** 목록에 없다. 모델이 "Context cleared."라고 답하지만 지우지 않는다. |
| `/init` | **동작함.** 도구를 쓰는 에이전트 턴으로 돈다. 결과는 텍스트 답변이다. 목록에 있다. | **동작 안 함.** app-server에 대응 요청이 없다(TUI: "create an AGENTS.md file with instructions for Codex"). 텍스트로 보내면 모델이 짐작해서 `AGENTS.md`를 만들었다. 명령으로 처리된 것은 아니다. | **동작 안 함.** 목록에 없다. 모델이 무엇을 만들지 되물었다. | **동작함.** 서버가 "Analyze this codebase and create a .github/copilot-instructions.md…" 프롬프트로 바꿔 에이전트 턴을 돌린다. 파일을 만들고 텍스트로 답한다. | **동작 안 함.** 목록에 없다. 모델이 도구로 저장소를 훑고 `GEMINI.md`를 만들었다. 서버가 명령으로 바꿨는지는 로그로 구분할 수 없었다. 목록에 없으므로 명령으로 다루지 않는다. |
| `/review` | **동작함(목록 밖).** 번들 code-review가 서브에이전트로 돌고(`task_started` description `/code-review`) 텍스트로 답했다. 그런데 `initializationResult().commands`에 `review`가 없다. 따라서 교집합 규칙(design '순수 함수')을 쓰면 빠진다. | **표시 필요.** `review/start`(`target: {type: "uncommittedChanges"}`)로 보낸다. 응답에 사용자 메시지 "current changes"가 있는 턴이 오고, 아이템은 `enteredReviewMode` → (명령 실행) → `exitedReviewMode`(리뷰 본문) → `agentMessage`다. target은 `uncommittedChanges`·`baseBranch`·`commit`·`custom` 넷이다. 인자 텍스트를 target으로 바꾸는 규칙이 필요하다. 재시작 뒤 `thread/read`에는 리뷰 턴 앞에 `rootTurnId`가 리뷰 턴인 자식 턴이 `interrupted`로 따로 나온다. 리뷰용 rollout 파일도 하나 더 생긴다. 이 자식 턴은 숨겨야 한다. 텍스트 `/review`는 동작 안 함이다(모델이 일반 리뷰를 했다). | **동작 안 함.** 목록에 없다. 모델이 "리뷰할 변경이 없다"라고 답했다. 목록의 `multi-model-review`는 보내 보지 않았다. | **동작함.** 리뷰 에이전트 턴이 돌고 텍스트로 답한다. 재시작 뒤 `session/load` 재생에서는 사용자 메시지가 "Review: my code changes"로 바뀌고, 답 텍스트가 두 번 재생된다. | **동작 안 함.** 목록에 없다. 모델이 작업 트리를 읽고 일반 리뷰 텍스트로 답했다. |
| `/context` | **동작함.** 모델 호출 없이 마크다운 표 텍스트(Model, Tokens, 항목별 사용량)를 `result`로 돌려준다. 목록에 있다. | **동작 안 함.** 대응 요청이 없다. 모델이 작업 디렉터리를 설명했다. | **동작 안 함.** 목록에 없다. 모델이 지어서 답했다. | **동작함.** 모델 호출 없이 컨텍스트 사용량 텍스트 블록이 온다(ASCII 격자와 항목별 토큰, 고정폭 글꼴 전제). 재시작 뒤 재생에는 나오지 않는다. | **동작 안 함.** 목록에 없다. 모델이 작업 디렉터리와 대화 id를 나열했다. |
| `/cost` | **동작함(목록 밖).** 텍스트(Estimated cost, duration, 모델별 사용량)로 답한다. 기록에는 `/usage`로 남는다. 목록에는 `cost`가 없고 `usage`가 있다. | **동작 안 함.** 대응 요청이 없다. 모델이 "I don’t have access…"라고 답했다. | **동작 안 함.** 목록에 없다. | **동작 안 함.** 목록에 없다. 대신 목록의 `/usage`가 모델 호출 없이 세션 사용량 텍스트를 돌려준다. | **동작 안 함.** 목록에 없다. 모델이 도구로 자기 대화 파일을 뒤져 사용량을 찾으려 했다. |

#### ACP 서버가 알려 주는 명령

| 프로바이더 | `available_commands_update` 시점 | 내용 | 보내 본 결과 |
|---|---|---|---|
| Cursor | `session/new` 응답 뒤 약 0.6초. `session/load` 때는 기록 재생과 응답이 끝난 뒤. 한 번 온다. | 25개: `copy-request-id`, `multi-model-review`, `simplify`, `worktree`, `apply-worktree`, `delete-worktree`, `best-of-n`, `agent-sdk-create-agent`, `autopilot`, `create-hook`, `create-rule`, `create-skill`, `create-subagent`, `goal`, `loop`, `migrate-to-skills`, `new-repo`, `origin`, `rename-chat`, `sdk`, `share`, `shell`, `split-to-prs`, `statusline`, `update-cli-config`. `input.hint`는 모두 없다. 후보 여섯 개는 하나도 없다. | `/copy-request-id`: 모델 호출 없이 "No request ID found…" 텍스트(동작함). `/rename-chat`: 모델이 "rename_chat 도구가 없다"라고 답했다(동작 안 함). `/statusline`: 모델이 `~/.cursor` 설정을 읽고 수정을 제안하는 에이전트 턴(터미널 설정용). 나머지는 보내지 않았다. |
| GitHub Copilot | `session/new` 응답 **전**(1.3초, 응답은 3.0초)과 응답 직후에 한 번 더 온다. `session/load` 때도 응답 전에 오고, 프롬프트마다 다시 온다. | 32개: `add-dir`, `allow-all`, `permissions`, `autopilot`, `compact`, `blame`, `chronicle`, `context`, `cwd`, `env`, `every`, `after`, `fleet`, `init`, `list-dirs`, `mcp`, `memory`, `model`, `plan`, `plugin`, `rename`, `research`, `remote`, `reset-allowed-tools`, `review`, `sandbox`, `security-review`, `session`, `share`, `skills`, `subconscious`, `usage`. `session/load` 뒤에는 `index`가 더해져 33개다. 대부분 `input.hint`가 있다(예: `compact` "focus instructions"). | `/usage`, `/session`: 모델 호출 없이 텍스트(동작함). `/rename poc-renamed`: `session_info_update`(title)와 텍스트(동작함). `/model`: "The model-picker dialog is only available in the interactive CLI."(동작 안 함, 결정 2의 카드 대상). 나머지는 보내지 않았다. |
| Antigravity | `session/new` 응답 직후(같은 ms). `session/load` 때는 기록 재생 중간에 온다. | 2개: `plan`, `logout`. | `/plan <작업>`: 계획 문서(`<GEMINI_HOME>/antigravity-acp/brain/<id>/task.md`)를 만들고 "click **Proceed**"로 승인을 기다리는 텍스트로 끝난다. 편집 도구 호출 하나는 "approved but never executed"로 실패한다. 재생 때는 사용자 메시지가 `/BuiltinSlashCommandName.PLAN …`으로 나온다(표시 필요). `/logout`: 저장된 인증 정보와 `settings.json`의 `auth.type`을 지운다. `acp_token.json`이 사라졌다. Doan 연결을 몰래 끊으므로 보내면 안 된다(결정 2의 카드 대상). |

#### `/clear`와 세션 id
- Claude만 `/clear`가 실제로 동작하고, 세션 id가 바뀐다. 새 id는 `conversation_reset` 다음의 `system/init`과 `result`의 `session_id`에서 읽는다. `conversation_reset.new_conversation_id`는 세션 id가 아니라서 쓰면 안 된다.
- 새 세션의 기록 파일(`<id>.jsonl`)은 `/clear` 명령 줄(`<command-name>/clear</command-name>`, `system` `local_command`)로 시작한다. 이전 세션 파일에는 `/clear` 기록이 없다. 두 파일은 서로의 id를 담지 않는다.
- Codex, Cursor, Copilot, Antigravity에는 같은 대화에서 컨텍스트를 비우는 경로가 없다.

#### 재시작 뒤 경계를 다시 만들 수 있는가
| 경계 | 근거 이벤트 | 가능 여부 |
|---|---|---|
| Claude 압축 | 세션 기록 파일의 `system` `compact_boundary`(`compactMetadata.trigger: manual`) | 가능 |
| Claude 지움 | 새 세션 기록 파일 첫머리의 `/clear` 명령 줄 | 가능. 대화가 새 id를 따라간 경우에 한한다 |
| Codex 압축 | `thread/read`(새 app-server, `thread/resume` 뒤)에서 `contextCompaction` 아이템 하나뿐인 턴. rollout에는 `compacted` 줄 | 가능 |
| Copilot 압축 | `session/load` 재생에는 `/compact` 턴이 통째로 빠진다. `~/.copilot/session-state/<id>/events.jsonl`에만 `session.compaction_start`/`session.compaction_complete`가 있다 | ACP로는 불가능. 비공개 파일을 읽어야 한다 |

#### 결정에 영향을 주는 관찰
- Claude의 `builtin: true` 목록(54개)은 터미널 명령만이 아니다. `deep-research`, `design`, `code-review`, `simplify` 같은 번들 스킬도 `builtin: true`로 온다. `review`와 `cost`는 동작하지만 목록에 없다. 그래서 '허용 목록 ∩ CLI 목록' 규칙으로는 Claude의 `/review`·`/cost`가 빠진다.
- 목록 밖 명령은 대부분 모델에 일반 텍스트로 간다. 이때 모델이 "컨텍스트를 비웠다", "압축했다"처럼 실제로 하지 않은 일을 했다고 답한다(Codex·Cursor·Antigravity). 결정 2의 카드가 이 오해를 막는다.
- Claude `/model`(인자 없음)은 현재 모델과 사용법을 텍스트로 돌려준다. Copilot `/model`은 거절 텍스트를 돌려준다. 둘 다 결정 2의 카드 대상이다.
- 압축 중 상태는 Claude만 이벤트로 온다(`system/status` `compacting`). Codex는 `contextCompaction` 아이템의 시작·완료가 그 역할을 한다. Copilot은 결과 텍스트 한 번뿐이다.
- 이 문서 '순수 함수로 뗄 부분'의 경계 뷰는 Codex에 `thread/compacted`를 쓴다고 적었다. 0.167.1에서 이 알림은 오지 않았다. 압축 경계의 근거는 `contextCompaction` 아이템이다.

#### 확인하지 못한 것
- 컨텍스트 링 값이 압축 뒤 실제로 줄어드는지는 재지 않았다. 대화가 짧아서 Codex와 Copilot의 사용량은 거의 그대로였다. Claude는 `post_tokens`(3596)만 보았고, 앱의 링 읽기 경로로는 재지 않았다.
- ACP 목록의 명령은 표에 적은 것만 보냈다. 나머지(Cursor 22개, Copilot 25개)는 보내지 않았다.
- 실행 중인 턴에 명령을 보내는 경우(결정 6)와 Claude에서 `/clear` 뒤 이전 세션 id로 `resume`하는 경우는 보내지 않았다.
- Antigravity `/init`이 서버의 명령 처리인지 모델의 판단인지 구분하지 못했다.

## postmortem에서 가져온 주의
- 2026-11 "The Codex model list stayed the previous account's…": 목록 읽기는 요청마다 자기 lease로 준비한다. 같은 `SkillCatalog` 경로를 쓴다.
- 2026-10 프로토타입 컴포저 설정 push 순서 문제(2026-10.md:311): 프로토타입 창 컴포저도 같은 목록과 규칙을 받는지 테스트한다.
- PoC와 dev 실행은 실제 HOME과 프로필을 쓰지 않는다. 격리된 `CLAUDE_CONFIG_DIR`/`CODEX_HOME`을 쓴다(AGENTS 'Commands').

## 결정
1. **`/clear`는 그대로 보낸다.** 같은 대화 안에서 컨텍스트를 비우고, 스레드에 경계를 남긴다. 경계 라벨은 "Context cleared — the agent won’t see messages above"다.
2. **목록 밖 내장 명령은 보내지 않고 카드로 알린다.** 첫 단어가 그 프로바이더의 내장 명령인데 허용 목록에 없으면(`/model` 등), 자동완성에 나오지 않는다. 보내면 프로바이더에 보내지 않고 턴도 시작하지 않는다. 카드는 다음과 같다.
   - 제목: "/<name> doesn’t run in Doan". 명령 이름은 코드 스타일 없이 평문이다.
   - Doan에 같은 기능이 있을 때: 본문 "Choose the model from the model picker."와 버튼 "Open model picker"(명령별 문구 표)
   - 같은 기능이 없을 때: 본문 "Run it in <provider> in a terminal.", 버튼 없음
   - 닫기는 Dismiss이고, 보낸 텍스트는 컴포저로 돌아온다.
   - 내장 명령 이름을 아는 경로: Claude는 SDK의 `builtin` 목록, Codex는 PoC로 만든 고정 이름 표, ACP는 `available_commands_update`다.
3. **명령은 혼자서만 보낸다.** 명령을 고르면 프리셋 칩이 빠지고 "Presets don’t apply to commands"로 알린다. 명령 단어를 지우면 칩을 복원한다. 명령 메시지에는 고정 줄을 붙이지 않는다.
4. **경계만 재시작 뒤에 남는다.** 경계는 프로바이더 세션 기록 이벤트에서 다시 만든다. 카드는 이번 실행에서만 보인다. 예외: Copilot의 압축 경계는 이번 실행에서만 보인다. Copilot은 압축 기록을 세션 복원(session/load)에 내주지 않고, Doan은 비공개 파일(events.jsonl)을 읽지 않으며 기록 형식도 바꾸지 않는다(PoC).
5. **`/clear`로 세션 id가 바뀌면 새 id를 따라간다.** 사람이 고른 `/clear`에 한해 대화의 세션 연결을 새 id로 다시 쓴다. 다시 쓸 때도 profile·cwd 검증(PRODUCT 'Session identity')을 거친다. `/clear`가 동작하는 프로바이더는 Claude뿐이다(PoC). 새 id는 `conversation_reset` 다음 `system/init`의 `session_id`에서 읽는다. `conversation_reset.new_conversation_id`는 세션 id가 아니므로 쓰지 않는다.
6. **실행 중인 턴에 보낸 명령은 별도 큐 행이 된다.** 다른 메시지와 합치지 않고 턴이 끝난 뒤 혼자 간다. 명령 행에서 Send now는 비활성이다.
7. **명령 턴은 기존 턴 표시를 쓴다.**
   - 실행 중: 기존 진행 표시를 쓰고, 라벨은 명령별로 둔다. 예: "Compacting…"
   - 텍스트 결과: 일반 답변처럼 보인다.
   - 실패: 기존 턴 실패 표시를 쓴다.
   - 끝나면 컨텍스트 링을 갱신한다.
   - 대화 제목 규칙에서는 명령 턴을 뺀다.
8. **목록 규칙**
   - 명령 행은 스킬처럼 회색 타일에 터미널 아이콘이다.
   - Presets 팝오버에서는 Project 탭 뒤에 'Commands' 탭을 둔다.
   - 이름이 같으면 프로젝트 스킬이 우선한다.
   - 하이라이트는 스킬과 같은 규칙을 쓴다.
   - 질의가 명령 이름과 같으면 Enter는 보낸다.
   - 목록 읽기 중, 실패, 명령 없는 프로바이더는 스킬 목록 규칙을 그대로 따른다. 실패하면 행이 없고 마지막 목록을 유지한다.
   - 카드의 행동 버튼을 누르면 해당 picker로 포커스가 간다. 카드는 status로 알린다.

9. **Claude·Codex는 고정 허용 목록을 쓴다.** CLI 목록과 교집합을 내지 않는다. Claude `/review`·`/cost`처럼 동작하지만 SDK 목록에 없는 명령이 있기 때문이다(PoC). 확인 버전보다 낮은 CLI에서는 명령 행을 보이지 않는다. ACP는 서버 목록과의 교집합을 쓴다.
10. **확인하지 않은 ACP 명령은 텍스트로 보낸다.** 서버가 알려 주지만 PoC로 확인하지 않은 명령은 목록에 두지 않는다. 사람이 직접 치면 카드 없이 그대로 보낸다. 서버가 처리한다.
11. **Codex `/review`의 target.** 뒤 텍스트가 없으면 `uncommittedChanges`, 있으면 그 텍스트를 `custom`으로 보낸다. 브랜치나 커밋 지정은 텍스트로 쓴다.
12. **Antigravity `/plan`은 이번 범위에서 뺀다.** 계획을 만든 뒤 'Proceed' 승인을 기다리는데, Doan에는 그 승인 UI가 없다. 카드 본문: "Use Plan mode in the permission picker." 승인 흐름은 BACKLOG에 남긴다.

## 디자인 프리셋
- 아직 읽지 않았다. `/design-draft` 전에 clarify와 harden을 읽는다.

## 드래프트 요청
- 캔버스: `.doan/canvases/provider-commands.html`, id `provider-commands`, 폭은 기존 컴포저 드래프트를 따른다.
- PoC 전에 그린다. 따라서 명령 이름은 후보(`/compact`, `/clear`, `/context`, `/model`)로 그린다. PoC 결과 목록에서 빠지는 명령은 revise로 정리한다.
- 프레임:
  - `slash-list`: `/` 목록의 프리셋·스킬·명령 행. 다음 셋을 함께 보인다.
    - 이름이 같은 스킬과 명령(스킬 우선)
    - `/comp` 질의
    - 명령 이름과 같은 질의(Enter가 보냄)
  - `commands-tab`: Presets 팝오버의 Commands 탭(Project 탭 뒤)
  - `preset-chip-notice`: 명령을 고를 때 프리셋 칩이 빠지고 "Presets don’t apply to commands"를 알리는 상태와 복원 상태
  - `queue-row`: 실행 중인 턴 아래 명령 큐 행. Send now는 비활성이다.
  - `command-turn`: `/compact` 실행 중("Compacting…"), `/context` 텍스트 결과, 명령 실패
  - `boundaries`: 압축 경계와 지움 경계("Context cleared — the agent won’t see messages above")
  - `unsupported-card`: `/model` 카드(Open model picker 있음), 같은 기능이 없는 명령의 카드(버튼 없음), 컴포저로 돌아온 텍스트
- 기존 화면(Home 컴포저, 도킹 컴포저, 스레드, 큐)은 코드와 `docs/design/home.md`·`conversation.md`에 있는 그대로 복사한다.

## 드래프트 결정
- 큐의 명령 행에는 Send now가 없다. 지금 앱처럼, 쓸 수 없는 Send now는 숨긴다. 결정 6의 "비활성"을 이것으로 바꾼다.
- 압축 경계 라벨: "Context compacted — the agent keeps a summary of messages above".
- 드래프트가 보수적으로 그린 다음 항목은 그대로 둔다.
  - `/` 목록 순서: 프리셋 → 스킬 → 명령
  - Codex 명령 설명: Doan 문구
  - 칩 안내: 칩 줄에 둔다
  - 돌아온 명령 단어: 하이라이트를 유지한다
  - 카드: 중립 info 아이콘과 ghost Dismiss
- `/compact` 외 명령의 실행 라벨은 PoC 뒤 정한다.
- 팝오버 폭 809px는 `/design-sync`에서 앱으로 다시 잰다.
