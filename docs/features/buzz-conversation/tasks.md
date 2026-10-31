# buzz-conversation — tasks

순서: PoC → 형식 → 순수 함수 → main 셸 → renderer → 실제 앱 → 승격. 커밋 경계는 `── commit ──`으로 표시한다. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다.

## P. PoC

- [ ] P1. 다섯 공급자가 캔버스 파일을 고칠 때 `activity`에 `kind: "edit"`와 root 기준 `path`를 내는지 확인한다(design §5). 격리 userData와 임시 저장소, 패키지 앱이나 dev 앱에서 캔버스 하나를 고치라는 요청을 보내고 `<userData>/conversations/<id>.jsonl`을 읽는다. 결과(공급자별 예/아니오, 경로 형태)는 이 문서에 적는다. 계정 한도로 못 한 공급자는 미확인으로 남긴다.
  - 검증: 명령 미정 — 사용자 확인 필요(실제 공급자 실행이라 AGENTS 'Commands'의 격리 dev 실행 명령으로 띄우되, 확인 절차 자체는 `.scratch/`의 일회성 probe).

## T. 형식과 순수 함수

- [ ] T1. 이벤트 줄 v1/v2: `conversation.bound`, `conversation.restored` 타입과 줄 단위 v 판정, 모르는 v는 unknown_version.
  - 검증: `npm --prefix app test` (store·state 테스트).
- [ ] T2. `start-undo.json` 저널이 묶기·승격·복구를 담을 수 있는지 코드를 읽고 정한다. 작업 종류가 필요하면 저널 버전을 올리고 재시작 복구 fixture를 더한다(design §2.6).
  - 검증: `npm --prefix app test` (storeRecovery 테스트).
- [ ] T3. index 선택 키 `seenSeq`, `canvasesAtTurn`(읽기 시 `canvasesAtStart` 호환).
  - 검증: `npm --prefix app test` (storeIndex 테스트).

── commit: `feat(conversation): add bound/restored events and index keys` ──

- [ ] T4. `conversationSummary`, `projectBusy`, `validateSendExtras`, `promotionTarget`, `restoreEntries`, fold의 `conversation.restored`(design §4).
  - 검증: `npm --prefix app test`.
- [ ] T5. `composerShape`, `threadItems`, `slotsFromList`/`stripFromList`(design §4).
  - 검증: `npm --prefix app test`.

── commit: `feat(conversation): pure summaries, promotion, restore and composer shape` ──

## M. main 셸

- [ ] M1. `conversation:list`, `conversation:markSeen`, 목록 변화 이벤트, preload API.
  - 검증: `npm --prefix app test` (ipc·service 테스트), `npm --prefix app run typecheck`.
- [ ] M2. 프로젝트 대화 실행 제한 `project_busy`(admission과 수락 직전 재확인), IPC `known` 코드 추가.
  - 검증: `npm --prefix app test` (준비 중에 다른 프로젝트 대화가 수락되는 경우 포함).
- [ ] M3. send 확장(첨부·모델·effort, index 저장, 공급자 변경 거절).
  - 검증: `npm --prefix app test` (이전 프로세스 종료 콜백 전 send 포함, POSTMORTEM 2026-10-28).
- [ ] M4. 매 턴 `canvasesAtTurn`, 첫 턴 조건 제거, 턴 끝 수정 승격, 저널 경유 저장.
  - 검증: `npm --prefix app test` (rename 앞뒤 재시작, 대상 캔버스 실행 중, 후보 둘).
- [ ] M5. 보관 대화 복구(`busy`, `canvas_not_found`, runner 재생성, 거절 시 불변).
  - 검증: `npm --prefix app test`.

── commit: `feat(conversation): list, project limit, send extras, promotion and restore` ──

## R. renderer

- [ ] R1. 입력창 프리미티브 분리와 `HeroComposer`로 Home 재조립. 포커스 보더를 `--border-field-focus`와 `--shadow-sm`으로 바꾸고 DESIGN.md 'Home' Composer 행을 고친다(design §0). 클래스 셀렉터 문자열 검색(design §7).
  - 검증: `npm --prefix app test` (기존 Home·입력창 테스트 그대로 통과), `npm --prefix app run typecheck`.
- [ ] R2. `DockedComposer`(capsule/box, 아래 줄 에이전트·effort는 새 공용 변형 `doan-button[data-ui-size="xs"]`를 `ds/controls.css`에 더해 쓴다, 기존 대화의 공급자 고정, send 확장 사용).
  - 검증: `npm --prefix app test` (모양 전환 중 같은 textarea·포커스·IME 조합 유지 컴포넌트 테스트).
- [ ] R3. `ConversationThread` 표시 컴포넌트(design §3.3 상태). 에이전트 메시지 Markdown 렌더링: `npm --prefix app install --save-exact react-markdown@10.1.0 remark-gfm@4.0.1`, 원시 HTML·이미지 차단, `https` 링크는 main을 거쳐 연다, 코드는 `--type-family-mono`(design §0).
  - 검증: `npm --prefix app test`(원시 HTML·이미지·`javascript:` 링크가 그려지지 않는 테스트 포함), `npm --prefix app run build` 뒤 `/runtime-test`로 빌드한 앱 창이 비지 않는지 확인.
- [ ] R4. 상태줄·LNB 슬롯·Home 이유 줄·Edit on Home을 main 목록에서 세우기, 방문 시 `markSeen`.
  - 검증: `npm --prefix app test` (렌더 사이 대화 전환 테스트, POSTMORTEM 2026-10-25).

── commit: `feat(renderer): composer primitives, hero/docked, thread and persisted conversation status` ──

## D. 초안과 실제 앱

- [x] D1. `/design-draft`: `.doan/canvases/buzz-conversation.html`(2026-10-31 사용자 확정)에 `docked` 입력창(capsule·box·칩·비활성·이유 줄)과 스레드 항목 상태를 그린다. 화면 배치 없이 프리미티브 상태판이다. `buzz-project`의 Overview 초안이 이것을 재사용한다. 사용자가 앱에서 초안을 확인한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`.
- [ ] D2. `/runtime-test`: Home의 computed style·배치가 바꾸기 전과 같은지, 다시 로드·재시작 뒤 상태줄·슬롯이 실행 중·응답 대기·안 본 종료를 다시 보이는지 격리 앱에서 확인한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과 뒤 `/runtime-test`의 짧은 probe.

── commit: `docs(canvas): buzz-conversation primitives draft` (D1만) ──

## Z. 승격과 정리

- [ ] Z1. PRODUCT §3 항목 6·§5 항목 1(프로젝트 대화, 승격, 보관 대화 복구, 실행 제한, 상태 유지, P1의 공급자별 수정 승격 한계)과 ARCHITECTURE §7 'Agent conversation runtime and IPC'(목록·markSeen, send 입력, 매 턴 스냅샷과 승격, 복구, 이벤트 v2 줄, index 키)를 현재 규칙으로 고친다. 부모 `buzz-restyle/tasks.md` C10을 체크한다.
  - 검증: `grep -n "never binds later\|Only newDesign accepts" docs/ARCHITECTURE.md` 결과 없음, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- [ ] Z2. `docs/features/buzz-conversation/`을 지운다.
  - 검증: 디렉터리가 없다.

── commit: `docs: promote buzz-conversation` ──
