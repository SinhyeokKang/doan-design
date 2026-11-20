# 프로토타입 창 헤더의 드래그 여백

프레임 캡슐 양옆에서 창을 잡기 쉽도록 현재 8px와 제안한 40px를 같은 640px 창에서 비교한다. 대화 패널을 닫은 앱 창을 그린다. 버튼 그룹의 위치와 내부 간격은 유지한다. 캡슐에 120px가 남는 창 너비 548px에서는 한 줄, 그보다 1px 좁은 547px에서는 두 줄로 그린다. 2단에서는 캡슐 양끝을 콘텐츠 패널과 같은 창 안쪽 8px에 맞춘다.

새 시안은 `.doan/canvases/prototype-header-spacing.html`, 캔버스 ID는 `prototype-header-spacing`이다. 첫 프레임 `comparison`에 640px 창 두 개를 위아래로 배치해 8px와 40px를 한눈에 비교한다. 나머지 프레임은 `last-single-row`와 `first-double-row`다. 기준은 [현재 헤더 실측](../../design/prototype.md)과 앱의 PrototypeWindow 및 헤더 CSS다.
