# 작업 표시 렌더링 부하 줄이기 작업

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다.

1. [ ] **PoC: 기준선과 요소별 비용.** design.md 'PoC' 1–7을 한다. 결과(환경, 커밋, 조건·변형별 중앙값과 범위, 빠진 프레임 수, 레이어 수·GPU 메모리, 그라디언트 위험)를 아래 'PoC 결과'에 적고, 화면 baseline을 `.scratch/work-indicator-perf/baseline/`에 저장한다.
   - 확인: `node .scratch/work-indicator-perf/measure.mjs`(Playwright `_electron`, `app/runtime/` 격리, 빌드 산출물)가 두 조건의 수치를 출력하고 실제 사용자 상태 비교를 통과한다. probe가 띄운 `yes` PID가 끝난 뒤 모두 사라졌다.
   - 커밋 경계: 문서만(이 파일의 'PoC 결과').
2. [ ] **사용자 공유.** PoC 결과와 바꿀 순서를 사용자에게 보여준다. 진행을 위한 결정은 없다.
   - 확인: 공유한 결과 요약을 이 파일에 적었다.
3. [ ] **기존 테스트를 새 구조로.** `/tdd`로 먼저 바꾸고 red를 확인한다.
   - `CanvasController.test.ts` 'working-frame marker'의 마커 CSS 테스트(keyframes와 `::before`를 읽는 것)를 outline 링, 글로우 레이어 opacity, 그라디언트 레이어 transform 구조로 바꾼다.
   - 링크 1의 재로드 회귀 테스트 이름을 여기 적고, 새 구조에서도 통과해야 할 테스트로 둔다.
   - 순수 함수: 점 필드 알파 단계 묶기, 스트리밍 프레임 묶기. 기존 `dotField.test.ts`·`agentIndicator.test.ts` 값을 지킨다.
   - 확인: 새 테스트가 red, 기존 점 필드 값 테스트는 녹색.
   - 커밋 경계.
4. [ ] **점 필드 묶기.** 메인 스레드에서 알파 단계별로 묶어 그린다.
   - 확인: `npm --prefix app test` 녹색. probe에서 프레임당 `fill` 호출이 알파 단계 수 이하이고, 같은 `elapsed`의 픽셀이 baseline과 채널 차 2 이하다. 크기를 바꾼 직후 첫 프레임, 숨김 뒤 복귀의 elapsed, reduced motion 전환 시 정지 화면이 바꾸기 전과 같다.
   - 커밋 경계.
5. [ ] **점 필드 Worker.** 4번 뒤 Worker로 옮긴다. design.md '점 필드'의 Worker 절차를 따른다.
   - 확인: `npm --prefix app run build` 산출물로 띄운 앱에서 Worker가 뜨고 CSP 위반이 없다. `rendererImports.test.ts`가 Worker 진입점을 검사한다. 크기·DPR·색·테마·숨김·reduced motion·언마운트 각 전환 뒤 픽셀과 동작이 4번과 같다. 메인 스레드의 점 필드 스크립트 시간이 0에 가깝다.
   - 커밋 경계.
6. [ ] **마커 글로우와 그라디언트.** 링을 outline으로, 글로우를 opacity 레이어로, 그라디언트를 transform 레이어로 바꾼다. design.md '상태 규칙 옮기기'를 모두 옮긴다. 그라디언트가 큰 확대에서 drift를 내면 design.md의 대안을 쓰고, 그래도 남으면 그라디언트는 바꾸지 않고 그 비교를 'PoC 결과' 아래에 남긴다.
   - 확인: 3번 테스트 녹색. probe에서 다음을 baseline과 비교해 채널 차 2 이하:
     - 상태별 픽셀: working, still, reduced motion, reduced transparency, forced colours, 라이트·다크(에뮬레이션), 큰 확대, 슬라이드 중.
     - 3px 선 경계의 안티앨리어싱.
     - 같은 클래스의 일반 점프 하이라이트(페이드, 점).
     - 캡처 스냅샷에서 마커가 가려지는지.
   - 확인: 화면이 멈춘 상태에서 첫 프레임 뒤 마커의 Paint 이벤트가 0이다. 220ms 슬라이드와 확대·이동 중 지연 0, 문서에 없는 id나 크기 0인 프레임일 때 마커 없음이 유지된다. iframe 상단이 화면 밖일 때 재로드와 이전 viewport 측정(POSTMORTEM 2026-10-22, 2026-10-26)도 확인한다.
   - 커밋 경계.
7. [ ] **대화 패널 스트리밍 묶기.** delta 반영을 프레임당 한 번으로 묶고, 마지막 delta와 턴 종료는 즉시 반영한다.
   - 확인: `npm --prefix app test` 녹색. probe에서 40ms 간격 delta 스트림 동안 반영이 프레임당 한 번 이하이다. 턴 종료 직후 최종 텍스트가 같다. 스트리밍 캐럿 위치(POSTMORTEM 2026-11-07)가 바꾸기 전과 같다.
   - 커밋 경계.
8. [ ] **보드 글로우와 다시 그리기 격리.** 보드 글로우를 자기 합성 레이어에 두고, design.md '다시 그리기 격리'를 적용한다. 블러 자체는 바꾸지 않는다.
   - 확인: 6번과 같은 픽셀 비교. 알림 pill(작업, 터미널 세션, sibling), reduced transparency·forced colours의 pill, 대화 패널의 팝오버·포커스 링·그림자 잘림도 비교한다. 고부하 측정에서 대화 패널 갱신 때 보드 쪽 paint가 없다.
   - 커밋 경계.
9. [ ] **재측정.** 1번과 같은 조건으로 다시 측정한다. 메인 스레드 시간 중앙값, 빠진 프레임 수, 레이어 수·GPU 메모리를 바꾸기 전과 나란히 적는다. 빠진 프레임이 0이 아니거나 줄지 않은 요소가 있으면, drift 없이 쓸 수 있는 남은 수단을 찾아 추가하고 다시 잰다. 더 쓸 수단이 없으면 원인 후보와 측정을 적고 사용자에게 돌아온다.
   - 확인: `node .scratch/work-indicator-perf/measure.mjs` 결과 표와 녹화 프레임 수, `node .agents/skills/verify/scripts/verify.mjs` PASS.
10. [ ] **승격과 삭제.** DESIGN.md의 'Agent glow and dots'·'Working-frame marker' 행에 그리는 방식과 재측정값을 반영한다(rAF p95 17.6ms 등 기존 측정값은 새 값으로 바꾼다). Worker를 썼으면 ARCHITECTURE의 CSP·import 경계 항목에 적는다. PRODUCT는 동작이 바뀌지 않으므로 고치지 않는다. `docs/features/work-indicator-perf/`를 삭제한다.
    - 확인: 문서 diff 검토, `node .agents/skills/verify/scripts/verify.mjs` PASS.
    - 커밋 경계: 문서별 커밋.

## PoC 결과

(1번에서 작성)
