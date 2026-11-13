# 단일 프레임 프로토타입 설계

## 범위와 결정 영향

PRODUCT §3 Show를 단일 프레임 실행으로 확장한다. 사람은 HTML을 편집하지 않으므로 Out of scope Drawing·Simultaneous human/agent file editing에 해당하지 않는다. 에이전트가 그린 HTML과 표시를 읽는다. ARCHITECTURE §3의 제공 범위·opaque sandbox·창 내비게이션 제한을 유지한다.

일반 캔버스의 자유로운 배치·형식은 유지하고 opt-in 프로토타입에만 선택적 실행 계약을 적용한다. PRODUCT §3 Out of scope 2의 최소 속성 설명에도 이 선택적 계약을 반영한다. 새 필수 캔버스 포맷을 강제하지 않는다.

대상은 Electron 창 관리·`canvasFrame.ts`·캔버스 제공/주입, renderer의 `CanvasController.ts`, `CanvasTools.tsx`, `CanvasHeader.tsx`와 프레임 목록, Go 캔버스 파싱·검사·가이드다. 기존 `CanvasController.drawMarks`의 크기 버블은 화면 좌표에 있고 캔버스 DOM 밖에 있다. 재생 버튼도 이 경계를 유지한다. 클릭이 선택·보드 드래그로 전달되지 않도록 별도 포커스와 hit target을 둔다.

`canvas-activity-notices`가 먼저 병합됐다면, 캔버스 읽음은 메인 캔버스 응답의 실제 표시 근거(현재 `DocumentBindings.current()`의 응답 지문·loader 세대·frame 증거)로만 처리된다. 프로토타입 창의 제공·주입 응답은 이 근거와 분리한다. 같은 캔버스를 프로토타입으로만 열거나 원본 변경으로 자동 재로드해도 읽음 기록과 Dot을 바꾸지 않는다. 그 기능이 아직 병합되지 않았다면 기존 로컬 읽음 기록을 바꾸지 않는 것으로 같은 조건을 확인한다.

## PoC가 먼저 정할 구현 계약

격리한 dev 앱 PoC(2026-11-13, Electron 45, 증거는 `.scratch/handoff-P.md`)로 아래 계약을 고정했다. PoC의 프로토타입 창은 main 프로세스에서 만든 `data:` 호스트 창이었고, 앱의 전역 web-contents 차단(`will-navigate`, 보드 내비게이션 gate, 새 창 거부)은 그대로 적용된 상태였다. 일반 프레임은 기존 규칙대로 렌더링하고, 기존 캔버스의 필수 속성은 늘리지 않는다.

1. **지원 표시**: `data-doan-frame`이 붙은 요소에 `data-doan-prototype="<폭>x<높이>"`를 붙인다. 값은 프로토타입 창이 처음 여는 viewport 크기(CSS px)다. 두 수는 0으로 시작하지 않는 1–99999 정수이고 사이에 소문자 `x` 하나를 둔다(`^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$`). 프레임 id는 비어 있지 않고 문서 안에서 하나여야 한다. 에이전트가 호출할 API는 없다. 문서는 보드와 같이 모든 CSS·스크립트를 실행하고, 앱은 DOMContentLoaded에서 프레임을 찾고 없으면 `load` 처리기가 끝난 뒤 한 번 더 찾는다. 찾은 시점에 프레임 밖에 있던 요소는 숨기고, 그 뒤 프레임 밖에 추가된 요소(body에 붙이는 모달)는 보인다. 프레임은 viewport 폭을 채우고(`width: 100%`) 최소 높이는 viewport 높이다. 근거: `390x844` 프레임이 innerWidth·innerHeight 390×844로 열렸고, 값 `390`은 무효, 표시 없는 프레임은 미지원으로 판정됐다.
2. **렌더링 방식**: 전체 문서를 그대로 두고 프레임만 viewport에 놓는다. 프로토타입 스크립트가 프레임의 조상에 표시 속성을 달고, 생성 스타일시트(`adoptedStyleSheets`, `!important`)로 조상의 여백·위치·transform·크기 제한을 풀고 조상의 다른 자식을 `display: none`으로 숨긴다. 프레임 추출은 쓰지 않는다. 근거: 조상 selector(`.board > .phone .cta`), 나중에 body에 붙인 모달, `document.querySelector`로 단 리스너, fixed 탭 바(viewport 아래쪽), `../assets/`의 폰트·이미지, media query, 중첩 프레임, 절대 위치 프레임, `transform: scale` 조상이 모두 동작했다. 프레임을 DOM 복사하면 리스너와 조상 selector를 잃었고, 살아 있는 노드를 body로 옮기면 조상 selector를 잃었다.
3. **viewport**: 창의 콘텐츠 패널 크기가 iframe 크기이고, 문서의 innerWidth·innerHeight·media query가 이를 따른다. 창 최소 폭은 360px이고, 360px보다 좁은 프레임은 iframe 폭을 표시 폭으로 두고 가운데 놓는다. 프로토타입 창에는 보드 스크립트(`canvasScript.ts`)를 주입하지 않으므로 Select·Picker의 클릭·키 가로채기와 문서 높이에 맞춘 iframe 확장이 없다. 근거: 창을 800·420px로 바꾸자 innerWidth가 800·420, `(max-width: 500px)`가 false·true로 바뀌었다. 200px로 줄이면 360px에서 멈췄고, `320x568` 프레임은 innerWidth 320, iframe x=20이었다. 클릭 2회가 카운터 2로, 입력 `hello`가 필드로, V·H·Space·Esc가 콘텐츠 keydown으로 갔다. 문서 높이 1683px에서도 iframe은 844px를 유지했고 휠 스크롤이 동작했다.
4. **식별**: 대상은 (루트, 캔버스 ID, 프레임 ID)다. ID 없는 캔버스 행은 기존 기기 로컬 상태처럼 경로로 식별한다. 재생·재로드·Retry·복구마다 실행 세대를 올리고 새 iframe을 만든다. 프레임 판정은 그 실행의 실제 문서에서 한다. 프레임이 없거나 같은 ID가 둘 이상이면 대상 소실(`Frame unavailable`)로, 표시가 없거나 값이 무효이면 지원 표시 제거(`Prototype unavailable`)로 보인다. 중복 ID 중 하나를 고르지 않는다. `<template>` 안 요소는 프레임이 아니다. runtime-only 프레임은 문서 파싱 중이나 `load` 처리기에서 만들어지면 지원하고, 그 뒤(타이머·입력)에 생긴 프레임은 대상이 될 수 없다. 프레임 드로어 목록은 그 문서에서 ID가 하나뿐이고 표시가 유효한 프레임을 문서 순서로 `load` 처리기 뒤에 보고한 것이다. 호스트는 현재 iframe의 `contentWindow`, origin `"null"`, 현재 세대가 모두 맞는 메시지만 받는다. 캔버스 스크립트는 현재 세대 메시지를 위조할 수 있지만, 위조로 할 수 있는 일은 자기 창의 로딩을 끝내는 것뿐이다. 두 worktree의 같은 canvas/frame ID는 폴더 키가 달라 URL이 다르므로 다른 대상이다. 근거: 중복 ID는 `duplicate`, 없는 ID와 `<template>` 안 프레임은 `missing`, 표시 없음은 `unmarked`, `390`은 `invalid`로 판정됐다. 파싱 중·`load` 처리기에서 만든 프레임은 둘 다 열렸고, 두 루트의 `proto.html#phone`은 서로 다른 URL로 각각 열렸다. 이전 세대 메시지는 거부됐다.
5. **내비게이션·격리**: 프로토타입 iframe의 sandbox는 `allow-scripts allow-forms`다. 프로토타입 창의 `will-frame-navigate`는 직접 자식 frame의 문서 이동을 호스트(최상위 frame)가 시작했고 URL이 현재 실행 URL과 같을 때만 허용한다. 그래서 링크, `location` 변경, `location.reload()`, native form submit, `download` 링크의 이동을 거부한다. hash 이동과 `pushState`는 같은 문서 안의 이동이라 이 이벤트가 오지 않고 그대로 동작한다. 콘텐츠가 넣은 중첩 iframe 안의 자체 이동은 보드 규칙(손자 frame은 gate를 건너뜀)을 유지하고, 중첩 iframe이 캔버스 frame을 바꾸는 `_parent` 이동은 sandbox가 막는다. 새 창과 top 이동은 sandbox와 기존 `setWindowOpenHandler` 거부로 막히고, fetch는 기존 서버 정책을 따른다. 프로토타입 창은 메모리 전용 별도 session partition을 쓰고, 그 session에도 기존과 같은 권한·장치 거부와 다운로드 취소를 건다. 메인 창 sender guard(`fromWindow`, `mainOnly`)는 넓히지 않고 새 창 역할 `prototype`을 둔다. 그 창의 main frame만 `prototype:*` 전용 allowlist를 쓴다. 캔버스 iframe에는 preload가 없고, 재생 요청은 (루트, 캔버스, 프레임)만 보내며 URL은 main이 자기 목록에서 만든다. 주입은 프로토타입 창 main frame의 직접 자식이면서 URL이 현재 실행 URL과 같은 문서에만 하고, 창의 debugger로 `Page.addScriptToEvaluateOnNewDocument`(자식 session의 `Page.enable` 뒤)를 써서 캔버스 스크립트보다 먼저 실행한다. 근거: 기존 `frameNavigationAllowed`만으로는 같은 폴더 링크 이동이 통과했다. 프로토타입 gate는 위 이동을 모두 거부했고 fetch는 200을 받았다. `allow-forms`가 없으면 submit 이벤트가 오지 않아 `preventDefault`하는 submit 처리기도 돌지 않았고, 있으면 처리기는 돌고 native submit은 gate가 거부했다. 캔버스의 `window.doan`은 undefined이고 부모 접근은 SecurityError였다. 앱 preload를 일부러 붙인 PoC 창 main frame에서 `ui-state:get`·`preferences:read`는 거부값 `null`을 받았고, `selection:set`을 보낸 뒤에도 `doan active`는 선택 없음 그대로였다. 주입 스크립트는 20회 모두 캔버스 head 스크립트보다 먼저 실행됐다.
6. **읽음 분리**: 읽음 증명은 메인 창 debugger가 채우는 `DocumentBindings`와 메인 창 main frame의 직접 자식만 쓴다(`seenProof.ts`). 프로토타입 창의 debugger는 주입에만 쓰고 `DocumentBindings`에 연결하지 않는다. 서버가 남기는 응답 기록은 메인 창 loader와 묶이지 않으면 증명이 되지 않으므로 서버는 그대로 둔다. 근거: 새 캔버스를 프로토타입으로만 열고 원본을 바꿔 다시 불러와도 사이드바 Dot(`fresh is new`), `.doan/seen/`, `canvas-seen.json`이 그대로였고, 메인 캔버스에서 연 뒤에만 Dot이 사라지고 기록이 바뀌었다.
7. **응답 없는 문서**: iframe `src`를 정한 때부터 결과 메시지까지 10초를 기다리고, 넘으면 초기화 실패로 끝낸다. 늦게 온 결과는 세대가 지나 버린다. 실패할 때 main은 그 실행의 캔버스 frame 렌더러 프로세스(`WebFrameMain.osProcessId`)를 종료한다. 멈춘 프로세스는 다음 iframe이 다시 쓰기 때문이다. 별도 partition이므로 이 프로세스는 메인 창 캔버스와 공유되지 않는다. 근거: 측정한 로드 시간은 픽스처 35–104ms, 저장소에서 가장 큰 캔버스(`readme-features.html`, 578KB)가 68–167ms였다. 10초는 가장 긴 값의 약 60배여서 느린 외부 스크립트를 기다릴 여유가 있다. 파서를 막는 응답 없는 스크립트와 무한 루프 문서는 결과 없이 시간 초과됐다. partition에서 프로토타입과 메인 캔버스의 프로세스는 서로 달랐고 무한 루프 중에도 메인 캔버스가 응답했다. 종료하지 않으면 다음 실행도 시간 초과됐고, 종료하면 다음 실행이 101ms에 준비됐다. 기본 session에서는 자식 프로세스를 종료하자 호스트 페이지까지 함께 죽었다.
8. **형식**: 공유 JSON schema와 socket `v`는 바꾸지 않는다. `doan ls`의 프레임 목록(`{id, title}`)과 `doan open`·`doan active` 출력도 그대로다. 앱 판정은 실제 문서로 하므로 CLI 출력이 필요 없다. 바뀌는 계약은 `doan check`의 오류 코드 두 개, 앱 내부 IPC(`prototype:*`), 보드 `layout` 메시지의 프레임 항목에 붙는 표시 원문(내부 메시지, schema 없음)이다. TS·Go 공통 fixture는 `schema/fixtures/prototype-mark/cases.json`에 둔다. 표시 값별 유효 여부와 크기, 배치(프레임 요소·프레임 아닌 요소·`<template>` 안) 판정을 담고, Go(check)와 TS(렌더러 판정, 주입 스크립트의 파서)가 같이 읽는다. open-link fixture처럼 형식이 아닌 테스트 데이터다.
9. **검사와 가이드**: `doan check`는 구조 오류만 본다. `invalid_prototype_size`(error)는 값이 1번 문법에 맞지 않을 때, `prototype_not_frame`(error)은 `data-doan-frame` 없는 요소에 표시가 있을 때다. `<template>` 안은 기존 파싱 규칙대로 보지 않고, 빈·중복 프레임 ID는 기존 코드가 잡는다. 스크립트가 정상 동작하는지는 판정하지 않는다. 가이드 문장은 `cli/internal/cli/skill.md` Canvas conventions에 한 항목(약 350B)으로 넣는다. 지원 표시 형식, 창에서 프레임이 viewport를 채우는 것, 프레임 밖 요소가 숨는 것, 이동·제출·새 창이 동작하지 않는 것을 적는다. `doan skill --json`은 20,671B에 번들 안내 약 150B를 더해도 예산 21,600B 안에 든다. `document` 프리셋(현재 21,588B)은 디자인 시스템 문서용이라 바꾸지 않는다. 그래서 줄일 문장 목록도 필요 없다.

PoC로 확인하지 못해 지원한다고 쓰지 않는 구성:

- 실제 창 셸(React 렌더러의 헤더·드로어·상태 오버레이, `prototype:*` preload)과 그 위의 포커스·Tab 순서. PoC 호스트는 `data:` 페이지였다.
- 원본 변경에 따른 자동 재로드 배선(`CanvasRow.rev`)과 표시·프레임 복구 감지, 같은 대상 재생의 상태 유지, Back/Forward, ⌘W, Quit, 메인 창 숨김과의 독립.
- 여러 디스플레이·전체 화면에서의 창 맞춤과 창 최소 높이.
- 실패 시 프로세스 종료를 패키지 앱에서 한 경우, 그리고 cross-site 중첩 iframe이 있는 문서에서 한 경우.
- 파싱 중 프레임 밖 body에 만든 요소(미리 만든 숨은 모달)는 숨겨져 열리지 않는다. 지원하지 않으며 가이드는 필요한 요소를 프레임 안에 두라고 쓴다. `load` 뒤 프레임 밖에 추가된 요소는 다른 프레임 재생에도 보인다.
- `load` 처리기 뒤에 생기는 runtime 프레임. 메인 보드에서 재생 버튼이 켜져도 창은 대상 소실을 보인다.
- IME 조합 입력, 접근성 트리, 실제 에이전트가 쓴 표시(`/agent-eval`).

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

### 프리셋 검수 반영 (2026-11-13)

critique·clarify·audit·harden 프리셋 검수 뒤 사용자가 spec 19·20을 정했고, 다음을 초안에 반영한다.
- Reload에 `Reload prototype` 툴팁. 이름 버튼 툴팁은 공유 Tooltip 하나로, 이름이 말줄임될 때만.
- 드로어는 이름 버튼에 앵커(8px collision padding)하고, 행은 출시된 서랍처럼 `aria-current="location"`과 roving tabindex.
- 상태 장면에 늘 마운트한 polite 라이브 영역. `h2`는 heading 그대로. 포커스가 콘텐츠 안에 있었을 때만 `tabindex=-1` 제목으로 옮긴다.
- 실패 문구: 읽기 실패 본문 `Doan couldn’t read the canvas file for this frame.`, 초기화 실패 본문 `The frame was read, but Doan couldn’t set it up in this window.` 두 상태 모두 Retry · Close 뒤에 Details(ghost)와 `.problem-detail`.
- 소실 문구: `This frame is no longer available. It reappears here when the frame is restored; to play another, choose one from the frame menu above.`, `This frame is no longer marked for prototyping. It reappears here when the mark is restored; to play another, choose one from the frame menu above.` 고를 프레임이 없으면(캔버스 자체가 사라졌거나 지원 프레임이 하나도 남지 않음) 세미콜론 뒤 절을 뺀다. 드로어 0행 문구는 `No frames in this canvas are marked for prototyping. Ask an agent to mark one.`이다(clarify 프리셋으로 작성).
- 추가 타일: 드로어 1행, 0행(지원 프레임 없음, 문구는 clarify로), 소실 중에 연 드로어, 짧은 창에서 연 드로어(목록 스크롤), 360px·낮은 높이의 소실 상태, 360px보다 좁은 프레임(가운데 배치), 헤더 컨트롤과 드로어 행의 포커스 표본.

### 초안 검토 상태

네 프레임을 작성하고 주 에이전트가 컨트롤·서랍·640/360px 창·모달·로딩·읽기/초기화 실패·대상/지원 소실·복구를 브라우저 렌더링에서 검토했다. 진행 문구의 말줄임표를 제거하고 창 헤더에 기존 `--size-chrome`을 적용했다. 360px 창의 긴 제목은 창 버튼과 겹치지 않고 한 줄 말줄임하며 전체 제목을 툴팁으로 제공한다. 대상·지원 소실 본문에 복구 조건과 자동 재표시 안내를 넣고 가로 넘침이 없음을 렌더링에서 확인했다.

초안의 선택안은 다음과 같다. 초안에는 선택한 안만 남긴다.

- 재생 액션 이름은 `Play prototype`이다. 아이콘이 재생 글리프이기 때문이다.
- 비활성 이유는 상태마다 할 일을 알려 준다. 요소 선택은 `Select the frame itself to play its prototype.`, 미지원 프레임은 `This frame is not marked for prototyping.`, 미선택은 `Select a supported frame to play its prototype.`, Hand·Picker·Capture는 `Switch to Select and choose a supported frame.`이다.
- 버블 재생 버튼은 14px 아이콘이고, 기존 24px 캡슐 높이를 클릭 영역으로 쓴다. 출시된 캡슐을 그대로 두고 24px로 최소 대상 크기를 충족한다. 키보드 포커스 링은 기존 `focus-visible`의 2px 링을 `-2px` offset으로 버튼 안쪽에 그려 크기 텍스트를 가리지 않는다.
- 서랍의 지원 메타는 캡션 텍스트 `Prototype`이고 Viewing 표시를 유지한다. 재생 아이콘은 버튼처럼 보이지만 행 메타는 버튼이 아니기 때문이다.
- 로딩·실패·소실 문구는 원인마다 제목이 다르다. 로딩은 `Loading prototype`, 읽기 실패는 `Couldn’t open this prototype`, 초기화 실패는 `Couldn’t start this prototype`, 프레임 소실은 `Frame unavailable`, 지원 표시 제거는 `Prototype unavailable`이다.

사용자가 앱에서 초안(`b0f4befb`까지)을 확정했다(2026-11-13). 로딩 줄은 출시된 `.problem-reading`과 달리 `role="status"` 없이 창의 polite 라이브 영역이 읽는 것으로 확정했다. 2026-11-13 사용자가 창 셸·헤더(Back/Forward, 가운데 프레임 이름 버튼, 창 안 프레임 드로어)를 바꾸기로 해서 `prototype-window`·`prototype-states`를 다시 그린다. 창 장식은 현행 메인 창을 참고한 시안이며 네이티브 창·반응형 실행·키보드 전달·격리 PoC를 검증했다는 뜻이 아니다.

기존 1px 선·2px 포커스·5px 버블 간격·320px 서랍·네이티브 버튼의 21px 상단 위치는 컴포넌트 상수로 유지했다. 예시 콘텐츠와 상태 영역·crop 크기는 초안 배치 상수이며 새 앱 토큰은 추가하지 않았다.

DESIGN.md의 도구 바·프레임 서랍·버블 토큰을 확장한다. 프리셋은 설치된 Doan 0.1.3 `shape`를 읽었다. 서랍은 한 행 액션으로 이동과 프레임 선택을 함께 수행하고, 도구 바와 버블만 재생한다. 첫 구현은 `/design-draft` 사용자 확인과 `/design-sync`를 거친다.

Tab·V/H·Space·Esc를 프레임 콘텐츠에 전달하고, ⌘W·네이티브 닫기만 이 창을 닫는다. 로딩·실패·소실은 spec 상태표를 따른다. 자동 재로드·복구는 창을 활성화하지 않는다. 도구 바 재생 버튼은 기존 Export처럼 방향키로 도달하고 비활성 이유를 지속적인 접근성 설명으로 제공한다. 버블의 작은 아이콘과 hit target을 분리하고 포커스 표시를 둔다. overlay의 pointer-events 예외는 버튼에만 주며, 버블 소실 시 포커스가 사라지지 않게 도구 바 등 현재 표시 중인 안전한 대상으로 복귀한다.

- POSTMORTEM 2026-10-22 linked 100vh의 “must carry that input” 규칙에 따라 viewport 측정 세대를 검증한다.
- POSTMORTEM 2026-10-22 dead board의 “write the e2e step for the document that never sends it” 교훈을 짧은 실제 앱 probe에 적용한다. 응답 없는 문서도 로딩에서 빠져나와야 한다.
- POSTMORTEM 2026-11-07 toolbar tooltip의 “including the `/` list and IME composition” 사례를 재생 컨트롤에도 적용한다. 포커스 복귀와 Esc 우선순위를 검증한다.
