# docked 입력창 위의 버디 — 작업

## 전달 경로

- task 1(초안)은 develop checkout에서 `/design-draft`로 하고, develop에 커밋해 push한다.
- task 2부터는 lead가 develop에서 `feat/buddy-docked-motion` 브랜치를 만들어 conductor에게 넘긴다(`/ship` 또는 `/orchestrate`). conductor는 push와 develop 대상 PR로 끝내고, 병합은 lead가 한다.
- 앱 코드 커밋 앞에서는 다음을 돌린다.
  - `npm --prefix app run typecheck`
  - `npm --prefix app run lint`
  - `npm --prefix app test`
  - `node app/scripts/doanyGolden.mjs --check`
  - task 2 이후에는 `node app/scripts/dockedBuddyGolden.mjs --check`도 함께 돌린다.

  예외: task 3의 `test:` 커밋은 red가 정상이다(`/tdd`).
- `.doan/`만 바꾸는 커밋과 문서만 바꾸는 커밋에는 위 게이트를 걸지 않는다.
- `/agent-eval`은 해당하지 않는다. CLI 출력, 가이드, `doan check`, 스킬 stub을 바꾸지 않는다.

## 작업

1. [ ] **초안을 결정대로 고친다(`/design-draft`, develop).** 새 파일을 만들지 않고 기존 `.doan/canvases/buddy-docked-motion.html`과 그 자산을 고친다. 캔버스 id `buddy-docked-poc`와 프레임·요소 id는 유지한다.
   - `docked-poc.js`를 DOM 없는 코어(`advance`, pose, 그림자)와 얇은 미리보기 셸로 나눈다. 코어가 받는 입력은 design.md '1. docked 코어'의 입력 목록이다.
   - 코어에 결정을 반영한다.
     - 깜빡임 420ms(결정 2)
     - 대기 중 이동 간격과 쉬는 조건(결정 6)
     - 겹치는 떠 있는 요소와 짧은 재등장(결정 7)
     - 패널을 접기 시작하면 즉시 숨고, 펴면 바로 돌아옴(결정 4)
     - 바닥 없음(결정 9)
     - 비켜줄 이유(결정 10)
     - 보이지 않는 동안 생긴 변화의 즉시 반영
     - 처음 진입할 때 쉬는 자세
   - 그림자 중심을 `56 × (.165 + .67 × contact[0])`로, 세로 오프셋과 `transform-origin`을 `contact[1]`에서 계산한다. 버디별 CSS 블록은 지운다.
   - 버디의 클릭·키 핸들러를 지운다.
   - CSS·마크업:
     - 큐 pill을 버디보다 위 레이어에 둔다.
     - Puri 팔레트 블록의 깨진 주석을 고친다.
     - 세 버디 프레임 노트의 "awaiting visual review"와 핸드오프의 열린 질문을 spec '결정'으로 바꾼다.
   - 미리보기 컨트롤을 더한다: picking 안내 문구, 툴팁 열기, 패널 접기·펴기, 추천 프롬프트, 권한 카드, 바닥 없음.
   - 확인:
     - `doan check --repo . --json`에 이 캔버스의 새 경고가 없다. `doan ls --repo . --json`에 캔버스가 나온다.
     - 독립 검수자가 시퀀스 스크린샷에서 다음을 확인한다: 큐 추가 때 겹침 없음, picking 안내 문구와 툴팁이 열린 동안 숨음, 패널을 접을 때 가로질러 보이지 않음, 다섯 버디의 그림자 중심 오차가 0.5px 이하.
     - 사용자가 앱에서 초안과 대기 중 이동 간격을 확인한다.
   - 커밋 경계: `.doan/` 초안만.
2. [ ] **docked golden 생성기.** `app/scripts/dockedBuddyGolden.mjs [--check]`를 더한다.
   - 1번 코어를 vm에서 돌려 golden JSON을 쓴다. `doanyGolden.mjs`처럼 `Math.random`과 시간을 고정한다. 미리보기 셸과 DOM은 싣지 않는다.
   - 시나리오:
     - 대기와 깜빡임, 입력, 스레드 포인터
     - 짧은 hop과 큰 hop
     - 큐 추가·비움, 추천 프롬프트, 권한 카드
     - 패널 접기·펴기, 겹치는 떠 있는 요소 열기·닫기, 바닥 없음
     - 대기 중 이동(쉼 있음·없음)
     - 보이지 않는 동안의 변화, 이동 중 reduced motion 켜고 끄기
     - 다섯 버디의 셰이더 소스
   - 생성기는 초안의 기본 셰이더 템플릿이 `motion-preview.js`의 것과 같은지, 치환 anchor가 정확히 한 번 나오는지 검사한다.
   - AGENTS.md 'Commands'에 이 명령을 한 줄 더한다.
   - 확인:
     - `node app/scripts/dockedBuddyGolden.mjs --check`가 0으로 끝난다.
     - 두 번 생성한 결과가 바이트 단위로 같다.
     - 초안 코어를 한 글자 바꾸면 `--check`가 1로 끝난다.
     - `node app/scripts/doanyGolden.mjs --check`가 0으로 끝난다(Home golden 그대로).
   - 커밋 경계: 생성기와 golden을 커밋하고, AGENTS.md 줄은 따로 커밋한다.
3. [ ] **순수 함수 테스트(`/tdd`).** design.md '순수 함수로 떼어낼 부분' 1–3의 인터페이스를 정하고 테스트를 먼저 쓴다.
   - docked 코어: golden의 모든 시나리오를 비트 단위로 비교한다. golden 밖의 경계 시나리오도 쓴다.
     - 숨기는 시간 안에 큐가 생겼다 사라짐: 표면이 바뀌지 않고 같은 x로 돌아온다.
     - 다른 표면의 떠 있는 요소는 지금 버디를 숨기지 않는다.
     - 우선순위의 각 쌍. 예: 떠 있는 요소가 닫히는 사이 큐가 생김, 큐가 있는 채로 패널을 접고 다시 폄.
     - 떠나는 중이나 나타나는 중에 입력이 바뀌어 목표를 다시 잡음
     - 아직 날지 않은 준비 동작 취소, 공중 hop은 마친 뒤 숨음
     - 툴바 첫 방문은 가운데
     - 표면 폭 축소, 폭이 56px 미만이거나 0
     - 서 있던 표면이 사라짐(떠나는 중, 나타나는 중)
     - Overview에서 대기 중 이동은 같은 입력창
     - 활동하면 쉬는 타이머가 다시 시작됨
     - 다시 보인 직후 큰 `dt`
   - 셰이더 소스: 다섯 버디 각각 golden 소스와 바이트 단위로 같다. anchor가 없거나 두 번 나오면 예외를 던진다.
   - 겹침 판정: 겹침, 맞닿음, 떨어짐, 빈 목록.
   - 확인: 새 테스트가 red다. 기존 `doanyMotion.test.ts`, `doanyRender.test.ts`, `Doany.test.tsx`는 녹색이다.
   - 커밋 경계: `test:` 커밋(red).
4. [ ] **순수 함수 구현(`/implement`).**
   - 확인: `npm --prefix app test` 녹색, 두 golden `--check`가 0으로 끝난다.
   - 커밋 경계.
5. [ ] **DOM·WebGL 셸.** 버디 호스트를 명령형 노드로 만들고, 슬롯을 옮겨도 리마운트하지 않는다. `Doany.tsx`는 고치지 않는다.
   - 확인: 가짜 WebGL·observer로 다음을 테스트하고, `npm --prefix app test`가 녹색이다.
     - 슬롯을 옮겨도 컨텍스트가 하나다.
     - 슬롯을 떼었다 다시 붙여도 새 컨텍스트를 만들지 않고 다시 붙는다.
     - StrictMode의 이중 effect와 ref callback 두 번 호출 뒤에도 컨텍스트는 하나다.
     - 슬롯 폭이 0이면 resize를 건너뛴다.
     - dispose에서 컨텍스트를 돌려준다.
     - 텍스처가 실패하거나 컨텍스트를 잃으면 정지 이미지다. 준비 전에도 정지 이미지다.
     - 안정된 컨테이너의 `checkVisibility`(opacity 포함)가 false면 시간이 멈추고, 그동안의 표면 변화는 즉시 반영된다.
     - 버디를 바꿔도 표면, 표면별 x, 숨김이 이어진다.
     - reduced motion에서 정지 프레임을 그리고, 표면 변화는 적용된다.
   - 커밋 경계.
6. [ ] **화면에 붙이기.** 다음을 연결한다.
   - `DockedComposer`와 `CanvasTools`의 바닥 슬롯
   - App 소유: workspace 화면에서만 살아 있고, Overview가 열린 동안에는 툴바를 표면에서 뺀다.
   - 상태 기계 입력:
     - 입력창이 입력을 받는지, 큐, 추천 프롬프트, 권한·질문 대기
     - 패널 접힘과 접히는 중
     - 떠 있는 요소의 rect
     - 쉬는지
     - 캡처하는 동안 감추기
   - 스레드 아래 padding 32px
   - 확인:
     - 컴포넌트 테스트가 실제 UI를 움직여 입력이 상태 기계에 닿는지 확인한다.
       - 큐 행 추가·제거
       - 새 대화 상태
       - 권한 요청 대기
       - 패널 접기·펴기
       - 입력과 스레드 스크롤로 쉬는 타이머 초기화
       - picking·capturing 안내 문구 켜기
       - 캔버스 상태: 사라짐, 목록에 없음, 같은 id
       - Overview 열기·닫기
     - CSS 규칙 테스트(`ds/controls.test.ts`와 같은 방식):
       - 큐 pill이 버디 바닥보다 위 z-index다.
       - 버디·클립 창·그림자가 `pointer-events: none`이다.
       - 슬롯이 `position: absolute`다.
       - 스레드 아래 padding이 32px다.
     - 정적 마크업 테스트: 버디가 `aria-hidden`이고 tabindex가 없다.
     - 기존 `DockedComposer*.test.tsx`, `CanvasTools.test.tsx`, `ProjectOverview*.test.tsx`가 녹색이다.
   - 커밋 경계.
7. [ ] **초안과 맞추기(`/design-sync`).** 1번 초안을 기준으로 computed style을 비교한다.
   - 다섯 버디의 발 접점, 그림자 중심
   - 클립 창
   - 스레드 끝 여백
   - 입력창과 툴바의 크기·히트 영역
   - 카드 가장자리 focus ring이 보이는지
   - 확인: 차이가 없거나 DESIGN.md에 기록돼 있고, 회귀를 막는 테스트를 더했다. 스레드 padding 24px를 적은 DESIGN.md 줄이 있으면 32px로 고쳤다.
   - 커밋 경계.
8. [ ] **실제 앱 확인(`/runtime-test`).** HOME, SHELL, 에이전트 디렉터리를 격리한 앱에서 확인한다. 7번에서 앱 코드가 바뀌었으면, 영향받는 항목은 그 뒤에 확인한다.
   - Overview와 캔버스 페이지의 다섯 버디
   - 큐 추가·비움: 캔버스는 툴바로, Overview는 숨음
   - 새 대화의 추천 프롬프트, 권한·질문 카드 대기
   - 큐가 다른 대화에만 있을 때 대화 바꾸기
   - 패널 접기·펴기와 폭 줄이기
   - 겹치는 떠 있는 요소가 열린 동안 숨기: picking 안내 문구, 모델 피커, 툴바 툴팁
   - Capture area PNG에 버디가 없음
   - 사라진 캔버스와 목록에 없는 캔버스에서 툴바에 섬
   - 문제 오버레이, 버디 화면, 첫 실행이 workspace를 덮는 동안 그리지 않음
   - 창 최소화 중 rAF 없음, 앱 창이 포커스를 잃으면 대기 중 이동 없음
   - 작업 알림과 함께 보일 때
   - reduced motion
   - Settings > General에서 버디 바꾸기
   - workspace↔Home 24번과 Overview↔캔버스 왕복 뒤 콘솔에 "Too many active WebGL contexts"가 없음
   - portal 메뉴를 하나 이상 열어 버디 레이어 아래에 깔리지 않는지 스크린샷으로 판단(POSTMORTEM 2026-11-02)
   - 확인: probe 스크린샷과 기록이 `.scratch/`에 있고, 항목마다 통과·실패를 이 파일에 적었다. 프레임 속도는 측정한 값만 적는다.
9. [ ] **리뷰와 게이트.** 다음 순서로 진행한다.
   - `/code-review`
   - 🔴가 있으면 `/refactor`
   - 버그를 고쳤으면 `/postmortem`
   - `node .agents/skills/verify/scripts/verify.mjs`
   - push와 develop 대상 PR
   - 확인: `verify: PASS`, exit 0이다. PR 본문에 확인하지 못한 항목을 적었다. `gh pr checks <n> --required`에 `gate`가 통과로 나온다.
10. [ ] **문서로 올리고 이 디렉터리 지우기.**
    - PRODUCT:
      - §3 In scope 끝 문단에 docked 입력창을 더한다.
      - §5 item 0 'General'에 docked 버디를 더한다.
      - §5 item 1 'Buddy'에 docked 버디 규칙을 적는다(결정 1–13 중 제품 규칙).
      - §5 item 2 'Toolbar'의 캡처에서 빠지는 앱 표시에 버디를 더한다.
      - §5 item 3 'Project Overview'의 "It shows no buddy"를 고친다.
    - ARCHITECTURE §7 'Buddy (mascot)': docked 초안·golden·소유·슬롯·겹침 판정을 더하고, 기존 'source of truth' 문장의 범위를 Home으로 좁힌다.
    - DESIGN.md: 측정값을 적는다. 측정하지 못한 프레임 속도와 GPU 비용은 확인하지 않은 항목으로 적는다.
    - README의 버디 설명에 docked 입력창을 더해야 하는지 확인한다.
    - 확인:
      - `grep -n "It shows no buddy" docs/PRODUCT.md`가 아무것도 내지 않는다.
      - `grep -n "docked" docs/PRODUCT.md`에 Buddy 규칙이 나온다.
      - `test ! -d docs/features/buddy-docked-motion`이 참이다.
    - 커밋 경계: 문서마다 따로 커밋한다.
