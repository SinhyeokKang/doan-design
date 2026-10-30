# doan-mascot — design

## 영향 범위

| 구성 요소 | 변경 |
|---|---|
| 앱 renderer | Doany 모션·컨트롤러·컴포넌트, 무대 배치 계산 추가. Welcome(`Onboarding.tsx` `Welcome`)과 Home 입력 화면(`HomeComposerView.tsx`의 `.home-stage`·textarea·`send()`)에 Doany 연결. 첫 실행 Tab 트랩(`onboardingView.ts` `nextFocusIndex`, `Onboarding.tsx` keydown). `styles.css` 배치 규칙 |
| 앱 정적 에셋 | `app/src/renderer/public/doany/`에 정지 PNG·텍스처 두 장·출처 README |
| 패키징 | `app/package.json` `build.mac.icon`과 아이콘 원본 `app/resources/icon.png` |
| CLI·`doan mcp`·스킬 | 없음 |
| 형식(코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓) | 없음 |

## 파일 배치

- `app/src/renderer/doanyMotion.ts`: 순수 모션 수식. 시안 `mascot.js`의 `render`·`tick`·`jump`와 reduced `change` 처리를 DOM·WebGL 없이 옮긴다.
  - 상수와 연산 순서는 그대로 둔다. 예: `(x-state.lookX)*(1-Math.exp(-dt*5))`, 스프링 45·6, `hatV -= .9`, 깜빡임 `2.5+Math.random()*3.5`, 첫 깜빡임 `blinkAt=2, nextBlink=2`.
  - 난수는 인자로 받는다.
- `app/src/renderer/doanyRig.ts`: 컨트롤러. 시계(rAF·취소), 그리기 대상, 줄인 모션 질의, 표시 여부 질의, 난수를 주입받아 시안의 셸 흐름을 그대로 돌린다. DOM·WebGL을 직접 만지지 않으므로 node 테스트에서 가짜로 돌릴 수 있다.
  - 그리기 대상: `draw(pose)`, `resize(px)`, 컨텍스트 손실 알림.
- `app/src/renderer/Doany.tsx`: React 컴포넌트와 실제 어댑터. 버튼·정지 이미지·`<canvas>`를 그리고, WebGL 컨텍스트·셰이더·메시·텍스처, `ResizeObserver`·`IntersectionObserver`, `matchMedia`, 창 전체 `pointermove`를 컨트롤러에 연결한다.
  - 부모에게 `hop()`·`typing()` 핸들을 연다. Home에서는 `HomeComposerView`가 지역 ref로 이 핸들을 쓴다. Welcome은 핸들을 쓰지 않는다.
- `app/src/renderer/stageInsets.ts`: 무대 배치 계산(아래 '배치').
- `app/src/renderer/public/doany/`: `doany.png`(정지), `body.png`, `hat.png`를 `.doan/assets/doany/`에서 바이트 그대로 복사하고, `README.md`를 둔다.
  - README에는 복사 출처, 생성 방식, MIT 코드 라이선스가 아트워크에 적용되지 않는다는 점을 적는다. `public/provider-logos/README.md`와 같은 방식이다.
  - 상대 경로(`doany/body.png`)로 읽어 패키지 앱의 file URL에서도 풀리게 한다(`homeComposer.ts` `providerLogo`와 같은 이유).
- 스타일: `.doany` 규칙을 `styles.css`에 둔다. 시안 `mascot.css`를 옮긴다(호스트 크기, `img` 20% 패딩, `[hidden]`, `:focus-visible` 링).
  - 링 반경은 `var(--radius-container)`(24px)다.
  - 스타일시트는 `<link>`로만 읽는다(ARCHITECTURE §7 'Renderer styles').
- 아이콘: `app/resources/icon.png`.
  - `app/build/`는 git이 무시하므로 그곳에 둘 수 없다.
  - electron-builder는 `mac.icon`의 `resources/icon.png`를 `app/build/resources/`에서 먼저 찾고, 없으면 `app/resources/`에서 찾는다(`app-builder-lib/out/platformPackager.js`).
  - 원본 `white/doany.png`(1254 × 1254, 알파 없음)를 `sips -z 1024 1024`로 줄이기만 하고 다른 가공은 하지 않는다.

### 모션 코드 라이선스
`mascot.js`는 MIT다(`motion/LICENSE`, "Doan contributors"). 옮긴 세 파일(`doanyMotion.ts`·`doanyRig.ts`·`Doany.tsx`) 머리에 `SPDX-License-Identifier: MIT`를 남긴다. 저장소는 Apache-2.0이고(ARCHITECTURE §9) MIT 코드를 함께 둘 수 있다.

## 동작 — 시안과 같게 (사용자 요구: 완전히 동일하게)

옮길 때 바꾸는 것은 DOM과의 연결뿐이다. 아래 표의 '앱' 열이 시안과 다른 점은 모두 사용자가 결정했거나, 앱 수명 때문에 필요한 것이다.

| 시안 (`mascot.js`) | 앱 |
|---|---|
| `getContext('webgl', {alpha:true, antialias:true, premultipliedAlpha:false})`, `BLEND` + `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`, 64 × 64 메시, 텍스처 `CLAMP_TO_EDGE`·`LINEAR` | 같다 |
| 셰이더 컴파일·링크 실패, 컨텍스트 없음 → `static` | 같다 |
| `img.crossOrigin = "anonymous"` | P0 결과에 따른다 |
| 텍스처 실패 → `static`, 성공 → PNG 숨김·캔버스 표시·`resize()` | 같다. 언마운트 뒤 늦게 끝난 Promise는 무시한다 |
| `resize`: `canvas.width = min(1024, ceil(clientWidth × min(dpr‖1, 2)))` 뒤 `render()` | 같다(캔버스 크기를 다시 정하면 그림이 지워지므로 render가 필요하다) |
| `tick`: 매 rAF마다 `last`를 갱신, 첫 dt 1/60, dt 상한 0.035. 준비·보임·문서 보임·줄인 모션이 아닐 때만 시간이 흐름. 줄인 모션은 상태가 바뀔 때만 render | 같다. rAF는 계속 돌리고 게이트로 멈춘다(재개 첫 dt가 시안과 같도록) |
| '보임' = `IntersectionObserver`의 교차 여부 | 교차하면서 `host.checkVisibility({ visibilityProperty: true })`도 참이어야 한다. 첫 실행 오버레이 뒤의 Home(`#root:has(> .ob-overlay[open]) > :not(.ob-overlay) { visibility: hidden; }`)을 가린 것으로 본다 (사용자 결정) |
| `host.closest('[data-mascot-scope], [data-doan-frame]')`에 `pointermove` | 시안 프레임이 창 전체이므로 `document`에 건다. 목표 계산식, 1.8초 `pointerUntil`은 같다 |
| 메시지 `input` → `typingUntil = t + 1.4` | Home textarea의 `input`(IME 조합 중 포함)에서 `typing()` |
| Send 클릭 → `jump()` | `HomeComposerView` `send()`가 `availability.enabled` 가드를 통과한 직후 `hop()`. 성공하면 Overview로 이동하면서 언마운트되어 홉이 끊긴다 (사용자 결정) |
| 호스트 클릭, keydown Enter·Space(`preventDefault`) → `jump()` | 같다. keydown에서 `preventDefault`를 하므로 버튼 기본 click이 겹치지 않는다. V1에서 한 번만 뛰는지 확인한다 |
| `jump`: 줄인 모션이면 무시 | 같다 |
| 줄인 모션 `change` → `hat = 0`, `hatV = 0`, render | 같다 |
| `webglcontextlost` → `preventDefault`, PNG, `static` | 같다 |
| `host.dataset.state`를 매 render마다 씀 | ref로 DOM 속성을 직접 쓴다. React prop이나 state로 두면 입력할 때마다 다시 렌더해 값을 덮거나, 초당 60번 다시 렌더한다 |
| `greet`·`blink`·`pause` 액션 | 옮기지 않는다. 스터디 컨트롤에서만 불린다. 자동 깜빡임은 `tick`에 있으므로 옮긴다 |
| 페이지 수명 = 리그 수명 | 언마운트 순서: `webglcontextlost` 리스너 해제 → rAF 취소 → 옵저버·`pointermove`·`matchMedia` 리스너 해제 → `WEBGL_lose_context().loseContext()`. Home은 화면을 떠나면 언마운트되므로(`App.tsx` `screen === "home"`) 방문할 때마다 새 컨텍스트가 생긴다. 반납하지 않으면 Chromium 컨텍스트 상한에 걸려 오래된 컨텍스트가 강제로 잃어진다. 리스너를 먼저 떼지 않으면 언마운트 중에 `static`이 기록된다 |

## 순수 함수 (`/tdd` 대상)

**`doanyMotion.ts`**
- `initialState()`: 시안 초기 state.
- `pose(state, reduced)`: `{ squash, lift, tilt, energy, hatTilt, eyeOpen, look, time, mode }`. 시안 `render`의 계산이며 `greet` 분기는 없다.
- `advance(state, now, gate, random)`: 시안 `tick`의 state 변화.
  - `last` 갱신과 dt 계산.
  - 게이트가 열렸을 때만 시간 진행, 떠도는 시선·typing 시선, 평활, 베레모 스프링, 깜빡임 예약과 개폐 곡선.
  - `gate`는 준비·보임·문서 보임·줄인 모션 아님을 묶은 값이다.
- `pointer(state, clientX, clientY, rect)`: 목표 시선과 `pointerUntil = time + 1.8`.
- `hop(state, reduced)`, `typing(state)`, `reducedChanged(state)`.
- `canvasSize(clientWidth, devicePixelRatio)`.

**`doanyRig.ts`**: 위 함수를 쓰는 컨트롤러. 가짜 시계·그리기 대상으로 node에서 테스트한다.
- 준비 전에는 그리지 않는다.
- 텍스처가 실패하면 `static`.
- 언마운트 뒤 늦게 끝난 Promise는 무시한다.
- 숨김 동안 시간이 멈춘다.
- 재개 첫 dt가 상한 0.035로 잘린다.
- 줄인 모션 전환 시 리셋하고 render한다.
- resize 뒤 render한다.
- 해제 순서.

**`stageInsets.ts`**: `stageInsets({ available, group, offset, min })` → `{ top, bottom }`. 아래 '배치'의 계산이다.

**`onboardingView.ts` `nextFocusIndex`**: DOM 순서 규칙(아래 '포커스')에 맞게 바꾼다.

**기대값 출처**: 기대값은 `.scratch/doan-mascot/golden.mjs`로 만든다.
- 이 스크립트는 원본 `mascot.js`를 node `vm`에서 실행한다. `document`·gl·rAF·`matchMedia`·`IntersectionObserver`·`ResizeObserver`를 stub으로, `Math.random`과 시간을 고정값으로 둔다.
- 표본 시각·입력별 uniform 값을 기록한다(`gl.uniform1f`/`uniform2f` 호출을 가로챈다).
- 결과 JSON을 테스트 고정 데이터로 쓴다. 포팅한 코드로 기대값을 만들지 않는다. 그러면 검증이 순환한다.
- 스크립트는 `.scratch/`에 있으므로, 재생성 명령과 입력 시나리오를 커밋 메시지에 적는다.

## 배치

시안 CSS(`doan-mascot.html`의 `.home-stage` 덮어쓰기, `study/welcome.css`)를 출발점으로 하되, 사용자 결정 세 가지를 더한다.
- 뷰포트가 높아도 중앙에 둔다.
- Home은 기준 높이로 위치를 정한다.
- 짧은 창에서는 오프셋이 먼저 줄어든다.

`stageInsets`에서 `available`은 기준 영역 높이, `group`은 기준 그룹 높이, `offset`은 Home 64 / Welcome 72, `min`은 32다.

```
slack = available - group - 2 × min
slack ≤ 0  → top = min, bottom = min, 넘치는 만큼 스크롤
slack > 0  → e = min(offset, slack / 2)
             top = min + slack / 2 - e
             bottom = min + slack / 2 + e
```

`slack / 2 ≥ offset`이면 그룹 중심이 정확히 `offset`만큼 위에 온다. 높이에 상한이 없으므로 아주 높은 뷰포트에서도 중앙을 지킨다.

- **Home**: `group`은 기준 상태(빈 2줄 입력창, 추천 프롬프트 표시)의 높이다.
  - 셸은 `ResizeObserver`로 `available`과 기준 높이를 재고, `top`을 위쪽 padding으로 준다. 그룹의 실제 높이가 기준보다 커지면 아래로 자라고, 위쪽은 움직이지 않는다.
  - 추천 프롬프트가 사라진 자리는 `visibility: hidden`과 같은 방식으로 높이를 유지한다. 지금은 입력이 있으면 요소를 빼므로(`HomeComposerView.tsx`) 이 부분이 바뀐다. 접근성 트리에서는 빠져야 한다.
  - 기준 높이를 실제 렌더에서 잴지, 고정 구조에서 계산할지는 `/implement`가 정한다. 계약은 '입력 중 입력창 위치 불변'이다.
- **Welcome**: 그룹은 고정 구조이므로 실제 높이가 곧 기준 높이다.
  - 기준 영역은 `.ob-scroll`(크롬 아래)이다.
  - 지금 `.ob-welcome .ob-scene`의 위 0·아래 48px 패딩과 `.ob-welcome-main`의 `padding-bottom: var(--space-6)`는 중심을 틀기 때문에 Welcome에서는 없앤다.
- CSS만으로 같은 계약을 지킬 수 있으면 셸 측정을 쓰지 않아도 된다. 그때도 `stageInsets` 테스트가 계약을 고정한다.
- 홉 여유 공간이 그리기 영역 안에 있으므로, 슬롯을 보이는 크기로 자르지 않는다.

## 포커스

- 첫 실행 오버레이 keydown은 `nextFocusIndex(count, index, shift)`로 Tab을 처리한다. 활성 요소가 목록에 없으면(`index < 0`) 지금은 처음이나 끝으로 보낸다(`onboardingView.ts`).
- 바꾼 규칙: 활성 요소가 목록에 없으면 셸이 DOM 순서로 그 앞에 있는 목록 요소 수 `before`를 넘긴다(`compareDocumentPosition`).
  - `before === count`이고 Shift가 아니면 0으로 감싼다.
  - `before === 0`이고 Shift면 `count - 1`로 감싼다.
  - 그 밖에는 `null`을 돌려 브라우저가 DOM 순서로 이동하게 둔다.
  - 모달 `<dialog>` 밖은 inert이므로 브라우저 이동이 오버레이를 벗어나지 않는다.
- Welcome의 h1 초기 포커스는 그대로 둔다(rAF 뒤 `focus()`). `showModal()`이 Doany에 먼저 포커스를 주어 한 프레임 동안 링이 보이는지는 V1에서 확인한다. 보이면 Doany에 `autofocus`가 아닌 h1 쪽으로 초기 포커스를 옮기는 처리를 `/implement`가 정한다.

## 형식 변경

없음. JSON Schema, fixture, 형식 버전 `v`를 건드리지 않는다.

## 규약 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **Renderer CSP**(`default-src 'self'; frame-src http://127.0.0.1:*; img-src 'self' blob:`, ARCHITECTURE §7): CSP를 넓히지 않는다. 텍스처와 PNG는 `'self'` 이미지이고 셰이더는 문자열 상수다. WebGL은 CSP 대상이 아니다. 인라인 `<style>`·`<script>`도 쓰지 않는다.
- **Renderer import boundary**: 새 파일은 main 모듈과 ajv를 import하지 않는다(`rendererImports.test.ts`).
- **Home tests without a DOM**(ARCHITECTURE §7): DOM 테스트 의존성을 더하지 않는다. 동작은 순수 함수와 주입형 컨트롤러로 node에서 테스트하고, 마크업은 `renderToStaticMarkup`으로 테스트한다. 실제 이벤트·포커스·WebGL은 V1에서 확인한다.
- **세션 권한 거부**: WebGL은 권한 요청을 하지 않는다.
- **토큰 우선**(DESIGN 'Tokens first'): 114px·142.5px 슬롯과 64/72px 오프셋은 토큰에 없는 값이라 컴포넌트 상수로 둔다. 링 반경은 `--radius-container`, 최소 여백 32px는 `--space-8`이다.
- 다른 구조 결정(서빙 범위, sandbox iframe, append-only 이벤트, 토큰 미처리, git 미조작)과는 상관없다.

## PoC 의존

- **file:// 텍스처 로드 (미검증)**: 패키지 앱은 renderer를 `loadFile`로 연다(`app/src/main/index.ts`). 창의 `webPreferences`는 `webSecurity`를 바꾸지 않는다. 에셋 README에는 "direct `file:` URLs may block texture loading"이라고 적혀 있다. 시안 스크립트는 `img.crossOrigin = "anonymous"`를 건다.
  - P0: 일반 file:// 경로와 asar 안 경로(`app.asar/out/renderer/`) 두 곳에서 `crossOrigin` 있음과 없음을 확인한다.
  - 둘 다 실패하면 구현 전에 멈추고 보고한다. 대안(예: `fetch` → `createImageBitmap`)은 CSP `connect-src` 경로를 따로 검증해야 하므로 미리 정하지 않는다.
  - 최종 판정은 V1의 패키지 앱이다.
- **macOS 아이콘 모양 (미검증)**: 알파 없는 흰 정사각형이 macOS 26(Darwin 25)의 Finder·Dock에서 어떤 모양으로 보이는지 확인하지 않았다. E1에서 사용자가 직접 보고 확인한다. LaunchServices 아이콘 캐시 때문에 같은 경로에 있던 이전 빌드의 아이콘이 남아 보일 수 있으니, 새 임시 경로에 복사해서 본다.

## POSTMORTEM에서 관련 함정

- [2026-10-30 — Packaged-app probes failed for reasons of their own: keychain, signature identity and focus](../../POSTMORTEM.md): Playwright로 띄운 페이지는 창 포커스와 blur를 받지 못했다. 홉·시선 확인을 포커스 이벤트에 기대지 말고 `data-state`와 포인터 이벤트로 본다. 패키지 앱은 ad-hoc 서명이므로 아이콘도 새 경로 복사본에서 확인한다.
- [2026-10-30 — A renderer import of a main module left the built app's window blank](../../POSTMORTEM.md): 새 renderer 파일이 main 모듈을 값으로 import하지 않게 한다. 빌드한 앱의 창이 비는지 V1에서 본다.
- [2026-10-24 — The onboarding wizard lost keys and clicks to focus and modal stacking](../../POSTMORTEM.md): Welcome은 `<dialog>` 오버레이 안에 있다. Tab 트랩을 바꾼 뒤에도 Escape 차단과 스택된 대화상자 처리가 그대로인지 확인한다.
- [2026-10-23 — A full-width message assertion included the native scrollbar](../../POSTMORTEM.md): 짧은 창 스크롤을 측정할 때 그룹 가로 중심 계산에 스크롤바 폭을 넣지 않는다.
