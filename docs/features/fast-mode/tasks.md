# fast-mode — tasks

시작 전: design '결정'(1–4, 사람, 2026-11-06)을 따른다.

순서: PoC → UI 초안 → 형식 → 순수 함수 → main 배선 → renderer 배선 → 실제 앱 확인 → 문서 승격. shared JSON Schema는 바뀌지 않는다.

## P. PoC(구현 전)

- [ ] P1. Codex 0.166.0 app-server로 design §8 P1의 (a)·(b)·(c)를 확인한다. 실제 계정으로 모델 요청을 보내므로 시작 전에 사람에게 묻는다. 프로브는 `.scratch/fast-mode/`에 둔다.
  - 검증: 명령 미정 — 사람 확인 필요. 관찰(버전, 요청과 응답 필드, 날짜)을 이 문서와 design §1·§8에 적고, 결과가 design과 다르면 design을 먼저 고친다.
- [ ] P2. Claude Code 2.1.318 / Agent SDK 0.3.312로 design §8 P2의 (a)–(d)를 확인한다. 실제 계정으로 모델 요청을 보내므로 시작 전에 사람에게 묻는다. 프로브는 `.scratch/fast-mode/`에 둔다.
  - 검증: 명령 미정 — 사람 확인 필요. 관찰을 P1과 같이 적는다.

커밋 경계: P1·P2 관찰(`docs/features/fast-mode/`만).

## D. UI 초안

- [ ] D1. `/design-draft fast-mode`: design §7대로 `.doan/canvases/fast-mode.html`(frame `effort-menu`, `trigger`, `thread-notice`)을 그린다.
  - 검증: `doan check --json --repo .`에 이 캔버스의 finding이 없고, `doan ls --json --repo .`가 canvas id `fast-mode`와 frame 세 개를 보인다.
- [ ] D2. 사람이 앱에서 초안을 확인한다.
  - 검증: design §7 상태가 "사람 확인(날짜)"이다. 초안은 `docs(design): fast-mode draft`로 커밋한다.

커밋 경계: D1·D2(`.doan/canvases/fast-mode.html`와 design §7).

## A. 형식과 순수 함수(`/tdd` → `/implement`)

- [ ] A1. 저장 형식: `store.ts` metadata의 `fast?: true`(그 밖의 값은 꺼짐, index는 유효)와 이벤트 `fast.unused`(알려진 reason만), `types.ts`의 타입(design §2 5·8, §3).
  - 검증: `npm --prefix app test`에서 store 테스트가 통과한다. 새 경우: `fast: true`가 읽힘, `fast: "yes"`가 꺼짐으로 읽히고 다른 entry가 남음, reason 없는 `fast.unused`, 모르는 reason은 손상. 새 테스트가 구현 전 red였음을 기록한다.
- [ ] A2. 모델 목록: `parseClaudeModels`·`parseCodexModels`의 `fast`, `codexFastTier`, `ModelCatalog.accepts`·`fastTier`(design §2 1–2). P1의 판별 규칙을 따른다.
  - 검증: `npm --prefix app test`에서 `models.test.ts`가 통과한다. 새 경우: 2026-11-06 관찰 모양의 Codex 행(`priority`/`Fast`, 설명), 티어 없는 행, 모양이 틀린 티어, Claude `supportsFastMode` true·없음, Fast 없는 모델에 `fast: true`를 거부.
- [ ] A3. 전송 규칙: `validateSendExtras`의 `fast`, 턴의 `fast`를 정하는 규칙, `claudeFastSettings`, `codexServiceTier`(design §2 3·4·6). P1의 표준 값을 따른다.
  - 검증: `npm --prefix app test`에서 ipc·service·runner 단위 테스트가 통과한다. 새 경우: ACP·resume·legacy-external의 `fast`는 `bad_request`, 모델 변경 시 제거, queue 턴은 저장된 값, Codex 끈 턴도 표준 티어를 명시.
- [ ] A4. 결과 판정: `claudeFastOutcome`, `fastUnusedText`(design §2 7·11, §6 표).
  - 검증: `npm --prefix app test`에서 transport·thread 단위 테스트가 통과한다. 새 경우: 요청 안 한 턴은 `null`, `on`은 `null`, `cooldown`, 다섯 이유, 나머지 이유는 reason 없음.
- [ ] A5. renderer 규칙: `modelPickerView`의 `effort.fast`와 트리거 라벨·접근성 이름, `rememberChoice`·`defaultFast`, `preferenceAfterPick`이 `fast`를 무시함(design §2 9·10).
  - 검증: `npm --prefix app test`에서 `homeComposer.test.ts`·`rememberChoice.test.ts`가 통과한다. 새 경우: Fast 없는 모델은 `fast: null`, 켜짐/꺼짐 라벨, 모델을 바꿔도 provider의 Fast가 남음, 고정 기본값이 있어도 Last used의 Fast.

커밋 경계: A1, A2, A3, A4, A5 각각.

## B. 배선

- [ ] B1. main: `runners.ts`의 Claude `settings`와 Codex `serviceTier`, `transport.ts`에서 `fast.unused` 기록, `service.ts`·`ipc.ts`·`conversation:models` 응답(design §1 main).
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`가 통과한다.
- [ ] B2. renderer: `EffortPicker`의 구분선·스위치 행·트리거 아이콘, 세 composer의 `onPickFast`와 `onRemember`, ui-state `HomeMemory` 검증, 스레드 알림(design §1 renderer, D2 초안).
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`가 통과한다. `rg -n "startConversation\(|onRemember" app/src/renderer --glob '!*.test.*'`의 모든 호출 경로가 `fast`를 넘긴다(POSTMORTEM 2026-11-02).
- [ ] B3. `/design-sync fast-mode`: 초안과 구현을 computed style로 맞추고 측정값을 `docs/DESIGN.md`에 적는다.
  - 검증: `/design-sync` 보고에 불일치가 없다.

커밋 경계: B1, B2, B3 각각.

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: 로그인한 Claude·Codex로 Fast를 켜고 보낸 턴, 끄고 보낸 다음 턴, 재시작 뒤 턴, Fast 없는 모델로 바꾼 턴, (재현 가능하면) Fast로 돌지 않은 턴의 알림을 확인한다. 실제 계정과 사용량이 필요하므로 시작 전에 사람에게 묻는다.
  - 검증: `/runtime-test` 보고와 스크린샷. 확인하지 못한 경우(예: 알림을 재현하지 못함)는 BACKLOG.md에 남긴다.
- [ ] R2. `node .agents/skills/verify/scripts/verify.mjs`
  - 검증: 종료 코드 0.

## Z. 문서 승격

- [ ] Z1. 결론을 현재 규칙으로 올린다(영어, 근거는 커밋 메시지). PRODUCT §5 item 1 'Agent and model picker'·'New conversations'에 Fast 스위치와 기억 규칙, ARCHITECTURE §7 'Models'·'IPC contract'·'Events'·저장 규칙에 Fast 읽기·전송·`fast.unused`·index 필드, DESIGN.md에 측정값. 확인하지 못한 표면은 BACKLOG.md. 그 뒤 `docs/features/fast-mode/`를 지운다.
  - 검증: `rg -n "fast-mode" docs AGENTS.md`에 남은 참조가 없고, `docs/features/fast-mode/`가 없다.
