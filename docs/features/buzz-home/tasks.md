# buzz-home — tasks

순서는 PoC → 초안 → 형식·순수 함수 → main I/O → UI → 실제 앱 확인 → 승격이다. 사전 feature로 나누지 않고 한 feature로 진행한다(2026-10-29 user). `/orchestrate`의 배치도 이 순서로 나누고, P1·P2 결과가 PRODUCT §6에 기록되기 전에는 M 배치를 시작하지 않는다. PoC 결과가 design §4.7·§4.8과 다르면 그 절을 먼저 고치고 사용자에게 확인한다. 실제 공급자 실행은 실제 HOME의 로그인을 쓰므로 매번 사용자 허락을 받는다. 형식이 `schema/` 아래에 있으면 `/tdd` 규칙대로 schema·fixture를 먼저 바꾸고 TS와 Go가 같은 fixture를 읽게 한다.

## P. PoC (구현 전, design §12)

- [ ] P1. 모델·effort: 다섯 공급자의 모델 목록과 effort 단계의 출처·형식·비용(Copilot은 모델 요청 없이 목록을 얻을 수 있는지 포함), 폴더(root)마다 목록이 다른지, 고른 값으로 새 세션 시작, 다음 턴의 값 유지(design §4.7). 격리 userData·`DOAN_RUNTIME`, `.scratch/buzz-home/poc-models/`.
  - 검증: 명령 미정 — 사용자 확인 필요(실제 로그인 필요, 사용자 허락 뒤 실행). 통과 기준: 공급자별 '목록 있음(형식)/Default만', 비용, 선택 실행 결과가 PRODUCT §6에 날짜와 함께 기록됨.
- [ ] P2. 첨부: 다섯 공급자가 요청에 적힌 저장소 밖 절대 경로의 이미지·텍스트·PDF를 읽고 이미지 내용을 보는지, 기본 권한 설정의 권한 요청 여부와 거절 이벤트(design §4.8). `.scratch/buzz-home/poc-attachments/`.
  - 검증: 명령 미정 — 사용자 확인 필요. 통과 기준: 공급자별 결과와 확정한 한도가 PRODUCT §6에 기록됨. 이미지를 경로로 볼 수 없는 공급자는 이미지 입력 형식을 더할지 사용자에게 묻는다.

── commit: `docs(product): record buzz-home model and attachment PoC` ──

## D. 초안

- [x] D1. `/design-draft`로 `.doan/canvases/buzz-home.html`을 새로 그렸다(26 프레임: 창 21, 상태 보드 5). 홈 전용 violet 타원 배경(grain 없음), 인사 문구, 워크스페이스 임시 상태줄. 사용자가 2026-10-29에 확정했다(`da67ab1e`). 기존 `projects-home.html`은 고치지 않았다.
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 없음, `go run ./cli/cmd/doan ls --repo .`에 `buzz-home`(26 프레임) 표시.
- [ ] D2. 리뷰로 생긴 화면 변경을 초안에 반영한다: LNB 상태 슬롯(design §7.2), 실패·중단 상태줄의 `Edit on Home`과 실패 문구 표(§7), 미준비 공급자의 짧은 상태 문구(§4.3), `{{`·첨부 확인 중 이유 줄(§4.5), 진행 중 제거 확인(§7.5), 마지막 요청 되돌리기 확인(§7.4).
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 없음, `go run ./cli/cmd/doan ls --repo .`의 프레임 목록이 design §14와 같음. 사용자가 앱에서 확인.

── commit: `docs(design): buzz-home draft revision` ──

## T. 형식과 순수 함수 (`/tdd` → `/implement`)

- [ ] T0. 프리셋 그룹(design §4.4a): `catalog.json`에 소문자 `group` 키, `Summary`에 `group`, fixture `list.json`·`get-clarify.json` 갱신, main `designSkills.ts`가 `group`을 남기고 없는 결과도 받음. envelope `v`는 1 그대로.
  - 검증: `go test ./...`(다섯 키·비지 않은 그룹·연속 순서·요약 키 집합, `TestFixturesMatchCatalog`), `npm --prefix app test`(designSkills 해석: `group` 있음/없음, 계약 외 필드 제거) 통과.

── commit: `feat(cli): group design presets` ──

- [ ] T1. 기기 로컬 형식: ui-state `home: {lastRoot?, lastProvider?, models?: {[provider]: {model, effort?}}}`, 대화 index v2의 `model?`·`effort?`·`canvasesAtStart?`, 이벤트 v1 `user.message`의 `attachments?`. 모두 선택 필드이고 버전은 유지한다(design §8).
  - 검증: `npm --prefix app test`에서 기존 v1/v2 fixture 판독, 새 필드 round-trip, 모르는 경우 통과(ui-state의 모르는 키, index `v:3` → 기존 `unknown_version`이고 덮어쓰지 않음, `user.message`의 모르는 필드 무시, 이전 판독기로 새 필드가 든 파일 읽기).
- [ ] T2. `homeComposer.ts`: `composeRequest`(프리셋 머리말, 첨부만 있을 때 고정 문장), `presetPlaceholder`, `sendAvailability`, `defaultProject`, `defaultProvider`, `selectableProvider`, `defaultModel`, `defaultEffort`, `suggestedPresets`, `suggestedPrompts`, `searchPresets`, `presetListView`, `startErrorView`, `pickGreeting`, `slashQuery`, `isSubmitKey`, `attachmentLimit`, `attachmentChipView`, `modelPickerView`(로고·모델·effort·Copilot 지연 읽기), `dropTarget`, `chipRemoval`.
  - 검증: `npm --prefix app test` 해당 테스트 통과. 경우: IME 조합 Enter; 한도 32,768 / 32,769(사용자 텍스트 + 프리셋 머리말); `{{`·`}}` 포함; 프리셋 머리말 형식; 첨부만 있는 요청; 프로젝트 0개; 모든 root가 비활성인 프로젝트; 온보딩 인계 root가 없거나 unhealthy일 때 `defaultProject` 대체 순서; 고른 root가 unhealthy·제거됨; 준비된 공급자 없음; `unverified` 공급자 선택 가능; 고른 공급자가 준비되지 않게 됨; `presetListView`의 `cli_error`(Retry 있음)·`request_refused`(Retry 없음)·`usage_error`(이전 CLI)·`group` 없음('All presets'); `dropTarget`의 폴더; `attachmentLimit` 10/11개와 50 MB 경계; 첨부 확인 중; 같은 root의 두 번째 홈 전송(이유 문구와 Open); 직전 인사 문구 제외와 프로젝트 이름 갱신; Backspace가 프리셋 칩을 먼저 지움; 이번 실행에서 목록을 받기 전에는 model 없음.
- [ ] T3. `conversationStrip.ts`: `stripState`, `stripView`(시작·진행·권한·`turn.failed` 코드별 문구·중단·완료, 병합된 이벤트 기준).
  - 검증: `npm --prefix app test` 통과(실패 코드 표의 모든 행, 중단·실패에서 `Edit on Home` 노출).
- [ ] T4. `homeConversations.ts`: `slotState`(권한 > 작업 중 > 미확인, 캔버스 행/프로젝트 행), 마지막 요청 보관·되돌리기(초안이 있으면 확인 필요), 프로젝트당 1개 판정, 진행 중 제거 확인 필요 여부.
  - 검증: `npm --prefix app test` 통과(우선순위, 바인딩 전후 대상 행 이동, 방문 뒤 Dot 지움, 재시작 상태 없음).

── commit: `feat(app): add home composer, strip and slot models` ──

## M. main

- [ ] M1. `conversation/ipc.ts`: `newDesign` 자유 텍스트 경로(§4.6), `model`·`effort` 검증(이번 실행에서 받은 그 root·공급자 목록에 있는 값만), 첨부 ID 검증. `conversation:models`를 `conversationMethods`에 더한다. FirstPrompt `subject` 경로는 그대로.
  - 검증: `npm --prefix app test`의 ipc 테스트 통과(subject 경로 회귀, 목록 밖 model·effort `bad_request`, 목록을 받기 전 model `bad_request`, Settings·iframe 발신자 거절).
- [ ] M2. `attachments.ts` + IPC `attachments:choose | add-paths | add-pasted | remove`, preload 노출(`webUtils.getPathForFile`, 붙여넣기 바이트): 로컬 파일 경로 확인(realpath·일반 파일, 복사 없음), 디코드 전 크기·이미지 시그니처 확인, 썸네일 PNG 바이트, 붙여넣기 재인코딩(`createFromBuffer` → `toPNG`)·50 MB 상한, 개수 한도, 전송 직전 재확인, 수락 직전 `sent` 표시, 다음 시작 때 표시 없는 디렉터리만 정리, `mainOnly` 발신자 제한.
  - 검증: `npm --prefix app test` 통과(폴더·비정규 파일 거절, 사라진 파일의 전송 거절, 고른 로컬 파일이 바뀌지 않음, 한도 초과 개별 거절, 시그니처가 다른 파일 거절, 정리 대상이 `sent` 없는 붙여넣기 디렉터리뿐임, 발신자 제한).
- [ ] M3. runner·prompt: `conversation:models {root, runtime}`(P1 형식 해석, root를 캐시 키에), 고른 모델·effort로 실행하고 index에 기록, `turnPrompt` context를 `{root, canvas}`로 좁힘, `subject` 없는 `newDesign`에 홈 고정 문단, 첨부 목록을 untrusted 데이터 필드로 직렬화.
  - 검증: `npm --prefix app test`의 runner·prompt 테스트 통과(기존 fixture와 fake ACP 서버; 프롬프트에 connectionId·accountId·profile·configDir·sessionId가 없음; 홈 고정 문단은 `user.message`와 제목에 없음; 최대 첨부 10개 직렬화), `npm --prefix app run typecheck` 통과.
- [ ] M4. `newDesign` 바인딩(design §7.3): 수락 때 `canvasesAtStart` 저장, 시작 시점 목록에 없던 캔버스만, 턴 진행 중이거나 이번 실행에서 막 끝난 대화만, 후보가 여럿이면 가장 최근 대화.
  - 검증: `npm --prefix app test`의 service 테스트 통과(캔버스를 만들지 않은 옛 대화가 새 캔버스를 가져가지 않음, 시작 전부터 있던 캔버스는 묶지 않음, 두 대화 중 최근 대화).

── commit: `feat(app): accept free text, models, effort and attachments in new conversations` ──

## U. UI

- [ ] U0. 공용 변형과 토스트(`app/src/renderer/ds/controls.css`, `ds/surfaces.css`, `Toast.tsx`, `styles.css`). 공통 결정 10의 공용 요소 변경이며 2026-10-29 사용자가 승인했다.
  - 버튼 `quiet`: 배경 `--affordance-backdrop-hover`와 `--blur-md` 배경 블러(reduced transparency에서는 `--affordance-subtle`, 블러 없음), hover는 `--affordance-backdrop-hover` 한 겹 추가(헤더 탭과 같음, `--time-state` 전환), pressed는 `--affordance-backdrop-pressed` 한 겹, 글자 `--text-standard`(추천 프롬프트; 그 아이콘의 accent는 홈 CSS).
  - 버튼 `trigger`: 평소 채움 없음, sm 높이에서 좌우 8px(`--space-2`), hover·열림(`data-state="open"`, `aria-expanded="true"`)에서 `--affordance-backdrop-hover`(프로젝트·모델·effort·워크트리 트리거).
  - 아이콘 버튼 크기 `xs`(`--size-control-xs` 24px, 아이콘 `--size-icon-sm`, pill 모서리, 칩 ×)와 아이콘 버튼 변형 `accent`(Send: `--affordance-accent` 채움, hover `-hover`, pressed·열림 `-pressed`, disabled는 기존 역할).
  - 화면 CSS에서 공용 버튼의 여백·배경을 덮어쓰지 않는다. `quiet`·`trigger`·`accent`는 공용 hover·pressed 규칙의 `:not()` 제외 목록에 넣는다. 초안 1차에서 이 규칙이 우선순위로 이겨 실제 hover에서 칩이 불투명해졌다(2026-10-29). ghost disabled 투명 규칙에서도 `accent`를 뺀다.
  - `ds/checks.test.ts`의 `accentPlaces`에 고른 프리셋 칩·Send·추천 프롬프트 아이콘·홈 그라디언트·드롭 외곽선·LNB 상태 슬롯을 더한다.
  - 토스트(design §7.1): `.doan-toast`를 메시지·동작 한 줄(동작 오른쪽)로, `Toast.tsx` 동작 버튼을 `prominent` sm으로, `.toast` 위치를 창 오른쪽 아래(`--space-4`)로 바꾸고 워크스페이스 bottom 64px 규칙을 지운다.
  - 검증: `npm --prefix app test`(ds 대비·변수·accent 자리 검사, Toast 테스트의 동작 버튼 변형) 통과. 실제 포인터 hover의 computed `background-color`와 토스트 위치는 V2 `/design-sync`에서 홈·워크스페이스 둘 다 측정한다.
- [ ] U1. 토큰: 초안 단계에서 `app/src/renderer/tokens.css`에 더한 토큰(`--surface-accent-subtle`, `--text-accent-subtle`, `--size-icon-sm`, `--size-icon-lg`, `--size-control-xs`)을 구현 CSS에서 리터럴 대신 쓴다. 같은 값의 토큰이 없는 리터럴이 둘 이상의 컴포넌트에서 반복되면 DESIGN.md 'Tokens first' 규칙(목적별 이름 계열, 기존 값 불변, DESIGN.md 토큰 목록에 한 줄)에 따라 토큰을 더하고, 한 컴포넌트만 쓰면 컴포넌트 상수로 둔다.
  - 검증: `npm --prefix app test`(ds `checks.test.ts`) 통과. `.scratch/buzz-home/token-literals.mjs`(design §14와 같은 분류 기준으로 새 홈 CSS의 px 리터럴을 토큰 값과 대조)에서 같은 값의 토큰이 있는 리터럴 0건.
- [ ] U2. `agentAuthView.ts`: 홈 선택기용 동작 없는 짧은 상태 문구(design §4.3).
  - 검증: `npm --prefix app test`(agentAuthView 테스트: readiness cause별 짧은 문구, 온보딩 문구 불변) 통과.
- [ ] U3. `HomeComposer.tsx`와 홈 교체: 입력·도구 줄·선택기·프리셋 팝오버(탭·검색)와 `/` combobox·첨부 칩·드롭·Cmd+V·전송·이유 줄·거절 notice, 장식 배경, 인사 문구, 추천 프롬프트. 홈 카드·체크리스트·배너 제거와 그 orphan CSS 삭제, `app/src/setup/homeAlerts.ts`와 그 테스트 삭제(design §6). `ProblemActions` 등 다른 화면이 쓰는 export와 `homeCards.ts`는 유지.
  - 검증: `npm --prefix app test`(Home·HomeComposer 컴포넌트 테스트: 카드·체크리스트·배너 없음, Tab 순서, `/` combobox의 ↑/↓·Enter·Tab·Escape와 재진입 금지, 탭 ←/→, 포커스 이동, 칩 ×·Backspace와 알림, Cmd+V 세 경우, 입력창 위 폴더 드롭이 프로젝트 추가로 가지 않음) 통과, `npm --prefix app run typecheck` 통과, `rg -n homeAlerts app/src` 결과 0건.
- [ ] U4. `ConversationStrip.tsx`: 상태줄 컴포넌트(Overview·캔버스 화면 모두).
  - 검증: `npm --prefix app test`(컴포넌트 테스트: 권한 선택지 버튼이 `answerConversationPermission`을 부름, Stop이 `interruptConversation`을 부름, Dismiss, `Edit on Home`, `role="status"` 갱신과 권한 요청 `alert` 한 번, Allow 자동 포커스 없음과 답한 뒤 Stop 포커스) 통과.
- [ ] U5. `App.tsx`·`ShellSidebar.tsx` 연결: Home을 LNB가 있는 셸 안에 두기(현재 프로젝트 표시 없음), LNB 상태 슬롯, 온보딩 완료 root 인계와 입력창 포커스, 전송 뒤 이동(전환 보호·목록 읽기 대기)과 `Started in` 토스트, 첫 캔버스 확인(`conversation:forCanvas`)과 자동 열기·토스트, 다른 화면의 권한 요청 토스트(Open은 대화 id), 마지막 요청 되돌리기, 진행 중 프로젝트 제거 확인, 추가·중복 프로젝트의 선택기 선택과 LNB 행 강조, ui-state 저장.
  - 검증: `npm --prefix app test`(App 테스트: 온보딩 인계 포커스가 `beforeWizard` 복귀보다 우선, 전송 거절 시 홈 유지, 이동 중 사람의 다른 이동 우선과 `Started in` 토스트, 사람이 다른 캔버스를 열었으면 자동 열기 안 함, 권한 요청 슬롯이 토스트가 사라진 뒤에도 남음, 진행 중 제거의 확인·취소, `Edit on Home`이 초안이 있으면 확인) 통과.

── commit: `feat(app): replace home with the conversation composer` ──

## V. 실제 앱 확인

- [ ] V1. `/runtime-test`: 격리 앱에서 (a) 홈 진입·인사 문구·입력창 포커스·LNB, (b) 프리셋 팝오버·탭·`/`, (c) 첨부 추가(선택·드롭·붙여넣기)·거절·삭제, 입력창 위 폴더 드롭이 프로젝트 추가로 가지 않음, 로컬 파일 불변과 붙여넣기 파일 정리, (d) 공급자 하나로 프리셋 칩 + 첨부 이미지 요청 전송 → 워크스페이스 이동 → 상태줄 진행·권한 요청 응답 → 첫 캔버스 자동 열기와 에이전트의 프리셋 읽기, (e) 모델·effort 선택이 실행에 반영됨, (f) 다른 화면에서 권한 요청 슬롯·토스트, (g) 실패 뒤 `Edit on Home`. (d)–(g)는 실제 로그인이 필요해 사용자 허락 뒤 실행한다.
  - 검증: 각 항목의 스크린샷과 결과를 `.scratch/runtime-test/`에 남기고, 통과·미도달 표면을 PRODUCT §6에 기록.

── commit: `docs(product): record buzz-home runtime results` ──

- [ ] V2. `/design-sync`: 확정 초안 26 프레임(이전 CLI 상태 제외)과 구현을 측정해 맞춘다. 그라디언트 위 인사 문구·placeholder 대비 4.5:1, 실제 포인터 hover, 토스트 위치를 포함한다. DESIGN.md에 홈 절을 새로 쓰고 'Projects home'·'Settings and Home setup'의 Home 부분을 대체 표시한다. 한계를 기록한다(renderer 새로고침 시 상태줄·슬롯·마지막 요청 소실과 프로젝트당 1개 제한 해제, start 대기 중 취소 불가, 붙여넣기 파일이 다음 시작까지 남음). 홈과 온보딩 Agent 단계·Quick Open의 용어를 대조한다.
  - 검증: `/design-sync` 리포트의 남은 차이 0 또는 DESIGN.md의 문서화된 차이, `grep -n 'Projects home' docs/DESIGN.md`가 대체 표시를 가리킴.

── commit: `fix(app): match buzz-home to its draft` (코드 수정) / `docs(design): record buzz-home measurements` ──

- [ ] V3. 정적 게이트와 agent-eval.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과(eval/이 바뀌지 않았으면 `--eval` 불필요). `npm --prefix app run package` 다음 `node eval/run.ts --scenarios D1,D2,D2b,D3,D3b,D4,D4b,D5,D6,D7,D7b,D8,D9,D10,D10b,D10c,D11,D11b,D11c,D11d,D12 --round buzz-home-261029` (실제 모델을 써서 사용자 허락 필요; id는 `eval/scenarios/`의 D 시나리오 전부, 2026-10-29 확인) 결과를 `docs/USABILITY-EVAL.md`에 기록.

── commit: `docs(eval): record buzz-home agent-eval round` ──

## Z. 승격과 정리

- [ ] Z1. 결론을 승격한다(영어).
  - PRODUCT: §3 In scope 7의 'Not yet built'에서 홈 제거; §5 항목 0(체크리스트·배너 제거, 외부 연결 상태는 Settings > Connections에서만)·항목 1(홈 카드 → 대화 시작 화면, Home의 LNB); §5 Skills 13(프리셋 UI 완료, 그룹); §6 PoC·실제 앱 결과; §7 결정 줄(spec 'PRODUCT §7에 기록할 결정'의 모든 항목; 2026-10-27 doan-design-skills의 '추천 UI 없음'을 '고정 규칙 추천, 보내기는 사람'으로 고쳐 대체 표시); §8: 프리셋 목록의 대상 필요 여부 필드(doan-design-skills 후속).
  - ARCHITECTURE §7: 'Home, workspace and project IPC'의 홈 서술과 'Toasts'(아래 가운데 → 오른쪽 아래, 동작 오른쪽 `prominent`), 대화 IPC 표(`newDesign` 텍스트, `model`, `effort`, `attachments`), `conversation:models {root, runtime}`, 바인딩 규칙, `turnPrompt` context·홈 고정 문단·첨부 필드, 'Design preset reads'의 'no renderer UI yet' 삭제와 요약 형식(`group`), 첨부 저장·IPC·정리, ui-state·index·이벤트의 선택 필드. §12 목록 결과의 `group`.
  - DESIGN.md: 'Toast' 규칙, 공용 변형(`quiet`·`trigger`·icon `xs`·icon `accent`), 홈 절.
  - `docs/DIRECTORY.md`: 새 renderer 파일(`HomeComposer.tsx`, `homeComposer.ts`, `ConversationStrip.tsx`, `conversationStrip.ts`, `homeConversations.ts`), main `attachments.ts`, `.doan/canvases/buzz-home.html`, 지운 `setup/homeAlerts.ts`.
  - 부모: `docs/features/buzz-restyle/tasks.md` C3 체크; C8에 임시 상태줄·LNB 슬롯·프로젝트당 1개 규칙 대체, 입력창 재사용 구조, 토스트 Open의 대화 id 인계; C9에 '연결된 공급자가 없으면 홈에서 로그인할 길이 없음'과 짧은 상태 문구 자리에 동작 붙이기 인계; 공통 결정 2 요약에 홈 예외; 앱 전체 후속으로 입력창 오른쪽 클릭 편집 메뉴.
  - 검증: 항목별 grep. `grep -n 'conversation:models' docs/ARCHITECTURE.md`, `grep -n '"group"\|group' docs/ARCHITECTURE.md`(§12), `grep -n 'canvasesAtStart' docs/ARCHITECTURE.md`, `grep -n 'bottom-right\|right of the window' docs/ARCHITECTURE.md`, `grep -n 'buzz-home' docs/PRODUCT.md`, `grep -n 'HomeComposer' docs/DIRECTORY.md`, `grep -n 'C9' docs/features/buzz-restyle/tasks.md`가 각각 결과를 보이고, `grep -n 'no renderer UI yet\|user-facing UI is not done' docs/PRODUCT.md docs/ARCHITECTURE.md` 결과 없음.
- [ ] Z2. `docs/features/buzz-home/`를 지운다.
  - 검증: 디렉터리 없음.

── commit: `docs(product): promote buzz-home` / `docs(architecture): promote buzz-home` / `docs(design): promote buzz-home` / `docs(directory): add buzz-home files` / `docs(feature): complete buzz-home` ──
