# 단일 프레임 프로토타입 설계

## 범위와 결정 영향

PRODUCT §3 Show를 단일 프레임 실행으로 확장한다. 사람은 HTML을 편집하지 않으므로 Out of scope Drawing·Simultaneous human/agent file editing에 해당하지 않는다. 에이전트가 그린 HTML과 표시를 읽는다. ARCHITECTURE §3의 제공 범위·opaque sandbox·창 내비게이션 제한을 유지한다.

대상은 Electron 창 관리·`canvasFrame.ts`·캔버스 제공/주입, renderer의 `CanvasController.ts`, `CanvasTools.tsx`, `CanvasHeader.tsx`와 프레임 목록, Go 캔버스 파싱·검사·가이드다. 기존 `CanvasController.drawMarks`의 크기 버블은 화면 좌표에 있고 캔버스 DOM 밖에 있다. 재생 버튼도 이 경계를 유지한다. 클릭이 선택·보드 드래그로 전달되지 않도록 별도 포커스와 hit target을 둔다.

## PoC가 먼저 정할 구현 계약

지원 표시는 에이전트의 명시적 opt-in이다. 구체 속성 이름·값·프레임 크기 표현·스크립트 초기화 계약은 PoC 후 확정한다. 전체 문서의 CSS·스크립트를 보존하며 단일 프레임을 viewport에 놓는 방법과, 프레임을 추출하는 방법을 비교한다. DOM 조상 selector, body에 붙는 모달, document 조회, fixed 요소, 폰트, 상대 자산 경로, 반응형 media query, 중첩 프레임을 검증한다. 단순 DOM 복사로 이벤트가 보존된다고 가정하지 않는다.

일반 프레임은 기존 규칙대로 렌더링한다. 새 지원 계약을 만족하지 못하는 프레임은 표시하지 않는다. PoC로 확인하지 못한 구성은 지원한다고 문서화하지 않는다. 지원 조건이 사용자 요구를 줄여야 하면 결정 질문으로 돌린다.

## 순수 함수와 수명

- 프레임 표시·유효성·현재 선택 → 실행 가능 여부와 비활성 이유.
- 창 상태·대상 식별자·새 목록 → 재사용/재로드/대상 소실/복구 전이.
- 요청 출처·루트·캔버스·프레임 → 실행 허용 판정.
- viewport 크기 → 초기 창의 화면 내 배치와 콘텐츠 크기.

창은 하나이며 문서 교체 시 기존 실행 상태를 버린다. 대상 소실 시 오래된 DOM을 실행하지 않는다. 프로젝트 제거·캔버스 ID 충돌·목록 실패도 정상 프레임으로 대체하지 않는다. 메인 창 종료 시 보조 창도 정리한다. 새 창에서 임의 IPC·파일 접근이 가능해지지 않도록 sender와 제공 범위를 검사한다.

## 형식과 관례

새 지원 표시는 ARCHITECTURE §1의 선택적 프레임 관례가 된다. Go parser·`doan check`·가이드·프레임 목록과 앱의 runtime frame 판정이 같은 계약을 사용해야 한다. 기존 캔버스의 필수 속성은 늘리지 않는다. 구체 공유 schema와 `v` 변경 여부는 PoC에서 출력 전달 경로를 정한 뒤 고정하며, TS·Go 공통 fixture를 먼저 만든다. 앱 내부 IPC만으로 충분하면 소켓 버전을 올리지 않는다. 이 항목이 닫히기 전 `/tdd` 구현에 들어가지 않는다.

## UI와 회귀 예방

DESIGN.md의 도구 바·프레임 서랍·버블 토큰을 확장한다. 프리셋은 설치된 Doan 0.1.3 `shape`를 읽었다. 서랍은 단일 이동 액션을 유지하며, 도구 바와 버블만 재생한다. 첫 구현은 `/design-draft` 사용자 확인과 `/design-sync`를 거친다.

- POSTMORTEM 2026-10-22 linked 100vh의 “must carry that input” 규칙에 따라 viewport 측정 세대를 검증한다.
- POSTMORTEM 2026-10-22 dead board의 “write the e2e step for the document that never sends it” 교훈을 짧은 실제 앱 probe에 적용한다. 응답 없는 문서도 로딩에서 빠져나와야 한다.
- POSTMORTEM 2026-11-07 toolbar tooltip의 “including the `/` list and IME composition” 사례를 재생 컨트롤에도 적용한다. 포커스 복귀와 Esc 우선순위를 검증한다.
