# buzz-home — tasks

순서는 PoC → 초안 → 형식·순수 함수 → main I/O → UI → 실제 앱 확인 → 승격이다. 사전 feature로 나누지 않고 한 feature로 진행한다(2026-10-29 user). `/orchestrate`의 배치도 이 순서로 나누고, P1·P2 결과가 PRODUCT §6에 기록되기 전에는 M 배치를 시작하지 않는다. PoC 결과가 design §4.7·§4.8과 다르면 그 절을 먼저 고치고 사용자에게 확인한다. `/design-draft`는 `/feature-review` 뒤, `/tdd` 전에 feature 브랜치에서 실행하고, 사용자가 앱에서 초안을 확인한 뒤 구현한다(AGENTS.md Workflow). 실제 공급자 실행은 실제 HOME의 로그인을 쓰므로 매번 사용자 허락을 받는다.

## P. PoC (구현 전, design §12)

- [ ] P1. 모델·effort: 다섯 공급자의 모델 목록과 effort 단계의 출처·형식·비용, 고른 값으로 새 세션 시작, 다음 턴의 값 유지(design §4.7). 격리 userData·`DOAN_RUNTIME`, `.scratch/buzz-home/poc-models/`.
  - 검증: 명령 미정 — 사용자 확인 필요(실제 로그인 필요). 통과 기준: 공급자별 '목록 있음(형식)/Default만'과 선택 실행 결과가 PRODUCT §6에 날짜와 함께 기록됨.
- [ ] P2. 첨부: 다섯 공급자가 요청에 적힌 저장소 밖 절대 경로의 이미지·텍스트·PDF를 읽고 이미지 내용을 보는지, 기본 권한 설정의 권한 요청 여부와 거절 이벤트(design §4.8). `.scratch/buzz-home/poc-attachments/`.
  - 검증: 명령 미정 — 사용자 확인 필요. 통과 기준: 공급자별 결과와 확정한 한도가 PRODUCT §6에 기록됨. 이미지를 경로로 볼 수 없는 공급자는 이미지 입력 형식을 더할지 사용자에게 묻는다.

── commit: `docs(product): record buzz-home model and attachment PoC` ──

## D. 초안

- [ ] D1. `/design-draft`로 `.doan/canvases/buzz-home.html`을 새로 그린다. design §3·§3.1의 상태 프레임 전부, Welcome 그라디언트 방식 배경, 인사 문구, 워크스페이스 임시 상태줄(§7)의 상태들. Buzz 기준 커밋 파일과 읽은 프리셋을 초안 메모에 남긴다. 기존 `projects-home.html`은 고치지 않는다.
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 없음, `go run ./cli/cmd/doan ls --repo .`에 `buzz-home` 표시. 사용자가 앱에서 초안 확인.

── commit: `docs(canvas): draw buzz-home draft` ──

## T. 형식과 순수 함수 (`/tdd` → `/implement`)

- [ ] T0. 프리셋 그룹(design §4.4a): `catalog.json`에 `group`, `Summary`에 `group`, 목록 fixture 갱신, main `designSkills.ts`가 `group`을 남기고 없는 결과도 받음.
  - 검증: `go test ./...`(다섯 값·비지 않은 그룹·연속 순서·요약 키 집합), `npm --prefix app test`(designSkills 해석: `group` 있음/없음, 계약 외 필드 제거) 통과.

── commit: `feat(cli): group design presets` ──

- [ ] T1. 기기 로컬 형식 결정과 판독기: ui-state `home: {lastRoot?, lastProvider?, models?}`, 대화 index의 모델 필드, `user.message` 첨부 메타데이터. 각 판독기가 모르는 필드를 다루는 방식을 읽고, 버전 유지/상승을 정한다(상승이면 사용자 확인 후 PRODUCT §7 기록 task 추가).
  - 검증: `npm --prefix app test`에서 기존 v1/v2 fixture 판독과 새 필드 round-trip 테스트 통과.
- [ ] T2. `homeComposer.ts`: `composeRequest`(프리셋 머리말, 홈 고정 문장), `presetPlaceholder`, `sendAvailability`, `defaultProject`, `defaultProvider`, `defaultModel`, `suggestedPresets`, `suggestedPrompts`, `searchPresets`, `presetListView`, `startErrorView`, `pickGreeting`, `slashQuery`, `isSubmitKey`, `attachmentLimit`, `attachmentChipView`, `modelPickerView`(로고·모델·effort), `defaultEffort`, `dropTarget`.
  - 검증: `npm --prefix app test` 해당 테스트 통과(IME 조합 Enter, 한도 경계 32,768, 프리셋 머리말 형식, 이전 CLI `usage_error`, 직전 인사 문구 제외).
- [ ] T3. `conversationStrip.ts`: `stripState`, `stripView`(시작·진행·권한·실패 코드별·중단·완료, 병합된 이벤트 기준).
  - 검증: `npm --prefix app test` 통과.

── commit: `feat(app): add home composer and conversation strip models` ──

## M. main

- [ ] M1. `conversation/ipc.ts`: `newDesign` 자유 텍스트 경로(§4.6), `model` 검증(마지막 목록에 있는 id만), 첨부 ID 검증. FirstPrompt `subject` 경로는 그대로.
  - 검증: `npm --prefix app test`의 ipc 테스트(subject 경로 회귀 포함) 통과.
- [ ] M2. `attachments.ts` + IPC `attachments:choose | add-paths | add-pasted | remove`: 로컬 파일 경로 확인(realpath·일반 파일, 복사 없음), 썸네일, 붙여넣기 파일 쓰기·50 MB 상한, 개수 한도, 전송 직전 재확인, 미전송 붙여넣기 정리(다음 시작), `mainOnly` 발신자 제한.
  - 검증: `npm --prefix app test` 통과(폴더·비정규 파일 거절, 사라진 파일의 전송 거절, 고른 로컬 파일이 바뀌지 않음, 한도 초과 개별 거절, 정리 대상이 붙여넣기 파일뿐임).
- [ ] M3. `conversation:models`와 runner 연결: 공급자별 모델 목록 해석(P1 형식), 고른 모델로 실행, 첨부 경로 목록을 untrusted 경계로 직렬화, index에 모델 기록.
  - 검증: `npm --prefix app test`의 runner·prompt 테스트(기존 fixture와 fake ACP 서버) 통과, `npm --prefix app run typecheck` 통과.

── commit: `feat(app): accept free text, models and attachments in new conversations` ──

## U. UI

- [ ] T5. 토큰: 초안 단계에서 `app/src/renderer/tokens.css`에 더한 역할·크기 토큰(`--surface-accent-subtle`, `--text-accent-subtle`, `--size-icon-sm`, `--size-icon-lg`, `--size-control-xs`)을 구현 CSS에서 리터럴 대신 쓴다. 구현 중 같은 값의 토큰이 없는 리터럴이 둘 이상의 컴포넌트에서 반복되면 DESIGN.md 'Tokens first' 규칙(목적별 이름 계열, 기존 값 불변, DESIGN.md 토큰 목록에 한 줄)에 따라 토큰을 더하고, 한 컴포넌트만 쓰면 컴포넌트 상수로 둔다. 기존 토큰 값은 바꾸지 않는다.
  - 검증: `npm --prefix app test`(ds `checks.test.ts`의 정의되지 않은 변수·대비 검사) 통과. 새 홈 CSS에서 같은 값의 토큰이 있는 px 리터럴이 0건인지 검사 스크립트로 확인(design §14의 분류와 같은 기준).
- [ ] U0. 공용 버튼 변형 두 개를 `app/src/renderer/ds/controls.css`에 더한다. `quiet`: 배경 `--affordance-backdrop-hover`와 `--blur-md` 배경 블러(reduced transparency에서는 `--affordance-subtle`, 블러 없음), hover는 `--affordance-backdrop-hover` 한 겹 추가(헤더 탭과 같음, `--time-state` 전환), pressed는 `--affordance-backdrop-pressed` 한 겹, 글자 `--text-standard`(추천 프롬프트; 그 아이콘의 accent는 홈 CSS). `trigger`: 평소 채움 없음, sm 높이에서 좌우 8px(`--space-2`), hover·열림(`data-state="open"`, `aria-expanded="true"`)에서 `--affordance-backdrop-hover`(프로젝트·모델·effort 트리거). disabled는 기존 역할. 공용 아이콘 버튼 크기 `xs`(`--size-control-xs` 24px, 아이콘 `--size-icon-sm`, pill 모서리, 칩 × 버튼)도 더한다. 화면 CSS에서 공용 버튼의 여백을 덮어쓰지 않는다. 두 변형은 공용 hover·pressed 규칙(`:not([data-ui-variant="prominent"], [data-ui-placement="chrome"])`, 불투명 `--affordance-subtle-hover`/`-pressed`)의 `:not()` 제외 목록에 넣는다. 초안 1차에서 이 규칙이 우선순위로 이겨 실제 hover에서 칩이 불투명해졌다(2026-10-29). 실제 포인터 hover의 computed `background-color`로 확인한다. 공통 결정 10의 공용 요소 변경이며 2026-10-29 사용자가 승인했다.
  - 검증: `npm --prefix app test`(ds 대비·변수 검사에 새 변형 포함) 통과.
- [ ] U1. `HomeComposer.tsx`와 홈 교체: 입력·도구 줄·선택기 셋·프리셋 팝오버와 `/`·첨부 칩·드롭·전송·오류 줄, 장식 배경, 인사 문구. 홈 카드·체크리스트 제거와 그 orphan CSS 삭제(design §6). `ProblemActions` 등 다른 화면이 쓰는 export는 유지.
  - 검증: `npm --prefix app test`(Home·HomeComposer 컴포넌트 테스트: 카드 없음, 키보드 순서, Escape, 칩 제거) 통과, `npm --prefix app run typecheck` 통과.
- [ ] U2. `App.tsx`·`ShellSidebar.tsx` 연결: Home을 LNB가 있는 셸 안에 두기(현재 프로젝트 표시 없음), 온보딩 완료 root 인계와 입력창 포커스, 전송 뒤 이동(전환 보호·목록 읽기 대기), 임시 상태줄, 첫 캔버스 자동 열기·토스트, 다른 화면의 권한 요청 토스트, 추가·중복 프로젝트의 선택기 선택과 LNB 행 강조, ui-state 저장.
  - 검증: `npm --prefix app test`(App 테스트: 온보딩 인계 포커스, 전송 거절 시 홈 유지, 이동 중 사람의 다른 이동 우선) 통과.

── commit: `feat(app): replace home with the conversation composer` ──

## V. 실제 앱 확인

- [ ] V1. `/runtime-test`: 격리 앱에서 (a) 홈 진입·인사 문구·입력창 포커스, (b) 프리셋 팝오버·`/`·이전 CLI 대체 표시, (c) 첨부 추가(선택·드롭·붙여넣기)·거절·삭제, 로컬 파일 불변과 붙여넣기 파일 정리, (d) 공급자 하나로 프리셋 칩 + 첨부 이미지 요청 전송 → 워크스페이스 이동 → 상태줄 진행·권한 요청 응답 → 첫 캔버스 자동 열기와 에이전트의 프리셋 읽기, (e) 모델 선택이 실행에 반영됨. (d)(e)는 실제 로그인이 필요해 사용자 허락 뒤 실행한다.
  - 검증: 각 항목의 스크린샷과 결과를 `.scratch/runtime-test/`에 남기고, 통과·미도달 표면을 PRODUCT §6에 기록.
- [ ] V2. `/design-sync`: D1 초안과 구현을 design §3.1의 상태별로 측정해 맞추고, DESIGN.md에 홈 절을 새로 쓰고 'Projects home'·'Settings and Home setup'의 Home 부분을 대체 표시한다. 홈과 온보딩 Agent 단계·Quick Open의 용어를 대조한다.
  - 검증: `/design-sync` 리포트의 남은 차이 0 또는 DESIGN.md의 문서화된 차이, `grep -n 'Projects home' docs/DESIGN.md`가 대체 표시를 가리킴.
- [ ] V3. 정적 게이트와 agent-eval.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --eval` 통과. CLI 목록 출력이 바뀌므로 `/agent-eval`의 design-skill 시나리오 결과를 `docs/USABILITY-EVAL.md`에 기록.

── commit: `docs(design): record buzz-home measurements` ──

## Z. 승격과 정리

- [ ] Z1. 결론을 승격한다(영어).
  - PRODUCT: §3 In scope 7의 'Not yet built'에서 홈 제거, §5 항목 0(체크리스트·배너)·항목 1(홈 카드 → 대화 시작 화면), §5 Skills 13(프리셋 UI 완료), §6 PoC·실제 앱 결과, §7 결정 줄(홈 카드 제거와 행방, 홈 전용 타원 그라디언트(Welcome 밖 accent 예외), 고른 프리셋 칩과 추천 프롬프트 아이콘의 accent 예외, 인사 문구, 프리셋 요청 문장 형식, 공급자 보고 모델만 표시, 첨부 기기 로컬 보관·한도, 홈 대화 동시 1개, 임시 상태줄과 buzz-conversation 대체 인계, 추천 프롬프트 3개(채우기만, 같은 날 '제안 카드 없음' 결정 대체), 프리셋 행의 scope 표시와 프리셋 선택 뒤 placeholder, 홈 요청의 `doan active` 제외 문장). PRODUCT §8: 프리셋 목록의 대상 필요 여부 필드(doan-design-skills 후속). PRODUCT §5 Skills 13과 §7에 프리셋 그룹. ARCHITECTURE §12 목록 결과의 `group`, §7 'Design preset reads'의 요약 형식.
  - ARCHITECTURE §7: 'Home, workspace and project IPC'의 홈 서술, 대화 IPC 표(`newDesign` 텍스트, `model`, 첨부), `conversation:models`, 'Design preset reads'의 'no renderer UI yet', 첨부 저장·IPC·정리, ui-state 키.
  - 부모: `docs/features/buzz-restyle/tasks.md` C3 체크, C8에 임시 상태줄 대체 인계 한 줄, 공통 결정 2 요약에 홈 예외.
  - 검증: `grep -n 'buzz-home' docs/PRODUCT.md docs/ARCHITECTURE.md`에 위 항목이 있고, `grep -n 'no renderer UI yet\|user-facing UI is not done' docs/PRODUCT.md docs/ARCHITECTURE.md` 결과 없음.
- [ ] Z2. `docs/features/buzz-home/`를 지운다.
  - 검증: 디렉터리 없음.

── commit: `docs(product): promote buzz-home` / `docs(architecture): promote buzz-home` / `docs(feature): complete buzz-home` ──
