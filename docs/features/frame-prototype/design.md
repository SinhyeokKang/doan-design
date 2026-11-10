# 단일 프레임 프로토타입 설계

## 범위와 결정 영향

PRODUCT §3 Show를 단일 프레임 실행으로 확장한다. 사람은 HTML을 편집하지 않으므로 Out of scope Drawing·Simultaneous human/agent file editing에 해당하지 않는다. 에이전트가 그린 HTML과 표시를 읽는다. ARCHITECTURE §3의 제공 범위·opaque sandbox·창 내비게이션 제한을 유지한다.

일반 캔버스의 자유로운 배치·형식은 유지하고 opt-in 프로토타입에만 선택적 실행 계약을 적용한다. PRODUCT §3 Out of scope 2의 최소 속성 설명에도 이 선택적 계약을 반영한다. 새 필수 캔버스 포맷을 강제하지 않는다.

대상은 Electron 창 관리·`canvasFrame.ts`·캔버스 제공/주입, renderer의 `CanvasController.ts`, `CanvasTools.tsx`, `CanvasHeader.tsx`와 프레임 목록, Go 캔버스 파싱·검사·가이드다. 기존 `CanvasController.drawMarks`의 크기 버블은 화면 좌표에 있고 캔버스 DOM 밖에 있다. 재생 버튼도 이 경계를 유지한다. 클릭이 선택·보드 드래그로 전달되지 않도록 별도 포커스와 hit target을 둔다.

## PoC가 먼저 정할 구현 계약

지원 표시는 에이전트의 명시적 opt-in이다. 구체 속성 이름·값·프레임 크기 표현·스크립트 초기화 계약은 PoC 후 확정한다. 전체 문서의 CSS·스크립트를 보존하며 단일 프레임을 viewport에 놓는 방법과, 프레임을 추출하는 방법을 비교한다. DOM 조상 selector, body에 붙는 모달, document 조회, fixed 요소, 폰트, 상대 자산 경로, 반응형 media query, 중첩 프레임을 검증한다. 단순 DOM 복사로 이벤트가 보존된다고 가정하지 않는다.

일반 프레임은 기존 규칙대로 렌더링한다. 새 지원 계약을 만족하지 못하는 프레임은 표시하지 않는다. PoC로 확인하지 못한 구성은 지원한다고 문서화하지 않는다. 지원 조건이 사용자 요구를 줄여야 하면 결정 질문으로 돌린다.

PoC 종료 조건에는 실제 창 콘텐츠 크기가 `innerWidth/innerHeight`와 media query에 반영되고, 기존 보드의 Select/Picker 클릭·키 차단과 문서 높이 기반 iframe 자동 확장이 적용되지 않는 증거를 포함한다. 일반 보드의 고정 폭·높이 규칙은 유지한다. runtime-only 프레임, 중복/없는 frame ID, 지원 표시 제거·복구의 판정과 식별 계약도 PoC에서 고정한다. 이를 검증하지 못하면 지원 범위를 줄이기 전에 사용자에게 확인한다.

## 순수 함수와 수명

- 프레임 표시·유효성·현재 선택 → 실행 가능 여부와 비활성 이유.
- 창 상태·대상 식별자·새 목록 → 재사용/재로드/대상 소실/복구 전이.
- 요청 출처·루트·캔버스·프레임 → 실행 허용 판정.
- viewport 크기 → 초기 창의 화면 내 배치와 콘텐츠 크기.

창은 하나이며 다른 대상 실행·원본 재로드·닫았다 새로 열기에서 실행 상태를 버린다. 같은 대상 재생은 창을 활성화할 뿐 상태를 버리지 않는다. 최초 생성과 프레임 교체마다 대상 프레임 크기로 화면 안에 맞추고, 같은 대상 자동 재로드는 현재 창 크기를 유지한다. 메인 화면 이동·메인 창 숨김과 독립하며 앱 Quit에서 정리한다. 대상 소실 시 오래된 DOM을 실행하지 않고 프로젝트 제거·캔버스 ID 충돌·목록 실패도 다른 정상 프레임으로 대체하지 않는다.

루트/worktree·캔버스·프레임·실행 세대로 요청과 결과를 묶는다. A 로딩 중 B 실행, 재로드, 창 닫기 뒤 이전 결과를 버린다. 같은 canvas/frame ID를 가진 다른 worktree를 같은 대상으로 보지 않는다. 원래 대상이 아닌 것을 추측해 복구하지 않는다.

프로토타입 콘텐츠는 메인의 `selection:set`, 첨부·대화·설정 IPC를 호출하거나 `doan active`를 덮지 못한다. 필요한 호스트 컨트롤만 별도로 허용하고, 창 역할·직접 자식 frame·현재 실행 세대로 주입과 메시지를 제한한다. 원래 메인 창 sender guard를 넓혀 그대로 허용하지 않는다.

현재 `frameNavigationAllowed`는 같은 폴더의 문서 이동을 허용하므로 그대로 쓰는 것만으로 프로토타입 계약을 만족하지 않는다. 앱이 시작한 초기 로드·재로드와 콘텐츠의 링크·location 변경·form 이동을 구분하고, 프로토타입 전용 이동 거부와 중첩 frame 경계를 검증한다. native form submit은 차단하되 fetch 요청은 기존 정책을 유지한다. 새 창·다운로드·권한 요청을 기존보다 넓히지 않는다.

## 형식과 관례

새 지원 표시는 ARCHITECTURE §1의 선택적 프레임 관례가 된다. Go parser·`doan check`·가이드·프레임 목록과 앱의 runtime frame 판정이 같은 계약을 사용해야 한다. 기존 캔버스의 필수 속성은 늘리지 않는다. 구체 공유 schema와 `v` 변경 여부는 PoC에서 출력 전달 경로를 정한 뒤 고정하며, TS·Go 공통 fixture를 먼저 만든다. 앱 내부 IPC만으로 충분하면 소켓 버전을 올리지 않는다. 이 항목이 닫히기 전 `/tdd` 구현에 들어가지 않는다.

## UI와 회귀 예방

DESIGN.md의 도구 바·프레임 서랍·버블 토큰을 확장한다. 프리셋은 설치된 Doan 0.1.3 `shape`를 읽었다. 서랍은 한 행 액션으로 이동과 프레임 선택을 함께 수행하고, 도구 바와 버블만 재생한다. 첫 구현은 `/design-draft` 사용자 확인과 `/design-sync`를 거친다.

Tab·V/H·Space·Esc를 프레임 콘텐츠에 전달하고, ⌘W·네이티브 닫기만 이 창을 닫는다. 로딩·실패·소실은 spec 상태표를 따른다. 자동 재로드·복구는 창을 활성화하지 않는다. 도구 바 재생 버튼은 기존 Export처럼 방향키로 도달하고 비활성 이유를 지속적인 접근성 설명으로 제공한다. 버블의 작은 아이콘과 hit target을 분리하고 포커스 표시를 둔다. overlay의 pointer-events 예외는 버튼에만 주며, 버블 소실 시 포커스가 사라지지 않게 도구 바 등 현재 표시 중인 안전한 대상으로 복귀한다.

- POSTMORTEM 2026-10-22 linked 100vh의 “must carry that input” 규칙에 따라 viewport 측정 세대를 검증한다.
- POSTMORTEM 2026-10-22 dead board의 “write the e2e step for the document that never sends it” 교훈을 짧은 실제 앱 probe에 적용한다. 응답 없는 문서도 로딩에서 빠져나와야 한다.
- POSTMORTEM 2026-11-07 toolbar tooltip의 “including the `/` list and IME composition” 사례를 재생 컨트롤에도 적용한다. 포커스 복귀와 Esc 우선순위를 검증한다.
