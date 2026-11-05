# project-skill-drawer — tasks

design '결정' 0–21(사람, 2026-11-06)을 따른 순서다.

순서: PoC → UI 초안(구현 전, AGENTS.md 'Workflow') → (필요하면) Antigravity stub 수정 → 순수 함수 → main(I/O) → renderer(UI) → 실제 앱 확인 → 문서 승격.

시작 조건: chain-261106(work-update → canvas-handoff → small-ui-tweaks)이 병합된 뒤 시작한다. turn-activity와의 순서는 그때 정한다(design '겹치는 feature와 순서').

## P. PoC(실제 provider, 공용 로그인 프로필과 사람의 승인 필요, P1–P5를 한 세션에서)

- [ ] P1. 목록: 임시 repo(design 'PoC 의존' P1의 목록: `.claude/skills/a`, `.claude/commands/b.md`, 중첩 `.claude/commands/sub/x.md`, `.agents/skills/c`, `.agents/skills/d`를 가리키는 symlink `.claude/skills/d`, `disable-model-invocation` skill, `user-invocable: false` skill, 이상한 이름(대문자, 한글, 끝이 문장부호, 64자))와 MCP connector 하나로, Doan 프로필의 Claude `initializationResult().commands`가 첫 메시지 전에 답하는지, 섞여 오는 항목(MCP prompt, claude.ai connector, plugin), symlink를 따라가는지 기록한다. Codex `skills/list {cwds: [root]}`의 `data[].skills[]`의 `scope`·`enabled`·`pluginId`와 `errors`를, 신뢰하지 않은 project에서도 기록한다. 결과로 `parseClaudeSkills`의 거르기 규칙을 design §1에 적는다. 두 응답은 개인 정보를 지운 뒤 A1의 fixture로 쓴다.
  - 검증: command undecided — needs user confirmation(`.scratch/project-skill-drawer/`의 probe와 출력, 결과를 아래 'P 결과'에 적는다).
- [ ] P2. 전달: design §3의 고정 줄과 글 속 `/<이름>`이 든 Doan prompt(`turnPrompt`로 만든 것)로 Claude가 Skill 도구를 부르는지, Default 모드에서 승인을 묻는지, `disable-model-invocation` skill에서 무엇이 일어나는지 본다. Codex는 rollout에 `<skill>` fragment가 남는지 본다. 따르지 않는 provider가 있으면 그 provider만 따로 길을 정하도록 사람에게 묻는다(결정 3, 8).
  - 검증: command undecided — needs user confirmation(provider 턴 기록과 rollout 발췌를 'P 결과'에 적는다).
- [ ] P3. 최소 버전: Claude Code 2.1.284와 Codex 0.158.0에서 P1의 두 호출이 같은 모양으로 답하는지. 옛 버전은 임시 prefix에 설치하고 사람의 전역 설치는 건드리지 않는다. 아니면 최소 버전을 올릴지 사람에게 묻는다(ARCHITECTURE §7 'Agent authentication' 'Versions').
  - 검증: command undecided — needs user confirmation. 두 버전의 응답 모양과 설치 방법(임시 prefix, 전역 설치 불변)을 'P 결과'에 적는다.
- [ ] P5. Antigravity doan stub: Doan 연결 Antigravity 캔버스 대화에서 agent에게 가진 skill과 `doan` skill이 있는지 묻고, ACP frame과 서버의 파일 읽기에서 `skills/doan` 참조를 찾는다. 저장소의 `.agents/skills`를 찾는지도 본다. 서버 버전(`antigravity.ts`의 `ANTIGRAVITY_SERVER.version`과 실제 내려받은 서버)을 함께 기록한다. 찾으면 F1을 지우고 `providers.ts`의 `HOME_STUB` 주석의 "B3 live check 2026-10-28"을 그대로 둔다. 찾지 못하면 F1을 한다.
  - 검증: command undecided — needs user confirmation(대화 기록, frame·파일 읽기 발췌, 판정을 'P 결과'에 적는다).

── commit 없음(PoC 기록은 `.scratch/`, 결론만 이 문서에) ──

### P 결과

(PoC 뒤에 적는다.)

## D0. UI 초안(구현 전)

- [ ] D0. `/design-draft project-skill-drawer`로 design '초안 요청'의 상태 전부(하이라이트 상태, 말풍선, popover 탭, `/` 목록, skill 행 caption, `/audit` 충돌, preset 실패와 skill, placeholder 두 가지와 결과 없음 문구, IME 조합 중 모양)를 그리고 사람이 앱에서 확정한다. 글은 `doan design-skill clarify --json`을 읽고 쓴다(결정 7). 확정된 문구는 B3·D2의 기대값이 된다.
  - 검증: `doan check --repo . --json`(임시 `DOAN_RUNTIME`)이 초안에 오류 없음, `doan ls --repo . --json`에 초안이 있음, design '초안 요청'에 사람이 확인한 날짜가 있다. — 커밋(`docs(design): project-skill-drawer draft`)

## F. Antigravity stub 수정(P5가 "찾지 못함"일 때만)

- [ ] F1. `HOME_STUB(".gemini")`(`app/src/main/agentAuth/providers.ts`의 `HOME_STUB` 정의와 `.gemini` 사용)가 쓰는 경로를 P5에서 서버가 실제로 읽는다고 확인한 경로(1.3.0 소스로는 `<GEMINI_HOME>/config/skills` 또는 `<GEMINI_HOME>/antigravity-cli/skills`, `GEMINI_HOME=<profile>/.gemini`는 `environment.ts:35-36`)로 옮기고 주석의 근거를 바꾼다. stub은 provider 프로세스마다 쓰이므로(`manager.ts:778` `writeSetting`) 이미 있는 profile도 다음 프로세스부터 새 경로에 stub을 가진다. 옛 경로의 파일은 서버가 읽지 않으므로 그대로 둔다(지우는 코드를 더하지 않는다). 지금 `providers.test.ts`는 `skills/doan/SKILL.md`로 끝나는지만 보고 `manager.test.ts`에는 antigravity stub 쓰기 테스트가 없으므로, antigravity의 정확한 stub 경로를 고정하는 테스트를 새로 더하고 바꾸기 전에 red를 확인한다.
  - 검증: `npm --prefix app test` 통과(새 테스트가 바꾸기 전 red였음을 기록), 그리고 실제 Antigravity 턴 하나에서 agent가 `doan` skill을 찾는다(공용 프로필, 사람 승인; 'P 결과'에 기록).

── commit: `fix: put the Antigravity doan skill stub where its server reads skills` ──

## A. 순수 함수(main)

- [ ] A1. `parseClaudeSkills`, `parseCodexSkills`와 type-only `SkillSummary`. fixture는 P1의 실제 응답(개인 정보 지움)이다.
  - 검증: `npm --prefix app test` — builtin·`doan` stub·P1에서 정한 MCP/connector/plugin 항목 제외, Codex `data[].skills[]` 풀기와 `scope !== "repo"`·`enabled === false`·`pluginId`가 있는 항목 제외, `errors` 버리기, 이름 검증(빈 값, 공백·줄바꿈, backtick, 64자 상한), 항목 200개와 설명 첫 줄 200 code unit 상한, 같은 이름 하나로, 모양이 틀린 답은 오류.

── commit: `feat: parse project skills from Claude and Codex listings` ──

## B. 순수 함수(renderer)

- [ ] B1. `skillWords`와 `fieldSkillRuns`(design §4.1).
  - 검증: `npm --prefix app test` — §4.1의 예 전부(`/deploy` ○, `/deploy.` ○이고 범위에 `.` 없음, `(/deploy)` ×, `/deploy-x` ×, `/deplo` ×, `/Deploy` ×, `/deploy/x` ×, `/Users/me/deploy` ×, `/deploy로 배포해` ○이고 범위는 `/deploy`, `/deploy에서도` ○, `/deploy로.` ○, `/deploy.로` ×, `/db-migrate를` ○, `/deploy-x로` ×, 한글 이름 `/배포` ○·`/배포로` ×, `/deploy배포로`에서 `deploy`만 목록에 있으면 `/deploy`, 가장 긴 후보 우선, 한글 세 범위의 첫·끝 글자와 범위 밖 글자(예: U+A960 확장 자모는 경계 아님), 문장 중간 ○, 한 줄에 둘 ○, 줄바꿈 뒤 ○, tab·NBSP 뒤 ○, 다른 글 뒤 field 끝 ○, `/`만 있는 단어 ×, `//deploy` ×, `/deploy/` ×, 끝 문장부호 묶음의 전각 `。`·`」` 하나 이상 ○, anchor chip 바로 뒤 ×), 빈 목록이면 없음.
- [ ] B2. `composeRequest`·`splitRequest`(preset 줄 → skill 줄들 → 빈 줄 → 글; 줄에는 조사를 뗀 목록의 이름)와 한 줄 글용 고정 줄 떼기(결정 18, main과 함께 쓰는 자리는 `rendererImports.test.ts`가 허용하는 곳), `draftProblem`의 한도, `insertSkillText`(caret은 넣은 공백 뒤), `slashQuery`의 맨 앞 skill 단어 뒤 공백에서 `null`(결정 14), `slashKey`의 정확히 같은 skill 이름에서 보내기(결정 17), `skillAnnouncements`.
  - 검증: `npm --prefix app test` — 왕복, 같은 이름 한 번·처음 나온 순서, preset만·skill만·둘 다·둘 다 없음, 한도가 고정 줄 포함, 고정 줄을 뗀 한 줄 글, popover 고르기의 공백 규칙과 caret, `/` 목록 고르기의 치환, `/design system` 검색은 열린 채, `/deploy `에서 닫히고 공백을 지우면 다시 열림, Esc로 닫은 뒤 field가 비면 다시 열림, 다시 읽은 목록에서 그 skill이 사라지면 여러 단어 검색으로 돌아감, `/deploy`에서 Enter는 보내기·`/audit`(preset과 같은 이름)에서 Enter는 preset 고르기.
- [ ] B3. `searchDrawer`와 `presetListView`의 "Project skills" 탭, `/` 목록·검색 결과의 skill 행·caption·summary·결과 없음 문구, placeholder와 접근 이름, 열린 목록의 행 변화 규칙. 문구는 D0에서 확정한 값이다.
  - 검증: `npm --prefix app test` — 점수 규칙과 preset 우선, 정확히 같은 preset id가 맨 위이고 같은 이름 skill이 바로 아래(`audit`), 그 밖에 정확히 같은 skill 이름이 맨 위, 행의 `kind`로 나뉜 key와 고르기, 탭 순서, preset 쪽 상태(loading, error, olderCli)가 skill 읽기에 영향받지 않음, 반대로 preset이 loading·error·olderCli일 때 skill section이 보임, 그룹 없는 옛 CLI 경로의 "Project skills" section, skill이 없거나 받은 적 없이 실패하면 탭·행 없음과 placeholder·`aria-label` "Search presets", skill이 있으면 "Search presets and skills", 열린 채 행이 바뀌면 강조가 같은 행을 따라감·없으면 0, 사라진 탭이면 첫 탭.

── commit: `feat: match project skill words and compose skill lines` ──

## C. main(I/O)

- [ ] C1. `conversationMethods`에 `skills {root, provider}`: `validProvider`와 `project_not_open` 검사(`conversation:models`와 같음), 목록 읽기 lease를 결과 타입을 받게 넓히고 `Runner.skills?()`. Claude는 목록용 query의 `initializationResult().commands`, Codex는 목록용 app-server의 `skills/list`. root × provider마다 30초 상한, 마지막 성공 목록, 진행 중 promise 공유, 실패는 시각을 남기지 않음(design §1). 다른 provider는 빈 목록. preload. 대화 제목(`service.ts`의 `messageLine(request.text, …)`)이 고정 줄을 뗀 글로 만들어진다(결정 18).
  - 검증: `npm --prefix app test` — 다른 sender·틀린 인자·열리지 않은 root 거부, fake runner로 30초 안 두 번째 요청이 provider를 다시 열지 않음, 같은 키로 동시에 온 요청이 provider를 한 번만 엶, 실패 뒤 다음 요청은 바로 다시 읽음, provider CLI가 없거나 로그인되지 않았거나 그 provider에 Doan 연결이 없으면 `{error}`, skill 읽기 중의 send가 busy로 거절되지 않음(POSTMORTEM 2026-10-28), sign-out 중 읽기가 중지 확인을 일으키지 않음(POSTMORTEM 2026-10-30), skill 줄만 있는 첫 메시지의 대화 제목에 고정 줄이 없음.

── commit: `feat: list project skills through the provider listing path` ──

## D. renderer(UI)

- [ ] D1. chip field의 하이라이트 그리기(`.skill-word` span, hook `skillNames()`, 조합 중에는 그리지 않음, 범위가 바뀌면 `render()`로 전체를 다시 그리고 caret 유지, `misdrawn()`이 기대 범위와 DOM span 범위를 비교)와 `styles.css` 규칙, `ds/checks.test.ts` `violetAllowed`, 세 하이라이트 값(`.anchor-chip`, `.suggestion-value`, `.skill-word`)이 같다는 CSS 테스트. 그 테스트는 small-ui-tweaks가 `Home.test.tsx`에 둔다. 그 feature가 병합되어 있으면 거기에 `.skill-word`를 더하고, 아니면 이 task가 `.anchor-chip`과 `.skill-word` 둘로 새로 만든다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck` — 순수 부분만 본다(이 앱의 vitest에는 DOM 환경이 없고, 새 DOM 테스트 의존성은 더하지 않는다): segments + runs에서 그릴 조각을 정하는 함수, `.skill-word` span이 맞게 있는 DOM을 misdrawn으로 보지 않음(B 순수 함수 12), 값(`FieldSegment[]`)과 단위가 하이라이트 전후 같음, CSS 값 테스트, `rendererImports.test.ts` 통과. caret, IME, 붙여넣기, 복사는 R1에서 본다.
- [ ] D2. host(Home, Overview, 캔버스 conversation panel)의 skill 읽기(처음 그릴 때, 목록 열 때 `onSkillsWanted`, 턴이 끝날 때, provider·project 바꿈)와 root × provider로 묶은 목록, docked composer의 `skills` prop, popover 탭과 `/` 행, skill 행 고르기, 보낼 때 고정 줄, 말풍선 하이라이트(`ConversationThread.tsx`, 보낸 이름으로), queue 행과 알림의 한 줄 글, queue와 Edit on Home의 되살리기, 접근성 알림(docked는 `onAnnounce`, Home은 자기 `announcement` status). 문구는 D0에서 확정한 값이다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck` — 보낸 text의 고정 줄이 화면의 하이라이트와 같음, Cursor로 바꾸면 하이라이트 없음과 고정 줄 없음, 되돌린 draft에 고정 줄 없음, queue 행에 고정 줄 없음, root A의 읽기가 root B로 바꾼 뒤 도착해도 B의 하이라이트를 바꾸지 않음(두 완료 순서; POSTMORTEM 2026-11-01, 2026-10-25), 다시 읽은 결과로 목록이 바뀌면 하이라이트가 생기거나 사라지고 보내는 고정 줄도 그 목록을 따름, 턴이 끝나면 다시 읽기를 요청함.

── commit: `feat: highlight project skill words in the composer` ──

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: build한 앱(`npm --prefix app run build`, POSTMORTEM 2026-10-30)을 격리해 띄운다. probe repo에는 `.claude/skills`와 `.agents/skills`를 둘 다 둔다. Home, Overview, 캔버스 conversation panel의 하이라이트(친 글자마다 생기고 사라짐, 줄바꿈, anchor chip 옆), caret 위치, 붙여넣기 뒤 하이라이트, 복사가 plain text인지, `/` 목록·popover의 skill과 `/audit` 충돌, 말풍선. skill이 없는 저장소, 읽기 실패, Cursor로 바꿨을 때 하이라이트가 사라지는지. native macOS 한글 IME로 `/deploy에서도`를 이어서 조합하는 동안과 공백 뒤의 모양, `/deploy` 뒤에 `로`를 조합하는 동안과 끝난 뒤 하이라이트, caret이 튀지 않는지 사람이 한 번 확인한다(BACKLOG의 IME 미검증, 결정 20). 실제 provider 턴(공용 프로필, 사람 승인)으로 Claude Code와 Codex가 그 skill을 썼는지 한 번씩.
  - 검증: `/runtime-test` 기록(스크린샷과 provider 기록). IME나 caret 문제가 나오면 결정 12·20대로 caret 규칙을 더하거나 CSS Custom Highlight API로 옮기고, 그 모양 차이(굵기·padding·모서리 없음)를 사람에게 알린다.
- [ ] R2. `/design-sync`: 초안과 computed style 비교, DESIGN.md에 측정값.
  - 검증: `/design-sync` 보고와 DESIGN.md 갱신.
- [ ] R3. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과.

## Z. 문서 승격

- [ ] Z1. PRODUCT §3 In scope 6 'Conversation'에 composer가 저장소의 skill을 이름으로 agent에게 전한다는 문장(결정 0의 범위)을 더하고, §5 item 1(composer)에 목록의 project skill과 탭, 이름 충돌, 인라인 하이라이트 규칙, 고르기와 Enter, 고정 줄(고쳐 쓰지 않음, 한 줄 글에서 뗌), 대상 provider를 현재 규칙으로 쓴다. §5 item 1 'Send'의 글 한도 문장을 고정 줄 전부를 포함하도록 고친다. ARCHITECTURE §7 'Design preset reads' 옆에 project skill 목록 읽기(`conversation` `skills` method, provider별 출처와 거르기 규칙, 상한, 30초 캐시), 'Renderer primitives'에 하이라이트 그리기, 'Input and prompt'에 skill 줄을 쓴다. DESIGN 'Accent places'에 `.skill-word`를 더하고, 하이라이트가 생기는 Home·Overview·canvas panel composer 항목을 R2 측정값으로 고친다. F1을 했으면 ARCHITECTURE §7 'Agent authentication' 'Profiles'의 Antigravity stub 경로를 고친다. P3로 최소 버전이 바뀌면 PRODUCT §3 'Transport and evidence boundary'와 `minimumVersions.ts`를 함께 고친다. 미검증 표면은 BACKLOG에 둔다. 그리고 `docs/features/project-skill-drawer/`를 지운다.
  - 검증: `test ! -e docs/features/project-skill-drawer`, `grep -rn 'features/project-skill-drawer' docs AGENTS.md README.md`가 결과 없음(DESIGN.md의 초안 경로 `Reference: .doan/canvases/…`는 남는다), PRODUCT·ARCHITECTURE·DESIGN의 새 문장이 코드와 맞는지 diff로 확인.

── commit: `docs: promote project-skill-drawer to PRODUCT and ARCHITECTURE` ──
