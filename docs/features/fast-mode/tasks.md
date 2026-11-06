# fast-mode — tasks

시작 전: design '결정'(1–7, 사람, 2026-11-06)을 따른다.

순서: PoC → UI 초안 → 형식 → 순수 함수 → main 배선 → renderer 배선 → 실제 앱 확인 → 문서 승격. shared JSON Schema는 바뀌지 않는다.

## P. PoC(구현 전)

- [ ] P1. Codex 0.166.0 app-server로 design §8 P1의 (a)·(b)·(c)를 확인한다. 실제 계정으로 모델 요청을 보내므로 시작 전에 사람에게 묻는다. 프로브는 `.scratch/fast-mode/`에 둔다.
  - 검증: 명령 미정 — 사람 확인 필요. 관찰(버전, 요청과 응답 필드, 날짜)을 이 문서에 적는다. design §1 Codex 티어 판별·runner 절과 spec '전송과 기억'의 Codex 문장을 확정 규칙으로 고친다. 결과가 다르면 구현 전에 두 문서를 먼저 고친다.
- [ ] P2. Claude Code 2.1.318 / Agent SDK 0.3.312로 design §8 P2의 (a)–(d)를 확인한다. 실제 계정으로 모델 요청을 보내므로 시작 전에 사람에게 묻는다. 프로브는 `.scratch/fast-mode/`에 둔다.
  - 검증: 명령 미정 — 사람 확인 필요. 관찰을 P1과 같이 적고, spec 'Fast로 돌지 않은 턴'과 design §1 Claude runner 절을 확정 규칙으로 고친다.

커밋 경계: P1·P2 관찰과 문서 수정(`docs/features/fast-mode/`만).

## D. UI 초안

- [ ] D1. `/design-draft fast-mode`: design §7대로 `.doan/canvases/fast-mode.html`(frame `effort-menu`, `trigger`, `thread-notice`)을 그린다.
  - 검증: `doan check --json --repo .`에 이 캔버스의 finding이 없고, `doan ls --json --repo .`가 canvas id `fast-mode`와 frame 세 개를 보인다.
- [ ] D2. 사람이 앱에서 초안을 확인한다.
  - 검증: design §7 상태가 "사람 확인(날짜)"이다. 초안은 `docs(design): fast-mode draft`로 커밋한다.

커밋 경계: D1·D2(`.doan/canvases/fast-mode.html`와 design §7).

## A. 형식과 순수 함수(`/tdd` → `/implement`)

모든 A 작업은 새 테스트가 구현 전 red였음을 기록한다.

- [ ] A1. 저장 형식: `store.ts` metadata의 `fast?: true`(`fromHome`과 같은 검증), 이벤트 `fast.unused`(알려진 reason, `turnedOff`), `types.ts`의 타입, `summary.ts`의 `fast`(design §2 5, §3).
  - 검증: `npm --prefix app test`에서 `storeIndex.test.ts`·`storeRecovery.test.ts`·`summary.test.ts`가 통과한다. 새 경우: `fast: true` 왕복, `fast: "yes"`인 entry는 무효, reason 없는 `fast.unused`, `turnedOff` 있는 이벤트, 모르는 reason은 손상, 요약에 `fast`.
- [ ] A2. 모델 목록: `parseClaudeModels`·`parseCodexModels`의 `fast`, Codex 티어 판별, `ModelCatalog.accepts`(design §2 1–2). P1의 판별 규칙을 따른다.
  - 검증: `npm --prefix app test`에서 `models.test.ts`가 통과한다. 새 경우: 2026-11-06 관찰 모양의 Codex 행(`priority`/`Fast`, 설명), 티어 없는 행, 모양이 틀린 티어, Claude `supportsFastMode` true·없음, Fast 없는 모델에 `fast: true` 거부, 목록이 없을 때 `fast: true` 거부.
- [ ] A3. 전송 규칙: `validateSendExtras`의 `fast`, 이번 턴의 유효 Fast, `claudeFastSettings`, `codexServiceTierForTurn`(design §2 3·4·6).
  - 검증: `npm --prefix app test`에서 `ipc.test.ts`·`service.test.ts`·`runners.test.ts`가 통과한다. 새 경우:
    - ACP·resume·legacy-external·`conversation:queue`·Send now의 `fast`는 `bad_request`.
    - `fast`만 온 send는 저장된 모델로 판정하고, 저장된 모델이 없으면 목록의 기본 행으로 판정한다.
    - 이번 실행에 목록이 없으면 유효 Fast는 false다.
    - Fast 없는 모델로 바꾼 턴은 false이고 저장된 `fast`는 남는다. 지원 모델로 돌아오면 다시 true다.
    - queue 턴은 나갈 때 저장된 값을 쓴다.
    - 핸드오프는 `fast`를 물려받는다.
    - Codex doan 턴은 끈 턴도 `"default"`를 명시한다. legacy-external 턴에는 `serviceTierForTurn`이 없다.
- [ ] A4. 결과 판정: `claudeFastOutcome`, 자동 끔(대화 `fast` 제거), `fastUnusedText`(design §2 7·11, §6 표).
  - 검증: `npm --prefix app test`에서 `transport.test.ts`·`service.test.ts`·`threadItems.test.ts`가 통과한다. 새 경우:
    - 요청하지 않은 턴, `on`, 값 없음은 `null`이다.
    - interrupted(Stop·앱 종료·crash)에는 이벤트가 없다.
    - failed 턴도 판정한다.
    - `cooldown`과 다섯 이유를 판정하고, 나머지 이유는 reason 없이 기록한다.
    - 계속되는 네 이유만 `turnedOff`이고 대화 `fast`가 지워진다.
    - steer로 result가 둘이면 마지막 result로 판정한다.
    - 순서는 `fast.unused` → `context.usage` → terminal이다.
    - 두 알림 문구를 확인한다.
- [ ] A5. renderer 규칙: `modelPickerView`의 `effort.fast`·`ariaLabel`, `rememberFast`·`defaultFast`, `parseHome`의 `fast`, `shouldTurnOffFast`(design §2 8–10).
  - 검증: `npm --prefix app test`에서 `homeComposer.test.ts`·`rememberChoice.test.ts`·`app/src/restore/uiState.test.ts`가 통과한다. 새 경우:
    - 다음 경우에는 `fast: null`이다: Fast 없는 모델, model `null`(목록 읽기 전·실패), Effort 레벨 없는 모델, ACP provider, `choice.fast` 없음(Settings).
    - 켜짐과 꺼짐에서 `ariaLabel`이 바뀌고, `label`은 바뀌지 않는다.
    - 모델을 바꿔도 provider의 Fast가 남는다. Claude↔Codex 전환은 각 provider의 Last used를 쓴다.
    - 고정 기본값이 있어도 Last used의 Fast를 따른다.
    - 보내기만으로는 Fast가 기록되지 않는다.
    - `preferenceAfterPick`은 `fast`를 무시한다.
    - `parseHome`에서 `fast` 왕복이 유지된다. `fast: {codex: "yes"}`는 버려지고 model·effort는 남는다.
    - snapshot이나 재생 이벤트로는 끄지 않고, 실시간 `turnedOff` 이벤트일 때만 끈다.

커밋 경계: A1, A2, A3, A4, A5 각각.

## B. 배선

- [ ] B1. main: `runners.ts`의 Claude `settings`와 Codex `serviceTierForTurn`, `transport.ts`의 `fast.unused`, `service.ts`의 유효 Fast·자동 끔·핸드오프, `ipc.ts`·`conversation:models`·`conversation:list` 응답, preload 타입(design §1 main·preload).
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`가 통과한다. `runners.test.ts`에 다음 경우를 더한다.
    - Claude `query` options에는 켠 턴만 `settings.fastMode`가 있다.
    - Codex는 재시작 뒤 `thread/resume` 다음 첫 `turn/start`를 포함해 doan 턴마다 `serviceTierForTurn`을 보낸다.
    - `ipc.test.ts`: `conversation:models` 응답에 티어 id가 없다.
    - POSTMORTEM 2026-10-30: `grep -rn '\.acquire(' app/src/main`의 결과가 이 작업 전과 같다.
- [ ] B2. renderer: `EffortPicker`의 구분선·`CheckboxItem` 행·트리거 아이콘·tooltip, 세 composer의 `onPickFast`와 `onRemember` 의존 배열, 기존 대화의 저장된 Fast 표시, 자동 끔의 Last used 반영, 스레드 알림(design §1 renderer, D2 초안).
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`가 통과한다. 새 경우:
    - `ComposerParts.test.tsx`: 스위치를 바꿔도 메뉴가 열려 있고 focus가 행에 남는다. 레벨을 고르면 닫힌다. 켜짐에서 sm·xs 모두 아이콘과 tooltip이 있다. 터미널 고정 트리거에는 아이콘이 없다.
    - `ConversationThread.test.tsx`: `fast.unused`가 그 턴 안에 있고 다시 읽어도 남는다.
    - `App.conversationPanel.test.tsx`: 시작 시 ui-state 읽기를 잡아 둔 채 Fast를 바꾸면 save가 나가지 않는다(POSTMORTEM 2026-11-01).
    - `rg -n "startConversation\(|sendConversation\(|onRemember" app/src/renderer --glob '!*.test.*'`의 모든 호출 경로가 `fast`를 넘긴다(POSTMORTEM 2026-11-02).
- [ ] B3. `/design-sync fast-mode`: 초안과 구현을 computed style로 맞추고 측정값을 `docs/DESIGN.md`에 적는다. 도킹 폭 경계(384·288)를 Fast 켜짐 + "Extra high"로 다시 잰다.
  - 검증: `/design-sync` 보고에 불일치가 없다.

커밋 경계: B1, B2, B3 각각.

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: 로그인한 Claude·Codex로 확인한다. 실제 계정과 사용량이 필요하므로 시작 전에 사람에게 묻는다.
  - 경우: Fast를 켜고 보낸 턴, 끄고 보낸 다음 턴, 재시작 뒤 턴, queue로 나간 턴, Fast 없는 모델로 바꾼 턴과 다시 돌아온 턴, 핸드오프, Cursor 또는 Copilot으로 바꾼 composer(스위치 없음, start 성공), (재현 가능하면) Fast로 돌지 않은 Claude 턴의 알림과 자동 끔.
  - 판정 기준: Claude는 결과 메시지의 `fast_mode_state`를, Codex는 프로브가 기록한 `turn/start`의 `serviceTierForTurn`을 본다. 화면은 스위치·아이콘·알림을 본다.
  - 검증: `/runtime-test` 보고와 스크린샷. 확인하지 못한 경우는 BACKLOG.md에 남긴다.
- [ ] R2. `node .agents/skills/verify/scripts/verify.mjs`
  - 검증: 종료 코드 0.

## Z. 문서 승격

- [ ] Z1. 결론을 현재 규칙으로 올린다(영어, 근거는 커밋 메시지).
  - PRODUCT: §5 item 1 'Agent and model picker'에 Fast 스위치·자동 끔, item 0 'New conversations'에 Last used의 Fast, item 2 'Handoff'에 Fast 상속을 적는다.
  - ARCHITECTURE §7: 'Models'에 Fast 읽기, 'IPC contract'에 `fast` 검증, 'Events'에 `fast.unused`, 'Permission modes' 옆에 Codex `serviceTierForTurn`, index·ui-state 필드를 적는다.
  - DESIGN.md에 측정값, 확인하지 못한 표면은 BACKLOG.md에 적는다.
  - 그 뒤 `docs/features/fast-mode/`를 지운다.
  - 검증: `rg -n "docs/features/fast-mode" docs AGENTS.md README.md`에 결과가 없고, `test ! -d docs/features/fast-mode`가 성공한다.

커밋 경계: Z1(문서마다 따로, AGENTS.md 'Commit conventions').
