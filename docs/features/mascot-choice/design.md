# 마스코트 선택 — design

## 영향받는 곳

- **app (renderer)**: `Doany.tsx`·`doanyRig.ts`(리그 수치를 마스코트별로 받음), `CanvasAgent.tsx` `DoanyArtist`, `HomeComposerView.tsx`, `Onboarding.tsx`·`onboardingScene.ts`(Mascot 장면), `settingsSections.ts`·Settings 페이지(General 카테고리), `tokens.css`·`styles.css`·`ds/controls.css`(accent 램프와 역할), `ds/checks.ts`(violet 검사를 accent 검사로 일반화), `public/`(에셋).
- **app (main/preload)**: `preferences.ts`(`mascot` 필드), 첫 페인트 전에 마스코트 id를 전달하는 경로.
- **CLI·스킬·소켓**: 바뀌지 않는다.
- **에셋**: `.doan/assets/mascots/<id>/`(원본)와 `app/src/renderer/public/mascots/<id>/`(앱 사본).
- **캔버스**: `.doan/canvases/mascot-family.html`(에셋 확인), `/design-draft`에서 Mascot 단계와 설정 화면 초안.

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

마스코트 하나의 에셋 세트(친구 4명 모두 같은 파일 이름):

```
.doan/assets/mascots/<id>/          원본 (Doany는 기존 .doan/assets/doany/ 를 그대로 둔다)
  draft.png        시안 원본(데스크톱 doan-family, 흰 배경) 사본. 투명 에셋이 나오기 전 캔버스가 쓴다
  still.png        1254² RGBA, 투명 배경, 정지 이미지
  body.png         1254² RGBA, still과 같은 좌표, 눈과 소품을 지우고 가려진 몸통을 복원
  accessory.png    1254² RGBA, still과 같은 좌표, 소품만
  artist.gif       512², 그림 그리는 작업 안내 애니메이션(사람이 제작)
  artist-rest.png  512², artist.gif 첫 프레임
  prompts.json     정지 이미지·레이어·artist 생성 프롬프트(layer-prompts.json 형식)
  README.md        출처, 리그 수치, artist 소스 박스, 검증 결과

app/src/renderer/public/mascots/<id>/   앱 사본
  still.png  body.png  accessory.png   (원본과 같은 바이트)
  artist.gif  artist-rest.png          (소스 박스로 자르고 128²로 줄인 것, Doany와 같은 방법)
```

- Doany의 앱 사본도 같은 경로와 이름으로 옮긴다(`public/mascots/doany/still.png`, `body.png`, `accessory.png`). 그래야 코드가 id 하나로 모든 마스코트를 읽는다. Doany만 작업 안내 변형이 3종이다(`artist-painting.gif`, `artist-typing.gif`, `artist-reading.gif`와 각 `-rest.png`).
- Doany 원본(`.doan/assets/doany/`)은 V1 기록까지 함께 있어서 옮기지 않는다.
- 몸통 레이어와 소품 레이어 하나, 그리고 셰이더가 그리는 눈이라는 구조는 네 친구에게도 그대로 맞는다. 안경(peach)은 소품 레이어가 눈 위에 그려지므로 렌즈 안에서 눈이 깜박인다. 목도리(sky)와 헤드폰(yellow)은 몸통 앞을 감싸는 소품이라, 흔들림 범위를 마스코트별 리그 수치로 줄인다(아래).
- 용량: Doany 이미지 3장은 3.9 MB다. 친구 4명을 같은 1254² 크기로 넣으면 앱이 약 16 MB 커진다. 리그 좌표는 크기와 무관한 UV라 해상도를 낮춰도 수치는 그대로다. 1단계 마지막에 크기를 재고, 줄일지는 그 결과를 보고 사람에게 묻는다(tasks 1.6).

## 마스코트 레지스트리

`app/src/renderer/mascots.ts`(순수 모듈) 하나가 마스코트 목록의 출처다.

- `MascotId = "doany" | "mint" | "yellow" | "peach" | "sky"`, 표시 순서는 이 순서다.
- 마스코트마다 이름, 성격 한 줄, 에셋 경로, 리그 수치, 작업 안내 변형 목록을 둔다.
- `parseMascotId(value)`: 알 수 없는 값은 `doany`로 읽는다.
- 이후 Overview, AppShell 등 새 위치에서도 이 레지스트리와 저장된 설정만 읽는다. 마스코트별로 분기하는 코드를 화면에 흩어 두지 않는다.

## 리그 일반화

`Doany.tsx` 셰이더의 상수를 uniform으로 바꾸고, 값은 레지스트리의 리그 수치로 채운다.

- 수치: 눈 중심 2개와 반지름(`.421,.550`·`.619,.550`·`.035,.056`), 몸통 pivot(`.5,.60`), 소품 pivot(`.67,.30`), scale `1.34`, 중립 오프셋 `.10`, 폴백 padding `16.5%`, 소품 기울기 범위(`BERET_TILT`), 홉 높이 배율(`LIFT_SCALE`).
- Doany의 수치는 지금 값 그대로 둔다. `doany.golden.json` 비교와 rest 프레임 일치가 깨지면 안 된다. uniform으로 바꾸면 WebGL 호출 trace가 달라지므로, golden은 셰이더 출력과 rest 프레임 기준으로 다시 확인하고, 바뀐 trace는 커밋 메시지에 기록한다.
- 친구의 소품 기울기 범위와 홉 headroom은 `doanyRender.test.ts`와 같은 방식으로 정한다. 모든 누름 순서에서 캔버스 가장자리와 1.4 device px 이상 떨어져야 한다.
- 컴포넌트 이름 `Doany`는 `Mascot`으로 바꾸고 `mascot` prop을 받는다. 접근성 이름은 "Make <이름> hop"이다.

## accent 동적 변경

토큰 3층(palette → role → legacy, DESIGN.md 'Three colour layers')은 유지하고, palette와 role 사이에 전환층 하나를 둔다.

- **palette**: `--violet-*` 옆에 친구 램프 4개(`--mint-*`, `--yellow-*`, `--peach-*`, `--sky-*`)를 추가한다. 각각 1–12단계와 pressed, link 값을 둔다. 만드는 방법은 violet과 같다(DESIGN.md 'Accent ramp': 참조 12단계 밝은 램프의 단계별 OKLCH 명도·채도 비율, 마스코트 색의 hue, 색역은 채도를 낮춰 맞춤). hue는 시안 정지 이미지의 몸통 색에서 잰다.
- **전환층**: `--accent-1`…`--accent-12`, `--accent-pressed`, `--accent-link`, `--accent-icon`. `:root`는 violet을 가리키고, `:root[data-mascot="mint"]` 등이 각 램프로 덮어쓴다. role(`--affordance-accent`, `--surface-accent-subtle`, `--text-accent-subtle`, `--surface-comment` 등)은 `--violet-*` 대신 `--accent-*`를 읽는다. `styles.css`가 `--violet-5`를 직접 읽는 곳(`.ob-atmosphere::before`)도 `--accent-5`로 바꾼다.
- **아이콘 단계**: 새 role `--text-accent`(= `--accent-icon`)를 둔다. 흰 패널 위 accent 아이콘, 점, 외곽선이 이 role을 읽는다. 대상은 Fast 아이콘, 추천 프롬프트 아이콘과 화살표, 사이드바 permission·unseen 점, Show conversation 점, 프리셋 아이콘, 드롭 외곽선이다. `--accent-icon`은 9단계부터 어두운 쪽으로 가며 `--surface-panel` 대비 3:1을 처음 넘는 단계다. violet은 9단계다.
- **Send**: `--text-on-accent`를 중립 검정으로 바꾼다(모든 마스코트). 대비는 3:1 이상이다(violet 9 위 검정 약 4.0:1).
- **적용**: renderer가 `<html data-mascot="<id>">`를 설정한다. Doany는 속성이 없다. `@theme inline`이 accent를 shadcn 이름에 연결하지 않는다는 규칙(ARCHITECTURE §'ds')은 violet에서 accent 전체로 넓힌다.
- **검사**: `ds/checks.ts`의 violet 추적(`violetNames`, `accentPlaces`)을 `--accent-*`와 모든 마스코트 palette로 넓힌다. `contrastPairs`는 램프마다 칩 글자(3 위 11단계, 4.5:1), 아이콘 단계(패널 위 3:1), Send 아이콘(9 위 검정, 3:1)을 검사한다.
- 캔버스 초안은 `tokens.css`를 직접 링크하고 `data-mascot`이 없으므로 지금처럼 violet이다.

## 설정과 첫 페인트

- `preferences.json`에 `mascot` 필드를 추가한다. 키가 없으면 `doany`다. `v`는 1을 유지한다. 알 수 없는 id(더 새로운 빌드가 저장한 값)는 그 필드만 `doany`로 읽는다. 원래 규칙은 '값이 틀린 필드 하나가 파일 전체를 broken으로 만든다'이지만, `permissionMode`와 같은 예외로 둔다. 쓰기 요청(`PreferencesPatch`)은 알려진 id만 받는다.
- 이전 빌드는 이 필드를 모르므로, 그 빌드가 다음에 쓸 때 필드가 사라질 수 있다. 다운그레이드에서만 생기는 일이라 받아들인다.
- 첫 페인트: main은 시작할 때 preferences를 동기적으로 읽는다(ARCHITECTURE §7 'Preferences'). 창을 만들 때 마스코트 id를 렌더러에 넘기고, 렌더러는 React를 마운트하기 전에 `data-mascot`을 설정한다. 넘기는 방법은 preload `additionalArguments`를 권한다. 확정은 `/tdd`에서 한다.
- 설정을 바꿀 때: Home과 Settings는 렌더러 하나를 공유하므로(변경 이벤트 없음, ARCHITECTURE §7 'Preferences'), 저장 응답의 스냅샷으로 `data-mascot`과 마스코트 상태를 바로 갱신한다. 저장에 실패하면 응답 스냅샷(마지막 저장값)으로 되돌린다.

## 첫 실행 Mascot 단계

- `Scene`에 `"mascot"`을 추가한다. Welcome의 Get started는 Mascot으로 간다. Mascot의 Continue는 Agent로 간다. 스텝퍼는 3단계다(Mascot · Agent · Project). 완료한 단계는 체크 표시가 붙고 다시 돌아갈 수 있다.
- 고르면 즉시 저장하고 accent도 즉시 바뀐다. Continue는 항상 누를 수 있다(Doany가 기본값이다).
- 첫 실행을 다시 시작하면 Welcome부터 시작하고, Welcome에는 저장된 마스코트가 나온다.
- 선택지 UI는 선택 카드 5장이다(그림, 이름, 선택한 마스코트의 성격 한 줄). Mascot 단계와 설정 General에서 같은 컴포넌트를 쓴다. 키보드로는 라디오 그룹처럼 동작한다. 레이아웃은 `/design-draft`에서 정한다.
- 포커스와 모달: 이 단계도 기존 wizard `<dialog>` 안에 있다. POSTMORTEM 2026-10-24('The onboarding wizard lost keys and clicks to focus and modal stacking')를 따른다. 키는 window에서 처리하고, 컨트롤이 비활성화될 때 포커스가 `<body>`로 빠진다고 가정한다. 이 단계에는 비동기 작업이 저장 하나뿐이다. 저장 중에도 선택지를 비활성화하지 않고 마지막 선택을 저장한다.

## 설정 General 카테고리

- `SettingsSection`에 `"general"`을 추가한다. 순서는 General, Agents, MCP Connectors, Notifications, About이다. 설정을 처음 열 때 보여주는 카테고리는 지금처럼 Agents다(PRODUCT §5 item 0 'Settings page').
- General에는 지금 Mascot 그룹 하나만 있다. 내용은 첫 실행과 같은 선택 카드 컴포넌트다. 저장에 실패하면 Notifications와 같은 방식으로 알린다.

## 작업 안내

`DoanyArtist`를 `MascotArtist`로 바꾼다. 레지스트리에서 고른 마스코트의 변형 목록을 읽는다. Doany는 3종 중 무작위로 고르고, 친구는 1종이다. 안내가 떠 있는 동안 고른 변형을 유지하는 규칙은 그대로다. 안내가 떠 있는 동안 마스코트가 바뀌면 다음 안내부터 반영한다. 정지 프레임(대기, 숨김, reduced motion) 규칙도 그대로다.

## 순수 함수로 분리할 것 (`/tdd` 대상)

- `mascots.ts`: `parseMascotId`, 레지스트리 조회(에셋 경로, 리그 수치, 작업 안내 변형), `pickArtist(id, random)`.
- `preferences.ts`: `mascot` 읽기(키 없음, 알 수 없는 id, 잘못된 타입)와 patch 검증.
- `onboardingScene.ts`: `mascot` 장면 전이(Welcome → Mascot → Agent, 뒤로 가기, 재시작 시 Welcome).
- `settingsSections.ts`: `general` 카테고리 파싱과 표시.
- 램프 검증: `accentIconStep(ramp, panel)`(3:1을 처음 넘는 단계), 램프 생성 방법으로 `tokens.css` 값을 다시 계산해 일치를 확인하는 함수.
- `ds/checks.ts`: accent 추적 일반화, 램프별 `contrastPairs`.
- `Doany.tsx`의 `drawnPose`: 마스코트별 기울기 범위와 홉 배율.

## 형식 변경

- `preferences.json`에 `mascot` 필드를 추가하고 `v`는 1을 유지한다. TS만 읽는 파일이라 `preferences.test.ts`가 스키마다(ARCHITECTURE §7 'Preferences'). `schema/`의 JSON Schema, CLI 응답, `runtime.json`, 소켓 메시지는 바뀌지 않는다.

## 규칙(conventions) 영향

- 캔버스 규칙과 `doan check` 규칙은 바뀌지 않는다.
- 디자인 시스템 규칙이 바뀐다. 'violet만 Accent places에서 읽는다'가 '마스코트 accent만 Accent places에서 읽는다'로 바뀌고, accent 위 아이콘 잉크는 중립 검정이 되며, 흰 패널 위 accent 아이콘은 아이콘 단계를 쓴다. DESIGN.md를 고친다.

## 결정 영향

- PRODUCT §5 item 1 'Doany'(마스코트는 Pebble 하나)를 '고른 마스코트, 기본 Doany'로 바꾼다.
- PRODUCT §5 item 0 'First run'(Welcome → Agent → Project → Home)에 Mascot 단계를 넣는다.
- PRODUCT §5 item 0 'Settings page'의 카테고리 목록에 General(Mascot)을 넣는다.
- PRODUCT §5 'Agent indicator'(Doany at work: painting, typing, reading)를 고른 마스코트 기준으로 바꾼다.
- ARCHITECTURE §7 'Doany (mascot)', 'Preferences', ds 규칙과 DESIGN.md 'Accent ramp'·'Accent places'·Home Send를 고친다.
- ARCHITECTURE의 구조 결정(서빙 범위, sandbox iframe, 토큰, git 명령 등)은 건드리지 않는다.

## PoC 의존

- **레이어 추출**: image_gen으로 같은 좌표의 몸통·소품 레이어를 만드는 방법은 Doany에서만 확인했다. 소품이 몸통 앞을 감싸는 경우(목도리, 헤드폰)는 확인하지 않았다.
- 마스코트 하나(mint)로 먼저 확인한 뒤 나머지 셋을 만든다(tasks 1.5).

## 제작 방식

- 사람이 준 것: 시안 정지 이미지 4장(흰 배경)과 친구별 artist GIF 4개(`sprout_`, `headphones_`, `glasses_`, `scarf_painting.gif`, 512²). 원본은 `/Users/sinhyeok/Desktop/doan-family/`에 있다.
- Claude(lead)가 먼저 하는 일: 에셋 구조를 만들고 받은 파일을 넣는다. accent 램프와 대비 캔버스, 화면 초안 캔버스(Mascot 단계, 설정, Home·Welcome, 작업 안내)를 그린다. 초안은 시안 이미지와 받은 GIF를 그대로 쓴다. 흰 배경은 밝은 면 위에서 `mix-blend-mode: multiply`로 가린다.
- Codex 워커가 이어서 하는 일: 투명 정지 이미지, 몸통·소품 레이어, 리그 수치를 만든다(image_gen). 결과는 같은 경로에 넣으므로 캔버스는 고치지 않아도 된다. 사용자가 이 기능의 에셋 제작에 한해 모델 계열을 넘나들도록 허락했다(AGENTS.md 'Worker model boundary').
- Claude는 Codex 결과의 좌표·정렬을 검수하고 캔버스가 투명 에셋을 읽도록 바꾼다. 사람이 캔버스에서 확인한다.
- 시안 정지 이미지의 형태와 질감은 바꾸지 않는다. 배경을 투명하게 만들고 레이어로 나누는 것만 한다. 생성 과정에서 형태가 바뀌면 그 차이를 캔버스에 표시하고 사람에게 묻는다.

## 디자인 preset

`doan design-skill --json`으로 preset 목록만 확인했다. UI 문구와 레이아웃을 정하는 `/design-draft` 단계에서 `shape`, `clarify`, `critique`를 읽는다.
