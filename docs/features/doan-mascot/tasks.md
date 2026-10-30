# doan-mascot — tasks

buzz-restyle의 리디자인 자식이다([부모 C11](../buzz-restyle/tasks.md)).

진행 순서는 PoC → 에셋 → 순수 함수 → 컨트롤러 → 셸(WebGL·DOM) → UI 배치 → 패키징 → 실제 앱 검증 → 승격이다.

테스트는 DOM 없이 돌린다(ARCHITECTURE §7 'Home tests without a DOM'). 동작은 순수 함수와 주입형 컨트롤러로 node에서, 마크업은 `renderToStaticMarkup`으로 확인한다. 실제 이벤트·포커스·WebGL은 V1에서 확인한다.

## P. PoC

- [x] P0. file:// 텍스처 로드 PoC를 `.scratch/doan-mascot/poc/`에서 돌린다.
  - **결과 (2026-10-31, Electron 45.0.0 / Chrome 156.0.8078.48, ANGLE Metal Apple M1)**: 앱 창과 같은 `webPreferences`(contextIsolation·sandbox, nodeIntegration 끔), 빌드 CSP, 권한 거부 핸들러로 확인했다. 일반 file:// 경로와 asar 안 경로(`page.asar/index.html`) 모두에서 `crossOrigin = "anonymous"`가 있을 때와 없을 때 `body.png`·`hat.png`가 로드됐다. `gl.getError()`는 0이었고, 256px 캔버스의 불투명 픽셀은 body 38211, hat 9515였다(두 경로·두 모드에서 같음).
  - **결정**: 시안과 같게 `img.crossOrigin = "anonymous"`를 유지한다.
  - **참고**: PoC 스크립트에서 창 하나를 닫은 뒤 두 번째 창의 `loadFile`이 경로와 상관없이 `ERR_FAILED (-2)`로 실패했다. 순서를 바꿔 두 경로를 각각 첫 창에서 확인했다. 이 실패는 PoC 스크립트의 문제이고, 앱 동작과는 관계없다.
  - Electron 45로 앱 창과 같은 `webPreferences`와 빌드 CSP를 건 페이지를 연다. 위치는 두 곳이다: (a) 일반 file:// 경로, (b) asar 안 경로.
  - `body.png`·`hat.png`를 `crossOrigin = "anonymous"`가 있을 때와 없을 때 각각 WebGL 텍스처에 올린다.
  - 경우마다 로드 성공 여부, `gl.getError()`, 캔버스 불투명 픽셀 수를 기록한다. 그 결과로 `Doany.tsx`의 로드 방식을 정한다.
  - 모든 경우가 실패하면 구현 전에 멈추고 사용자에게 보고한다.
  - 검증: `app/node_modules/.bin/electron .scratch/doan-mascot/poc/main.mjs --user-data-dir=<tmp>`로 실행한다. AGENTS.md Commands에 없는 일회성 PoC 명령이며 사용자가 승인했다. 결과(성공 방식, 오류 코드, 픽셀 수, 날짜)는 이 파일의 P0 아래와 커밋 메시지에 적는다.

## A. 에셋

- [ ] A1. `.doan/assets/doany/transparent/doany.png`를 `app/src/renderer/public/doany/doany.png`로 복사한다. `motion/body.png`·`motion/hat.png`도 같은 디렉터리로 복사한다. 모두 바이트 그대로 복사하고, `public/doany/README.md`를 둔다(design '파일 배치').
  - 검증: `npm --prefix app run build`가 성공하고, `app/out/renderer/doany/`에 세 PNG가 있다.
- [ ] A2. `white/doany.png`를 `sips -z 1024 1024`로 줄여 `app/resources/icon.png`에 둔다. 다른 가공은 하지 않는다.
  - 검증: 두 명령을 확인한다.
    - `git check-ignore app/resources/icon.png`가 아무것도 출력하지 않는다.
    - `sips -g pixelWidth -g pixelHeight app/resources/icon.png`가 1024 × 1024다.

── commit: `feat(app): add Doany assets` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T0. 기대값 추출 스크립트 `.scratch/doan-mascot/golden.mjs`를 만든다(design '기대값 출처'). 원본 `mascot.js`를 vm에서 stub과 함께 돌리고, `Math.random`과 시간을 고정해 시나리오별 uniform 값을 JSON으로 뽑는다. 시나리오는 다음과 같다.
  - 쉬기 10초: 첫 깜빡임 2초, 이후 난수 0과 1일 때의 간격.
  - 포인터 이동 후 1.8초 경과.
  - typing 1.4초.
  - 홉 경계 0.18·0.75·1.35초와 홉 도중 재홉.
  - 줄인 모션 켜기·끄기, 홉 도중 전환 포함.
  - 숨김 뒤 재개(첫 dt가 0.035로 잘림).
  - dpr 1·2에서의 `canvasSize`.
  - 검증: 같은 입력으로 두 번 실행해 같은 JSON이 나온다. 재생성 명령은 커밋 메시지에 적는다.
- [ ] T1. `app/src/renderer/doanyMotion.ts`. 함수 목록은 design '순수 함수'에 있다. 테스트는 T0의 JSON을 고정 데이터로 쓴다.
  - 검증: `npm --prefix app test`가 녹색이다.
- [ ] T2. `app/src/renderer/stageInsets.ts`. 테스트 대상은 다음과 같다.
  - 오프셋이 다 들어가는 높이에서 중심 오프셋 −64·−72.
  - 1200px 이상의 높은 뷰포트에서도 같은 오프셋.
  - slack이 오프셋의 두 배보다 작을 때 오프셋이 줄어드는 구간.
  - slack ≤ 0일 때 top·bottom이 32이고 넘침만 남음.
  - 최소 창 높이 600px에서 빈 스크롤이 없음.
  - 검증: `npm --prefix app test`가 녹색이다.
- [ ] T3. `onboardingView.ts` `nextFocusIndex`에 DOM 순서 규칙을 넣는다(design '포커스'). 테스트 대상은 다음과 같다.
  - 목록 밖 요소에서 Tab·Shift+Tab을 누르면 `null`(브라우저 이동).
  - 끝에서 감싸기.
  - 기존 목록 안 감싸기가 그대로인지.
  - 검증: `npm --prefix app test`가 녹색이다.
- [ ] T4. `/implement` 뒤 뮤테이션 확인: `doanyMotion.ts`의 상수 다섯 개(숨 주기 1.9, 홉 0.18, 평활 5, 스프링 45, 깜빡임 0.26)를 하나씩 바꿔 테스트가 빨갛게 되는지 본다.
  - 검증: 바꾼 상수와 결과를 이 파일의 T4 아래에 적는다. 확인한 뒤 원래 값으로 되돌렸는지 `git diff`가 비었는지로 확인한다.

── commit: `feat(app): port the Doany motion model and stage layout rules` ──

## C. 컨트롤러

- [ ] C1. `app/src/renderer/doanyRig.ts`. 가짜 시계·그리기 대상·질의를 주입해 node에서 테스트한다. 테스트 대상은 다음과 같다.
  - 준비 전에는 그리지 않음.
  - 텍스처가 실패하면 `static`.
  - 해제 뒤 늦게 끝난 Promise는 무시.
  - 숨김(교차 없음, `checkVisibility` 거짓, 문서 숨김) 동안 시간이 멈춤.
  - 재개 첫 dt가 0.035로 잘림.
  - 매 프레임 `last` 갱신.
  - 줄인 모션 전환 시 hat 리셋과 render.
  - resize 뒤 render.
  - 컨텍스트 손실 시 `static`.
  - 해제 순서(손실 리스너 → rAF → 옵저버·리스너 → loseContext). 해제 중에 `static`이 기록되지 않아야 한다.
  - 검증: `npm --prefix app test`가 녹색이다.

── commit: `feat(app): add the Doany rig controller` ──

## S. 셸

- [ ] S1. `app/src/renderer/Doany.tsx`와 `doany.css`(`index.html`에 `<link>` 추가)의 `.doany` 규칙. 실제 WebGL 어댑터(시안 컨텍스트 옵션·blend·셰이더·메시, P0에서 정한 텍스처 로드), 옵저버, `matchMedia`, `document` `pointermove`, 클릭과 keydown Enter·Space(`preventDefault`)를 컨트롤러에 연결한다. `data-state`는 ref로 쓴다. `hop()`·`typing()` 핸들을 연다.
  - 검증: 다음을 확인한다.
    - `npm --prefix app test`가 녹색이다. `renderToStaticMarkup` 테스트에서 버튼의 `aria-label="Make Doany hop"`, 정지 이미지 `doany/doany.png`, `hidden`인 캔버스, `data-state` 없음을 본다.
    - `npm --prefix app run typecheck`가 통과한다.

── commit: `feat(app): add the Doany component` ──

## U. UI 배치

- [ ] U1. Home(`HomeComposerView.tsx`)에 다음을 넣는다.
  - `.home-stage`의 첫 자식으로 Doany(114px).
  - `stageInsets`로 정한 위쪽 padding과 기준 높이(design '배치'), 추천 프롬프트 자리 유지.
  - textarea `input`에서 `typing()`, `send()`가 가드를 통과한 직후 `hop()`.
  - 검증: `npm --prefix app test`가 녹색이다. 테스트는 다음을 본다.
    - `Home.test.tsx` 마크업: Doany가 인사 문구 앞에 온다.
    - 입력이 있을 때 추천 프롬프트 자리가 남고 접근성 트리에서 빠진다.
    - `styles.css`의 `.home-stage`에 `152px`이 없다.
    - 홉을 가드 뒤에서만 부르는지와 Retry 경로는 V1에서 확인한다.
- [ ] U2. Welcome(`Onboarding.tsx`)에 다음을 넣는다.
  - 워드마크 앞에 Doany(142.5px).
  - `stageInsets` 배치. Welcome에서는 scene 패딩과 `.ob-welcome-main`의 아래 padding을 없앤다.
  - keydown Tab 처리에 `before` 계산을 연결한다.
  - 검증: `npm --prefix app test`가 녹색이다. 테스트는 다음을 본다.
    - `Onboarding.test.tsx` 마크업: Doany가 워드마크 앞에 온다.
    - T3 테스트.
    - 포커스와 Tab 순서는 V1에서 확인한다.

── commit: `feat(app): place Doany on Home and Welcome` ──

## E. 패키징

- [ ] E1. `app/package.json`의 `build.mac.icon`을 `resources/icon.png`로 설정한다.
  - 검증: 다음을 확인한다.
    - `npm --prefix app run package`가 성공한다.
    - `Doan.app/Contents/Info.plist`의 `CFBundleIconFile`이 `electron.icns`가 아니다.
    - 그 파일이 `Contents/Resources/`에 있다.
    - 새 임시 경로에 복사한 앱을 Finder와 Dock에서 보고 스크린샷을 남긴다. 사용자가 모양을 확인한다.

── commit: `build(app): use Doany as the app icon` ──

## V. 실제 앱 검증

- [ ] V1. `/runtime-test`를 격리한 실제 앱에서 돌린다. dev와 패키지 앱 둘 다 쓰며, 패키지 앱은 asar file:// 텍스처 판정용이다.
  - **텍스처**: 캔버스가 보이고 `data-state`가 생길 때까지 기다린 뒤(로딩 중에는 PNG이고 속성이 없다), Home과 Welcome의 `data-state`가 `idle`이다.
  - **홉**:
    - 클릭하면 `jump`.
    - Enter를 한 번 누르면 홉이 한 번만 일어난다(`jump` 진입이 한 번이고 베레모 속도가 두 배가 되지 않는다).
    - Send·전송 키·Retry로 `jump`.
    - 비활성 Send에서는 `jump`가 없다.
  - **모션 상태**:
    - 입력하면 `attentive`.
    - 줄인 모션 에뮬레이션에서 `reduced-motion`. 이때 클릭해도 뛰지 않는다.
  - **숨김**: 첫 실행 Welcome 뒤의 Home Doany는 그리지 않는다. 가려진 동안 Home 캔버스의 픽셀이 바뀌지 않는지로 판정한다. 관찰할 수 없으면 C1 테스트로 갈음한다고 보고에 적는다.
  - **수명**:
    - Home을 열고 닫기를 20번 넘게 반복한 뒤에도 콘솔에 "Too many active WebGL contexts"가 없다.
    - 마지막 Home의 `data-state`가 `static`이 아니다.
    - 빌드한 앱의 창이 비지 않는다.
  - **포커스(Welcome)**:
    - 열 때 h1에 포커스가 있다.
    - 그 전에 Doany 포커스 링이 한 프레임이라도 보이는지 스크린샷으로 확인한다.
    - h1 다음 Tab은 Get started, Shift+Tab은 Doany다.
    - Escape를 계속 막는다.
  - 검증: `/runtime-test` 보고서와 스크린샷(`.scratch/`).
- [ ] V2. `/design-sync`로 `mascot-home`·`mascot-welcome` 프레임과 실제 앱의 computed style을 비교한다. 이 자식의 새 시안이므로 리디자인 예외를 적용한다.
  - 측정 높이는 600(최소 창 높이)·780·1200 이상이다. 높이마다 다음을 잰다.
    - 그룹 중심: 오프셋이 다 들어가는 높이에서 Home −64, Welcome −72.
    - 600px에서 위쪽 32px이 남고 빈 스크롤이 없음.
    - Home에서 첫 글자 입력과 textarea 3줄 이상 확장 전후의 입력창 top 불변.
    - 홉 정점에서 베레모가 그리기 영역에 닿지 않음.
    - Welcome 그룹 안의 Get started.
  - 가로 중심 계산에서는 스크롤바 폭을 뺀다.
  - 검증: `/design-sync` 측정 기록이 `docs/DESIGN.md`의 Home·Onboarding 절에 들어간다. 시안과 다른 점(기준 높이, 오프셋 축소, 추천 자리 유지)은 documented difference로 적는다.

── commit: `/design-sync`의 커밋 규칙을 따른다 ──

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다. 문서는 영문으로 쓰고, 근거는 커밋 메시지에 적는다.
  - `docs/PRODUCT.md` §5:
    - Home 본문 구성("and nothing else" 문장)에 Doany와 그 상호작용을 넣는다.
    - 첫 실행 Welcome에 Doany를 넣는다.
    - 패키지 앱 아이콘을 적는다.
  - `docs/ARCHITECTURE.md` §7:
    - Doany 모듈 경계: 순수 모션, 주입형 컨트롤러, 셸, 언마운트 해제 순서와 컨텍스트 반납, 가려진 상태 판정, file:// 텍스처 로드 방식과 P0 근거.
    - MIT 헤더.
    - 첫 실행 Tab 트랩의 DOM 순서 규칙.
    - 'Packaging' 줄에 `mac.icon`과 `app/resources/`.
  - `docs/DESIGN.md`: Welcome의 바뀐 y 좌표와 'Welcome does not scroll' 계약, Home 'Body' 행, Doany 슬롯·오프셋·포커스 링. V2가 쓴 내용을 확인한다.
  - `docs/DIRECTORY.md`: `app/resources/`, `app/src/renderer/public/doany/`, 새 renderer 파일.
  - `.doan/assets/doany/README.md`: "These files do not install an app icon or change the application"과 "Native-app integration is not tested or implemented"를 현재 상태로 고친다.
  - 검증: 다음을 확인한다.
    - `grep -n 'Doany' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/DIRECTORY.md`가 네 파일 모두에서 줄을 찾는다.
    - `grep -n 'padding 152' docs/DESIGN.md` 결과가 없다. 지금은 DESIGN.md의 Home 'Body' 행 "stage padding 152 / 32 / 32"에 걸린다.
- [ ] Z2. 부모 `docs/features/buzz-restyle/tasks.md`의 C11을 완료로 표시하고, `docs/features/doan-mascot/`를 삭제한다.
  - 검증: C11이 `[x]`이고 디렉터리가 없다.

── commit: 문서별로 나눈다 — `docs(product): …` / `docs(architecture): …` / `docs(design): …` / `docs(directory): …` / `docs(assets): …` / `docs(feature): complete doan-mascot` ──
