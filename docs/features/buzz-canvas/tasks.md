# buzz-canvas — tasks

선행: `buzz-shell`, `buzz-conversation`(둘 다 main 병합). 순서는 초안 → 형식 → 순수 함수 → renderer → 제거 → 실제 앱 → 승격이다. 커밋 경계는 `── commit ──`으로 표시한다. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 의존성은 더하지 않는다(design §1).

## D. 초안

- [x] D1. `/design-draft buzz-canvas`: `.doan/canvases/buzz-canvas.html`(design §0 프레임). 사용자가 외관을 확정했다(2026-11-01). feature-review 뒤 Answer를 빼고, 패널 빈 본문을 한 줄로 줄이고, `conversation-menu` 참고 프레임을 더했다.
  - 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`(buzz-canvas 지적 0, 프레임 id가 design §0과 같음).

── commit: `docs(design): buzz-canvas draft` ──

## S. 형식

- [ ] S1. `UiState.rightPanel = { open, width }`를 공유 파서 `app/src/restore/uiState.ts`(`parseUiState`, `savedUiState`)에 더한다. main 저장소(`app/src/main/uiState.ts`)가 renderer의 저장을 이 파서로 검증하므로, 저장·읽기에서 `rightPanel`이 보존되는지 테스트한다. 저장은 ui-state를 읽은 뒤에만 한다(`memoryRead`와 같은 방식).
  - 검증: `npm --prefix app test`(빠진 값, 잘못된 타입, 범위 밖 폭, 왕복, main 저장소 보존), `npm --prefix app run typecheck`.

── commit: `feat(restore): remember the canvas conversation panel` ──

## T. 순수 함수

- [ ] T1. `frameDrawerView`, `zoomControlView`, inset을 받는 `fitWidth`·`fitFrame`(design §3 표의 경우를 모두). `viewport.test.ts`의 32px 고정값을 위 56·좌우 32·아래 64로 바꾼다. 50%·200%는 `zoomAt`에 넘기는 배수로 고정한다.
  - 검증: `npm --prefix app test`.
- [ ] T2. `panelWidth(saved, shellWidth)`·`nudgePanel(width, key, bounds)`(design §3 표).
  - 검증: `npm --prefix app test`.
- [ ] T3. `dotGrid`·`dotScale`·`autoCursor`·`partitionDots`(malmoi `lib/signin/dot-field.ts`의 경우를 doan 테스트로, doan 값으로).
  - 검증: `npm --prefix app test`.
- [ ] T4. `agentPresence(list, canvas)`. `canvasConversationRows.ts`의 `sameCanvas`를 export해 쓴다. 문구는 `conversationList.ts`의 "<Provider> is working"/"<Provider> needs your answer"와 같다.
  - 검증: `npm --prefix app test`(design §3 표의 경우, 특히 목록 읽기 실패 뒤 직전 상태 유지, 옮겨진 캔버스).

── commit: `feat(renderer): canvas header, panel, dot field and agent presence models` ──

## R. renderer

- [ ] R1. 캔버스 헤더와 프레임 서랍: Overview 헤더 상자의 헤더(캔버스 / 서랍, 구분선 없음, 목록에 없는 페이지·프로젝트 문제에서는 캔버스 이름 없이 "Frames"), 서랍 트리거("번호. 이름", 비활성 이유), 팝오버 목록(roving tabindex, `aria-current`, 지금 보는 행 스크롤·포커스, typeahead, 말줄임과 `title`, 잘린 목록 안내). `CanvasController.selectFrame(index, id)`로 바꾸고 id 해석을 테스트로 고정한다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 경우: 다시 로드로 순서가 바뀐 뒤 고른 행(id로 해석), 고른 id가 사라짐(아무것도 하지 않음), 중복 id, 목록이 열린 사이 다시 로드(포커스 행 id 유지, 없으면 지금 보는 행, 비면 닫음), 열린 채 로드 실패(포커스를 캔버스 region으로).
- [ ] R2. 배율 컨트롤러: −·값(메뉴 트리거)·+, 메뉴 Fit ⌘1·100% ⌘0·50%·200%(`zoomAt`), 렌더된 보드가 없을 때만 "—"와 비활성, 아이콘 버튼 툴팁(design §2 '툴팁').
  - 검증: `npm --prefix app test`.
  - 경우: 프레임 0개 캔버스(동작), 메뉴 Esc(메뉴만 닫힘 — runtime probe로, V2).
- [ ] R3. 도구모음(`role="toolbar"`, Tab 정지점 하나, ←/→, 선택 피커 `aria-pressed="true"`·툴팁), Tab 순서와 포커스 유실 규칙(design §2 'Esc와 포커스'), 보드 위 컨트롤의 휠·핀치를 보드 뷰로 넘김.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(renderer): canvas header, frame drawer, zoom and tools` ──

- [ ] R4. 캔버스 대화 패널 껍데기와 틀: 오른쪽 열을 껍데기(Overview `aside.right.ov-right` + `h2.phead.rp-head` "Conversation", 우상단 닫기, 한 줄 빈 본문)로 바꾼다. 캔버스 페이지에서 `RightPanel`을 그리지 않고 코멘트 세션(`useComments`)을 열지 않는다(컴포넌트는 남김). 그리드 세 번째 열 폭 CSS 변수, 직접 만든 경계 손잡이(끌기, 덮개, 커서, ←/→/Home/End, 두 번 클릭, 끄는 중 Esc, 최소에서 멈춤, malmoi 모양), 접혔을 때만 캔버스 헤더의 열기, 닫기·열기 포커스 이동, 접힌 상태의 모서리, `UiState.rightPanel` 저장·복원. 첫 Fit을 열 폭이 적용된 뒤로 미룬다(design §2 '첫 Fit').
  - 검증: `npm --prefix app test`(저장 폭이 최대보다 클 때 보이는 폭과 저장값 분리, 기본·최소 `max(320px, 28dvw)`, 960 창 최대 356, 폭 변경 뒤 뷰 기준 유지, 캔버스 페이지에 Inspector·Comments·핀 없음, 요소 선택이 `selection:set`을 그대로 부름), `npm --prefix app run typecheck`, `npm --prefix app run build`.

── commit: `feat(renderer): canvas conversation panel shell` ──

- [ ] R5. 에이전트 작업 표시: `agentPresence`로 이 캔버스의 현재 대화가 `running`·`waiting`이면 가장자리 그라디언트(8초 숨쉬기), 점 필드(캔버스 2D, 자동 순회, 포인터 무시, 숨김·덮개·창 숨김에서 정지, 반경 밖 묶어 칠하기), 보드 위쪽 가운데 안내(점, 문구, Stop). Stop → `interruptConversation`, "Stopping…"(`aria-disabled`)은 `phase`가 `ended`가 될 때까지, `ConversationError`면 Stop 복귀와 토스트. 읽힌 캔버스가 있는 상태 화면에서도 보임. 동작 줄이기·투명도 줄이기.
  - 검증: `npm --prefix app test`(다른 캔버스·프로젝트 대화는 표시 없음, 턴 끝에 사라짐, Stop 오류, 목록에 없는 페이지에서 없음), `npm --prefix app run build`.

── commit: `feat(renderer): agent working indicator on the canvas` ──

- [ ] R6. 보드 바탕, 오버레이(`.mark`·`.dims`·이동 하이라이트), `.canvas-status`(공용 notice·스피너·panel 버튼), 알림 자리(보드 위쪽 가운데), 겹침 순서, 토스트 16px. Fit과 프레임 이동이 inset을 쓴다.
  - 검증: `npm --prefix app test`, `npm --prefix app run build`.

── commit: `feat(renderer): buzz canvas board and notices` ──

## X. 제거

- [ ] X1. `.zctl` 띠, 캔버스 위 Reload 버튼, 변경 표시(`.updated` 마크업과 규칙, `CanvasState.label`, `canvasView.ts`의 `bottomLabel`과 그 테스트), 쓰지 않게 된 `.zoom`·`.canvas-notice` 규칙을 지운다. `activity.ts`는 `RightPanel`이 쓰므로 남긴다.
  - 문자열 검색(POSTMORTEM 2026-10-30): `grep -rn "zctl\|\.zoom\b\|canvas-notice\|\.updated\b\|bottomLabel\|state\.label\|Reload canvas" app/src app/runtime`.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, 위 grep에서 남은 줄이 모두 의도한 것.

── commit: `refactor(renderer): drop the bottom canvas strip and change label` ──

## V. 실제 앱

- [ ] V1. `/design-sync`: `buzz-canvas.html`의 프레임(`conversation-menu` 참고 프레임 제외)을 빌드한 앱에서 맞추고 고친다.
  - 통과 조건: 초안과의 차이가 0이거나 DESIGN 편차로 기록됨. 960×600과 1238×780에서 헤더·도구모음·작업 안내·알림·토스트 사각형이 겹치지 않음(960은 패널 최대 폭에서도). Fit·서랍 이동·Quick Open 이동 뒤 프레임이 inset 안에 있음. 어두운·밝은·violet 픽스처 위에서 외곽선·치수·하이라이트가 보임. 투명도 줄이기에서 안내 바탕이 불투명.
  - 검증: `/design-sync` 절차의 측정 스크립트(`node .scratch/design-sync/<screen>/measure.mjs`).

── commit: `fix(renderer): match the buzz-canvas draft` ──

- [ ] V2. `/runtime-test`(빌드한 앱, 격리 userData·HOME·SHELL, 결과는 `.scratch/runtime-test/buzz-canvas/`):
  - 서랍: 스크롤하면 라벨이 바뀜, 프레임을 고르면 `DOAN_RUNTIME=<tmp>/runtime.json <cli> active --json --repo <tmp repo>`가 그 프레임을 돌려줌, Quick Open 이동 뒤 선택 불변, Esc 뒤 메뉴만 닫히고 포커스가 연 버튼으로.
  - 배율: 메뉴 Esc 뒤 선택이 남음, ⌘R과 로드 실패 Reload가 동작.
  - 패널: 닫기 → 열기 버튼이 생기고 이전 폭으로 복원, 끌기·방향키, 다시 시작해도 열림 상태와 폭이 남음, 저장 폭 400·접힘에서 Overview → 캔버스를 열어도 첫 Fit이 맞음.
  - 오른쪽 패널에 Inspector·Comments가 없고, 요소를 고르면 `doan active`가 그 선택을 돌려줌.
  - 작업 표시: 나타남·사라짐, Stop과 "Stopping…", 동작 줄이기에서 점·숨쉬기·점 필드 정지(computed style). 이 캔버스의 대화를 실제로 돌리지 못하면 미검증으로 남긴다(로그인한 공급자가 필요하면 memory 'provider login probes' 절차).
  - 빌드 CSP에서 화면이 비지 않음.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과 뒤 `/runtime-test` probe.

## Z. 승격과 정리 (문서마다 커밋)

- [ ] Z1. PRODUCT를 현재 규칙으로 고친다.
  - §3 In scope 1·2와 "A canvas page does not show its conversation yet", "The comment UI and the §4 loop remain the review path": 캔버스 페이지에 Inspector·Comments 화면이 없고 작업 표시가 있다는 현재 상태.
  - §4 Loop의 코멘트 단계.
  - §5 항목 2·3: 캔버스 헤더, 서랍(이동하고 선택함), 배율 컨트롤러와 메뉴, 도구모음의 선택 피커, 에이전트 작업 표시(조건, 문구, Stop).
  - §5 항목 4: Canvas info와 Inspector가 캔버스 페이지에 없음(선택과 `doan active`는 유지).
  - §5 항목 5: "Activity and bottom label"을 지우고, 캔버스 페이지에서 코멘트 화면이 빠졌다는 사실.
  - §6 Open questions: "에이전트가 작업 중인 곳을 캔버스에서 실시간으로 짚기(사용자는 실시간을 원함, 근거 PoC 필요, 다시 로드 때 프레임 비교는 대안)"와, 실제 앱에서 확인하지 못한 표면(V2의 미검증 항목).
  - 검증: `grep -n "bottom label\|Frame jumps are available\|right panel's Canvas section" docs/PRODUCT.md`의 남은 줄이 모두 현재 상태와 맞음.
  - ── commit: `docs(PRODUCT): canvas page header, drawer and agent indicator` ──
- [ ] Z2. ARCHITECTURE: §3 'Canvas view'의 32px 여백을 inset으로, 첫 Fit 규칙, 'Jump and current frame'에 서랍의 `selectFrame(index, id)`, 'Actions and focus'의 캔버스 안 Tab 순서, §7 UiState의 `rightPanel`과 저장 시점, 캔버스 페이지가 코멘트 세션을 열지 않음.
  - 검증: `grep -n "margin 32px" docs/ARCHITECTURE.md` 결과 없음, `grep -n "rightPanel" docs/ARCHITECTURE.md`에 줄이 있음.
  - ── commit: `docs(ARCHITECTURE): canvas insets, frame drawer and panel memory` ──
- [ ] Z3. DESIGN.md: 'Canvas area and right panel'을 캔버스 헤더·보드·도구모음·대화 패널 껍데기·손잡이·작업 표시·툴팁의 측정값으로 바꾸고, 'Select and inspect'의 오버레이 부분에서 "buzz-ds 이전" 표시를 걷는다(Inspector 부분은 `buzz-inspector` 몫으로 남김). 'Revision continuity'의 owner를 `buzz-canvas-conversation`으로 옮긴다. 참고 출처(malmoi 손잡이·DotField, ego)를 적는다.
  - 검증: `grep -n 'buzz-ds 이전' docs/DESIGN.md`에 남은 줄이 모두 다른 자식 몫.
  - ── commit: `docs(DESIGN): record the buzz canvas` ──
- [ ] Z4. 부모 `buzz-restyle`을 고친다.
  - tasks C8 체크, C9·C12 서술 갱신(Inspector 재배치, 코멘트 화면은 캔버스 페이지에서 이미 빠짐, 대화 드롭다운 모양은 초안 `conversation-menu`에 있음, Answer·실패 알림·대화 상태는 대화 패널 몫).
  - spec '캔버스 페이지 방향': "캔버스 위 컨트롤: 좌상단 서랍, 우상단 배율"을 "보드 밖 흰 캔버스 헤더에 캔버스 / 서랍과 배율, 보드 아래 가운데 도구모음"으로.
  - spec 표 8번: Panel 결정 결과, 에이전트 작업 표시, 오른쪽 패널 틀(접기·폭)과 껍데기, 선행 `buzz-conversation`을 더하고 '입력창 요소 피커가 쓰는 선택 모드'를 12번으로 옮긴다.
  - spec 표 12번: '오른쪽 패널의 표시·숨김' 중 틀은 8번이 했다고 적고 자동으로 여는 규칙만 남긴다. 헤더 대화 드롭다운 동작, Answer, 실패 알림을 더한다.
  - 공통 결정 2: 에이전트 작업 표시(가장자리 그라디언트·점·안내 캡슐의 점)와 패널 손잡이 막대는 accent. 공통 결정 6: 캔버스 페이지의 Inspector·Comments 화면 제거 보존 예외.
  - design.md 'DESIGN.md 절과 담당' 표 갱신. `docs/features/buzz-canvas/`를 지운다.
  - 검증: `grep -n "C8\.\|좌상단\|Panel 안에 둘지" docs/features/buzz-restyle/*.md`의 남은 줄이 현재 상태와 맞음, 디렉터리가 없음.
  - ── commit: `docs(feature): complete buzz-canvas` ──
