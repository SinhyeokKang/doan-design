# 대형 캔버스 렌더링 안정화 설계

## 결정 경계

PRODUCT §3 Show와 §5 item 2의 표시 안정화 범위다. ARCHITECTURE §3은 sandbox iframe 바깥에서 확대·이동하고, 고정된 보드 폭으로 레이아웃하며, 새 src마다 iframe을 새로 만드는 규칙을 가진다. 이 구조를 바꿔야 한다는 근거는 아직 없다. PoC 결과가 기존 결정 변경을 요구하면 먼저 사용자에게 묻는다.

조사 대상은 `app/src/renderer/CanvasController.ts`, `canvasView.ts`, `viewport.ts`, `app/src/main/canvasScript.ts`와 iframe·보드 스타일이다. Export 비교에서만 문제가 생기면 viewer 경로를 별도로 추적한다. CPU·메모리·긴 레이아웃·합성 현상을 구별하며 화면 깨짐을 성능 숫자로 대체하지 않는다.

## PoC 선행 조건

사용자가 작업 시점에 원본 캔버스와 Export HTML을 제공한다. 원본의 CSS·이미지 등 의존 경로가 재현에 필요한지 확인한다. 자료가 없으면 구현을 시작하지 않는다. 원본은 수정하지 않고 `.scratch/`에 최소 재현과 전후 증거를 둔다. 실제 앱은 `app/runtime/` 격리·정리 지원을 사용한다.

## 순수 함수·형식·관례

`/tdd` 후보는 측정 viewport의 유효성 판정, 레이아웃 크기 수렴, 가시 영역·좌표 변환이다. 실제 원인이 해당 계산에 있을 때만 추출·수정한다. GPU 합성 문제라면 계산 함수를 억지로 만들지 않고 기존 좌표·수명 불변식의 회귀 테스트를 유지한다. 구체 `/tdd` 진입점은 PoC에서 고정한다.

공유 JSON Schema·버전·캔버스 관례·CLI·스킬 변경은 현재 계획하지 않는다. 필요한 경우 PoC 후 문서와 확인 질문에 반영한다. 신규 UI 흐름은 없으며 DESIGN.md의 기존 표시 기준을 사용한다.

## 회귀 예방 근거

- POSTMORTEM 2026-11-01 absolute frames: 높이가 0과 405px 사이를 반복한 문제다. 프레임 하단과 clipping ancestor를 무시하는 높이 축소를 되풀이하지 않는다.
- POSTMORTEM 2026-10-22 linked 100vh: “a value the canvas measures against something the renderer changes (viewport height, width, scale) must carry that input”. 이전 viewport의 측정이 새 레이아웃을 덮지 않게 한다.
- POSTMORTEM 2026-10-22 fresh-iframe: “add a structural assertion too”. 재로드 시 이전 iframe 분리를 동작 결과뿐 아니라 구조로 검증한다.

원인·해결·성능 개선은 아직 검증되지 않았다.
