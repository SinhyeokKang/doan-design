# 버디 선택 — design

## 영향받는 곳

- **app (renderer)**: `Doany.tsx`·`doanyRig.ts`(리그 수치를 버디별로 받음), `CanvasAgent.tsx` `DoanyArtist`, `HomeComposerView.tsx`, `Onboarding.tsx`·`onboardingScene.ts`(Buddy 장면), `settingsSections.ts`·Settings 페이지(General 카테고리), `tokens.css`·`styles.css`·`ds/controls.css`(accent 램프와 역할), `ds/checks.ts`(violet 검사를 accent 검사로 일반화), `public/`(에셋).
- **app (main/preload)**: `preferences.ts`(`buddy` 필드), 첫 페인트 전에 버디 id를 전달하는 경로.
- **CLI·스킬·소켓**: 바뀌지 않는다.
- **에셋**: `.doan/assets/buddies/<id>/`(원본)와 `app/src/renderer/public/buddies/<id>/`(앱 사본).
- **캔버스**: `.doan/canvases/buddy-family.html`(에셋 확인), `/design-draft`에서 Buddy 단계와 설정 화면 초안.

## 에셋 구조

Doany 에셋 목록(현재):

| 용도 | 앱 사본 | 원본 |
|---|---|---|
| 정지 이미지(폴백) | `public/doany/doany.png` 1254² RGBA | `.doan/assets/doany/v2/doany.png` |
| 모션 몸통(눈 없음) | `public/doany/body.png` | `v2/body.png` |
| 모션 소품 | `public/doany/hat.png` | `v2/hat.png` |
| 리그 수치 | `Doany.tsx` 셰이더 상수 | `v2/README.md` |
| 작업 안내 | `public/doany/artist-*.gif`·`*-rest.png` 3종, 128² | `.doan/assets/doany/artist/*` 512² + 소스 박스 |
| 출처 | — | `v2/source-prompt.txt`, `v2/layer-prompts.json` |
| 앱 아이콘·파비콘 | `app/resources/icon*` | `v2/white.png`, `v2/simple/` |

버디 하나의 에셋 세트(친구 4명 모두 같은 파일 이름):

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
  prompts.json     정지 이미지·레이어·artist 생성 프롬프트(layer-prompts.json 형식)
  README.md        출처, 리그 수치, artist 소스 박스, 검증 결과

app/src/renderer/public/buddies/<id>/   앱 사본
  still.png  body.png  accessory.png   (원본과 같은 바이트)
  card.png                             (588², 선택 카드에 196px로 그리는 크기의 3배)
  artist.gif  artist-rest.png          (소스 박스로 자르고 128²로 줄인 것, Doany와 같은 방법)
```

- Doany의 앱 사본도 같은 경로와 이름으로 옮긴다(`public/buddies/doany/still.png`, `body.png`, `accessory.png`). 그래야 코드가 id 하나로 모든 버디를 읽는다. Doany만 작업 안내 변형이 3종이다(`artist-painting.gif`, `artist-typing.gif`, `artist-reading.gif`와 각 `-rest.png`).
- Doany 원본(`.doan/assets/doany/`)은 V1 기록까지 함께 있어서 옮기지 않는다.
- 받은 artist GIF는 2~5번 프레임에서 캐릭터와 이젤의 크기와 위치가 달라 흔들린다(dungdung에서 몸통이 약 10 px 이동). 캐릭터와 이젤을 따로 첫 프레임에 맞춰(축척 + 이동) 다시 만들고, 원본은 `artist-original.gif`로 남긴다.
- 몸통 레이어와 소품 레이어 하나, 그리고 셰이더가 그리는 눈이라는 구조는 네 친구에게도 그대로 맞는다. 안경(popo)은 소품 레이어가 눈 위에 그려지므로 렌즈 안에서 눈이 깜박인다. 목도리(dori)와 헤드폰(dungdung)은 몸통 앞을 감싸는 소품이라, 흔들림 범위를 버디별 리그 수치로 줄인다(아래).
- 용량: Doany 이미지 3장은 3.9 MB다. 친구 4명을 같은 1254² 크기로 넣으면 앱이 약 16 MB 커진다. 리그 좌표는 크기와 무관한 UV라 해상도를 낮춰도 수치는 그대로다. 1단계 마지막에 크기를 재고, 줄일지는 그 결과를 보고 사람에게 묻는다(tasks 1.6).

## 버디 레지스트리

`app/src/renderer/buddies.ts`(순수 모듈) 하나가 버디 목록의 출처다.

- `BuddyId = "doany" | "saemi" | "dungdung" | "popo" | "dori"`, 표시 순서는 이 순서다.
- 버디마다 이름, 성격 한 줄, 에셋 경로, 리그 수치, 작업 안내 변형 목록을 둔다.
- `parseBuddyId(value)`: 알 수 없는 값은 `doany`로 읽는다.
- 이후 Overview, AppShell 등 새 위치에서도 이 레지스트리와 저장된 설정만 읽는다. 버디별로 분기하는 코드를 화면에 흩어 두지 않는다.

## 리그 일반화

`Doany.tsx` 셰이더의 상수를 uniform으로 바꾸고, 값은 레지스트리의 리그 수치로 채운다.

- 수치: 눈 중심 2개와 반지름(`.421,.550`·`.619,.550`·`.035,.056`), 몸통 pivot(`.5,.60`), 소품 pivot(`.67,.30`), scale `1.34`, 중립 오프셋 `.10`, 폴백 padding `16.5%`, 소품 기울기 범위(`BERET_TILT`), 홉 높이 배율(`LIFT_SCALE`).
- Doany의 수치는 지금 값 그대로 둔다. `doany.golden.json` 비교와 rest 프레임 일치가 깨지면 안 된다. uniform으로 바꾸면 WebGL 호출 trace가 달라지므로, golden은 셰이더 출력과 rest 프레임 기준으로 다시 확인하고, 바뀐 trace는 커밋 메시지에 기록한다.
- 친구의 소품 기울기 범위와 홉 headroom은 `doanyRender.test.ts`와 같은 방식으로 정한다. 모든 누름 순서에서 캔버스 가장자리와 1.4 device px 이상 떨어져야 한다.
- 컴포넌트 이름 `Doany`는 `Buddy`로 바꾸고 `buddy` prop을 받는다. 접근성 이름은 "Make <이름> hop"이다.

## accent 동적 변경

토큰 3층(palette → role → legacy, DESIGN.md 'Three colour layers')은 유지하고, palette와 role 사이에 전환층 하나를 둔다.

- **palette**: `--violet-*` 옆에 친구 램프 4개(`--saemi-*`, `--dungdung-*`, `--popo-*`, `--dori-*`)가 있다(`tokens.css`, `/design-draft`에서 추가). sky·amber·green은 이미 다른 palette 색 이름이라 버디 이름을 쓴다. 각각 1–12단계, pressed, link, icon 값이다. 만드는 방법은 `tokens.css` 주석과 `buddy-accent` 캔버스 머리말에 있다. Saemi는 hue를 168로, Popo는 42로 옮겨 성공 초록·오류 빨강과 구분했다. Dungdung은 1–6단계 채도를 violet의 2.2배(7–8단계 1.6배)로 올려 밝은 단계가 크림이 아니라 노랑으로 보이게 했다.
- **전환층**: `--accent-1`…`--accent-12`, `--accent-pressed`, `--accent-link`, `--accent-icon`. `:root`는 violet을 가리키고, `:root[data-buddy="saemi"]` 등이 각 램프로 덮어쓴다. role(`--affordance-accent`, `--surface-accent-subtle`, `--text-accent-subtle`, `--surface-comment` 등)은 `--violet-*` 대신 `--accent-*`를 읽는다. Welcome은 항상 Doany와 violet이라, `.ob-welcome`에서 accent role을 violet으로 되돌린다. `.ob-atmosphere::before`의 `--violet-5`는 그대로 둔다.
- **아이콘 색**: 새 role `--text-accent`(= `--accent-icon`)를 둔다. accent 아이콘, 점, 외곽선이 이 role을 읽는다. 대상은 Fast 아이콘, 추천 프롬프트 아이콘과 화살표, 사이드바 permission·unseen 점, Show conversation 점, 프리셋 아이콘, 드롭 외곽선이다. `--accent-icon`은 버디별 `--<id>-icon` 값이다. 9단계를 OKLCH 명도로 어둡게 해서, 이 색이 놓이는 가장 어두운 면인 눌린 사이드바 행(`--bg-app` 위 `--affordance-backdrop-pressed`, #d9d9da)에서 3:1이 되게 한 색이다. violet은 9단계 그대로이고 그 면에서 3.70:1이다.
- **Send**: 아이콘과 스피너는 흰색이 9·hover·pressed 모두에서 3:1을 넘으면 흰색을 쓴다(Doany 5.21:1 이상, Popo 3.02:1 이상, Dori 3.20:1 이상). Popo는 흰 아이콘을 쓰려고 9단계를 흰색 3:1까지 어둡게 했다. 넘지 못하면 중립 잉크 `--text-standard`를 쓴다(Saemi 2.32:1, Dungdung 2.05:1). `--text-on-accent`는 전환층에서 버디마다 정한다.
- **적용**: renderer가 `<html data-buddy="<id>">`를 설정한다. Doany는 속성이 없다. `@theme inline`이 accent를 shadcn 이름에 연결하지 않는다는 규칙(ARCHITECTURE §'ds')은 violet에서 accent 전체로 넓힌다.
- **검사**: `ds/checks.ts`의 violet 추적(`violetNames`, `accentPlaces`)을 `--accent-*`와 모든 버디 palette로 넓힌다. `contrastPairs`는 램프마다 칩 글자(3 위 11단계, 4.5:1), 아이콘 색(눌린 사이드바 행 위 3:1), Send 아이콘(9·hover·pressed 위 그 버디의 잉크, 3:1)을 검사한다.
- 캔버스 초안은 `tokens.css`를 직접 링크하고 `data-buddy`이 없으므로 지금처럼 violet이다.

## 설정과 첫 페인트

- `preferences.json`에 `buddy` 필드를 추가한다. 키가 없으면 `doany`다. `v`는 1을 유지한다. 알 수 없는 id(더 새로운 빌드가 저장한 값)는 그 필드만 `doany`로 읽는다. 원래 규칙은 '값이 틀린 필드 하나가 파일 전체를 broken으로 만든다'이지만, `permissionMode`와 같은 예외로 둔다. 쓰기 요청(`PreferencesPatch`)은 알려진 id만 받는다.
- 이전 빌드는 이 필드를 모르므로, 그 빌드가 다음에 쓸 때 필드가 사라질 수 있다. 다운그레이드에서만 생기는 일이라 받아들인다.
- 첫 페인트: main은 시작할 때 preferences를 동기적으로 읽는다(ARCHITECTURE §7 'Preferences'). 창을 만들 때 버디 id를 렌더러에 넘기고, 렌더러는 React를 마운트하기 전에 `data-buddy`를 설정한다. 넘기는 방법은 preload `additionalArguments`를 권한다. 확정은 `/tdd`에서 한다.
- 설정을 바꿀 때: Home과 Settings는 렌더러 하나를 공유하므로(변경 이벤트 없음, ARCHITECTURE §7 'Preferences'), 저장 응답의 스냅샷으로 `data-buddy`와 버디 상태를 바로 갱신한다. 저장에 실패하면 응답 스냅샷(마지막 저장값)으로 되돌린다.

## 첫 실행 Buddy 단계

- `Scene`에 `"buddy"`를 추가한다. Welcome의 Get started는 Buddy로 간다. Buddy의 Continue는 Agent로 간다. 스텝퍼는 3단계다(Buddy · Agent · Project). 완료한 단계는 체크 표시가 붙고 다시 돌아갈 수 있다.
- 고르면 즉시 저장하고 accent도 즉시 바뀐다. Continue는 항상 누를 수 있다(Doany가 기본값이다). 저장에 실패하면 줄이 저장된 버디로 돌아가고, 줄 아래에 "Couldn’t switch to <고른 버디>. <저장된 버디> is still your buddy."와 Retry가 나온다. Retry는 고른 버디를 다시 저장한다. Continue는 저장된 버디로 진행한다.
- 첫 실행을 다시 시작하면 Welcome부터 시작한다. Welcome은 버디를 고르기 전 화면이라 저장된 버디와 상관없이 Doany와 violet을 보여준다.
- 선택지 UI는 Cover Flow 한 줄이고, 순서는 Popo · Saemi · Doany · Dungdung · Dori다. 기본값 Doany가 가운데에 있어 처음부터 양옆에 두 장씩, 다섯이 모두 보인다. 줄은 순환하지 않고 양끝에서 멈춘다. 카드 5장마다 그림, 이름, 성격 한 줄이 함께 있다. 고른 카드가 가운데에서 정면을 보고, 나머지는 가운데를 향해 기울어진 채 뒤로 겹친다. 넘기는 입력(카드 클릭, ←/→, 트랙패드 가로 스와이프)은 모두 하나의 select를 거친다. select는 라디오를 체크하고, 저장하고, 줄을 옮긴다. 방향키는 네이티브 라디오의 순환을 막아 스와이프처럼 양끝에서 멈춘다. 라디오의 이름은 버디 이름, 설명은 성격 한 줄이다(`aria-labelledby`, `aria-describedby`). 설정 General은 같은 내용을 세로로 쌓은 행으로 보여주며, 행 순서는 Doany가 맨 위다(레지스트리 순서). 치수는 캔버스 머리말에 있다.
- 포커스와 모달: 이 단계도 기존 wizard `<dialog>` 안에 있다. POSTMORTEM 2026-10-24('The onboarding wizard lost keys and clicks to focus and modal stacking')를 따른다. 키는 window에서 처리하고, 컨트롤이 비활성화될 때 포커스가 `<body>`로 빠진다고 가정한다. 이 단계에는 비동기 작업이 저장 하나뿐이다. 저장 중에도 선택지를 비활성화하지 않고 마지막 선택을 저장한다.

## 설정 General 카테고리

- `SettingsSection`에 `"general"`을 추가한다. 순서는 General, Agents, MCP Connectors, Notifications, About이다. 설정을 처음 열 때 보여주는 카테고리는 지금처럼 Agents다(PRODUCT §5 item 0 'Settings page').
- General에는 지금 Buddy 그룹 하나만 있다. 내용은 버디마다 preference row 하나를 세로로 쌓은 것이다. 저장에 실패하면 그룹 위(설정 공용 notice 자리)에 첫 실행과 같은 문구와 Retry가 나오고, 라디오는 저장된 버디로 돌아간다.

## 작업 안내

`DoanyArtist`를 `BuddyArtist`로 바꾼다. 레지스트리에서 고른 버디의 변형 목록을 읽는다. Doany는 3종 중 무작위로 고르고, 친구는 1종이다. 안내가 떠 있는 동안 고른 변형을 유지하는 규칙은 그대로다. 안내가 떠 있는 동안 버디가 바뀌면 다음 안내부터 반영한다. 정지 프레임(대기, 숨김, reduced motion) 규칙도 그대로다.

## 순수 함수로 분리할 것 (`/tdd` 대상)

- `buddies.ts`: `parseBuddyId`, 레지스트리 조회(에셋 경로, 리그 수치, 작업 안내 변형), `pickArtist(id, random)`.
- `preferences.ts`: `buddy` 읽기(키 없음, 알 수 없는 id, 잘못된 타입)와 patch 검증.
- `onboardingScene.ts`: `buddy` 장면 전이(Welcome → Buddy → Agent, 뒤로 가기, 재시작 시 Welcome).
- `settingsSections.ts`: `general` 카테고리 파싱과 표시.
- 램프 검증: `accentIcon(base, panel)`(9단계를 3:1이 될 때까지 어둡게 한 색), 램프 생성 방법으로 `tokens.css` 값을 다시 계산해 일치를 확인하는 함수.
- `ds/checks.ts`: accent 추적 일반화, 램프별 `contrastPairs`.
- `Doany.tsx`의 `drawnPose`: 버디별 기울기 범위와 홉 배율.

## 형식 변경

- `preferences.json`에 `buddy` 필드를 추가하고 `v`는 1을 유지한다. TS만 읽는 파일이라 `preferences.test.ts`가 스키마다(ARCHITECTURE §7 'Preferences'). `schema/`의 JSON Schema, CLI 응답, `runtime.json`, 소켓 메시지는 바뀌지 않는다.

## 규칙(conventions) 영향

- 캔버스 규칙과 `doan check` 규칙은 바뀌지 않는다.
- 디자인 시스템 규칙이 바뀐다. 'violet만 Accent places에서 읽는다'가 '버디 accent만 Accent places에서 읽는다'로 바뀌고, accent 위 아이콘 잉크는 흰색이 대비를 통과하지 못하는 버디에서만 중립 잉크가 되며, 흰 패널 위 accent 아이콘은 버디별 아이콘 색을 쓴다. DESIGN.md를 고친다.

## 결정 영향

- PRODUCT §5 item 1 'Doany'(버디는 Pebble 하나)를 '고른 버디, 기본 Doany'로 바꾼다.
- PRODUCT §5 item 0 'First run'(Welcome → Agent → Project → Home)에 Buddy 단계를 넣는다.
- PRODUCT §5 item 0 'Settings page'의 카테고리 목록에 General(Buddy)을 넣는다.
- PRODUCT §5 'Agent indicator'(Doany at work: painting, typing, reading)를 고른 버디 기준으로 바꾼다.
- ARCHITECTURE §7 'Doany (mascot)', 'Preferences', ds 규칙과 DESIGN.md 'Accent ramp'·'Accent places'·Home Send를 고친다.
- ARCHITECTURE의 구조 결정(서빙 범위, sandbox iframe, 토큰, git 명령 등)은 건드리지 않는다.

## PoC 의존

- **레이어 추출**: image_gen으로 같은 좌표의 몸통·소품 레이어를 만드는 방법은 Doany에서만 확인했다. 소품이 몸통 앞을 감싸는 경우(목도리, 헤드폰)는 확인하지 않았다.
- 버디 하나(saemi)로 먼저 확인한 뒤 나머지 셋을 만든다(tasks 1.5).

## 제작 방식

- 사람이 준 것: 시안 정지 이미지 4장(흰 배경)과 친구별 artist GIF 4개(`sprout_`, `headphones_`, `glasses_`, `scarf_painting.gif`, 512²). 원본은 `/Users/sinhyeok/Desktop/doan-family/`에 있다.
- Claude(lead)가 먼저 하는 일: 에셋 구조를 만들고 받은 파일을 넣는다. accent 램프와 대비 캔버스, 화면 초안 캔버스(Buddy 단계, 설정, 작업 안내)를 그린다. 초안은 시안 이미지와 받은 GIF를 그대로 쓴다. 흰 배경은 밝은 면 위에서 `mix-blend-mode: multiply`로 가린다.
- Codex 워커가 이어서 하는 일: 투명 정지 이미지, 몸통·소품 레이어, 리그 수치를 만든다(image_gen). 결과는 같은 경로에 넣으므로 캔버스는 고치지 않아도 된다. 사용자가 이 기능의 에셋 제작에 한해 모델 계열을 넘나들도록 허락했다(AGENTS.md 'Worker model boundary').
- Claude는 Codex 결과의 좌표·정렬을 검수하고 캔버스가 투명 에셋을 읽도록 바꾼다. 사람이 캔버스에서 확인한다.
- 시안 정지 이미지의 형태와 질감은 바꾸지 않는다. 배경을 투명하게 만들고 레이어로 나누는 것만 한다. 생성 과정에서 형태가 바뀌면 그 차이를 캔버스에 표시하고 사람에게 묻는다.

## 디자인 preset

`doan design-skill --json`으로 preset 목록만 확인했다. UI 문구와 레이아웃을 정하는 `/design-draft` 단계에서 `shape`, `clarify`, `critique`를 읽는다.

## 초안 요청 (`/design-draft`)

### `.doan/canvases/buddy-accent.html` (id `buddy-accent`, width 1600)

| frame | 내용 |
|---|---|
| `ramps` | 다섯 램프의 1–12단계, pressed, link, 아이콘 색과 몸통 견본 |
| `contrast` | 램프마다 칩 글자(3 위 11, 4.5:1), 눌린 사이드바 행 위 아이콘 색(3:1), 9·hover·pressed 위 Send 잉크(3:1), 9 위 흰색의 대비를 계산해 보여준다 |
| `places` | 램프마다 Accent places 견본: Send 세 상태, 프리셋 칩과 성공·오류 칩, 추천 프롬프트 한 줄, 사이드바 점(hover 행), Home composer 글로우, 캔버스 작업 글로우, jump highlight, 드롭 외곽선 |

- 램프 값은 `tokens.css` palette(`--saemi-*`, `--dungdung-*`, `--popo-*`, `--dori-*`)에 있고, 캔버스는 전환층을 흉내 내서 프레임 안에서 role을 덮어쓴다.
- 친구 램프를 만드는 방법은 violet과 다르다. violet 방법(9단계 대비 채도 비율)을 그대로 쓰면, 채도가 낮은 친구의 1–8단계는 거의 회색이 된다. 그래서 1–8·11·12단계는 violet의 OKLCH 명도와 절대 채도를 쓴다(친구 9단계 채도의 1.2배 이하). 9단계는 Doany 몸통 색이 violet 9가 될 때와 같은 이동을 친구 몸통 색에 적용한다. 아이콘 색은 9단계를 흰 바탕 대비 3:1이 될 때까지 어둡게 한 값이다.

### `.doan/canvases/buddy-home.html` (id `buddy-home`, width 2560)

버디마다 Home 프레임 하나(`home-doany`, `home-saemi`, `home-dungdung`, `home-popo`, `home-dori`). 요청을 입력하고 프리셋을 고른 상태라 Send가 활성화돼 있다. 버디 그림과 accent(composer 글로우, 프리셋 칩, Send, 사이드바 unseen 점)만 바뀐다. 입력 중에는 추천 프롬프트가 숨는다(출시된 동작). Doany는 출시된 정지 이미지를 쓰고, 친구는 투명 정지 이미지가 나오기 전까지 카드 그림을 multiply로 대신 쓴다.

### `.doan/canvases/buddy-choice.html` (id `buddy-choice`, width 2560)

| frame | 상태 |
|---|---|
| `buddy-step` | 첫 실행 Buddy 단계, 처음 상태(Doany 선택) |
| `buddy-step-picked` | 같은 단계에서 Dungdung을 고른 상태(accent가 따라 바뀜) |
| `buddy-step-end` | 오른쪽 끝 Dori를 고른 상태(왼쪽에 넷이 겹치고 더 넘어가지 않음) |
| `buddy-step-failed` | Popo를 골랐다가 저장에 실패한 상태(Doany 유지, notice와 Retry) |
| `settings-general` | 설정 General, Popo 선택 |
| `settings-general-failed` | General, Popo 저장 실패(Dori 유지), 그룹 위 notice와 Retry |
| `notice` | 캔버스 작업 안내, 다섯 버디의 화가 GIF와 각 accent 글로우 |

- 선택 카드: Cover Flow 한 줄이다(반사 없음). 카드(244px, 위아래 패딩 20px, 좌우 24px)마다 `card.png`(196px), 이름(semibold), 성격 한 줄(caption, 진한 글씨 `--text-standard`)이 있고 라디오 역할을 한다. 고른 카드는 가운데에서 정면을 보고, accent 아이콘 색 테두리 2px와 Home composer 글로우를 가진다(새 Accent place). 나머지는 50° 기울어 84% 크기로 양옆에 겹친다. 넘기는 입력은 세 가지다. 옆 카드를 클릭하거나, 그룹에 포커스가 있을 때 ←/→를 누르거나, 트랙패드를 두 손가락으로 가로 스와이프한다. 스와이프는 한 번에 한 칸만 넘긴다. 어느 입력이든 도착한 카드를 고르고 저장한다. 이전/다음 버튼은 두지 않는다. 옆 카드가 그 역할을 하고, hover하면 그림자가 짙어진다. 고르면 `--time-settle`·`--ease-enter`로 가운데로 이동하고, reduced motion에서는 바로 바뀐다. 설정 General은 정적이다. 버디마다 preference row 하나를 세로로 쌓는다. 행마다 `card.png`(48px, 글자와 12px 간격), 이름, 성격 한 줄(다른 설정 행과 같은 글자 스타일), 첫 실행의 라디오가 있다. 골라도 움직이지 않고 accent 테두리도 없다.
- 문구(Doan clarify preset 적용): 제목 "Choose your buddy", 설명 "It keeps you company in Doan and sets the app’s accent color. You can change it anytime in Settings." 설정 General의 설명 "Choices that apply across Doan on this Mac.", Buddy 그룹 설명 "Shown on Home and while an agent works. It also sets the accent color.", 저장 실패 "Couldn’t save your buddy. Your last saved buddy still applies."
- 성격 한 줄(영어, 196px 카드에서 두 줄 이내, 모두 성격을 말함): Doany "A painter in a beret who loves turning ideas into pictures."(시안에 없어서 새로 썼다. 확인 필요), Saemi "A curious walking companion who shares every fun find.", Dungdung "A music-loving mood maker who keeps things upbeat.", Popo "A whimsical bookworm who dreams up new games.", Dori "A quiet, caring friend to lean on when you’re tired."
- Home 슬롯은 Doany와 같은 자리에 그림만 바뀌므로 따로 그리지 않는다.
