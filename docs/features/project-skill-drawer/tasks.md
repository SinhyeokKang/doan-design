# project-skill-drawer — tasks

design '결정' 0–15(사람, 2026-11-06)를 따른 순서다.

순서: PoC → (필요하면) Antigravity stub 수정 → 순수 함수 → main(I/O) → renderer(UI) → 실제 앱 확인 → 문서 승격.

## P. PoC(실제 provider, 공용 로그인 프로필과 사람의 승인 필요, P1–P5를 한 세션에서)

- [ ] P1. 목록: 임시 repo(`.claude/skills/a`, `.claude/commands/b.md`, `.agents/skills/c`, `disable-model-invocation` skill, `user-invocable: false` skill)와 MCP connector 하나로, Doan 프로필의 Claude `supportedCommands()`가 첫 메시지 전에 답하는지와 섞여 오는 항목(MCP prompt, claude.ai connector, plugin), Codex `skills/list {cwds: [root]}`의 `scope`·`enabled`를 기록한다. 결과로 `parseClaudeSkills`의 거르기 규칙을 design §1에 적는다.
  - 검증: command undecided — needs user confirmation(`.scratch/project-skill-drawer/`의 probe와 출력, 결과를 아래 'P 결과'에 적는다).
- [ ] P2. 전달: design §3의 고정 줄과 글 속 `/<이름>`이 든 Doan prompt(`turnPrompt`로 만든 것)로 Claude가 Skill 도구를 부르는지, Default 모드에서 승인을 묻는지, `disable-model-invocation` skill에서 무엇이 일어나는지 본다. Codex는 rollout에 `<skill>` fragment가 남는지 본다. 따르지 않는 provider가 있으면 그 provider만 따로 길을 정하도록 사람에게 묻는다(결정 3, 8).
  - 검증: command undecided — needs user confirmation(provider 턴 기록과 rollout 발췌를 'P 결과'에 적는다).
- [ ] P3. 최소 버전: Claude Code 2.1.284와 Codex 0.158.0에서 P1의 두 호출이 같은 모양으로 답하는지. 아니면 최소 버전을 올릴지 사람에게 묻는다(ARCHITECTURE §7 'Agent authentication' 'Versions').
  - 검증: command undecided — needs user confirmation.
- [ ] P5. Antigravity doan stub: Doan 연결 Antigravity 캔버스 대화에서 agent에게 가진 skill과 `doan` skill이 있는지 묻고, ACP frame과 서버의 파일 읽기에서 `skills/doan` 참조를 찾는다. 저장소의 `.agents/skills`를 찾는지도 본다. 서버 버전(`antigravity.ts`의 `ANTIGRAVITY_SERVER.version`과 실제 내려받은 서버)을 함께 기록한다. 찾으면 F1을 지우고 `providers.ts:115-116` 주석의 "B3 live check 2026-10-28"을 그대로 둔다. 찾지 못하면 F1을 한다.
  - 검증: command undecided — needs user confirmation(대화 기록, frame·파일 읽기 발췌, 판정을 'P 결과'에 적는다).

── commit 없음(PoC 기록은 `.scratch/`, 결론만 이 문서에) ──

### P 결과

(PoC 뒤에 적는다.)

## F. Antigravity stub 수정(P5가 "찾지 못함"일 때만)

- [ ] F1. `HOME_STUB(".gemini")`(`app/src/main/agentAuth/providers.ts:116`)가 쓰는 경로를 P5에서 서버가 실제로 읽는다고 확인한 경로(1.3.0 소스로는 `<GEMINI_HOME>/config/skills` 또는 `<GEMINI_HOME>/antigravity-cli/skills`, `GEMINI_HOME=<profile>/.gemini`는 `environment.ts:35-36`)로 옮기고 주석의 근거를 바꾼다. stub은 provider 프로세스마다 쓰이므로(`manager.ts:778` `writeSetting`) 이미 있는 profile도 다음 프로세스부터 새 경로에 stub을 가진다. 옛 경로의 파일은 서버가 읽지 않으므로 그대로 둔다(지우는 코드를 더하지 않는다). `providers.test.ts`(stub 경로)와 `manager.test.ts`(쓰기)를 고친다.
  - 검증: `npm --prefix app test` 통과, 그리고 실제 Antigravity 턴 하나에서 agent가 `doan` skill을 찾는다(공용 프로필, 사람 승인; 'P 결과'에 기록).

── commit: `fix: put the Antigravity doan skill stub where its server reads skills` ──

## A. 순수 함수(main)

- [ ] A1. `parseClaudeSkills`, `parseCodexSkills`와 type-only `SkillSummary`.
  - 검증: `npm --prefix app test` — builtin·`doan` stub·P1에서 정한 MCP/plugin 항목 제외, `scope !== "repo"`·`enabled === false` 제외, 이름 검증(빈 값, 공백·줄바꿈, backtick, 길이 상한), 같은 이름 하나로, 모양이 틀린 답은 오류.

── commit: `feat: parse project skills from Claude and Codex listings` ──

## B. 순수 함수(renderer)

- [ ] B1. `skillWords`와 `fieldSkillRuns`(design §4.1).
  - 검증: `npm --prefix app test` — §4.1의 예 전부(`/deploy` ○, `/deploy.` ○이고 범위에 `.` 없음, `(/deploy)` ×, `/deploy-x` ×, `/deplo` ×, `/Deploy` ×, `/deploy/x` ×, `/Users/me/deploy` ×, `/deploy로 배포해` ○이고 범위는 `/deploy`, `/deploy에서도` ○, `/deploy로.` ○, `/deploy.로` ×, `/db-migrate를` ○, `/deploy-x로` ×, 한글 이름 `/배포` ○·`/배포로` ×, `/deploy배포로`에서 `deploy`만 목록에 있으면 `/deploy`, 가장 긴 후보 우선, 한글 세 범위의 첫·끝 글자와 범위 밖 글자(예: U+A960 확장 자모는 경계 아님), 문장 중간 ○, 한 줄에 둘 ○, 줄바꿈 뒤 ○, anchor chip 바로 뒤 ×), 빈 목록이면 없음.
- [ ] B2. `composeRequest`·`splitRequest`(preset 줄 → skill 줄들 → 빈 줄 → 글; 줄에는 조사를 뗀 목록의 이름), `draftProblem`의 한도, `insertSkillText`, `slashQuery`의 맨 앞 skill 단어 뒤 공백에서 닫힘, `skillAnnouncements`.
  - 검증: `npm --prefix app test` — 왕복, 같은 이름 한 번·처음 나온 순서, preset만·skill만·둘 다·둘 다 없음, 한도가 고정 줄 포함, popover 고르기의 공백 규칙, `/` 목록 고르기의 치환, `/design system` 검색은 열린 채.
- [ ] B3. `searchDrawer`와 `presetListView`의 "Project skills" 탭, `/` 목록·검색 결과의 skill 행과 summary, 정확히 같은 이름이 맨 위, skill이 없거나 읽기 실패일 때 탭·행 없음.
  - 검증: `npm --prefix app test` — 점수 규칙과 preset 우선, 탭 순서, preset 쪽 상태(loading, error, olderCli)가 skill 읽기에 영향받지 않음.

── commit: `feat: match project skill words and compose skill lines` ──

## C. main(I/O)

- [ ] C1. `project-skills:list {root, provider}`: Claude는 목록용 SDK query의 `supportedCommands()`, Codex는 목록용 app-server의 `skills/list`. `prepareListing`의 lease 아래에서 읽고, root × provider마다 30초 상한과 마지막 목록(결정 6). 다른 provider는 빈 목록. `senderAllowed.ts`, preload.
  - 검증: `npm --prefix app test` — 채널 거부(다른 sender, 틀린 인자), fake runner로 30초 안 두 번째 요청이 provider를 다시 열지 않음, 실패는 `{error}`, sign-out 중 읽기가 중지 확인을 일으키지 않음(POSTMORTEM 2026-10-30).

── commit: `feat: list project skills through the provider listing path` ──

## D. renderer(UI)

- [ ] D0. `/design-draft`로 초안을 그리고 사람이 앱에서 확정한다(design '초안 요청': 하이라이트 상태 전부, 말풍선, popover 탭, `/` 목록).
  - 검증: `doan check --repo .`가 초안에 오류 없음, `doan ls --repo . --json`에 초안이 있음.
- [ ] D1. chip field의 하이라이트 그리기(`.skill-word` span, 조합 중에는 그리지 않음, 범위가 바뀌면 그 줄만 다시 그리고 caret 유지)와 `styles.css` 규칙, `ds/checks.test.ts` `violetAllowed`, 세 하이라이트 값이 같다는 CSS 테스트(small-ui-tweaks와 함께, design '겹치는 feature').
  - 검증: `npm --prefix app test` — 친 글자마다 하이라이트가 생기고 사라짐, 값(`FieldSegment[]`)과 단위가 하이라이트 전후 같음, caret 위치 유지, 조합 중 DOM 그대로, 붙여넣기 뒤 하이라이트, 복사가 plain text, `rendererImports.test.ts` 통과.
- [ ] D2. Home·docked composer: 목록 열 때와 처음 그릴 때 skill 읽기, provider·project 바꿈에 다시 정하기, popover 탭과 `/` 행, skill 행 고르기, 보낼 때 고정 줄, 말풍선 하이라이트(`ConversationThread.tsx`), queue와 Edit on Home의 되살리기, 접근성 알림. 문구는 clarify preset으로 검토한다(결정 7).
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck` — 보낸 text의 고정 줄이 화면의 하이라이트와 같음, Cursor로 바꾸면 하이라이트 없음과 고정 줄 없음, 되돌린 draft에 고정 줄 없음.

── commit: `feat: highlight project skill words in the composer` ──

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: 격리된 앱에서 Home과 Overview의 하이라이트(친 글자마다 생기고 사라짐, 줄바꿈, anchor chip 옆), `/` 목록·popover의 skill, 말풍선. native macOS 한글 IME로 `/deploy` 뒤에 `로`를 조합하는 동안과 끝난 뒤 하이라이트가 `/deploy`에 남는지, caret이 튀지 않는지 사람이 한 번 확인한다(BACKLOG의 IME 미검증). 실제 provider 턴(공용 프로필, 사람 승인)으로 Claude Code와 Codex가 그 skill을 썼는지 한 번씩.
  - 검증: `/runtime-test` 기록(스크린샷과 provider 기록). IME나 caret 문제가 나오면 결정 12대로 CSS Custom Highlight API로 옮기고, 그 모양 차이(굵기·padding·모서리 없음)를 사람에게 알린다.
- [ ] R2. `/design-sync`: 초안과 computed style 비교, DESIGN.md에 측정값.
  - 검증: `/design-sync` 보고와 DESIGN.md 갱신.
- [ ] R3. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과.

## Z. 문서 승격

- [ ] Z1. PRODUCT §5 item 1 'Design presets'(목록의 project skill과 탭, 인라인 하이라이트 규칙, 고르기, 대상 provider)와 Skills 13(고정 줄, 고쳐 쓰지 않음), 결정 0의 범위를 현재 규칙으로 쓴다. ARCHITECTURE §7 'Design preset reads' 옆에 project skill 목록 읽기(채널, provider별 출처와 거르기 규칙, 30초 상한), 'Renderer primitives'에 하이라이트 그리기, 'Input and prompt'에 skill 줄을 쓴다. F1을 했으면 ARCHITECTURE §7 'Agent authentication' 'Profiles'의 Antigravity stub 경로를 고친다. P3로 최소 버전이 바뀌면 PRODUCT §3 'Transport and evidence boundary'와 `minimumVersions.ts`를 함께 고친다. 미검증 표면은 BACKLOG에 둔다. 그리고 `docs/features/project-skill-drawer/`를 지운다.
  - 검증: `grep -rn 'project-skill-drawer' docs/ AGENTS.md`가 결과 없음, PRODUCT·ARCHITECTURE의 새 문장이 코드와 맞는지 diff로 확인.

── commit: `docs: promote project-skill-drawer to PRODUCT and ARCHITECTURE` ──
