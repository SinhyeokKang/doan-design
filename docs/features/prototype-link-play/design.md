# prototype-link-play — design

조사 근거는 상위 [design.md](../prototype-frame-links/design.md) '조사'에 있다. 줄 번호는 2026-11-14 develop 기준이다.

## 바뀌는 곳

- 프로토타입 창 연결
  - `app/src/main/prototypeScript.ts`: 클릭 처리, 연결 보고. 하위 1의 규칙(감싼 프레임, 재생 가능 판단)을 따로 가진다(import 불가).
  - `app/src/renderer/prototype/host.ts`(`forwardedMessage`), `PrototypeWindow.tsx`(수신 루프 197–208행 근처, 토스트, `reloadFocus` 232–243행), `view.ts`(`liveText`), `app/src/preload/prototype.ts`.
  - `app/src/main/prototype/requests.ts`: `goto` 검증, `parseFramesReport`·`parseRunReport`의 `gotos`.
  - `app/src/main/prototype/ipc.ts`, `controller.ts`, `windowState.ts`: `goto` 전이.
- 프레임 서랍: `PrototypeWindow.tsx`의 `FrameMenu`(515행)에서 listbox 본문만 꺼낸다. 행 모델은 `{key, id, number, name, current, group}`이고, 키보드와 타입어헤드를 포함한다. trigger는 호출하는 쪽에 둔다. 위치는 구현이 정한다.
- main 창 툴바 Play
  - `app/src/main/prototype/playability.ts`(판단), `app/src/renderer/prototypePlay.ts`, `CanvasTools.tsx`(62–65행 근처), `App.tsx`(276행, 1863행 근처)
  - `canvasTool.ts`(서랍이 열린 동안 키)
  - 보드 스크립트 `app/src/main/canvasScript.ts`와 `canvasMessage.ts`: `layout` 프레임에 `parent`, `gotos`
- 에이전트: `cli/internal/cli/skill.md`와 `skill_test.go`(내용 테스트), `eval/scenarios/W9/`.
- 문서(승격): spec 완료 조건 14.

## 클릭에서 이동까지

1. **주입 스크립트**: `window`에 capture 단계 click 리스너를 단다. 주입 스크립트가 캔버스보다 먼저 등록되므로, 캔버스가 window capture에서 `stopImmediatePropagation()`을 불러도 영향이 없다.
   - `event.target`이 Element이면 `closest("[data-doan-goto]")`로 연결을 찾는다. `composedPath`는 쓰지 않는다. 그래서 shadow root 안과 중첩 iframe 안의 연결은 동작하지 않는다(정적 규칙과 같다).
   - 그 연결이 재생 중인 프레임 안에 있어야 한다.
   - `isTrusted`는 보지 않는다(사용자 결정). 캔버스는 어차피 현재 gen 메시지를 위조할 수 있다.
   - 그다음 `setTimeout(0)`으로 넘겨 캔버스 핸들러가 끝난 뒤 `event.defaultPrevented`를 본다.
   - 이동할 때만 `{gen, goto: <값>}`를 보낸다. 값이 200 UTF-16 단위를 넘으면 보내지 않고 `{gen, goto: null}`로 "재생할 수 없음"만 알린다.
   - 연결이 `<a href>`에 붙어 있어도 다른 페이지 이동은 이미 막힌다(`prototypeFrame.ts`).
2. **렌더러**: `forwardedMessage`(`host.ts:79-84`)가 `goto` 키로 새 종류를 가른다(지금은 `state` 유무로 결과와 목록을 나눈다). 렌더러가 현재 `view.frames`와 gen으로 판단한다.
   - 보기가 `ready`가 아니면 버린다.
   - 대상이 목록에 없거나 `goto: null`이면 토스트만 띄우고 main을 부르지 않는다. 단, export 토스트가 보이는 동안은 띄우지 않는다.
   - 목록에 있으면 `api.goto(value)`를 부르고, 포커스가 iframe 안에 있었으면 `reloadFocus` 장치를 켠다.
3. **main**: `phase === "ready"`이고 gen이 현재이며, 값이 현재 실행이 보고한 재생 가능 프레임(`state.frames`)에 있을 때만 받는다. 아니면 조용히 거절한다(렌더러가 이미 판단했으므로 응답 경로가 없다). 캔버스가 현재 gen 메시지를 위조할 수 있으므로 main 판단이 기준이다.
4. **이동**:
   - 대상이 재생 중인 프레임이면 `reload`(기록 없음).
   - 아니면 `playTarget`과 같은 새 `goto` 전이다. 실행을 끝내고, gen을 올리고, 새 iframe을 띄우고, `recordEntry`로 기록하고, 창을 맞춘다(`fit`). `activate`는 내지 않는다. `activate`는 숨긴 앱을 보이고 창에 포커스를 주므로(`prototypeWindow.ts:268-275`), 타이머로 `click()`하는 캔버스가 다른 앱을 쓰는 사람의 포커스를 가져갈 수 있다.
5. **이동 뒤**: 새 실행이 ready가 되면 `liveText`가 새 프레임 이름을 한 번 알린다. 켜져 있으면 `reloadFocus`가 그 iframe에 포커스를 준다.
6. **더블클릭**: 두 번째 클릭은 보기가 이미 loading이라 렌더러가 버린다.

## 연결 보고와 묶음

- **한도**: 하위 1의 계약대로 한도를 넘는 것은 자르지 말고 뺀다.
  - 프레임 id가 200 UTF-16 단위를 넘으면 그 프레임은 재생 대상이 아니다.
  - 연결 값이 200을 넘으면 보고하지 않는다.
  - 연결의 감싼 프레임 중 id가 200을 넘는 것은 그 연결의 `frames`에서 뺀다.
  - 목록과 연결은 각각 1,000개에서 끊는다.
- **주입 스크립트**: RunMessage의 `frames`(지금 `list`)에 `gotos: {value, frames}[]`를 더한다. `requests.ts`가 개수와 길이, 연결 하나의 `frames` 길이(상한을 둔다)를 검증한다.
- **보드 스크립트**:
  - `layout.frames`에 `parent`(가장 가까운 감싼 프레임의 `layout.frames` 인덱스, 없으면 없음)를 더한다. 문서 순서에서는 조상이 자손보다 앞에 오므로, 목록에 든 프레임의 조상은 모두 목록에 있다.
  - id를 200자로 잘라 보낸 프레임(`canvasScript.ts:252-256`)에는 `prototype`을 보내지 않는다. 그 프레임은 목록과 번호에는 남고 재생 대상에서만 빠진다.
  - `layout.gotos`는 `{value, frame: <가장 안쪽 감싼 프레임 인덱스>}[]`다. 감싼 프레임 목록은 `parent`를 타고 올라가 얻는다.
  - 툴바 서랍은 이것을 하위 1의 `linkGroups` 입력(`LayoutFrameMark[]`, `{value, frames}[]`)으로 바꿔 넣는다.
- **드리프트 방지**:
  - 두 스크립트의 테스트가 하위 1 fixture `placements`의 `html`을 DOM에서 실행해 `frames`·`gotos`를 비교한다.
  - 클릭 판정 경우(capture, `defaultPrevented`, `stopPropagation`, `click()`, 가장 가까운 연결, shadow, 재생 중인 프레임 밖)는 표로 만들어 export한다. 하위 3의 `isolate.js` 드리프트 테스트가 같은 표를 쓴다.

## 툴바 Play 판단

`playability`를 다음 결과 하나로 바꾼다: `{kind: "play", frame}` · `{kind: "drawer", broken?: frame}` · `{kind: "disabled", reason}`. 판단 순서와 문구는 spec 완료 조건 8의 표다.

- 감싼 프레임은 선택의 `SelectTarget.frameIndex`에서 `layout.frames`의 `parent`를 타고 올라가 찾는다. 1,000번째 뒤의 프레임은 `frameIndex`가 없으므로 서랍으로 간다.
- 크기 버블 Play는 `kind === "play"`이고 고른 것이 그 프레임 자체일 때만 있다. Select와 Hand에서 그렇다.
- **툴바 버튼 구조**
  - `Popover.Root`와 `Trigger`를 상태와 상관없이 항상 감싼다(POSTMORTEM 2026-11-13).
  - Radix Trigger가 자동으로 붙이는 `aria-haspopup`·`aria-expanded`·`aria-controls`는 서랍 상태가 아니면 `undefined`로 덮는다.
  - 서랍 상태가 아니면 `onOpenChange(true)`를 무시하고 재생하거나 아무것도 하지 않는다.
- **키**
  - 서랍이 열린 동안 listbox가 수식키 없는 인쇄 가능한 키를 모두 소비한다. 그래서 `canvasTool.ts` `toolShortcut`의 v, h가 닿지 않는다.
  - Esc는 서랍의 `onEscapeKeyDown`에서 멈춘다. `escapeStep`이나 Hand→Select로 번지지 않는다.
- `canvas-mark-accent`(체인 `chain-261114-2` 링크 4)가 크기 버블에 Add to message를 더한다. 버블 Play 조건이 Hand로 넓어지는 것과 같은 파일(`CanvasController.ts`, `App.tsx`)을 고치므로 그 링크가 병합된 뒤 시작한다.

## 가이드 예산

지금 가이드는 21,592 B(`--json`, 0.1.12)로 8 B 남았다. 이 하위를 시작할 때 링크 3 병합 뒤의 가이드에서 다시 재고, 아래 표를 갱신해 사용자 확인을 받는다.

| 변경 | 위치 | 바이트(추정) |
|---|---|---|
| 추가: "Link frames: `data-doan-goto=\"<frame id>\"` on an element inside a marked frame moves to that marked frame on click (`preventDefault()` cancels); `doan check` reports `goto_*`." | convention 14 뒤 | +200 |
| 축소: convention 14의 "Links to another page, native form submission and new windows do nothing; hash links, `history.pushState` and submit handlers that call `preventDefault()` work." → "Other-page links, form submits and new windows do nothing; hash links and `pushState` work." | `skill.md:30` | −80 |
| 축소: `doan open`의 refusals 목록(`frame_not_found`, `not_prototype`, `canvas_unreadable`) → 메시지가 스스로 설명하므로 뺌 | `skill.md:58` | −70 |
| 축소: `doan export`의 "`--prototype`: plays only that frame, but holds the whole canvas; say so." → "`--prototype`: holds the whole canvas; say so." 이 줄은 필수다: 하위 3이 병합되면 "plays only that frame"이 틀리므로 이 하위가 지운다(사용자 결정). | `skill.md:59` | −30 |

- 모자라면 하위 3의 export 문장 변경과 함께 다시 고른다.
- `skill_test.go`에 가이드가 `data-doan-goto`와 네 `goto_*` 코드 이름을 담는다는 테스트를 더한다.

## eval W9

- id `W9`(ARCHITECTURE §14, 새 과제). 프롬프트: "Link the three onboarding screens so the prototype moves welcome → signup → done and back."
- seed: 세 프레임을 이미 마크한 `onboarding.html`(W7 seed와 같은 방식, 마크를 미리 둔다).
- 자동 검사:
  - 세 프레임이 한 묶음이다(하위 1 Go `LinkGroups`, 또는 Python 파싱으로 같은 규칙).
  - `doan check` 오류가 0이다.
  - `data-doan-goto`를 지운 DOM이 seed와 같다(W7 `checks.ts`의 비교 방식 재사용).
- 파일: `scenario.json`, `prompt.md`, `rubric.md`, `checks.ts`, `checks.test.ts`, `seed/`, `fixtures/{pass,fail}`. `selection.json`이 필요한지는 W7을 따른다.
- 막는 실패: 자동 검사가 `--repeat 2` 뒤에도 실패하면 병합을 막는다. 판정자의 "partial"은 막지 않는다. 사용자가 열린 이슈로 받아들이면 막지 않는다.

## 순수 함수(`/tdd` 대상)

1. `playability`의 새 판단(표의 모든 행, Hand, 중첩 프레임, 마크 없는 프레임 안, id 공유, 200자 초과, 깨진 마크의 drawer `broken`, 1,000번째 뒤).
2. `goto` 메시지 검증(`requests.ts`): 형식, 길이, gen, phase.
3. `windowState`의 `goto` 전이: 다른 프레임(기록, `fit`, `activate` 없음), 같은 프레임(reload, 기록 없음), 목록에 없음(거절), 로딩 중(거절). 연결로 옮긴 뒤 재생할 수 없게 된 프레임으로의 Back은 기존 `usable`이 건너뛴다.
4. 프레임 서랍 행: 묶음, 순서, `role="group"`, 구분선 규칙, 현재 묶음, 키보드와 타입어헤드가 묶음을 넘는 것.
5. 두 스크립트의 `gotos`·`parent` 보고(fixture 비교)와 클릭 판정 표.
6. 렌더러의 토스트 판단(목록에 없음, `goto: null`, 보기가 ready가 아님, export 토스트 중).

## POSTMORTEM에서 가져온 함정

- 2026-11-14 'A list main answered for the canvas it played was applied to the one the prototype window still showed', 'The prototype window dropped the drawing main had pushed…': main과 창 보기가 엇갈린다. 렌더러는 보기의 gen과 phase로 판단하고, main은 자기 gen과 phase로 다시 판단한다.
- 2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew…': 툴바 Play가 서랍 상태와 재생 상태 사이를 오갈 때도 같은 요소로 남는다.
- 2026-11-03(포커스가 body로 떨어짐): 이동 뒤 포커스는 `reloadFocus`와 같은 장치로 돌려준다.
- 2026-11-14 'The installed Doan.app came up on the real userData…': 실제 앱 probe는 격리한다.

## 영향

- 형식: 프로토타입 창의 iframe 메시지(새 종류)와 보드 `layout` 메시지(`parent`, `gotos`)가 바뀐다. 둘 다 내부 메시지라 JSON Schema(§11) 대상이 아니다. ARCHITECTURE §3에 메시지, 검증, 한도를 적는다. app socket과 CLI 응답은 바뀌지 않는다.
- 규약: 하위 1이 정한 convention 15에 클릭 동작 문장을 더한다.
- 구조 결정: 프로토타입 창의 격리(sandbox, 다른 페이지 이동 금지, partition)는 그대로다. 연결은 문서 안 클릭을 Doan이 해석하는 것이지 iframe 이동이 아니다.
- PoC 의존: capture 리스너, `setTimeout(0)` 뒤 `defaultPrevented`, `click()`, role=button, shadow, window capture stop은 이 창의 주입 환경(CDP 주입, sandbox iframe)에서 시험한 적이 없다. 첫 작업에서 확인한다.
- `/agent-eval`: 전체 라운드(사용자 결정). 하위 1의 `doan check` 규칙도 함께 잰다.
