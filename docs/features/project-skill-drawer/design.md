# project-skill-drawer — design

용어: **project skill**은 열린 project의 저장소(cwd와 그 위 저장소 루트까지)에 있는 skill이다. **목록**은 composer의 preset 목록 두 곳, 곧 Presets 버튼의 popover와 `/` 목록이다. **skill 단어**는 사람의 글에서 목록의 skill 이름과 정확히 같은 `/<이름>` 단어다(규칙: §4). **skill 줄**은 skill 단어가 있는 메시지의 맨 앞에 Doan이 붙이는 고정 문장이다.

## 조사 결과

2026-11-06에 이 기기의 설치된 CLI, SDK 타입, provider 문서와 바이너리, 이전 PoC가 기록한 provider frame을 읽어 확인했다. **새 provider 턴은 돌리지 않았다.** 표시: VERIFIED는 타입·문서·소스·바이너리 문자열·기록된 frame으로 확인했다는 뜻이고, 실제 Doan 대화의 동작을 본 것은 아니다. UNVERIFIED는 근거를 찾지 못한 것이다. 바이너리 문자열 발췌와 생성한 Codex 프로토콜은 `.scratch/`가 아닌 조사 세션의 임시 폴더에 있었으므로, 구현 전 PoC(tasks P)에서 다시 만든다.

### 지금 목록과 전달(코드로 확인)

- 목록은 CLI의 `doan design-skill --json` 결과다. main의 `design-skills:list|get`(`app/src/main/designSkills.ts`)이 CLI를 한 번 돌리고, renderer는 사본을 두지 않는다(ARCHITECTURE §7 'Design preset reads').
- `/` 목록은 field가 `/`로 시작하고 줄바꿈이 없을 때 열리고, `/` 뒤 글이 검색어다(`slashQuery`, `homeComposer.ts:471`). 행에는 group 이름이 붙는다(`presetListView`의 `slash`, `homeComposer.ts:421`). Enter는 강조 행을 고르고, 맞는 행이 없으면 Enter는 보내기로 간다(`slashKey`, `HomeComposerView.tsx:144-150`). Home(`HomeComposerView.tsx:277-294`)과 docked(`DockedComposer.tsx:199-243`)가 같은 순수 함수를 쓴다.
- 고른 preset은 chip 줄의 `.preset-chip`이다(`ComposerParts.tsx:86`). 한 번에 하나다.
- 보낼 때 `composeRequest`가 사람의 글 앞에 "Use the Doan design preset \`<id>\` (<title>)." 한 줄을 붙인다(`homeComposer.ts:32-39`). 이 글이 `user.message`의 text로 저장되고 턴 prompt의 `userText`가 된다. thread·queue·Edit on Home은 `splitRequest`(`homeComposer.ts:43-49`)로 그 줄을 다시 읽어 말풍선의 `.bubble-preset`(`ConversationThread.tsx:380`)과 chip으로 되살린다. 그래서 preset에는 schema나 IPC 필드가 없다(`schema/`의 `*.schema.json`에 preset 필드가 없다).
- 턴 prompt는 고정 안내 문장 → JSON(`context`, `parts[].userText`, `anchorData`, `attachments`) → `PRESET_GUIDANCE` 등 고정 문단 순서다(`prompt.ts:45-73`). Claude는 SDK 메시지 content 문자열로(`runners.ts:402`, `:411`), Codex는 `turn/start`의 `[{type: "text"}]`로(`runners.ts:202`), ACP는 `session/prompt`의 text block으로(`acpRunner.ts:150`) 보낸다.
- 모델 목록은 이미 "provider를 열되 prompt는 보내지 않는" 길로 읽는다: `listModels`(`runners.ts:30-35`)가 Claude는 `initializationResult()` 뒤 `supportedModels()`, Codex는 thread 없이 `model/list`, ACP는 `session/new`를 쓰고, `ModelCatalog`(`models.ts:72-100`)가 root × provider × 연결 × 설치 버전으로 이 실행 동안 캐시한다.

### provider별: Doan 대화가 불러오는 project skill과 부르는 법

| | Claude Code 2.1.318 (SDK 0.3.312) | Codex 0.166.0 | Cursor 2026.10.22 | Copilot 1.0.105 | Antigravity ACP 1.3.0 |
|---|---|---|---|---|---|
| 저장소에서 읽는 곳 | `.claude/skills/<n>/SKILL.md`와 `.claude/commands/*.md`, cwd에서 저장소(worktree) 루트까지. `.agents/skills`는 읽지 않는다 | `.agents/skills`, 저장소 루트(`.git` 표시)에서 cwd까지 | `.cursor`·`.claude`·`.codex`·`.grok`·`.agents`의 `skills`, `.cursor/commands`·`.claude/commands` | `.github/skills`, `.agents/skills`, `.claude/skills`(cwd에서 git 루트까지), `.claude/commands` | `<cwd>/.gemini/skills`, `<cwd>/.agents/skills` |
| 근거 | code.claude.com/docs/en/skills, docs/en/agent-sdk/skills; 바이너리 문자열 | 소스 `rust-v0.166.0` `ext/skills/src/host_roots.rs`; learn.chatgpt.com/docs/build-skills | bundle `5622.index.js` `loadCommands`, `index.js` skill root 표 | `cli-native.node` 도움말 문자열, `changelog.json` | 서버 par의 `resolve_skills_paths` |
| Doan 대화에서 user 범위 | `CLAUDE_CONFIG_DIR/skills` = doan stub뿐(`providers.ts:113`) | `CODEX_HOME/skills`(stub)와 **사람의 실제 `~/.agents/skills`**(HOME을 바꾸지 않음, `providers.ts` codex `env: {}`) | Doan HOME의 `.cursor/skills`(stub) | Doan HOME의 `.copilot/skills`(stub) | `<GEMINI_HOME>/config/skills`, `antigravity-cli/skills` |
| 대화 없이 목록 읽기 | `Query.supportedCommands()` / `initializationResult().commands`: `{name, description, argumentHint, aliases?, builtin?}`(`sdk.d.ts:9756-9782`, `:3090`). **출처(project·user·plugin·MCP)가 없다**: `builtin`만 있다 | `skills/list {cwds, forceReload}` → `{data: [{cwd, skills: [{name, description, path, scope: user\|repo\|system\|admin, enabled, pluginId, shortDescription?, interface?}], errors}]}`(0.166.0 `codex app-server generate-ts`) | ACP `available_commands_update`의 `{name, description}`. 출처 없음, 내장 command 섞임. 언제 오는지(`session/new` 뒤인지 prompt 뒤인지) 불분명 | 같은 update, `session/new` 응답 전에 온다(기록 frame). 출처 없음 | update에 내장 `plan`·`logout`만. skill 없음 |
| 메시지 맨 앞 `/name` | 펼친다(바이너리 `startsWith("/")`, 끄는 옵션 `verbatimPrompts`·`client_composed`는 Doan이 쓰지 않음) | 해당 없음 | command는 맨 앞만 | 펼친다(1.0.40) | 내장 `plan`만 |
| 글 속 언급 | `/name`은 실행되지 않음. 문서상 "평문 속 단독 단어 `/name`"은 그 메시지에서 skill을 써도 된다는 허락(JSON 문자열 안에서도 그런지 UNVERIFIED) | `$name`을 글 **어디서든** 잡아 SKILL.md 본문을 주입(core `skills/src/mentions.rs`, `selection.rs`; 앞 경계 검사 없음) | 공백 뒤 `/name`을 글 어디서든 skill로 선택(`findSkillReferences`) | 글 중간 `/skill`이 ACP에도 적용되는지 UNVERIFIED | 펼치지 않음 |
| 확실하게 부르는 길 | 모델의 Skill 도구(옵션 생략 시 켜짐, `sdk.d.ts:2332-2353`). 글로 "use X"는 강제가 아니다 | `turn/start` input `{type: "skill", name, path}`(절대 경로, 로드된 skill과 맞을 때만) 또는 `$name`. system prompt가 "이름을 대면 그 skill을 써야 한다"고 지시 | 공백 뒤 `/name`, 또는 따로 보낸 text block `/name`. skill 도구 없음 | 모델의 `skill` 도구, system 지시 "맞는 skill이 있으면 반드시 부른다" | system prompt의 skill 목록과 "SKILL.md를 `view_file`로 읽어라" |
| frontmatter | `disable-model-invocation: true`면 모델이 Skill 도구로 못 부르고 사람의 `/name`만 된다. `user-invocable: false`면 목록에서 빠지고 모델만 쓴다 | `enabled` 필드 | — | — | — |

추가로 확인한 것:

- Doan의 ACP 처리(`acp.ts:141-147`)는 `available_commands_update`를 읽지 않고, prompt 밖에서 온 `session/update`를 버린다(`acpRunner.ts:64`). 턴마다 서버를 새로 연다(`acpRunner.ts:22`).
- **Antigravity의 doan stub**: Antigravity 1.3.0 ACP 서버의 skill 경로(`<GEMINI_HOME>/config/skills`, `<cwd>/.gemini/skills`, `<GEMINI_HOME>/antigravity-cli/skills`, `<cwd>/.agents/skills`)에 Doan이 stub을 쓰는 `<GEMINI_HOME>/skills`(`providers.ts:116` `HOME_STUB(".gemini")`, `GEMINI_HOME=<profile>/.gemini`는 `environment.ts:35-36`)가 없다. 기록된 Antigravity frame 12개에 `skills/doan` 참조가 0건이다. 그런데 `providers.ts:115-116` 주석은 "B3 live check 2026-10-28"로 `<GEMINI_HOME>/skills`를 확인했다고 적는다. 그때는 이전 agy CLI였거나 서버 버전이 달랐을 수 있다. BACKLOG 'An Antigravity conversation worked outside its project'(`<profile>/.gemini/antigravity-cli/skills/`를 건드림)와 관련이 있을 수 있다. tasks P5가 실제 턴으로 판정하고, 찾지 못하면 이 feature의 run이 F1로 고친다(사람, 2026-11-06). Antigravity의 **project skill**은 이 판정과 상관없이 이 feature의 대상이 아니다(결정 2).
- Codex 대화가 사람의 실제 `~/.agents/skills`를 읽는다는 점은 PRODUCT §5 item 0의 "An app-conversation Codex lists two `doan` skills from the same source (accepted)"와 맞는다.

## 1. 목록 읽기(main)

결정 1·2: provider가 보고하는 목록을, 모델 목록과 같은 "prompt 없이 provider를 여는" 길로 읽는다. 대상은 Claude Code와 Codex다.

- 새 채널을 만들지 않고 `conversationMethods`(`conversation/ipc.ts:11`)에 `skills {root, provider}` method를 더한다. `conversation:models`와 같은 검증(`validProvider`, 열린 project가 아니면 `project_not_open`, `ipc.ts:104-107`)을 거친다. 열리지 않은 경로에서 provider 프로세스가 뜨지 않게 하기 위해서다. 답은 `{skills: SkillSummary[]} | {error}`. `SkillSummary = {name, description}`(type-only 모듈).
- preload를 부르는 쪽은 host뿐이다(ARCHITECTURE §7 'Renderer primitives': thread와 docked composer는 props로만 받는다). Home, project Overview, 캔버스 conversation panel이 읽고, docked composer는 `skills` prop과 목록을 열 때 부르는 `onSkillsWanted` 콜백을 받는다(preset이 `props.presets`로 오는 것과 같다).
- 읽기 길: 지금 lease는 `listModels(input, read: ReadModels)`에 묶여 있다(`service.ts:500-523`, `:85`). 이를 결과 타입을 받는 목록 읽기로 넓히고 `Runner`에 `skills?()`를 더한다. lease와 "다음 send·sign-out을 막지 않음"은 그대로다(POSTMORTEM 2026-10-28, 2026-10-30).
- Claude: 목록용 SDK `query`(prompt 없음)를 여는 `openClaude`가 이미 `initializationResult()`를 기다린다(`runners.ts:335`). 그 응답의 `commands`(`sdk.d.ts:3845`)를 읽는다. 거르는 규칙(`parseClaudeSkills`): `builtin === true` 제외, Doan의 stub `doan` 제외, MCP prompt·claude.ai connector·plugin으로 보이는 항목 제외. 마지막 규칙은 PoC P1에서 실제 목록을 보고 정한다. SDK가 출처를 주지 않으므로 이 규칙이 Claude 쪽의 약점이다. `.claude/commands/*.md`는 project skill로 남긴다.
- Codex: 목록용 app-server(`openCodexList`)에서 `skills/list {cwds: [root], forceReload: true}`를 부른다. `parseCodexSkills`는 `data[].skills[]`를 풀고 `scope === "repo"`, `enabled !== false`, `pluginId == null`인 것만 남긴다. `errors`(SKILL.md를 읽지 못한 경로)는 버린다. 사람의 `~/.agents/skills`(user), system skill, 저장소 marketplace의 plugin skill은 뺀다.
- 두 parser 모두 저장소 글(다른 사람이 git으로 넣었을 수 있다)을 IPC로 넘기므로 상한을 둔다: 항목 200개, 설명은 첫 줄만 200 code unit까지, 이름 검증(빈 값, 공백·줄바꿈, backtick, 64자 상한).
- 캐시(main, 결정 6·21): root × provider마다 마지막 성공 목록과 읽은 시각, 진행 중 읽기의 promise를 둔다. 30초 안의 요청은 마지막 목록을 바로 돌려준다. 진행 중 읽기가 있으면 같은 promise를 기다린다(Home과 docked composer가 함께 처음 그려져도 provider가 한 번만 뜬다, `ModelCatalog`의 promise 캐시와 같은 방식, `models.ts:79-86`). 실패는 시각을 남기지 않으므로 다음 요청이 바로 다시 읽는다. 모델 목록의 `ModelCatalog` 캐시(연결·버전이 바뀔 때만)와는 따로 둔다. skill은 이 실행 중에도 저장소에서 바뀌기 때문이다.
- 읽는 때: composer를 처음 그릴 때(하이라이트가 목록 없이 정해질 수 없으므로), 목록이 열릴 때, 턴이 끝날 때(agent가 방금 만든 skill을 바로 쓰도록), Home에서 provider나 project를 바꿀 때. host는 읽는 동안과 실패했을 때 마지막으로 받은 목록을 쓰고, 받은 적이 없으면 빈 목록이다.
- terminal session(legacy external) 대화의 docked composer도 같은 길로 Doan 프로필에서 읽은 목록을 쓴다.
- Cursor, Copilot, Antigravity: 읽지 않는다. 빈 목록이다(결정 2).

## 2. 목록 보이기(renderer)

- `presetListView`에 skill을 더한다(결정 5). 행 모델에 `kind: "preset" | "skill"`을 더해, 고르는 동작과 React key를 `kind`와 이름으로 나눈다(지금은 `row.id` 하나로 구별한다, `HomeComposerView.tsx:478`, `ComposerParts.tsx:225`). popover: preset group 탭 뒤에 "Project" 탭(skill이 하나 이상일 때만). 그룹이 없는 옛 CLI 경로("All presets")에서는 그 뒤에 "Project" section을 둔다. `/` 목록과 검색 결과: preset 뒤에 skill 행.
- 순서: 검색은 `searchPresets`의 점수 규칙을 skill의 `name`·`description`에 쓰고, 같은 점수면 preset이 먼저다. 검색어가 preset id와 정확히 같으면 그 preset 행이 맨 위이고, 같은 이름의 skill 행이 바로 아래다(결정 16; 이 저장소의 `audit`). 그렇지 않고 검색어가 skill 이름과 정확히 같으면 그 skill 행이 맨 위다.
- 행 모양은 preset 행(이름 위, 설명 아래 한 줄)과 같고, 이름은 `/<이름>`으로 보인다. Doan preset 행에는 왼쪽에 보라 아이콘 타일을 둔다. 제안 프롬프트 행과 같은 primitive(`.suggestion-icon`, `HomeComposerView.tsx`의 `GroupIcon name={groupIcon(group)}`)이고 아이콘은 그 preset의 group 아이콘이다. skill 행에는 아이콘도 caption도 없다(결정 23). 지금 행은 이름과 설명만 그린다(`ComposerParts.tsx`의 `PresetOption`). "Project" 탭의 아이콘은 lucide `SquareSlash`다(결정 22).
- 검색 칸 placeholder와 접근 이름(`aria-label`, 지금 "Search presets", `ComposerParts.tsx:229`)은 skill이 하나 이상일 때만 "Search presets and skills"이고, 아니면 지금 그대로다. Presets 버튼의 이름 "Design presets"는 그대로다(결정 7). 결과 없음과 결과 수 문구도 skill이 있을 때는 skill을 함께 말한다(예: "No presets or skills match “q”."). 최종 문구는 초안 때 clarify preset으로 정한다. composer placeholder "Describe what to design, / for presets"는 그대로다.
- skill이 없거나 목록을 받은 적 없이 읽기에 실패하면 skill 탭과 행이 없을 뿐이다(결정 5). 반대로 preset 읽기가 loading·error·olderCli여도 skill 목록이 있으면 preset 쪽 notice나 loading 줄을 위에 두고 그 아래에 skill section을 보인다(결정 19; 지금 `presetListView`는 이 상태에서 일찍 반환한다, `homeComposer.ts:404-412`).
- 목록이 열린 채 행이 바뀌면(다시 읽은 결과 도착): 강조는 같은 행(`kind` + 이름)을 따라가고, 그 행이 없으면 맨 위로 간다. 지금은 검색어가 바뀔 때만 강조가 0으로 돌아가서(`HomeComposerView.tsx:286`, `DockedComposer.tsx:238`), 행이 줄면 Enter가 아무 일도 하지 않을 수 있다. popover에서 고른 탭이 사라지면 첫 탭으로 가고 focus도 그 탭으로 간다(POSTMORTEM 2026-11-01 'A frame drawer list closed by a disabled trigger reopened by itself': 사라진 상태를 남겨 두지 않는다).
- **skill 행을 고르면**(§4 '고르기'): chip을 만들지 않고 `/<이름>` 글을 넣는다. preset 행을 고르는 동작은 지금 그대로다.

## 3. 보내기와 다시 읽기

- `composeRequest(text, preset, skills, attachments)`: `skills`는 보낼 때 §4 규칙으로 찾은 skill 단어의 이름 목록이다(같은 이름은 한 번, 처음 나온 순서). 줄 순서: preset 줄(있으면) → skill마다 "Use the project skill \`<name>\`." 한 줄 → 빈 줄 → 사람의 글(친 그대로, `/<이름>` 포함). 예:

  ```
  Use the Doan design preset `polish` (Polish).
  Use the project skill `deploy`.
  Use the project skill `db-migrate`.

  run /db-migrate first, then /deploy to staging
  ```

- skill을 정하는 목록은 그 순간 composer가 쓰는 목록(provider, root)이고, 화면의 하이라이트와 같은 함수·같은 목록으로 정한다. 그래서 보이는 하이라이트와 보내는 줄이 같다.
- 고정 줄은 사람의 글(`userText`) 안에 있으므로 prompt의 데이터 경계(`turnPrompt`)는 바뀌지 않는다. 사람이 쓴 skill 단어에서 나온 줄이므로 사람의 지시다. skill 본문은 저장소의 글이고, provider가 AGENTS.md·CLAUDE.md를 읽는 것과 같은 신뢰 수준이다. Doan은 그 본문을 읽지 않는다(결정 3).
- `PRESET_GUIDANCE`와 guide는 바꾸지 않는다.
- 32,768 한도와 `{{`·`}}` 검사(`draftProblem`)는 고정 줄을 포함한 글로 한다. PRODUCT §5 item 1 'Send'의 "text plus the preset line" 문장이 바뀐다(Z1).
- `splitRequest`: 맨 앞의 preset 줄(있으면)과 그 뒤 skill 줄들을 떼어 `{preset, skills, body}`를 돌려준다. 말풍선은 고정 줄을 보이지 않고 body의 skill 단어를 `skills`에 든 이름으로만 하이라이트한다(그때의 목록이 아니라 보낸 이름). queue에서 돌아온 draft와 Edit on Home은 body만 field에 넣고, 하이라이트는 지금 목록으로 다시 정해진다.
- **한 줄 글**(결정 18): 대화 제목(main의 `messageLine(request.text, …)`, `service.ts:198`; `ProjectOverview.tsx:284`의 첫 `user.message` 대체), queue 행(`CanvasConversationPanel.tsx:479-481` `queuedText`), 알림의 한 줄 글은 고정 줄(preset 줄과 skill 줄)을 뗀 body로 만든다. 줄을 떼는 순수 함수 하나를 main과 renderer가 함께 쓴다. renderer가 main 모듈을 값으로 import하지 않는 규칙(POSTMORTEM 2026-10-30)을 지키는 자리는 `/tdd`에서 정하고 `rendererImports.test.ts`로 지킨다. 사람이 이 고정 줄과 같은 글을 직접 맨 앞에 쳐서 보낸 경우 다시 읽을 때 줄로 읽히는 한계는 preset 줄과 같다.
- 말풍선의 preset 표시(`.bubble-preset`)는 그대로다.

## 4. 인라인 하이라이트(결정 4)

하이라이트는 field의 글 위에 그리는 **표시**일 뿐이다. field의 값(`FieldSegment[]`, `anchorField.ts:6`)과 단위(글자 하나 = 1, anchor chip = 1)는 바뀌지 않는다. 확정 단계, 새 segment 종류, 편집 단위가 없다.

### 4.1 단어 규칙(`skillWords(text, names)`)

- **시작**: `/`가 field 글의 맨 앞에 있거나, 바로 앞 글자가 공백(Unicode White_Space: space, tab, 줄바꿈, NBSP 등)이다. anchor chip 바로 뒤의 `/`는 시작이 아니다(chip은 공백이 아니다). `a/b`, `https://x/deploy`, `` `/deploy` ``의 `/`는 시작이 아니다.
- **단어**: `/` 뒤로 다음 공백이나 글 끝까지의 글자다.
- **끝의 문장부호**: 단어 끝에 붙은 문장부호 묶음(`.` `,` `;` `:` `!` `?` `)` `]` `}` `"` `'` `’` `”` `…`와 전각 `。` `、` `，` `．` `！` `？` `：` `；` `）` `」` `』`)은 떼고 본다. `/`는 이 묶음에 들지 않는다.
- **한글 경계**(결정 11): 한글은 U+AC00–D7A3(완성형 음절), U+1100–11FF(자모), U+3130–318F(호환 자모)의 글자다. 단어 안에서 **한글이 아닌 글자 바로 뒤에 한글이 오는 자리**에서 이름이 끝날 수 있다. 그 자리 앞의 글이 후보 이름이 되고, 그 뒤(조사 등)는 하이라이트하지 않는다. 예: `/deploy로` → 후보 `deploy`, `/deploy에서도` → `deploy`.
- **맞음**: 다음 후보 가운데 목록의 skill 이름과 **대소문자까지 정확히** 같은 것이 있으면 맞는다. 여럿이 맞으면 가장 긴 것을 쓴다. 후보: (1) 단어 전체, (2) 끝 문장부호를 뗀 단어, (3) 한글 경계마다 그 앞까지의 글(뒤쪽 경계부터). 하이라이트는 `/`와 맞은 이름까지이고 문장부호와 조사는 들지 않는다.
- **한글이 든 이름**: 한글 경계는 한글이 아닌 글자에서 한글로 바뀌는 자리뿐이다. 그래서 한글로 끝나는 이름(예: `배포`, `deploy배포`)은 바로 뒤에 붙은 조사와 나뉘지 않는다: `/배포` ○, `/배포로` ×, `/deploy배포` ○, `/deploy배포로` ×(이때 `deploy`가 따로 목록에 있으면 `/deploy`만 맞는다). 한글 이름 뒤에는 공백이나 문장부호를 둬야 한다. 이름의 문자 종류를 따로 막지 않는다(Codex는 이름 모양을 정하지 않는다; Claude 이름은 소문자·숫자·`-`다).
- 예(목록에 `deploy`, `db-migrate`가 있을 때): `/deploy` ○, `/deploy.` ○(`.` 제외), `(/deploy)` ×(앞이 `(`, 결정 10), `/deploy-x` ×, `/deplo` ×, `/Deploy` ×, `/deploy/x` ×, `/Users/me/deploy` ×, `/deploy로 배포해` ○(`/deploy`만), `/deploy에서도` ○, `/deploy로.` ○(`/deploy`만), `/deploy.로` ×(`.`과 `로` 사이가 경계지만 그 앞 후보가 `deploy.`라 맞지 않는다), `/db-migrate를` ○, `/deploy-x로` ×(후보 `deploy-x`), `x /deploy y` ○, 같은 줄의 `/deploy`와 `/db-migrate` 둘 다 ○.
- **고정 줄**: 맞은 이름(목록의 이름 그대로, 조사·문장부호 없이)을 쓴다. `/deploy로 배포해`는 "Use the project skill \`deploy\`."를 만들고, 사람의 글은 `/deploy로 배포해` 그대로 간다.
- 목록이 비면(대상이 아닌 provider, 읽기 실패, skill 없음) 아무것도 맞지 않는다.

### 4.2 언제 다시 정하나

- 확정된 편집마다(글자 입력, 지우기, 붙여넣기, 잘라내기, 실행 취소·다시 실행, 목록에서 고르기, draft 바꾸기), 그리고 목록이 바뀔 때(다시 읽기 결과, Home에서 provider나 project를 바꿈)마다 다시 정한다. 그래서 `/deplo`에 `y`를 치면 그 순간 하이라이트가 생기고, `-`를 더 치거나 글자 하나를 지우면 그 순간 사라진다.
- **IME 조합 중에는 다시 그리지 않는다.** chip field는 조합 중에 아무것도 그리지 않는다(`chipField.ts:11-14`, 조합 밑 글을 바꾸면 조합이 깨지거나 취소된다). 조합 중에는 마지막으로 그린 하이라이트가 그대로 있고, 조합이 끝난 뒤의 repair(`chipField.ts:382-391`) 때 다시 정한다. caret이 span 끝에 있으면 Chromium이 조합 글을 span 안에 넣으므로, 조합 중인 글이 하이라이트 안에 보일 수 있다. 한국어는 음절마다 조합이 끝나고 같은 키 이벤트에서 다음 조합이 시작되므로 repair가 건너뛰어질 수 있고, `/deploy에서도`의 `에서도`는 공백을 칠 때까지 하이라이트 안에 남을 수 있다(결정 20, 받아들임). 공백이나 다음 확정 편집 뒤에는 한글 경계(결정 11)로 `/deploy`만 남는다. R1에서 이어지는 여러 음절 조합과 공백 뒤 모양, caret 위치를 본다. 거슬리면 그때 다시 그릴 때 caret을 span 밖 뒤 text node에 두는 규칙을 더한다.

### 4.3 그리기

- 결정 12: chip field가 글을 그릴 때 맞는 범위를 `<span class="skill-word">`로 감싼다. span은 편집할 수 있는 보통 글이다(`contenteditable=false` 아님). field가 DOM을 다시 읽을 때(`read`, `sync`, `units()`) span 안의 글은 글로 읽는다(`units()`는 이미 element 안으로 들어가 읽는다, `chipField.ts:538-546`). 하이라이트 범위가 바뀌면 `render()`가 field 전체를 다시 그리고(`replaceChildren`, `chipField.ts:492-506`; 줄 단위로 다시 그리는 길은 없다) caret은 단위 위치로 되돌린다. 지금 `misdrawn()`은 chip도 끝 `<br>`도 아닌 element를 만나면 바로 true다(`chipField.ts:404-417`). 그대로 두면 span이 있는 동안 확정 편집마다 전체를 다시 그리므로, `misdrawn()`이 기대 범위(`fieldSkillRuns`)와 DOM의 span 범위를 비교해 다를 때만 true를 돌리게 바꾼다. ChipField는 이름 목록을 hook `skillNames()`로 받고, 목록이 바뀌면 조합 중이 아닐 때 다시 그린다(조합 중이면 조합이 끝난 뒤). Chromium이 span 끝에 친 글자를 span 안에 넣어도, 다음 확정 편집에서 범위가 다시 정해지므로 하이라이트가 이름 밖으로 번지지 않는다.
- 모양(spec 완료 조건 3): small-ui-tweaks 결정 7의 `.suggestion-value`와 같은 값, `display: inline`, `box-decoration-break: clone`. 줄을 넘는 이름은 조각마다 padding과 모서리를 가진다. 새 token이나 색 리터럴은 없다. DESIGN 'Accent places'와 `ds/checks.test.ts`의 `violetAllowed`에 `.skill-word`를 더하고, 세 규칙(`.anchor-chip`, `.suggestion-value`, `.skill-word`)의 값이 같다는 CSS 테스트에 넣는다.
- 맞는 순간 그 단어는 medium 굵기와 좌우 padding만큼 넓어져 뒤 글이 조금 밀린다. 받아들인다(제안 문장 하이라이트와 같다).
- 말풍선(`ConversationThread.tsx`의 사람 메시지)은 같은 class로 body의 skill 단어를 그린다.

### 4.4 편집 동작

- **caret과 지우기**: 하이라이트된 단어는 글자마다 caret이 멈추고, Backspace·Delete·단어 지우기는 보통 글과 같다. padding은 caret 자리를 더하지 않는다. 글자 하나를 지워 이름과 달라지면 하이라이트가 사라진다.
- **실행 취소**: 글 편집만 되돌린다. 하이라이트는 되돌린 글로 다시 정해진다. 하이라이트만 끄는 길은 없다. 사람이 skill로 보내고 싶지 않으면 단어를 바꾼다(결정 13).
- **복사·잘라내기**: plain text다. `plainText`(`anchorField.ts:114`)는 바뀌지 않고, field clipboard(`application/x-doan-field+json`)는 지금처럼 anchor chip에만 쓴다. 하이라이트는 복사되지 않는다.
- **붙여넣기**: plain text로 들어가고, 같은 규칙으로 바로 하이라이트된다. 붙여넣은 경로 `/Users/…`는 단어 전체가 skill 이름과 같을 때만 하이라이트된다.
- **여러 단어**: 수의 상한은 없다(글 한도가 묶는다). 같은 이름이 여러 번 나와도 고정 줄은 하나다.
- **접근성**: 확정 편집 뒤 처음 맞은 이름마다 "Project skill <name>"을 한 번 읽는다. 사라질 때는 읽지 않는다. 조합 중에는 읽지 않는다. docked composer는 field의 `onAnnounce`(`DockedComposer.tsx:399`)로, Home은 `ComposerField`에 `onAnnounce`가 연결되어 있지 않으므로(`HomeComposerView.tsx:523`) Home의 자기 `announcement` status로 연결한다.

### 4.5 고르기

- `/` 목록(field 맨 앞 `/검색어`)에서 skill 행을 고르면 `/검색어`를 `/<이름> `(공백 하나 포함)으로 바꾸고 caret을 그 뒤에 둔다. field가 이제 공백을 담으므로, 4.6의 규칙으로 `/` 목록이 닫힌다.
- Presets popover에서 skill 행을 고르면 caret 자리(마지막 caret, 없으면 글 끝)에 `/<이름> `을 넣는다. caret 앞 글자가 공백이 아니면 공백 하나를 먼저 넣는다(그래야 4.1의 시작 규칙에 맞는다). popover는 닫히고 focus는 field로 간다. caret은 넣은 글의 공백 뒤에 둔다. preset을 고를 때처럼 글 끝(`focusEnd`, `HomeComposerView.tsx:289`, `:530`)으로 보내지 않는다. 글 중간에 넣었을 때 사람이 친 자리를 잃지 않게 하기 위해서다.
- 고른 뒤의 하이라이트는 직접 친 글과 같은 규칙이다. 목록에서 고른 skill이라고 따로 표시하지 않는다.

### 4.6 `/` 목록과의 관계

- `/` 목록이 열리는 조건(field가 `/`로 시작하고 줄바꿈이 없음)은 그대로다.
- 결정 14: `slashQuery(text, dismissed, names)`가 "field 맨 앞의 단어가 skill 단어이고 그 뒤에 공백"이면 `null`을 돌려준다. 상태(`dismissed`)를 세우지 않고 글에서 계산하므로, 그 공백을 지우면 목록이 다시 열린다(POSTMORTEM 2026-11-01의 "가려진 상태가 남아 다시 열림" 함정이 생기지 않는다). Esc로 닫은 것은 지금처럼 field가 빌 때까지 닫혀 있다(PRODUCT §5 item 1). 그 단어가 skill이 아니면 지금처럼 여러 단어 검색이 이어진다. 이유: `/deploy to staging`을 치는 동안 "No presets match" 목록이 떠 있지 않게 한다.
- 목록이 열린 채 Enter는 지금처럼 강조 행을 고른다. 예외(결정 17): `/` 검색어가 skill 이름과 정확히 같고 강조 행이 그 skill이면 Enter는 고르지 않고 보내기로 간다. 고르기는 `/deploy`를 `/deploy `로 바꿀 뿐이어서 화면이 거의 바뀌지 않고, 사람이 원하지 않은 "Enter로 확정" 단계가 되기 때문이다. 검색어가 preset id와도 같으면 강조 행이 preset이므로(결정 16) 지금처럼 preset을 고른다. 하이라이트는 Enter와 상관없이 이미 생겨 있다.

### 4.7 provider·project를 바꿀 때

- Home에서 provider나 project를 바꾸면 그 root × provider의 목록으로 하이라이트를 다시 정한다. 그 목록을 받기 전에는 하이라이트가 없다(마지막으로 받은 목록이 있으면 그것을 쓴다). Cursor 등으로 바꾸면 하이라이트가 모두 사라지고, 그대로 보내면 고정 줄 없이 글만 간다.

## 초안 요청

초안: `.doan/canvases/project-skill-drawer.html`(canvas id `project-skill-drawer`, width 1680), frame `home-words`, `docked-capsule`, `docked-box`, `ime`, `bubble`, `popover-tabs`, `popover-search`, `slash-list`, `preset-failed`(`f2ef11b3`). 상태: 첫 수정본에서 결정 22–26을 반영한다. 사람 확인 전이다. 구현 전에 사람이 앱에서 확정한다(tasks D0). 하이라이트 상태는 Home composer와 docked composer(capsule, box) 모두에 그린다.

- Doan preset 행의 왼쪽 보라 아이콘 타일과 아이콘 없는 skill 행, "Project" 탭과 넓힌 popover(결정 22, 23).
- 이름 충돌: `/audit`에서 preset 행이 맨 위이고 같은 이름의 skill 행이 바로 아래인 결과(결정 16).
- preset 읽기가 loading·error·옛 CLI이고 skill 목록은 있는 popover와 `/` 목록(결정 19).
- 검색 칸 placeholder 두 가지(skill이 있을 때·없을 때)와 결과 없음 문구(skill이 있을 때). 글은 `doan design-skill clarify --json`을 읽고 쓴다.
- IME 조합 중인 `/deploy에서도`(조합 글이 하이라이트 안에 보이는 상태)와 공백 뒤 상태(결정 20).

- 하이라이트: 친 중인 `/deplo`(없음), `/deploy`(있음), `/deploy-x`(없음), 문장 중간의 `/deploy`, 한 줄에 둘, `/deploy.`(문장부호 밖), `/Users/me/deploy`(없음), `/deploy로 배포해`(`/deploy`만, 조사는 밖), 두 줄에 걸친 긴 이름(64자, 조각마다 모서리), anchor chip과 같은 줄, preset chip과 함께.
- 보낸 말풍선의 하이라이트(고정 줄은 보이지 않음), preset 표시와 함께.
- Presets popover: preset group 탭 뒤의 "Project" 탭과 skill 행, 검색 칸 "Search presets and skills".
- `/` 목록: 검색어가 preset과 skill에 함께 맞는 결과, 정확히 같은 이름이 맨 위인 결과, 맞는 것이 없는 상태.
- 설명이 없는 skill 행, 이름이 긴 skill 행.
- skill 단어만 있고 다른 글이 없는 draft의 placeholder는 해당하지 않는다(글이 있으므로). 결정 7의 "Add details for <skill>…"은 쓰지 않는다(결정 15).

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. `parseClaudeSkills(commands: unknown): SkillSummary[]` — builtin·stub·MCP/connector/plugin 제외, 이름 검증(빈 값, 공백·줄바꿈, backtick, 64자 상한), 같은 이름 하나로, 항목 200개·설명 첫 줄 200 code unit 상한.
2. `parseCodexSkills(result: unknown): SkillSummary[]` — `data[].skills[]` 풀기, `scope`·`enabled`·`pluginId` 거르기, `errors` 버리기, 같은 이름 하나로, 같은 상한.
3. `skillWords(text: string, names: ReadonlySet<string>): {start, end, name}[]` — §4.1 전부(시작, 끝 문장부호, 대소문자, `/` 포함 경로, 한글 경계와 세 범위의 경계 값, 한글이 든 이름, 가장 긴 후보, 여러 단어).
4. `fieldSkillRuns(segments, names)` — chip이 섞인 segment에서 글 단위 범위(chip 뒤 `/`는 시작이 아님).
5. `searchDrawer(presets, skills, query)` — `searchPresets` 점수 규칙, preset 우선, 정확히 같은 preset id가 맨 위이고 같은 이름 skill이 바로 아래(결정 16), 그 밖에 정확히 같은 skill 이름은 맨 위, 행의 `kind`.
6. `presetListView`의 "Project" 탭·행(preset 행의 group 아이콘)·summary·결과 없음 문구, placeholder와 접근 이름, preset 읽기가 loading·error·olderCli일 때의 skill section(결정 19), 그룹 없는 옛 CLI 경로.
7. `composeRequest` / `splitRequest` — preset 줄과 skill 줄의 순서, 같은 이름 한 번, 왕복, 고정 줄 없는 글, 한도 계산. 한 줄 글을 위한 고정 줄 떼기(결정 18, main과 함께 씀).
8. `insertSkillText(segments, caret, name)` — popover 고르기의 공백 규칙과 caret(넣은 공백 뒤). `/` 목록 고르기의 치환.
9. `slashQuery` 확장 — 맨 앞 skill 단어 뒤 공백이면 `null`(결정 14, 상태 없음). `slashKey` — 검색어가 skill 이름과 같고 강조 행이 그 skill이면 보내기(결정 17).
10. `skillAnnouncements(before, after)` — 새로 맞은 이름만.
11. 목록이 열린 채 행이 바뀔 때의 강조(같은 `kind` + 이름을 따라감, 없으면 0)와 사라진 탭(첫 탭).
12. `misdrawn`의 span 비교 — 기대 범위와 DOM의 span 범위가 같으면 다시 그리지 않음.

## 포맷 변경

- JSON Schema(ARCHITECTURE §11)는 바뀌지 않는다. skill은 preset처럼 `user.message`의 text 안 고정 줄과 사람의 글로만 남는다. 대화 event v1, 형식 버전 `v`, fixture는 그대로다.
- 새 IPC 채널은 없다. `conversation` 채널에 `skills` method가 더해진다(preload 노출). CLI 출력, `runtime.json`, app socket은 바뀌지 않는다.
- F1을 하면 Antigravity profile의 stub 경로가 바뀐다(Doan profile 안의 파일, 공유 형식 아님).

## 관례 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. guide(`cli/internal/cli/skill.md`)와 stub 본문도 바뀌지 않는다(guide 예산 21,600 B 중 21,598 B, BACKLOG).

## 결정 영향

- ARCHITECTURE §7 'Design preset reads' 'Connecting a chosen preset'의 "fixed first line of the user's text … there is no rewriting API"를 skill에도 쓴다. 요청을 고쳐 쓰지 않고, 분류 모델이 없다(PRODUCT §5 Skills 13). 사람의 글은 친 그대로 가고, 고정 줄만 앞에 붙는다.
- 결정 1로 앱은 저장소의 skill 파일을 직접 읽지 않고 provider에 묻는다.
- ARCHITECTURE §7 'Renderer primitives' "only their hosts … call preload": skill 목록도 host가 읽고 docked composer는 props로 받는다.
- ARCHITECTURE §7 'Renderer primitives'의 chip field: 값과 단위, clipboard 형식은 그대로이고, 그리기에 하이라이트 span이 더해진다. 조합 중에 그리지 않는 규칙을 지킨다.
- ARCHITECTURE §7 'Agent authentication' 'Versions': "A feature that makes Doan depend on a new provider surface either checks it at the current minimum or raises the minimum by decision". `supportedCommands()`와 `skills/list`는 새 provider 표면이다. 최소 버전(Claude Code 2.1.284, Codex 0.158.0)에서 확인하거나 올려야 한다(PoC P3).
- ARCHITECTURE §7 'Agent authentication' 'Profiles' "Each profile gets its own doan `SKILL.md` stub": F1을 하면 Antigravity stub의 경로를 Z1에서 고친다.
- Doan은 skill을 설치·실행·수정·읽기 하지 않는다(ARCHITECTURE §6 "Never installed per repo", PRODUCT §3 Out of scope 4·7).

## PoC 의존

실제 provider 턴과 목록 읽기는 공용 로그인 프로필(`/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`, chain-261106 '로그인')과 사람의 승인이 필요하다. P1–P5를 한 세션에서 돈다. 이 문서를 쓴 세션은 돌리지 않았다.

- **P1 목록**: 임시 repo에 `.claude/skills/a`, `.claude/commands/b.md`, 중첩 `.claude/commands/sub/x.md`, `.agents/skills/c`, `.agents/skills/d`를 가리키는 symlink `.claude/skills/d`(이 저장소의 모양), `disable-model-invocation`·`user-invocable: false` skill, 이상한 이름(대문자, 한글, 끝이 문장부호, 64자), MCP connector 하나를 두고 Doan 프로필로 Claude `initializationResult().commands`가 첫 메시지 전에 답하는지, 무엇이 섞이는지(MCP prompt, claude.ai connector, plugin), symlink를 따라가는지 본다. Codex `skills/list`가 Doan의 `CODEX_HOME`에서 `scope: "repo"`를 주는지, Doan의 `CODEX_HOME`에는 신뢰한 project가 없으므로 신뢰하지 않은 project에서도 그런지 본다. 받은 두 응답은 개인 정보를 지운 뒤 A1의 committed fixture로 둔다.
- **P2 전달**: §3의 고정 줄과 글 속 `/<이름>`이 든 Doan prompt로 Claude가 Skill 도구를 부르는지, Default 모드에서 승인을 묻는지, `disable-model-invocation` skill에서 무엇이 일어나는지(결정 8). Codex가 그 prompt로 SKILL.md 본문을 주입받는지(`<skill>` fragment가 rollout에 남는지). 어느 provider가 따르지 않으면 그 provider만 따로 길을 정한다(결정 3).
- **P3 최소 버전**: Claude Code 2.1.284와 Codex 0.158.0에서 P1의 두 호출이 같은 모양으로 답하는지. 옛 버전은 임시 prefix에 설치하고 사람의 전역 설치는 건드리지 않는다. 아니면 최소 버전을 올릴지 사람이 정한다.
- **P5 Antigravity doan stub**(번호 P4는 쓰지 않는다): Doan 연결 Antigravity 캔버스 대화에서 agent에게 가진 skill과 `doan` skill이 있는지 묻고, ACP frame과 서버의 파일 읽기에서 `skills/doan` 참조를 찾는다. 저장소의 `.agents/skills`를 찾는지도 본다. 서버 버전을 함께 기록한다(`providers.ts:115-116`의 2026-10-28 확인 뒤 서버가 경로를 바꿨을 수 있다). 판정은 tasks 'P 결과'에 적는다.

## 겹치는 feature와 순서

- **small-ui-tweaks**(구현 전, chain-261106 링크 3): 결정 7의 `.suggestion-value`가 이 feature의 `.skill-word`와 같은 값을 쓴다. 그 feature가 먼저 병합되면 그 CSS 테스트에 `.skill-word`를 더하고, 이 feature가 먼저면 그 feature가 더한다. `ds/checks.test.ts` `violetAllowed`도 두 feature가 고친다. 제안 프롬프트는 preset을 채우므로(`suggestedPrompts`) `composeRequest`의 새 인자를 함께 맞춘다.
- **context-window-ring**(병합됨): `DockedComposer`의 tray 끝에 링을 더했다. 이 feature는 그 모양 위에서 시작한다.
- **turn-activity**(구현 전): thread의 턴 표시를 바꾼다. 사람 메시지 말풍선(`ConversationThread.tsx`)을 함께 고칠 수 있다. 두 feature 모두 chain-261106 뒤에 시작하고, 둘 사이의 순서는 그때 정한다.
- **chain-261106**(work-update → canvas-handoff → small-ui-tweaks): canvas-handoff가 `turnPrompt`에 `extras.handoff`를 더한다(그 tasks B3). 이 feature는 `turnPrompt`를 바꾸지 않으므로(고정 줄은 renderer의 `composeRequest`가 만든다) 충돌이 없다.
- **prompt-suggestion**(병합됨): 빈 field의 Right Arrow로 제안을 받는다(`takesSuggestion`, `homeComposer.ts:462`). 하이라이트는 글이 있을 때만 생기므로 서로 닿지 않는다. 제안을 받아 들어온 글에 skill 단어가 있으면 같은 규칙으로 하이라이트된다.

## POSTMORTEM에서 가져온 함정

- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: `SkillSummary`는 type-only 모듈에 두고, `skillWords`는 renderer 모듈에 둔다. `rendererImports.test.ts`가 지키는지 보고, 구현 batch 뒤 built app을 한 번 띄운다.
- **2026-10-29 'Codex cut the middle out of the doan guide …'**: 이 feature는 guide에 글을 더하지 않는다. 고정 줄은 메시지마다 skill 수만큼만 붙는다.
- **2026-10-28 'A send right after turn.done was refused as busy …'**, **2026-10-30 'A model list read made sign-out ask to stop conversations'**: 목록 읽기가 provider 프로세스를 띄우므로 모델 목록과 같은 lease 길에서 읽고, 다음 send와 sign-out을 막지 않는지 테스트한다.
- **2026-11-01 'The canvas agent indicator kept another worktree's …'**, **2026-10-25 'An older install failure replaced newer feedback'**: host는 목록을 root × provider로 묶고, root를 바꾼 뒤 도착한 옛 root의 응답이 새 하이라이트를 바꾸지 않는지 두 완료 순서로 테스트한다.
- **2026-11-01 'A frame drawer list closed by a disabled trigger reopened by itself'**: 결정 14의 닫힘은 상태가 아니라 계산이고, 사라진 탭은 남겨 두지 않는다(§2).
- BACKLOG 'Canvas conversation surfaces not verified …': native macOS IME 입력은 built app에서 확인되지 않았다(CDP 조합만). 하이라이트가 그리기를 늘리므로 R1에서 native 한글 입력을 사람이 한 번 확인한다.

## 읽은 design preset

`doan design-skill --json`(설치된 doan)으로 목록을 보고 `shape`, `clarify`, `harden`을 읽었다. shape: 기존 화면(preset 목록과 field)을 넓히는 일이라 시각 체계는 그대로 두고 상태만 정했다. clarify: 검색 placeholder와 접근성 알림 문구는 초안 때 다시 본다. harden: 긴 이름, 설명 없음, 목록 없음·실패, 경로 같은 글을 초안 요청에 넣었다.

## 결정

사람, 2026-11-06.

0. **저장소의 project skill 전부가 대상이다.** design 관련 skill만으로 줄이지 않는다. 이유: tester 가운데 백엔드 개발자도 Doan에서 코딩한다(사람: "백엔드 개발자들 도안에서 코딩하더라").
1. **목록은 provider가 보고하는 것이다**(Claude `supportedCommands()`, Codex `skills/list`). 이유: 그 provider가 Doan 프로필에서 실제로 불러오는 것과 같고, 이미 있는 모델 목록 읽기 길을 쓰며, Doan이 provider별 탐색 규칙을 따라 만들지 않는다.
2. **Claude Code와 Codex만.** 이유: 둘은 대화 없이 목록을 주고, ACP는 출처를 가를 수 없거나(Cursor·Copilot) skill을 보고하지 않는다(Antigravity). Antigravity의 doan stub 확인(P5·F1)은 이 범위를 바꾸지 않는다.
3. **전달은 preset처럼 고정 줄 "Use the project skill \`<name>\`."이다.** Doan은 SKILL.md를 읽지 않는다. P2에서 어느 provider가 따르지 않으면 그 provider만 따로 길을 정한다. 이유: schema·runner·`turnPrompt`가 바뀌지 않는다.
4. **skill은 chip이 아니라 사람의 글 속에서 정확히 맞는 단어 `/<이름>`의 인라인 하이라이트다.** 확정 단계(Enter, 클릭)가 없고, 맞지 않게 되면 바로 사라진다. 목록에서 고르면 `/<이름>` 글을 넣을 뿐이다. 모양은 small-ui-tweaks 결정 7의 이름 하이라이트 값이다. 사람의 말: "지금 프롬프트 한 것 처럼 하는게 어떄?", "정확히 매치되는 스킬이 있으면 생기게했으면 좋겠음", "Enter로 확정 아니고 인라인에서 단어 단위로 /<slug> 정확히 매치하면 인라인 하이라이트". 이유: 글이 친 그대로 남고, 보이는 하이라이트와 보내는 줄이 늘 같다. 이에 따라 preset chip과 skill 단어는 한 메시지에 함께 있을 수 있고, 고정 줄은 preset 줄 다음에 skill마다 한 줄이다.
5. **skill은 preset 뒤에 둔다. 읽기 실패는 skill을 숨기기만 한다.** 이유: preset이 Doan의 기본 길이고, skill이 없어도 preset과 보내기는 그대로 된다.
6. **목록이 열릴 때 다시 읽고, root × provider마다 30초에 한 번까지.** 이유: 실행 중에 더한 skill이 다음에 열 때 보이고, `/`를 칠 때마다 provider 프로세스를 띄우지 않는다.
7. **버튼 이름 "Design presets"는 그대로, 검색 placeholder는 skill이 있을 때만 "Search presets and skills".** skill이 없으면 지금 "Search presets" 그대로다(리뷰 반영: 찾을 수 없는 skill을 말하지 않는다). skill만 있는 draft의 placeholder "Add details for <skill>…"은 쓰지 않는다(결정 15). 최종 문구는 초안 때 clarify preset으로 다듬는다. 이유: 버튼 이름은 접근 이름과 DESIGN 'Home'의 측정값에 묶여 있다.
8. **Claude의 `disable-model-invocation` skill도 목록과 하이라이트에 둔다. P2 뒤 다시 본다.** 이유: SDK 목록만으로는 가를 수 없다.
9. **Antigravity doan stub은 이 feature의 run이 책임진다.** P5가 찾지 못한다고 판정하면 F1로 고치고 Z1에서 ARCHITECTURE에 올린다. BACKLOG나 따로 `/ship`으로 넘기지 않는다. 사람의 말: "그럼 그 run이 책임지도록. BACKLOG로 짬 떄리는게 아니고".
10. **`/` 앞에는 field 맨 앞이나 공백만 온다.** 여는 괄호·따옴표 뒤의 `/`는 시작이 아니다. 이유: 사람이 정한 경계 그대로이고, 괄호 안 경로 `(/usr/bin)` 같은 글을 덜 건드린다.
11. **한글이 아닌 글자 바로 뒤에 한글이 오면 거기서 이름이 끝날 수 있다**(§4.1 '한글 경계'). `/deploy로 배포해`는 `/deploy`를 하이라이트한다. 권장(조사도 단어의 일부로 보아 하이라이트하지 않음)과 다르게 정했다. 사람은 "ASCII 이름 바로 뒤의 한글"이라 했고, 규칙은 한글이 아닌 모든 글자 뒤로 일반화했다(ASCII 이름에는 같은 결과다). 이유: 한국어 사용자는 영문 이름 바로 뒤에 조사를 붙여 쓴다. 한글로 끝나는 이름 뒤의 조사는 나누지 않는다(이름과 조사의 경계를 알 수 없다).
12. **그리기는 편집 가능한 `<span class="skill-word">`다.** R1에서 IME나 caret 문제가 나오면 그때만 CSS Custom Highlight API(`::highlight()`)로 옮긴다. 이유: 결정 4의 모양(굵기, padding, 모서리)을 얻는 길은 span뿐이고, chip field가 이미 확정 편집 뒤 다시 그리는 길(`repair`)을 갖고 있다.
13. **하이라이트만 끄는 동작은 없다.** skill로 보내고 싶지 않으면 단어를 바꾼다(예: `` `/deploy` ``). 이유: 끄는 상태를 두면 보이는 글과 보낼 줄이 상태에 따라 갈린다.
14. **field 맨 앞 단어가 skill 단어이고 그 뒤에 공백이 오면 `/` 목록을 닫는다. 닫힘은 글에서 계산하므로 그 공백을 지우면 다시 열린다.** skill이 아닌 여러 단어 검색(`/design system`)은 그대로 열려 있다. 이유: `/deploy to staging`을 치는 동안 "No presets match" 목록이 떠 있지 않다. 상태로 두지 않는 이유는 POSTMORTEM 2026-11-01의 다시 열림 함정을 피하고 더 단순하기 때문이다.
15. **skill 전용 placeholder는 두지 않는다.** preset chip만 있을 때의 "Which canvas or screen? Add details…"는 그대로다. 이유: skill은 글이라 field가 비지 않으므로 그 문구가 보일 상태가 없다.
16. **preset id와 skill 이름이 같으면 preset이 이긴다.** 검색어가 preset id와 정확히 같으면 그 preset 행이 맨 위이고 Enter는 지금처럼 preset chip을 고른다. 같은 이름의 skill 행은 바로 아래다. 글 속의 `/audit` 단어는 skill로 하이라이트된다(preset은 chip으로만 고르므로). 이유: preset 고르기가 지금 그대로다(spec 완료 조건 5, 10).
17. **`/` 검색어가 skill 이름과 정확히 같고 강조 행이 그 skill이면 Enter는 보낸다.** 이유: 고르기는 화면을 거의 바꾸지 않아 사람이 원하지 않은 확정 단계가 된다(결정 4).
18. **고정 줄은 말풍선뿐 아니라 대화 제목, queue 행, 알림의 한 줄 글에서도 뗀다.** main이 만드는 대화 제목도 포함한다. 이유: skill 줄은 메시지마다 여러 개 붙을 수 있어, 남겨 두면 sidebar와 목록의 제목이 고정 줄로 채워진다.
19. **preset 읽기가 실패해도 받은 skill은 보인다.** preset 쪽 notice나 loading 줄 아래에 skill section을 둔다. 이유: 결정 5(skill이 없어도 preset은 그대로)의 대칭이다.
20. **IME 조합 중에는 조합 글이 하이라이트 안에 보일 수 있다. 받아들이고 R1에서 본다.** 조합이 끝난 뒤 다시 정해진다. 거슬리면 caret을 span 밖에 두는 규칙을 더한다. 이유: 지금의 chip field 길(조합 중 그리지 않음)을 그대로 쓸 수 있다.
21. **턴이 끝날 때도 다시 읽는다(같은 30초 상한).** 이유: agent가 방금 만든 skill을 다음 메시지에서 바로 쓸 수 있다.
22. **탭 이름은 "Project", 아이콘은 lucide `SquareSlash`. popover는 skill이 있는 동안만, 탭 줄에 필요한 만큼만 넓힌다.** skill이 없으면 600px 그대로이고 `/` 목록도 그대로다. 넓힌 폭은 초안 수정본에서 잰 값이다. 이유: 탭이 넘치지 않으면서 기존 탭의 크기·아이콘·이름을 바꾸지 않는다(사람: "Tab Label을 그냥 Project 또는 Projects로. 이에 맞춰 1번으로"; "Project"는 다른 탭처럼 group 이름으로 읽힌다).
23. **보라 아이콘 타일은 Doan preset 행에만 둔다.** `/` 목록, 검색 결과, popover 탭의 preset 행 왼쪽에 제안 프롬프트 행과 같은 primitive(`.suggestion-icon`과 group 아이콘)를 둔다. skill 행에는 아이콘도 caption도 없다. 이유: Doan preset이 특별해 보여야 한다(사람: "도안 프리셋 한정으로 아이콘", "프롬프트 버튼과 같은 프리미티브로"). 이에 따라 지금 preset 행의 모양이 바뀌고 DESIGN 'Home'의 preset 행 측정값이 바뀐다.
24. **말풍선 안의 하이라이트는 `--surface-panel` fill이다.** 말풍선 fill이 하이라이트 fill과 같아 묻히므로, 말풍선 안 anchor chip(`.bubble .anchor-chip`)과 같은 규칙을 쓴다.
25. **"Project" 탭 안 skill 행은 이름순이다.** 이유: provider가 바뀌어도 같은 저장소는 같은 순서로 보인다.
26. **검색 문구**: 결과 없음 "No presets or skills match “<q>”.", 목록 접근 이름 "<n> preset(s) and <m> skill(s) match <q>"(예: "1 preset and 1 skill match rev", "2 skills match dep"), placeholder "Search presets and skills"(skill이 없으면 "Search presets"). clarify preset으로 다듬은 초안의 문구를 사람이 확인했다.

## 결정할 점

없음. 남은 확인은 PoC(P1–P3, P5)와 R1의 결과로 정한다: Claude의 거르기 규칙(P1), 따르지 않는 provider의 길(P2, 결정 3·8), 최소 버전(P3), Antigravity stub(P5, 결정 9), span 그리기의 IME·caret 문제(R1, 결정 12·20).
