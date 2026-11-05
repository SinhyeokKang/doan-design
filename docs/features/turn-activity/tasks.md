# turn-activity — tasks

순서: PoC → UI 초안 → fixture → 순수 함수 → main(I/O) → UI → 실제 앱 확인 → 문서 승격. 결정은 design '결정' 1–11(사람, 2026-11-06)에 있다. 형태와 위치(결정 1, 10)는 D1에서 사람이 변형을 고르면 정해지므로, B3과 U는 D1 뒤에 시작한다. 커밋 경계는 `— 커밋` 표시를 따른다.

시작 시점: chain-261106(work-update → canvas-handoff → small-ui-tweaks)의 세 링크가 main에 병합된 뒤(design '겹치는 feature와 순서'). 같은 normalizer(`transport.ts`, `acp.ts`)와 thread 파일(`threadItems.ts`, `ConversationThread.tsx`)을 고치기 때문이다. project-skill-drawer도 `ConversationThread.tsx`를 고치므로, 둘 사이의 순서는 시작할 때 정한다.

## P. PoC

모두 로그인한 Doan 연결이 필요하다. 공용 로그인 프로필 방식(실제 HOME, main checkout Electron, `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`, spawn hook `.scratch/context-window-ring/hook.cjs`와 driver `.scratch/canvas-handoff/drive.mjs`)을 쓰므로, 실행할 때마다 지휘자를 거쳐 사람의 승인을 받는다. 그 프로필은 chain-261106이 끝날 때 지울 수 있다(그 체인 '시작 점검'). 없으면 사람에게 로그인을 다시 요청한다. 옛 버전(P1의 2.1.284, P2의 0.158.0)은 임시 prefix에 설치하고 사람의 전역 설치와 프로필의 설치본은 건드리지 않는다. 일회성 script와 frame은 `.scratch/turn-activity/`에 두고, 결과(버전, 모델, mode, 관찰, 날짜)는 이 파일 아래 'P 결과'에 적는다. 앱 코드는 바꾸지 않는다. 결과가 기대와 달라도 그 provider의 단계가 "일반"이 될 뿐이므로, 다르면 design §2 표와 spec 완료 조건 2의 provider 목록만 고친다.

- [ ] P1. Claude(design 'PoC 의존' P1): Sonnet·Haiku와 effort를 바꾼 턴, 최소 버전 2.1.284의 턴에서 `content_block_start` `thinking`과 `system/status` `requesting`이 오는지. subagent(Task) 턴 하나에서 상위 frame으로 `requesting`이 오는지.
  - 검증: 'P 결과'에 모델·effort·버전마다 두 신호의 유무와 Task 턴의 관찰, 설치 방법(임시 prefix)이 있다.
- [ ] P2. Codex(P2): 0.158.0과 설치본에서 `reasoning` item이 순간 item인지, 생각 동안 알림이 없는지, 파일을 찾게 하는 턴에서 `commandActions`의 `search`·`listFiles` 모양.
  - 검증: 'P 결과'에 버전마다 판정과 `commandActions` 예(명령 글은 지움)가 있다.
- [ ] P3. ACP(P3): Copilot thought chunk가 다른 턴에서도 오는지, 수 초 걸리는 명령(예: `sleep 5`)에서 `tool_call` pending → in_progress → completed 간격이 그만큼 벌어지는지(Copilot, Antigravity).
  - 검증: 'P 결과'에 provider마다 간격과 판정이 있다.
- [ ] P4. (선택) 실제 디자인 작업 턴 하나의 빈 구간을 `.scratch/turn-activity/gaps.py`로 잰다.
  - 검증: 'P 결과'에 provider, 턴 길이, 가장 긴 빈 구간이 있다.

P를 마치면 한 번 커밋한다(`docs(feature): turn-activity PoC results`). — 커밋

### P 결과

(비어 있음)

## D. UI 초안

- [ ] D1. `/design-draft turn-activity`: design '초안 요청'대로 새 파일 `.doan/canvases/turn-activity.html`에 턴 표시의 변형 여러 개(위치 변형 두 가지 포함)를 같은 상태 묶음 (1)–(12), 두 폭, reduced motion으로 그린다. 글은 `doan design-skill clarify --json`을 읽고 쓴다. 기존 초안 파일은 고치지 않는다.
  - 검증: `doan check --repo . --json`(임시 `DOAN_RUNTIME`)이 그 캔버스에 오류 0이고 `doan ls --repo . --json`에 그 캔버스가 있다. 사람이 앱에서 초안을 보고 변형 하나와 위치를 골랐고, 그 선택을 design '결정' 1·10에 적었다. 고른 단계 글(일반 "working" 포함)과 경과 시간 형식(0초, 59초, 60초, 1시간 이상)을 design '결정' 1에 적었다. — 커밋

## A. fixture

- [ ] A1. `app/src/main/conversation/fixtures/`에 새 파일(예: `claude-thinking.json`, `codex-read.json`, `acp-copilot-thought.json`)로, 기록된 frame(`.scratch/canvas-handoff/out/frames/`, `.scratch/context-window-ring/out/frames/`)에서 개인 정보(경로, session id, 계정)를 지우고 Claude thinking block과 도구 결과, Codex `commandActions` `read`·`listFiles`, Copilot `agent_thought_chunk`가 든 턴을 둔다. 기존 fixture 파일은 고치지 않는다(`acp-copilot.json`은 `fake-acp-server.cjs`가 재생하는 runner 테스트의 입력이다). 출처 커밋과 버전을 `fixtures/README.md`에 적는다.
  - 검증: `npm --prefix app test` — 새 fixture 각각의 지금 events 전체를 `toEqual`로 고정한 테스트가 통과한다. 이 값이 B의 "events는 그대로" 기준이다.

## B. 순수 함수(`/tdd` 먼저)

- [ ] B1. 단계 type(`app/src/main/conversation/types.ts`, type만 import, renderer도 쓴다)과 `normalizeClaude`·`normalizeCodex`·`normalizeAcp`의 단계 출력(design §2 표, §3 Codex 읽기 단계).
  - 검증: `npm --prefix app test` — provider마다 생각·도구·일반 칸, Claude는 도구 단계를 내지 않음, Codex는 `read`·`listFiles`·`search` 하나일 때만 읽기 단계·`unknown`·여러 action·action 없음은 단계 없음, ACP 생각이 끝나는 update(`agent_message_chunk`, `tool_call`, status 있는 `tool_call_update`)와 끝나지 않는 update(`usage_update`, `plan`, `available_commands_update`, status 없는 `tool_call_update`), ACP `failed`, Cursor(`acp-cursor.json`의 pending·in_progress), terminal 뒤 단계 없음, 다른 `threadId`·`turnId`의 Codex 알림 무시, `parent_tool_use_id` frame 무시, Doan connector 도구의 입력이 요약에 없음, ACP `execute`의 title이 단계에 없음, 긴 명령·도구 이름은 512에서 잘리고 명령 글이 없음, A1 fixture의 events가 `toEqual` 그대로, 턴마다 terminal event가 하나(모든 terminal 종류를 셈), 어느 경우에도 Codex activity event가 지금과 같음(결정 6).
- [ ] B2. ACP 도구 요약을 completed activity와 pending·in_progress 단계가 함께 쓰는 함수로 빼기(design §2).
  - 검증: `npm --prefix app test` — 기존 ACP activity 기대값이 바뀌지 않고, 같은 `tool_call`의 단계 요약과 completed activity 요약이 같다. — 커밋
- [ ] B3. renderer `turnStatus`, 단계 저장의 `rev` 비교, settle 규칙, `elapsedText`(design '순수 함수' 1–4, 결정 3·7·11). D1 뒤에 한다(글 모양이 D1에서 정해진다).
  - 검증: `npm --prefix app test` — terminal 세 종류(`turn.done`, `turn.failed`, `interrupted`) 각각에서 없음, 접힌 턴, 답 기다림에서 없음, 답 쓰기, 단계 신호 유효성(`turnId`, `seq`), Allow로 접힌 permission 뒤 앞 도구, 거절로 접힌 뒤 일반, MCP 대기 activity는 일반, steer로 들어온 턴 중간 `user.message`(경과 시간은 첫 `turn.started`부터, 단계는 event 규칙), queue가 다음 턴을 바로 시작할 때 이전 턴 `turnId`의 단계 무시, read 답이 그 사이 push된 단계보다 늦게 와도 덮지 않음(`rev`), settle(300ms 전에 바뀐 단계는 안 보임, 답 쓰기·없음·답 기다림은 바로), `elapsedText`의 0초·59초·60초·3599초·3600초 이상·NaN·음수, 단계 신호가 일반이어도 `threadItems`의 activity 행은 `running`과 진행형 머리를 지금처럼 유지(결정 4, `threadItems.test.ts`의 기존 기대값이 바뀌지 않음). `npm --prefix app run typecheck` 통과. — 커밋

## C. main(I/O)

- [ ] C1. runner 입력에 단계 callback을 더하고(`runners.ts`, `acpRunner.ts`, Codex는 normalize와 emit이 일어나는 `dispatcher.ts`), service가 live entry마다 마지막 단계와 `rev`를 기억해 terminal·Stop·archive·삭제·종료·프로세스 종료에 지운다(`service.ts`). 단계 callback은 `receive()`와 같은 검사를 거치고 같은 단계가 연달아 오면 보내지 않는다. `conversation:stage`를 main window에만 보내고(`app/src/main/index.ts`의 `send`), `conversation:read` 답에 live 턴의 단계를 더한다(`ipc.ts`, `preload/index.ts`의 `onConversationStage`). terminal session(legacy external) 대화가 같은 runner 경로인지 확인한다.
  - 검증: `npm --prefix app test` — fake executable로 Claude·Codex·ACP 턴 하나가 단계를 순서대로 보내고 terminal 뒤에는 보내지 않음, Stop 뒤 provider result 전의 frame에서 단계가 나가지 않음, 끝난 턴의 늦은 신호가 다음 턴에 가지 않음, 재사용한 Codex 서버의 둘째 턴이 새 `turnId`로 단계를 냄, Stop·archive·삭제 뒤 `conversation:read` 답에 단계가 없음, 생각 중 프로세스가 죽으면 단계가 지워짐, 같은 단계가 연달아 오면 한 번만 보냄, main window 말고는 보내지 않음, 다시 읽기 답에 지금 단계가 있음, 대화 기록 파일에 단계 줄이 없음, 대화 목록 요약과 unseen이 같음. `npm --prefix app run typecheck` 통과. — 커밋

## U. UI

- [ ] U1. `ConversationStore`의 대화별 단계 기억(`rev` 비교, 삭제한 대화와 읽기 전 대화는 기존 event 규칙과 같이), `App.tsx`의 단계 구독과 store 전달, 두 호스트(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`)의 prop 전달, `ConversationThread`의 턴 표시(D1에서 고른 변형과 위치), 화면 읽기용 상태 글, 경과 시간의 자식 컴포넌트와 1초 timer(`document.hidden`에서 멈춤), reduced motion.
  - 검증: `npm --prefix app test` — 메시지가 들어간 렌더에 턴 표시가 있음, 카드 대기 중 없음, terminal에 사라짐, 경과 시간이 fake timer로 1초마다 바뀌고 매초 `threadItems`가 다시 돌지 않음, 단계 변화가 thread 높이를 바꾸지 않음, window를 숨겼다가 다시 보이면 `at` 기준으로 바로 다시 계산(fake timer로 90초 숨김), 턴 중간에 대화를 바꾸거나 panel을 접으면 timer가 정리되고 다른 대화에 단계가 새지 않음, terminal에서 timer가 정리됨, 단계 종류가 바뀔 때만 상태 글이 바뀌고 경로·경과 시간이 없음, 턴 표시가 live region이 아니고 경과 시간이 `aria-hidden`이고 Tab 순서에 없음, Send now 메시지와 턴 표시의 순서, 두 호스트가 같음, 마지막 항목이 도는 activity 행이면 그 spinner와 턴 표시가 함께 있음(결정 4), conversation strip·사이드바 slot·보드 notice의 기존 테스트가 바뀌지 않음(결정 8). 바뀌어도 되는 기존 기대값은 `ConversationThread.test.tsx`의 "Claude Code is working" 상태 글 기대뿐이고, 바뀌면 그 이유를 커밋에 적는다. `rendererImports.test.ts` 통과. `npm --prefix app run build` 통과.
- [ ] U2. `/design-sync`: 고른 변형과 앱을 computed style로 맞추고 DESIGN.md에 측정값을 적는다. activity 행의 측정값이 바뀌지 않았는지도 잰다.
  - 검증: `/design-sync` 보고서에 남은 차이가 없거나 기록된 deviation뿐이다. — 커밋

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: `npm --prefix app run build` 산출로 띄운 격리 앱에서(POSTMORTEM 2026-10-30 'A renderer import of a main module left the built app's window blank') Overview와 캔버스 panel 각각에서 한 턴씩 보낸다. Claude Code와 Codex는 반드시, ACP provider는 로그인한 것만 본다. 메시지가 thread에 들어간 순간부터 턴 표시가 있고, 단계가 바뀌고(Claude 생각, Codex 읽기와 경로, Copilot·Antigravity 진행 중 도구), permission 대기 중 없고, 끝나면 사라지는지 본다. 턴 중간 Stop으로 표시가 바로 사라지는지, 턴 중간에 window를 다시 읽어 경과 시간이 이어지는지도 본다.
  - 검증: `.scratch/runtime-test/turn-activity/`에 스크린샷과 로그가 있고, 확인하지 못한 provider·표면은 Z2에서 BACKLOG에 적는다. 실행은 P의 공용 로그인 프로필 방식이고, 실행 때 사람의 승인이 필요하다.
- [ ] R2. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

## Z. 승격과 정리

- [ ] Z1. PRODUCT.md를 지금 규칙으로 고친다(영문, 근거는 커밋 메시지): §5 item 3 'Project Overview'와 item 2 'Conversation panel'에 thread의 턴 표시(보이는 때, 위치, 단계, 경과 시간, activity 행과 함께 보임), §3 'Agent conversation foundation contract'에 단계를 아는 provider의 범위.
  - 검증: `grep -n "turn indicator" docs/PRODUCT.md`(또는 D1에서 정한 이름)가 §5 items 2·3과 §3 contract에서 각각 나온다.
- [ ] Z2. ARCHITECTURE.md §7 'Agent conversation runtime and IPC': IPC 계약에 `conversation:stage`와 `conversation:read`의 단계 필드(`rev` 포함), 'Events'에 단계는 event가 아니라는 문장, 'Summaries'에 "activity와 단계 요약에는 셸 명령 글을 쓰지 않는다"는 문장, provider별 단계 출처. DESIGN.md는 U2가 적고, 턴 표시의 accent 빛을 'Accent places'에 더하며 `ds/checks.test.ts`의 `accentPlaces`도 함께 고친다(결정 1). BACKLOG.md에 R1이 확인하지 못한 provider·표면과, 'Known defects'에 activity 행의 진행형 머리가 실제 일과 다른 것(spec 문제 4).
  - 검증: `grep -n "conversation:stage" docs/ARCHITECTURE.md app/src/main/index.ts app/src/preload/index.ts`가 셋 다 나온다. ARCHITECTURE 'Summaries'에 명령 글 문장이 있다. BACKLOG에 R1의 미확인 항목과 문제 4가 있다.
- [ ] Z3. `docs/features/turn-activity/`를 지운다.
  - 검증: `test ! -e docs/features/turn-activity`, `grep -rn 'features/turn-activity' docs AGENTS.md README.md`가 결과 없음, 문서별로 커밋을 나눴다. — 커밋
