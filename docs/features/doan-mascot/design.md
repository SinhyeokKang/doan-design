# doan-mascot — design

## 영향 범위

| 구성 요소 | 변경 |
|---|---|
| 앱 renderer | Doany 컴포넌트와 모션 모듈 추가, Welcome(`Onboarding.tsx`의 `Welcome`)과 Home(`Home.tsx`) 마크업, `styles.css`의 배치 규칙, Home 입력창의 입력·전송 신호 연결 |
| 앱 정적 에셋 | `app/src/renderer/public/doany/`에 정지 PNG와 텍스처 두 장, 출처 README |
| 패키징 | `app/package.json` `build.mac.icon`과 아이콘 원본 파일 |
| CLI·`doan mcp`·스킬 | 없음 |
| 형식(코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓) | 없음 |

## 파일 배치

- `app/src/renderer/doanyMotion.ts` — 순수 모션 모듈. 시안 `mascot.js`의 `render`·`tick` 수식을 DOM·WebGL 없이 옮긴다. 상수(0.016·1.9, 0.18·0.57·0.6초 단계, 감쇠율 5/s, 스프링 45·6, 깜빡임 2.5 + 3.5 × 난수, 0.26초, dt 상한 0.035 등)는 그대로 둔다. 난수는 인자로 받는다.
- `app/src/renderer/Doany.tsx` — 셸. 버튼·정지 이미지·`<canvas>`, WebGL 셰이더(시안 문자열 그대로)와 64 × 64 메시, 텍스처 로드, `requestAnimationFrame` 루프, `ResizeObserver`·`IntersectionObserver`, `matchMedia('(prefers-reduced-motion: reduce)')`, `webglcontextlost`. 부모가 홉과 입력을 알릴 수 있게 명령형 핸들(`hop()`, `typing()`)을 연다.
- `app/src/renderer/public/doany/` — `doany.png`(정지), `body.png`, `hat.png`. `.doan/assets/doany/`의 원본을 바이트 그대로 복사한다. `README.md`에 출처를 적는다(`public/provider-logos/README.md`와 같은 방식: 복사 출처, 생성 방식, 코드 라이선스와 아트워크의 구분). 상대 경로(`doany/body.png`)로 읽어 패키지 앱의 file URL에서도 풀리게 한다(`homeComposer.ts` `providerLogo`와 같은 이유).
- 스타일 — `.doany` 규칙을 `styles.css`에 둔다. 시안 `mascot.css`의 규칙을 옮긴다(호스트 크기, `img` 20% 패딩, `[hidden]`, `:focus-visible` 링). 스타일시트는 `<link>`로만 읽는다(ARCHITECTURE §7 'Renderer styles').
- 아이콘 — `app/resources/icon.png`. `app/build/`는 git이 무시하므로(`.gitignore`) 그곳에 둘 수 없다. 원본 `white/doany.png`(1254 × 1254)를 `sips -z 1024 1024`로 1024 × 1024로 줄인다(icns 최대 크기 512@2x). `build.mac.icon`이 이 파일을 가리킨다.

### 모션 코드 라이선스
`mascot.js`는 MIT(`motion/LICENSE`, "Doan contributors")다. 옮긴 두 파일 머리에 `SPDX-License-Identifier: MIT`를 남긴다. 저장소는 Apache-2.0(ARCHITECTURE §9)이고 MIT 코드를 함께 둘 수 있다. 아트워크에는 이 코드 라이선스가 적용되지 않는다는 점을 public README에 옮긴다.

## 동작 — 시안과 같게 (사용자 요구: 완전히 동일하게)

옮길 때 바꾸는 것은 DOM 결합뿐이다. 수식과 상수, 순서는 그대로다.

| 시안 (`mascot.js`) | 앱 |
|---|---|
| `host.closest('[data-mascot-scope], [data-doan-frame]')`에 `pointermove` | 프레임이 창 전체이므로 `document`에 `pointermove`. 시선 목표 계산식은 같다(그리기 영역 중심 기준, 크기 × 1.5로 나누고 ±1로 자름, 1.8초 유지) |
| `[data-mascot-message]`의 `input` → `typingUntil = t + 1.4` | Home 입력창 textarea의 `input`에서 `typing()` |
| `[data-mascot-send]` 클릭 → `jump()` | Home `send()`가 가드를 통과해 전송을 시작할 때 `hop()` |
| 호스트 클릭, Enter·Space → `jump()` | 같다 |
| `greet`·`blink`·`pause` 액션 | 옮기지 않는다. 스터디 프레임 컨트롤에서만 불린다(spec 비목표). 자동 깜빡임은 `tick`에 있으므로 그대로 옮긴다 |
| 페이지 수명 = 리그 수명 | 언마운트 시 rAF 취소, 옵저버·리스너 해제, `WEBGL_lose_context`로 컨텍스트 반납. Home은 화면을 떠날 때 언마운트되므로(`App.tsx` `screen === "home"`) 방문마다 새 컨텍스트가 생긴다. 반납하지 않으면 Chromium 컨텍스트 상한에 걸려 오래된 컨텍스트가 강제로 잃어진다 |
| 텍스처 실패·WebGL 없음·컨텍스트 손실 → `data-state="static"`, PNG | 같다 |
| `data-state`(`idle`·`attentive`·`jump`·`reduced-motion`·`static`) | 같다. 런타임 검사가 읽는다 |

## 순수 함수 (`/tdd` 대상)

`doanyMotion.ts`:

- `pose(state, reduced)` → `{ squash, lift, tilt, energy, hatTilt, eyeOpen, look, time, mode }` — 시안 `render`의 자세 계산. idle 숨·기울기, typing(attentive), 홉 세 단계, 줄인 모션의 0 값. `greet` 분기는 넣지 않는다.
- `step(state, dt, random)` → 다음 state — 시안 `tick`의 시간 진행: dt 상한 0.035, 포인터 1.8초 뒤 떠도는 시선, typing 시선, 지수 평활 rate 5, 베레모 스프링(45, 감쇠 6), 깜빡임 예약과 눈 개폐 곡선.
- `lookTarget(pointer, rect)` → `{ x, y }` — 포인터 시선 목표.
- `hop(state)`, `typing(state)` → state — `jumpAt = time`, `hatV -= .9` / `typingUntil = time + 1.4`. 줄인 모션에서 `hop`은 아무것도 하지 않는다(시안 `jump`의 `reduced.matches` 가드).
- `canvasSize(clientWidth, devicePixelRatio)` → `min(1024, ceil(width × min(dpr || 1, 2)))`.

동일성 검증: 시안 `mascot.js`의 수식으로 만든 기대값(표본 시각·입력별 자세 값)을 테스트 고정값으로 둔다. 상수 하나를 바꾸면 테스트가 실패해야 한다.

## 배치

시안 CSS를 기준으로 한다(`doan-mascot.html`의 `.home-stage` 덮어쓰기, `study/welcome.css`).

- Home `.home-stage`: `min-height: 100%`, `justify-content: center`, padding `var(--space-8) var(--space-8) calc(var(--space-8) + 128px)`. 자식은 `flex-shrink: 0`. 기존 `padding-top: 152px`를 없앤다. Doany는 인사 문구 앞의 첫 자식이다.
- Welcome: 그룹을 크롬 아래 영역(`.ob-scroll`) 높이 기준으로 가운데 둔다. 지금 `.ob-welcome-main`은 `.ob-scene` 안에 있고 `.ob-scene`은 위 0·아래 48px 패딩을 갖는다(`.ob-welcome .ob-scene`). 시안의 `.welcome-stage`는 이 패딩 없이 `min-height: 100%`, 위 32px, 아래 `32 + 144px`이므로, Welcome에서 scene 패딩과 `.ob-welcome-main`의 `padding-bottom: var(--space-6)`가 중심을 틀지 않도록 맞춘다. 정확한 선언은 `/design-sync`가 측정으로 정한다. 기준은 '그룹 중심 −72px'와 '짧은 창의 위쪽 32px'이다.
- 홉 여유 공간이 그리기 영역 안에 있으므로 슬롯을 보이는 크기로 자르지 않는다.

## 형식 변경

없음. JSON Schema, fixture, 형식 버전 `v`를 건드리지 않는다.

## 규약 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **Renderer CSP** (`default-src 'self'; frame-src http://127.0.0.1:*; img-src 'self' blob:`, ARCHITECTURE §7): 텍스처와 PNG는 `'self'` 이미지이고 셰이더는 문자열 상수라 CSP를 넓히지 않는다. WebGL은 CSP 대상이 아니다. 인라인 `<style>`·`<script>`를 쓰지 않는다.
- **Renderer import boundary**: 새 파일은 main 모듈과 ajv를 import하지 않는다.
- **세션 권한 거부**: WebGL은 권한 요청을 하지 않는다.
- **토큰 우선**(DESIGN 'Tokens first'): 114px·142.5px 슬롯, 128/144px 광학 오프셋은 토큰에 없는 값이라 컴포넌트 상수로 둔다. 포커스 링 반경 24px도 시안 값이다.
- 다른 구조 결정(서빙 범위, sandbox iframe, append-only 이벤트, 토큰 미처리, git 미조작)과 무관하다.

## PoC 의존

- **file:// 텍스처 로드 (미검증)**: 패키지 앱은 renderer를 `loadFile`로 연다(`app/src/main/index.ts`). 에셋 README는 "direct `file:` URLs may block texture loading"이라 적었고, 시안 스크립트는 `img.crossOrigin = "anonymous"`를 건다. file:// 페이지에서 이 설정으로 WebGL `texImage2D`가 통과하는지는 확인되지 않았다. 통과하지 않으면 Doany는 정지 PNG로만 보인다. 그래서 P0을 먼저 한다: Electron 45와 앱 창과 같은 `webPreferences`·CSP로 file:// 페이지를 열어 `crossOrigin` 있음/없음 두 경우에 텍스처 로드, `gl.getError() === 0`, 캔버스 불투명 픽셀 수를 본다. 결과로 `Doany.tsx`의 로드 방식을 정한다.
- **macOS 아이콘 모양 (미검증)**: 흰 배경 정사각형 PNG가 현재 macOS(Darwin 25)의 Finder·Dock에서 어떤 모양으로 보이는지(자동 라운드 마스크 여부) 확인하지 않았다. 패키지 후 눈으로 확인하고, 사용자 기대와 다르면 보고한다. LaunchServices 아이콘 캐시 때문에 같은 경로의 이전 빌드 아이콘이 남아 보일 수 있으니 새 임시 경로에 복사해 확인한다.

## POSTMORTEM에서 관련 함정

- [2026-10-30 — Packaged-app probes failed for reasons of their own: keychain, signature identity and focus](../../POSTMORTEM.md): Playwright로 띄운 페이지는 창 포커스·blur를 받지 못했다. Doany 홉·시선 확인을 포커스 이벤트에 기대지 말고 `data-state`와 포인터 이벤트로 본다. 패키지 앱은 ad-hoc 서명이므로 아이콘 확인도 같은 이유로 새 경로 복사본에서 한다.
- [2026-10-30 — A renderer import of a main module left the built app's window blank](../../POSTMORTEM.md): 새 renderer 파일이 main 모듈을 값으로 import하지 않게 한다. 빌드 앱 창이 비는지 runtime 검사에서 본다.
- [2026-10-24 — The onboarding wizard lost keys and clicks to focus and modal stacking](../../POSTMORTEM.md): Welcome은 `<dialog>` 오버레이 안이다. Doany 버튼 추가가 Welcome의 h1 초기 포커스와 Get started 키 입력을 바꾸지 않는지 확인한다.
- [2026-10-23 — A full-width message assertion included the native scrollbar](../../POSTMORTEM.md): 짧은 창 스크롤 측정에서 스크롤바 폭을 그룹 가로 중심 계산에 넣지 않는다.
