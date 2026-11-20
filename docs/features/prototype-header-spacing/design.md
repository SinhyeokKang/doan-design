# 프로토타입 창 헤더의 드래그 여백

프레임 캡슐 양옆에서 창을 잡기 쉽도록 현재 8px와 제안한 32px를 같은 640px 창에서 비교한다. 대화 패널을 닫은 앱 창을 그린다. 버튼 그룹의 위치와 내부 간격은 유지한다. 캡슐에 80px가 남는 창 너비 492px에서는 한 줄, 그보다 1px 좁은 491px에서는 두 줄로 그린다. 사용자가 확인할 시안이며 아직 구현 수치를 확정하지 않았다.

새 시안은 `.doan/canvases/prototype-header-spacing.html`, 캔버스 ID는 `prototype-header-spacing`이다. 첫 프레임 `comparison`에 640px 창 두 개를 위아래로 배치해 8px와 32px를 한눈에 비교한다. 나머지 프레임은 `last-single-row`와 `first-double-row`다. 기준은 [현재 헤더 실측](../../design/prototype.md)과 앱의 PrototypeWindow 및 헤더 CSS다.
