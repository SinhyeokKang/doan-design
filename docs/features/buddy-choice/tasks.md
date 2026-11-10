# 버디 선택 — tasks

1단계는 lead가 develop에서 대화하며 진행한다(에셋과 초안 캔버스, `docs(design)` 커밋). 2·3단계 구현은 1단계(1.1–1.7)가 모두 끝난 뒤 `/orchestrate`로 한 번에 진행한다(사용자 결정). 그 전에는 구현을 시작하지 않는다.

`/orchestrate` 배치 제안(파일이 겹치는 배치는 직렬):

| 배치 | task | 소유 파일 | 선행 |
|---|---|---|---|
| A | 2.1, 2.2, 2.3 | `tokens.css`, `styles.css`의 role·accent 규칙, `ds/controls.css`, `ds/checks.ts`·`ds/checks.test.ts` | 없음 |
| B | 3.1, 3.4 | `buddies.ts`, `preferences.ts`, `onboardingScene.ts`, `settingsSections.ts`, `index.ts`(창 쿼리), `App.tsx`의 `data-buddy` 적용 | A(토큰 이름) |
| C | 3.2, 3.3 | `public/buddies/<id>/`·`public/buddies/eye.png`, `public/doany/README.md`, `Doany.tsx`, `doanyRig.ts`, `doanyMotion.ts`, `doany.golden.json`, `app/scripts/doanyGolden.mjs`, `doany*.test.ts(x)`, `.doan/assets/buddies/motion-preview.js` | B(레지스트리) |
| D | 3.5, 3.6 | `Onboarding.tsx`, `Onboarding.test.tsx`, Settings 페이지, `ShellSidebar.tsx`, `CanvasAgent.tsx`, `HomeComposerView.tsx`, `styles.css`의 Welcome·선택 카드 규칙, `public/buddies/group/`, `ds/checks.test.ts`의 `violetAllowed`(A 다음에 고친다) | C |
| E | 3.7 | `app/resources/installer-background*.png`, `app/package.json` `build.dmg` | 없음(다른 배치와 겹치지 않음) |

AGENTS.md 'Commands'에 없는 확인 명령(`file`, `rg`, 측정 스크립트)은 lead가 대화에서 실행하는 1단계 확인과 4.1의 문서 검사에만 쓴다.

## 1단계 — 에셋과 초안 (lead, develop)

- [x] **1.1 에셋 구조.** `.doan/assets/buddies/<id>/`(puri, dungdung, popo, dori)에 시안 카드 이미지를 `card.png`로, 받은 GIF를 `artist-original.gif`로, 프레임을 맞춘 GIF를 `artist.gif`로, 첫 프레임을 `artist-rest.png`로 넣었다. `.doan/assets/buddies/README.md`에 버디 하나의 에셋 세트, Doany와의 대응, 출처, 소스 박스를 적었다. 버디별 리그 수치도 이 README에 적는다.
  - 확인: `file .doan/assets/buddies/*/card.png .doan/assets/buddies/*/artist.gif`가 1254² PNG와 512² GIF를 보여준다.
- [x] **1.2 accent 램프 캔버스.** `.doan/canvases/buddy-accent.html`: 다섯 램프(1–12, pressed, link), 아이콘 색, 몸통 견본, 대비표(칩 글자 4.5:1, 눌린 사이드바 행 위 아이콘 3:1, 9·hover·pressed 위 Send 잉크 3:1), 각 램프로 칠한 Accent places 견본. 친구 램프는 `tokens.css` palette에 들어갔다.
  - 확인: `doan check --json --repo .`에 이 캔버스의 finding이 없다. 대비 수치는 램프 값에서 계산해 표에 적었다.
- [x] **1.3 화면 초안 (`/design-draft`).** `.doan/canvases/buddy-choice.html`: 첫 실행 Buddy 단계(기본·선택·끝·저장 실패), 기존 사용자용 버디 화면, 설정 General(행, 저장 실패), 캔버스 작업 안내. `.doan/canvases/buddy-home.html`: 버디마다 입력이 채워진 Home. Home과 Settings 프레임은 빌드한 앱을 1238 × 780으로 띄워 헤더·사이드바 마크업과 위치를 맞췄다(`.scratch/runtime-test/buddy-home/`). 문구는 Doan clarify preset으로 다듬었고, critique·audit preset 검수 결과를 반영했다.
  - 확인: `doan check`·`doan ls`가 통과하고, 사람이 앱에서 초안을 확인한다.
- [x] **1.4b Doany 카드 (Codex 워커).** `.doan/assets/buddies/doany/card.png`를 원본 `.doan/assets/doany/v2/doany.png` 기준으로 친구 카드와 같은 그림자·크기로 다시 그린다.
  - 확인: 1254² RGB이고, `buddy-choice.html`에서 다섯 카드가 같은 크기로 보인다. 사람이 확인했다(생성 1회).
- [x] **1.5 정지 이미지·레이어 PoC (Codex 워커, puri).** 투명 `still.png`, `body.png`, `accessory.png`, 카드에서 떼어 낸 `shadow.png`, `prompts.json`을 만들고 README에 리그 수치와 접지 수치를 적었다. still·body·accessory에는 그림자가 없다. 눈 자리 채움은 한 번 다시 했다(주변과 밝기 차 2% 이내, 질감 대비 비율 .85–1.15).
  - 확인: 네 장 모두 1254² RGBA다. `body.png` 위에 `accessory.png`를 합성한 그림이 눈 영역을 빼면 `still.png`와 알파 경계에서 1px(1254² 기준) 안에서 맞는다. 눈 중심과 반지름은 `still.png`의 눈과 UV `.003` 안에서 맞는다. 측정 스크립트와 결과는 워커의 `.scratch/buddy-assets/`에 있다. 사람이 `buddy-assets`의 모션 미리보기로 확인했다(생성 4회).
- [x] **1.6 나머지 셋과 Doany 그림자 (Codex 워커).** dungdung, popo, dori도 1.5와 같은 방법으로 `shadow.png`까지 만든다. 목도리와 헤드폰은 소품 기울기 범위를 줄이고, 안경은 0으로 둔다. Doany의 `shadow.png`도 새 카드에서 떼어 낸다. `buddy-home`과 `buddy-assets` 캔버스에 반영한다.
  - 확인: 1.5와 같다. 소품과 눈 자리를 뺀 곳에서 body가 still과 같다(채널 차 8 이하가 불투명 픽셀의 99.5% 이상). 친구 4명의 레이어 16장은 14.7 MB였고, 사람이 앱 사본을 줄이기로 했다(3.2).
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

- [ ] **2.1 대비 검사 (순수 함수).** `ds/checks.ts`: `rootTokens(css, buddy?)`(기본은 순수 `:root`, 버디를 주면 `:root[data-buddy=…]`를 덮음), 버디별 `contrastPairs`·`rolePairs`(칩 글자 4.5:1, 아이콘 색 눌린 사이드바 행 위 3:1, Send 잉크 9·hover·pressed 위 3:1 nontext), 버디 accent 추적(`violetNames`·`accentPlaces`가 모든 버디 palette와 `--buddy-*`를 따라감). 먼저 테스트로 고정한다. 케이스: legacy `--accent`·`--accent-ink`·`--accent-soft`·`--accent-line`이 `--buddy-*`와 섞이지 않는다, `:root[data-buddy]` 블록이 기본값 해석에 섞이지 않는다, violet을 읽는 곳은 `.ob-atmosphere`와 `.side .row` 선택자 세 개(쓰는 곳 없는 sidebar role)뿐이다, `@theme inline`이 어떤 버디 palette나 `--buddy-*`에도 닿지 않는다.
  - 확인: `npm --prefix app test`가 통과한다(새 테스트가 먼저 red였다).
- [ ] **2.2 토큰.** `tokens.css`의 친구 램프를 그대로 쓰고, 전환층 `--buddy-*`(role이 읽는 단계만), `:root[data-buddy=…]` 덮어쓰기, `--text-accent`를 넣는다. role이 `--buddy-*`를 읽게 바꾸고, `--text-on-accent`는 버디별 잉크(흰색 우선, 3:1 미만이면 중립)로 바꾼다. design.md 'Accent places 배정'대로 아이콘·점·외곽선을 `--text-accent`로 바꾼다. `.ob-atmosphere`는 `--violet-9`를 직접 읽는다. `ds/checks.test.ts`의 `violetAllowed`를 새 이름과 Welcome 예외에 맞춘다. Send의 `rolePairs` 종류를 nontext로 바꾼다.
  - 확인: `npm --prefix app test`(`ds/checks.test.ts`의 `accentPlaces`, `contrastPairs`, `rolePairs`)와 `npm --prefix app run typecheck`가 통과한다.
  - ⎯ 커밋: `feat(app): buddy accent ramps`
- [ ] **2.3 실제 앱 확인 (`/runtime-test`).** probe가 `page.evaluate`로 `<html>`의 `data-buddy`를 다섯 값으로 바꾸고 계산값을 기록한다. 비교 대상: Home Send rest·hover·pressed의 `background-color`와 아이콘·스피너 `color`, docked composer의 Stop·Queue, `.preset-chip`의 배경과 글자, `.row-slot.unseen i`, composer 글로우의 `box-shadow`. `data-buddy`가 있어도 Welcome이 violet인지 확인한다.
  - 확인: 기록한 값이 `tokens.css`의 버디 palette 값과 같다. 스크린샷을 남긴다.

## 3단계 — 버디 설정 (`/orchestrate`)

- [ ] **3.1 레지스트리와 설정 (순수 함수).** 먼저 테스트로 고정한다.
  - `buddies.ts`: `parseBuddyId`(알 수 없는 값, 문자열 아님), 조회(에셋 경로, 리그 수치, 작업 안내 변형, 기본 순서, 첫 실행 순서), `pickArtist(id, previous, random)`.
  - `preferences.ts` `buddy`: 키 없음, 알 수 없는 id, 문자열 아님, patch 검증(알려진 id만), 다른 patch를 쓸 때 기존 필드 보존, 키가 파일에 있었는지(알 수 없는 id도 '있음').
  - 기존 사용자용 버디 화면 표시 조건: 완료 기록 있음·키 없음이면 띄움, 알 수 없는 id·newer·broken이면 띄우지 않음, 첫 실행이 열려 있으면 띄우지 않음, `doan onboarding`으로 완료 기록만 생기고 키가 없으면 다음 실행에 띄움.
  - 저장 결과 해석: IPC null은 실패다.
  - 저장 응답 순서(가장 최근 선택만 반영, 이전 응답 무시).
  - `onboardingScene.ts`: Welcome → Buddy → Agent, Buddy의 continue는 auth와 무관, Agent의 back → Buddy, Buddy의 back → Welcome, `step` 이벤트 `to: "buddy"`와 busy 거절, Escape 무시, 스텝퍼 접근성 이름("Buddy, completed").
  - Cover Flow 입력: 오프셋, 방향키 양끝 멈춤, 가로 wheel(Shift+휠 포함) 한 제스처 한 칸.
  - `settingsSections.ts` `general`.
  - 확인: `npm --prefix app test`가 통과한다(새 테스트가 먼저 red였다).
  - ⎯ 커밋: `feat(app): buddy registry and preference`
- [ ] **3.2 에셋.** 앱 사본을 넣는다. Doany의 `public/doany/`는 옮기지 않는다. `public/doany/README.md`에 `public/buddies/` 출처를 함께 적는다.
  - 친구 4명: 1.6의 still·body·accessory·shadow를 512²로 줄여 `public/buddies/<id>/`에 넣는다.
  - artist GIF: `.doan/assets/buddies/README.md`의 소스 박스로 친구 GIF를 자르고 128²로 줄여 `public/buddies/<id>/artist.gif`·`artist-rest.png`를 만든다(Doany와 같은 방법, `public/doany/README.md`).
  - Doany의 `shadow.png`(512²)와 다섯 버디의 `card.png`(588²), 공용 `eye.png`(`public/buddies/eye.png` 한 벌).
  - 레지스트리의 모든 에셋 경로가 있고 규격이 맞는지 확인하는 테스트를 넣는다.
  - 확인: `npm --prefix app test`의 에셋 테스트가 다음을 확인한다. 레지스트리의 모든 경로가 있다. still·body·accessory·shadow는 512² RGBA, card는 588², artist는 128² GIF이고 프레임 수와 시간이 원본과 같다, `eye.png`가 있다, `public/buddies/` 전체가 3 MB 이하다. `npm --prefix app run build`와 `doan check --json --repo .`가 통과한다.
  - ⎯ 커밋: `feat(app): buddy assets`
- [ ] **3.3 리그 일반화.** design.md '리그 일반화'대로 한다.
  - 셰이더 소스 템플릿에 버디별 수치를 문자열로 넣어 버디마다 컴파일하고, 템플릿 함수를 export한다. `Doany`를 `Buddy`(prop `buddy`, `key={buddy}`로 다시 마운트)로 바꾸고, 버디별 기울기 범위와 홉 배율을 적용한다.
  - 눈을 공용 `eye.png`로 바꾼다(눈 텍스처 계약). 깜박임을 털 눈꺼풀로 바꾸고 `doanyMotion.ts`의 시간을 420 ms·4–8초로 바꾼다.
  - 바닥 그림자: 버디별 `shadow.png` `<img>`, z-index, `DoanyView`의 lift setter와 `--hop-lift`(`styles.css` `:root`에 기본값 0).
  - golden: 생성기 `app/scripts/doanyGolden.mjs`를 만든다. 정본 `.doan/assets/buddies/motion-preview.js`를 node `vm`에서 돌려 WebGL trace와 motion log 시나리오를 모두 `doany.golden.json`에 다시 쓴다. 정본과 앱이 다르면 앱을 고친다(정본이 먼저 바뀌어야 하면 사람에게 확인한다).
  - `doanyRender.test.ts`의 앵커 정규식을 새 셰이더에 맞추고, 친구의 눈·앵커 검사는 1254² 원본(`.doan/assets/buddies/<id>/`)으로 돌린다. 검색 창과 어두운 픽셀 기준은 레지스트리 눈 수치에서 만든다.
  - 확인:
    - `node app/scripts/doanyGolden.mjs`(이 기능이 더하는 명령, 4.1에서 AGENTS 'Commands'에 올린다)를 다시 돌려도 `doany.golden.json`에 차이가 없다.
    - 다시 기록하기 전과 후의 golden diff가 눈 텍스처, 눈꺼풀 셰이더, 깜박임 시간, 텍스처 유닛 호출에만 있다. diff 요약을 PR에 적는다.
    - `npm --prefix app test`에서 `Doany.test.tsx`, `doanyMotion.test.ts`, `doanyRig.test.ts`, `doanyRender.test.ts`가 통과한다. `doanyMotion.test.ts`의 blink 시나리오에서 깜박임 길이가 420 ms이고 간격이 4–8초 안이다. `doanyRender.test.ts`는 다섯 버디에서 앵커 일치, 가장자리 여백 1.4 device px, WebGL이 없거나 텍스처(eye 포함)를 못 읽을 때 정지 이미지로 떨어지는지 확인한다.
    - 그림자: lift가 0–1 안이고 착지 때 0으로 돌아온다. lift 1에서 그림자 계산값이 크기 55%, 불투명도 40%다. reduced motion, 정지 이미지 폴백, context 잃음에서 lift 0이다. 그림자 `img`가 `aria-hidden`이고 z-index 0이며 정지 이미지보다 아래 그려진다. 정지 이미지도 없으면 그림자도 숨는다.
    - `/runtime-test`: Home에서 다섯 버디의 눈·깜박임·홉 그림자를 `buddy-assets`의 모션 미리보기와 나란히 녹화하고, 사람이 같다고 확인한다.
  - ⎯ 커밋: `feat(app): buddy rig for every buddy`
- [ ] **3.4 첫 페인트와 적용.** main이 창을 만들 때 `preferences.current()`의 버디 id를 `?buddy=<id>` 쿼리로 넘기고, 렌더러가 마운트 전에 `location.search`에서 읽어 `data-buddy`를 설정한다. App은 스냅샷을 읽을 때마다 다시 적용한다. 고르는 즉시 반영하고, 가장 최근 선택의 응답이 실패(null 포함)면 되돌린다.
  - 확인: `npm --prefix app test`에서 다음 케이스가 통과한다. 창을 여는 URL에 버디 id 쿼리가 담긴다. 알 수 없는 값·broken·newer면 `doany`다. 마운트 전에 `data-buddy`가 설정된다. 렌더러를 다시 로드하면 저장값을 따른다. A의 실패 응답이 B를 고른 뒤 오면 무시한다. 첫 실행이 끝나 Buddy 단계가 사라진 뒤 온 응답도 `data-buddy`에 반영한다. `/runtime-test`에서는 init script가 첫 `requestAnimationFrame` 때의 `data-buddy`와 `--buddy-9` 계산값을 기록하고, 저장된 버디의 값인지 본다.
- [ ] **3.5 UI.** 선택 카드 컴포넌트, 첫 실행 Buddy 단계와 3단계 스텝퍼, 기존 사용자용 버디 화면, 설정 General, Home의 `Buddy`, 작업 안내의 `BuddyArtist`(버디가 바뀌면 떠 있는 안내도 교체), 선택 카드의 새 Accent place를 `violetAllowed`에 추가.
  - 확인: Buddy 단계, 기존 사용자용 버디 화면, 설정 General은 `/design-sync`로 `buddy-choice.html`과 맞춘다. General은 기존 Settings 페이지의 새 카테고리지만 사람이 이 기능에서 `/design-sync`를 쓰기로 했다. broken·newer 프레임(`buddy-step-broken`, `buddy-step-newer`)도 맞춘다. Home과 작업 안내는 이미 develop에 있는 화면이라 `/runtime-test`와 DESIGN.md 기준으로 확인한다.
  - 확인: `npm --prefix app test`의 `CanvasAgent` 단위 테스트로, 안내가 떠 있는 동안 버디가 바뀌면 GIF가 바뀌는지 고정한다.
  - `/runtime-test` 항목:
    - 실패 상태: main IPC 핸들러를 바꿔 저장 실패(오류와 null 둘 다)를 만들고 `buddy-step-failed`, `settings-general-failed`를 재현한다. Retry의 접근성 이름이 "Retry"다. Retry 성공 뒤 포커스가 체크된 라디오에 있고 `<body>`로 빠지지 않는다. 저장이 진행 중일 때 Continue를 누르면 저장을 기다리고, 실패하면 단계에 남아 notice를 보인다.
    - 종료와 재시작: Buddy 단계에서 Popo를 고르고 앱을 종료한 뒤 다시 시작하면 Welcome부터 시작하고, `preferences.json`의 `buddy`가 `popo`이며 첫 `requestAnimationFrame`의 `data-buddy`가 `popo`다.
    - newer·broken·아직 읽지 못함: newer에서 Buddy 단계와 General의 라디오가 비활성이고 notice만 보이며 Continue가 Doany로 진행한다. broken에서 세 화면 모두 broken notice가 보이고, 고르고 저장하면 파일이 옆으로 옮겨지고 기본값에서 시작한다(General notice 순서 포함). 스냅샷이 오기 전에는 고를 수 없다.
    - 즉시 반영: 설정 General에서 고르면 Home Send와 작업 안내 글로우의 계산값이 앱을 다시 시작하지 않고 새 버디 palette 값으로 바뀐다.
    - 포커스 표시: 방향키로 고를 때 선택 카드에 포커스 링(2px `--border-focus`, offset 2)이 accent 테두리 바깥에 보인다. General 행은 그림이나 이름을 눌러도 고른다.
    - 키보드: Tab이 체크된 라디오로 들어간다. ←/→·↑/↓가 첫 실행에서는 양끝에서 멈추고 설정에서는 순환한다. Return은 아무것도 하지 않는다.
    - 스크린리더: CDP 접근성 트리에서 radiogroup 이름, 라디오 5개의 이름·설명·체크 상태, Home의 "Make <이름> hop"을 읽는다.
    - 창 크기: 1238 × 780과 960 × 600에서 카드 다섯 장, 스텝퍼, Continue가 잘리지 않는다.
    - reduced motion: 줄이 바로 바뀌고, Home 버디가 정지하고, 작업 안내가 첫 프레임을 보인다. reduced transparency와 forced colors에서 선택 카드가 구분된다.
    - 기존 사용자: 완료 기록이 있고 `buddy` 키가 없으면 시작할 때 버디 화면이 뜬다. Continue 뒤에는 실행 때 복원한 화면(지난번 캔버스였다면 그 캔버스)이 그대로 보이고, Home 버디는 고른 버디다. 다시 시작하면 뜨지 않는다. newer, broken, 알 수 없는 id면 뜨지 않는다. `doan onboarding`으로 첫 실행을 마친 뒤 다시 시작하면 뜬다.
    - 잠금: 버디 화면이 떠 있는 동안 `doan://` 링크는 "Couldn’t open the link." 토스트를 띄우고, Settings…·Add Project…·⌘B는 꺼져 있고, `doan open`은 첫 실행 때와 같은 응답을 돌려준다.
    - 다른 설정 보존: 버디를 저장해도 `notifications`, `newConversation`, `updates`가 그대로다.
    - 트랙패드: 실제 트랙패드로 한 번 스와이프에 한 칸, 빠른 두 번 스와이프의 동작을 사람이 확인한다.
  - ⎯ 커밋: `feat(app): buddy choice in first run and settings`

- [ ] **3.6 Welcome 단체 사진.** design.md 'Welcome'대로 Welcome의 Doany와 `.ob-atmosphere`(글로우, grain 포함)를 지우고 단체 사진을 넣는다. 단체 사진 앱 사본을 `public/buddies/group/`에 넣고, 쓰는 곳이 없어진 `onboarding-grain.svg`를 지운다. `ds/checks.test.ts`의 `violetAllowed`에서 Welcome atmosphere 항목을 빼고, `--violet-*`를 직접 읽는 곳이 없다는 검사로 바꾼다. `Onboarding.test.tsx`의 Welcome 마크업 순서·CSS 테스트를 새 구조(워드마크, 문장, Get started, 사진)로 고친다.
  - 확인: `npm --prefix app test`, `npm --prefix app run typecheck`가 통과한다. Welcome은 이미 develop에 있는 화면이지만 사람이 이 기능에서 `/design-sync`를 쓰기로 했다. `/design-sync`로 `buddy-welcome.html`의 두 프레임과 1238 × 780, 1238 × 600에서 맞춘다.
  - 확인(`/runtime-test`): 960 × 600(최소 창)과 더 높은 창(예: 1238 × 1100)에서 다섯 버디의 눈이 보이고 Get started가 잘리지 않으며, 높은 창에서 사진이 더 크다. `data-buddy=puri`에서도 Welcome에 `canvas`가 없고 accent 계산값이 없다. 사진 경로를 막으면 사진만 숨고 글자 묶음은 그대로다. 사진 `alt`가 design 'Welcome'의 문장이다. 열 때 제목에 포커스가 있고 Tab이 Get started로 간다.
  - ⎯ 커밋: `feat(app): group photo on Welcome`
- [ ] **3.7 설치 디스크.** design.md '설치 디스크'대로 `buddy-installer.html`의 배경 부분만 내보내 `app/resources/installer-background.png`(640 × 536)와 `@2x`(1280 × 1072)를 만들고, `app/package.json` `build.dmg.contents`를 Doan (200, 306), Applications (440, 306)으로 바꾼다.
  - 확인: 두 PNG의 크기가 640 × 536과 1280 × 1072다. `build.dmg.contents`가 위 값이다.
  - 확인: `npm --prefix app run package` 뒤 `app/`에서 `npx electron-builder --mac dmg --prepackaged dist/mac-arm64/Doan.app`로 무서명 dmg를 만든다(AGENTS 'Commands'에 없지만 사람이 이 기능의 확인에 한해 승인했다). 그 dmg를 열어 스크린샷으로 문장 하단이 Finder 경로·상태 막대보다 위에 있는지와 창 크기를 판정한다. 가리면 배경 높이를 늘린다. 다크 모드 라벨은 안 보여도 받아들인다(사람 결정).
  - ⎯ 커밋: `feat(app): group photo installer disk`

## 마지막

- [ ] **4.1 승격과 삭제.**
  - PRODUCT: §3 In scope 번호는 늘리지 않고 §3 끝 문단(설치·온보딩)에 버디 선택과 accent 개인화 한 줄을 적는다. §2(첫 실행 설명), §3 In scope 7의 첫 실행 순서, §5 item 0 'First run'(Welcome 단체 사진, Buddy 단계, 기존 사용자용 버디 화면과 그 잠금), 'Settings page' 카테고리, 'Settings storage' 저장 항목, §5 item 1 'Home'("The body holds only Doany" → 고른 버디), 'Doany'(고른 버디·기본 Doany, Welcome 언급 삭제, 눈·깜박임·바닥 그림자), 'Agent indicator'를 현재 규칙으로 고친다.
  - ARCHITECTURE: §7 'Doany (mascot)'(정본 draft가 `.doan/assets/buddies/motion-preview.js`, 생성기 `app/scripts/doanyGolden.mjs`; "neither generator is in the repository" 문장 삭제), 'Preferences'(키가 있었는지), 'First-run onboarding', ds 규칙(`.side .row` 예외 포함), §9 'Installer disk'(새 배경·좌표·초안 경로, 아래쪽 확인 결과, 다크 모드 라벨 수용)를 고친다.
  - AGENTS 'Commands': `node app/scripts/doanyGolden.mjs`를 더한다.
  - BACKLOG: 단체 사진의 더 큰 원본(레티나·큰 창에서 흐림), 설치 디스크를 다른 macOS 버전에서 확인하지 않은 점을 옮긴다.
  - DESIGN.md: 'Accent ramp', 'Accent places'(배정 표와 선택 카드, Welcome atmosphere 삭제), 'Three colour layers'(버디 palette), Home Send, Home 접근성 이름, Welcome 행들을 고친다. `/design-sync` 결과를 기록한다.
  - DIRECTORY.md: `.doan/assets/buddies/`, `public/buddies/`를 추가한다.
  - `.doan/assets/buddies/README.md`와 `public/doany/README.md`가 feature 문서를 가리키지 않게 고친다. 그런 다음 `docs/features/buddy-choice/`를 지운다.
  - 확인: `rg -n 'docs/features/buddy-choice' docs app/src .doan .agents README.md`가 아무것도 찾지 않는다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
