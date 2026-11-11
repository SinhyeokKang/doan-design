# docked 입력창 위의 버디 — 설계

## 기준

- **초안 확인**: 2026-11-11 사용자가 초안 수정본(`5e7d0e35`)을 그대로 확인했다. 대기 중 표면 이동 간격 60–120초와 hop 빈도(분당 약 23회, PoC 그대로)를 포함한다.

- 동작과 수치의 기준은 `.doan/canvases/buddy-docked-motion.html`(캔버스 id `buddy-docked-poc`)의 'IMPLEMENTATION HANDOFF' 주석과 `.doan/assets/buddies/docked-poc.js`이다.
- spec.md '결정'과 다른 부분은 tasks 1의 `/design-draft`에서 초안을 먼저 결정대로 고친다. 구현은 고친 초안을 따른다.
- 초안의 `buddy-docked-current.css`(렌더러 CSS 스냅샷), 미리보기 컨트롤, 더미 마크업은 앱에 넣지 않는다.

## 검수에서 나온 것

2026-11-11 디자인 검수(브라우저 렌더, 근거 `.scratch/buddy-docked-review/`)와 `/feature-review`에서 확인하고 이 설계에 반영한 것:

| 항목 | 확인 | 처리 |
|---|---|---|
| 큐 행이 들어올 때 버디가 약 0.6초 동안 행의 글자 위에 그려진다 | 실측(canvas-doany) | 큐 pill을 버디보다 위 레이어에 둔다 |
| 툴바의 버디가 picking·capture 안내 문구와 툴팁을 가린다 | 실측(안내 문구 마크업을 넣어 확인) | 결정 7 |
| 추천 프롬프트, 권한·질문 카드, 스레드 끝이 버디와 겹친다 | 코드(`.ov-scroll`·`.cp-scroll` `justify-content: flex-end`) | 결정 10 |
| 바닥 그림자 중심이 `walkX+26`으로 고정돼, Doany 말고는 발에서 약 2px 어긋난다 | 실측(다섯 버디) | 그림자 중심 공식(아래 '시간 모델') |
| 버디별 세로 오프셋이 CSS에 하드코딩돼 있다(`buddy-docked-poc.css`) | 코드 | 레지스트리에서 계산한다 |
| 대기 중 90초에 hop 31번, 표면 이동 6번 | 실측 | 결정 6 |
| 깜빡임 180ms | 코드 | 결정 2 |
| 셰이더를 문자열 치환으로 고치고 hop 모델이 새로 생겼다 | 코드 | 결정 8 |
| Puri 팔레트 블록의 `/*` 없는 주석 때문에 `--surface-comment`가 빠진다 | 실측 | 초안만의 문제다. tasks 1에서 고친다 |
| 버디에 클릭·키 핸들러가 남아 있지만 `pointer-events:none`이다 | 코드 | 옮기지 않는다(비목표) |
| 세 버디 프레임 노트가 "awaiting visual review"로 남아 있다 | 실측 | tasks 1에서 고친다 |

통과한 것:
- 다섯 버디 모두 쉬는 동안 발이 바닥에서 ±0.06px 안에 있다.
- hop 정점에서 그림자는 .41×.70, 투명도 .16이다.
- 액세서리는 정점과 아래를 보는 자세에서 56px 상자 안에 있다. 가장 빠듯한 것은 Dori로, 위 여백이 3px이다.
- 클립 창 위로 튀어나오는 것이 없다.
- `aria-hidden`과 `pointer-events:none`이 지켜진다.
- reduced motion에서 쉰다.

## 영향 범위

- **앱(렌더러)만.** CLI(Go), 스킬, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지, preferences는 바뀌지 않는다.
- 붙는 곳:
  - `DockedComposer.tsx`: 입력창 카드 위쪽 가장자리에 바닥 슬롯을 둔다. Project Overview(`ProjectOverview.tsx`)와 캔버스 대화 패널(`CanvasConversationPanel.tsx`)이 같은 컴포넌트를 쓴다. `ComposerCard`는 Home과 함께 쓰므로, 슬롯은 `DockedComposer`가 자식으로만 넘긴다.
  - `CanvasTools.tsx`: 툴바 위쪽 가장자리에 같은 바닥 슬롯을 둔다.
  - `App.tsx`: 버디 하나를 소유하고(아래 '소유와 생명주기'), 상태 기계 입력을 모아 넘긴다.
- 새 모듈(이름은 `/tdd`에서 정한다):
  - docked 코어(순수): 시간 모델과 표면·숨김 상태를 한 번에 진행한다
  - docked 셰이더 소스(순수)
  - 떠 있는 요소 겹침 판정(순수)
  - DOM·WebGL 셸. Home의 `Doany.tsx`는 고치지 않는다.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

시간과 난수는 인자로 받는다(핸드오프 'Pass time/randomness as inputs').

### 1. docked 코어

초안의 `tick`·`pose`·`beginMove`·`startTrip`·`advancePresence`는 같은 난수 흐름과 상태(`conceal`, `trip`, `nextMove`)를 함께 쓴다. 그래서 시간 모델과 상태 기계를 나누지 않는다. tasks 1에서 초안을 DOM 없는 코어와 얇은 미리보기 셸로 나누고, 코어에는 `advance(state, inputs, now, random)` 하나를 둔다. 이 `advance`가 시간과 표면 상태를 함께 진행한다.

**입력**:
- 표면 목록: 입력창 카드가 있고 입력을 받는지(결정 9), 툴바가 있는지
- 비켜줄 이유: 큐, 추천 프롬프트, 권한·질문 카드(결정 10)
- 패널이 접혔는지, 접히는 중인지
- 표면별로 겹치는 떠 있는 요소가 있는지
- 사람이 쉬는지
- 지금 표면이 보이는지
- 표면 폭
- reduced motion

**출력**: 현재 표면, 숨김 정도(0–1), 표면별 기억한 x, 단계(shown / hiding / waiting / revealing / hidden), 그리기용 pose(squash, lift, tilt, 액세서리, 시선, 눈), 그림자 변환.

**시간 모델**(초안 수치):
- hop: 짧은 hop은 8–12px로 2–3번 묶어 뛰고, 묶음마다 방향을 무작위로 정하며 경계에서 돈다. 묶음 뒤 2.8–5.2초 쉰다. 큰 hop은 처음 13–20초 뒤, 그다음 16–25초마다 뛴다.
- 단계 길이: 짧은 hop 140/280/220ms, 큰 hop 200/420/220ms. Puri는 템포가 ×1.12다.
- 수평 이동은 공중 단계에서만 smoothstep으로 한다.
- 시선: 입력 중 2.2초 동안 아래, 스레드 위 포인터 1.5초 동안 위를 본다. 시선이 몸보다 먼저 움직이고, 액세서리 스프링이 따라온다.
- 깜빡임: 420ms, 4–8초 간격(결정 2).
- 그림자:
  - 짧은 hop 정점 .55×.70, 큰 hop 정점 .40×.70, 정점 투명도 .16, 착지 .34. 숨김 정도를 곱한다.
  - 중심 x는 `56 × (.165 + .67 × contact[0])`이다. 셰이더의 x 변환 `(p.x-.5)*1.34`에 맞춘 값으로, Home 그림자 원점(`Doany.tsx`)과 같은 식이다.
  - 호스트의 세로 오프셋과 `transform-origin`도 같은 방식으로 `contact[1]`에서 계산한다. 그래서 버디별 CSS가 없다.

**표면 규칙**:
- 우선순위: 바닥 없음·표면 사라짐 > 겹치는 떠 있는 요소 > 비켜줄 이유 > 패널 접힘 > 대기 중 이동.
- 비켜줄 이유(결정 10):
  - 생기면 입력창을 떠난다. 툴바가 있으면 툴바로 가고, 없으면(Overview) 숨는다.
  - 큐 수처럼 이유의 내용만 바뀌면 그대로 있다. 툴바에 이미 서 있으면 숨지 않는다.
  - 이유가 끝나면 입력창의 기억한 x로 돌아온다.
- 패널 접힘(결정 4):
  - 접기가 시작되면 즉시 숨긴다(숨김 정도 1). 접히는 패널과 함께 버디가 화면을 가로질러 보이지 않게 하기 위해서다.
  - 다 숨으면 툴바로 옮긴다.
  - 펴면, 비켜줄 이유가 없을 때 입력창으로 돌아온다. 안무는 다른 표면 이동과 같다(무작위 숨기 변형, 대기, 엿보기).
- 겹치는 떠 있는 요소(결정 7):
  - 떠 있는 동안 숨는다.
  - 모두 닫히고 1초가 지나면 그때의 입력으로 다시 판단한다. 같은 표면이면 엿보기 없이 220ms에 올라온다.
  - 떠 있는 요소가 열린 표면은 이동 목표가 되지 않는다.
- 바닥 없음, 또는 지금 표면이 보이지 않거나 사라짐: 숨김 정도를 즉시 1로 하고, waiting 단계에서 표면을 바꾼다. 시간이 멈춰도 표면 이동이 멈추지 않게 하기 위해서다. 예외: 입력창 카드가 화면에 남은 채 입력만 받지 않게 되면 quick 숨기(240ms)로 내려간다.
- 대기 중 이동(결정 6):
  - 표면을 오가는 것은 다른 이유가 하나도 없고 사람이 쉬는 동안에만 일어난다. 스레드 위 포인터 이동은 시선만 바꾸고 쉼을 끝내지 않는다.
  - 간격의 기준은 60–120초이고, 최종 수치는 tasks 1의 초안 값이다.
  - Overview는 툴바가 없으므로 같은 입력창에서 숨었다가 나타난다.
- 숨기와 나타나기:
  - 숨기 변형은 세 가지다: quick 0/240ms, hesitant 180/360ms, soft 40/420ms. 52px 내려간다.
  - 다 내려가면 250–600ms 기다린다.
  - 나타날 때는 220ms 동안 12px 아래까지 올라와 120ms 멈췄다가, 220ms에 바닥까지 올라온다. 나타난 뒤 1.5초 지나서 다시 걷는다.
  - 결정 7로 다시 나타날 때만 엿보기 없이 220ms에 올라온다.
- 표면은 완전히 숨었을 때만 바꾼다. 떠나는 중이나 나타나는 중에 입력이 바뀌면 지금 숨김 정도에서 다시 목표를 잡는다. 아직 날지 않은 준비 동작은 취소한다. 공중에 있거나 착지 중인 hop은 끝까지 마친 뒤 숨는다.
- 표면별 x:
  - 툴바에 처음 가면 가운데에 선다. 그다음부터는 표면마다 기억한 x로 돌아온다.
  - 표면 폭이 줄면 x를 새 범위로 즉시 줄인다. 폭이 56px보다 작거나 0이면 그 표면은 바닥 없음으로 본다.
- 진입: 처음 마운트할 때는 숨기·나타나기 없이 지금 표면에 쉬는 자세로 선다.
- 보이지 않는 동안: 시간은 멈추지만, 표면과 숨김 변화는 reduced motion처럼 즉시 반영한다. 다시 보일 때 밀린 애니메이션을 재생하지 않는다. 다시 보인 직후 큰 `dt`는 지금처럼 0.035초로 자른다.
- reduced motion(결정 3, 완료 조건 7): Home의 `pose`처럼 숨쉬기, 깜빡임, 시선, hop, 이동이 모두 멈추고, 그림자도 정지한다. 표면과 숨김의 변화는 즉시 일어난다. 중간에 켜고 끌 때도 같다(초안의 `reduced` change 처리).

### 2. docked 셰이더 소스

- Home의 `vertexFor`·`fragmentFor` 템플릿에 초안의 발 접점 고정 두 줄(squash와 tilt를 `contact` 기준으로)을 더한 소스다.
- 다섯 버디 각각의 소스가 초안이 만드는 소스와 바이트 단위로 같다(결정 8). Home 셰이더는 그대로 둔다.
- 치환 anchor(`q += vec2(0.,.10-lift);`)가 정확히 한 번 나오지 않으면 예외를 던진다. 조용히 넘어가면 Home 셰이더가 그대로 컴파일되기 때문이다.

### 3. 떠 있는 요소 겹침 판정

- 입력은 버디의 56px 상자(지금 x, 다른 표면이면 그 표면에서 설 x)의 rect와 떠 있는 요소들의 rect 목록이고, 출력은 겹치는지 여부다. 클립 창 전체 폭으로 재면 Send·Presets 툴팁처럼 버디에서 멀리 뜬 것에도 숨으므로 버디 상자로 잰다.
- 셸은 프레임마다 DOM을 한 번 읽어 rect를 모은다. 대상은 다음 셋이다.
  - body로 portal된 `[data-radix-popper-content-wrapper]`
  - `.slash-popover`
  - `.doan-picking`
- 지금 effort·permission 메뉴와 툴팁은 상태를 밖으로 내놓지 않는다. 그래서 상태 대신 기하로 판정한다. 툴바 툴팁을 닫을 때 `data-state`를 읽는 `CanvasController.closeToolbarTooltip`이 선례다. 앞으로 생기는 팝오버도 따로 연결하지 않아도 잡힌다.
- 토스트, 문제 오버레이, 모달은 버디보다 위에 그리고, 숨기는 이유로 세지 않는다.

## 셸 (DOM·WebGL)

### 소유와 생명주기

- App이 workspace 화면에 버디 하나를 소유한다. 표면은 다음 셋이다.
  - 지금 캔버스 대화 패널의 입력창
  - 툴바
  - Overview 입력창
- `CanvasPane`과 `CanvasTools`는 Overview 아래에 남아 있다. 그래서 Overview가 열린 동안에는 툴바를 표면에서 뺀다. 그렇지 않으면 가려진 툴바 위에서 계속 그리고, WebGL 컨텍스트를 하나 더 쥔다.
- 캔버스를 바꿔도 버디는 남는다. workspace를 떠나면(`screen !== "workspace"`, 곧 Home·Settings·Add Projects) dispose하고 컨텍스트를 돌려준다.
- 시간은 소유자의 안정된 컨테이너로 게이트한다. 슬롯은 접히거나 사라지므로 게이트로 쓰지 않는다. 쓰는 신호는 다음과 같다.
  - `checkVisibility({ visibilityProperty: true, opacityProperty: true })`: 온보딩 오버레이는 다른 형제를 `opacity: 0`으로 가리므로 `opacityProperty`도 본다.
  - IntersectionObserver
  - `document.hidden`
  - reduced motion
- 텍스처가 실패하거나 컨텍스트를 잃으면 정지 이미지와 그림자를 쓴다. WebGL이 준비되기 전에는 정지 이미지를 보인다.
- 버디를 바꾸면 리그만 다시 만든다. 코어 상태(표면, 표면별 x, 숨김)는 리그 밖에 두고 그대로 이어 간다.
- 대화를 바꿔도 버디는 남는다. 입력은 보이는 대화의 것이다(결정 13).
- 버디가 쉬는 상태로 Overview에 숨어 있는 동안에는 입력이 바뀔 때까지 rAF를 멈춘다.

### 버디 하나와 슬롯 프로토콜

- 버디 하나에 리그 하나, 그림자 하나다. 버디 호스트(캔버스, 정지 이미지, 그림자, 클립 창)를 명령형 DOM 노드로 만들고, 표면 슬롯 사이에서 `append`로 옮긴다.
  - 캔버스는 노드를 옮겨도 WebGL 컨텍스트를 유지한다. React는 자기가 비워 두고 그리는 요소에 붙은 외부 자식을 건드리지 않는다.
- 슬롯은 callback ref로 소유자에게 등록한다. 등록과 해제는 여러 번 불러도 결과가 같아야 한다. StrictMode에서 React 19는 ref callback을 두 번 부른다.
- 슬롯이 떨어져 나가 ResizeObserver가 폭 0을 알리면 그 resize는 건너뛴다(`canvasSize(0)`).
- `.docked .composer-card`는 `display: grid`이므로 슬롯은 `position: absolute`다.
- Home의 셸은 다시 쓰지 않는다. `Doany.tsx`의 `surface()`는 Home의 `vertexFor`와 `drawnPose`에 묶여 있고, docked는 lift를 비율 없이 그리고 액세서리 기울기만 자른다. 그래서 docked 셸을 따로 둔다. 텍스처 로딩, 컨텍스트 반환 순서, 정지 이미지 처리는 Home과 같은 규칙을 따르되, `Doany.tsx`는 고치지 않는다.

### 레이어

- 클립 창은 표면 위쪽 가장자리 위로 88px이고, 버디만 자른다. 입력창, 글자, 팝오버, 툴바 컨트롤은 자르지 않는다.
- 큐 pill은 버디보다 위에 그린다. pill 사이 간격은 투명하므로, 버디는 pill 뒤에서만 가려진다.
- 새로 쌓는 레이어(z-index)는 portal 메뉴, 토스트, 오버레이, 모달보다 아래에 둔다(POSTMORTEM 2026-11-02 'Every Overview menu opened under the Overview itself').
- Capture area는 메인 창의 `capturePage`다(ARCHITECTURE §7). 캡처하는 동안에는 버디와 그림자를 감춘다. 캡처 모드의 안내 문구가 닫혀도 캡처가 끝날 때까지 감춘다(완료 조건 5). 방법은 이미 감추는 앱 표시와 같게 한다.

### 장식과 입력

- `aria-hidden="true"`이고 tabindex가 없다. 키 핸들러도 없다.
- 클릭(결정 14): 클립 창, 바닥, 그림자는 `pointer-events: none`이다. 호스트는 포인터가 버디 실루엣의 불투명한 픽셀 위에 있을 때만 `pointer-events: auto`, `cursor: pointer`가 된다. 실루엣은 정지 이미지의 알파로, 리그와 같은 16.5% padding으로 호스트에 맞춘다. hop의 들림(최대 약 7px)은 따로 따라가지 않는다. 그래서 투명한 가장자리와 버디 밖은 아래 스레드·보드가 클릭을 받는다. 판정은 버디가 완전히 보일 때(shown)만 한다.
- 클릭은 코어 입력 `poke`다. 버디가 보이고 trip이 없을 때만 받는다. 다른 표면이 `ok`면 그리로 가고, 아니면 같은 표면의 무작위 x에서 나타난다. 안무는 대기 중 이동과 같다. 클릭은 대기 중 이동 카운트를 다시 시작한다. 시간이 멈춘 동안(reduced motion, 보이지 않음)에는 옮겨 가는 것만 즉시 일어난다.
- 버디 몸 위로 떨어진 파일은 버디가 받지 않는다(드롭 핸들러 없음). 투명한 가장자리 위의 파일은 아래 요소가 받는다.
- 사람이 쉬는지(결정 6)는 다음을 보고 판단한다.
  - 이미 있는 Following의 쉼 판정: 화면 이동과 선택 변경
  - 입력창 입력
  - 스레드 스크롤
  - 창 포커스

  보드 위 포인터 이동은 샌드박스 iframe 안에서 일어나 렌더러가 보지 못하므로 쓰지 않는다(ARCHITECTURE §3 'Canvas presses').
- 스레드 끝 여백: 핸드오프대로 스레드 아래 padding을 24px에서 32px로 늘린다. docked 위 padding은 12px 그대로이고, 버디를 위해 docked 배경을 키우지 않는다.

## 형식 변경

없다. JSON Schema, 형식 버전 `v`, 공용 fixture를 바꾸지 않는다. golden은 테스트 fixture다.

## 규칙 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.
- ARCHITECTURE §7 'Buddy (mascot)'에 다음을 더한다.
  - docked 버디의 기준 초안(`docked-poc.js`의 코어)과 golden이 따로 있다(결정 8)
  - 소유와 dispose 시점, 슬롯 프로토콜, 기하로 판정하는 떠 있는 요소

  기존 문장 'motion-preview.js is the source of truth for all five buddies' shaders…'의 범위는 Home 리그로 좁힌다.
- `app/scripts/dockedBuddyGolden.mjs`를 더하므로, AGENTS.md 'Commands'에 한 줄을 더한다(`doanyGolden.mjs` 줄과 같은 꼴).

## 결정 영향

- PRODUCT에서 바뀌는 문장은 마지막 task에서 고친다.
  - §5 item 3 'Project Overview'의 "It shows no buddy"
  - §3 In scope 끝 문단의 "shows on Home and in the canvas working notice"
  - §5 item 0 'General'의 "applies to Home, the working notice and the accent"
  - §5 item 2 'Toolbar'의 캡처에서 빠지는 앱 표시 목록
- §3 Out of scope에는 걸리지 않는다. 버디는 렌더러 안의 장식이고, 에이전트를 깨우지 않는다(Out of scope 4).
- 프레임 점프와 Following의 가용 영역은 바꾸지 않는다(결정 12).
- 샌드박스 iframe, 서빙 범위, git 명령 같은 구조 결정은 건드리지 않는다.

## PoC 의존

- 다섯 버디의 발 접점, 그림자, 액세서리 범위, 숨기·나타나기는 초안에서 확인했다(위 검수).
- 확인하지 않은 것은 다음이다. 구현 뒤 `/design-sync`와 `/runtime-test`에서 확인하고, 그 전에 진행을 막는 PoC는 없다.
  - 실제 Electron에서의 프레임 속도와 GPU·메모리 비용
  - 실제 Radix 툴팁·팝오버 위치
  - 세 버디의 전체 창 툴바 이동
  - 작업 알림과 함께 보일 때의 모습
  - 카드 가장자리 focus ring이 버디의 발과 그림자에 가려지는지

## POSTMORTEM에서 가져온 함정

- **2026-11-02 'Every Overview menu opened under the Overview itself'**: 새 z-index 레이어는 portal 메뉴와 겹치는지 확인한다. runtime probe에서 그 화면의 portal 메뉴를 하나 이상 열어 스크린샷으로 판단한다. 버디 레이어와 클립 창이 여기에 해당한다.
- **2026-10-23 'Ancestor visibility treated as cumulative opacity'(2026-11-11 재발 포함)**: 가려졌는지를 조상의 `visibility`로 판단하지 않는다. 그리기를 멈출지는 안정된 컨테이너의 computed 상태로 정하고, 온보딩 오버레이처럼 `opacity`로 가리는 경우도 본다.
- **ARCHITECTURE §7 'Buddy (mascot)'**: 마운트마다 WebGL 컨텍스트를 돌려준다. 돌려주지 않으면 반복 방문 때 Chromium 컨텍스트 한도에 걸린다. StrictMode의 이중 마운트도 컨텍스트 하나로 끝나야 한다.

## 읽은 디자인 프리셋

- 문서 작성: shape, animate.
- 디자인 검수: critique, audit, animate.
- animate의 '일하는 화면에서 움직임은 피드백·상태·연속성을 위해 쓴다'는 기준을 결정 6·7의 근거로 썼다.
