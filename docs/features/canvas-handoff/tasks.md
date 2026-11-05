# canvas-handoff — tasks

순서: PoC → UI 초안 → schema와 fixture → 순수 함수 → main·CLI(I/O) → UI → eval → 실제 앱 확인 → 문서 승격. 결정은 design '결정' 1–11(사람)에 있다. 커밋 경계는 `— 커밋` 표시를 따른다.

## P. PoC

모두 로그인한 Doan 연결이 필요하다. 격리한 HOME에는 로그인한 provider가 없으므로, provider-usage PoC·E2와 같은 공용 로그인 프로필 방식을 쓴다: 실제 HOME, Doan 전용 userData를 `/Users/sinhyeokkang/code/doan-design/.scratch/` 아래에 두고, 앱은 main checkout(`/Users/sinhyeokkang/code/doan-design`)의 Electron으로 띄운다. `doan Safe Storage` Keychain 항목의 ACL이 그 경로의 Electron만 신뢰해서, worktree의 Electron은 vault를 열지 못한다(`docs/features/provider-usage/orch.md` 진행 기록 E2). 이는 AGENTS.md의 HOME 격리 규칙의 예외라서, 실행할 때마다 그 시점에 지휘자를 거쳐 사람의 승인을 받는다. sign-out과 userData·Keychain 항목 정리도 사람에게 묻는다. 일회성 스크립트와 기록은 `.scratch/canvas-handoff/`에 두고, 결과(provider 버전, mode, 관찰, 날짜)는 이 파일 아래 'P 결과'에 적는다. 앱 코드는 바꾸지 않는다.

- [ ] P1. 환경 전달(design 'PoC 의존' P1). 다섯 provider의 Doan 연결 캔버스 대화에서 agent에게 `printenv DOAN_APP_CONVERSATION DOAN_RUNTIME`을 실행하게 하고, Codex는 sandbox 밖(escalation)에서도 한 번 더 실행하게 한다.
  - 검증: 'P 결과'에 provider마다 두 값이 보였는지가 있다. 실행은 위 공용 로그인 프로필 방식(main checkout Electron, `DOAN_CLI=<abs doan> npm --prefix app run dev -- -- --user-data-dir=<.scratch 아래 userData>`)이고, 실행 때 사람의 승인이 필요하다.
- [ ] P2. permission 경로(P2·P3). Claude Code·Codex는 네 mode, Cursor·Antigravity·Copilot은 각자 대응하는 mode에서 agent에게 `doan active --json`을 실행하게 한다. 승인 요청이 보였는지와 그 요약, 승인 뒤 socket에 닿았는지(앱이 v1 요청을 받았는지), 묻지 않고 닿았는지, 막혔는지를 기록한다.
  - 검증: 'P 결과'에 provider × mode 표가 있고, design §4 표와 다른 칸이 표시돼 있다. 실행은 P1과 같은 공용 로그인 프로필 방식이고, 실행 때 사람의 승인이 필요하다.
- [ ] P3. P1·P2 결과가 design §4 표나 결정 1과 다르거나 환경 변수를 보지 못한 provider가 있으면, 지휘자를 거쳐 사람에게 묻고 spec·design에 반영한다. 다르지 않으면 'P 결과'에 그렇다고 적는다.
  - 검증: 'P 결과'에 판정이 있고, 지원하지 않는 provider가 있으면 spec 비목표와 design 'PoC 의존'에 적혀 있다. — 커밋(`docs(feature): canvas-handoff PoC results`)

### P 결과

(PoC 뒤 적는다.)

## D. UI 초안

- [ ] D1. `/design-draft`로 원래 대화의 핸드오프 줄 네 가지(진행·넘김·거절·취소), 이어받는 대화의 인계 카드, toast를 `.doan/canvases/`에 그린다. 기존 thread와 promotion 줄의 시각 체계를 따른다.
  - 검증: `doan check`가 그 캔버스에 오류 0이고, 사람이 앱에서 초안을 확인했다. — 커밋

## A. schema와 fixture

- [ ] A1. `schema/app-socket.v5.schema.json`(요청 `{v, token, root, handoff, path, text}`, 응답 `requested` 또는 오류 코드 목록, `text` 12,000 code point·제어 문자 패턴)과 `schema/fixtures/app-socket-v5/{valid,invalid}`. TS(`app/src/formats/validate.ts`)와 Go(`cli/internal/formats/validate.go`)가 같은 fixture를 읽는다.
  - 검증: `go test ./...`와 `npm --prefix app test`에서 v5 fixture 테스트가 green이고, v1–v4 fixture 테스트는 그대로 green이다. — 커밋

## B. 순수 함수(`/tdd` 먼저)

- [ ] B1. Go `handoff_rules.go`: `handoffText`, `handoffKey`, 요청 조립, 응답 → envelope·exit 매핑(design '순수 함수').
  - 검증: `go test ./...`에서 경계 사례(빈 글, 12,000/12,001 code point, astral 문자, 제어 문자, 잘못된 키, 각 오류 코드의 exit) 테스트가 green이다.
- [ ] B2. TS `conversation/handoff.ts`: `handoffEligibility`, `handoffDecision`, `handoffGuidanceFor`.
  - 검증: `npm --prefix app test`에서 design §3 확인 순서와 §5 판정 사례(done/failed/stopped, 나열 안 됨, ID 둘, snapshot에 있음, 현재 대화 있음, 같은 캔버스, Plan, 핸드오프로 시작한 턴, 두 번째 요청)가 green이다.
- [ ] B3. TS `prompt.ts`: `turnPrompt`의 `extras.handoff`와 `handoffPrompt`.
  - 검증: `npm --prefix app test`의 `prompt.test.ts`에서 대상 턴에만 `HANDOFF_GUIDANCE`가 붙고, `handoffPrompt`가 인계 메시지를 data 필드에 두는 사례가 green이다.
- [ ] B4. TS 이벤트 타입과 fold: `handoff.requested`, `handoff.resolved`, `user.message.origin`. 재시작 fold에서 `resolved` 없는 `requested`가 취소로 보인다.
  - 검증: `npm --prefix app test`의 `state.test.ts`·`summary.test.ts` 사례가 green이다.
- [ ] B5. TS renderer `handoffMove`와 thread 항목 변환.
  - 검증: `npm --prefix app test`에서 화면별(원래 캔버스, 다른 캔버스, Overview, Home, Settings·page lock, dialog, first run, 목록 read 대기 중 이동) 결과가 green이다. — 커밋

## C. main·CLI(I/O)

- [ ] C1. `runtime.ts` `answerLine`의 v5 분기와 `RuntimeState.handoff`. token 전에 아무것도 드러내지 않는다.
  - 검증: `npm --prefix app test`의 runtime 테스트에서 v5 확인 순서와 기존 v1–v4 응답 불변이 green이다.
- [ ] C2. 대화 서비스: runner마다 `DOAN_HANDOFF` 키(환경과 `RESERVED`), 턴 snapshot, 요청 수락과 `handoff.requested`, 턴 끝 판정 대기, 이어받는 대화 시작(`origin`, `requireNoCurrent`, 다른 evidence의 `taken`), `handoff.resolved`, `conversation:handoff` 알림.
  - 검증: `npm --prefix app test`의 `service.test.ts`에서 fake runner로 done → 시작, stopped → 취소, 판정 대기 중 archive, 수락 직전 대상에 현재 대화가 생긴 경우, 시작 거절(`not_logged_in` 등), 이어받는 첫 턴의 재요청 거절이 green이다.
- [ ] C3. CLI `doan handoff`(`handoff.go`, `run.go` 등록, `doan help`, `ExitCode` 매핑).
  - 검증: `go test ./...`에서 fake socket(절대 경로 임시 `DOAN_RUNTIME`)으로 성공, 각 거절 코드, 키 없음, 없는 파일, `--message -` 상한 테스트가 green이다. — 커밋

## U. UI

- [ ] U1. 원래 대화 thread의 핸드오프 줄과 Open, 이어받는 대화의 인계 카드와 Open(D1 초안대로).
  - 검증: `npm --prefix app test`의 정적 markup 테스트가 green이다.
- [ ] U2. App의 `conversation:handoff` 처리: move(openCanvas + 패널 펼침, canvas visit 하나)와 toast.
  - 검증: `npm --prefix app test`의 App controller 테스트에서 move·toast·read 대기가 green이고, `npm --prefix app run typecheck`가 통과한다. — 커밋

## E. eval

- [ ] E1. fake app(`eval/lib/socket.ts`)에 v5 응답과 `ctx.handoff()`, 대화 환경 `DOAN_HANDOFF` 주입을 더하고, 핸드오프 시나리오(새 id, `turnPrompt`로 만든 캔버스 대화 prompt: 새 캔버스를 만들고 넘기는 과제)를 만든다. 확인: 새 캔버스를 쓴 뒤 한 번만 요청, 경로가 그 캔버스, 메시지가 비어 있지 않음, `doan open` 없음.
  - 검증: `node eval/run.ts --self-test --scenarios <새 id>`가 `self-test PASS`와 exit 0이고, `node --test 'eval/**/*.test.ts'`가 green이다.
- [ ] E2. 턴 prompt가 바뀌어 R8c·R9의 prompt가 핸드오프 가능한 캔버스 턴과 더는 같지 않으므로, 각각 새 id로 대체하고 옛 시나리오를 지운다(ARCHITECTURE §14 'Scenarios are fixed').
  - 검증: `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0이다. — 커밋
- [ ] E3. `/agent-eval` 라운드: 새 핸드오프 시나리오와 대체 시나리오를 Claude Code·Codex로 실행한다(`npm --prefix app run package` 먼저). 결과와 사용성 문제를 `docs/USABILITY-EVAL.md`에 적는다.
  - 검증: `node eval/run.ts --scenarios <ids> --agents claude,codex --round canvas-handoff`가 끝나고 USABILITY-EVAL에 라운드 행이 있다. — 커밋

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: 로그인한 Doan 연결로 캔버스 대화에서 새 캔버스를 만들고 넘기게 해, 승인 요청(Default), 원래 대화 줄, 이동, 인계 카드, Back, Stop으로 취소를 확인한다. Full access에서 묻지 않는 것도 본다.
  - 검증: `.scratch/runtime-test/canvas-handoff/`에 스크린샷과 로그가 있고, 확인하지 못한 표면은 BACKLOG 후보로 적었다. 실행은 P의 공용 로그인 프로필 방식(main checkout Electron, `.scratch/` 아래 userData, 실제 HOME)이고, 실행 때 사람의 승인이 필요하다.
- [ ] R2. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과한다.

## Z. 승격과 정리

- [ ] Z1. PRODUCT.md를 지금 규칙으로 고친다(영문, 근거는 커밋 메시지): §3 Out of scope 4에 좁은 예외(design '결정 영향'의 문장), In scope 6 'Conversation'에 핸드오프로 시작하는 대화, §4 Loop 4단계("Doan does not wake the agent itself")의 예외 참조, §5 item 2 'Conversation panel'에 핸드오프 줄·인계 카드·이동, item 10 CLI에 `doan handoff`, §3 'Resume and permissions'에 핸드오프가 mode를 따른다는 문장.
  - 검증: Out of scope 4가 예외를 담고 위 자리마다 핸드오프 문장이 있다. Z2와 함께 `/doc-check`로 문서와 코드를 맞춘다.
- [ ] Z2. ARCHITECTURE.md: §4 'Handoff over app-socket v5', §7 'Agent conversation runtime and IPC'(키, 판정, 이벤트, prompt, `conversation:handoff`), §7 'Deep links' 경계 문장의 유지 확인, §11 v5 schema·fixture, §12 `doan handoff` 결과·exit, §14 새 시나리오. DESIGN.md에 측정값(있으면), BACKLOG.md에 확인하지 못한 표면.
  - 검증: `/doc-check` 범위 확인으로 문서와 코드가 맞는다.
- [ ] Z3. `docs/features/canvas-handoff/`를 지운다.
  - 검증: `git status`에 그 디렉터리 삭제만 남고, 문서별로 커밋을 나눴다. — 커밋
