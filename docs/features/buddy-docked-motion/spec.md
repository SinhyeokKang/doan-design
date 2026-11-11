# docked 입력창 위의 버디

## 사용자

앱에서 Project Overview와 캔버스 대화 패널의 docked 입력창으로 에이전트와 대화하는 사람이다. 에이전트(CLI·스킬)가 받는 것은 없다.

## 문제

- 고른 버디는 Home, 첫 실행의 Buddy 단계·버디 화면, Settings > General, 캔버스 작업 알림에만 나온다(PRODUCT §3 In scope 끝 문단, §5 item 1 'Buddy'). 사람이 가장 오래 머무는 대화 화면(Project Overview, 캔버스 대화 패널)에는 버디가 없다. PRODUCT §5 item 3 'Project Overview'는 "It shows no buddy"라고 정해 두었다.
- 디자인 PoC `.doan/canvases/buddy-docked-motion.html`(캔버스 id `buddy-docked-poc`)에서 56px 버디가 docked 입력창 카드 위쪽 가장자리를 바닥 삼아 짧게 뛰고, 가끔 숨었다가 캔버스 도구패널 위에서 다시 나타나는 동작을 사용자가 승인했다. 승인한 수치와 상태 우선순위는 그 캔버스 맨 위 HTML 주석 'IMPLEMENTATION HANDOFF'에 있다. 앱 코드에는 아직 없다.

## 결정

사용자가 이 기능을 준비하며 정한 것이다. PoC 핸드오프와 다르면 이쪽이 우선한다.

1. **다섯 버디 모두.** Doany, Puri, Dungdung, Popo, Dori 모두 같은 동작을 한다. 화면은 버디별로 갈라지지 않는다(ARCHITECTURE 'Buddy (mascot)').
2. **깜빡임은 Home과 같다.** 4–8초마다 420ms. PoC의 180ms는 의도하지 않은 차이로 보고 바로잡는다.
3. **끄는 설정은 없다.** reduced motion에서는 움직이지 않는 것으로 충분하다.
4. **패널을 접으면 도구패널로 간다.** 캔버스 페이지에서 대화 패널을 접으면 버디는 숨었다가 도구패널에서 나타난다. 패널을 펴면 입력창 규칙을 다시 따른다.
5. **작업 알림과 함께 보인다.** 캔버스 작업 알림의 버디(PRODUCT §5 item 2 'Agent indicator')와 docked 버디가 동시에 보여도 된다. 작업 알림 규칙은 바꾸지 않는다.
6. **대기 중 표면 이동은 간격을 늘려 남긴다.** 캔버스 페이지에서 가만히 있을 때 입력창과 도구패널을 오가는 간격을 PoC의 10–18초보다 크게 늘린다(기준 60–120초). 사람이 보드에서 포인터를 움직이거나 입력하는 동안에는 오가지 않는다. 정확한 수치는 `/design-draft`에서 초안에 반영하고 사용자가 확인한다.
7. **떠 있는 요소가 있으면 숨는다.** 버디가 서 있는 표면 위에 안내 문구(Pick from canvas, Capture area), 툴팁, 팝오버, 메뉴가 떠 있는 동안 버디는 내려가 있고, 닫히면 같은 자리에서 다시 나타난다.
8. **docked 초안을 따로 둔다.** docked 버디의 셰이더와 시간 모델은 `.doan/assets/buddies/docked-poc.js`를 기준 초안으로 삼고 golden을 따로 둔다. Home의 리그, 초안(`motion-preview.js`), golden(`doany.golden.json`)은 건드리지 않는다.

## 완료 조건

1. Project Overview와 캔버스 대화 패널의 docked 입력창 카드 위쪽 가장자리에 고른 버디가 56px로 서 있다. 다섯 버디 모두 발이 카드 가장자리에 닿고, 바닥 그림자가 발 아래에 있다(`/design-sync` 측정).
2. 버디는 PoC 핸드오프의 걸음(8–12px 짧은 hop 2–3번, 2.8–5.2초 쉼, 가끔 큰 hop), 시선(입력 중 2.2초 아래, 스레드 위 포인터 1.5초 위), 숨기·나타나기 수치를 따르고, 깜빡임은 420ms다. 순수 함수 테스트가 docked 초안의 값과 비트 단위로 같다(결정 2·6에 따라 바꾼 값 제외).
3. 큐가 생기면 버디가 입력창에서 내려간다. 캔버스 페이지에서는 도구패널에서 나타나고, Overview에서는 큐가 빌 때까지 숨어 있다. 큐가 비면 입력창의 기억한 위치로 돌아온다. 버디가 내려가는 동안 큐 행의 글자를 가리지 않는다.
4. 결정 4·6·7이 실제 앱에서 동작한다(패널 접기, 대기 중 이동 간격과 쉬는 조건, 안내 문구·툴팁·팝오버·메뉴가 떠 있는 동안 숨기).
5. 버디는 장식이다. 포인터 이벤트를 받지 않고, 키보드 순서에 없고, 스크린리더에 읽히지 않는다. 입력창과 도구패널의 컨트롤, 크기, 히트 영역은 바뀌지 않는다.
6. reduced motion에서는 공간 이동, hop, 대기 중 이동이 없다. 큐·패널·떠 있는 요소에 따른 위치 변화는 즉시 일어난다.
7. WebGL이나 텍스처가 실패하면 정지 이미지와 그림자가 바닥에 선다. 화면에 보이지 않거나 창이 가려지면 그리지 않는다. 화면을 떠나면 WebGL 컨텍스트를 돌려준다(반복 방문해도 Chromium 컨텍스트 한도 경고가 없다).
8. 버디를 바꾸면 docked 버디도 바로 바뀐다.
9. PRODUCT §5 item 1 'Buddy'와 item 3 'Project Overview', ARCHITECTURE 'Buddy (mascot)', DESIGN.md에 현재 규칙이 적혀 있고 이 디렉터리는 지워졌다.

## 비목표

- Home 버디, 첫 실행, Settings, 작업 알림의 버디는 바꾸지 않는다.
- 버디를 클릭하거나 키로 뛰게 하지 않는다(Home의 "Make <name> hop"은 docked에 없다).
- 버디를 끄는 설정, 새 preferences 키, CLI·스키마·소켓 변경은 없다.
- 큐 행을 타고 올라가지 않는다. 버디는 보이는 채로 표면 사이를 날아가지 않는다.
- PoC의 미리보기 컨트롤(Walk, Jump, Pause, Add queue 등)과 `buddy-docked-current.css` 스냅샷은 앱에 넣지 않는다.
