# work-update — tasks

순서: PoC → guide 예산 → schema·fixture → 순수 함수 → CLI·main 배선 → guide·eval → UI 초안 → renderer UI → 실제 앱 확인 → 문서 승격. eval(E1)을 UI보다 앞에 둔다. 에이전트가 프레임마다 `update`를 보내지 않으면 UI에 보일 것이 없기 때문이다(design §6). D1 초안은 사람이 확인했다(design §9).

## P. PoC

- [x] P1. 환경 전달과 소켓 도달(design §6 P1·P2). `canvas-handoff`의 P1 결과가 있으면 다시 쓰고, 없으면 canvas-handoff P와 같은 공용 로그인 프로필 방식(실제 HOME, 공용 프로필 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`, main checkout의 Electron)으로 다섯 provider의 Doan 연결 캔버스 대화로 `printenv DOAN_APP_CONVERSATION DOAN_RUNTIME`을 실행하게 한다. 이어서 같은 대화에서 `doan work start <canvas> --json`이 `delivered:false`인지(억제), 그리고 소켓에 닿는지를 보기 위해 `doan active --json`의 결과를 provider별·권한 모드(Default, Full access)별로 기록한다. 결과는 이 파일 아래 'P 결과'에 적는다.
  - 검증: 임시 HOME에는 로그인한 provider가 없어 격리 probe로는 할 수 없다. 공용 로그인 프로필 방식으로 하고, 실행 때 사람의 승인을 받는다(`DOAN_RUNTIME`과 repo는 probe마다 임시). 'P 결과'에 provider × 모드 표가 있다. Doan 연결 프로필에 허용(B4)을 넣은 뒤에도 Claude와 Codex 둘 다 Default에서 소켓에 닿지 못하면 멈추고 사람에게 보고한다. Codex 프로필의 rule이 app-server에서 읽히는지도 함께 본다.

## G. guide 예산

- [ ] G0. guide를 `update` 문장이 들어갈 만큼(약 450 B) 줄인다(`cli/internal/cli/skill.md`). 뜻은 바꾸지 않는다. BACKLOG 'Known defects'의 guide 예산 항목을 새 크기로 고친다.
  - 검증: `go test ./...`에서 `skill_test.go`의 예산 테스트가 통과하고, 줄인 뒤 크기가 21,150 B 이하다. 줄이기는 모든 section에 닿으므로 `npm --prefix app run package` 뒤 `node eval/run.ts --agents claude,codex --round <name>`(전체 시나리오)을 돌려 `docs/USABILITY-EVAL.md`에 적는다. 이전 round보다 나빠진 시나리오가 있으면 멈추고 보고한다.

커밋 경계: G0(guide 줄이기), eval 기록은 따로.

## S. schema·fixture

- [ ] S1. `schema/app-socket.v3.schema.json`에 `update`, `frame`, `note`, `conversation`과 조건(design §3). fixture를 `schema/fixtures/app-socket-v3/request/{valid,invalid}/`에 더한다.
  - 검증: `go test ./...`(`cli/internal/formats/validate_test.go`)와 `npm --prefix app test`(`app/src/formats/` 검증 테스트)가 새 fixture를 읽고 통과한다. 기존 v3 fixture도 그대로 통과한다.

커밋 경계: S1.

## A. 순수 함수(`/tdd` → `/implement`)

- [ ] A1. Go `workUpdateArgs`, `workRequest`, `conversationID`(design §2 1–3).
  - 검증: `go test ./...`에서 `work_test.go`의 새 경우(경계 안팎의 frame·note, 공백만 있는 note, 앱 대화의 start/done/update, 대화 id 없음·잘못된 id)가 통과한다. 새 테스트가 구현 전 red였음을 기록한다.
- [ ] A2. TS `applyWork`의 `update`, `workItems`, `workItemsChanged`(design §2 4–5).
  - 검증: `npm --prefix app test`에서 `workState.test.ts`가 통과한다. 같은 경로를 가진 두 root, 상한에 걸린 update, `done`이 작업 내용을 지우는 경우를 포함한다(POSTMORTEM 2026-11-01).
- [ ] A3. TS `applyConversationWork`, `endConversationWork`(design §2 6).
  - 검증: `npm --prefix app test`에서 새 테스트가 통과한다. 다른 root, 끝난 턴, 다른 `turnId`의 늦은 update를 버리는 경우를 포함한다(POSTMORTEM 2026-10-27).
- [ ] A4. 환경의 `DOAN_CONVERSATION_ID`와 `RESERVED`(design §2 7).
  - 검증: `npm --prefix app test`에서 `conversation/environment.test.ts`, `agentAuth/environment.test.ts`가 통과한다(provider extra가 이 이름을 덮으면 `reserved_extra`).
- [ ] A5. TS `pickWork`, `agentNoticeView` 확장, `workFrameRect`(design §2 8–10).
  - 검증: `npm --prefix app test`에서 `agentIndicator.test.ts`가 통과한다. 캔버스 대화가 이기는 기존 테스트, 두 root 전환, project 대화의 Stop 없는 변형을 포함한다.
- [ ] A5b. TS `typingSteps`(design §2 9b).
  - 검증: `npm --prefix app test`에서 새 테스트가 통과한다. 한글·이모지 grapheme, 공통 앞부분 유지("Working on Plans" → "Working on Checkout"), 빈 글에서 시작, 1,000 ms 상한에서 비율 축소, 짧은 글은 20·35 ms 그대로, 너비 하한(새 글이 짧을 때·길 때, 마지막 단계에는 없음), 중간 교체를 포함한다.
- [ ] A6. TS `followDecision`, `followTurnKey`, `followStopped`(design §2 11–12).
  - 검증: `npm --prefix app test`에서 새 테스트가 통과한다. 쉬는 시간 경계(4.9초·5초), 이미 보이는 프레임, 같은 frame의 다음 update, reload, pick·드래그 중, 멈춘 뒤 같은 턴·새 턴을 포함한다.

커밋 경계: A1(CLI), A2·A3(main 상태), A4(환경), A5·A6(renderer 순수 함수).

## B. CLI·main 배선

- [ ] B1. `work.go`·`run.go`의 `update`와 `DOAN_CONVERSATION_ID` 읽기. 사용법 문구에 `update`.
  - 검증: `go test ./...`에서 `work_test.go`의 fake socket 경우(터미널 `delivered` true/false, 앱 대화의 update만 전송, 지금 앱이 `bad_request`로 거절할 때 `delivered:false`)가 통과한다.
- [ ] B2. `runtime.ts` `answerLine` v3: 터미널 `update`(경로 패턴, 자동 등록), 대화 `update`(live 확인). `index.ts`의 `work:changed` 발행 조건을 `workItemsChanged`로, 새 대화 작업 채널, `senderAllowed.ts`, preload.
  - 검증: `npm --prefix app test`에서 `runtime.work.test.ts`(update 수락, 미등록 worktree 자동 등록, 대화 update는 자동 등록 없음, bad token 순서 유지), `senderAllowed.test.ts`, `index.test.ts`가 통과한다.
- [ ] B3. `service.ts` `openRunner`가 `DOAN_CONVERSATION_ID`를 넣고, 턴 끝·archive·삭제·종료에서 대화 작업 내용을 지운다.
  - 검증: `npm --prefix app test`에서 `service.test.ts`가 통과한다(새 대화와 이어 가는 대화 모두 id가 들어감, 각 끝 경로에서 지워짐).
- [ ] B4. Agent setup의 네 번째 허용 규칙(`plan.ts` `CLAUDE_ALLOW_RULES`, `notice.ts`)과 Doan 연결 프로필의 허용(design 결정 12, `agentAuth/providers.ts`): Claude 프로필 `settings.json`에는 빠진 규칙만 넣고, Codex 프로필에는 rule 파일을 쓴다.
  - 검증: `npm --prefix app test`에서 `plan.test.ts`(세 규칙만 있는 파일에 네 번째만 들어감), `providers.test.ts`·`storage.test.ts`(Claude가 쓴 다른 키를 지우지 않고 규칙만 더함, Codex rule 내용)와 `notice` 테스트가 통과한다.

커밋 경계: B1(CLI), B2(main 소켓·IPC), B3(대화 서비스), B4(agent setup).

## E. guide·eval

- [ ] E1. guide 규칙 I와 명령 목록에 `update`(design §4 문장). 새 시나리오 `eval/scenarios/W5/`: 프레임 두 개 이상을 고치는 요청, fake app의 v3 기록으로 "각 편집 전에 그 프레임 id의 update"를 자동 검사, pass·fail fixture.
  - 검증: `go test ./...`(guide 예산), `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W5`가 `self-test PASS`·exit 0, 그 뒤 `npm --prefix app run package`와 `node eval/run.ts --scenarios W5,W3b --agents claude,codex --round <name>`. 결과와 편집 간격을 `docs/USABILITY-EVAL.md`에 적는다. 두 에이전트 모두 `update`를 거의 보내지 않거나 틀린 id를 보내면 멈추고 사람에게 보고한다(UI 작업 전).
- [ ] E2. `FOLLOW_IDLE_MS`(5초), 지우고 치는 속도(20·35 ms/글자, 1,000 ms 상한), 커서 깜빡임(1초) 조정. R1의 실제 앱 probe와 E1의 편집 간격(`update` 사이 시간)을 보고, 따라가기가 사람의 보기를 끊지 않으면서 다음 프레임 전에 시작되는지 판단한다. 바꾸면 그 이유를 커밋 메시지에 적는다.
  - 검증: 값과 근거(편집 간격 중앙값, probe 관찰)를 'P 결과' 아래 'E2 결과'에 적고, `npm --prefix app test`의 `followDecision` 경계 테스트가 새 값으로 통과한다.

커밋 경계: E1(guide), E1(eval 시나리오), E1(eval 기록), E2.

## D. UI 초안

- [ ] D1. `/design-draft work-update`: design §1 'UI 흐름'의 상태 (a)–(h)를 새 파일 `.doan/canvases/work-update.html`(frame `notice-states`, `notice-typing`, `marker-states`, `marker-moves`, `follow`, `reduced-motion`)에 그린다. 기존 `terminal-agent-activity.html`과 `buzz-canvas.html`은 고치지 않는다. 표시는 jump highlight 모양이다(design 결정 16). 지우고 치는 속도와 커서 깜빡임은 조정 가능한 시작값으로 그린다. 사람이 앱에서 초안을 확인한다.
  - 검증: `doan check`와 `doan ls`가 초안을 오류 없이 보이고, 사람이 확인했다.

커밋 경계: D1.

## U. renderer UI

- [ ] U1. `CanvasAgent.tsx`의 문구·tooltip·project 대화 변형, 지우고 치기(공통 앞부분 유지, 마지막 보이는 글자 바로 뒤의 장식 커서(카드 오른쪽 끝이 아님, 말줄임표 뒤): 바뀌는 동안 켜짐·멈추면 1초 깜빡임·reduced motion에서 깜빡이지 않음·`aria-hidden`, 보이는 줄 `aria-hidden`, `role="status"`에는 최종 글, 중간 교체, reduced motion에서 바로 바꿈), 글 칸 너비 하한(update마다 숨긴 측정 노드로 한 번 재고 `min-width`, 끝나면 지움), `CanvasController.ts`의 작업 프레임 표시(jump highlight 모양의 지속 변형, 프레임 사이 이동, 도는 gradient와 숨 쉬는 glow, `reloading`으로 지우고 같은 id로 다시 붙임, `pointer-events: none`, reduced motion·reduced transparency·forced colours).
  - 검증: `npm --prefix app test`에서 `CanvasAgent.test.tsx`(가짜 시계로 지우고 치는 단계, 애니메이션 중 status가 처음부터 최종 글, 중간 교체, reduced motion, update당 측정 한 번과 `min-width` 설정·해제, 커서가 status 글과 너비 하한에 들지 않음), `CanvasController.test.ts`가 통과하고, `npm --prefix app run typecheck`가 통과한다.
- [ ] U2. 따라가기: 사람의 이동 경로마다 `lastPersonMove`와 멈춤 표시를 남기고(design §1 규칙 9의 목록), 따라가기 이동은 그것을 남기지 않는다. `viewChanged`를 그대로 쓰지 않는다.
  - 검증: `npm --prefix app test`에서 `CanvasController.test.ts`가 각 사람 이동 경로(휠, 핀치, Hand 드래그, 확대 버튼, frame drawer, Quick Open, Locate, `doan open --frame`)가 멈춤을 남기고, 따라가기 이동·reload·열 때 복원은 남기지 않음을 고정한다.
- [ ] U3. `/design-sync work-update`: 초안과 실제 앱의 computed style을 맞추고 `docs/DESIGN.md`에 측정값을 적는다.
  - 검증: `node .scratch/design-sync/work-update/measure.mjs`의 쌍이 모두 맞고, DESIGN.md에 새 section이 있다.

커밋 경계: U1, U2, U3(DESIGN.md는 따로).

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: 격리된 실제 앱에서
  - (a) 터미널: `go build -o <tmp>/doan ./cli/cmd/doan`으로 만든 CLI를 `CLAUDE_CODE_SESSION_ID`를 준 채 실행한다. `start` → `update --frame a --note …`(a는 화면 밖) → 5초 기다림 → `update --frame b` → 캔버스 파일 쓰기(reload) → 사람이 휠로 팬 → `update --frame c` → 없는 id로 `update` → `done`.
  - (b) 앱 대화: 로그인한 Claude Code 캔버스 대화와 project 대화 한 턴씩(가능하면 Codex도), 프레임 두 개 이상을 고치게 한다.
  - 단계마다 스크린샷을 남긴다.
  - 검증: 작업 notice의 글, 표시, 따라가기, 팬 뒤 멈춤, reload 뒤 재부착, 턴 끝 사라짐이 spec 완료 조건 5–10대로다. 다른 worktree의 같은 경로에서는 sibling notice와 표시가 바뀌지 않는다. 사이드바의 "working in a terminal" spinner는 앱 대화에서 나오지 않는다.
- [ ] R2. `node .agents/skills/verify/scripts/verify.mjs --eval`.
  - 검증: exit 0.

## Z. 문서 승격

- [ ] Z1. 결론을 현재 규칙으로 옮기고 `docs/features/work-update/`를 지운다(문서는 영어, 근거는 커밋 메시지).
  - `docs/PRODUCT.md`: §5 item 10(`doan work update`, 앱 대화에서는 `update`만 보냄), §5 item 2 'Agent indicator'(project 대화의 표시, 문구, 작업 프레임 표시, 따라가기와 멈춤), 'Terminal work'(문구, 표시). §3 Out of scope 4의 `doan work` 문장이 그대로 맞는지 확인한다.
  - `docs/ARCHITECTURE.md`: §1 규칙 I. §7 'Agent authentication'(Doan 연결 프로필의 허용: Claude `settings.json` 병합, Codex rule, 결정 12). §4 'Terminal work over app-socket v3'(이름을 앱 대화까지 덮도록 고치고, `update`, 터미널·대화 상태, 발행 조건, 'Suppression'의 새 범위). **"새 명령 = 새 소켓 버전" 관례의 예외**: `update`는 같은 `work` 명령의 action이고, 지금 앱의 `bad_request`가 CLI에서 `delivered:false`가 되어 어느 조합도 막히지 않으므로 v3에 넣었다는 이유를 §4와 §11에 적는다. §7 환경 문단과 `RESERVED`(`DOAN_CONVERSATION_ID`), 'Agent setup' 'Claude allow rules'(네 규칙). §11(v3 fixture), §12(`work update` 결과).
  - `docs/DESIGN.md`: 'Canvas area and right panel' 'Overlay marks'에 작업 프레임 표시(jump highlight의 지속·움직이는 변형)를 U3 측정값으로 적는다.
  - `docs/BACKLOG.md`: "`doan work update` …" 항목을 지운다. "Showing where on the canvas the agent is working …" 항목은 남은 부분(바뀐 프레임 표시, 신호 없이 파일만 바뀐 경우)만 남긴다. guide 예산 항목을 새 크기로 고친다. W5가 편집 간격 표본을 냈으면 5분 만료 항목도 고친다.
  - 검증: `/doc-check`로 세 문서와 코드가 어긋나지 않음을 확인한다. 남은 `work-update` 링크를 찾는 명령은 AGENTS.md 'Commands'에 없다: command undecided — needs user confirmation.

커밋 경계: 문서마다 하나씩(PRODUCT, ARCHITECTURE, BACKLOG), 마지막에 feature 디렉터리 삭제.

## P 결과

2026-11-06, canvas-handoff P1·P2와 같은 실행이다(방법·버전·provider × mode 표는 `docs/features/canvas-handoff/tasks.md` 'P 결과'). 같은 대화에서 `doan work start .doan/canvases/probe.html --json`과 `doan work done … --json`도 실행하게 했다.

- **환경**: Claude Code, Codex, Antigravity, Copilot 모두 `DOAN_APP_CONVERSATION=1`과 `DOAN_RUNTIME`이 보였다. Cursor는 계정 한도("Upgrade your plan to continue")로 턴이 시작되지 않아 확인하지 못했다. macOS `printenv`는 이름을 하나만 받으므로 두 변수를 따로 물었다.
- **억제**: `work start`·`work done`은 실행된 모든 대화에서 `{"delivered":false}`였다. 같은 대화의 `doan active`가 앱에 닿은 경우(Claude 네 mode, Codex Full access, Antigravity 세 mode, Copilot Default·Full access)에도 false이므로 억제(`DOAN_APP_CONVERSATION`)가 동작한다. Codex Default·Accept edits·Plan의 `work`는 sandbox 안에서 실행되어 억제와 socket 차단을 가를 수 없다.
- **socket 도달**(Default / Full access): Claude 승인 뒤 닿음 / 묻지 않고 닿음. Codex sandbox가 막아 `app_not_running`, agent가 escalation을 요청하면 Doan permission request(`commandExecution`)로 보이고 승인 뒤 닿음 / 묻지 않고 닿음. Antigravity 승인 뒤 닿음 / 묻지 않고 닿음. Copilot 승인 뒤 닿음 / 묻지 않고 닿음. Cursor 확인 못 함.
- **Codex 프로필의 rule**: 공용 프로필의 Doan Codex 프로필에는 rule 파일이 없고(`*.rules` 없음), Default에서 `doan`은 sandbox 안에서 돌아 막혔다. rule이 app-server에서 읽히는지는 B4가 rule을 넣은 뒤에 다시 본다. 지금은 Claude만이 아니라 Codex도 escalation 승인으로 Default에서 닿으므로 "둘 다 Default에서 닿지 못함"의 멈춤 조건에는 걸리지 않는다.
