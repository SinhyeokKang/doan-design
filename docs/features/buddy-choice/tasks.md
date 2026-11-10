# 버디 선택 — tasks

1단계는 lead가 develop에서 대화하며 진행한다(에셋과 초안 캔버스, `docs(design)` 커밋). 2·3단계 구현은 1단계 에셋(1.4b~1.6)이 모두 끝난 뒤 `/orchestrate`로 한 번에 진행한다(사용자 결정). 그 전에는 구현을 시작하지 않는다.

AGENTS.md 'Commands'에 없는 확인 명령(`file`, `rg`, 측정 스크립트)은 lead가 대화에서 실행하는 1단계 확인과 4.1의 문서 검사에만 쓴다.

## 1단계 — 에셋과 초안 (lead, develop)

- [x] **1.1 에셋 구조.** `.doan/assets/buddies/<id>/`(puri, dungdung, popo, dori)에 시안 카드 이미지를 `card.png`로, 받은 GIF를 `artist-original.gif`로, 프레임을 맞춘 GIF를 `artist.gif`로, 첫 프레임을 `artist-rest.png`로 넣었다. `.doan/assets/buddies/README.md`에 버디 하나의 에셋 세트, Doany와의 대응, 출처, 소스 박스를 적었다. 버디별 리그 수치도 이 README에 적는다.
  - 확인: `file .doan/assets/buddies/*/card.png .doan/assets/buddies/*/artist.gif`가 1254² PNG와 512² GIF를 보여준다.
- [x] **1.2 accent 램프 캔버스.** `.doan/canvases/buddy-accent.html`: 다섯 램프(1–12, pressed, link), 아이콘 색, 몸통 견본, 대비표(칩 글자 4.5:1, 눌린 사이드바 행 위 아이콘 3:1, 9·hover·pressed 위 Send 잉크 3:1), 각 램프로 칠한 Accent places 견본. 친구 램프는 `tokens.css` palette에 들어갔다.
  - 확인: `doan check --json --repo .`에 이 캔버스의 finding이 없다. 대비 수치는 램프 값에서 계산해 표에 적었다.
- [x] **1.3 화면 초안 (`/design-draft`).** `.doan/canvases/buddy-choice.html`: 첫 실행 Buddy 단계(기본·선택·끝·저장 실패), 기존 사용자용 버디 화면, 설정 General(행, 저장 실패), 캔버스 작업 안내. `.doan/canvases/buddy-home.html`: 버디마다 입력이 채워진 Home. Home과 Settings 프레임은 빌드한 앱을 1238 × 780으로 띄워 헤더·사이드바 마크업과 위치를 맞췄다(`.scratch/runtime-test/buddy-home/`). 문구는 Doan clarify preset으로 다듬었고, critique·audit preset 검수 결과를 반영했다.
  - 확인: `doan check`·`doan ls`가 통과하고, 사람이 앱에서 초안을 확인한다.
- [ ] **1.4 artist GIF 앱 사본.** `.doan/assets/buddies/README.md`의 소스 박스로 친구 GIF를 자르고 128²로 줄여 `public/buddies/<id>/artist.gif`·`artist-rest.png`를 만든다(Doany와 같은 방법, `public/doany/README.md`). 3.2 커밋에 넣는다.
  - 확인: 128² GIF이고 프레임 수와 시간이 원본과 같다. 측정 명령은 정하지 않았다(command undecided — 사용자 확인 필요). 캔버스의 32px 견본과 같은 크기·위치로 보인다.
- [x] **1.4b Doany 카드 (Codex 워커).** `.doan/assets/buddies/doany/card.png`를 원본 `.doan/assets/doany/v2/doany.png` 기준으로 친구 카드와 같은 그림자·크기로 다시 그린다.
  - 확인: 1254² RGB이고, `buddy-choice.html`에서 다섯 카드가 같은 크기로 보인다. 사람이 확인했다(생성 1회).
- [x] **1.5 정지 이미지·레이어 PoC (Codex 워커, puri).** 투명 `still.png`, `body.png`, `accessory.png`, 카드에서 떼어 낸 `shadow.png`, `prompts.json`을 만들고 README에 리그 수치와 접지 수치를 적었다. still·body·accessory에는 그림자가 없다. 눈 자리 채움은 한 번 다시 했다(주변과 밝기 차 2% 이내, 질감 대비 비율 .85–1.15).
  - 확인: 네 장 모두 1254² RGBA다. `body.png` 위에 `accessory.png`를 합성한 그림이 눈 영역을 빼면 `still.png`와 알파 경계에서 1px(1254² 기준) 안에서 맞는다. 눈 중심과 반지름은 `still.png`의 눈과 UV `.003` 안에서 맞는다. 측정 스크립트와 결과는 워커의 `.scratch/buddy-assets/`에 있다. 사람이 `buddy-assets`의 모션 미리보기로 확인했다(생성 4회).
- [ ] **1.6 나머지 셋과 Doany 그림자 (Codex 워커).** dungdung, popo, dori도 1.5와 같은 방법으로 `shadow.png`까지 만든다. 목도리와 헤드폰은 소품 기울기 범위를 줄이고, 안경은 0으로 둔다. Doany의 `shadow.png`도 새 카드에서 떼어 낸다. `buddy-home`과 `buddy-assets` 캔버스에 반영한다.
  - 확인: 1.5와 같다. 버디 4개의 이미지 용량 합을 재서 사람에게 보고하고, 해상도를 줄일지 묻는다.
  - ⎯ 커밋: 버디마다 `docs(design): <id> buddy layers`, Doany는 `docs(design): doany buddy shadow`

- [x] **1.7 Welcome·설치 디스크 초안.** `.doan/canvases/buddy-welcome.html`(Bottom bleed, 780·600)과 `buddy-installer.html`(사진·아이콘 가로 배열·문장)을 그렸고, 사람이 두 안을 확정했다. 단체 사진은 `.doan/assets/buddies/group/`에 있다.
  - 확인: `doan check --json --repo .`에 두 캔버스의 finding이 없다. 780·600에서 다섯 버디의 눈이 모두 보이는 것을 스크린샷으로 확인했다.

## Codex 워커 인계 (1.4b, 1.5, 1.6)

사용자가 이 기능의 에셋 이미지 제작에 한해 Claude lead가 Codex 워커를 쓰도록 허락했다(AGENTS.md 'Worker model boundary'). 워커는 아래만 읽으면 이어서 작업할 수 있다.

- **읽을 것**: `.doan/assets/buddies/README.md`('Next' 두 절), `.doan/assets/doany/v2/README.md`와 `layer-prompts.json`(Doany 레이어를 만든 방법), design.md '에셋 구조'와 '리그 일반화'(리그 수치 목록).
- **만들 것**
  - 1.4b: `doany/card.png`. 원본 `.doan/assets/doany/v2/doany.png`를 친구 카드와 같은 스타일(흰 바탕, 부드러운 바닥 그림자, 같은 크기와 바닥선)로 다시 그린다. Doany의 형태와 색은 바꾸지 않는다.
  - 1.5(완료): `puri/`의 `still.png`, `body.png`, `accessory.png`, `shadow.png`, `prompts.json`, README의 리그·접지 수치.
  - 1.6: `dungdung/`, `popo/`, `dori/`에도 같은 파일을 만들고, `doany/shadow.png`를 `doany/card.png`에서 떼어 낸다.
- **하지 않을 것**: `card.png`(친구)와 `artist*.gif`·`artist-rest.png`는 고치지 않는다. 앱 코드, `tokens.css`, 다른 feature 문서도 고치지 않는다.
- **캔버스 갱신**: `.doan/assets/buddies/README.md` 'Next' 절 끝의 목록대로 `buddy-home.html`(친구 슬롯을 still과 그림자 레이어로 바꿈)과 `buddy-assets.html`(`motion-preview.js`의 `BUDDIES`에 추가하고 프레임을 모션 슬롯과 실제 파일 타일로 바꿈)을 고친다. `buddy-choice.html`의 카드는 `card.png`를 그대로 쓴다.
- **확인**: 1.5의 확인 기준과 같다. 그리고 `doan check --json --repo .`에 이 캔버스들의 finding이 없어야 한다.
- **커밋과 인계**: 최신 develop에서 만든 Orca worktree의 `docs/buddy-assets` 브랜치에서 작업한다. 버디마다 `docs(design): <id> buddy layers`로 커밋하고, 마지막 줄은 `Co-Authored-By: Codex <noreply@openai.com>`이다. 푸시하지 않는다. lead가 검수한 뒤 develop에 합친다.

## 2단계 — accent 동적 변경 (`/orchestrate`)

- [ ] **2.1 대비 검사 (순수 함수).** `ds/checks.ts`: `rootTokens(css, buddy?)`(기본은 순수 `:root`, 버디를 주면 `:root[data-buddy=…]`를 덮음), 버디별 `contrastPairs`·`rolePairs`(칩 글자 4.5:1, 아이콘 색 눌린 사이드바 행 위 3:1, Send 잉크 9·hover·pressed 위 3:1 nontext), 버디 accent 추적(`violetNames`·`accentPlaces`가 모든 버디 palette와 `--buddy-*`를 따라감). 먼저 테스트로 고정한다. 케이스: legacy `--accent`·`--accent-ink`·`--accent-soft`·`--accent-line`이 `--buddy-*`와 섞이지 않는다, `:root[data-buddy]` 블록이 기본값 해석에 섞이지 않는다, `--violet-*`를 직접 읽는 곳은 `.ob-atmosphere`뿐이다, `@theme inline`이 어떤 버디 palette나 `--buddy-*`에도 닿지 않는다.
  - 확인: `npm --prefix app test`가 통과한다(새 테스트가 먼저 red였다).
- [ ] **2.2 토큰.** `tokens.css`의 친구 램프를 그대로 쓰고, 전환층 `--buddy-*`(role이 읽는 단계만), `:root[data-buddy=…]` 덮어쓰기, `--text-accent`를 넣는다. role이 `--buddy-*`를 읽게 바꾸고, `--text-on-accent`는 버디별 잉크(흰색 우선, 3:1 미만이면 중립)로 바꾼다. design.md 'Accent places 배정'대로 아이콘·점·외곽선을 `--text-accent`로 바꾼다. `.ob-atmosphere`는 `--violet-9`를 직접 읽는다. `ds/checks.test.ts`의 `violetAllowed`를 새 이름과 Welcome 예외에 맞춘다. Send의 `rolePairs` 종류를 nontext로 바꾼다.
  - 확인: `npm --prefix app test`(`ds/checks.test.ts`의 `accentPlaces`, `contrastPairs`, `rolePairs`)와 `npm --prefix app run typecheck`가 통과한다.
  - ⎯ 커밋: `feat(app): buddy accent ramps`
- [ ] **2.3 실제 앱 확인 (`/runtime-test`).** probe가 `page.evaluate`로 `<html>`의 `data-buddy`를 다섯 값으로 바꾸고 계산값을 기록한다. 비교 대상: Home Send rest·hover·pressed의 `background-color`와 아이콘·스피너 `color`, docked composer의 Stop·Queue, `.preset-chip`의 배경과 글자, `.row-slot.unseen i`, composer 글로우의 `box-shadow`. `data-buddy`가 있어도 Welcome이 violet인지 확인한다.
  - 확인: 기록한 값이 `tokens.css`의 버디 palette 값과 같다. 스크린샷을 남긴다.

## 3단계 — 버디 설정 (`/orchestrate`)

- [ ] **3.1 레지스트리와 설정 (순수 함수).** 먼저 테스트로 고정한다.
  - `buddies.ts`: `parseBuddyId`(알 수 없는 값, 문자열 아님), 조회(에셋 경로, 리그 수치, 작업 안내 변형, 기본 순서, 첫 실행 순서), `pickArtist(id, previous, random)`.
  - `preferences.ts` `buddy`: 키 없음, 알 수 없는 id, 문자열 아님, patch 검증(알려진 id만), 다른 patch를 쓸 때 기존 필드 보존.
  - 기존 사용자용 버디 화면 표시 조건(완료 기록, newer, `buddy` 키).
  - 저장 응답 순서(가장 최근 선택만 반영, 이전 응답 무시).
  - `onboardingScene.ts`: Welcome → Buddy → Agent, Buddy의 continue는 auth와 무관, Agent의 back → Buddy, Buddy의 back → Welcome, `step` 이벤트 `to: "buddy"`와 busy 거절, Escape 무시, 스텝퍼 접근성 이름("Buddy, completed").
  - Cover Flow 입력: 오프셋, 방향키 양끝 멈춤, 가로 wheel(Shift+휠 포함) 한 제스처 한 칸.
  - `settingsSections.ts` `general`.
  - 확인: `npm --prefix app test`가 통과한다(새 테스트가 먼저 red였다).
  - ⎯ 커밋: `feat(app): buddy registry and preference`
- [ ] **3.2 에셋.** 친구 4명의 앱 사본(1.4, 1.6, `shadow.png` 포함), Doany의 `shadow.png`, 다섯 버디의 `card.png` 앱 사본(588²)을 `public/buddies/<id>/`에 넣는다. Doany의 `public/doany/`는 옮기지 않는다. `public/doany/README.md`에 `public/buddies/` 출처를 함께 적는다. 레지스트리의 모든 에셋 경로가 실제로 있는지 확인하는 테스트를 넣는다.
  - 확인: `npm --prefix app run build`, `npm --prefix app test` 전체, `doan check --json --repo .`가 통과한다.
  - ⎯ 커밋: `feat(app): buddy assets`
- [ ] **3.3 리그 일반화.** 셰이더 소스 템플릿에 버디별 수치를 문자열로 넣어 버디마다 컴파일한다. `Doany`를 `Buddy`(prop `buddy`, `key={buddy}`로 다시 마운트)로 바꾸고, 버디별 기울기 범위와 홉 배율을 적용한다. 바닥 그림자(버디별 `shadow.png` 레이어, 접지점 기준 축소, 리그가 쓰는 `--buddy-lift`)를 넣는다.
  - 확인: `npm --prefix app test`에서 `Doany.test.tsx`의 golden 비교(`doany.golden.json` 수정 없이)와 `doanyRender.test.ts`가 통과한다. `doanyRender.test.ts`는 다섯 버디에서 앵커 일치, 홉 중 `--buddy-lift`가 0–1 안에 있고 착지 때 0으로 돌아옴, 가장자리 여백 1.4 device px, WebGL이 없거나 텍스처를 못 읽을 때 정지 이미지로 떨어지는지 확인한다.
  - ⎯ 커밋: `feat(app): buddy rig for every buddy`
- [ ] **3.4 첫 페인트와 적용.** main이 창을 만들 때 `preferences.current()`의 버디 id를 넘기고, 렌더러가 마운트 전에 `data-buddy`를 설정한다. App은 스냅샷을 읽을 때마다 다시 적용한다. 고르는 즉시 반영하고, 가장 최근 선택의 응답이 실패면 되돌린다.
  - 확인: `npm --prefix app test`에서 다음 케이스가 통과한다. 창 옵션에 버디 id가 담긴다. 알 수 없는 값·broken·newer면 `doany`다. 마운트 전에 `data-buddy`가 설정된다. 렌더러를 다시 로드하면 저장값을 따른다. A의 실패 응답이 B를 고른 뒤 오면 무시한다. 첫 실행이 끝나 Buddy 단계가 사라진 뒤 온 응답도 `data-buddy`에 반영한다. `/runtime-test`에서는 init script가 첫 `requestAnimationFrame` 때의 `data-buddy`와 `--buddy-9` 계산값을 기록하고, 저장된 버디의 값인지 본다.
- [ ] **3.5 UI.** 선택 카드 컴포넌트, 첫 실행 Buddy 단계와 3단계 스텝퍼, 기존 사용자용 버디 화면, 설정 General, Home의 `Buddy`, 작업 안내의 `BuddyArtist`(버디가 바뀌면 떠 있는 안내도 교체), 선택 카드의 새 Accent place를 `violetAllowed`에 추가.
  - 확인: 새 화면(Buddy 단계, 기존 사용자용 버디 화면, 설정 General)은 `/design-sync`로 `buddy-choice.html`과 맞춘다. Home과 작업 안내는 이미 develop에 있는 화면이라 `/runtime-test`와 DESIGN.md 기준으로 확인한다. `/runtime-test` 항목:
    - 실패 상태: main IPC 핸들러를 바꿔 저장 실패를 만들고 `buddy-step-failed`, `settings-general-failed`를 재현한다. Retry 성공 뒤 포커스가 체크된 라디오에 있고 `<body>`로 빠지지 않는다.
    - 키보드: Tab이 체크된 라디오로 들어간다. ←/→·↑/↓가 첫 실행에서는 양끝에서 멈추고 설정에서는 순환한다. Return은 아무것도 하지 않는다.
    - 스크린리더: CDP 접근성 트리에서 radiogroup 이름, 라디오 5개의 이름·설명·체크 상태, Home의 "Make <이름> hop"을 읽는다.
    - 창 크기: 1238 × 780과 960 × 600에서 카드 다섯 장, 스텝퍼, Continue가 잘리지 않는다.
    - reduced motion: 줄이 바로 바뀌고, Home 버디가 정지하고, 작업 안내가 첫 프레임을 보인다. reduced transparency와 forced colors에서 선택 카드가 구분된다.
    - 기존 사용자: 완료 기록이 있고 `buddy`가 없으면 시작할 때 버디 화면이 뜨고, Continue 뒤 Home은 고른 버디다. 다시 시작하면 뜨지 않는다. newer면 뜨지 않는다.
    - 다른 설정 보존: 버디를 저장해도 `notifications`, `newConversation`, `updates`가 그대로다.
    - 작업 안내: `CanvasAgent` 단위 테스트로, 안내가 떠 있는 동안 버디가 바뀌면 GIF가 바뀌는지 고정한다.
    - 트랙패드: 실제 트랙패드로 한 번 스와이프에 한 칸, 빠른 두 번 스와이프의 동작을 사람이 확인한다.
  - ⎯ 커밋: `feat(app): buddy choice in first run and settings`

- [ ] **3.6 Welcome 단체 사진.** design.md 'Welcome'대로 Welcome의 Doany와 `.ob-atmosphere`(글로우, grain 포함)를 지우고 단체 사진을 넣는다. 단체 사진 앱 사본을 `public/buddies/group/`에 넣고, 쓰는 곳이 없어진 `onboarding-grain.svg`를 지운다. `ds/checks.test.ts`의 `violetAllowed`에서 Welcome atmosphere 항목을 빼고, `--violet-*`를 직접 읽는 곳이 없다는 검사로 바꾼다. `Onboarding.test.tsx`의 Welcome 마크업 순서·CSS 테스트를 새 구조(워드마크, 문장, Get started, 사진)로 고친다.
  - 확인: `npm --prefix app test`, `npm --prefix app run typecheck`가 통과한다. `/design-sync`로 `buddy-welcome.html`의 두 프레임과 1238 × 780, 1238 × 600에서 맞춘다. 열 때 제목에 포커스가 있고 Tab이 Get started로 간다.
  - ⎯ 커밋: `feat(app): group photo on Welcome`
- [ ] **3.7 설치 디스크.** design.md '설치 디스크'대로 `app/resources/installer-background.png`(640 × 536)와 `@2x`(1280 × 1072)를 만들고, `app/package.json` `build.dmg.contents`를 Doan (200, 306), Applications (440, 306)으로 바꾼다.
  - 확인: `npm --prefix app run package`로 만든 앱으로 dmg를 만들어 열고(만드는 명령은 정하지 않았다, command undecided — 사용자 확인 필요), 문장이 Finder 막대에 가리지 않는지, 창 크기, 라이트·다크 모드의 라벨 색을 사람이 확인한다. 가리면 배경 높이를 늘린다.
  - ⎯ 커밋: `feat(app): group photo installer disk`

## 마지막

- [ ] **4.1 승격과 삭제.**
  - PRODUCT: §3 In scope에 버디 선택과 accent 개인화 한 줄을 추가한다. §2(첫 실행 설명), §3 In scope 7의 첫 실행 순서, §5 item 0 'First run'과 기존 사용자용 버디 화면, 'Settings page' 카테고리, 'Settings storage' 저장 항목, §5 item 1 'Doany'(Welcome 언급 삭제), 'Agent indicator'와 §5 item 0 'First run'의 Welcome 단체 사진을 현재 규칙으로 고친다.
  - ARCHITECTURE: §7 'Doany (mascot)', 'Preferences', 'First-run onboarding', ds 규칙, §9 'Installer disk'를 고친다.
  - DESIGN.md: 'Accent ramp', 'Accent places'(배정 표와 선택 카드, Welcome atmosphere 삭제), 'Three colour layers'(버디 palette), Home Send, Home 접근성 이름, Welcome 행들을 고친다. `/design-sync` 결과를 기록한다.
  - DIRECTORY.md: `.doan/assets/buddies/`, `public/buddies/`를 추가한다.
  - `.doan/assets/buddies/README.md`와 `public/doany/README.md`가 feature 문서를 가리키지 않게 고친다. 그런 다음 `docs/features/buddy-choice/`를 지운다.
  - 확인: `rg -n 'docs/features/buddy-choice' docs app/src .doan .agents README.md`가 아무것도 찾지 않는다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
