# 패널 헤더 페이드 — 작업

## 선행 검증과 드래프트

1. `/feature-review` 뒤 보드 PoC를 먼저 진행한다. 실제 iframe을 헤더 뒤로 보이게 하면서 논리 뷰포트, 클릭 영역, 캡처 및 `overflow: clip`을 보존하는지 본다. 임시 코드는 `.scratch/`에 둔다.
   - 확인: `npm --prefix app run build`로 빌드한 앱을 `app/runtime/` 격리 지원으로 띄워, 같은 입력에서 Fit과 선택 좌표, 헤더 클릭, 캡처가 기존과 일치하고 큰 보드가 잘리지 않는지 확인한다.
2. `/design-draft panel-header-fade`에서 `design.md`의 다섯 프레임을 그리고 사용자가 앱에서 확인한 페이드 길이·농도·범위를 기록한다.
   - 확인: `doan check --json --repo .`에 새 오류가 없고 `doan ls --json --repo .`에 지정된 캔버스와 프레임 5개가 잡힌다.
   - 커밋 경계: `docs(design): panel-header-fade draft`.

## 구현 1 — 대화·목록·인스펙터 헤더

3. `/tdd`로 고정 헤더, 콘텐츠가 통과할 때의 페이드와 접근성 대안, 헤더 밑에 가려진 포커스 대상의 처리를 고정한다. DOM 밖으로 꺼낼 계산이 있을 때 계산부터 테스트한다.
   - 확인: `npm --prefix app test`에서 새 검사가 변경 전 실패한다.
   - 커밋 경계: `test:`.
4. 오버뷰 대화·목록, 캔버스 인스펙터·대화, 프로토타입 대화의 헤더 5곳에 적용한다. 오버뷰 목록 헤더는 고정하고 대화 패널 두 창은 기존 공용 구조를 쓴다.
   - 확인: `npm --prefix app test`, `npm --prefix app run typecheck`를 통과한다.
   - 커밋 경계: `feat:`.
5. `/design-sync`와 `/runtime-test`로 헤더 높이, 페이드 경계와 접근성을 확인한다. 격리 앱에서 맨 위·중간·짧은 상태, 키보드 탐색, 실제 메뉴 열기, 스트리밍 중 따라가기, 답변 팝오버, 패널 접기와 크기 조절을 확인한다.
   - 확인: `node .scratch/design-sync/panel-header-fade/measure.mjs`에서 구현 1의 네 프레임이 드래프트와 맞고, 격리 앱의 스크린샷과 로그에 확인한 상태가 남는다.
   - 커밋 경계: 측정값과 드래프트 차이 기록.

## 구현 2 — 캔버스 보드 헤더

6. `/tdd`로 PoC에서 정한 좌표·클립 계약을 고정한다. 새 좌표 계산이 필요하면 순수 함수부터 테스트한다. Fit과 선택·캡처의 논리 영역, iframe 조상의 클립, 헤더 입력을 다룬다.
   - 확인: `npm --prefix app test`에서 새로 요구하는 보드 표시 계약 검사가 변경 전 실패하고 기존 입력·클립 검사는 유지된다.
   - 커밋 경계: `test:`.
7. 캔버스 보드 헤더에 적용하고 보드와 맞닿는 헤더의 페이드를 그린다. 프레임 표시, overlay와 agent notice, 캡처의 영역을 보존한다.
   - 확인: `npm --prefix app test`, `npm --prefix app run typecheck`를 통과한다.
   - 커밋 경계: `feat:`.
8. `/design-sync`와 `/runtime-test`로 `canvas-board`를 비교한다. 헤더 아래를 지나는 보드, Fit·100%에서 이동과 확대, Select·Hand·Pick, Tab, 메뉴, 작업 표시, 캡처, 패널 접기·펼치기, 투명도 줄이기와 강제 색상을 확인한다. 큰 캔버스의 클립은 보드 PoC에서 확보한 근거를 재사용하고 바뀐 경우만 다시 확인한다.
   - 확인: `node .scratch/design-sync/panel-header-fade/measure.mjs`에서 보드의 헤더 높이·페이드 경계가 드래프트와 맞고, 격리 앱의 캡처와 입력 결과가 변경 전 계약과 일치한다.
   - 커밋 경계: 측정값과 드래프트 차이 기록.

## 통합

9. 각 구현 묶음은 `/deliver`에서 리뷰와 최종 게이트를 거친다. 같은 파일을 수정할 수 있으므로 구현 1을 먼저 통합하고 구현 2에 반영한다.
   - 확인: 각 PR의 `node .agents/skills/verify/scripts/verify.mjs`와 GitHub `gate`가 통과한다.
10. 살아 있는 규칙을 영어로 옮긴다. `PRODUCT.md` §5에는 적용 표면, 헤더 아래 표시와 불투명 대안을 기록한다. `ARCHITECTURE.md` §3·§7에는 새로 생긴 비자명한 페인트·논리 뷰포트 경계와 재사용 규칙을 기록한다. `docs/design/project.md`, `canvas.md`, `prototype.md`에 실측을, 공통 토큰을 추가했다면 `docs/DESIGN.md`에 그 역할을 기록한다. `docs/features/panel-header-fade/`를 지운다.
   - 확인: `node .agents/skills/verify/scripts/verify.mjs`를 통과하고, 실측 문서에 여섯 헤더의 확인 범위가 있으며 지운 기능 문서를 가리키는 링크가 없다.
   - 커밋 경계: 제품·구조·실측 문서를 업데이트하고 기능 문서를 정리한다.
