# prompt-suggestion — design

Claude Code가 턴 끝에 보내는 `prompt_suggestion`을 main이 받아 대화마다 메모리에 두고, 대화 목록 summary로 renderer에 준다. renderer는 그 글을 docked composer의 placeholder로 보이고, 빈 입력란의 오른쪽 방향키로 입력란에 넣는다. 사람이 정한 점은 바로 아래 '결정'에 있고, 본문은 그 번호로 가리킨다.

## 결정

1. **provider 범위**: Claude Code만 다음 입력 제안을 보인다. Codex·Cursor·Antigravity·GitHub Copilot 대화는 지금 placeholder 그대로다. Codex 실험 API(`experimentalPredictionMode`, `thread/prediction/updated`)와 Doan이 직접 모델에 요청하는 방식은 쓰지 않는다. 둘 다 Doan이 모델 작업을 시작하고(PRODUCT §3 Out of scope 4), Codex 쪽은 세션 fork까지 필요하기 때문이다(사람).
2. **켜는 범위**: 모든 Claude 대화(Doan 연결과 터미널 세션 resume)에서 늘 켠다. 끄는 것은 provider의 설정(Doan 연결은 Doan 프로필과 저장소 settings, 터미널 세션은 사람의 프로필)과 환경 변수에 맡기고, Doan에는 설정을 두지 않는다. CLI가 사람의 계정으로 짧은 요청을 하나 더 하는 것을 받아들였다. SDK는 이 요청이 prompt cache에 얹혀 거의 들지 않는다고 한다(사람).
3. **보관 위치**: main 메모리에만 둔다. 창 reload와 대화 전환에는 남고, 앱을 다시 시작하면 사라진다. 대화 event로 저장하지 않는다. event 검증이 모르는 type을 거부하므로, 저장하면 이전 build가 그 대화 전체를 읽지 못한다(사람).
4. **다시 보이는 때**: 다음 턴이 수락될 때까지 남는다. 입력란을 비우면(오른쪽 방향키로 넣었다가 지운 경우도) 다시 보인다(사람).
5. **제안을 기다리는 중의 다음 send**: 그 제안은 버리고, 이전 프로세스의 생성을 끝낸다. 끝내는 방법은 P1-c가 고른다. send는 지금보다 늦어지지 않는다(POSTMORTEM 2026-10-28)(사람).
6. **모양**: 제안 글만 지금 placeholder 자리에 같은 색과 크기로 보인다. "→" 키 표시나 안내 줄은 두지 않고, 키 안내는 접근성 설명이 맡는다(사람).
7. **스크린 리더**: 그 composer의 입력란에 포커스가 있고 비어 있을 때 도착을 한 번 알린다("Suggested reply: …"). 입력란 설명에는 제안이 보이는 동안 "Press Right Arrow to use the suggestion."이 있다(사람).
8. **Enter와 Tab**: 바뀌지 않는다. 빈 입력란의 Enter는 지금처럼 아무것도 보내지 않고, Tab은 포커스를 옮긴다. 제안은 스스로 보내지지 않는다(PRODUCT §5 item 1 "never sends by itself"와 같다)(사람).
9. **큐와 돌려받은 draft**: 큐에 메시지가 있거나 돌려받은 draft가 있으면 제안을 보이지 않는다(사람).
10. **UI 초안**: `/design-draft`는 생략한다. 결정 6으로 새 화면 요소가 없다(사람).
11. **제안 글 정리**: 줄바꿈과 연속 공백을 한 줄로 접고, 1,000 code unit을 넘으면 버린다. 자르지 않는다. 잘린 글을 넣으면 원래 제안과 다른 말이 된다(사람).
12. **PoC 프로필**: P1은 새로 sign-in한 공용 프로필에서 돌린다. 실제 HOME을 쓰고, Doan userData는 `/Users/sinhyeokkang/code/doan-design/.scratch/` 아래에 두며, main checkout(`/Users/sinhyeokkang/code/doan-design`)의 Electron으로 띄운다. `doan Safe Storage` Keychain 항목의 ACL이 그 경로의 Electron만 믿기 때문이다(`docs/features/provider-usage/orch.md` E2 기록). provider-usage의 이전 공용 프로필은 정리 중이라 쓰지 않는다. sign-in과 실행 승인은 그때 사람에게 받는다(사람).

## 조사 결과(2026-11-05, 코드와 설치된 바이너리를 읽기만 했다)

앱, provider, 모델 호출은 하나도 실행하지 않았다.

### Claude Code

- **SDK 계약.** `app/node_modules/@anthropic-ai/claude-agent-sdk`(0.3.312, `claudeCodeVersion` 2.1.312)의 `sdk.d.ts` 2109–2124행 `promptSuggestions?: boolean`: 켜면 턴마다 최대 하나의 `prompt_suggestion`이 `result` 뒤에 온다. 받으려면 `result` 뒤에도 stream을 계속 읽어야 한다. 첫 턴, API 오류 뒤, plan mode, `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false`, settings의 `promptSuggestionEnabled: false`에서는 오지 않고, plan 사용량 한도 근처와 한도에서도 오지 않는다(근처는 환경 변수 `true`로 켤 수 있다). 메시지 모양은 5896–5902행 `SDKPromptSuggestionMessage { type: "prompt_suggestion"; suggestion: string; uuid; session_id }`. SDK는 이 옵션을 `initialize` control request로 보낸다(`sdk.mjs`, `promptSuggestions:this.initConfig?.promptSuggestions`).
- **설치된 CLI(2.1.318, `~/.local/share/claude/versions/2.1.318`)의 동작.** minify된 코드를 읽은 추정이다. 이름은 바뀔 수 있다.
  - 턴이 끝나면 `afterTurn`이 `afterResult`를 불러 제안 생성을 시작한다. 이미 종료 중(`shuttingDown()`)이면 시작하지 않는다.
  - 생성 전에 거르는 이유: `early_conversation`(대화의 assistant 메시지가 2개 미만), `last_response_error`, `cache_cold`, `plan_mode`, `rate_limit`(상태가 `allowed`가 아님), `usage_credits`, `elicitation_active`. "첫 턴"은 턴 수가 아니라 history의 assistant 메시지 수로 판단하는 것으로 보인다. resume한 프로세스가 이전 history를 세는지는 확인하지 않았다(P1).
  - 입력이 닫히면(`onInputClosed`) 종료 처리가 진행 중인 제안을 기다린다(`gr.settle()` → `settleInflight`, 상한 `dq=30000`, 30초). 그 뒤 다른 종료 처리를 하고 끝난다. 그러므로 Doan이 `result` 직후 입력을 닫아도 생성이 이미 시작되었다면 제안은 프로세스가 끝나기 전에 stream으로 올 가능성이 크다. 대신 프로세스 종료가 생성 시간만큼 늦어진다.
  - interrupt 처리(`Cp`)와 `end_session`은 `gr.discard()`로 진행 중인 제안을 버린다.
  - 생성은 도구 없이 짧은 side query로 한다("No tools needed for suggestion"). 제안을 다음 입력과 비교하는 일(`onCommand`)은 같은 프로세스 안에서만 일어난다.
- **Doan의 runner.** `runners.ts` `openClaude`는 턴마다 SDK/CLI를 새로 연다(resume). 턴이 terminal이 되면 done 턴에 한해 사용량을 읽고(`TURN_USAGE_MS` 3초 상한, 57행), 곧바로 입력을 닫는다(`closeInput()`, 362행). 그 뒤에도 `for await (const raw of q)`는 stream이 끝날 때까지 돈다. 다만 `normalizeClaude`(`transport.ts` 122행)는 terminal 뒤의 frame을 버린다.
- **Doan의 service.** `receive`(`service.ts` 401–404행)는 `live.terminal`이 된 뒤의 event를 버린다. 다음 send는 이전 프로세스의 reservation이 풀릴 때까지 `EXIT_WAIT_MS`(10초, 88행)만큼 기다리고, 넘으면 `busy`로 거절한다(`previousExit`, `exitOf`). 지금 예산은 사용량 조회 3초 + 가장 느린 관측 종료 5.0초 < 10초다(`runners.ts` 54–57행 주석, provider-usage orch 'B' 진행 기록). 제안을 켜면 CLI의 종료가 생성 시간(상한 30초)만큼 더 늦어질 수 있어 이 예산을 넘을 수 있다.
- **설정의 출처.** Doan 연결의 Claude 실행은 Doan 프로필(`CLAUDE_CONFIG_DIR`)의 user settings와 project·local settings를 읽는다(`settingSources: ["user", "project", "local"]`). 사람이 터미널에서 쓰는 `~/.claude/settings.json`의 `promptSuggestionEnabled`는 Doan 연결에 닿지 않는다. 저장소의 `.claude/settings*.json`과 login shell의 환경 변수는 닿는다(PRODUCT §3 'Launch environment').

### Codex

- Codex 0.166.0이 만든 app-server 스키마(`/Users/sinhyeokkang/code/doan-design/.scratch/provider-usage/research/codex-schema/`)에는 다음 입력 제안용 일반 알림이 없다. `suggest`가 들어간 이름은 plugin 설치 제안(`installSuggestionPluginNames`)뿐이다.
- 대신 `ServerNotification`에 `thread/prediction/updated { threadId, sourceTurnId, result: { type: "completed", text?: string | null } | { type: "failed" } }`가 있다. 같은 버전 바이너리의 문자열을 보면, 이 예측은 `thread/fork`(또는 숨은 `ThreadPredictionRequest`)에 `experimentalPredictionMode: true`를 주어 시작하고, "`experimentalPredictionMode` requires `ephemeral: true`", "cannot be combined with configuration overrides"라는 조건이 붙는다. client가 예측용 ephemeral fork를 열어 모델 작업을 직접 시작해야 하는 것으로 보인다. 무엇을 예측하는지도 스키마에 설명이 없다.
- 그래서 쓰지 않는다. Doan이 모델 작업을 시작하는 일(PRODUCT §3 Out of scope 4)이고, Doan은 세션을 fork하지 않는다(PRODUCT §3 'Resume and permissions', 'Events and ownership').

### ACP(Cursor·Antigravity·GitHub Copilot)

- `app/node_modules`에 ACP SDK나 스키마가 없다. Doan은 `acp.ts`에서 `session/update`를 직접 읽고(`agent_message_chunk` 등), 제안에 해당하는 종류는 없다. ACP 명세 자체에 제안 메시지가 없는지는 이 저장소의 자료로 확인하지 못했다.

### 거절한 방식: Doan이 직접 제안을 만든다

턴이 끝난 뒤 Doan이 따로 모델에 요청해 다음 입력을 만들면 모든 provider에서 보일 수 있다. 그러나 사람의 메시지 없이 Doan이 모델 작업을 시작하는 일이고(PRODUCT §3 Out of scope 4), 사람의 계정으로 Doan이 요청을 보내는 새 경로가 생긴다. 설계하지 않는다.

## 지금 코드(2026-11-05 확인)

- **placeholder.** 두 host가 같은 식을 따로 가진다: preset이 있고 글이 없으면 `presetPlaceholder(preset)`, 아니면 새 대화 문구나 `REPLY_PLACEHOLDER`(`ProjectOverview.tsx` 308행, `CanvasConversationPanel.tsx` 392행). `DockedComposer`가 `ComposerField`에 넘기고, `ComposerField`는 `aria-placeholder`로 둔다(`ComposerParts.tsx` 149행). 보이는 글은 CSS가 그린다: `.composer-input[data-empty]::before { content: attr(aria-placeholder) }`(`styles.css` 567행), capsule에서는 한 줄 말줄임(680행). `data-empty`는 입력란에 글과 chip이 하나도 없을 때 `ChipField`가 단다(`chipField.ts` 503행).
- **키.** `ComposerField`의 `onKeyDown`은 host의 `onKey`를 먼저 부르고, 처리되지 않았으면 `isSubmitKey`(`homeComposer.ts` 451행)로 보낸다. docked의 `onKey`는 `/` 목록과 Backspace의 chip 지우기만 맡는다(`DockedComposer.tsx` 327–338행). `ChipField`는 자기 keydown에서 IME 조합 중인 키를 건드리지 않고, ←/→는 chip 옆에서만 직접 옮긴다(`chipField.ts` 228–254행). 빈 입력란에서는 아무것도 하지 않는다.
- **글 넣기와 되돌리기.** `ChipField.replace(start, end, segments, kind)`가 undo history에 단계를 남긴다(붙여넣기가 이 길을 쓴다, 448–459행). host가 `value`를 바꾸는 `setValue`는 draft가 바뀔 때만 history를 끊는다.
- **summary.** `ConversationSummary`(`summary.ts`)는 대화 목록의 한 행이고, 두 host가 보이는 대화의 행에서 provider, model, phase, working, queued, `returnedDraft`를 읽는다. 바뀌면 main이 `conversation:listChanged`로 알린다.
- **event 저장.** `store.ts`의 `event()`·`payload()`는 모르는 event type을 받지 않고, `parse`는 그런 줄이 하나라도 있으면 대화 전체를 읽지 못한다(116–119행, 378–386행). 오래된 build가 새 type이 든 history를 열면 그 대화가 read error가 된다.

## 영향받는 구성 요소

- **app(main)**: `conversation/runners.ts`(`openClaude`: 옵션, terminal 뒤의 `prompt_suggestion` 읽기), `conversation/transport.ts` 또는 새 `conversation/promptSuggestion.ts`(순수 함수), `conversation/service.ts`(대화마다 제안 보관, 지우기, 다음 send와의 관계), `conversation/summary.ts`(`suggestion` 필드).
- **app(renderer)**: `dockedRules.ts`(placeholder 계산), `homeComposer.ts`(키 판정), `ComposerParts.tsx`(`ComposerFieldHandle.insertText`, 접근성 설명), `chipField.ts`(history를 남기는 글 넣기), `DockedComposer.tsx`(키 연결), `ProjectOverview.tsx`·`CanvasConversationPanel.tsx`(summary의 제안을 넘김).
- **CLI(Go)·skills·shared formats**: 바뀌지 않는다.

## 동작

### main

1. **옵션.** `openClaude`의 `query` 옵션에 `promptSuggestions: true`를 둔다. 모든 Claude 실행에서 켜고, 끄는 것은 provider의 설정과 환경 변수에 맡긴다(결정 2).
2. **읽기.** runner의 stream loop가 terminal 뒤에도 frame을 본다(지금도 돈다). 이 turn의 terminal event가 `turn.done`이고 읽지 않은 steer가 없을 때, `prompt_suggestion` frame을 순수 함수 `promptSuggestionText`(아래)로 걸러 글이 남으면 runner 입력의 새 hook `suggested(text)`를 한 번 부른다. failed·interrupted 턴, terminal 전의 frame, 두 번째 제안은 무시한다.
3. **보관.** service는 send마다 `suggested`를 `planApproved`처럼 그 send의 `live`와 `turnId`에 묶어 만든다. 부를 때 다시 확인한다: 같은 `live`이고 같은 `turnId`이며, 그 turn이 done으로 끝났고, 새 send가 시작되지 않았다. 맞으면 대화 id별 메모리 map에 두고 목록 변경을 알린다. 늦게 온 callback이 다음 턴을 건드리지 않게 하는 울타리다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn').
4. **지우기.** 같은 대화의 다음 턴이 수락될 때, archive·restore·delete 때 map에서 지운다. 앱을 다시 시작하면 메모리와 함께 사라진다(결정 3·4).
5. **summary.** `conversationSummary`가 `suggestion?: string`을 준다. 대화가 current이고, phase가 `ended`이며, working이 아니고, `queued`가 0이고, `returnedDraft`가 없을 때만 준다(결정 9). preparing 중인 send는 working이므로, 입력란이 막 비어도 이전 제안이 다시 보이지 않는다. 그 send가 거절되면 working이 풀려 제안이 다시 보인다(이때 입력란에는 거절된 draft가 돌아와 있다).
6. **다음 send와의 관계.** 제안을 기다리느라 이전 Claude 프로세스가 아직 끝나지 않았을 때 같은 대화의 send(사람의 send, 큐 전송, restore 포함)가 `previousExit`에서 기다리기 시작하면, 그 제안은 버리고 이전 프로세스의 생성을 끝낸다(결정 5). 끝내는 방법은 P1이 정한다: 열린 Query의 interrupt가 `gr.discard()`로 생성만 버리고 정상 종료로 이어지면 그것을 쓰고, 아니면 이미 있는 group stop(SIGTERM, 0.5초 뒤 SIGKILL, `process.ts`)을 쓴다. 제안을 기다리지 않는 프로세스는 지금처럼 스스로 끝나기를 기다린다. 그러면 send가 기다리는 시간은 지금 예산(`EXIT_WAIT_MS` 10초) 안에 머문다. runner가 "제안을 기다리는 중"을 service에 알리는 방법은 `/tdd`에서 정한다.
7. **사용량 조회와의 순서.** provider-usage의 턴 끝 조회(`usageAtTurnEnd`)는 지금처럼 입력을 닫기 전에 한다. CLI는 같은 시각에 제안을 만들기 시작하므로 두 일은 겹친다. 이 feature는 조회 상한(`TURN_USAGE_MS`)을 바꾸지 않는다.

### renderer

1. **placeholder.** 두 host의 식을 순수 함수 `composerPlaceholder`(아래) 하나로 바꾼다. 우선순위: 읽기 전용이면 지금 문구, preset이 있고 글이 없으면 preset 문구, 보이는 대화의 summary에 `suggestion`이 있으면 그 글, 아니면 지금 문구. 함수는 보이는 글과 함께 "지금 제안을 보이는가"를 돌려주고, `DockedComposer`는 그 값만 보고 키를 받는다. 보이는 글과 키 판정이 따로 놀지 않는다.
2. **모양.** 지금 placeholder 그대로 그린다(결정 6)(같은 `::before`, `--text-metadata`, capsule 한 줄 말줄임). 새 색이나 token을 만들지 않는다. box 모양에서도 placeholder는 `position: absolute`라 입력란 높이를 바꾸지 않으므로, 두 줄(입력란 최소 높이)을 넘는 부분은 잘린다. 잘린 글 전체는 `aria-placeholder`에 있고 오른쪽 방향키로 넣으면 보인다(harden preset: "show the full value somewhere reachable when it is cut").
3. **키.** `DockedComposer`의 `onKey`에서 `takesSuggestion`(아래)이 참이면 기본 동작을 막고 `field.insertText(suggestion)`을 부른다. `insertText`는 `ChipField.replace`로 넣어 undo 단계를 하나 남기고 caret을 끝에 둔다. 그 뒤 `onChange`가 draft를 바꾸고, 글이 한 줄을 넘으면 지금 규칙대로 box 모양이 된다. 제안은 map에서 지우지 않으므로, 넣은 글을 다 지우면 제안이 placeholder로 다시 보인다(결정 4).
4. **접근성.** 제안이 보이는 동안 `aria-placeholder`는 제안 전체다. 입력란의 `aria-describedby`에 숨은 설명 "Press Right Arrow to use the suggestion."을 더한다(지금 이유 줄 id와 함께). 도착 알림은 결정 7대로, 그 composer의 입력란에 포커스가 있고 비어 있을 때 한 번만 기존 sr-only status(`DockedComposer.tsx` 395행)에 "Suggested reply: <제안>"을 둔다. 오른쪽 방향키로 넣은 뒤에는 알리지 않는다. 포커스가 입력란에 있으므로 넣은 글은 그대로 읽힌다.
5. **목록 읽기 순서.** summary의 제안은 host가 이미 쓰는 최신 목록 읽기에서만 가져온다. 늦게 온 이전 목록이 지워진 제안을 되살리지 않는다(POSTMORTEM 2026-11-05 'A Send now row refused back into the queue could vanish').

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. `promptSuggestionText(raw: unknown): string | null` — main. `type === "prompt_suggestion"`이고 `suggestion`이 문자열인 객체만 받는다. 줄바꿈과 연속 공백을 공백 하나로 접고, 앞뒤 공백을 지우고, 제어 문자를 지운다. 빈 글, 1,000 code unit을 넘는 글은 `null`이다(결정 11).
2. `conversationSummary`의 `suggestion` 규칙 — 이미 있는 순수 함수에 입력 하나를 더한다. current·ended·not working·queued 0·`returnedDraft` 없음일 때만 준다.
3. `composerPlaceholder(input): { text: string; suggestion: string | null }` — renderer `dockedRules.ts`. 입력은 읽기 전용 여부, preset, 입력란이 비었는지, 대화 mode(new·existing·archived), host의 기본 문구, summary의 제안.
4. `takesSuggestion(event, state): boolean` — renderer `homeComposer.ts`, `isSubmitKey` 옆. `key === "ArrowRight"`이고 Shift·Option·Command·Control이 없으며, `isComposing`이 아니고 `keyCode !== 229`이고, 제안이 보이는 중이며(`composerPlaceholder`의 `suggestion`), 입력란이 비고 조합 중이 아닐 때만 참.

service의 보관·지우기 울타리(동작 main 3·4·6)는 순수 함수가 아니므로 `service.test.ts`에서 가짜 runner로 확인한다. 특히 다음 send를 이전 프로세스의 exit callback보다 먼저 보내는 사례를 넣는다(POSTMORTEM 2026-10-28). 키 연결은 실제 `ComposerField` keydown으로 `DockedComposer` 테스트에서 확인한다(POSTMORTEM 2026-10-27 'typeahead').

## 형식 변경

- JSON Schema(`schema/`)와 format 버전 `v`는 바뀌지 않는다. 대화 event JSONL v1도 바뀌지 않는다. 제안은 저장하지 않는다(결정 3).
- IPC 모양: `ConversationSummary`에 선택 필드 `suggestion?: string`이 생긴다(`conversation:list` 답, TypeScript 타입만). 필드를 모르는 쪽은 무시한다.
- runner 입력(`Prepared`)에 선택 hook `suggested?: (text: string) => void`가 생긴다. main 안의 타입이다.

## 규약 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **append-only event, 턴마다 terminal event 하나**: 지켜진다. 제안은 event로 쓰지 않고, terminal 뒤 event를 버리는 `receive` 규칙도 그대로다.
- **Doan은 세션을 fork하거나 새로 시작하지 않는다**: Claude 쪽 생성은 CLI 안의 side query이고, Doan은 옵션만 켠다. 이 생성이 transcript나 session registry를 바꾸지 않는지는 P1에서 본다. Codex 예측은 fork가 필요하므로 쓰지 않는다.
- **Out of scope 4(Doan이 agent 작업을 시작하지 않는다)**: Doan은 새 요청을 보내지 않는다. 제안은 사람의 턴 끝에 provider CLI가 만든다. 사람의 계정으로 모델 요청이 하나 더 생기는 점은 사람이 받아들였다(결정 2).
- **Launch environment**: `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION`은 다른 환경 변수처럼 login shell 설정에서만 온다. Doan이 따로 정하지 않는다.
- **종료 예산(`EXIT_WAIT_MS`)과 사용량 조회 상한(`TURN_USAGE_MS`)**: 값은 바뀌지 않는다. 동작 main 6이 예산을 지킨다.

## PoC 의존

아래는 확인하지 않은 가정이다. tasks P1이 구현보다 먼저, 결정 12의 프로필에서 확인한다. 하나라도 어긋나면 멈추고 design으로 돌아간다.

- **P1-a 도착.** Doan의 턴마다 여는 구조(resume, done 뒤 사용량 조회 ≤3초, 그다음 입력 닫기)에서 `prompt_suggestion`이 `result` 뒤에 stream으로 오는가. 새 세션의 첫 턴과 resume한 두 번째 턴 각각에서, 도구를 쓴 턴과 짧은 답만 한 턴 각각에서 본다(`early_conversation`이 resume history를 세는지).
- **P1-b 시간.** `result` → 제안, `result` → 프로세스 그룹 소멸까지의 시간을 제안을 켰을 때와 껐을 때 비교한다. `turn.done`에서 바로 다음 send를 보내고 50 ms마다 다시 보내 `busy`가 나는지 본다(POSTMORTEM 2026-10-28의 방법).
- **P1-c 끝내기.** 제안을 기다리는 프로세스에 interrupt를 보낼 때와 group stop을 할 때, 프로세스가 끝나는 시간, 다음 턴의 resume이 같은 transcript를 잇는지, 사람의 SessionEnd hook이 도는지 본다. 동작 main 6의 방법을 여기서 고른다.
- **P1-d transcript.** 제안 생성이 세션 JSONL에 턴을 더하거나 session registry를 바꾸지 않는지 본다.
- **P1-e 거르는 조건.** plan mode에서 오지 않는지, 그리고 그때 계정의 한도 상태(`rate_limit_event`의 status)를 기록한다. provider-usage E1에서 Claude 사용량이 99%였으므로, 한도 근처라 오지 않는 경우와 구조 때문에 오지 않는 경우를 나눠 적는다.

실제 키 입력(오른쪽 방향키, 한국어 IME 조합 중의 오른쪽 방향키)과 스크린 리더 읽기는 E1(`/runtime-test`)에서 본다. 합성 event는 실제 입력을 증명하지 못한다(POSTMORTEM 2026-10-27 'typeahead': "Preserve separate native-focus/input verification").

## 다른 feature와 겹치는 곳

이 feature는 아래 두 진행 중 feature와 같은 코드를 고치므로 그 둘과 나란히 돌리지 않는다. 하나가 main에 병합된 뒤 다음을 시작한다.

- **provider-usage**(이 branch, 병합 전): 같은 runner 자리와 종료 예산을 쓴다. 선행 조건이다.
- **context-window-ring**(`docs/features/context-window-ring/`, 진행 중): 턴 끝 값을 같은 runner에서 읽는다. 둘 다 `result`와 프로세스 종료 사이에 일을 더하므로, 나중에 들어가는 쪽이 P1-b의 시간 측정을 다시 한다.
- **queue-steer-shortcut**(`docs/features/queue-steer-shortcut/`, 진행 중): `ComposerField`의 키 연결과 `DockedComposer`를 같이 고친다. 키는 겹치지 않는다(그쪽은 Control+Enter). 나중에 들어가는 쪽이 키 판정 순서를 맞춘다.

## POSTMORTEM에서 가져온 함정

- 2026-10-28 "A send right after turn.done was refused as busy until the previous process group was gone": "test sends issued before the previous process's exit callback, not after it … Real-app checks of consecutive turns must send on `turn.done` itself." 제안이 프로세스 종료를 늦추므로 이 위험이 커진다. 동작 main 6, P1-b, `service.test.ts` 사례로 막는다.
- 2026-10-27 "Awaited conversation work outlived its current turn": "fence transport rejection by live identity and turn ID." 늦게 온 제안을 `live`와 `turnId`로 거른다(동작 main 3).
- 2026-10-27 "Rewritten shell typeahead skipped repeated letters and the current prefix match": "reuse the established keyboard matcher and test its actual event-handler wiring rather than relying only on helper tests." `takesSuggestion`은 `isSubmitKey` 옆에 두고, 테스트는 실제 `ComposerField` keydown에서 한다.
- 2026-11-05 "A Send now row refused back into the queue could vanish while main still held it": 오래된 목록 읽기를 적용해 상태가 어긋났다. 제안도 목록 summary로 오므로 최신 읽기만 쓴다(동작 renderer 5).
- IME·placeholder를 직접 다룬 항목은 없다. IME는 PRODUCT §5 item 1의 규칙("Enter during an IME composition commits and sends, losing or doubling nothing")과 `ChipField`의 조합 처리를 따른다.

## design preset

`doan design-skill --json`으로 목록을 보고 두 개를 읽었다.

- `clarify`: "placeholders are examples, not labels." 입력란의 이름은 지금처럼 "Message"(`aria-label`)이고, 제안은 보낼 말의 예로만 보인다.
- `harden`: 긴 글은 줄바꿈·말줄임·자르기 중 하나를 정하고, 잘린 값 전체를 닿을 수 있는 곳에 둔다. capsule은 말줄임, box는 두 줄에서 잘림, 전체 글은 `aria-placeholder`와 오른쪽 방향키로 닿는다.
