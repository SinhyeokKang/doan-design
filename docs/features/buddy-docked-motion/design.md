# docked 입력창 위의 버디 — 설계

## 기준

- 동작·수치의 기준은 `.doan/canvases/buddy-docked-motion.html`(캔버스 id `buddy-docked-poc`)의 'IMPLEMENTATION HANDOFF' 주석과 `.doan/assets/buddies/docked-poc.js`이다. spec.md '결정'과 다른 부분은 tasks 1의 `/design-draft`에서 초안을 먼저 결정대로 고친다. 구현은 고친 초안을 따른다.
- 초안의 `buddy-docked-current.css`(렌더러 CSS 스냅샷)와 미리보기 컨트롤, 더미 마크업은 앱에 넣지 않는다.

## 디자인 검수에서 나온 것

2026-11-11 독립 검수(브라우저 렌더, 근거 `.scratch/buddy-docked-review/`)에서 확인한 것 중 이 설계가 다루는 것:

| 항목 | 확인 | 처리 |
|---|---|---|
| 큐 행이 들어올 때 버디가 약 0.6초 동안 행의 글자 위에 그려진다 | 실측(canvas-doany) | 큐 행을 버디보다 위 레이어에 둔다. 버디는 행 뒤로 내려간다 |
| 도구패널의 버디가 Pick·Capture 안내 문구와 툴팁을 가린다 | 실측(안내 문구 마크업을 넣어 확인) | 결정 7: 떠 있는 요소가 있으면 숨는다 |
| 바닥 그림자 중심이 `walkX+26`으로 고정돼, Doany 말고는 발에서 약 2px 어긋난다 | 실측(다섯 버디) | 그림자 중심을 레지스트리 `contact[0] × 56`에 둔다 |
| 대기 중 90초에 hop 31번, 표면 이동 6번 | 실측 | 결정 6 |
| 깜빡임 180ms | 코드 | 결정 2 |
| 셰이더를 문자열 치환으로 고치고 hop 모델이 새로 생겼다 | 코드 | 결정 8 |
| Puri 팔레트 블록의 `/*` 없는 주석 때문에 `--surface-comment`가 빠진다 | 실측 | 초안만의 문제다. tasks 1에서 고친다 |
| 버디에 클릭·키 핸들러가 남아 있지만 `pointer-events:none`이다 | 코드 | 옮기지 않는다(비목표) |
| 세 버디 프레임 노트가 "awaiting visual review"로 남아 있다 | 실측 | tasks 1에서 고친다 |

통과한 것: 다섯 버디 모두 쉬는 동안 발이 바닥에서 ±0.06px 안에 있다. hop 정점에서 그림자는 .41×.70, 투명도 .16이다. 액세서리는 정점과 아래를 보는 자세에서 56px 상자 안에 있다(가장 빠듯한 것은 Dori, 위 여백 3px). 클립 창 위로 튀어나오는 것이 없다. `aria-hidden`과 `pointer-events:none`이 지켜진다. reduced motion에서 쉰다.

## 영향 범위

- **앱(렌더러)만.** CLI(Go), 스킬, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지, preferences는 바뀌지 않는다.
- 붙는 곳:
  - `DockedComposer.tsx`: 입력창 카드 위쪽 가장자리에 버디가 설 바닥 슬롯을 둔다. Project Overview(`ProjectOverview.tsx`)와 캔버스 대화 패널(`CanvasConversationPanel.tsx`)이 같은 컴포넌트를 쓴다.
  - `CanvasTools.tsx`: 도구패널 위쪽 가장자리에 같은 바닥 슬롯을 둔다.
  - 캔버스 페이지(`App.tsx`)와 Overview가 버디 하나를 소유하고, 두 표면 사이에서 옮긴다.
- 새 모듈(이름은 `/tdd`에서 정한다):
  - docked 시간 모델(순수)
  - 표면·숨김 상태 기계(순수)
  - docked 셰이더 소스(순수)
  - DOM·WebGL 셸

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

시간과 난수는 인자로 받는다(핸드오프 'Pass time/randomness as inputs').

1. **docked 시간 모델.** 초안 `docked-poc.js`의 `tick`·`pose`·`beginMove`에서 DOM을 뺀 것이다.
   - hop: 짧은 hop은 8–12px, 2–3번 묶음, 묶음마다 방향을 무작위로 정하고 경계에서 돈다. 묶음 뒤 2.8–5.2초 쉰다. 큰 hop은 처음 13–20초 뒤, 그다음 16–25초마다다. 단계별 길이(짧은 hop 140/280/220ms, 큰 hop 200/420/220ms)와 버디별 템포(Puri ×1.12)를 따르고, 수평 이동은 공중 단계에서만 smoothstep으로 한다.
   - 시선: 입력 2.2초 동안 아래, 스레드 위 포인터 1.5초 동안 위를 본다. 시선이 몸보다 먼저 움직이고, 액세서리 스프링이 따라온다.
   - 깜빡임: Home과 같은 420ms, 4–8초 간격(결정 2).
   - 그림자: hop 높이에 따른 크기와 투명도(짧은 hop 정점 .55×.70, 큰 hop .40×.70, 정점 투명도 .16, 착지 .34). 숨김 정도를 곱한다. 중심은 `contact[0] × 56`이다.
   - 기준: 새 golden 생성기가 초안을 vm에서 돌려 기록하고, 테스트가 비트 단위로 비교한다(`doanyMotion.test.ts`와 같은 방식). 결정 2·6으로 바꾼 값은 tasks 1에서 초안에 먼저 반영하므로 golden과 앱이 같다.
2. **표면·숨김 상태 기계.** 입력: 큐가 비었는지, 표면 목록(입력창, 도구패널이 있는지), 패널이 접혔는지, 떠 있는 요소가 있는지, reduced motion, 사람이 쉬는지, 시간, 난수. 출력: 현재 표면, 숨김 정도(0–1), 표면별 기억한 x, 단계(shown / hiding / waiting / revealing / hidden).
   - 우선순위: 떠 있는 요소 > 큐 > 패널 접힘 > 대기 중 이동.
   - 큐: 큐가 있으면 입력창을 떠난다. 도구패널이 있으면 도구패널로 가고, 없으면(Overview) 큐가 빌 때까지 숨는다. 큐 수가 바뀌어도 큐가 남아 있으면 그대로 있다. 도구패널에 이미 서 있으면 큐가 와도 숨지 않는다.
   - 패널 접힘(결정 4): 입력창이 없으므로 도구패널로 간다. 펴면 큐와 대기 중 이동 규칙을 다시 따른다.
   - 떠 있는 요소(결정 7): 지금 표면 위에 떠 있는 동안 숨고, 닫히면 같은 표면, 같은 x에서 나타난다. 표면을 바꾸지 않는다.
   - 대기 중 이동(결정 6): 큐가 없고, 떠 있는 요소가 없고, 사람이 쉬는 동안에만 일어난다. 간격 기준은 60–120초이고, 최종 수치는 tasks 1의 초안 값이다. Overview는 도구패널이 없으므로 같은 입력창에서 숨었다가 나타난다.
   - 숨기·나타나기: 숨기 변형 세 가지(quick 0/240ms, hesitant 180/360ms, soft 40/420ms)로 52px 내려가고, 250–600ms 기다리고, 220ms 동안 12px 아래까지 올라와 120ms 멈췄다가 220ms에 바닥까지 올라온다. 나타난 뒤 1.5초 지나서 다시 걷는다.
   - 표면은 완전히 숨었을 때만 바꾼다. 떠나는 중이나 나타나는 중에 상태가 바뀌면 지금 숨김 정도에서 다시 목표를 잡는다. 아직 날지 않은 준비 동작은 취소하고, 공중에 있거나 착지 중인 hop은 끝까지 마친 뒤 숨는다.
   - 표면별 x: 도구패널에 처음 가면 가운데에 선다. 그다음부터는 표면마다 기억한 x로 돌아온다. 표면 폭이 줄면 x를 새 범위로 바로 줄인다.
   - reduced motion: 이동·hop·대기 중 이동이 없고, 위 규칙에 따른 표면과 숨김 변화는 즉시 일어난다.
3. **docked 셰이더 소스.** Home의 `vertexFor`·`fragmentFor` 템플릿에 초안의 발 접점 고정 두 줄(squash와 tilt를 `contact` 기준으로)을 더한 소스다. 다섯 버디 각각의 소스가 초안이 만드는 소스와 바이트 단위로 같다(결정 8). Home 셰이더는 그대로 둔다.

## 셸 (DOM·WebGL)

- **버디 하나, 리그 하나, 그림자 하나.** 버디 호스트(캔버스, 정지 이미지, 그림자, 클립 창)를 명령형 DOM 노드로 만들고 표면 슬롯 사이에서 `append`로 옮긴다. React가 다시 마운트하면 WebGL 컨텍스트를 잃으므로 표면이 바뀌어도 리마운트하지 않는다. 슬롯은 `DockedComposer`와 `CanvasTools`가 내놓는 빈 요소다.
- **레이어.**
  - 클립 창은 표면 위쪽 가장자리 위로 88px이고, 버디만 자른다. 입력창, 글자, 팝오버, 도구 컨트롤은 자르지 않는다.
  - 큐 행은 버디보다 위에 그린다.
  - 새로 쌓는 레이어(z-index)는 portal 메뉴 아래에 있어야 한다(POSTMORTEM 2026-11-02 'Every Overview menu opened under the Overview itself').
- **떠 있는 요소 감지.** 다음 상태를 상태 기계 입력 하나로 모은다. 같은 화면에 이미 있는 상태를 읽고, 새 전역 상태를 만들지 않는다.
  - 도구패널: picking·capturing 안내 문구, 도구 툴팁
  - 입력창: 모델·effort·permission 피커, 프리셋·`/` 목록, 첨부 메뉴, 툴팁
- **장식.** `aria-hidden="true"`, `pointer-events: none`이고 tabindex가 없다. 클릭·키 핸들러는 없다.
- **생명주기.**
  - 기존 Home 리그 규칙을 그대로 따른다(ARCHITECTURE 'Buddy (mascot)'). 시간은 `checkVisibility({ visibilityProperty: true })`, IntersectionObserver, `document.hidden`, reduced motion으로 막는다. 관찰 대상은 가려지는 스프라이트가 아니라 보이는 컨테이너다(핸드오프: 스프라이트를 관찰하면 숨는 도중 루프가 멈춘다). dispose에서 컨텍스트를 돌려준다. 텍스처가 실패하거나 컨텍스트를 잃으면 정지 이미지를 쓴다.
  - 버디를 바꾸면 `key`로 리마운트하고, 지금 상태 기계가 정한 표면에서 시작한다.
  - 대화를 바꾸면 버디는 남는다. 큐 입력은 보이는 대화의 큐를 따른다.
  - 화면을 떠나면(다른 캔버스, Home, Settings) dispose한다.
- **스레드 끝 여백.** 핸드오프대로 스레드 아래 padding을 24px에서 32px로 늘린다. docked 위 padding은 12px 그대로이고, 버디를 위해 docked 배경을 키우지 않는다.

## 형식 변경

없다. JSON Schema, 형식 버전 `v`, 공용 fixture를 바꾸지 않는다.

## 규칙 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.
- ARCHITECTURE 'Buddy (mascot)'에 docked 버디의 기준 초안(`docked-poc.js`)과 golden이 따로 있다는 것을 더한다(결정 8). 기존 문장 'motion-preview.js is the source of truth for all five buddies' shaders…'는 Home 리그에 대한 것으로 범위를 좁힌다.
- `app/scripts/`에 docked golden 생성기를 더하면, 그 명령을 AGENTS.md 'Commands'에 한 줄 더한다(`doanyGolden.mjs` 줄과 같은 꼴).

## 결정 영향

- PRODUCT §5 item 3 'Project Overview'의 "It shows no buddy"가 바뀐다. 마지막 task에서 고친다. §3 Out of scope에는 걸리지 않는다.
- PRODUCT §3 In scope 끝 문단의 "shows on Home and in the canvas working notice"에 docked 입력창이 더해진다.
- 샌드박스 iframe, 서빙 범위, git 명령, 자율 깨우기 같은 구조 결정은 건드리지 않는다. 버디는 렌더러 안의 장식이다.

## PoC 의존

- 다섯 버디의 발 접점, 그림자, 액세서리 범위, 숨기·나타나기는 초안에서 확인했다(위 검수).
- 확인하지 않은 것은 실제 Electron에서의 프레임 속도, GPU·메모리 비용, 실제 Radix 툴팁·팝오버 위치, 세 버디의 전체 창 도구패널 이동, 작업 알림과 함께 보일 때의 모습이다. 구현 뒤 `/runtime-test`와 `/design-sync`에서 확인하고, 그 전에 진행을 막는 PoC는 없다.

## POSTMORTEM에서 가져온 함정

- **2026-11-02 'Every Overview menu opened under the Overview itself'**: 새 z-index 레이어는 portal 메뉴와 겹치는지 확인하고, runtime probe에서 그 화면의 portal 메뉴를 하나 이상 열어 스크린샷으로 판단한다. 버디 레이어와 클립 창이 여기에 해당한다.
- **2026-10-23 'Ancestor visibility treated as cumulative opacity'(2026-11-11 재발 포함)**: 가려짐을 조상 `visibility`로 판단하지 않는다. 그리는 것을 멈출지는 보이는 컨테이너의 computed 상태(`checkVisibility`)로 정한다.
- ARCHITECTURE 'Buddy (mascot)': 마운트마다 WebGL 컨텍스트를 돌려준다. 돌려주지 않으면 반복 방문 때 Chromium 컨텍스트 한도에 걸린다. docked 버디는 캔버스를 오갈 때마다 마운트되므로 같은 검사를 한다.

## 읽은 디자인 프리셋

shape, animate(문서 작성), critique, audit, animate(디자인 검수). animate의 '일하는 화면에서 움직임은 피드백·상태·연속성을 위해 쓴다'는 기준을 결정 6·7(대기 중 이동 간격, 떠 있는 요소가 있으면 숨기)의 근거로 썼다.
