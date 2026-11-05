# prompt-suggestion — tasks

순서: PoC → 순수 함수 → main(I/O) → renderer(UI) → 실제 앱 확인 → 문서 승격. 선행 조건: provider-usage PR이 main에 병합된 뒤 `/ship`(또는 작으면 한 batch)으로 간다. queue-steer-shortcut(composer 키)·context-window-ring(턴 끝 runner)과 같은 코드를 고치므로 그 둘과 나란히 돌리지 않는다(design '다른 feature와 겹치는 곳'). 결정은 design '결정'에 있고, `/design-draft`는 생략한다(결정 10).

## P. PoC

- [ ] P1. design 'PoC 의존' P1-a–e를 `.scratch/prompt-suggestion/`의 일회용 probe로 확인한다. Doan의 Claude runner와 같은 조건(턴마다 새 Query, resume, `includePartialMessages`, Doan 프로필의 `CLAUDE_CONFIG_DIR`, done 뒤 사용량 조회 뒤 입력 닫기)에 `promptSuggestions: true`만 더한다. 실제 계정으로 모델을 부른다. 프로필은 design 결정 12대로 새로 sign-in한 공용 프로필(실제 HOME, `/Users/sinhyeokkang/code/doan-design/.scratch/` 아래 userData, main checkout의 Electron)이고, sign-in과 실행 승인은 그때 사람에게 받는다.
  - 검증: command undecided — needs user confirmation(`.scratch/prompt-suggestion/` probe의 실행 명령은 AGENTS.md 'Commands'에 없다). 결과로 다음을 적는다: (a) 턴 1·턴 2(resume)·도구 턴·짧은 턴에서 제안이 왔는지, (b) `result`→제안, `result`→group 소멸 시간(켜기·끄기), `turn.done`에서 바로 보낸 send의 `busy` 여부, (c) interrupt와 group stop 각각의 종료 시간·다음 resume·SessionEnd hook, (d) 세션 JSONL과 registry 변화, (e) plan mode와 한도 상태. 관측값(통과·실패, 시간, 날짜, CLI 버전)은 이 feature 문서와 커밋 메시지에 남긴다. 하나라도 design과 다르면 멈추고 design을 고친다.

**커밋 경계 0** (P1의 관측을 이 문서에 반영하는 docs 커밋)

## A. 순수 함수

- [ ] A1. main `promptSuggestionText`(design '순수 함수' 1)와 `conversationSummary`의 `suggestion` 규칙(2)을 `/tdd`로 먼저 테스트하고 구현한다.
  - 검증: `npm --prefix app test`에서 새 사례가 구현 전 red, 구현 뒤 green. 사례: 모양이 다른 frame·빈 글·공백만·줄바꿈 접기·제어 문자·1,000 code unit 경계(결정 11), summary는 current·ended·not working·queued 0·`returnedDraft` 없음일 때만 `suggestion`이 있고 archived·running·waiting·working·queued·returnedDraft에서는 없음. 기존 `summary.test.ts` 사례도 green.
- [ ] A2. renderer `composerPlaceholder`(3)와 `takesSuggestion`(4)을 `/tdd`로 먼저 테스트하고 구현한다.
  - 검증: `npm --prefix app test`에서 새 사례가 red 뒤 green. `composerPlaceholder`: 읽기 전용 > preset 문구 > 제안 > 기본 문구의 순서, 새 대화 mode에서는 제안 없음, 두 host의 지금 문구가 그대로 나옴. `takesSuggestion`: 수정키 없는 ArrowRight만 참, Shift·Option·Command·Control·`isComposing`·`keyCode 229`·제안 없음·빈 입력란 아님에서 거짓. `isSubmitKey`의 기존 사례도 green.

**커밋 경계 1** (테스트와 구현을 `/ship` 규칙대로 나눈다)

## B. main

- [ ] B1. `openClaude`에 `promptSuggestions: true`(모든 Claude 실행, 결정 2)를 두고, terminal이 done인 turn 뒤의 `prompt_suggestion`을 `promptSuggestionText`로 걸러 runner 입력의 `suggested`로 넘긴다. P1-c가 고른 방법으로, 제안을 기다리는 프로세스를 끝낼 수 있게 한다(design 동작 main 1·2·6).
  - 검증: `npm --prefix app test`에서 `runners.test.ts`의 새 사례가 green: done 뒤 제안 한 번 전달, failed·interrupted·steer가 남은 turn·terminal 전 frame·두 번째 제안은 무시, 사용량 조회가 있을 때도 순서와 상한(`TURN_USAGE_MS`)이 그대로.
- [ ] B2. service가 send마다 `suggested`를 `live`·`turnId`에 묶어 만들고, 대화별 메모리 map에 두고, 다음 턴 수락·archive·restore·delete에서 지우고, 목록 변경을 알린다. `previousExit`가 제안을 기다리는 이전 Claude 프로세스를 만나면 그 생성을 끝낸 뒤 기다린다(design 동작 main 3–6).
  - 검증: `npm --prefix app test`에서 `service.test.ts`의 새 사례가 green: 다음 send가 시작된 뒤 온 제안은 버림, 다른 `live`의 제안은 버림, 다음 턴 수락과 archive·delete에서 사라짐, 이전 프로세스의 exit callback보다 먼저 보낸 send가 `busy` 없이 진행되고 제안을 기다리던 프로세스는 끝내라는 요청을 받음, 제안을 기다리지 않는 프로세스는 지금처럼 기다림(POSTMORTEM 2026-10-28). `npm --prefix app run typecheck` 통과.

**커밋 경계 2**

## C. renderer

- [ ] C1. `chipField.ts`에 undo 단계를 남기는 글 넣기를, `ComposerFieldHandle`에 `insertText`를 더한다. 두 host의 placeholder 식을 `composerPlaceholder`로 바꾸고 summary의 `suggestion`을 넘긴다. `DockedComposer`의 `onKey`에서 `takesSuggestion`이면 `insertText`를 부른다. 접근성 설명과 도착 알림을 더한다(design 동작 renderer 1–5, 결정 6·7).
  - 검증: `npm --prefix app test`에서 `DockedComposer` 테스트의 새 사례가 실제 `ComposerField` keydown으로 green: (a) 제안이 placeholder(`aria-placeholder`)로 보임, (b) 빈 입력란의 ArrowRight가 제안을 넣고 caret이 끝, 포커스는 입력란, 보내지 않음, (c) ⌘Z 한 번에 빈 입력란과 제안 placeholder로 돌아감, (d) 글이 있으면 ArrowRight가 넣지 않음, (e) preset 문구가 보일 때·읽기 전용일 때·조합 중일 때 넣지 않음, (f) Enter·Shift+Enter·`/` 목록·Backspace chip 지우기가 그대로, (g) 입력란 설명에 "Press Right Arrow to use the suggestion."이 있음, (h) 입력란에 포커스가 있을 때만 도착을 한 번 알림, (i) 오래된 목록 읽기가 지워진 제안을 되살리지 않음. `npm --prefix app run typecheck`와 `npm --prefix app run build` 통과.

**커밋 경계 3**

## E. 실제 앱 확인

- [ ] E1. `/runtime-test`로 격리한 실제 앱에서 바뀐 동작만 짧게 본다. 로그인한 Claude Code 연결이 필요하므로 프로필과 실제 HOME 사용 여부는 사람에게 먼저 묻는다(AGENTS.md 'Commands'의 격리 규칙).
  - 검증 (a) Claude Code 대화의 두 번째 턴 뒤 캔버스 대화 패널과 Overview에서 제안이 placeholder로 보이고, capsule에서 한 줄 말줄임으로 끝남(스크린샷).
  - 검증 (b) 실제 키보드로 ArrowRight가 제안을 넣는다. 한국어 IME 조합 중 ArrowRight는 조합만 끝내거나 caret만 옮기고 제안을 넣지 않으며, 글자를 잃거나 두 번 넣지 않는다. 자동 입력으로 실제 키를 낼 수 없으면 사람에게 확인을 부탁하고, 하지 못한 것은 보고에 남긴다.
  - 검증 (c) `turn.done`에서 바로 보낸 send와 큐 전송이 `busy`가 되지 않고, 지연 시간을 기록한다.
  - 검증 (d) VoiceOver로 빈 입력란에 들어가면 제안과 안내가 읽힌다. 못 했으면 보고에 남긴다.
  - 검증 (e) Codex 대화와 ACP 대화의 placeholder가 지금과 같다.
  - 증거는 `.scratch/runtime-test/prompt-suggestion/`에 둔다.

## Z. 승격과 정리

- [ ] Z1. PRODUCT §5 item 3 'Project Overview'(캔버스 패널은 그 규칙을 따른다)에 다음 입력 제안 규칙을 영어로 쓴다: Claude Code만, 보이는 조건과 우선순위, ArrowRight, 보내지 않음, 사라지는 때, 기록하지 않음, 접근성. ARCHITECTURE §7 'Agent conversation runtime and IPC'에 runner가 terminal 뒤 `prompt_suggestion`을 읽는 규칙, 메모리 보관과 summary 필드, 다음 send가 제안을 기다리는 프로세스를 끝내는 이유(`EXIT_WAIT_MS` 예산, POSTMORTEM 2026-10-28)와 Codex 예측을 쓰지 않는 이유를 쓴다. DESIGN.md 'Narrow placeholder'에 제안도 같은 규칙임을 더한다. `docs/features/prompt-suggestion/`을 지운다.
  - 검증: `rg -n "prompt_suggestion|Right Arrow" docs/PRODUCT.md docs/ARCHITECTURE.md`가 새 규칙을 찾고, `docs/features/prompt-suggestion/`이 없다. 문서마다 커밋을 나눈다.
- [ ] Z2. `node .agents/skills/verify/scripts/verify.mjs`로 공유 gate를 돌린다.
  - 검증: 종료 코드 0.
