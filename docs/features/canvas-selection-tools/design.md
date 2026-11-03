# canvas-selection-tools — design

## 영향 받는 구성 요소

- **앱(renderer)**: `app/src/renderer/CanvasController.ts`(도구 적용, pick 시작), `app/src/renderer/styles.css`(`.mark.jump-highlight`), `app/src/renderer/ds/checks.test.ts`(`violetAllowed`), `app/src/renderer/tokens.css`(violet 사용처 주석).
- **앱(main)·canvas script·CLI(Go)·skill·guide**: 바뀌지 않는다. `doan active`는 main이 이미 받는 `selection:set null`을 그대로 돌려준다.
- **포맷**: 없음. comment events, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지 모두 그대로다. 선택 해제에 쓰는 canvas script의 `clear` 명령은 이미 있는 내부 메시지다(ARCHITECTURE §3 'Selection and inspector': 내부용, 영속 스키마 아님).

## 1. Hand로 바꿀 때 선택 해제

### 어디서 해제하나

`CanvasController.applyTool(tool)`에서 도구가 실제로 `select` → `hand`로 바뀌는 순간 해제한다. 툴바(`setTool`), H 키(`shortcut`), 런치 복원(`restoreTool`), drag 중 미뤄 둔 도구(`pendingTool`이 pointerup 뒤 적용되는 곳)가 모두 이 경로를 지나므로 한 곳만 바꾸면 된다.

- drag 중(`this.drag !== null`)에는 `pendingTool`만 기록하고 해제하지 않는다. pointerup 뒤 `this.tool = this.pendingTool`이 적용되는 곳(`CanvasController.ts`의 `if (this.pendingTool !== null) { this.tool = this.pendingTool; … }`)도 `select` → `hand`이면 같은 해제를 탄다. 두 곳이 갈라지지 않게 해제를 private 메서드 하나(`clearForTool()` 등)로 모으고 두 곳에서 부른다.
- 런치 복원: 선택은 원래 복원되지 않으므로(PRODUCT §5 item 1) 복원 시점에 선택이 있는 경우는 첫 ui-state 읽기 전에 사람이 선택한 경우뿐이다. 이때도 Hand가 적용되면 해제한다. 예외를 두지 않는 편이 규칙이 하나로 남는다.
- Space(`spaceHeld`)는 `this.tool`을 바꾸지 않으므로 해제하지 않는다. pick은 `this.tool`을 바꾸지 않으므로 pick 동안의 도구 표시도 영향이 없다.

### 해제 방식

Esc의 해제 경로(`escapeNow`)와 같은 순서를 쓴다.

1. `sendCommand({ type: "clear" })` — canvas script의 `selected`·`anchor`를 버린다. 보내지 않으면 다음 `layout`의 `selected` 사각형이 다시 들어와 선택이 살아날 수 있다(POSTMORTEM 2026-10-23 'Anchor measurement preceded selected-node recovery': script가 들고 있는 `selected`가 layout으로 다시 보고된다).
2. `clearSelection(false)` — 상태, 인스펙터 수집값, `reanchor`, 표시를 비운다. `notice`는 `false`라 selection-lost 토스트가 나오지 않는다(POSTMORTEM 2026-11-02 'The selection-lost line never left the board').
3. `publish()` — `sendSelection(null)`로 main의 선택이 비고 `doan active`가 선택 없음을 돌려준다.

`sendCommand`가 selection seq를 올리므로, H를 누르기 직전의 클릭이 보낸 `select` 답장이 늦게 와도 받아들여지지 않는다(ARCHITECTURE §3 'Ordering'; POSTMORTEM 2026-10-23 'Hover commands discarded pending selection replies'는 selection과 hover seq를 섞지 말라는 규칙이므로 hover seq는 건드리지 않는다). 선택이 없고 `reanchor`도 없으면(`shouldGuardEscape`가 false) 명령을 보내지 않는다.

`transitionIntent`: 주석상 "Raised by every move or selection change"이므로 해제할 때 `transition(...)`으로 감싸 올린다. Esc 해제와 같다.

### 함께 바뀌는 동작

- Hand로 바꾼 뒤 Add to conversation(⌘L)은 선택이 없어 비활성이 된다. 이유 표시는 기존 '선택 없음' 상태와 같다.
- Esc 순서는 `escapeStep`을 바꾸지 않는다. Hand에서 선택이 생기는 경로는 frame drawer뿐이고(spec 결정 4), 그때 Esc는 지금처럼 먼저 Select로 돌리고 다음 Esc가 해제한다.

## 2. pick을 시작할 때 선택 해제

`CanvasController.pick()`에서 pick이 새로 시작되는 분기(`this.state.picking = true` 직전, 이미 picking이면 아무것도 안 함)에서 1과 같은 해제를 한다. 순서는 `clear` 명령 → `clearSelection(false)` → `state.picking = true` → `armPick()` → `publish()` 한 번이다. `clear`를 `pick-start`보다 먼저 보내, script가 pick 모드에 들어가기 전에 `selected`를 버리게 한다. pick 메시지는 자기 seq(`pickSeq`)를 쓰므로 selection seq를 올려도 pick 답장 판정에는 영향이 없다(ARCHITECTURE §3 'Picking and locate').

- `pick()`이 false를 돌려주는 경우(frame 없음, 열린 캔버스 없음, status 있음, unlisted)는 해제하지 않는다.
- reload 중 pick은 다음 문서의 첫 layout에서 `pick-start`를 보낸다. 해제는 `pick()` 시점에 하므로 `reanchor`도 이때 비워져, 새 문서가 이전 선택을 다시 잡지 않는다.
- pick 종료(`endPick`)와 취소(`cancelPick`)는 선택을 되돌리지 않는다(spec 결정 3). pick listener가 `publish()` 뒤에 실행되는 순서는 그대로 둔다(POSTMORTEM: pick listener는 producer 상태를 읽어야 한다).
- 칩 locate(`locate`, `settleLocate`)는 바꾸지 않는다. 계속 선택 명령을 보내지 않는다.

## 3. locate 강조를 accent 그라디언트로

### 범위

spec 결정 1에 따라 `.mark.jump-highlight` 한 곳을 바꾼다. 칩 locate, frame drawer, Quick Open, deep link·`doan open`의 frame 강조가 모두 같은 모양이 된다. `CanvasController`의 `showJump` 경로는 바꾸지 않는다.

### 값 (R2에서 확정)

| 부분 | 값 | 근거 |
|---|---|---|
| 선 | 3px, `linear-gradient(135deg, var(--affordance-accent), var(--indigo-600))` | 지금 2px보다 1px 굵게: 임의 콘텐츠 위에서 그라디언트가 읽히려면 색이 바뀌는 폭이 보여야 한다. 두 끝 모두 흰 바탕·#050507에서 비텍스트 3:1 이상(spec 결정 2) |
| 분리 링 | 선 바깥 1px `--surface-panel` | 선택 표시(`.mark`)와 같은 규칙. 보라·짙은 캔버스에서 선이 배경과 섞일 때 흰 링이 경계를 그린다(#5b21b6에서 8.98:1) |
| glow | `0 0 16px 2px` accent 45 % | Home composer glow(`0 0 24px 2px` 27 % + `0 0 64px 8px` 7 %)보다 좁고 진하게: Home은 흰 카드 하나를 밝은 배경 위에 띄우지만, 강조는 복잡한 콘텐츠 위에 잠깐 떠서 넓고 옅은 glow는 묻힌다. 기존 3px `--affordance-backdrop-pressed` 링은 없앤다 |
| 모서리 | 사각형 1px(그대로), 점 50 %(그대로, 12px 원) | |
| 시간 | 1.2s, 0–66.6667 % 불투명 1, 마지막 0.4s에 0으로(`frame-jump-fade` 그대로, linear) | "번쩍인 뒤 사라짐"은 유지. 타이머 1200ms(`showJump`)와 맞물려 있어 바꾸지 않는다 |
| reduced motion | 애니메이션 없음(그대로): 1.2s 보였다가 타이머로 숨김 | |
| reduced transparency | glow 없음, 선과 링만 | Home glow도 이때 약해진다. 강조는 glow가 없어도 선이 남는다 |
| forced colors | `border: 3px solid Highlight`, 그라디언트·glow 없음 | forced colors에서는 background-image 선과 box-shadow가 사라지므로 단색 fallback이 없으면 강조가 보이지 않는다 |

이 값은 실제 앱 비교(tasks R2) 전의 출발점이다. 스크린샷에서 약하거나 과하면 선 폭(2–4px), glow 불투명도(30–60 %)만 조정하고 DESIGN.md에 측정값으로 남긴다.

### 그리는 방법

`border-image`는 `border-radius`를 무시해 점 강조(50 %)의 원을 그리지 못한다. 그래서:

- 요소 자체: `border: 3px solid transparent`, `box-shadow: 0 0 0 1px var(--surface-panel), 0 0 16px 2px color-mix(in srgb, var(--affordance-accent) 45%, transparent)`.
- `::before`: `inset: -3px`, `padding: 3px`, `border-radius: inherit`, 그라디언트 배경, `mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)`, `mask-composite: exclude`. mask를 요소 자체에 걸면 box-shadow의 링과 glow까지 잘리므로 의사 요소에 건다.
- overlay는 `pointer-events: none`이고 표시는 화면 크기를 유지한다(ARCHITECTURE §3 'Zoom and pan'). 크기·위치 계산(`drawJump`)은 바꾸지 않는다. border 폭이 2px → 3px가 되어 표시 박스 안쪽 여백이 1px 줄어드는 것은 `box-sizing`을 확인해 R2에서 측정한다.

### accent 사용처

violet은 정해진 곳에서만 쓴다(DESIGN.md 'Accent places', `violetAllowed`). 새 selector(`.mark.jump-highlight`, `.mark.jump-highlight::before`)를 `violetAllowed`에 근거 주석과 함께 넣고, `tokens.css`의 violet 주석과 DESIGN.md 'Accent places'에 추가한다. `edgeStripes` 검사는 네 변이 같은 테두리라 걸리지 않을 것으로 보지만, 구현 뒤 `npm --prefix app test`로 확인한다.

## 순수 함수로 뺄 부분

이번 변경의 판단은 대부분 `CanvasController`의 상태 전이라, 새로 뺄 만한 순수 함수가 거의 없다. 억지로 한 줄짜리 함수를 만들지 않고, 다음을 `/tdd` 대상으로 둔다.

- `CanvasController.test.ts`의 DOM 없는 harness(가짜 iframe·window)로 고정하는 전이:
  - select에서 선택 → 툴바·H로 Hand: 선택 `null`, `sendSelection(null)` 호출, iframe에 `clear` 명령, selection-lost notice 없음.
  - Space down/up: 선택 유지.
  - Space drag 중 H → pointerup 뒤 Hand 적용과 함께 해제.
  - H 직전 클릭의 늦은 `select` 답장이 Hand 전환 뒤 도착해도 선택이 살아나지 않음.
  - Hand → V·Esc: 선택 복원 없음.
  - `pick()` 성공: `clear`가 `pick-start`보다 먼저, 선택 `null`, `sendSelection(null)`. `pick()` 실패: 선택 유지.
  - pick 완료·취소 뒤 선택 `null` 유지, 도구는 이전 것.
  - locate: 선택·`sendSelection` 호출 없음(기존 테스트 유지).
- `styles.css`를 읽는 CSS 고정 테스트(`CanvasAgent.test.tsx`·`AddProjectsPage.test.tsx`와 같은 방식): `.mark.jump-highlight`의 3px, 그라디언트 두 변수, `::before`의 `mask-composite: exclude`, reduced motion·reduced transparency·forced colors 블록.
- `ds/checks.test.ts` `accentPlaces`: 새 selector가 `violetAllowed`에 있고 빠진 것이 없음.

뒤집히는 기존 테스트: 'Esc in Hand turns Hand off before it clears the selection', 'Esc in a text field does not turn Hand off…'(Hand에서 선택이 남는 전제), 'a picked element ends picking … without touching the selection', 'Esc while picking cancels only the pick … and keeps the selection', 'a click on the board margin while picking keeps picking and the selection'. 각각 새 규칙에 맞게 고치고, Esc 순서 자체는 drawer로 Hand에서 선택한 경우로 다시 고정한다.

## 포맷 변경

없음. JSON Schema 원본(ARCHITECTURE §11)과 format version `v`는 그대로다. TS·Go 공통 fixture도 없다.

## Conventions 영향

없음. ARCHITECTURE §1 canvas conventions와 `doan check` 규칙은 그대로다.

## 결정 영향

- PRODUCT §5 item 2 'Toolbar', item 4 'Selection and inspector', item 6 'Point in a conversation'의 선택 규칙 문장을 바꾼다(사용자 승인됨). 마지막 task에서 현재 규칙으로 고쳐 쓴다.
- ARCHITECTURE §3 'Picking and locate'의 "Picks and locate never send a selection command or change `doan active`"가 "pick 시작은 selection을 해제한다(`clear` 명령, `sendSelection(null)`); locate는 선택 명령을 보내지 않는다"로 바뀐다. 구조 결정(serving scope, sandbox iframe, 신뢰하지 않는 canvas 메시지, selection·hover seq 분리)은 건드리지 않는다. 해제는 renderer가 시작하는 기존 `clear` 명령이라 canvas가 위조할 수 있는 메시지를 새로 믿지 않는다.
- DESIGN.md 'Accent places'가 늘어난다(violet 사용처 고정 목록).

## PoC 의존

없음. 해제 경로(`clear` 명령, `clearSelection`, `publish`)는 Esc가 이미 쓰고, `mask-composite: exclude`는 Electron 45의 Chromium이 지원한다(Chromium 120부터 unprefixed). 강조 강도는 가정이라 실제 앱 비교(tasks R2)로 확인한다.

## 디자인 preset

`go run ./cli/cmd/doan design-skill --json`으로 목록을 보고 `animate`(reduced motion, 목적 있는 motion)와 `bolder`(새 장식보다 시스템의 accent를 키우기)를 읽었다. feature 문서와 이 repo의 규칙이 preset보다 우선한다.
