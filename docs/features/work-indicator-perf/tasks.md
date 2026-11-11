# 작업 표시 렌더링 부하 줄이기 작업

1. [ ] **PoC: 요소별 비용 측정.** design.md 'PoC'대로 격리 앱에서 부하 없음과 CPU 부하 조건으로 측정하고, 요소를 하나씩 끈 변형을 비교한다. 고부하 녹화로 레이어 누락 재현 여부를 본다. 결과(환경, 커밋, 요소별 프레임당 메인 스레드 시간, 누락 프레임, 렌더러 CPU)를 이 파일 아래 'PoC 결과'에 적는다.
   - 확인: `node .scratch/work-indicator-perf/measure.mjs`(Playwright `_electron`, `app/runtime/` 격리)가 두 조건의 수치를 출력하고 실제 사용자 상태 비교를 통과한다. CPU 부하는 probe가 코어 수만큼 `yes > /dev/null`을 띄우고 측정 끝에 모두 종료한다(사용자 확인). 종료 뒤 남은 `yes` 프로세스가 없음을 확인한다.
   - 커밋 경계: 문서만(이 파일의 'PoC 결과').
2. [ ] **사용자 확인.** PoC 결과로 바꿀 요소와 순서를 사용자에게 확인받고 이 파일에 기록한다. 블러, 화면이 달라지는 점 필드 방식, 대화 패널 스트리밍 묶기 추가 여부는 여기서만 정한다.
   - 확인: 기록된 사용자 답.
3. [ ] **순수 함수.** 점 필드 한 프레임 계산(`dotFrame`)을 `/tdd`로 고정하고 기존 `dotField.test.ts` 값을 지킨다. 마커 애니메이션 값 함수는 CSS만으로 끝나지 않을 때만 만든다.
   - 확인: `npm --prefix app test` 녹색.
   - 커밋 경계.
4. [ ] **마커.** 글로우를 opacity 레이어로, 그라디언트를 transform 레이어로 바꾼다. still, reduced motion, reduced transparency, forced colours 규칙을 옮긴다.
   - 확인: `npm --prefix app test`(`CanvasController.test.ts` 'working-frame marker', B2 재로드 테스트 포함) 녹색, `/runtime-test` probe에서 computed style·픽셀 비교가 바꾸기 전과 같고 작업 중 마커의 paint가 첫 프레임 뒤 0이다.
   - 커밋 경계.
5. [ ] **점 필드.** 2번에서 정한 방식으로 바꾼다. 기본은 `OffscreenCanvas`와 Worker이고, 표시 전환·크기 변경·창 숨김·reduced motion 동작은 그대로다.
   - 확인: `npm --prefix app test` 녹색, `/runtime-test` probe에서 점 필드 픽셀 샘플이 바꾸기 전과 같은 시점에 같고, 메인 스레드의 점 필드 스크립트 시간이 0에 가깝다.
   - 커밋 경계.
6. [ ] **그 밖의 요소.** 2번에서 정한 경우에만 보드 글로우, 블러, 대화 패널 스트리밍 묶기를 바꾼다.
   - 확인: 4번과 같은 비교.
   - 커밋 경계.
7. [ ] **재측정.** 1번과 같은 조건으로 다시 측정하고 고부하 녹화에서 레이어 누락이 사라졌는지 본다. 남으면 원인 후보와 측정을 적고 사용자에게 돌아온다.
   - 확인: `node .scratch/work-indicator-perf/measure.mjs` 수치 비교와 녹화, `node .agents/skills/verify/scripts/verify.mjs` PASS.
8. [ ] **승격과 삭제.** DESIGN.md 'Agent glow and dots'·'Working-frame marker'에 그리는 방식과 측정값을 반영하고, ARCHITECTURE에 Worker 사용 같은 구조 규칙이 생기면 적는다. PRODUCT는 동작이 바뀌지 않으면 고치지 않는다. BACKLOG의 관련 항목을 지우고 `docs/features/work-indicator-perf/`를 삭제한다.
   - 확인: 문서 diff 검토, `node .agents/skills/verify/scripts/verify.mjs` PASS.
   - 커밋 경계: 문서별 커밋.

## PoC 결과

(1번에서 작성)
