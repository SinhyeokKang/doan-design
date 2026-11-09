# 버디 선택 — tasks

1단계는 lead가 develop에서 대화하며 진행한다(에셋과 초안 캔버스, `docs(design)` 커밋). 2·3단계는 코드 변경이라 `/ship` 또는 `/orchestrate`로 진행한다. 2단계는 1단계와 별개로 시작할 수 있다(램프는 시안 색만 있으면 된다). 3단계는 1단계 에셋과 2단계가 끝난 뒤 시작한다.

## 1단계 — 에셋과 초안 (lead, develop)

- [x] **1.1 에셋 구조.** `.doan/assets/buddies/<id>/`(saemi, dungdung, popo, dori)를 만들고 시안 정지 이미지를 `card.png`로, 받은 GIF를 `artist.gif`로 넣는다. `README.md`에는 출처와 아직 비어 있는 파일 목록을 적는다. `.doan/assets/buddies/README.md`에는 버디 하나의 에셋 세트와 Doany와의 대응을 적는다(design.md '에셋 구조').
  - 확인: `file .doan/assets/buddies/*/card.png .doan/assets/buddies/*/artist.gif`가 1254² PNG와 512² GIF를 보여준다.
  - ⎯ 커밋: `docs(design): buddy asset structure with drafts and artist GIFs`
- [x] **1.2 accent 램프 캔버스.** `.doan/canvases/buddy-accent.html`: 다섯 램프(1–12, pressed, link), 아이콘 색, 대비표(칩 글자 4.5:1, 눌린 사이드바 행 위 아이콘 3:1, 9·hover·pressed 위 Send 잉크 3:1), 각 램프로 칠한 Accent places 견본을 그린다. 친구 램프는 `tokens.css` palette에 이미 들어갔다.
  - 확인: `doan check --json --repo .`에 이 캔버스의 finding이 없다. 대비 수치는 램프 값에서 계산해 표에 적었다.
  - ⎯ 커밋: `docs(design): buddy-accent draft`
- [x] **1.3 화면 초안 (`/design-draft`).** `.doan/canvases/buddy-choice.html`: 첫 실행 Buddy 단계(Cover Flow, 기본·선택·끝·저장 실패), 설정 General(Buddy 행, 저장 실패), 캔버스 작업 안내(친구 artist GIF와 보정한 소스 박스). `.doan/canvases/buddy-home.html`: 버디마다 입력이 채워진 Home(실제 앱 Home과 1238 × 780에서 위치를 맞춤). 문구는 Doan clarify preset으로 다듬었다. Doan critique·audit preset 검수 결과를 반영했다.
  - 확인: `doan check`·`doan ls`가 통과하고, 사람이 앱에서 초안을 확인한다.
  - ⎯ 커밋: `docs(design): buddy-choice draft`
- [ ] **1.4 artist GIF 앱 사본.** 1.3에서 정한 소스 박스로 친구 GIF를 자르고 128²로 줄여 `public/buddies/<id>/artist.gif`·`artist-rest.png`를 만든다(Doany와 같은 방법, `public/doany/README.md`). 3단계 첫 커밋에 넣는다.
  - 확인: 128² GIF이고 프레임 수와 시간이 원본과 같다. 캔버스의 32px 견본과 눈높이 52%가 맞다.
- [ ] **1.4b Doany 카드 (Codex 워커).** `.doan/assets/buddies/doany/card.png`를 원본 `../doany/v2/doany.png` 기준으로 친구 카드와 같은 그림자·크기로 다시 그린다.
  - 확인: 1254² RGB이고, 캔버스에서 다섯 카드가 나란히 같은 크기로 보인다. 사람이 확인한다.
- [ ] **1.5 정지 이미지·레이어 PoC (Codex 워커, saemi).** 투명 `still.png`, `body.png`, `accessory.png`, 리그 수치, `prompts.json`을 만든다. 시안의 형태와 질감은 바꾸지 않는다.
  - 확인: 세 장 모두 1254² RGBA다. 몸통 + 소품 + 셰이더 눈의 rest 프레임이 `still.png`와 경계·눈 위치에서 1 device px 안에서 맞는다(캔버스 비교 프레임과 측정 스크립트). 사람이 확인한다.
- [ ] **1.6 나머지 셋 (Codex 워커).** dungdung, popo, dori도 1.5와 같은 방법으로 만든다. 목도리와 헤드폰은 소품 기울기 범위를 정한다.
  - 확인: 1.5와 같다. 버디 4개의 이미지 용량 합을 재서 사람에게 보고하고, 해상도를 줄일지 묻는다.
  - ⎯ 커밋: 버디마다 `docs(design): <id> buddy layers`

## Codex 워커 인계 (1.4b, 1.5, 1.6)

사용자가 이 기능의 에셋 이미지 제작에 한해 Claude lead가 Codex 워커를 쓰도록 허락했다(AGENTS.md 'Worker model boundary'). 워커는 아래만 읽으면 이어서 작업할 수 있다.

- **읽을 것**: `.doan/assets/buddies/README.md`('Next' 두 절), `.doan/assets/doany/v2/README.md`와 `layer-prompts.json`(Doany 레이어를 만든 방법), 이 문서의 design.md '에셋 구조'.
- **만들 것**
  - 1.4b: `doany/card.png`. 원본 `.doan/assets/doany/v2/doany.png`를 친구 카드와 같은 스타일(흰 바탕, 부드러운 바닥 그림자, 같은 크기와 바닥선)로 다시 그린다. Doany의 형태와 색은 바꾸지 않는다.
  - 1.5: `saemi/`의 `still.png`, `body.png`, `accessory.png`, `prompts.json`, README의 리그 수치. 사람이 확인한 뒤 1.6으로 넘어간다.
  - 1.6: `dungdung/`, `popo/`, `dori/`에도 같은 파일을 만든다.
- **하지 않을 것**: `card.png`(친구)와 `artist*.gif`·`artist-rest.png`는 고치지 않는다. 앱 코드, `tokens.css`, 다른 feature 문서도 고치지 않는다.
- **캔버스 갱신**: 친구의 `still.png`가 생기면 `.doan/canvases/buddy-home.html`에서 그 버디의 마스코트 자리를 바꾼다. `<button type="button" class="doany card-stand-in" …><img src="../assets/buddies/<id>/card.png" alt=""/></button>`에서 `card-stand-in` 클래스를 지우고 `src`를 `../assets/buddies/<id>/still.png`로 바꾼다. 머리말의 "Until each friend's transparent still.png exists…" 문장도 실제 상태에 맞게 고친다. `buddy-choice.html`의 카드는 `card.png`를 그대로 쓴다.
- **확인**
  - `file .doan/assets/buddies/*/still.png .doan/assets/buddies/*/body.png .doan/assets/buddies/*/accessory.png`가 모두 1254 × 1254 RGBA다.
  - `body.png` 위에 `accessory.png`를 합성한 그림이 눈 영역을 빼면 `still.png`와 알파 경계에서 1px 안에서 맞는다. 측정 스크립트와 결과는 `.scratch/buddy-assets/`에 두고 README에 수치를 적는다.
  - `doan check --json --repo .`에 이 캔버스들의 finding이 없다.
- **커밋과 인계**: 최신 develop에서 만든 Orca worktree의 `docs/buddy-assets` 브랜치에서 작업한다. 버디마다 `docs(design): <id> buddy layers`로 커밋하고, 마지막 줄은 `Co-Authored-By: Codex <noreply@openai.com>`이다. 푸시하지 않는다. lead가 검수한 뒤 develop에 합친다.

## 2단계 — accent 동적 변경 (`/ship`)

- [ ] **2.1 램프와 대비 검사 (순수 함수).** `accentIcon`, 램프 재계산 일치 검사, `ds/checks.ts`의 accent 추적 일반화와 램프별 `contrastPairs`. 먼저 테스트로 고정한다.
  - 확인: `npm --prefix app test`가 통과한다(새 테스트가 먼저 red였다).
- [ ] **2.2 토큰.** `tokens.css`에 이미 있는 친구 램프 4개를 그대로 쓰고, 전환층 `--accent-*`, `:root[data-buddy=…]` 덮어쓰기, `--text-accent`를 넣고, role이 `--accent-*`를 읽게 바꾼다. `--text-on-accent`는 버디별 잉크(흰색 우선, 3:1 미만이면 중립)로 바꾼다. 흰 패널 위 accent 아이콘·점·외곽선을 `--text-accent`로 바꾼다. Welcome(`.ob-welcome`)은 accent role을 violet으로 고정한다.
  - 확인: `npm --prefix app test`(`ds/checks.test.ts`의 `accentPlaces`, `contrastPairs`)와 `npm --prefix app run typecheck`가 통과한다.
  - ⎯ 커밋: `feat(app): buddy accent ramps`
- [ ] **2.3 실제 앱 확인 (`/runtime-test`).** 개발자 도구에서 `data-buddy`을 바꿔 다섯 램프의 Home Send, 칩, 글로우, 사이드바 점을 스크린샷으로 남긴다.
  - 확인: 스크린샷과 계산값이 1.2 캔버스와 맞는다.

## 3단계 — 버디 설정 (`/ship` 또는 `/orchestrate`)

- [ ] **3.1 레지스트리와 설정 (순수 함수).** `buddies.ts`(`parseBuddyId`, 조회, `pickArtist`), `preferences.ts` `buddy` 필드(키 없음, 알 수 없는 id, 잘못된 타입, patch 검증), `onboardingScene.ts` `buddy` 장면, `settingsSections.ts` `general`.
  - 확인: `npm --prefix app test`가 통과한다(새 테스트가 먼저 red였다).
  - ⎯ 커밋: `feat(app): buddy registry and preference`
- [ ] **3.2 에셋 이동.** Doany 앱 사본을 `public/buddies/doany/`로 옮기고 이름을 맞춘다(`hat.png` → `accessory.png`). 친구 4명의 앱 사본(1.4, 1.6)을 넣는다. `public/buddies/README.md`에 출처를 적는다.
  - 확인: `npm --prefix app run build`가 통과하고, `doanyRender.test.ts`가 새 경로로 통과한다.
- [ ] **3.3 리그 일반화.** 셰이더 상수를 uniform으로 바꾸고 `Doany`를 `Buddy`(prop `buddy`)으로 바꾼다. 버디별 `drawnPose` 범위를 적용한다.
  - 확인: Doany의 `doany.golden.json` 비교와 rest 프레임 일치가 유지된다. `doanyRender.test.ts`가 다섯 버디에서 가장자리 여백 1.4 device px를 지킨다.
  - ⎯ 커밋: `feat(app): buddy rig for every buddy`
- [ ] **3.4 첫 페인트와 적용.** main이 창을 만들 때 버디 id를 넘기고, 렌더러가 마운트 전에 `data-buddy`을 설정한다. 설정을 저장하면 즉시 반영하고, 실패하면 되돌린다.
  - 확인: 단위 테스트가 통과하고, `/runtime-test`에서 저장된 버디로 시작할 때 violet 프레임이 보이지 않는다(첫 프레임 스크린샷).
- [ ] **3.5 UI.** 선택 카드 컴포넌트, 첫 실행 Buddy 단계와 3단계 스텝퍼, 설정 General, Home의 `Buddy`, 작업 안내의 `BuddyArtist`. 초안을 기준으로 `/design-sync`를 한다.
  - 확인: `/design-sync` 측정 결과가 초안과 맞는다. `/runtime-test`에서 고르기 → 재시작 → 설정에서 바꾸기 → 작업 안내를 확인한다.
  - ⎯ 커밋: `feat(app): buddy choice in first run and settings`

## 마지막

- [ ] **4.1 승격과 삭제.** PRODUCT §5 item 0('First run', 'Settings page'), item 1('Doany'), 'Agent indicator'를 현재 규칙으로 고친다. ARCHITECTURE §7 'Doany (mascot)', 'Preferences', ds 규칙을 고친다. DESIGN.md 'Accent ramp', 'Accent places', Home Send를 고친다. `.doan/assets/doany/README.md`와 `public/doany/README.md`는 새 위치를 가리키게 한다. 그런 다음 `docs/features/buddy-choice/`를 지운다.
  - 확인: `rg -n 'docs/features/buddy-choice|buddy-choice' docs app/src`가 아무것도 찾지 않는다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
