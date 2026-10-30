# doan-mascot — tasks

순서: PoC → 에셋 → 순수 함수 → 셸(WebGL·DOM) → UI 배치 → 패키징 → 실제 앱 검증 → 승격.

## P. PoC

- [ ] P0. file:// 텍스처 로드 PoC (`.scratch/doan-mascot/poc/`). Electron 45로 앱 창과 같은 `webPreferences`와 빌드 CSP를 건 file:// 페이지를 열고, `body.png`·`hat.png`를 `crossOrigin = "anonymous"` 있음/없음으로 각각 WebGL 텍스처에 올린다. 두 경우의 로드 성공, `gl.getError()`, 캔버스 불투명 픽셀 수를 기록하고 `Doany.tsx`의 로드 방식을 정한다. 둘 다 실패하면 구현 전에 멈추고 사용자에게 보고한다.
  - 검증: `app/node_modules/.bin/electron .scratch/doan-mascot/poc/main.mjs --user-data-dir=<tmp>` (AGENTS.md Commands에 없는 일회성 PoC 명령, 사용자 승인). 결과(성공 방식, 오류 코드, 픽셀 수, 날짜)는 이 파일의 P0 아래와 커밋 메시지에 적는다.

## A. 에셋

- [ ] A1. `.doan/assets/doany/transparent/doany.png` → `app/src/renderer/public/doany/doany.png`, `motion/body.png`·`motion/hat.png` → 같은 디렉터리로 바이트 그대로 복사하고, 출처·생성 방식·코드 라이선스와 아트워크 구분을 적은 `public/doany/README.md`를 둔다.
  - 검증: `npm --prefix app run build` 성공, `app/out/renderer/doany/`에 세 PNG가 있다.
- [ ] A2. `white/doany.png`를 1024 × 1024로 줄여 `app/resources/icon.png`에 둔다(`sips -z 1024 1024`).
  - 검증: 파일이 git 추적 대상이다(`app/build/` 아님). 패키징 검증은 E1.

── commit: `feat(app): add Doany assets` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `app/src/renderer/doanyMotion.ts`: `pose`, `step`, `lookTarget`, `hop`, `typing`, `canvasSize` (design '순수 함수'). 테스트는 시안 `mascot.js` 수식으로 만든 기대값을 고정한다: 숨·기울기 표본, 홉 세 단계 경계(0.18·0.75·1.35초), typing 1.4초, 포인터 1.8초 뒤 떠도는 시선, 평활 rate 5, 베레모 스프링, 깜빡임 간격(난수 0과 1)과 0.26초 개폐 곡선, dt 상한 0.035, 줄인 모션에서 모든 값 0과 `hop` 무시, `canvasSize`의 1024 상한과 dpr 2 상한.
  - 검증: `npm --prefix app test` 녹색. 상수 하나를 바꾸면 해당 테스트가 빨갛게 된다(`/tdd`에서 확인).

── commit: `feat(app): port the Doany motion model` ──

## S. 셸

- [ ] S1. `app/src/renderer/Doany.tsx`와 `styles.css`의 `.doany` 규칙. 버튼(`aria-label="Make Doany hop"`)·정지 이미지·캔버스, 시안 셰이더와 64 × 64 메시, P0에서 정한 텍스처 로드, rAF 루프(보이지 않거나 문서가 숨겨지면 시간 정지), 크기·가시성 옵저버, 줄인 모션 변경 반영, 컨텍스트 손실과 로드 실패 시 PNG, 언마운트 시 rAF·옵저버·리스너 해제와 `WEBGL_lose_context`. `hop()`·`typing()` 핸들, `data-state`.
  - 검증: `npm --prefix app test` 녹색 — WebGL이 없는 jsdom에서 PNG가 보이고 `data-state="static"`, 클릭·Enter·Space가 `hop`을 부르는 마크업 테스트, 언마운트 시 해제 테스트. `npm --prefix app run typecheck` 통과.

── commit: `feat(app): add the Doany component` ──

## U. UI 배치

- [ ] U1. Home: `.home-stage` 첫 자식으로 Doany(114px). 배치를 시안대로 바꾼다(design '배치'). 입력창 textarea `input` → `typing()`, `send()`가 가드를 통과할 때 → `hop()`.
  - 검증: `npm --prefix app test` 녹색 — `Home.test.tsx`에 `.home-stage` 규칙(152px 위쪽 여백 없음, `justify-content: center`, 아래 `calc(var(--space-8) + 128px)`)과 Doany가 인사 문구 앞에 오는 마크업 테스트, 비활성 Send·빈 입력에서 홉하지 않는 테스트.
- [ ] U2. Welcome: 워드마크 앞에 Doany(142.5px). 그룹 중심 배치(design '배치').
  - 검증: `npm --prefix app test` 녹색 — `Onboarding.test.tsx`에 Doany가 워드마크 앞에 오는 마크업과 h1 초기 포커스가 유지되는 테스트.

── commit: `feat(app): place Doany on Home and Welcome` ──

## E. 패키징

- [ ] E1. `app/package.json` `build.mac.icon`을 `resources/icon.png`로 설정한다.
  - 검증: `npm --prefix app run package` 성공. `Doan.app/Contents/Resources/`에 이 이미지로 만든 icns가 있고 `Info.plist`의 `CFBundleIconFile`이 그것을 가리킨다. Finder·Dock 모양은 새 임시 경로 복사본으로 눈으로 확인하고 스크린샷을 남긴다(design 'PoC 의존').

── commit: `build(app): use Doany as the app icon` ──

## V. 실제 앱 검증

- [ ] V1. `/runtime-test` — 격리한 실제 앱(dev와 패키지 둘 다, 패키지는 file:// 경로 확인용)에서 Home과 Welcome: Doany의 `data-state`가 `static`이 아님, 클릭과 Send로 `jump`, 입력으로 `attentive`, 줄인 모션 에뮬레이션으로 `reduced-motion`, Home을 열고 닫기를 20번 이상 반복한 뒤에도 컨텍스트 손실 경고 없음, 창이 비지 않음.
  - 검증: `/runtime-test` 보고서와 스크린샷(`.scratch/`).
- [ ] V2. `/design-sync` — `mascot-home`·`mascot-welcome` 프레임 대 실제 앱 computed style. 내용 높이 세 가지 이상에서 그룹 중심(Home −64px, Welcome −72px), 짧은 창의 위쪽 32px과 스크롤, 홉 정점에서 베레모가 그리기 영역에 닿지 않음, Welcome 그룹 안의 Get started.
  - 검증: `/design-sync` 측정 기록이 `docs/DESIGN.md` Home·Onboarding 절에 들어감.

── commit: `/design-sync`의 커밋 규칙을 따른다 ──

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문, 근거는 커밋 메시지).
  - `docs/PRODUCT.md` §5: Home 본문 구성("nothing else" 문장)에 Doany와 상호작용, 첫 실행 Welcome에 Doany, 패키지 앱 아이콘. 파비콘 미사용은 적지 않는다(쓰지 않는 것은 상태가 아니다).
  - `docs/ARCHITECTURE.md` §7: Doany 모듈 경계(순수 `doanyMotion.ts`와 셸, 언마운트 시 컨텍스트 반납, file:// 텍스처 로드 방식과 P0 근거), MIT 헤더, 'Packaging' 줄에 `mac.icon`과 `app/resources/`.
  - `docs/DESIGN.md`: Welcome의 바뀐 y 좌표와 Home 'Body' 행, Doany 슬롯·오프셋·포커스 링(V2가 쓴 내용 확인).
  - `docs/DIRECTORY.md`: `app/resources/`, `app/src/renderer/public/doany/`, 새 renderer 파일.
  - `.doan/assets/doany/README.md`: "These files do not install an app icon or change the application"과 'Native-app integration is not tested or implemented'를 현재 상태로 고친다.
  - 검증: `grep -n 'Doany' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/DIRECTORY.md`가 각 파일에서 줄을 찾는다. `grep -n '152px\|padding 152' docs/DESIGN.md` 결과 없음.
- [ ] Z2. `docs/features/doan-mascot/`를 삭제한다.
  - 검증: 디렉터리가 없다.

── commit: 문서별로 나눈다 — `docs(product): …` / `docs(architecture): …` / `docs(design): …` / `docs(directory): …` / `docs(assets): …` / `docs(feature): complete doan-mascot` ──
