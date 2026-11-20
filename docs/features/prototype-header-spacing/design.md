# 프로토타입 창 헤더의 드래그 여백

이 시안을 앱 프로토타입 창 헤더의 구현 기준으로 확정했다. 1단에서는 프레임 캡슐과 양쪽 버튼 그룹 사이에 각각 40px의 드래그 여백을 둔다. 버튼 그룹의 위치와 내부 간격은 유지한다. 캡슐에 120px 이상 남으면 한 줄을 유지하고, 그보다 좁으면 캡슐을 둘째 줄로 내린다. 2단 캡슐은 좌우에 8px를 남겨 아래 콘텐츠 패널과 양끝을 맞춘다.

대화 패널을 닫은 시안에서 창 너비 548px는 캡슐이 정확히 120px인 마지막 1단이고, 547px는 첫 2단이다. 대화 패널을 열었을 때도 헤더에 실제로 남은 너비로 판정한다.

새 시안은 `.doan/canvases/prototype-header-spacing.html`, 캔버스 ID는 `prototype-header-spacing`이다. 첫 프레임 `comparison`에 640px 창 두 개를 위아래로 배치해 8px와 40px를 한눈에 비교한다. 나머지 프레임은 `last-single-row`와 `first-double-row`다. 기준은 [현재 헤더 실측](../../design/prototype.md)과 앱의 PrototypeWindow 및 헤더 CSS다.
