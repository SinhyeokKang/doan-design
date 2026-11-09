# 버디 선택 — design

## 영향받는 곳

- **app (renderer)**: `Doany.tsx`·`doanyRig.ts`(리그 수치를 버디별로 받음), `CanvasAgent.tsx` `DoanyArtist`, `HomeComposerView.tsx`, `Onboarding.tsx`·`onboardingScene.ts`(Buddy 장면, 기존 사용자용 버디 화면), `settingsSections.ts`·Settings 페이지(General 카테고리), `ShellSidebar.tsx`(General 행 아이콘), `tokens.css`·`styles.css`·`ds/controls.css`(accent 램프와 역할), `ds/checks.ts`(violet 검사를 버디 accent 검사로 일반화), `public/buddies/`(친구 에셋).
- **app (main/preload)**: `preferences.ts`(`buddy` 필드), 창을 만들 때 버디 id를 넘기는 경로(`index.ts`, preload).
- **CLI·스킬·소켓**: 바뀌지 않는다.
- **에셋**: `.doan/assets/buddies/<id>/`(원본), `app/src/renderer/public/buddies/<id>/`(친구 앱 사본). Doany 앱 사본은 `public/doany/`에 그대로 둔다.
- **캔버스**: `.doan/canvases/buddy-accent.html`, `buddy-choice.html`, `buddy-home.html`.

## 에셋 구조

Doany 에셋 목록(현재):

| 용도 | 앱 사본 | 원본 |
|---|---|---|
| 정지 이미지(폴백) | `public/doany/doany.png` 1254² RGBA | `.doan/assets/doany/v2/doany.png` |
| 모션 몸통(눈 없음) | `public/doany/body.png` | `v2/body.png` |
| 모션 소품 | `public/doany/hat.png` | `v2/hat.png` |
| 리그 수치 | `Doany.tsx` 셰이더 상수 | `v2/README.md` |
| 작업 안내 | `public/doany/artist-painting.gif`·`artist-rest.png`, `artist-typing.gif`·`artist-typing-rest.png`, `artist-reading.gif`·`artist-reading-rest.png`, 128² | `.doan/assets/doany/artist/*` 512² + 소스 박스 |
| 출처 | — | `v2/source-prompt.txt`, `v2/layer-prompts.json` |
| 앱 아이콘·파비콘 | `app/resources/icon*` | `v2/white.png`, `v2/simple/` |

친구 하나의 에셋 세트(네 명 모두 같은 파일 이름):

```
.doan/assets/buddies/<id>/          원본 (Doany는 card.png만 여기 두고, 나머지는 기존 .doan/assets/doany/ 를 그대로 쓴다)
  card.png         1254² RGB, 흰 바탕에 부드러운 바닥 그림자가 있는 정사각형. 선택 카드 이미지
                   (친구는 받은 시안 그대로, Doany는 합성 초안 → Codex가 원본 doany.png 기준으로 다시 그려 교체)
  still.png        1254² RGBA, 투명 배경, 그림자 없는 정지 이미지
  body.png         1254² RGBA, still과 같은 좌표, 눈과 소품을 지우고 가려진 몸통을 복원
  accessory.png    1254² RGBA, still과 같은 좌표, 소품만
  artist.gif       512², 그림 그리는 작업 안내 애니메이션. 받은 GIF의 프레임별 크기·위치를 첫 프레임에 맞춘 것
  artist-original.gif  받은 GIF 원본(사람이 제작)
  artist-rest.png  512², artist.gif 첫 프레임
  prompts.json     정지 이미지·레이어 생성 프롬프트(layer-prompts.json 형식)
리그 수치, 소스 박스, 검증 결과는 버디별 파일이 아니라 .doan/assets/buddies/README.md에 버디마다 적는다.

app/src/renderer/public/buddies/<id>/   친구 앱 사본
  still.png  body.png  accessory.png   (원본과 같은 바이트)
  card.png                             (588², 선택 카드에 196px로 그리는 크기의 3배)
  artist.gif  artist-rest.png          (소스 박스로 자르고 128²로 줄인 것, Doany와 같은 방법)
public/buddies/doany/card.png           Doany 카드 앱 사본만 여기 둔다
```

- Doany 앱 사본(`public/doany/`)은 옮기지 않는다. `doany.golden.json`의 trace가 텍스처 파일 이름(`hat.png`)을 기록하고, `doanyRender.test.ts`, `.doan/config.json` serve 경로, 여러 캔버스가 그 경로를 읽기 때문이다. 레지스트리가 버디마다 에셋 경로를 가지므로 경로를 하나로 맞출 필요가 없다.
- Doany 원본(`.doan/assets/doany/`)은 V1 기록까지 함께 있어서 옮기지 않는다.
- 받은 artist GIF는 2~5번 프레임에서 캐릭터와 이젤의 크기와 위치가 달라 흔들린다(dungdung에서 몸통이 약 10 px 이동). 캐릭터와 이젤을 따로 첫 프레임에 맞춰(축척 + 이동) 다시 만들고, 원본은 `artist-original.gif`로 남긴다.
- 몸통 레이어와 소품 레이어 하나, 그리고 셰이더가 그리는 눈이라는 구조는 네 친구에게도 그대로 맞는다. 안경(popo)은 소품 레이어가 눈 위에 그려지므로 렌즈 안에서 눈이 깜박인다. 목도리(dori)와 헤드폰(dungdung)은 몸통 앞을 감싸는 소품이라 흔들림 범위를 줄이고, 안경은 기울면 렌즈와 눈이 어긋나므로 기울기 범위를 0으로 둔다(리그 수치).
- 용량: Doany 이미지 3장은 3.9 MB다. 친구 4명을 같은 1254² 크기로 넣으면 앱이 약 16 MB 커진다. 리그 좌표는 크기와 무관한 UV라 해상도를 낮춰도 수치는 그대로다. 1단계 마지막에 크기를 재고, 줄일지는 그 결과를 보고 사람에게 묻는다(tasks 1.6).

## 버디 레지스트리

`app/src/renderer/buddies.ts`(순수 모듈) 하나가 버디 목록의 단일 출처다. 버디를 보여주는 화면(Buddy 단계, 기존 사용자용 버디 화면, 설정 General, Home, 작업 안내)은 이 레지스트리와 저장된 설정만 읽고, 저장값이 바뀌면 즉시 따른다. 버디별로 분기하는 코드를 화면에 흩어 두지 않는다.

- `BuddyId = "doany" | "puri" | "dungdung" | "popo" | "dori"`. 이 순서가 기본 순서(설정 General)다. 첫 실행의 Cover Flow 줄만 별도 순서(Popo · Puri · Doany · Dungdung · Dori)를 레지스트리에 함께 둔다.
- 버디마다 이름, 성격 한 줄, 에셋 경로, 리그 수치, 작업 안내 변형 목록을 둔다.
- `parseBuddyId(value)`: 알 수 없는 값과 문자열이 아닌 값은 `doany`로 읽는다.

## 리그 일반화

셰이더 상수는 uniform으로 바꾸지 않는다. 버디별 리그 수치를 셰이더 소스 템플릿에 문자열로 넣어 버디마다 컴파일한다. Home은 버디를 하나만 그리므로 프로그램을 버디별로 만들어도 비용이 없다.

- 이유: `Doany.test.tsx`는 WebGL 호출 trace(셰이더 소스 문자열, uniform 위치 조회)를 `doany.golden.json`과 정확히 비교하고, `doanyRender.test.ts`는 그 소스에서 정규식으로 앵커를 꺼낸다. golden 생성기는 저장소에 없다(ARCHITECTURE §7 'Doany (mascot)'). 수치를 draft 표기 그대로(`.421`, `.10`) 레지스트리에 문자열로 두면 Doany의 소스와 trace가 바이트 단위로 같아 golden을 건드리지 않는다.
- 수치: 눈 중심 2개와 반지름(`.421,.550`·`.619,.550`·`.035,.056`), 눈 하이라이트 y(`.523`, 눈 중심 y에서 `.027` 위), 시선 오프셋(`.018,.014`), 몸통 skew(`.018`), 몸통 pivot(`.5,.60`), 소품 pivot(`.67,.30`), scale `1.34`, 중립 오프셋 `.10`, 폴백 padding `16.5%`, 소품 기울기 범위(`BERET_TILT`, 버디별 이름은 accessory tilt), 홉 높이 배율(`LIFT_SCALE`).
- `doanyRender.test.ts`는 버디마다 소스를 만들어 같은 정규식으로 검사한다. 친구의 소품 기울기 범위와 홉 headroom은 같은 방식으로 정한다. 모든 누름 순서에서 캔버스 가장자리와 1.4 device px 이상 떨어져야 한다.
- 컴포넌트 이름 `Doany`는 `Buddy`로 바꾸고 `buddy` prop을 받는다. 버디가 바뀌면 `key={buddy}`로 다시 마운트한다(마운트마다 컨텍스트를 만들고 해제하는 기존 규칙, ARCHITECTURE §7 'Doany (mascot)'). 접근성 이름은 "Make <이름> hop"이다.
- 친구의 `still.png`나 텍스처를 읽지 못하면 Doany와 같이 정지 이미지로 떨어지고, 정지 이미지도 없으면 그 자리를 비운다. 레지스트리의 모든 에셋 경로가 실제로 있는지는 테스트로 막는다(tasks 3.2).

## accent 동적 변경

토큰 3층(palette → role → legacy, DESIGN.md 'Three colour layers')은 유지하고, palette와 role 사이에 전환층 하나를 둔다.

- **palette**: `--violet-*` 옆에 친구 램프 4개(`--puri-*`, `--dungdung-*`, `--popo-*`, `--dori-*`)가 이미 있다(`tokens.css`, `/design-draft`에서 추가). sky·amber·green은 이미 다른 palette 색 이름이라 버디 이름을 쓴다. 각각 1–12단계, pressed, link, icon 값이다. 만드는 방법은 `tokens.css` 주석과 `buddy-accent` 캔버스 머리말에 있다. Puri는 hue를 168로, Popo는 42로 옮겨 성공 초록·오류 빨강과 구분했다. Dungdung은 1–6단계 채도를 violet의 2.2배(7–8단계 1.6배)로 올렸다. Popo만 9단계를 흰색 3:1까지 어둡게 했다.
- **전환층**: 이름은 `--buddy-*`다. legacy `--accent`, `--accent-ink`, `--accent-soft`, `--accent-line`(회색 등)과 섞이지 않게 접두사를 따로 둔다. role이 실제로 읽는 단계만 둔다(2, 3, 4, 9, 10, 11, 12, pressed, contrast, icon). `:root`는 violet을 가리키고, `:root[data-buddy="puri"]` 등이 각 램프로 덮어쓴다. role(`--affordance-accent`, `--surface-accent-subtle`, `--text-accent-subtle`, `--surface-comment` 등)은 `--violet-*` 대신 `--buddy-*`를 읽는다. `--surface-sidebar-selected`·`--text-sidebar-selected`·`--affordance-sidebar-hover`(쓰는 곳 없음, DESIGN 'Open decisions')는 violet에 그대로 둔다.
- **Welcome**: 항상 Doany와 violet이다. `.ob-atmosphere`의 `var(--affordance-accent)`를 `var(--violet-9)`로 바꿔 직접 읽는다. `::before`는 이미 `--violet-5`를 읽는다.
- **아이콘 색**: 새 role `--text-accent`(= `--buddy-icon`)를 둔다. 친구는 `--<id>-icon`, Doany는 `--violet-9`다. 9단계를 OKLCH 명도로 어둡게 해서, 이 색이 놓이는 가장 어두운 면인 눌린 사이드바 행(`--bg-app` 위 `--affordance-backdrop-pressed`, #d9d9da)에서 3:1이 되게 한 색이다. violet은 그 면에서 3.70:1이다.
- **Accent places 배정**: DESIGN 'Accent places'의 모든 항목을 다음 셋 중 하나로 배정하고, 그 표를 DESIGN.md에 둔다(tasks 2.2).
  - 9단계 채움·글로우·그라데이션(`--affordance-accent`): Home Send, composer 글로우, 캔버스 작업 글로우, jump highlight 선·글로우, 대화 패널 resize bar, 사람 메시지 버블, 선택 카드 글로우.
  - 아이콘 색(`--text-accent`): Fast 아이콘, 추천 프롬프트 아이콘과 화살표, 사이드바 permission·unseen 점, Show conversation 점, 프리셋 아이콘·탭 아이콘, 드롭 외곽선, 선택 카드 테두리.
  - 칩 글자(3단계 위 11단계): 프리셋 칩, 추천 프롬프트 이름 강조, 앵커 칩, skill word, 버블 프리셋 줄.
- **Send**: 아이콘과 스피너는 흰색이 9·hover·pressed 모두에서 3:1을 넘으면 흰색을 쓴다(Doany 5.21:1 이상, Popo 3.02:1 이상, Dori 3.20:1 이상). 넘지 못하면 중립 잉크 `--text-standard`를 쓴다(Puri 2.32:1, Dungdung 2.05:1). `--text-on-accent`는 전환층에서 버디마다 정한다. Send는 아이콘만 있는 버튼이라 검사 종류를 글자(4.5:1 + APCA Lc 60)에서 비텍스트(3:1)로 바꾼다. Send를 함께 쓰는 docked composer의 Stop과 Queue도 같은 잉크를 쓴다.
- **적용**: renderer가 `<html data-buddy="<id>">`를 설정한다. Doany는 속성이 없다. `@theme inline`이 accent를 shadcn 이름에 연결하지 않는다는 규칙(ARCHITECTURE §7 ds)은 violet에서 모든 버디 palette와 `--buddy-*`로 넓힌다.
- **검사**: `ds/checks.ts`의 `rootTokens`는 지금 `:root`로 시작하는 블록을 모두 합친다. 그래서 `rootTokens(css, buddy?)`로 바꾼다. 기본은 순수 `:root`만 읽고, 버디를 주면 `:root[data-buddy="<id>"]`를 그 위에 덮는다. `contrastPairs`와 `rolePairs`는 버디를 하나씩 넣어 다섯 번 돈다. 검사 항목은 칩 글자(3 위 11단계, 4.5:1), 아이콘 색(눌린 사이드바 행 위 3:1), Send 잉크(9·hover·pressed 위 3:1, nontext)다. `violetNames`·`accentPlaces`는 모든 버디 palette와 `--buddy-*`를 추적하고, `--violet-*`를 직접 읽는 곳은 `.ob-atmosphere`(Welcome)만 허용한다. 램프 값은 palette 리터럴로 두고, 램프를 다시 계산하는 함수는 앱 코드에 두지 않는다. 기준은 `contrastPairs`가 고정한다.
- 캔버스 초안은 `tokens.css`를 직접 링크하고 `data-buddy`가 없으므로 지금처럼 violet이다.

## 설정과 첫 페인트

- `preferences.json`에 `buddy` 필드를 추가한다. 키가 없으면 버디를 고른 적이 없다는 뜻이다(화면에는 Doany). `v`는 1을 유지한다. 알 수 없는 id(더 새로운 빌드가 저장한 값)와 문자열이 아닌 값은 그 필드만 없는 것으로 읽는다. 원래 규칙은 '값이 틀린 필드 하나가 파일 전체를 broken으로 만든다'이지만, `permissionMode`와 같은 예외로 둔다. 다른 patch를 쓸 때 그 필드는 지금 빌드가 읽은 값으로 다시 쓴다(`permissionMode`처럼 다음 저장에서 사라진다). 쓰기 요청(`PreferencesPatch`)은 알려진 id만 받는다.
- 이전 빌드는 이 필드를 모르므로, 그 빌드가 다음에 쓸 때 필드가 사라질 수 있다. 다운그레이드에서만 생기는 일이라 받아들인다. 그 사람은 다음 실행 때 기존 사용자용 버디 화면을 다시 본다.
- newer·broken: 다른 설정 카테고리와 같은 규칙이다(PRODUCT §5 item 0 'Settings storage'). newer면 버디 선택 컨트롤을 끄고 기존 newer notice만 보이며, 기존 사용자용 버디 화면은 띄우지 않는다. broken이면 기본값으로 보여주고 고를 수 있으며, 저장하면 파일을 옆으로 옮긴다.
- 첫 페인트: main은 창을 만들 때 `preferences.current()`로 버디 id를 읽어 렌더러에 넘기고, 렌더러는 React를 마운트하기 전에 `data-buddy`를 설정한다. 넘기는 방법은 preload `additionalArguments`를 권한다(sandbox preload에서 `process.argv`를 읽을 수 있는지는 `/tdd`에서 실제 앱으로 확인한다). 이 값은 첫 페인트용 초기값일 뿐이다. App이 preferences 스냅샷을 읽을 때마다 `data-buddy`를 다시 적용하므로, 렌더러가 다시 로드돼도 저장값을 따른다.
- 고를 때: 고르는 즉시 `data-buddy`와 버디 상태를 바꾸고 저장을 보낸다. 화면에 반영하는 응답은 가장 최근 선택의 응답뿐이다. 그 응답이 실패면 저장된 버디로 되돌리고 notice를 띄우며, 이전 선택의 응답은 무시한다(POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback'). 저장 IPC가 null을 돌려주면 App이 들고 있는 스냅샷으로 되돌린다. 화면을 그리기만 하고 사람이 고르지 않았다면 아무것도 저장하지 않는다(POSTMORTEM 2026-11-06).

## 첫 실행 Buddy 단계

- `Scene`에 `"buddy"`를 추가한다. Welcome의 Get started는 Buddy로 간다. Buddy의 Continue는 Agent로 간다(auth와 무관). Agent의 Back은 Buddy로 가고, Buddy의 Back은 Welcome으로 간다. Agent에서 Buddy로 갈 때도 지금 Welcome으로 갈 때처럼 `sceneMover.back()`을 거친다. 스텝퍼는 3단계다(Buddy · Agent · Project). Buddy 단계에서는 Agent 알약으로 앞으로 갈 수 있고, Project 알약은 지금 규칙(준비된 agent가 있어야 함)을 따른다. 완료한 단계는 체크 표시가 붙고 다시 돌아갈 수 있다. Escape는 아무것도 하지 않는다.
- 단계에 들어오면 저장된 버디(없으면 Doany)가 선택된 채 가운데에 있다. 포커스는 다른 단계처럼 제목에 둔다. Tab 순서는 radiogroup → (Retry) → Back → Continue다. radiogroup의 이름은 보이는 제목 "Choose your buddy"다(`aria-labelledby`).
- 고르면 즉시 저장하고 accent도 즉시 바뀐다. Continue는 항상 누를 수 있다. 저장에 실패하면 줄이 저장된 버디로 돌아가고, 줄 아래에 첫 실행의 패널 notice(Agent 단계 목록 notice와 같은 `doan-notice doan-panel`)로 "Couldn’t switch to <고른 버디>. <저장된 버디> is still your buddy."와 Retry(접근성 이름 "Switch to <고른 버디> again")가 나온다. 실패는 `.ob-live`가 한 번 읽고, notice에는 live role을 두지 않는다. Retry는 고른 버디를 다시 저장한다. Retry가 성공하면 notice를 지우고 포커스를 체크된 라디오로 옮긴다. 실패하면 포커스를 Retry에 둔다. 진행 중에도 버튼을 비활성화하지 않는다. notice는 다음 저장이 성공하거나 단계를 떠날 때 지운다. Continue는 저장된 버디로 진행하고, 저장이 끝나기 전에 Continue를 눌렀다가 실패하면 accent만 저장된 버디로 조용히 되돌린다.
- 첫 실행을 다시 시작하면 Welcome부터 시작한다. Welcome은 버디를 고르기 전 화면이라 저장된 버디와 상관없이 Doany와 violet을 보여준다.
- 선택지 UI는 Cover Flow 한 줄이고, 순서는 Popo · Puri · Doany · Dungdung · Dori다. 줄은 순환하지 않고 양끝에서 멈춘다. 카드 5장마다 그림, 이름, 성격 한 줄이 함께 있다. 고른 카드가 가운데에서 정면을 보고, 나머지는 가운데를 향해 기울어진 채 뒤로 겹친다. 카드 오프셋은 인덱스 차이로 계산한다. 넘기는 입력(카드 클릭, ←/→와 ↑/↓, 가로 스크롤: 트랙패드 가로 스와이프 또는 Shift+마우스 휠)은 모두 하나의 select를 거친다. select는 라디오를 체크하고, 저장하고, 줄을 옮긴다. 방향키는 네이티브 라디오의 순환을 막아 양끝에서 멈춘다. 가로 스크롤은 한 제스처에 한 칸만 넘긴다. Return은 그룹 안에서 아무것도 하지 않는다. 라디오의 이름은 버디 이름, 설명은 성격 한 줄이다(`aria-labelledby`, `aria-describedby`). forced colors에서는 선택 카드에 2px `outline`(Highlight)을 준다. box-shadow 테두리와 글로우가 사라지기 때문이다. 치수는 캔버스 머리말에 있다.
- 포커스와 모달: 이 단계도 기존 wizard `<dialog>` 안에 있다. POSTMORTEM 2026-10-24('The onboarding wizard lost keys and clicks to focus and modal stacking')를 따른다. 키는 window에서 처리하고, 컨트롤이 비활성화될 때 포커스가 `<body>`로 빠진다고 가정한다.

## 기존 사용자용 버디 화면

- 조건: 첫 실행 완료 기록이 있고, preferences가 newer가 아니며, `buddy` 키가 없다. 앱을 시작할 때 main이 판단해 렌더러에 알린다. 첫 실행이 열려 있으면 띄우지 않는다.
- 첫 실행과 같은 wizard `<dialog>`로 창 전체를 덮는다. 스텝퍼와 Back은 없고, Buddy 단계와 같은 제목·설명·카드 줄·notice와 Continue 하나만 둔다. 고를 때마다 저장하는 규칙도 같다. Continue를 누르면 그때 선택된 버디(처음엔 Doany)를 저장하고(이미 저장했으면 그대로) 닫는다. 저장에 실패하면 닫지 않고 notice와 Retry를 보인다. Escape와 Close Window는 첫 실행과 같다.
- 버디를 한 번이라도 저장하면 이 화면은 다시 뜨지 않는다. 설정 General에서 바꾼 것도 저장이다.

## 설정 General 카테고리

- `SettingsSection`에 `"general"`을 추가한다. 순서는 General, Agents, MCP Connectors, Notifications, About이다. 설정을 처음 열 때 보여주는 카테고리는 지금처럼 Agents다(PRODUCT §5 item 0 'Settings page'). 사이드바 General 행 아이콘은 lucide `SlidersHorizontal`이다.
- General에는 지금 Buddy 그룹 하나만 있다. 버디마다 preference row 하나를 기본 순서로 세로로 쌓는다. 행마다 `card.png`(48px), 이름, 성격 한 줄, 첫 실행의 라디오가 있다. 방향키는 네이티브 라디오 동작(끝에서 처음으로 순환)을 그대로 둔다. 골라도 움직이지 않고 accent 테두리도 없다.
- 저장에 실패하면 그룹 위(설정 공용 notice 자리)에 첫 실행과 같은 문구와 Retry가 나오고, 라디오는 저장된 버디로 돌아간다. 실패는 페이지 live region이 한 번 읽는다. newer·broken notice가 함께 있으면 그 notice가 위, 저장 실패 notice가 아래다.

## 작업 안내

`DoanyArtist`를 `BuddyArtist`로 바꾼다. 레지스트리에서 고른 버디의 변형 목록을 읽는다. Doany는 3종 중 무작위로 고르고, 친구는 1종이다. 안내가 떠 있는 동안 버디가 바뀌면 떠 있는 안내도 즉시 새 버디의 GIF로 바꾼다(Doany로 바뀌면 새로 무작위). 같은 버디인 동안에는 고른 변형을 유지하는 지금 규칙을 그대로 쓴다. 정지 프레임(대기, 숨김, reduced motion) 규칙도 그대로다.

## 순수 함수로 분리할 것 (`/tdd` 대상)

- `buddies.ts`: `parseBuddyId`, 레지스트리 조회(에셋 경로, 리그 수치, 작업 안내 변형, 기본 순서, 첫 실행 순서), `pickArtist(id, previous, random)`(같은 버디면 유지, 바뀌면 새로 고름).
- `preferences.ts`: `buddy` 읽기(키 없음, 알 수 없는 id, 문자열 아님)와 patch 검증, 다른 patch를 쓸 때 기존 필드 보존.
- 기존 사용자용 버디 화면 표시 조건: 완료 기록, newer, `buddy` 키 유무.
- 저장 응답 순서: 가장 최근 선택의 응답만 반영하고 이전 응답은 무시하는 함수.
- `onboardingScene.ts`: `buddy` 장면 전이(Welcome → Buddy → Agent, Agent의 back → Buddy, Buddy의 back → Welcome, `step` 이벤트 `to: "buddy"`와 busy 거절, Escape 무시, 재시작 시 Welcome).
- Cover Flow 입력: 카드 오프셋, ←/→·↑/↓를 양끝에서 멈추는 함수, 가로 wheel delta(Shift+휠 포함)를 모아 한 제스처에 한 칸만 넘기는 함수.
- `settingsSections.ts`: `general` 카테고리 파싱과 표시.
- `ds/checks.ts`: `rootTokens(css, buddy?)`, 버디 accent 추적, 버디별 `contrastPairs`·`rolePairs`.
- `Doany.tsx`의 셰이더 소스 템플릿과 `drawnPose`: 버디별 수치, 기울기 범위, 홉 배율.

## 형식 변경

- `preferences.json`에 `buddy` 필드를 추가하고 `v`는 1을 유지한다. TS만 읽는 파일이라 `preferences.test.ts`가 스키마다(ARCHITECTURE §7 'Preferences').
- `ui-state.json`의 `settingsSection`에 `"general"` 값이 생긴다. 이전 빌드는 이 값을 읽지 못해 기본 카테고리를 연다.
- `schema/`의 JSON Schema, CLI 응답, `runtime.json`, 소켓 메시지는 바뀌지 않는다.

## 규칙(conventions) 영향

- 캔버스 규칙과 `doan check` 규칙은 바뀌지 않는다.
- 디자인 시스템 규칙이 바뀐다. 'violet만 Accent places에서 읽는다'가 '고른 버디의 accent만 Accent places에서 읽는다'로 바뀌고, Welcome만 violet을 직접 읽는다. accent 위 아이콘 잉크는 흰색이 대비를 통과하지 못하는 버디에서만 중립 잉크가 되고, Send는 비텍스트 기준으로 검사한다. accent 아이콘은 버디별 아이콘 색을 쓴다. DESIGN.md를 고친다.

## 결정 영향

- PRODUCT §3 In scope에 버디 선택과 accent 개인화를 한 줄 추가한다.
- PRODUCT §2(첫 실행 설명), §3 In scope 7의 첫 실행 순서, §5 item 0 'First run'(Welcome → Agent → Project → Home)에 Buddy 단계를 넣는다. 기존 사용자용 버디 화면을 §5 item 0에 적는다.
- PRODUCT §5 item 0 'Settings page'의 카테고리 목록과 'Settings storage'의 저장 항목 목록에 General(Buddy)을 넣는다.
- PRODUCT §5 item 1 'Doany'(마스코트는 Pebble 하나)를 '고른 버디, 기본 Doany'로 바꾼다.
- PRODUCT §5 'Agent indicator'(Doany at work: painting, typing, reading)를 고른 버디 기준으로 바꾼다.
- ARCHITECTURE §7 'Doany (mascot)', 'Preferences', 'First-run onboarding', ds 규칙과 DESIGN.md 'Accent ramp'·'Accent places'·'Three colour layers'·Home Send·Home 접근성 이름을 고친다.
- ARCHITECTURE의 구조 결정(서빙 범위, sandbox iframe, 토큰, git 명령 등)은 건드리지 않는다.

## PoC 의존

- **레이어 추출**: image_gen으로 같은 좌표의 몸통·소품 레이어를 만드는 방법은 Doany에서만 확인했다. 소품이 몸통 앞을 감싸는 경우(목도리, 헤드폰)는 확인하지 않았다. 버디 하나(puri)로 먼저 확인한 뒤 나머지 셋을 만든다(tasks 1.5).
- **첫 페인트**: sandbox preload에서 `additionalArguments`로 받은 값을 읽을 수 있는지는 확인하지 않았다(tasks 3.4).

## 제작 방식

- 사람이 준 것: 시안 카드 이미지 4장(흰 배경)과 친구별 artist GIF 4개. 저장소에는 `.doan/assets/buddies/<id>/card.png`, `artist-original.gif`로 들어 있다.
- Claude(lead)가 한 일: 에셋 구조, accent 램프와 대비 캔버스, 화면 초안 캔버스(Buddy 단계, 설정, Home, 작업 안내). 초안은 시안 이미지와 받은 GIF를 그대로 쓰고, Home의 친구 자리는 카드 이미지를 `mix-blend-mode: multiply`로 대신 쓴다.
- Codex 워커가 이어서 하는 일: 투명 정지 이미지, 몸통·소품 레이어, 리그 수치, Doany 카드(image_gen). 인계 내용은 tasks.md 'Codex 워커 인계'에 있다. 사용자가 이 기능의 에셋 제작에 한해 모델 계열을 넘나들도록 허락했다(AGENTS.md 'Worker model boundary').
- Claude는 Codex 결과의 좌표·정렬을 검수한다. 사람이 캔버스에서 확인한다.
- 시안의 형태와 질감은 바꾸지 않는다. 배경을 투명하게 만들고 레이어로 나누는 것만 한다. 생성 과정에서 형태가 바뀌면 그 차이를 캔버스에 표시하고 사람에게 묻는다.

## 디자인 preset

`/design-draft`에서 `clarify`를 읽었고, 초안을 `critique`와 `audit`으로 검수해 결과를 반영했다.

## 초안 요청 (`/design-draft`)

### `.doan/canvases/buddy-accent.html` (id `buddy-accent`, width 1920)

| frame | 내용 |
|---|---|
| `ramps` | 다섯 램프의 1–12단계, pressed, link, 아이콘 색과 몸통 견본 |
| `contrast` | 램프마다 칩 글자(3 위 11, 4.5:1), 눌린 사이드바 행 위 아이콘 색(3:1), 9·hover·pressed 위 Send 잉크(3:1), 9 위 흰색의 대비를 계산해 보여준다 |
| `places` | 램프마다 Accent places 견본: Send 세 상태, 프리셋 칩, 추천 프롬프트 한 줄, 사이드바 점(hover 행), Home composer 글로우, 캔버스 작업 글로우, jump highlight, 드롭 외곽선 |

- 램프 값은 `tokens.css` palette(`--puri-*`, `--dungdung-*`, `--popo-*`, `--dori-*`)에 있고, 캔버스는 전환층을 흉내 내서 프레임 안에서 role을 덮어쓴다.
- 친구 램프를 만드는 방법은 violet과 다르다. violet 방법(9단계 대비 채도 비율)을 그대로 쓰면, 채도가 낮은 친구의 1–8단계는 거의 회색이 된다. 그래서 1–8·11·12단계는 violet의 OKLCH 명도와 절대 채도를 쓴다(친구 9단계 채도의 1.2배 이하). 9단계는 Doany 몸통 색이 violet 9가 될 때와 같은 이동을 친구 몸통 색에 적용한다. 아이콘 색은 9단계를 흰 바탕 대비 3:1이 될 때까지 어둡게 한 값이다.

### `.doan/canvases/buddy-home.html` (id `buddy-home`, width 2560)

버디마다 Home 프레임 하나(`home-doany`, `home-puri`, `home-dungdung`, `home-popo`, `home-dori`). 요청을 입력하고 프리셋을 고른 상태라 Send가 활성화돼 있다. 버디 그림과 accent(composer 글로우, 프리셋 칩, Send, 사이드바 unseen 점)만 바뀐다. 입력 중에는 추천 프롬프트가 숨는다(출시된 동작). Doany는 출시된 정지 이미지를 쓰고, 친구는 투명 정지 이미지가 나오기 전까지 카드 그림을 multiply로 대신 쓴다.

### `.doan/canvases/buddy-choice.html` (id `buddy-choice`, width 2560)

| frame | 상태 |
|---|---|
| `buddy-step` | 첫 실행 Buddy 단계, 처음 상태(Doany 선택) |
| `buddy-step-picked` | 같은 단계에서 Dungdung을 고른 상태(accent가 따라 바뀜) |
| `buddy-step-end` | 오른쪽 끝 Dori를 고른 상태(왼쪽에 넷이 겹치고 더 넘어가지 않음) |
| `buddy-intro` | 버디를 고른 적 없는 기존 사용자, 다음 실행 때 창 전체를 덮는 버디 화면(스텝퍼·Back 없음, Continue만) |
| `buddy-step-failed` | Popo를 골랐다가 저장에 실패한 상태(Doany 유지, notice와 Retry) |
| `settings-general` | 설정 General, Popo 선택 |
| `settings-general-failed` | General, Popo 저장 실패(Dori 유지), 그룹 위 notice와 Retry |
| `notice` | 캔버스 작업 안내, 다섯 버디의 화가 GIF와 각 accent 글로우 |

- 선택 카드: Cover Flow 한 줄이다(반사 없음). 카드(244px, 위아래 패딩 20px, 좌우 24px)마다 `card.png`(196px), 이름(semibold), 성격 한 줄(caption, 진한 글씨 `--text-standard`)이 있고 라디오 역할을 한다. 고른 카드는 가운데에서 정면을 보고, accent 아이콘 색 테두리 2px와 Home composer 글로우를 가진다(새 Accent place). 나머지는 50° 기울어 84% 크기로 양옆에 겹친다. 넘기는 입력은 세 가지다. 옆 카드를 클릭하거나, 그룹에 포커스가 있을 때 ←/→를 누르거나, 트랙패드를 두 손가락으로 가로 스와이프한다. 스와이프는 한 번에 한 칸만 넘긴다. 어느 입력이든 도착한 카드를 고르고 저장한다. 이전/다음 버튼은 두지 않는다. 옆 카드가 그 역할을 하고, hover하면 그림자가 짙어진다. 고르면 `--time-settle`·`--ease-enter`로 가운데로 이동하고, reduced motion에서는 바로 바뀐다. 설정 General은 정적이다. 버디마다 preference row 하나를 세로로 쌓는다. 행마다 `card.png`(48px, 글자와 12px 간격), 이름, 성격 한 줄(다른 설정 행과 같은 글자 스타일), 첫 실행의 라디오가 있다. 골라도 움직이지 않고 accent 테두리도 없다.
- 문구(Doan clarify preset 적용): 제목 "Choose your buddy", 설명 "It keeps you company in Doan and sets the app’s accent color. You can change it anytime in Settings." 설정 General의 설명 "Choices that apply across Doan on this Mac.", Buddy 그룹 설명 "Shown on Home and while an agent works. It also sets the accent color.", 저장 실패 "Couldn’t switch to <고른 버디>. <저장된 버디> is still your buddy." + Retry
- 성격 한 줄(영어, 196px 카드에서 두 줄 이내, 모두 성격을 말함): Doany "A little artist in a beret who just loves to draw."(그림을 좋아하는 친구, 사용자 확인), Puri "A curious walking companion who shares every fun find.", Dungdung "A music-loving mood maker who keeps things upbeat.", Popo "A whimsical bookworm who dreams up new games.", Dori "A quiet, caring friend to lean on when you’re tired."
- Home 슬롯은 Doany와 같은 자리에 그림만 바뀌므로 따로 그리지 않는다.
