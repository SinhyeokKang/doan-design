# canvas-selection-tools — tasks

순서: 테스트(red) → controller 전이 → CSS → 실제 앱 확인 → 문서 승격. 스키마·fixture 변경은 없다. 한 번의 `/ship`(`feat/canvas-selection-tools`)으로 진행한다. spec '결정' 1–5를 따른다(UI 초안 없이 R2에서 강도를 확인).

## T. 테스트 먼저 (`/tdd`)

- [ ] T1. `CanvasController.test.ts`에 Hand 전환 해제 테스트를 더한다: 툴바·H로 Hand가 되면 선택 `null`·`sendSelection(null)`·iframe `clear` 명령·notice 없음, Space down/up은 유지, Space drag 중 H는 pointerup 뒤 해제, H 직전 클릭의 늦은 `select` 답장은 무시, Hand → V·Esc는 복원 없음, 런치 복원으로 Hand가 적용될 때도 해제.
  - 검증: `npm --prefix app test` — 새 테스트가 red.
- [ ] T2. 같은 파일에 pick 시작 해제 테스트를 더한다: `pick()` 성공 시 `clear`가 `pick-start`보다 먼저 가고 선택 `null`·`sendSelection(null)`, 실패 시 선택 유지, pick 완료·취소 뒤 선택 `null`과 이전 도구, locate는 선택을 바꾸지 않음.
  - 검증: `npm --prefix app test` — 새 테스트가 red(locate 테스트는 green).
- [ ] T3. 현재 규칙을 고정한 기존 테스트를 새 규칙으로 고친다: 'Esc in Hand turns Hand off before it clears the selection'(frame drawer로 Hand에서 선택한 경우로 Esc 순서를 다시 고정), 'Esc in a text field does not turn Hand off…', 'a picked element ends picking … without touching the selection', 'Esc while picking cancels only the pick … and keeps the selection', 'a click on the board margin while picking keeps picking and the selection'.
  - 검증: `npm --prefix app test` — 고친 테스트가 red, 나머지 기존 테스트 green.
- [ ] T4. CSS 고정 테스트를 더한다(`styles.css`를 읽는 기존 방식): `.mark.jump-highlight`의 3px, `--affordance-accent`·`--indigo-600` 그라디언트, `::before`의 `mask-composite: exclude`, reduced motion·reduced transparency·forced colors 블록. `ds/checks.test.ts` `violetAllowed`에 새 selector를 근거 주석과 함께 넣는다.
  - 검증: `npm --prefix app test` — CSS 테스트와 `accentPlaces`의 missing이 red.

── commit: `test: pin selection clearing on Hand and pick, and the accent jump highlight` ──

## I. 구현 (`/implement`)

- [ ] I1. `CanvasController`: `applyTool`과 drag 뒤 `pendingTool` 적용에서 `select` → `hand`일 때 해제 메서드 하나를 부른다(`transition` 안에서 `clear` 명령 → `clearSelection(false)` → `publish()`, 선택·`reanchor`가 없으면 명령 없음).
  - 검증: `npm --prefix app test` — T1과 T3의 Hand 관련 테스트 green.
- [ ] I2. `CanvasController.pick()`: 새 pick이 시작되는 분기에서 `armPick()` 전에 같은 해제를 하고, publish는 한 번만 한다.
  - 검증: `npm --prefix app test` — T2와 T3의 pick 관련 테스트 green.
- [ ] I3. `styles.css` `.mark.jump-highlight`를 design §3 값으로 바꾸고(`::before` 그라디언트 선, 요소의 링과 glow, 세 media 블록), `tokens.css`의 violet 사용처 주석을 고친다.
  - 검증: `npm --prefix app test`·`npm --prefix app run typecheck` green.

── commit: `feat(canvas): clear the selection on Hand and pick, accent jump highlight` ──

## R. 실제 앱 확인 (`/runtime-test`)

- [ ] R1. 격리 앱에서 선택 → H, 선택 → 툴바 Hand, 선택 → Space pan, 선택 → picker 켜기·취소·칩 넣기를 각각 해 보고, 매번 선택 표시와 격리 runtime의 `doan active --json`(AGENTS.md 'Commands'의 `DOAN_RUNTIME=…`)을 기록한다.
  - 검증: Hand·picker 뒤 `doan active`가 선택 없음, Space 뒤에는 선택 유지. 스크린샷과 로그는 `.scratch/runtime-test/canvas-selection-tools/`.
- [ ] R2. 강조 강도 비교: fixture 캔버스 네 개(흰 #ffffff, 어두운 #050507, 보라 #5b21b6, 사진·그라디언트가 섞인 frame)에서 칩 locate(사각형과 점)와 frame drawer jump를 실행하고, 0.3s(유지 구간)와 1.0s(사라지는 중)에 스크린샷을 찍는다. 같은 창 크기로 Home composer glow 스크린샷을 함께 남긴다. 렌더된 픽셀에서 선의 두 끝 색과 바로 바깥 배경의 대비를 읽고, reduced motion·reduced transparency·forced colors(Playwright `emulateMedia`)에서 한 장씩 찍는다.
  - 검증: 네 캔버스 모두에서 선 또는 흰 링이 배경과 3:1 이상. 스크린샷을 사람에게 보여 강도를 확인받는다. 조정이 필요하면 선 폭·glow 불투명도만 바꾸고 R2를 다시 한다.

## C. 리뷰와 마무리

- [ ] C1. `/code-review` → 필요하면 `/refactor`. 회귀를 고쳤으면 `/postmortem`.
  - 검증: 리뷰 보고서에 🔴 없음.
- [ ] C2. 공통 게이트.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과.

## Z. 문서 승격 (마지막)

- [ ] Z1. `docs/PRODUCT.md`를 현재 규칙으로 고쳐 쓴다: §5 item 2 'Toolbar'(Hand로 바꾸면 선택이 해제되고 Space는 해제하지 않음), item 4(“In Hand clicks neither select nor clear”는 클릭 규칙으로 남기고, “a pick and a chip's locate never change it”을 “starting a pick clears it; a chip's locate never changes it”으로), item 6('Pick from canvas'와 “Picking and locating change neither…” 문장). 근거는 커밋 메시지에 쓴다.
  - 검증: 명령 미정 — 사용자 확인 필요(PRODUCT.md에 Hand·pick이 선택을 바꾸지 않는다는 문장이 남지 않았는지 문서 대조).
- [ ] Z2. `docs/ARCHITECTURE.md` §3 'Picking and locate'의 “Picks and locate never send a selection command or change `doan active`”를 새 규칙으로 고친다.
  - 검증: 명령 미정 — 사용자 확인 필요(문서 대조; `/doc-check` 범위 실행으로 대신할 수 있다).
- [ ] Z3. `docs/DESIGN.md`: 'Canvas area and right panel'의 Overlay marks 'Jump highlight'와 'Canvas conversation'의 Locate 행을 R2 측정값으로, 'Accent places'에 새 selector를 더한다. R2에서 확인하지 못한 표면(예: 실제 forced colors 설정)은 'Not verified'에 적는다.
  - 검증: `npm --prefix app test`(`accentPlaces`) green, DESIGN.md 값이 `styles.css`와 같다.
- [ ] Z4. `docs/features/canvas-selection-tools/`를 지운다.
  - 검증: 명령 미정 — 사용자 확인 필요(이 디렉터리가 없고 다른 파일은 바뀌지 않았는지 확인).

── commit (문서별로 나눔): `docs(product): …`, `docs(architecture): …`, `docs(design): …`, `docs(feature): remove canvas-selection-tools` ──
