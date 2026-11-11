# docked 입력창 위의 버디 — 작업

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다. 원격 push는 사용자가 말할 때까지 하지 않는다.

1. [ ] **초안을 결정대로 고친다(`/design-draft`).** 새 파일이 아니라 기존 `.doan/canvases/buddy-docked-motion.html`과 그 자산을 고친다. 캔버스 id `buddy-docked-poc`와 프레임·요소 id는 유지한다.
   - `docked-poc.js`:
     - 깜빡임을 420ms로 바꾼다(결정 2).
     - 대기 중 이동 간격을 늘리고, 사람이 쉬는 동안에만 오가게 한다(결정 6). 보드 위 포인터와 입력이 쉬는 상태를 깬다.
     - 떠 있는 요소가 있으면 숨는다(결정 7). 캔버스 프레임에 picking 안내 문구 토글을 미리보기 컨트롤로 더해 보여준다.
     - 그림자 중심을 `contact[0] × 56`에 둔다.
     - 클릭·키 핸들러를 지운다.
   - CSS·마크업:
     - 큐 행을 버디 위 레이어에 둔다.
     - Puri 팔레트 블록의 깨진 주석을 고친다.
     - 세 버디 프레임 노트의 "awaiting visual review"와 핸드오프의 열린 질문을 이 문서의 결정으로 바꾼다.
     - 패널을 접은 상태를 보여줄 미리보기 컨트롤을 더한다(결정 4).
   - 핸드오프 주석을 spec.md '결정'과 맞춘다.
   - 확인: `doan check --repo . --json`에 이 캔버스의 새 경고가 없고, `doan ls --repo . --json`에 캔버스가 나온다. 독립 검수자가 큐 추가, picking 안내 문구, 패널 접기 시퀀스 스크린샷에서 겹침이 없음을 확인한다. 사용자가 앱에서 초안을 확인한다.
   - 커밋 경계: `.doan/` 초안만.
2. [ ] **docked golden 생성기.** `app/scripts/`에 1번 초안의 시간 모델과 다섯 버디의 셰이더 소스를 vm에서 돌려 golden JSON을 쓰는 생성기를 더한다(`doanyGolden.mjs`와 같은 꼴, `--check` 포함). AGENTS.md 'Commands'에 그 명령을 한 줄 더한다.
   - 확인: 새 명령의 `--check`가 0으로 끝난다(명령은 이 task에서 정한다). `node app/scripts/doanyGolden.mjs --check`도 0으로 끝난다(Home golden 그대로).
   - 커밋 경계: 생성기와 golden, AGENTS.md 줄은 따로 커밋한다.
3. [ ] **순수 함수 테스트(`/tdd`).** design.md '순수 함수로 떼어낼 부분' 1–3의 인터페이스를 정하고 테스트를 먼저 쓴다.
   - 시간 모델: golden과 비트 단위로 비교한다. hop 묶음, 쉼, 큰 hop 일정, 깜빡임 420ms, 그림자 크기·투명도·중심.
   - 상태 기계 시나리오:
     - 큐 처음 생김: 캔버스는 도구패널, Overview는 숨김
     - 큐 수 변화, 큐 비움 뒤 기억한 x로 복귀
     - 떠나는 중이나 나타나는 중에 상태가 바뀌어 목표를 다시 잡음
     - 아직 날지 않은 준비 동작 취소, 공중 hop은 마친 뒤 숨김
     - 패널 접기·펴기
     - 떠 있는 요소 열기·닫기(같은 표면, 같은 x)
     - 대기 중 이동이 사람이 쉬는 동안에만 일어남
     - 도구패널 첫 방문은 가운데
     - 표면 폭 축소
     - reduced motion에서 즉시 반영
   - 셰이더 소스: 다섯 버디 각각 golden 소스와 바이트 단위로 같다.
   - 확인: 새 테스트가 red다. 기존 `doanyMotion.test.ts`, `doanyRender.test.ts`, `Doany.test.tsx`는 녹색이다.
   - 커밋 경계.
4. [ ] **순수 함수 구현(`/implement`).**
   - 확인: `npm --prefix app test` 녹색.
   - 커밋 경계.
5. [ ] **DOM·WebGL 셸.**
   - 버디 호스트를 명령형 노드로 만들고, 슬롯 사이에서 옮겨도 리마운트하지 않는다.
   - Home의 텍스처·컨텍스트·정지 이미지·가시성 규칙을 재사용한다(ARCHITECTURE 'Buddy (mascot)').
   - 확인:
     - 가짜 WebGL·observer로 다음을 테스트한다: 슬롯을 옮겨도 컨텍스트가 하나다, dispose에서 컨텍스트를 돌려준다, 텍스처 실패나 컨텍스트 손실이면 정지 이미지다, `checkVisibility`가 false면 시간이 멈춘다.
     - `npm --prefix app test` 녹색.
   - 커밋 경계.
6. [ ] **화면에 붙이기.**
   - `DockedComposer`와 `CanvasTools`에 바닥 슬롯을 둔다.
   - 캔버스 페이지와 Overview가 버디를 소유한다.
   - 큐, 패널 접힘, 떠 있는 요소, 사람이 쉬는지를 입력으로 넘긴다.
   - 스레드 아래 padding을 32px로 늘린다.
   - 확인:
     - 컴포넌트 테스트: 버디가 `aria-hidden`이고 tabindex가 없고 `pointer-events: none`이다. 입력창과 도구패널의 컨트롤 순서와 크기가 그대로다. 큐 행이 버디보다 위 레이어다.
     - 기존 `DockedComposer*.test.tsx`, `CanvasTools.test.tsx`, `ProjectOverview*.test.tsx`가 녹색이다.
   - 커밋 경계.
7. [ ] **실제 앱 확인(`/runtime-test`).** 격리한 앱에서 확인한다.
   - Overview와 캔버스 페이지의 다섯 버디
   - 큐 추가·비움, 패널 접기·펴기
   - picking 안내 문구, 모델 피커, 도구 툴팁이 떠 있는 동안 숨기
   - 작업 알림과 함께 보일 때
   - reduced motion
   - 버디 바꾸기
   - 캔버스 24번 왕복 뒤 WebGL 컨텍스트 경고 없음
   - portal 메뉴를 하나 이상 열어 버디 레이어 아래에 깔리지 않는지 스크린샷으로 판단(POSTMORTEM 2026-11-02)
   - 확인: probe 스크린샷과 기록이 `.scratch/`에 있고, 각 항목의 통과·실패가 이 파일에 적혀 있다. 프레임 속도는 측정한 값만 적는다.
8. [ ] **초안과 맞추기(`/design-sync`).** 1번 초안을 기준으로 발 접점, 그림자, 클립 창, 스레드 끝 여백, 입력창·도구패널 크기를 computed style로 비교한다.
   - 확인: 차이가 없거나, 차이가 DESIGN.md에 기록돼 있다. 회귀를 막는 테스트를 더했다.
   - 커밋 경계.
9. [ ] **문서로 올리고 이 디렉터리 지우기.**
   - PRODUCT §3 In scope 끝 문단: 버디가 나오는 곳에 docked 입력창을 더한다.
   - PRODUCT §5 item 1 'Buddy': docked 버디 규칙(표면, 큐, 패널 접힘, 떠 있는 요소, 대기 중 이동, reduced motion, 장식)을 적는다.
   - PRODUCT §5 item 3 'Project Overview': "It shows no buddy"를 고친다.
   - ARCHITECTURE 'Buddy (mascot)': docked 초안·golden·셸 규칙을 더하고 기존 'source of truth' 문장의 범위를 좁힌다.
   - DESIGN.md: 측정값을 적는다.
   - 확인: 고친 문장이 구현과 맞는지 grep으로 대조했다. `docs/features/buddy-docked-motion/`가 없다.
   - 커밋 경계: 문서마다 따로 커밋한다.
