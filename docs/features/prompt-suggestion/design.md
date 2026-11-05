# prompt-suggestion — design

Claude Code가 턴 끝에 보내는 `prompt_suggestion`을 main이 받아 대화마다 메모리에 두고, 대화 목록 summary로 renderer에 준다. renderer는 그 글을 docked composer의 placeholder로 보이고, 빈 입력란의 오른쪽 방향키로 입력란에 넣는다. 사람이 정한 점은 바로 아래 '결정'에 있고, 본문은 그 번호로 가리킨다.

## 결정

1. **provider 범위**: Claude Code만 다음 입력 제안을 보인다. Codex·Cursor·Antigravity·GitHub Copilot 대화는 지금 placeholder 그대로다. Codex 실험 API(`experimentalPredictionMode`, `thread/prediction/updated`)와 Doan이 직접 모델에 요청하는 방식은 쓰지 않는다. 둘 다 Doan이 모델 작업을 시작하고(PRODUCT §3 Out of scope 4), Codex 쪽은 세션 fork까지 필요하기 때문이다(사람).
2. **켜는 범위와 끄는 방법**: 모든 Claude 대화(Doan 연결과 터미널 세션 resume)에서 늘 켠다. Doan에는 설정을 두지 않는다. CLI는 계정의 한도 상태가 `allowed`가 아니면 제안을 만들지 않는다. P1에서 계정이 `allowed_warning`(seven_day 53%)이라 기본 설정으로는 16턴 중 한 번도 오지 않았다. 그래서 Doan이 Claude 실행 환경에 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=true`를 준다. 사람의 login shell이 이 변수를 정했으면 그 값을 넘기고 Doan은 덮어쓰지 않는다. 끄는 방법은 login shell의 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false` 하나다. 지금 login shell probe(`onboarding/machine.ts`)는 `PATH`·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`만 읽으므로 이 변수도 읽게 한다. 환경 변수가 true이면 저장소 `.claude/settings*.json`의 `promptSuggestionEnabled: false`는 제안을 막지 못한다(P1-f). Doan은 저장소 설정을 따로 읽지 않고, 이 점을 PRODUCT에 적는다. 한도 근처에서도 CLI가 사람의 계정으로 짧은 요청을 하나 더 하는 것을 받아들였다. SDK는 이 요청이 prompt cache에 얹혀 거의 들지 않는다고 한다(사람).
3. **보관 위치**: main 메모리에만 둔다. 창 reload와 대화 전환에는 남고, 앱을 다시 시작하면 사라진다. 대화 event로 저장하지 않는다. event 검증이 모르는 type을 거부하므로, 저장하면 이전 build가 그 대화 전체를 읽지 못한다(사람).
4. **다시 보이는 때**: 다음 턴이 수락될 때까지 남는다. 입력란을 비우면(오른쪽 방향키로 넣었다가 지운 경우도) 다시 보인다(사람).
5. **제안을 기다리는 중의 다음 send**: 그 제안은 버리고, 이전 프로세스의 생성을 끝낸다. 끝내는 방법은 group stop(SIGTERM, 0.5초 뒤 SIGKILL, `process.ts`)이다(P1-c). send는 지금보다 늦어지지 않는다(POSTMORTEM 2026-10-28)(사람).
6. **모양**: 제안 글만 지금 placeholder 자리에 같은 색과 크기로 보인다. "→" 키 표시나 안내 줄은 두지 않고, 키 안내는 접근성 설명이 맡는다. 제안이 보이는 동안 기본 문구 "Reply, / for presets"의 `/` 안내는 보이지 않는다. Presets 버튼은 그대로 있으므로 이를 받아들인다(사람).
7. **스크린 리더**: 같은 대화에 새 제안 글이 도착했을 때만, 그 composer의 입력란에 포커스가 있고 비어 있으면 한 번 알린다("Suggestion: …"). 창 reload, 대화 전환, 넣었다 지워서 다시 보이는 제안은 알리지 않고, 입력란 설명과 `aria-placeholder`가 전한다. 입력란 설명에는 제안이 보이는 동안 "Press Right Arrow to use the suggestion."이 있다(사람).
8. **Enter와 Tab**: 바뀌지 않는다. 빈 입력란의 Enter는 지금처럼 아무것도 보내지 않고, Tab은 포커스를 옮긴다. 제안은 스스로 보내지지 않는다(PRODUCT §5 item 1 "never sends by itself"와 같다)(사람).
9. **큐와 돌려받은 draft**: 큐에 메시지가 있거나 돌려받은 draft가 있으면 제안을 보이지 않는다(사람).
10. **UI 초안**: `/design-draft`는 생략한다. 결정 6으로 새 화면 요소가 없다(사람).
11. **제안 글 정리**: 줄바꿈과 연속 공백을 한 줄로 접고, 1,000 code unit을 넘으면 버린다. 자르지 않는다. 잘린 글을 넣으면 원래 제안과 다른 말이 된다(사람).
12. **PoC 환경**: P1-a·c·d·e는 앱 없이 `.scratch/prompt-suggestion/`의 node SDK script로 돌린다. 임시 `CLAUDE_CONFIG_DIR`에 새로 sign-in하고, `query` 옵션은 Doan의 `openClaude`와 같게 둔 뒤 `promptSuggestions: true`만 더한다. P1-b(busy 구간)는 지금 앱에 `promptSuggestions`가 없어 켠 상태를 잴 수 없으므로 E1(c)로 옮겼고, 시간은 P1 script로 쟀다(사람, P1 뒤). 앱은 새로 sign-in한 공용 프로필로 띄운다: 실제 HOME, `/Users/sinhyeok/code/doan-design/.scratch/` 아래 userData, main checkout(`/Users/sinhyeok/code/doan-design`)의 Electron. provider-usage E2에서 `doan Safe Storage` Keychain 항목의 ACL이 PoC checkout의 Electron 경로만 믿어 worktree의 Electron은 vault를 열지 못했기 때문이다(`git show eca2b7c7^:docs/features/provider-usage/orch.md`의 E2 진행 기록, POSTMORTEM 2026-10-30 'Packaged-app probes failed for reasons of their own: keychain, signature identity and focus'). 이 경로의 공용 프로필에는 chain-261105의 다섯 provider가 연결되어 있다. sign-in, 실행 승인, 끝난 뒤의 sign-out과 Keychain 항목 정리는 그때 사람에게 묻는다(사람).

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
- **Doan의 runner.** `runners.ts` `openClaude`는 턴마다 SDK/CLI를 새로 연다(resume). 턴이 terminal이 되면 done 턴에 한해 `usageAtTurnEnd`를 부르고, 곧바로 입력을 닫는다(`closeInput()`). 사용량 조회는 일정이 허락할 때만 하고(`usageService.ts` `turnEnd`), 읽을 때만 `TURN_USAGE_MS`(3초 상한)까지 입력이 열려 있다. 터미널 세션을 resume한 legacy external 실행에는 `usageAtTurnEnd`가 없다. P1-a에서 세 경우(조회 뒤 닫기, `result` 직후 닫기, legacy) 모두 입력을 닫은 뒤 프로세스가 끝나기 전에 제안이 왔다. 입력을 15초 열어 두면 제안은 입력을 닫은 순간에야 왔으므로, 입력을 바로 닫는 지금 구조가 제안을 늦추지 않는다. 그 뒤에도 `for await (const raw of q)`는 stream이 끝날 때까지 돈다. 다만 `normalizeClaude`(`transport.ts`)는 terminal 뒤의 frame을 버린다.
- **Doan의 service.** `receive`(`service.ts` 401–404행)는 `live.terminal`이 된 뒤의 event를 버린다. 다음 send는 이전 프로세스의 reservation이 풀릴 때까지 `EXIT_WAIT_MS`(10초, 88행)만큼 기다리고, 넘으면 `busy`로 거절한다(`previousExit`, `exitOf`). 지금 예산은 사용량 조회 3초 + 가장 느린 관측 종료 5.0초 < 10초다(`runners.ts` 54–57행 주석, `git show eca2b7c7^:docs/features/provider-usage/orch.md`의 B 진행 기록). 제안을 켜면 CLI의 종료가 생성 시간(상한 30초)만큼 더 늦어질 수 있어 이 예산을 넘을 수 있다.
- **설정의 출처.** Doan 연결의 Claude 실행은 Doan 프로필(`CLAUDE_CONFIG_DIR`)의 user settings와 project·local settings를 읽는다(`settingSources: ["user", "project", "local"]`). 사람이 터미널에서 쓰는 `~/.claude/settings.json`의 `promptSuggestionEnabled`는 Doan 연결에 닿지 않고, Doan 프로필은 사람이 고치는 곳이 아니다. 실행 환경은 `launchEnv`의 allowlist와 login shell probe가 읽는 `PATH`·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`으로만 만든다(`environment.ts` `agentEnv`, `onboarding/machine.ts`). 그래서 지금은 login shell의 다른 변수가 agent에 닿지 않는다. 결정 2에 따라 probe가 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION`도 읽는다.

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
- **글 넣기와 되돌리기.** `ChipField.replace(start, end, segments, kind)`가 undo history에 단계를 남긴다(붙여넣기가 이 길을 쓴다, 448–459행). host가 `value`를 바꾸는 `setValue`는 draft가 바뀌면 history를 끊고, 같은 draft 안에서도 값이 field의 지금 내용과 다르면 끊는다(121–129행). `insertText` 뒤에 `onChange`로 돌아오는 값은 field의 내용과 같으므로 history를 끊지 않는다.
- **summary.** `ConversationSummary`(`summary.ts`)는 대화 목록의 한 행이고, 두 host가 보이는 대화의 행에서 provider, model, phase, working, queued, `returnedDraft`를 읽는다. `returnedDraft`는 `conversationSummary` 밖에서 붙는다(`service.ts` 449행). 바뀌면 main이 `conversation:listChanged`로 알린다.
- **event 저장.** `store.ts`의 `event()`·`payload()`는 모르는 event type을 받지 않고, `parse`는 그런 줄이 하나라도 있으면 대화 전체를 읽지 못한다(116–119행, 378–386행). 오래된 build가 새 type이 든 history를 열면 그 대화가 read error가 된다.

## 영향받는 구성 요소

- **app(main)**: `conversation/runners.ts`(`openClaude`: 옵션, terminal 뒤의 `prompt_suggestion` 읽기), `conversation/transport.ts` 또는 새 `conversation/promptSuggestion.ts`(순수 함수), `conversation/service.ts`(대화마다 제안 보관, 지우기, 다음 send와의 관계), `conversation/summary.ts`(`suggestion` 필드).
- **app(renderer)**: `dockedRules.ts`(placeholder 계산), `homeComposer.ts`(키 판정), `ComposerParts.tsx`(`ComposerFieldHandle.insertText`, 접근성 설명), `chipField.ts`(history를 남기는 글 넣기), `DockedComposer.tsx`(키 연결), `ProjectOverview.tsx`·`CanvasConversationPanel.tsx`(summary의 제안을 넘김).
- **CLI(Go)·skills·shared formats**: 바뀌지 않는다.

## 동작

### main

1. **옵션과 환경.** `openClaude`의 `query` 옵션에 `promptSuggestions: true`를 둔다. login shell probe가 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION`을 읽고, Claude 실행 환경에는 그 값이 있으면 그 값을, 없으면 `true`를 둔다. Codex·ACP 실행 환경에는 두지 않는다(결정 2).
2. **읽기.** runner의 stream loop가 terminal 뒤에도 frame을 본다(지금도 돈다). 이 turn의 terminal event가 `turn.done`이고 읽지 않은 steer가 없을 때, `prompt_suggestion` frame을 순수 함수 `promptSuggestionText`(아래)로 걸러 글이 남으면 runner 입력의 새 hook `suggested(text)`를 한 번 부른다. failed·interrupted 턴, terminal 전의 frame, 두 번째 제안은 무시한다.
3. **보관.** service는 send마다 `suggested`를 `planApproved`처럼 그 send의 `live`와 `turnId`에 묶어 만든다. 부를 때 다시 확인한다: 같은 `live`이고 같은 `turnId`이며, 그 turn이 done으로 끝났고, 새 send가 시작되지 않았고, 대화가 archive·delete되지 않았고, 앱이 끝나는 중(`quit()`의 `quitting`)이 아니다. 맞으면 대화 id별 메모리 map에 두고 목록 변경을 알린다. 늦게 온 callback이 다음 턴을 건드리지 않게 하는 울타리다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn').
4. **지우기.** 같은 대화의 다음 턴이 수락될 때, archive·restore·delete 때 map에서 지운다. Doan 연결 대화는 제안을 그 실행의 연결(`owner.connectionId`)과 함께 두고, Claude 연결이 sign out되거나 다른 연결로 바뀌면 지운다. service는 `index.ts`의 auth `publish`(744행)에서 이 변화를 듣는다. 이름과 모양은 `/tdd`에서 정한다. legacy external 대화는 Doan 연결이 없으므로 이 규칙이 없다. 앱을 다시 시작하면 메모리와 함께 사라진다(결정 3·4).
5. **summary.** `conversationSummary`의 `live` 입력에 `returned`와 `suggestion`을 더하고, 지금 `service.ts` 449행에서 밖에 붙이는 `returnedDraft`를 함수 안으로 옮긴다. 그래야 A1의 `summary.test.ts`가 `returnedDraft`와 `suggestion`의 관계를 함수 하나로 확인한다. `conversationSummary`가 `suggestion?: string`을 준다. 대화가 current이고, phase가 `ended`이며, working이 아니고, `queued`가 0이고, `returnedDraft`가 없을 때만 준다(결정 9). preparing 중인 send는 working이므로, 입력란이 막 비어도 이전 제안이 다시 보이지 않는다. 그 send가 거절되면 working이 풀려 제안이 다시 보인다(이때 입력란에는 거절된 draft가 돌아와 있다).
6. **다음 send와의 관계.** runner는 "제안을 기다리는 중"과 "제안 없이 정상 종료하는 중"을 구분할 수 없다. SDK에는 생성 시작을 알리는 frame이 없고, CLI가 생성 전에 거르는 경우(`early_conversation`, `rate_limit` 등)도 똑같이 `result`를 받았고, 입력이 닫혔고, 프로세스가 살아 있고, 그 뒤 frame이 없는 모양이다. 그래서 관측할 수 있는 규칙을 쓴다: **done으로 끝난 turn의 입력이 닫혔고, 프로세스가 아직 살아 있고, `prompt_suggestion`이 아직 오지 않았으면, 그 프로세스는 다음 send에서 끝낸다.** 같은 대화의 send(사람의 send, 큐 전송, restore 포함)가 `previousExit`에서 기다리기 시작할 때 이 조건이면, 늦게 올 제안은 버리고 이전 프로세스를 끝낸다(결정 5). 제안 없이 정상 종료하던 프로세스도 이 규칙에 걸린다. 이는 POSTMORTEM 2026-10-28이 고른 "이전 프로세스가 스스로 끝나기를 기다린다"를 이 조건에서만 바꾸는 것이다. reservation은 지금처럼 `process_exited`에서만 풀리므로 두 프로세스가 한 세션을 함께 쓰지 않는다는 이유는 그대로 지켜진다. 이 조건이 아닌 프로세스(failed·interrupted 턴, 제안을 이미 받은 프로세스)는 지금처럼 스스로 끝나기를 기다린다. 끝내는 방법은 이미 있는 group stop(SIGTERM, 0.5초 뒤 SIGKILL, `process.ts`)이다. 입력을 닫은 뒤에는 interrupt를 보낼 수 없다(P1-c). 그러면 send가 기다리는 시간은 지금 예산(`EXIT_WAIT_MS` 10초) 안에 머문다.
7. **사용량 조회와의 순서.** provider-usage의 턴 끝 조회(`usageAtTurnEnd`)는 지금처럼 입력을 닫기 전에 한다. 조회하는 턴에서는 CLI가 같은 시각에 제안을 만들기 시작하므로 두 일이 겹친다. 조회하지 않는 턴과 legacy external 턴에서 제안이 오는지는 P1-a가 본다('Doan의 runner'). 이 feature는 조회 상한(`TURN_USAGE_MS`)을 바꾸지 않는다.

### renderer

1. **placeholder.** 두 host의 식을 순수 함수 `composerPlaceholder`(아래) 하나로 바꾼다. 우선순위: 읽기 전용이면 지금 문구, preset이 있고 글이 없으면 preset 문구, 보이는 대화의 summary에 `suggestion`이 있으면 그 글, 아니면 지금 문구. 함수는 보이는 글과 함께 "지금 제안을 보이는가"를 돌려주고, `DockedComposer`는 그 값만 보고 키를 받는다. 보이는 글과 키 판정이 따로 놀지 않는다.
2. **모양.** 지금 placeholder 그대로 그린다(결정 6)(같은 `::before`, `--text-metadata`, capsule 한 줄 말줄임). 새 색이나 token을 만들지 않는다. box 모양(빈 입력란에서는 첨부가 있을 때)에서는 지금 placeholder가 잘리지 않는다. `.composer-input`이 `position: relative; overflow-y: auto`라, 입력란 최소 높이를 넘는 `position: absolute`의 `::before`가 빈 입력란에 스크롤을 만든다. docked의 빈 입력란 최소 높이는 한 줄이다(`.docked .composer-input`의 `min-height`). 그래서 box의 빈 placeholder도 capsule과 같은 한 줄 말줄임으로 둔다. 제안이 오고 갈 때 입력란 높이가 바뀌지 않는다(사람, R 작업자 질문 뒤). 말줄임된 글 전체는 `aria-placeholder`에 있고 오른쪽 방향키로 넣으면 보인다(harden preset: "show the full value somewhere reachable when it is cut"). 이 규칙은 Z1에서 DESIGN 'Narrow placeholder'에 함께 올린다.
3. **키.** `DockedComposer`의 `onKey`에서 `takesSuggestion`(아래)이 참이면 기본 동작을 막고 `field.insertText(suggestion)`을 부른다. 글 없이 첨부만 있는 draft에서도 같고, 첨부는 그대로 남는다. `insertText`는 `ChipField.replace`로 넣어 undo 단계를 하나 남기고 caret을 끝에 둔다. 그 뒤 `onChange`가 draft를 바꾸고, 글이 한 줄을 넘으면 지금 규칙대로 box 모양이 된다. 제안은 map에서 지우지 않으므로, 넣은 글을 다 지우면 제안이 placeholder로 다시 보인다(결정 4).
4. **접근성.** 제안이 보이는 동안 `aria-placeholder`는 제안 전체다. 입력란의 `aria-describedby`에 숨은 설명 "Press Right Arrow to use the suggestion."을 더한다(지금 이유 줄 id와 함께). 도착 알림은 결정 7대로, 같은 대화에 새 제안 글이 도착했고 그 composer의 입력란에 포커스가 있고 비어 있을 때 한 번만 기존 sr-only status(`DockedComposer.tsx` 395행)에 "Suggestion: <제안>"을 둔다. "새 제안"은 같은 대화에서 이전에 보인 제안 글과 다른 글이 summary로 들어온 때다. 창 reload 뒤 처음 읽은 제안, 대화 전환으로 보이게 된 제안, 넣었다 지워서 다시 보이는 제안은 알리지 않는다. 오른쪽 방향키로 넣은 뒤에도 알리지 않는다. 포커스가 입력란에 있으므로 넣은 글은 그대로 읽힌다.
5. **목록 읽기 순서.** summary의 제안은 host가 이미 쓰는 최신 목록 읽기(`homeRun.ts`의 `readsStarted`·`readsApplied`)에서만 가져온다. 늦게 온 이전 목록이 지워진 제안을 되살리지 않는다(POSTMORTEM 2026-11-05 'A Send now row refused back into the queue could vanish').

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. `promptSuggestionText(raw: unknown): string | null` — main. `type === "prompt_suggestion"`이고 `suggestion`이 문자열인 객체만 받는다. 글자는 다음처럼 다룬다. 공백 하나로 접는 것: 줄바꿈과 공백류 Cc(U+0009–000D), U+0085, U+2028, U+2029, NBSP(U+00A0), 그리고 이들과 공백(U+0020)이 이어진 덩어리. 지우는 것: 나머지 Cc(U+0000–001F와 U+007F–009F 중 위에 없는 것), bidi 제어(U+202A–202E, U+2066–2069). 그 뒤 앞뒤 공백을 지운다. 빈 글, 접고 지운 뒤 1,000 code unit을 넘는 글은 `null`이다(결정 11). A1은 각 범위의 양 끝(U+001F·U+0020, U+007F·U+009F·U+00A0, U+2027·U+2028·U+2029·U+202A·U+202E·U+202F, U+2065·U+2066·U+2069·U+206A)과 1,000·1,001 code unit에 fixture를 둔다(POSTMORTEM "state the exact character set … add a fixture at the boundary").
2. `conversationSummary`의 `suggestion` 규칙 — 이미 있는 순수 함수의 `live` 입력에 `returned`와 `suggestion`을 더하고 `returnedDraft`도 함수 안에서 만든다(동작 main 5). current·ended·not working·queued 0·`returnedDraft` 없음일 때만 준다.
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
- **Out of scope 4(Doan이 agent 작업을 시작하지 않는다)**: Doan은 새 요청을 보내지 않는다. 제안은 사람의 턴 끝에 provider CLI가 스스로 만든다. 사람의 계정으로 턴마다 모델 요청이 하나 더 생기는 점은 사람이 받아들였다(결정 2). Z1은 이 해석을 PRODUCT §3 Out of scope 4(또는 'Agent conversation foundation contract')에 쓴다: 사람의 턴 끝에 provider CLI가 스스로 하는 제안 생성은 Doan이 시작하는 작업이 아니며, 사람의 계정으로 턴마다 요청 하나를 더한다.
- **Launch environment**: login shell probe가 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION`을 하나 더 읽고, Doan이 Claude 실행에 기본값 `true`를 준다(결정 2). 사람의 shell 값이 이긴다. Z1에서 PRODUCT §3 'Launch environment'와 ARCHITECTURE의 launch environment 문단에 적는다.
- **종료 예산(`EXIT_WAIT_MS`)과 사용량 조회 상한(`TURN_USAGE_MS`)**: 값은 바뀌지 않는다. 다만 ARCHITECTURE §7 'Agent usage' 'Turn-end reads'의 불변식 "the cap plus the CLI's exit after closing must stay inside `EXIT_WAIT_MS`"는 이 feature로 바뀐다. 입력을 닫은 뒤 CLI의 종료가 제안 생성(상한 30초)만큼 늦어질 수 있으므로, 예산 안에 머무는 것은 CLI가 스스로 끝나서가 아니라 다음 send가 그 프로세스를 끝내서다(동작 main 6). Z1에서 그 문장을 고친다.
- **이전 프로세스가 스스로 끝나기를 기다림(POSTMORTEM 2026-10-28)**: 동작 main 6의 조건에서만 바뀐다. reservation이 `process_exited`에서만 풀리는 규칙은 그대로다.

## PoC 결과(P1, 2026-11-05, Claude Code 2.1.318, SDK 0.3.312)

결정 12의 환경에서 `.scratch/prompt-suggestion/p1.mjs`(모드 a·c·d·e·f)로 확인했다. 관측 기록은 같은 디렉터리의 `out/*.jsonl`에 있다(gitignored). 턴은 T1 첫 턴(codeword 기억), T2 짧은 답, T3 도구(Read), T4 codeword 회상이다.

- **P1-a 도착.** 기본 설정에서는 세 경우(조회 뒤 닫기, `result` 직후 닫기, legacy)와 15초 열어 두기 모두 16턴 중 0턴에서 왔다. 매 턴의 `rate_limit_event`가 `allowed_warning`(seven_day, utilization 0.53)이었고, CLI의 `rate_limit` 거르기로 본다. `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=true`를 주면 세 경우 모두 T2에서 왔고, T3에서는 조회 뒤 닫기와 `result` 직후 닫기에서 왔다(legacy T3은 오지 않음). T1(`early_conversation`)과 T4에는 어느 경우에도 오지 않았다. resume한 T2에서 오므로 `early_conversation`은 resume history를 센다. 결정 2를 이 결과로 고쳤다.
- **P1-b 시간(script).** `result`→제안 1.0–2.7초. `result`→프로세스 그룹 소멸은 제안이 없을 때 0.6–0.9초, 제안이 왔을 때 1.6–3.3초였다. 제안이 오지 않았는데 2.8–3.4초 걸린 턴도 있었다(CLI가 생성한 뒤 버린 것으로 본다). 관측 최댓값 3.4초에 조회 상한 3초를 더해도 `EXIT_WAIT_MS` 10초 안이지만, CLI 쪽 상한은 30초라 동작 main 6이 필요하다. 앱에서 `turn.done`에 바로 보낸 send의 `busy` 여부는 E1(c)에서 본다.
- **P1-c 끝내기.** 제안을 기다리는 중(T3, `result` 뒤 0.3초에 끝냄): 입력을 닫은 뒤의 `interrupt()`는 "Query closed before response received"로 실패했고 제안은 그대로 왔다. 입력을 열어 둔 채 `interrupt()`하면 제안이 버려지고 exit 0으로 0.9초에 끝났지만, 열어 둔 동안에는 제안이 오지 않으므로 Doan 구조에 맞지 않는다. group stop은 SIGTERM으로 0.5초 안에 끝나지 않아 SIGKILL로 끝났다(`result` 뒤 0.85초). 세 방법 모두 다음 resume이 같은 transcript를 이었고(codeword 회상), SessionEnd hook이 턴마다 한 번 돌았다. 제안 없이 끝나는 T1에서도 같았다. **방법은 group stop이다**(결정 5).
- **P1-d transcript.** 제안 글은 세션 JSONL에 없다. `result` 뒤에 붙은 줄은 `cost-state`·`last-prompt`·`mode`·`ai-title`·`session-owner`·`atis-latch` 같은 메타 줄뿐이고 user·assistant 줄과 sidechain은 없다. 새 세션 파일도 생기지 않았다.
- **P1-e 거르는 조건.** plan mode 턴에는 오지 않았다. 한도 상태는 내내 `allowed_warning`이었다(위 P1-a).
- **P1-f 저장소 설정.** 환경 변수가 true이면 저장소 `.claude/settings.json`의 `promptSuggestionEnabled: false`가 있어도 T3에서 제안이 왔다.
- **CLI 버전.** 2.1.318만 확인했다. 최소 버전 2.1.284의 동작은 확인하지 않았다.

실제 키 입력(오른쪽 방향키, 한국어 IME 조합 중의 오른쪽 방향키)과 스크린 리더 읽기는 E1(`/runtime-test`)에서 본다. 합성 event는 실제 입력을 증명하지 못한다(POSTMORTEM 2026-10-27 'typeahead': "Preserve separate native-focus/input verification").

## 다른 feature와 겹치는 곳

이 feature는 아래 두 진행 중 feature와 같은 코드를 고치므로 그 둘과 나란히 돌리지 않는다. 하나가 main에 병합된 뒤 다음을 시작한다. provider-usage(PR #98)는 병합되었고, 이 feature는 그것이 가져온 runner 자리와 종료 예산을 쓴다.

- **context-window-ring**(`docs/features/context-window-ring/`, 진행 중): 턴 끝 값을 같은 runner에서 읽는다. 둘 다 `result`와 프로세스 종료 사이에 일을 더하므로, 나중에 들어가는 쪽이 'PoC 결과' P1-b의 시간 측정을 다시 한다.
- **queue-steer-shortcut**(`docs/features/queue-steer-shortcut/`, 진행 중): `ComposerField`의 키 연결과 `DockedComposer`를 같이 고친다. 키는 겹치지 않는다(그쪽은 Control+Enter). 나중에 들어가는 쪽이 키 판정 순서를 맞춘다.

## POSTMORTEM에서 가져온 함정

- 2026-10-28 "A send right after turn.done was refused as busy until the previous process group was gone": "test sends issued before the previous process's exit callback, not after it … Real-app checks of consecutive turns must send on `turn.done` itself." 제안이 프로세스 종료를 늦추므로 이 위험이 커진다. 동작 main 6, E1(c), `service.test.ts` 사례로 막는다.
- 2026-10-27 "Awaited conversation work outlived its current turn": "fence transport rejection by live identity and turn ID." 늦게 온 제안을 `live`와 `turnId`로 거른다(동작 main 3).
- 2026-10-27 "Rewritten shell typeahead skipped repeated letters and the current prefix match": "reuse the established keyboard matcher and test its actual event-handler wiring rather than relying only on helper tests." `takesSuggestion`은 `isSubmitKey` 옆에 두고, 테스트는 실제 `ComposerField` keydown에서 한다.
- 2026-11-05 "A Send now row refused back into the queue could vanish while main still held it": 오래된 목록 읽기를 적용해 상태가 어긋났다. 제안도 목록 summary로 오므로 최신 읽기만 쓴다(동작 renderer 5).
- IME·placeholder를 직접 다룬 항목은 없다. IME는 PRODUCT §5 item 1의 규칙("Enter during an IME composition commits and sends, losing or doubling nothing")과 `ChipField`의 조합 처리를 따른다.

## design preset

`doan design-skill --json`으로 목록을 보고 두 개를 읽었다.

- `clarify`: "placeholders are examples, not labels." 입력란의 이름은 지금처럼 "Message"(`aria-label`)이고, 제안은 보낼 말의 예로만 보인다.
- `harden`: 긴 글은 줄바꿈·말줄임·자르기 중 하나를 정하고, 잘린 값 전체를 닿을 수 있는 곳에 둔다. capsule과 box 모두 한 줄 말줄임, 전체 글은 `aria-placeholder`와 오른쪽 방향키로 닿는다.
