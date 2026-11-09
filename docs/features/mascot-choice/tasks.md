# 마스코트 선택 — tasks

1단계는 lead가 develop에서 대화하며 진행한다(에셋과 초안 캔버스, `docs(design)` 커밋). 2·3단계는 코드 변경이라 `/ship` 또는 `/orchestrate`로 진행한다. 2단계는 1단계와 별개로 시작할 수 있다(램프는 시안 색만 있으면 된다). 3단계는 1단계 에셋과 2단계가 끝난 뒤 시작한다.

## 1단계 — 에셋과 초안 (lead, develop)

- [ ] **1.1 에셋 구조.** `.doan/assets/mascots/<id>/`(saemi, dungdung, popo, dori)를 만들고 시안 정지 이미지를 `card.png`로, 받은 GIF를 `artist.gif`로 넣는다. `README.md`에는 출처와 아직 비어 있는 파일 목록을 적는다. `.doan/assets/mascots/README.md`에는 마스코트 하나의 에셋 세트와 Doany와의 대응을 적는다(design.md '에셋 구조').
  - 확인: `file .doan/assets/mascots/*/card.png .doan/assets/mascots/*/artist.gif`가 1254² PNG와 512² GIF를 보여준다.
  - ⎯ 커밋: `docs(design): mascot asset structure with drafts and artist GIFs`
- [ ] **1.2 accent 램프 캔버스.** `.doan/canvases/mascot-accent.html`: 다섯 램프(1–12, pressed, link), 아이콘 단계, 대비표(칩 글자 4.5:1, 패널 위 아이콘 3:1, 9단계 위 검정 Send 아이콘 3:1), 각 램프로 칠한 Accent places 견본을 그린다.
  - 확인: `doan check .doan/canvases/mascot-accent.html --json`에 오류가 없다. 대비 수치는 캔버스 안 스크립트로 계산해 표시한다.
  - ⎯ 커밋: `docs(design): mascot-accent draft`
- [ ] **1.3 화면 초안 (`/design-draft`).** `.doan/canvases/mascot-choice.html`: 첫 실행 Mascot 단계(선택 카드 5장, 마스코트별 accent), 설정 General(Mascot 그룹), Welcome·Home(고른 마스코트 정지 이미지), 캔버스 작업 안내(친구 artist GIF, Doany 가족 정렬 규칙으로 맞춘 소스 박스). 문구는 Doan clarify preset으로 다듬는다.
  - 확인: `doan check`·`doan ls`가 통과하고, 사람이 앱에서 초안을 확인한다.
  - ⎯ 커밋: `docs(design): mascot-choice draft`
- [ ] **1.4 artist GIF 앱 사본.** 1.3에서 정한 소스 박스로 친구 GIF를 자르고 128²로 줄여 `public/mascots/<id>/artist.gif`·`artist-rest.png`를 만든다(Doany와 같은 방법, `public/doany/README.md`). 3단계 첫 커밋에 넣는다.
  - 확인: 128² GIF이고 프레임 수와 시간이 원본과 같다. 캔버스의 32px 견본과 눈높이 52%가 맞다.
- [ ] **1.5 정지 이미지·레이어 PoC (Codex 워커, saemi).** 투명 `still.png`, `body.png`, `accessory.png`, 리그 수치, `prompts.json`을 만든다. 시안의 형태와 질감은 바꾸지 않는다.
  - 확인: 세 장 모두 1254² RGBA다. 몸통 + 소품 + 셰이더 눈의 rest 프레임이 `still.png`와 경계·눈 위치에서 1 device px 안에서 맞는다(캔버스 비교 프레임과 측정 스크립트). 사람이 확인한다.
- [ ] **1.6 나머지 셋 (Codex 워커).** dungdung, popo, dori도 1.5와 같은 방법으로 만든다. 목도리와 헤드폰은 소품 기울기 범위를 정한다.
  - 확인: 1.5와 같다. 마스코트 4개의 이미지 용량 합을 재서 사람에게 보고하고, 해상도를 줄일지 묻는다.
  - ⎯ 커밋: 마스코트마다 `docs(design): <id> mascot layers`

## 2단계 — accent 동적 변경 (`/ship`)

- [ ] **2.1 램프와 대비 검사 (순수 함수).** `accentIconStep`, 램프 재계산 일치 검사, `ds/checks.ts`의 accent 추적 일반화와 램프별 `contrastPairs`. 먼저 테스트로 고정한다.
  - 확인: `npm --prefix app test`가 통과한다(새 테스트가 먼저 red였다).
- [ ] **2.2 토큰.** `tokens.css`에 친구 램프 4개, 전환층 `--accent-*`, `:root[data-mascot=…]` 덮어쓰기, `--text-accent`를 넣고, role이 `--accent-*`를 읽게 바꾼다. `--text-on-accent`는 중립 검정으로 바꾼다. 흰 패널 위 accent 아이콘·점·외곽선을 `--text-accent`로 바꾸고, `.ob-atmosphere::before`는 `--accent-5`로 바꾼다.
  - 확인: `npm --prefix app test`(`ds/checks.test.ts`의 `accentPlaces`, `contrastPairs`)와 `npm --prefix app run typecheck`가 통과한다.
  - ⎯ 커밋: `feat(app): mascot accent ramps`
- [ ] **2.3 실제 앱 확인 (`/runtime-test`).** 개발자 도구에서 `data-mascot`을 바꿔 다섯 램프의 Home Send, 칩, 글로우, 사이드바 점을 스크린샷으로 남긴다.
  - 확인: 스크린샷과 계산값이 1.2 캔버스와 맞는다.

## 3단계 — 마스코트 설정 (`/ship` 또는 `/orchestrate`)

- [ ] **3.1 레지스트리와 설정 (순수 함수).** `mascots.ts`(`parseMascotId`, 조회, `pickArtist`), `preferences.ts` `mascot` 필드(키 없음, 알 수 없는 id, 잘못된 타입, patch 검증), `onboardingScene.ts` `mascot` 장면, `settingsSections.ts` `general`.
  - 확인: `npm --prefix app test`가 통과한다(새 테스트가 먼저 red였다).
  - ⎯ 커밋: `feat(app): mascot registry and preference`
- [ ] **3.2 에셋 이동.** Doany 앱 사본을 `public/mascots/doany/`로 옮기고 이름을 맞춘다(`hat.png` → `accessory.png`). 친구 4명의 앱 사본(1.4, 1.6)을 넣는다. `public/mascots/README.md`에 출처를 적는다.
  - 확인: `npm --prefix app run build`가 통과하고, `doanyRender.test.ts`가 새 경로로 통과한다.
- [ ] **3.3 리그 일반화.** 셰이더 상수를 uniform으로 바꾸고 `Doany`를 `Mascot`(prop `mascot`)으로 바꾼다. 마스코트별 `drawnPose` 범위를 적용한다.
  - 확인: Doany의 `doany.golden.json` 비교와 rest 프레임 일치가 유지된다. `doanyRender.test.ts`가 다섯 마스코트에서 가장자리 여백 1.4 device px를 지킨다.
  - ⎯ 커밋: `feat(app): mascot rig for every mascot`
- [ ] **3.4 첫 페인트와 적용.** main이 창을 만들 때 마스코트 id를 넘기고, 렌더러가 마운트 전에 `data-mascot`을 설정한다. 설정을 저장하면 즉시 반영하고, 실패하면 되돌린다.
  - 확인: 단위 테스트가 통과하고, `/runtime-test`에서 저장된 마스코트로 시작할 때 violet 프레임이 보이지 않는다(첫 프레임 스크린샷).
- [ ] **3.5 UI.** 선택 카드 컴포넌트, 첫 실행 Mascot 단계와 3단계 스텝퍼, 설정 General, Home·Welcome의 `Mascot`, 작업 안내의 `MascotArtist`. 초안을 기준으로 `/design-sync`를 한다.
  - 확인: `/design-sync` 측정 결과가 초안과 맞는다. `/runtime-test`에서 고르기 → 재시작 → 설정에서 바꾸기 → 작업 안내를 확인한다.
  - ⎯ 커밋: `feat(app): mascot choice in first run and settings`

## 마지막

- [ ] **4.1 승격과 삭제.** PRODUCT §5 item 0('First run', 'Settings page'), item 1('Doany'), 'Agent indicator'를 현재 규칙으로 고친다. ARCHITECTURE §7 'Doany (mascot)', 'Preferences', ds 규칙을 고친다. DESIGN.md 'Accent ramp', 'Accent places', Home Send를 고친다. `.doan/assets/doany/README.md`와 `public/doany/README.md`는 새 위치를 가리키게 한다. 그런 다음 `docs/features/mascot-choice/`를 지운다.
  - 확인: `rg -n 'docs/features/mascot-choice|mascot-choice' docs app/src`가 아무것도 찾지 않는다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
