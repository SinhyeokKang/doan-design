# context-window-ring — tasks

순서: PoC → UI 초안 → 순수 함수 → main 기록 → UI → 실제 앱 확인 → 문서 승격. 결정은 design '결정' 1–11에 있다. provider-usage(PR #98)는 main에 병합되었으므로 브랜치는 main에서 만든다. P의 결과로 결정 3·4를 다시 물으면 해당 작업을 고친다.

## P. PoC

모두 사람의 승인, 로그인한 Doan 연결, 일회성 스크립트 `.scratch/context-window-ring/`가 필요하다. 공용 프로필 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`와 실제 HOME을 쓰는 것은 provider-usage PoC와 같은 예외이므로, 다시 쓰기 전에 사람에게 묻는다. 대화 턴은 사람의 메시지로 시작한다. 결과(버전, frame 모양과 순서, 값, 날짜)는 이 파일 아래 'P 결과'에 적고, 개인 정보를 지운 frame을 A1의 fixture 재료로 `.scratch/context-window-ring/out/`에 남긴다.

- [ ] P1. Claude(design 'PoC 의존' P1 (a)–(d)).
  - 검증: 'P 결과'에 P1 (a)–(d)의 판정, (a)의 input + cache 필드가 결정 9의 뜻에 맞는지, (a)의 원시 비율과 `getContextUsage` 비율의 차이가 있다.
- [ ] P2. Codex(P2 (a)–(d)).
  - 검증: 'P 결과'에 P2 (a)–(d)의 판정, 결정 9의 뜻(마지막 호출의 input 토큰, cache 포함)에 맞는 `last`의 필드, 0.158.0·설치본 각각의 결과가 있다.
- [ ] P3. Copilot(P3 (a)–(c)).
  - 검증: 'P 결과'에 P3 (a)–(c)의 판정이 1.0.89와 설치본 각각에 있다.
- [ ] P4. Antigravity(P4 (a)–(b)).
  - 검증: 'P 결과'에 P4 (a)–(b)의 판정이 있다.
- [ ] P5. Cursor(P5).
  - 검증: 'P 결과'에 실제 턴의 `session/update` 종류 목록과 prompt 응답이 있다.
- [ ] P6. (사람의 결정) P1–P5 결과로 결정 3·4를 다시 물을지 정한다. 값이 terminal 뒤에만 오는 provider가 있으면 결정 3을, P1에서 1M 모델의 압축 창 때문에 Claude 원시 비율이 `getContextUsage`와 크게 다르면 결정 4를 다시 묻는다.
  - 검증: 답을 design '결정'에 적고 바뀐 spec·design·tasks를 커밋한다. 다시 묻지 않으면 'P 결과'에 그 판단을 적는다.

### P 결과

(PoC 뒤에 적는다.)

── commit: `docs(feature): record context-window-ring PoC results` ──

## D. UI 초안

- [ ] D0. `/design-draft`로 `.doan/canvases/context-window-ring.html`을 그린다. 프레임:
  - 카드 안 Send 왼쪽의 링(결정 1)을 capsule·box 모양, 캔버스 panel 최소 폭(320)과 Overview 폭에서.
  - 링 상태: 값 없음(링 없음, 결정 2), 낮은 값, 70% 이상(danger, 결정 6), 100% 초과, 그리고 Stop·Queue가 보이는 running 상태와 보관된 대화.
  - 16px 링(결정 7)의 반지름·stroke. 링 안팎에 글자나 숫자가 없다(결정 10).
  - tooltip 두 줄: "Context window 42% used · last turn"(결정 11)과 토큰 수.
  - 사람이 앱에서 확인한다.
  - 검증: 설치된 `doan check --repo .`가 main HEAD에서 낸 finding 목록과 같은 목록을 내고, 설치된 `doan ls --repo . --json`에 새 캔버스가 있다. 사람의 확인.

### 초안 확인

(초안을 확인한 뒤 적는다.)

── commit: `docs(design): draft the context window ring` ──

## A. 순수 함수

- [ ] A1. transport의 context 상태와 `context.usage` 내보내기(design §1, 순수 함수 1–3). fixture는 P의 `out/`에서 개인 정보를 지운 frame과 `fixtures/README.md`의 출처.
  - 검증: `npm --prefix app test` — 새 테스트 먼저 red, 구현 뒤 green:
    - Claude: 최상위 frame만 읽음(하위 agent frame 무시), `used`는 input + cache_creation + cache_read, `modelUsage` 키가 맞지 않거나 window가 없으면 값 없음, terminal `result` 앞에 `context.usage` 하나, 값 없는 턴은 내지 않음, steer로 이어진 후속 턴은 마지막 값 하나, `endSteerWait`의 `turn.done` 앞에 하나, `terminal_reason: aborted_tools`의 `turn.failed` 앞에 하나.
    - Codex: 다른 `threadId`·`turnId`의 알림 무시, `modelContextWindow` null이면 값 없음, `used`는 P2가 고정한 input 쪽 필드(`totalTokens` 아님), `turn/completed` 앞에 하나, `error` 알림(`willRetry` false)의 `turn.failed` 앞에 하나.
    - ACP: `usage_update` 읽기, `acpPromptDone`·`acpPromptFailed`·`acpEnded` 앞에 하나, `stopReason: "cancelled"`의 `interrupted`에는 없음, Cursor fixture(`acp-cursor.json`)는 내지 않음.
    - 모든 provider: 한 턴에 `usage_update`나 `thread/tokenUsage/updated`가 여러 번 오면 마지막 값 하나만, `state.stop`이 있어 `finish()`·`finishAcp()`가 `interrupted`를 내는 턴에는 `context.usage` 없음, 음수·소수·`size` 0은 버림, 턴마다 terminal 하나와 그 앞의 `context.usage` 많아야 하나.
- [ ] A2. `store.ts` `payload()`의 `context.usage` 검사.
  - 검증: `npm --prefix app test` — 맞는 줄은 읽고, 음수·소수·`size` 0·빠진 필드는 손상으로 읽음. `storeIndex.test.ts` 등 기존 store 테스트 green.
- [ ] A3. renderer `contextRing(events)`, 이름·tooltip 글, `tokenText`, 공유 색 단계(design 순수 함수 5–7).
  - 검증: `npm --prefix app test` — 마지막 `context.usage`를 고름, 없으면 null, 100% 초과는 링 100·tooltip과 이름은 실제 비율, 이름과 tooltip 첫 줄이 같은 글("· last turn" 포함), "84K"·"1.2M"·1,000 미만, 반올림하지 않은 70% 경계(69.9는 기본 색, 70은 danger), `rendererImports.test.ts` green.

── commit: `feat: read context window usage from provider streams` ──

## B. main 기록

- [ ] B1. runner 세 개가 transport의 `context.usage`를 그대로 내고, service가 기록하고 보낸다. 새 IPC 채널은 없다.
  - 검증: `npm --prefix app test` — fake executable로 Claude·Codex·ACP 턴 하나가 history에 `context.usage`를 terminal 바로 앞에 한 줄 남김, Stop·로그아웃·앱 종료·crash 접기와 runner가 직접 내는 terminal(Claude 스트림이 terminal 없이 끝남, Codex `session_unavailable`, Codex Stop)에는 없음, 턴 끝 다음 send가 기다리는 시간이 이전과 같음(`service.test.ts`의 `turn.done` 직후 send 경로), `threadItems`·`foldConversation`·summary·unseen이 바뀌지 않음. `npm --prefix app run typecheck`.

── commit: `feat: record context window usage in conversation history` ──

## C. UI

- [ ] C1. 공유 링 컴포넌트 `ProgressRing({ value, danger, className, children? })`를 `AgentUsageButton.tsx`의 `Ring`에서 뺀다(design §3). 사용량 링은 로고를 children으로 넘기고 class·`data-provider`·`data-band`를 그대로 둔다. `DANGER`를 공유 링 모듈로 옮겨 export하고 `agentUsageView.ts`가 import한다.
  - 검증: `npm --prefix app test` — `AgentUsageButton.test.tsx`·`AgentUsageButton.interaction.test.tsx`·`agentUsageView` 테스트가 바꾸지 않은 채 green.
- [ ] C2. context 링 컴포넌트, `DockedComposer`의 `context` prop과 자리, 호스트 두 곳(`CanvasConversationPanel.tsx`, `ProjectOverview.tsx`)의 값 전달, `styles.css`의 작은 링 규칙.
  - 검증: `npm --prefix app test` — 값이 있으면 링과 이름 "Context window 42% used · last turn", 토큰 수의 `aria-description`, 링 안에 보이는 글자 없음, 값이 없으면 링 없음, 새 대화 상태에서 링 없음, thread가 아직 없으면(`conversationStore.thread(id)` null) 링 없음, `canvasGone`으로 composer가 상태 줄이 되면 링 없음, 보관된 대화는 링 있음, 대화를 바꾸면 그 대화의 값, live event가 오면 갱신, 링이 없으면 `send` 영역의 DOM이 이 기능 전과 같음(Send만), 링이 있으면 링과 Send가 같은 `send` 영역 안에 있고 grid 열이 늘지 않음, running 상태에서 링이 Stop·Queue 왼쪽, tray의 picker가 같은 자리, 링이 Tab 순서에 없음, 눌러도 아무것도 열리지 않음, hover tooltip 두 줄. `npm --prefix app run typecheck`, `npm --prefix app run build`.

── commit: `feat: show the context window ring in docked composers` ──

## E. 실제 앱 확인

- [ ] E1. `/design-sync`로 링을 초안과 맞추고 DESIGN.md에 측정값을 적는다. 사용량 링의 측정값('Agent usage')과, 링이 없는 docked composer의 폭이 바뀌지 않았는지도 잰다. tooltip을 Escape로 닫은 뒤 다시 hover하면 다시 열리는지 확인한다(POSTMORTEM 2026-10-23 'Re-hovering a dismissed tooltip did not reopen it').
  - 검증: `/design-sync` 보고의 측정 일치와 re-hover 결과.
- [ ] E2. `/runtime-test`: 공용 프로필로 provider마다 턴 하나를 보내고, 턴이 끝나면 링이 P의 값과 같은 비율을 보이는지, 앱을 다시 시작해도 남는지, Cursor·새 대화에서 링이 없는지, 턴 끝 직후의 send가 거절되지 않는지, tooltip을 Escape로 닫은 뒤 다시 hover하면 다시 열리는지. 사람의 승인을 받는다.
  - 검증: `/runtime-test` 보고(스크린샷). 사람 상태(프로필, vault, Keychain 항목)가 확인 전과 같은지 보고에 적는다.
- [ ] E3. 공통 gate.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` exit 0.

`/agent-eval`은 생략한다. guide·CLI 출력·skill stub·`doan check` 규칙이 바뀌지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT §5: item 1의 대화 규칙(`docs/PRODUCT.md` 204행 근처, Overview와 conversation panel이 composer를 맡는다는 줄)과 item 2 'Conversation panel', 그리고 item 3 'Project Overview'의 docked composer에 context 링(자리, used의 뜻, 값이 없을 때, 색, 글자 없음과 tooltip, 턴 끝 갱신, legacy external 포함, provider별 지원 범위).
  - ARCHITECTURE §7 'Agent conversation runtime and IPC': 'Events'에 `context.usage`(terminal 앞, 턴마다 많아야 하나), provider별 값의 출처(Claude 스트림, Codex `thread/tokenUsage/updated`, ACP `usage_update`, Cursor 없음), 'Renderer primitives'에 공유 링.
  - BACKLOG.md: P에서 막힌 provider와 확인하지 못한 표면이 있으면 적는다.
  - 그리고 `docs/features/context-window-ring/`을 지운다.
  - 검증: `grep -n 'context.usage' docs/ARCHITECTURE.md`에 줄이 있다, `grep -n -i 'context window' docs/PRODUCT.md`에 줄이 있다, `docs/features/context-window-ring/`이 없다.

── commit: `docs(product): context window ring` / `docs(architecture): context window usage events` / `docs(feature): remove context-window-ring docs` ──
