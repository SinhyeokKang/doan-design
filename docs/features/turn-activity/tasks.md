# turn-activity — tasks

순서: PoC → UI 초안 → fixture → 순수 함수 → main(I/O) → UI → 실제 앱 확인 → 문서 승격. 결정은 design '결정' 1–9(사람, 2026-11-06)에 있다. 형태(결정 1)는 D1에서 사람이 변형을 고르면 정해지므로, U는 D1 뒤에 시작한다. 커밋 경계는 `— 커밋` 표시를 따른다.

시작 시점: context-window-ring과 chain-261106(work-update → canvas-handoff)이 main에 병합된 뒤(design '겹치는 feature와 순서'). 같은 normalizer(`transport.ts`, `acp.ts`)와 thread 파일(`threadItems.ts`, `ConversationThread.tsx`)을 고치기 때문이다.

## P. PoC

모두 로그인한 Doan 연결이 필요하다. 공용 로그인 프로필 방식(chain-261106 '로그인': 실제 HOME, main checkout Electron, `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`, spawn hook `.scratch/context-window-ring/hook.cjs`와 driver `.scratch/canvas-handoff/drive.mjs`)을 쓰므로, 실행할 때마다 지휘자를 거쳐 사람의 승인을 받는다. 일회성 script와 frame은 `.scratch/turn-activity/`에 두고, 결과(버전, 모델, mode, 관찰, 날짜)는 이 파일 아래 'P 결과'에 적는다. 앱 코드는 바꾸지 않는다. 결과가 기대와 달라도 그 provider의 단계가 "일반"이 될 뿐이므로, 다르면 design §2 표와 spec 완료 조건 2의 provider 목록만 고친다.

- [ ] P1. Claude(design 'PoC 의존' P1): Sonnet·Haiku와 effort를 바꾼 턴, 최소 버전 2.1.284의 턴에서 `content_block_start` `thinking`과 `system/status` `requesting`이 오는지.
  - 검증: 'P 결과'에 모델·effort·버전마다 두 신호의 유무가 있다.
- [ ] P2. Codex(P2): 0.158.0과 설치본에서 `reasoning` item이 순간 item인지, 생각 동안 알림이 없는지, 파일을 찾게 하는 턴에서 `commandActions`의 `search`·`listFiles` 모양.
  - 검증: 'P 결과'에 버전마다 판정과 `commandActions` 예(명령 글은 지움)가 있다.
- [ ] P3. ACP(P3): Copilot thought chunk가 다른 턴에서도 오는지, 수 초 걸리는 명령(예: `sleep 5`)에서 `tool_call` pending → in_progress → completed 간격이 그만큼 벌어지는지(Copilot, Antigravity).
  - 검증: 'P 결과'에 provider마다 간격과 판정이 있다.
- [ ] P4. (선택) 실제 디자인 작업 턴 하나의 빈 구간을 `.scratch/turn-activity/gaps.py`로 잰다.
  - 검증: 'P 결과'에 provider, 턴 길이, 가장 긴 빈 구간이 있다. — 커밋(`docs(feature): turn-activity PoC results`)

### P 결과

(비어 있음)

## D. UI 초안

- [ ] D1. `/design-draft turn-activity`: design '초안 요청'대로 새 파일 `.doan/canvases/turn-activity.html`에 턴 표시의 변형 여러 개를 같은 상태 묶음 (1)–(11), 두 폭, reduced motion으로 그린다. 글은 `doan design-skill clarify --json`을 읽고 쓴다. 기존 초안 파일은 고치지 않는다.
  - 검증: `doan check --repo . --json`이 그 캔버스에 오류 0이고 `doan ls --repo . --json`에 그 캔버스가 있다. 사람이 앱에서 초안을 보고 변형 하나를 골랐고, 그 선택을 design '결정' 1에 적었다. — 커밋

## A. fixture

- [ ] A1. `app/src/main/conversation/fixtures/`에 기록된 frame(`.scratch/canvas-handoff/out/frames/`, `.scratch/context-window-ring/out/frames/`)에서 개인 정보(경로, session id, 계정)를 지우고 Claude thinking block과 도구 결과, Codex `commandActions` `read`·`listFiles`, Copilot `agent_thought_chunk`와 pending·in_progress `tool_call`이 든 턴을 더한다. 출처 커밋과 버전을 `fixtures/README.md`에 적는다.
  - 검증: `npm --prefix app test` — 기존 transport·ACP 테스트가 새 fixture에서 지금과 같은 event를 낸다(단계 출력 전이므로 기대 event가 바뀌지 않는다).

## B. 순수 함수(`/tdd` 먼저)

- [ ] B1. 단계 type(type만 import하는 파일, renderer도 쓴다)과 `normalizeClaude`·`normalizeCodex`·`normalizeAcp`의 단계 출력(design §2 표).
  - 검증: `npm --prefix app test` — provider마다 생각·도구·일반 칸, terminal 뒤 단계 없음, 다른 `threadId`·`turnId`의 Codex 알림 무시, `parent_tool_use_id` frame 무시, Doan connector 도구의 입력이 요약에 없음, ACP `execute`의 title이 단계에 없음, 같은 frame의 events가 이 변경 전과 같음, 턴마다 terminal event가 하나(모든 terminal 종류를 셈).
- [ ] B2. `codexActivities`의 `commandActions` 읽기(design §3, 결정 6).
  - 검증: `npm --prefix app test` — `read`와 경로 → `kind: "read"`·`path`, `listFiles`·`search` → 읽기, `unknown`·여러 action·action 없음 → 지금의 명령, 어느 경우에도 명령 글이 event에 없음, permission 요약은 그대로.
- [ ] B3. renderer `turnStatus`와 `elapsedText`(design §1, 결정 3·7).
  - 검증: `npm --prefix app test` — design '순수 함수' 1·2의 사례, `context.usage` event가 섞여도 상태가 같음, 단계 신호가 일반이어도 `threadItems`의 activity 행은 `running`과 진행형 머리를 지금처럼 유지(결정 4, `threadItems.test.ts`의 기존 기대값이 바뀌지 않음). `npm --prefix app run typecheck` 통과. — 커밋

## C. main(I/O)

- [ ] C1. runner 입력에 단계 callback을 더하고(`runners.ts`, `acpRunner.ts`), service가 live entry마다 마지막 단계를 기억해 terminal·Stop·archive·삭제·종료에 지운다(`service.ts`). `conversation:phase`를 main window에만 보내고 `conversation:read` 답에 live 턴의 단계를 더한다(`ipc.ts`, `preload/index.ts`).
  - 검증: `npm --prefix app test` — fake executable로 Claude·Codex·ACP 턴 하나가 단계를 순서대로 보내고 terminal 뒤에는 보내지 않음, 끝난 턴의 늦은 신호가 다음 턴에 가지 않음, 다시 읽기 답에 지금 단계가 있음, 대화 기록 파일에 단계 줄이 없음, 대화 목록 요약과 unseen이 같음. `npm --prefix app run typecheck` 통과. — 커밋

## U. UI

- [ ] U1. `ConversationStore`의 대화별 단계 기억(`turnId`·`seq` 비교), 두 호스트(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`)의 prop 전달, `ConversationThread`의 턴 표시(D1에서 고른 변형), 화면 읽기용 상태 글, 1초 timer(숨겨진 window에서는 멈춤), reduced motion.
  - 검증: `npm --prefix app test` — 메시지가 들어간 렌더에 턴 표시가 있음, 카드 대기 중 없음, terminal에 사라짐, 경과 시간이 fake timer로 1초마다 바뀌고 높이가 그대로면 스크롤하지 않음, 단계가 바뀔 때만 상태 글이 바뀜, 두 호스트가 같음, 마지막 항목이 도는 activity 행이면 그 spinner와 턴 표시가 함께 있음(결정 4), conversation strip·사이드바 slot·보드 notice의 기존 테스트가 바뀌지 않음(결정 8). `rendererImports.test.ts` 통과. `npm --prefix app run build` 통과.
- [ ] U2. `/design-sync`: 고른 변형과 앱을 computed style로 맞추고 DESIGN.md에 측정값을 적는다. activity 행의 측정값이 바뀌지 않았는지도 잰다.
  - 검증: `/design-sync` 보고서에 남은 차이가 없거나 기록된 deviation뿐이다. — 커밋

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: 로그인한 provider마다 Overview와 캔버스 panel에서 한 턴씩 보내, 메시지가 thread에 들어간 순간부터 턴 표시가 있고, 단계가 바뀌고(Claude 생각, Codex 읽기, ACP 도구 진행), permission 대기 중 없고, 끝나면 사라지는지 본다. 턴 중간에 window를 다시 읽어 경과 시간이 이어지는지도 본다.
  - 검증: `.scratch/runtime-test/turn-activity/`에 스크린샷과 로그가 있고, 확인하지 못한 provider·표면은 BACKLOG 후보로 적었다. 실행은 P의 공용 로그인 프로필 방식이고, 실행 때 사람의 승인이 필요하다.
- [ ] R2. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

## Z. 승격과 정리

- [ ] Z1. PRODUCT.md를 지금 규칙으로 고친다(영문, 근거는 커밋 메시지): §5 item 3 'Project Overview'와 item 2 'Conversation panel'에 thread의 턴 표시(보이는 때, 단계, 경과 시간, activity 행과 함께 보임), §3 'Agent conversation foundation contract'에 단계를 아는 provider의 범위.
  - 검증: 위 자리마다 턴 표시 문장이 있다. Z2와 함께 `/doc-check`로 문서와 코드를 맞춘다.
- [ ] Z2. ARCHITECTURE.md §7 'Agent conversation runtime and IPC': IPC 계약에 `conversation:phase`와 `conversation:read`의 단계 필드, 'Events'에 단계는 event가 아니라는 문장, 'Summaries'에 Codex `commandActions` 읽기, provider별 단계 출처. DESIGN.md는 U2가 적는다. BACKLOG.md에 확인하지 못한 provider·표면.
  - 검증: `/doc-check` 범위 확인으로 문서와 코드가 맞는다.
- [ ] Z3. `docs/features/turn-activity/`를 지운다.
  - 검증: `git status`에 그 디렉터리 삭제만 남고, 문서별로 커밋을 나눴다. — 커밋
