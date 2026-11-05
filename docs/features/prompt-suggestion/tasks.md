# prompt-suggestion — tasks

순서: PoC → 순수 함수 → main(I/O) → renderer(UI) → 실제 앱 확인 → 문서 승격. provider-usage(PR #98, 병합됨)가 가져온 턴 끝 처리 위에서 `/ship`(또는 작으면 한 batch)으로 간다. queue-steer-shortcut(composer 키)·context-window-ring(턴 끝 runner)과 같은 코드를 고치므로 그 둘과 나란히 돌리지 않는다(design '다른 feature와 겹치는 곳'). 결정은 design '결정'에 있고, `/design-draft`는 생략한다(결정 10).

## P. PoC

- [x] P1. design 'PoC 결과' P1-a–f를 design 결정 12의 환경에서 확인한다. 실제 계정으로 모델을 부른다. sign-in, 실행 승인, 끝난 뒤의 sign-out과 Keychain 항목 정리는 그때 사람에게 묻는다.
  - P1-a·c·d·e: `.scratch/prompt-suggestion/`의 일회용 node SDK script. 임시 `CLAUDE_CONFIG_DIR`에 새로 sign-in하고, `query` 옵션은 `openClaude`와 같게(턴마다 새 Query, resume, `includePartialMessages`, `settingSources`) 둔 뒤 `promptSuggestions: true`만 더한다. P1-a를 가장 먼저 한다. 사용량 조회 없이 `result` 직후 입력을 닫는 턴에서 제안이 오지 않으면 나머지를 하지 않고 멈춘다.
  - P1-b: 앱에서 한다. 새로 sign-in한 공용 프로필(실제 HOME, `/Users/sinhyeok/code/doan-design/.scratch/` 아래 userData, main checkout의 Electron).
  - 결과(2026-11-05, Claude Code 2.1.318): design 'PoC 결과'. 실행: `CLAUDE_CONFIG_DIR=<임시> P1_FORCE=1 node .scratch/prompt-suggestion/p1.mjs <a|c|d|e|f>`(사람 승인, chain-261105 '인계 기록'). 기본 설정에서는 한도 상태 `allowed_warning` 때문에 오지 않아 결정 2를 고쳤고, 끝내는 방법은 group stop으로 정했다(결정 5). P1-b의 앱 확인은 E1(c)로 옮겼다(사람).
  - 검증: 결과로 다음을 적는다: (a) 사용량을 읽는 턴·조회를 건너뛴 턴·legacy external 턴 각각에서, 그리고 턴 1·턴 2(resume)·도구 턴·짧은 턴에서 제안이 왔는지, (b) `result`→제안, `result`→group 소멸 시간(켜기·끄기), `turn.done`에서 바로 보낸 send의 `busy` 여부, (c) 제안을 기다리는 중과 제안 없이 정상 종료하는 중 각각에서 interrupt와 group stop의 종료 시간·다음 resume·transcript·SessionEnd hook, (d) 세션 JSONL과 registry 변화, (e) plan mode와 한도 상태, 그리고 CLI 버전. 관측값(통과·실패, 시간, 날짜, CLI 버전)은 이 feature 문서와 커밋 메시지에 남긴다. 하나라도 design과 다르면 멈추고 design을 고친다.

**커밋 경계 0** (P1의 관측을 이 문서에 반영하는 docs 커밋. P1 결과로 design '조사 결과'의 'Doan의 runner'를 다시 쓰고, 동작 main 6의 끝내는 방법을 정한다)

## A. 순수 함수

- [ ] A1. main `promptSuggestionText`(design '순수 함수' 1)와 `conversationSummary`의 `suggestion` 규칙(2)을 `/tdd`로 먼저 테스트하고 구현한다.
  - 검증: `npm --prefix app test`에서 새 사례가 구현 전 red, 구현 뒤 green. 사례: 모양이 다른 frame·빈 글·공백만·줄바꿈 접기·1,000·1,001 code unit 경계(결정 11), design '순수 함수' 1의 글자 집합마다 범위 양 끝 fixture(Cc, U+0085, NBSP, U+2028/2029, bidi 제어 U+202A–202E·U+2066–2069와 그 바로 바깥 글자). summary는 `live` 입력의 `returned`·`suggestion`으로 만들고(`service.ts`의 `returnedDraft` 덧붙임을 함수 안으로 옮김), current·ended·not working·queued 0·`returnedDraft` 없음일 때만 `suggestion`이 있고 archived·running·waiting·working·queued·returnedDraft에서는 없음. 기존 `summary.test.ts` 사례도 green.
- [ ] A2. renderer `composerPlaceholder`(3)와 `takesSuggestion`(4)을 `/tdd`로 먼저 테스트하고 구현한다.
  - 검증: `npm --prefix app test`에서 새 사례가 red 뒤 green. `composerPlaceholder`: 읽기 전용 > preset 문구 > 제안 > 기본 문구의 순서, 새 대화 mode에서는 제안 없음, 글 없이 첨부만 있는 draft에서는 제안이 보임, 두 host의 지금 문구가 그대로 나옴. `takesSuggestion`: 수정키 없는 ArrowRight만 참, Shift·Option·Command·Control·`isComposing`·`keyCode 229`·제안 없음·빈 입력란 아님에서 거짓. `isSubmitKey`의 기존 사례도 green.

**커밋 경계 1** (테스트와 구현을 `/ship` 규칙대로 나눈다)

## B. main

- [ ] B1. `openClaude`에 `promptSuggestions: true`(모든 Claude 실행, 결정 2)를 두고, terminal이 done인 turn 뒤의 `prompt_suggestion`을 `promptSuggestionText`로 걸러 runner 입력의 `suggested`로 넘긴다. done turn의 입력이 닫혔고 프로세스가 살아 있고 제안이 아직 오지 않은 동안을 service가 알 수 있게 하고, group stop으로 그 프로세스를 끝낼 수 있게 한다. login shell probe(`onboarding/machine.ts`)가 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION`도 읽고, Claude 실행 환경에 그 값을, 없으면 `true`를 준다(design 결정 2, 동작 main 1·2·6).
  - 검증: `npm --prefix app test`에서 `runners.test.ts`의 새 사례가 green: done 뒤 제안 한 번 전달, failed·interrupted·steer가 남은 turn·terminal 전 frame·두 번째 제안은 무시, 사용량 조회가 있을 때도 순서와 상한(`TURN_USAGE_MS`)이 그대로. probe·`agentEnv` 테스트: shell이 값을 정하지 않으면 Claude 실행 환경에 `true`, shell의 `false`는 그대로 `false`, Codex·ACP 실행 환경에는 없음, 기존 probe 출력 해석 사례 green.
- [ ] B2. service가 send마다 `suggested`를 `live`·`turnId`에 묶어 만들고, 대화별 메모리 map에 두고, 다음 턴 수락·archive·restore·delete와 그 대화의 Claude 연결 sign-out·교체에서 지우고, 목록 변경을 알린다. `previousExit`가 design 동작 main 6의 조건인 이전 Claude 프로세스를 만나면 그 프로세스를 끝낸 뒤 기다린다(design 동작 main 3–6).
  - 검증: `npm --prefix app test`에서 `service.test.ts`의 새 사례가 green: 다음 send가 시작된 뒤 온 제안은 버림, 다른 `live`의 제안은 버림, 다음 턴 수락과 archive·delete에서 사라짐, archive·delete 뒤 같은 `live`의 늦은 `suggested`가 map과 summary에 다시 들어오지 않음, 앱 `quit()` 중에 온 제안은 무시됨, 그 대화의 Claude 연결이 sign out되거나 다른 연결로 바뀌면 사라짐, 이전 프로세스의 exit callback보다 먼저 보낸 send가 `busy` 없이 진행되고 조건에 맞는 프로세스는 끝내라는 요청을 받음, 조건에 맞지 않는 프로세스(failed·interrupted 턴, 제안을 이미 받음)는 지금처럼 기다림(POSTMORTEM 2026-10-28). `npm --prefix app run typecheck` 통과.

**커밋 경계 2**

## C. renderer

- [ ] C1. `chipField.ts`에 undo 단계를 남기는 글 넣기를, `ComposerFieldHandle`에 `insertText`를 더한다. 두 host의 placeholder 식을 `composerPlaceholder`로 바꾸고 summary의 `suggestion`을 넘긴다. `DockedComposer`의 `onKey`에서 `takesSuggestion`이면 `insertText`를 부른다. 접근성 설명과 도착 알림을 더한다(design 동작 renderer 1–5, 결정 6·7).
  - 검증: `npm --prefix app test`에서 `DockedComposer.interaction.test.tsx`의 새 사례가 실제 `ComposerField` keydown으로 green: (a) 제안이 placeholder(`aria-placeholder`)로 보임, (b) 빈 입력란의 ArrowRight가 제안을 넣고 caret이 끝, 포커스는 입력란, 보내지 않음, (c) ⌘Z 한 번에 빈 입력란과 제안 placeholder로 돌아감, (d) 글이 있으면 ArrowRight가 넣지 않음, (e) preset 문구가 보일 때·읽기 전용일 때·조합 중일 때 넣지 않음, (f) Enter·Shift+Enter·`/` 목록·Backspace chip 지우기가 그대로, (g) 입력란 설명에 "Press Right Arrow to use the suggestion."이 있음, (h) 같은 대화에 새 제안 글이 왔고 입력란에 포커스가 있을 때만 도착을 한 번 알리고 "Suggestion: …"으로 읽힘, 대화 전환으로 보이게 된 제안과 넣었다 지워서 다시 보이는 제안은 알리지 않음, (i) 글 없이 첨부만 있는 draft에서 ArrowRight가 제안을 넣고 첨부는 남음. `homeRun.test.ts`의 새 사례: 오래된 목록 읽기가 지워진 제안을 되살리지 않음. `npm --prefix app run typecheck`와 `npm --prefix app run build` 통과.

**커밋 경계 3**

## E. 실제 앱 확인

- [ ] E1. `/runtime-test`로 격리한 실제 앱에서 바뀐 동작만 짧게 본다. 로그인한 Claude Code 연결이 필요하므로 프로필과 실제 HOME 사용 여부는 사람에게 먼저 묻는다(AGENTS.md 'Commands'의 격리 규칙).
  - 검증 (a) Claude Code 대화의 두 번째 턴 뒤 캔버스 대화 패널과 Overview에서 제안이 placeholder로 보이고, capsule에서 한 줄 말줄임으로 끝남. 첨부만 있는 draft의 box에서 긴 제안이 한 줄 말줄임으로 끝나고 빈 입력란에 스크롤이 생기지 않으며 높이가 바뀌지 않음. `turn.done`부터 제안이 보일 때까지의 지연을 기록함(스크린샷).
  - 검증 (b) 실제 키보드로 ArrowRight가 제안을 넣는다. 한국어 IME 조합 중 ArrowRight는 조합만 끝내거나 caret만 옮기고 제안을 넣지 않으며, 글자를 잃거나 두 번 넣지 않는다. 자동 입력으로 실제 키를 낼 수 없으면 사람에게 확인을 부탁하고, 하지 못한 것은 보고에 남긴다.
  - 검증 (c) (P1-b를 옮겨 옴) `turn.done`에서 바로 보낸 send와 50 ms마다 다시 보낸 send, 큐 전송이 `busy`가 되지 않고, 지연 시간을 기록한다. 제안을 기다리는 프로세스가 group stop으로 끝나고 다음 턴이 같은 세션을 잇는지 본다.
  - 검증 (d) VoiceOver로 빈 입력란에 들어가면 제안과 안내가 읽힌다. 못 했으면 보고에 남긴다.
  - 검증 (e) Codex 대화와 ACP 대화의 placeholder가 지금과 같다.
  - 증거는 `.scratch/runtime-test/prompt-suggestion/`에 둔다.

## Z. 승격과 정리

- [ ] Z1. PRODUCT §5 item 3 'Project Overview'(캔버스 패널은 그 규칙을 따른다)에 다음 입력 제안 규칙을 영어로 쓴다: Claude Code만, 보이는 조건과 우선순위(첨부만 있는 draft 포함), ArrowRight, 보내지 않음, 사라지는 때(연결 sign-out·교체 포함), 기록하지 않음, 접근성, 끄는 방법(login shell의 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false` 하나. Doan이 기본값 true를 주므로 저장소 `.claude/settings*.json`의 `promptSuggestionEnabled: false`는 막지 못함, design 결정 2). PRODUCT §3 'Launch environment'와 ARCHITECTURE의 launch environment 문단에 probe가 이 변수를 읽고 Doan이 기본값을 준다는 점을 쓴다. PRODUCT §3 Out of scope 4(또는 'Agent conversation foundation contract')에 "사람의 턴 끝에 provider CLI가 스스로 하는 제안 생성은 Doan이 시작하는 작업이 아니며, 사람의 계정으로 턴마다 요청 하나를 더한다"를 쓴다. ARCHITECTURE §7 'Agent conversation runtime and IPC'에 runner가 terminal 뒤 `prompt_suggestion`을 읽는 규칙, 메모리 보관과 summary 필드, 다음 send가 design 동작 main 6의 조건인 프로세스를 끝내는 이유(`EXIT_WAIT_MS` 예산, POSTMORTEM 2026-10-28)와 Codex 예측을 쓰지 않는 이유를 쓴다. ARCHITECTURE §7 'Agent usage' 'Turn-end reads'의 "the cap plus the CLI's exit after closing must stay inside `EXIT_WAIT_MS`" 문장을 새 규칙에 맞게 고친다. DESIGN.md 'Narrow placeholder'에 제안도 같은 규칙이고 box에서도 한 줄 말줄임임을 더한다. `docs/features/prompt-suggestion/`을 지운다.
  - 검증: `rg -n "prompt_suggestion|Right Arrow|PROMPT_SUGGESTION" docs/PRODUCT.md docs/ARCHITECTURE.md`와 `rg -n "suggestion" docs/DESIGN.md`가 새 규칙을 찾고, `docs/features/prompt-suggestion/`이 없다. 문서마다 커밋을 나눈다.
- [ ] Z2. `node .agents/skills/verify/scripts/verify.mjs`로 공유 gate를 돌린다.
  - 검증: 종료 코드 0.
