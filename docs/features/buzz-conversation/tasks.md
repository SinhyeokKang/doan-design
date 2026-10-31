# buzz-conversation — tasks

순서: PoC → 형식 → 순수 함수 → main 셸 → renderer → 실제 앱 → 승격. 커밋 경계는 `── commit ──`으로 표시한다. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 테스트 파일 이름은 지금 저장소의 것을 쓴다(`io.test.ts`, `state.test.ts`, `storeIndex.test.ts`, `storeRecovery.test.ts`, `service.test.ts`, `ipc.test.ts`, `runners.test.ts`; `store.test.ts`는 없다).

## P. PoC

- [x] P1. 로그인할 수 있는 공급자에서 캔버스 파일을 고칠 때 확인한다(design §5).
  - 확인할 것: `activity`에 `kind: "edit"`와 경로가 오는지, 경로 형태(절대·상대), 거부한 수정에도 edit 활동이 오는지.
  - 방법: 격리 userData·HOME과 임시 저장소로 dev 앱을 띄운다(AGENTS 'Commands'의 격리 dev 실행). 로그인은 사용자가 브라우저에서 승인한다. 그다음 `<userData>/conversations/<id>.jsonl`을 읽는다.
  - 결과는 이 문서에 공급자별로 적는다. 못 한 공급자는 미확인으로 남기고 M4는 그대로 진행한다(2026-10-31 user).
  - 관찰(2026-11-01 KST): Claude Code `2.1.316`, Codex `0.164.0`을 실제 dev 앱에서 각각 허용·거부로 실행했다. Home의 preload API로 `newDesign`을 시작하고 원시 JSONL과 파일 전후 내용을 비교했다. 격리 HOME에서는 Claude가 `storage_failed`, Codex가 `sign_in_failed`로 로그인에 실패해, orch 결정 10에 따라 HOME만 실제 경로로 바꿨다. userData·저장소·런타임은 임시 경로를 유지하고 부모의 `CLAUDE_CONFIG_DIR`·`CODEX_HOME`은 넘기지 않았다.
  - Claude Code: 허용·거부 모두 `activity.kind: "edit"`, `path: "/private/tmp/doan-p1-ogyLep/repo/.doan/canvases/probe.html"`, `insideDesign: true`가 왔다. `summary`는 저장소 기준 상대 경로였다. 두 실행 모두 edit(seq 4) → Edit 권한 요청(seq 5) → 응답(seq 6) 순서였다. 허용 때만 파일이 바뀌고, 거부 때는 내용이 그대로였다.
  - Codex: 허용·거부 모두 같은 절대 경로와 `insideDesign: true`가 왔고, `summary`는 저장소 기준 상대 경로였다. 허용은 edit(seq 30) → fileChange 권한 요청(seq 31) → accept(seq 32), 거부는 edit(seq 74) → 요청(seq 75) → decline(seq 76)이었다. 허용 때만 파일이 바뀌었다. 첫 시도는 도구 권한 대신 대화형 확인 질문만 하고 끝나 수정 관찰에서 제외했다.
  - 승격 근거: 두 공급자 모두 edit 활동만으로 수정 성공을 판정할 수 없다. design §2.4처럼 실제 캔버스 파일 변경도 함께 확인해야 한다. 이 probe는 `/private/tmp`로 정규화한 root에서 실행했다. 상대 `activity.path`, `/tmp` 별칭을 도구에 직접 넘긴 경우, 캔버스 아닌 파일 수정은 미확인이다. ACP 공급자도 미확인이다.
  - 검증: `.scratch/buzz-conversation-p1/verify.mjs` PASS. 네 원시 JSONL의 edit 경로·권한 전후 seq·턴 종료와 파일 전후 내용이 위 관찰에 맞는지 검사했다. 같은 디렉터리에 `probe.mjs`, `case.js`, 원시 JSONL과 실행 결과를 보존했다. 체크 표시는 지휘자가 통합할 때 고친다.

── commit: `docs(feature): record P1 provider edit activity` ──

## T. 형식과 순수 함수

- [ ] T1. 이벤트 v1에 `conversation.bound {canvas}`, `conversation.restored` 타입을 더한다. fold가 `restored` 뒤 이벤트를 다시 반영한다.
  - 검증: `npm --prefix app test` (`io.test.ts`, `state.test.ts`. 새 타입이 섞인 기록 fixture, 모르는 타입은 여전히 손상).
- [ ] T2. 저널 형식을 확정한다(design §2.8). `v`와 작업 종류(`start | bind | promote | restore`)를 두고, 건드리는 모든 기록을 앞부분 자르기 대상으로 하며, 종류별로 커밋을 판정한다.
  - 검증: `npm --prefix app test` (`storeRecovery.test.ts`. 종류 넷 × rename 앞·뒤 crash fixture, 버전 없는 이전 저널은 start로 읽기).
- [ ] T3. index 선택 키 `seenSeq`를 더하고, `canvasesAtStart`의 의미를 "가장 최근 턴 수락 때의 목록"으로 바꾼다(키 이름 유지, `store.ts:13` 설명 수정).
  - 검증: `npm --prefix app test` (`storeIndex.test.ts`. 키 없는 기존 항목 읽기).

── commit: `feat(conversation): bound/restored events, typed undo journal and seen marker` ──

- [ ] T4. main 순수 함수: `conversationSummary`, `clampSeen`, `projectBusy`, `validateSendExtras`, `promotionTarget`, `restoreEntries`, `combineQueued`(design §4 표의 경우를 모두).
  - 검증: `npm --prefix app test`.
- [x] T5. renderer 순수 함수: `composerShape`, `composerAction`, `focusAfter`, `threadItems`, `scrollFollow`, `slotsFromList`/`stripFromList`(design §4).
  - 검증: `npm --prefix app test`.

── commit: `feat(conversation): pure summaries, promotion, restore, queue and composer rules` ──

## M. main 셸

- [ ] M1. `conversation:list`, `conversation:markSeen`, `conversation:listChanged`, preload API.
  - 검증: `npm --prefix app test` (`ipc.test.ts`, `service.test.ts`).
  - 경우: 빈 프로젝트는 `[]`, 등록되지 않은 root는 거절, 기록 하나가 손상·256 MiB 초과일 때 그 항목만 `readError`, legacy external 항목 포함, `markSeen` seq가 마지막 seq를 넘으면 잘림, 응답과 알림의 순서를 가정하지 않음(POSTMORTEM 2026-10-26).
  - `npm --prefix app run typecheck`.
- [ ] M2. 프로젝트 대화 실행 제한 `project_busy`(live 턴 기준, admission과 수락 직전 재확인), IPC `known` 코드 추가.
  - 검증: `npm --prefix app test`.
  - 경우: 준비 중인 시작을 셈, 턴 도중 묶인 대화를 그 턴 끝까지 셈, `BIND_GRACE_MS` 창 안의 새 턴, 다시 로드 뒤(수락 전 시작은 index에 없음).
- [ ] M3. send 확장: 첨부·모델·effort, index 먼저 저장, `store.consume`, 공급자 필드와 legacy external 거절, Codex `Runner.send`에 턴별 모델·effort 전달.
  - 검증: `npm --prefix app test` (`service.test.ts`, `runners.test.ts`).
  - 경우: 이전 프로세스 종료 콜백 전 send(POSTMORTEM 2026-10-28), `attachment_missing`이면 index의 모델·effort 불변, 이번 실행 목록을 읽기 전 `model`은 `bad_request`, 종료 대기 중 `stopRuns`이면 `sent` 표시를 쓰지 않음.
- [ ] M4. 승격: 매 턴 스냅샷, 턴 동안 수정 경로와 폴더 변경 모으기, 턴 끝 첫 폴더 갱신(또는 grace 끝)에서 판정, 새 캔버스 우선, 저널 경유 저장, 보관 대화 runner 정리, 승격 뒤 `HOME_GUIDANCE` 생략.
  - 검증: `npm --prefix app test`.
  - 경우: rename 앞뒤 재시작, 대상 캔버스가 일하는 중, 후보 둘, 거부된 수정, A가 끝난 grace 창 안에서 B가 시작한 뒤 캔버스가 나타나는 경우.
- [ ] M5. 보관 대화 복구: `busy`, `canvas_not_found`, 종료 대기, 수락 직전 재확인, runner 재생성, 거절 시 불변.
  - 검증: `npm --prefix app test`.
  - 경우: 캔버스가 지워짐 → `canvas_not_found`, 같은 ID로 옮겨짐 → 찾음, 중복 ID → `canvas_not_found`, 복구 준비 중에 현재 대화가 send를 시작함 → 거절, 공급자 로그아웃 → `not_logged_in`이고 index 불변, 이전 프로세스가 예약을 들고 있음.
- [ ] M6. 대기열: `conversation:queue`, `conversation:removeQueued`, `turn.done`에 이어 붙여 보내기, 실패·멈춤이면 초안으로 돌리기, 앱 종료 전 초안 복원 정보 넘기기.
  - 검증: `npm --prefix app test`.
  - 경우: 대기 중 첨부가 사라짐, 첨부 합계 10개 초과, 대기 중 로그아웃, 대기 중 다른 프로젝트 대화 `project_busy`.
- [ ] M7. 링크 채널 `shell:openLink`(main 창 sender만, `https:`만, 길이 상한).
  - 검증: `npm --prefix app test` (`http:`, `javascript:`, `file:`, `data:`, 대문자 `HTTPS:`, main 창이 아닌 sender).
- [ ] M8. 첨부 다시 발급 `attachments:fromPaths`(지금 첨부 검사와 같음).
  - 검증: `npm --prefix app test` (옮겨진 파일, 붙여 넣은 이미지 경로).

── commit: `feat(conversation): list, project limit, send extras, queue, promotion, restore and links` ──

## R. renderer

- [x] R1. 바꾸기 전에 main에서 Home 기준선을 잰다(1238×600/780/1240, `/runtime-test` probe, `.scratch/`에 저장). 그다음 입력창 프리미티브를 나누고 `HeroComposer`로 Home을 다시 조립한다.
  - 포커스 보더는 이미 있는 토큰 `--border-field-focus`와 `--shadow-sm`을 적용한다.
  - 비활성 도구 잉크를 고친다.
  - Home 이유 줄과 제거 확인 문구를 바꾼다(spec 결정 18).
  - DESIGN.md 'Home' Composer 행과 토큰 표 행을 현재 사용처로 고친다.
  - 클래스 셀렉터 문자열을 검색한다(design §7).
  - 검증: `npm --prefix app test` (기존 Home·입력창 테스트, 문구만 바뀐 기대값 갱신), `npm --prefix app run typecheck`.
- [ ] R2. `DockedComposer`의 기존 대화·새 대화·보관 대화 모드를 만든다. 실행 중 Stop/Queue와 대기 줄, 거절 이유 줄 표, 대화별 초안, 공용 변형 `doan-button[data-ui-size="xs"]`(`ds/controls.css`)을 넣는다.
  - 검증: `npm --prefix app test`.
  - 두 모양의 정적 마크업에서 textarea가 같은 위치·같은 key이고 `data-shape`만 다름. `ds/controls.test.ts`에 `xs` 버튼.
  - 실제 포커스·IME 유지는 `buzz-project`의 `/runtime-test`로 넘긴다(ARCHITECTURE §7 'Home tests without a DOM').
- [x] R3. `ConversationThread`: 항목 표시, 스크롤 규칙, 로딩·읽기 실패, 접근성(design §3.3), Markdown 렌더링을 넣는다.
  - `npm --prefix app install --save-exact react-markdown@10.1.0 remark-gfm@4.0.1`.
  - 원시 HTML·이미지를 막고, 링크는 M7 채널로 열고, 코드는 `--type-family-mono`를 쓴다.
  - 끝난 메시지는 memo하고, 스트리밍은 프레임 단위로 다시 그린다.
  - 검증: `npm --prefix app test`. 정적 마크업으로 원시 HTML·이미지·`javascript:` 링크가 그려지지 않는지 본다. `rendererImports.test.ts`에 스레드 모듈을 추가 루트로 넣는다.
  - 빌드한 앱의 CSP 확인은 `buzz-project`로 넘기고 여기서는 미검증으로 남긴다.
- [ ] R4. 상태줄·LNB 슬롯·Home 이유 줄·프로젝트 제거 확인·Edit on Home을 main 목록에서 세운다. Dismiss와 방문 때 `markSeen`을 부르고, Edit on Home 첨부는 M8로 다시 발급한다.
  - 검증: `npm --prefix app test`.
  - 경우: 렌더 사이 대화 전환(POSTMORTEM 2026-10-25), 늦은 목록에서 온 `project_busy` 거절, 지워진 캔버스의 슬롯은 프로젝트 행으로, 재시작 뒤 Edit on Home의 없는 첨부는 `attachment_missing` 문구.

── commit: `feat(renderer): composer primitives, hero/docked, thread and persisted conversation status` ──

## D. 초안과 실제 앱

- [x] D1. `/design-draft`: `.doan/canvases/buzz-conversation.html`(2026-10-31 사용자 확정, 리뷰 뒤 상태 추가). 화면 배치 없는 프리미티브 상태판이다. `buzz-project`의 Overview 초안이 이것을 재사용한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`.
- [ ] D2. `/design-sync`(Home 보드만)와 `/runtime-test`를 격리 앱에서 한다.
  - Home computed style·배치가 R1 기준선과 같다. 포커스 보더·그림자·이유 줄 문구는 예외다.
  - 다시 로드 뒤 상태줄·슬롯이 실행 중·응답 대기·안 본 종료를 다시 보인다.
  - 재시작 뒤 안 본 종료(crash 접힘 포함)를 다시 보인다.
  - 다시 로드 뒤 Edit on Home이 텍스트·프리셋·첨부를 되돌린다.
  - 실행 중·응답 대기를 만들려면 로그인한 공급자가 필요하다. 못 하면 그 상태는 미검증으로 남긴다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과 뒤 `/runtime-test`의 짧은 probe.

## Z. 승격과 정리

- [ ] Z1. 현재 규칙으로 고친다.
  - PRODUCT §3 항목 6·§5 항목 1: 프로젝트 대화, 승격과 그 근거, 보관 대화 복구, 대기열, root당 하나 실행, 상태 유지, Home 문구, P1 공급자별 수정 승격 한계(확인·미확인).
  - ARCHITECTURE §7: 목록·markSeen·listChanged, send 입력, 대기열, 매 턴 스냅샷과 승격 판정, 복구, 이벤트 타입, 저널 형식, `seenSeq`, 링크 채널, Markdown 규칙과 두 의존성, 첨부 다시 발급.
  - DESIGN.md: R1에서 고친 행 확인.
  - 부모 `buzz-restyle/tasks.md` C10을 체크한다.
  - 공급자별 P1 관찰은 커밋 메시지에도 남긴다.
  - 검증: `grep -n "never binds later\|Only newDesign accepts\|live in renderer memory\|A project runs one Home conversation\|unchanged by v2" docs/PRODUCT.md docs/ARCHITECTURE.md` 결과 없음. `node .agents/skills/verify/scripts/verify.mjs` 통과.
- [ ] Z2. `docs/features/buzz-conversation/`을 지운다.
  - 검증: 디렉터리가 없다.

── commit: `docs: promote buzz-conversation` ──
