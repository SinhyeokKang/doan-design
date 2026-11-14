# prototype-link-play — design

조사 근거는 상위 [design.md](../prototype-frame-links/design.md) '조사'에 있다. 줄 번호는 2026-11-14 develop 기준이다.

## 바뀌는 곳

- 프로토타입 창 연결
  - `app/src/main/prototypeScript.ts`: 클릭 처리, 연결 목록 보고. 하위 1의 규칙(감싼 프레임, 재생 가능 판단)을 따로 가진다(import 불가).
  - `app/src/renderer/prototype/host.ts`(`forwardedMessage`), `PrototypeWindow.tsx`(수신 루프 197–208행 근처, 토스트), `app/src/preload/prototype.ts`.
  - `app/src/main/prototype/requests.ts`: 새 메시지 검증, `parseFramesReport` 확장.
  - `app/src/main/prototype/controller.ts`, `windowState.ts`: `goto` 전이(`choose`와 `reload`를 재사용).
- 프레임 서랍
  - `PrototypeWindow.tsx`의 `FrameMenu`(530–590행 근처)를 공유 컴포넌트로 꺼낸다. 위치는 구현이 정한다. 프로토타입 창과 main 창 툴바가 같이 쓴다.
  - 묶음은 하위 1의 `app/src/main/prototype/links.ts` `linkGroups`.
- main 창 툴바 Play
  - `app/src/main/prototype/playability.ts`: 판단을 넓힌다(재생 / 서랍 / 비활성).
  - `app/src/renderer/prototypePlay.ts`(`playSelection`, `canvasPlayability`, `playRequest`), `CanvasTools.tsx`(62–65행 근처), `App.tsx`(276행, 1863행 근처).
  - 보드 스크립트 `app/src/main/canvasScript.ts`의 `layout` 메시지가 연결 목록을 더 보고한다(`canvasMessage.ts`). 그래야 툴바 서랍이 묶음을 안다.
- 에이전트: `cli/internal/cli/skill.md`, `eval/scenarios/<새 id>/`.
- 문서(승격): PRODUCT §5 item 2, ARCHITECTURE §3 'Prototype window'(새 메시지, 검증), DESIGN.md(초안 측정값).

## 클릭에서 이동까지

1. **주입 스크립트**: `window`에 capture 단계 click 리스너를 단다.
   - `event.target`에서 가장 가까운 `[data-doan-goto]` 조상을 찾는다. 그 조상이 재생 중인 프레임 안에 있어야 한다.
   - 그다음 `setTimeout(0)`으로 넘겨 캔버스 핸들러가 끝난 뒤 `event.defaultPrevented`를 본다. bubble 단계의 window 리스너는 캔버스의 `stopPropagation()`에 막히므로 capture에서 기록하고 나중에 판단한다.
   - `defaultPrevented`가 아니면 `{gen, goto: <값>}`를 `parent.postMessage`로 보낸다.
   - 연결이 `<a href>`에 붙어 있어도 다른 페이지 이동은 이미 막힌다(`prototypeFrame.ts`). 스크립트가 따로 막지 않는다.
2. **렌더러**: `forwardedMessage`(`host.ts:79-84`)가 `goto` 키로 새 종류를 가른다. 지금은 `state` 유무로 결과와 목록을 나눈다. `api.goto(value)`로 main에 넘긴다.
3. **main**: 다음 차례로 검증한다.
   - 현재 실행, 현재 gen, 문자열, 200 UTF-16 단위 이하.
   - 값이 현재 실행이 보고한 재생 가능 프레임(`state.frames`)에 있는가.
   - 캔버스가 현재 gen 메시지를 위조할 수 있으므로 main 판단이 기준이다(ARCHITECTURE §3).
4. **이동**:
   - 대상이 재생 중인 프레임이면 `reload`(기록 없음).
   - 아니면 `choose`와 같은 `playTarget`. 창을 맞추고, 실행을 끝내고, gen을 올리고, 새 iframe을 띄우고, `recordEntry`로 기록한다(`windowState.ts:113-169`).
5. **재생할 수 없는 대상**:
   - main이 거절하면 렌더러에 결과를 돌려주고, 렌더러가 토스트를 보인다(창에는 이미 export용 `useToast`가 있다, `PrototypeWindow.tsx:73`).
   - 대상이 목록에 없으면 같은 토스트다. 목록은 재생 가능한 프레임만 담으므로 없음, 공유, 마크 없음, 200자 초과가 모두 여기에 든다.
   - 같은 실행에서 같은 토스트가 이어지면 하나로 합친다.
6. **로딩 중 클릭**: 새 실행이 뜨기 전 옛 gen의 메시지는 버린다(기존 gen 검사).

## 연결 보고와 묶음

- 주입 스크립트의 프레임 목록 보고(`list`, RunMessage의 `frames`)에 연결을 더한다: `gotos: {value, frames}[]`. 하위 1의 Go `Gotos`와 같은 모양이다.
  - 한도를 둔다: 1000개, 값 200자. 넘치면 잘라 보고한다.
  - `parseFramesReport`·`parseRunReport`가 검증한다.
- 프로토타입 창 서랍은 `linkGroups(frames, gotos)`로 나눈다.
- main 창: `canvasScript.ts`의 `layout` 메시지 frames에 이미 마크가 있다(`LayoutFrameMark`). 같은 모양의 `gotos`를 더한다. 툴바 서랍이 `linkGroups`로 나눈다.
- 드리프트 방지: 주입 스크립트와 보드 스크립트가 같은 감싼 프레임 규칙을 각자 가지므로, 둘의 테스트가 하위 1의 `schema/fixtures/prototype-links/cases.json` `placements`를 DOM에서 실행해 `gotos`를 비교한다.

## 툴바 Play 판단

`playability`를 다음 결과 하나로 바꾼다: `{kind: "play", frame}` · `{kind: "drawer"}` · `{kind: "disabled", reason}`.

| 조건(위에서부터) | 결과 |
|---|---|
| pick 또는 capture 중 | disabled: "Finish picking or capturing first." (초안에서 확정) |
| 캔버스에 재생 가능한 프레임이 없음 | disabled: "This canvas has no prototype frames." (초안에서 확정) |
| 고른 것이 재생 가능한 프레임 | play(그 프레임) |
| 고른 것이 요소이고 감싼 재생 가능한 프레임이 있음 | play(가장 안쪽) |
| 그 밖(선택 없음, 마크 없는 프레임, 감싼 프로토타입 없는 요소) | drawer |

- Hand는 Select와 같다(사용자 결정).
- 크기 버블 Play는 "고른 것이 재생 가능한 프레임"일 때만 있다(지금과 같다). 요소 선택에서는 나오지 않는다.
- 감싼 프레임을 알려면 선택에 프레임 경로가 있어야 한다. 지금 `SelectTarget.frame`은 가장 안쪽 프레임 하나다(`canvasMessage.ts`). 재생 가능한 가장 안쪽 프레임이 바깥에 있을 수 있으므로, 보드 스크립트가 선택의 감싼 프레임 id 목록을 함께 보낸다. 다른 방법으로 `layout`의 `gotos`처럼 프레임의 부모 관계를 보내도 된다. 구현이 정한다.
- 서랍이 열린 동안 버튼은 `aria-expanded`다. 서랍에서 고르면 재생하고, 포커스 처리는 지금 Play와 같다(창이 닫히면 `closedFocusTarget`).
- `canvas-mark-accent`(체인 `chain-261114-2` 링크 4)가 크기 버블에 Add to message를 더한다. 버블의 Play 조건은 이 하위가 바꾸지 않으므로 겹치지 않는다. 다만 같은 파일(`CanvasController.ts`, `App.tsx`)을 고치므로 그 링크가 병합된 뒤 시작한다.

## 순수 함수(`/tdd` 대상)

1. `playability`의 새 판단(표의 모든 행, Hand, 중첩 프레임, id 공유, 200자 초과).
2. `goto` 메시지 검증(`requests.ts`): 형식, 길이, gen.
3. `windowState`의 `goto` 전이: 다른 프레임(기록), 같은 프레임(reload, 기록 없음), 목록에 없음(거절), 로딩 중.
4. 프레임 서랍 행 만들기: 묶음, 순서, 현재 묶음, 키보드 이동이 묶음 구분을 넘는 것.
5. 주입 스크립트와 보드 스크립트의 `gotos` 보고(fixture 비교).
6. 토스트 합치기.

## 초안 요청(`/design-draft`)

- 캔버스 `.doan/canvases/prototype-link-play.html`. 프레임 id는 다음과 같다.
  - `drawer-groups`: 프로토타입 창 서랍의 묶음, 재생 중 묶음, 연결 없는 프레임, 빈 서랍.
  - `link-toast`: 재생할 수 없는 연결의 토스트.
  - `toolbar-play`: 툴바 Play의 세 상태와 툴바에서 열린 서랍. 비활성 툴팁 두 가지와 Hand 상태를 포함한다.
- 기존 초안(`frame-prototype.html` 등)은 고치지 않는다. 툴바와 프로토타입 창 머리는 코드와 DESIGN.md대로 옮겨 그린다.

## POSTMORTEM에서 가져온 함정

- 2026-11-14 'A list main answered for the canvas it played was applied to the one the prototype window still showed', 'The prototype window dropped the drawing main had pushed…': main과 창 보기가 엇갈린다. `goto` 응답(토스트)은 그 응답이 가리키는 gen으로 판단하고, 현재 보기의 gen과 다르면 버린다.
- 2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew…': 툴바 Play가 서랍 상태와 재생 상태 사이를 오갈 때도 같은 요소로 남는다. `aria-haspopup`이 붙고 떨어져도 트리를 바꾸지 않는다.
- 2026-11-14 'The installed Doan.app came up on the real userData…': 실제 앱 probe는 격리한다.

## 영향

- 형식: 프로토타입 창의 iframe 메시지(새 종류)와 보드 `layout` 메시지(gotos)가 바뀐다. 둘 다 렌더러와 main 사이의 내부 메시지라 JSON Schema(§11) 대상이 아니다. ARCHITECTURE §3에 메시지와 검증을 적는다. app socket과 CLI 응답은 바뀌지 않는다.
- 규약: 하위 1이 정했다.
- 구조 결정: 프로토타입 창의 격리(sandbox, 다른 페이지 이동 금지, partition)는 그대로다. 연결은 문서 안 클릭을 Doan이 해석하는 것이지 iframe 이동이 아니다.
- PoC 의존: capture 리스너와 `setTimeout(0)`으로 `defaultPrevented`를 읽는 방식은 표준 동작이지만, 이 창의 주입 환경(CDP 주입, sandbox iframe)에서 시험한 적은 없다. 첫 작업에서 짧게 확인한다.
- `/agent-eval`: 한다(완료 조건 12). 하위 1의 `doan check` 규칙도 함께 잰다.
