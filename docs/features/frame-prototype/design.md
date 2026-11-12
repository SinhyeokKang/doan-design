# 단일 프레임 프로토타입 설계

## 범위와 결정 영향

PRODUCT §3 Show를 단일 프레임 실행으로 확장한다. 사람은 HTML을 편집하지 않으므로 Out of scope Drawing·Simultaneous human/agent file editing에 해당하지 않는다. 에이전트가 그린 HTML과 표시를 읽는다. ARCHITECTURE §3의 제공 범위·opaque sandbox·창 내비게이션 제한을 유지한다.

일반 캔버스의 자유로운 배치·형식은 유지하고 opt-in 프로토타입에만 선택적 실행 계약을 적용한다. PRODUCT §3 Out of scope 2의 최소 속성 설명에도 이 선택적 계약을 반영한다. 새 필수 캔버스 포맷을 강제하지 않는다.

대상은 Electron 창 관리·`canvasFrame.ts`·캔버스 제공/주입, renderer의 `CanvasController.ts`, `CanvasTools.tsx`, `CanvasHeader.tsx`와 프레임 목록, Go 캔버스 파싱·검사·가이드다. 기존 `CanvasController.drawMarks`의 크기 버블은 화면 좌표에 있고 캔버스 DOM 밖에 있다. 재생 버튼도 이 경계를 유지한다. 클릭이 선택·보드 드래그로 전달되지 않도록 별도 포커스와 hit target을 둔다.

`canvas-activity-notices`가 먼저 병합됐다면, 캔버스 읽음은 메인 캔버스 응답의 실제 표시 근거(현재 `DocumentBindings.current()`의 응답 지문·loader 세대·frame 증거)로만 처리된다. 프로토타입 창의 제공·주입 응답은 이 근거와 분리한다. 같은 캔버스를 프로토타입으로만 열거나 원본 변경으로 자동 재로드해도 읽음 기록과 Dot을 바꾸지 않는다. 그 기능이 아직 병합되지 않았다면 기존 로컬 읽음 기록을 바꾸지 않는 것으로 같은 조건을 확인한다.

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

### 디자인 드래프트 요청

- 경로 `.doan/canvases/frame-prototype.html`, 캔버스 ID `frame-prototype`.
- `prototype-controls`: 지원 프레임 자체 선택 시 도구 바·크기 버블 재생 버튼, 요소/미지원 프레임/미선택의 비활성 상태·이유·키보드 포커스.
- `prototype-drawer`: 기존 이동+선택 행에 지원 메타만 추가한다. 재생 액션은 서랍에 추가하지 않는다.
- `prototype-window`: 단일 프레임 창의 입력·버튼·모달·스크롤과 창 크기 변경에 따른 반응형 예시. 같은 대상 재생과 다른 대상 교체의 차이를 주석으로 설명한다.
  - 창 셸(사용자 결정, 2026-11-13): AppShell처럼 유리창 패널 위 둥근 흰 콘텐츠 패널, 헤더 높이 `--size-chrome`. 헤더 왼쪽은 신호등, Back/Forward(메인 창 헤더와 같은 자리·모양), 새로고침 버튼, 가운데는 사이드바 검색 버튼 스타일의 프레임 이름 버튼(가운데 정렬, 대칭 여백, 말줄임과 툴팁). 이름 버튼 아래로 프레임 드로어(같은 캔버스의 지원 프레임, 문서 순서, 재생 중 표시)가 열린 상태를 그린다. Back만 켜진 상태와 둘 다 꺼진 상태, 640px 창과 360px 창의 긴 이름을 그린다.
- `prototype-states`: 새 창 셸과 헤더 안에서 그린다. 상태 화면은 문제 프로젝트 오버레이를 재사용한다(`.problem-overlay`·`.problem-scene`, DESIGN 'Problem overlay', `.doan/canvases/problem-project.html`): 콘텐츠 패널 위 블러 오버레이, 그 아래에 이전 실행 화면(처음 로딩은 빈 패널). 대상 이름이 있는 로딩, 초기화/읽기 실패의 이유·Retry·Close, 대상 소실의 이유·Close, 자동 복구를 타일로 그린다. 소실 화면 본문에도 원본 프레임 또는 지원 표시가 복구되면 자동으로 다시 표시한다고 안내한다. 소실 화면에서도 헤더의 프레임 드로어와 Back/Forward는 쓸 수 있다.
- 헤더 가운데 프레임 이름 버튼은 신호등과 Back/Forward 영역을 피하고, 창 가운데 정렬을 위해 오른쪽도 같은 폭을 비운다. 한 줄 말줄임하고 전체 이름은 툴팁으로 제공하며 360px 창의 긴 프레임 이름을 초안에 포함한다. OS 창 제목(창 목록·Mission Control)은 프레임 이름과 `Prototype`이다.
- 기존 캔버스 도구·서랍·버블·네이티브 창 표현을 현행 코드와 DESIGN.md에서 복사하고 추가 요소만 그린다.
- 이 초안은 확정된 사용자 흐름을 그린다. PoC 전 지원 속성·실행 계약·지원 가능한 HTML 범위는 확정하거나 검증됐다고 표현하지 않는다. PoC는 구현의 선행 조건으로 유지한다.
- 서브에이전트 작성 후 주 에이전트가 렌더링을 검토·수정하고 원격에 푸시한다. 사용자 시각 확인은 이후 별도로 받으며, 푸시를 승인으로 기록하지 않는다.

### 초안 검토 상태

네 프레임을 작성하고 주 에이전트가 컨트롤·서랍·640/360px 창·모달·로딩·읽기/초기화 실패·대상/지원 소실·복구를 브라우저 렌더링에서 검토했다. 진행 문구의 말줄임표를 제거하고 창 헤더에 기존 `--size-chrome`을 적용했다. 360px 창의 긴 제목은 창 버튼과 겹치지 않고 한 줄 말줄임하며 전체 제목을 툴팁으로 제공한다. 대상·지원 소실 본문에 복구 조건과 자동 재표시 안내를 넣고 가로 넘침이 없음을 렌더링에서 확인했다.

초안의 선택안은 다음과 같다. 초안에는 선택한 안만 남긴다.

- 재생 액션 이름은 `Play prototype`이다. 아이콘이 재생 글리프이기 때문이다.
- 비활성 이유는 상태마다 할 일을 알려 준다. 요소 선택은 `Select the frame itself to play its prototype.`, 미지원 프레임은 `This frame is not marked for prototyping.`, 미선택은 `Select a supported frame to play its prototype.`, Hand·Picker·Capture는 `Switch to Select and choose a supported frame.`이다.
- 버블 재생 버튼은 14px 아이콘이고, 기존 24px 캡슐 높이를 클릭 영역으로 쓴다. 출시된 캡슐을 그대로 두고 24px로 최소 대상 크기를 충족한다. 키보드 포커스 링은 기존 `focus-visible`의 2px 링을 `-2px` offset으로 버튼 안쪽에 그려 크기 텍스트를 가리지 않는다.
- 서랍의 지원 메타는 캡션 텍스트 `Prototype`이고 Viewing 표시를 유지한다. 재생 아이콘은 버튼처럼 보이지만 행 메타는 버튼이 아니기 때문이다.
- 로딩·실패·소실 문구는 원인마다 제목이 다르다. 로딩은 `Loading prototype`, 읽기 실패는 `Couldn’t open this prototype`, 초기화 실패는 `Couldn’t start this prototype`, 프레임 소실은 `Frame unavailable`, 지원 표시 제거는 `Prototype unavailable`이다.

사용자 시각 확인은 대기 중이다. 2026-11-13 사용자가 창 셸·헤더(Back/Forward, 가운데 프레임 이름 버튼, 창 안 프레임 드로어)를 바꾸기로 해서 `prototype-window`·`prototype-states`를 다시 그린다. 창 장식은 현행 메인 창을 참고한 시안이며 네이티브 창·반응형 실행·키보드 전달·격리 PoC를 검증했다는 뜻이 아니다.

기존 1px 선·2px 포커스·5px 버블 간격·320px 서랍·네이티브 버튼의 21px 상단 위치는 컴포넌트 상수로 유지했다. 예시 콘텐츠와 상태 영역·crop 크기는 초안 배치 상수이며 새 앱 토큰은 추가하지 않았다.

DESIGN.md의 도구 바·프레임 서랍·버블 토큰을 확장한다. 프리셋은 설치된 Doan 0.1.3 `shape`를 읽었다. 서랍은 한 행 액션으로 이동과 프레임 선택을 함께 수행하고, 도구 바와 버블만 재생한다. 첫 구현은 `/design-draft` 사용자 확인과 `/design-sync`를 거친다.

Tab·V/H·Space·Esc를 프레임 콘텐츠에 전달하고, ⌘W·네이티브 닫기만 이 창을 닫는다. 로딩·실패·소실은 spec 상태표를 따른다. 자동 재로드·복구는 창을 활성화하지 않는다. 도구 바 재생 버튼은 기존 Export처럼 방향키로 도달하고 비활성 이유를 지속적인 접근성 설명으로 제공한다. 버블의 작은 아이콘과 hit target을 분리하고 포커스 표시를 둔다. overlay의 pointer-events 예외는 버튼에만 주며, 버블 소실 시 포커스가 사라지지 않게 도구 바 등 현재 표시 중인 안전한 대상으로 복귀한다.

- POSTMORTEM 2026-10-22 linked 100vh의 “must carry that input” 규칙에 따라 viewport 측정 세대를 검증한다.
- POSTMORTEM 2026-10-22 dead board의 “write the e2e step for the document that never sends it” 교훈을 짧은 실제 앱 probe에 적용한다. 응답 없는 문서도 로딩에서 빠져나와야 한다.
- POSTMORTEM 2026-11-07 toolbar tooltip의 “including the `/` list and IME composition” 사례를 재생 컨트롤에도 적용한다. 포커스 복귀와 Esc 우선순위를 검증한다.
