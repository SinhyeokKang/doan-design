# prototype-cli-export — design

spec.md '결정'(사용자 확인)을 따른다: v6, 프로토타입 창만, `--frame <id> --prototype`, 캔버스 전체를 넣고 토스트와 guide로 알림, 프레임이 브라우저 viewport 전체를 채움, chrome 없음, Export는 아래 툴바 [Reload prototype | Fit, Responsive | Export prototype]의 마지막 버튼, 링크 없음, 툴바 Export와 CLI만, CLI 정적 판정, open의 `canvas_unreadable`, export 결과 `prototype: true`, target 비교로 오래된 클릭 거절, 창마다 한 번에 하나의 내보내기, 숨긴 채 시작하는 iframe.

## 영향 받는 구성 요소

### CLI (Go)

- `cli/internal/canvas/`: 정적 판정 `PrototypeTarget`(아래 '순수 함수'). `canvas.Parse`가 이미 `Frame.Prototype`(원시 표시 값)과 `<template>` 밖 프레임만 모으므로 새 tokenizer walker는 없다.
- `cli/internal/cli/run.go`: `Flags.Prototype bool`, `--prototype` 플래그, `open`과 `export`의 허용 플래그(`export`에 `frame`, `prototype`), usage 줄 두 개.
- `cli/internal/cli/open.go`, `open_rules.go`: `--prototype`이면 캔버스 크기를 `stat`으로 먼저 보고 `export.MaxBytes`를 넘으면 `canvas_unreadable`, 그다음 `export.ReadFile`로 읽는다(`export.ReadFile`에는 크기 상한이 없다. `export.go`의 stat → `ReadFile` 순서와 같다). 이어서 `canvas.Parse` → `PrototypeTarget` → v6 요청. 파싱 실패도 `canvas_unreadable`이고, `doan:width`는 보지 않는다. v4 경로는 바뀌지 않는다. 새 파일 `prototype_rules.go`에 v6 요청·응답 규칙을 둔다(`open_rules.go`의 `decodeOpenReply`·`withoutSecrets` 방식을 따른다).
- `cli/internal/cli/export.go`: `--frame`/`--prototype` 짝 검사(`--prototype`은 `--frame` 필수, `--frame`만은 `usage_error`), 파싱과 `doan:width` 검사 직후 `PrototypeTarget`, `export.Assemble` 대신 `export.AssemblePrototype`. 결과에 `prototype: true`. 읽을 수 없는 캔버스는 지금처럼 `export_refused`다(앱의 `interpretExport`가 이미 읽는다). 거절 순서: 인자 → 저장소 → 캔버스 → **프레임 판정** → 참조 → 크기 → 출력. 프레임 판정을 참조 검사 앞에 두는 이유: 틀린 프레임 ID로 무거운 inline을 돌리지 않는다.
- `cli/internal/cli/envelope.go` `ExitCode`: `frame_not_found`, `not_prototype`, `canvas_unreadable` → 2. 빠지면 exit 1(internal)로 읽힌다(ARCHITECTURE §12).
- `cli/internal/export/assemble.go`: `AssemblePrototype(meta, proto, html)`. 같은 `fillShell`, `writeEscaped`, `measureOffset`, BOM 제거를 쓰고 shell만 다르다. `Assemble`은 바이트 단위로 그대로다.
- `cli/internal/export/viewer/`: 새 파일 `prototype.html`(shell), `prototype.css`, `prototype.js`(바깥 페이지: 메시지 수신, iframe 보이기, 상태 줄), `isolate.js`(srcdoc 안 첫 스크립트: 프레임 찾기와 격리, 이동 차단). `go:embed viewer/*`가 그대로 포함한다.
- `cli/internal/cli/skill.md`(guide): `doan open`, `doan export` 줄과 item 14.
- `cli/internal/formats/validate.go`: `files` 목록에 v6을 더하고 v6 검증기를 둔다.

### 앱 (Electron + TS)

- `app/src/main/runtime.ts` `answerLine`: `v: 6` 분기. schema → token → 등록된 root(`project_not_open`) → `state.playPrototype(value)`.
- `app/src/main/index.ts`: `playPrototype` 연결. 준비 판정(`openLinksReady()`와 대상 root가 loading이 아님) → 첫 실행(`onboardingOpen`, `buddyIntroOpen`) → 목록 판정(`resolveOpenTarget` 재사용) → `prototype.controller.playFromCli(...)`.
- `app/src/main/prototype/requests.ts`: `validatePlay`에서 row와 canvas key를 찾는 부분을 `playTarget(root, path, frame, mark, entries)`로 빼고, `validatePlay`(메인 창)와 v6 요청이 함께 쓴다.
- `app/src/main/prototype/controller.ts`: `playFromCli(request)`. 판정을 마친 target과 크기로 `transitions.play`를 그대로 부른다. 결과 `played`(창을 열었거나 다른 프레임으로 바꿈), `activated`(이미 그 프레임이라 앞으로 가져오기만 함), `refused`(목록에서 사라짐)를 돌려준다. `refused`는 v6 `canvas_not_found`로 나간다.
- `app/src/main/prototypeWindow.ts`: `activate`가 다른 앱이 앞에 있을 때도 Doan을 앞으로 가져오는지 확인하고, 숨긴 앱(`app.hide`)이면 `app.show()` 후 창을 보인다(아래 POSTMORTEM 2026-11-09).
- `app/src/main/prototype/ipc.ts`: 채널 `prototype:export`(`{root, path, frame}`: 누른 순간의 target), `prototype:revealExport`(opaque id), 이벤트 `prototype:exportRunning`. `PROTOTYPE_WINDOW_REQUESTS`에 앞의 둘을 더한다.
- `app/src/main/senderAllowed.ts`: 새 두 요청은 `prototype` role만 부를 수 있다. 메인 창의 `mainOnly`는 넓히지 않는다.
- `app/src/main/canvasExport.ts`: 지금 `export(value)`는 `trashRequest`, 메인 창으로 보내는 `running`, 메인 창이 부모인 `choose`에 묶여 있다. 프로토타입 창용은 deps를 따로 준 `createCanvasExport`의 두 번째 인스턴스로 만든다(요청 해석은 프레임을 포함한 target, `running`은 프로토타입 창으로, 저장 패널의 부모는 프로토타입 창). 잠금과 `written`(Show in Finder id, 상한 16)은 인스턴스마다 따로다. 프로토타입 인스턴스의 잠금은 창 하나에 하나다(결정 15). `runExport`(`app/src/main/cli.ts`)에 `--frame <id> --prototype` 인자. `interpretExport`에 `frame_not_found` → `notFound`, `not_prototype` → `notMarked`.
- `app/src/renderer/prototype/`: 아래 툴바 줄의 툴바(`prototype-responsive`가 만든 컴포넌트)에 구분선과 Export 버튼을 더한다. 버튼은 캔버스 툴바 버튼(`doan-canvas-tool`, 40 px, 16 px 아이콘)과 같고, 접근 이름과 tooltip은 "Export prototype", 쓸 수 없을 때는 `aria-disabled`와 이유 tooltip·sr-only 설명이다(캔버스 툴바의 Play prototype·Export와 같은 `TooltipTrigger` 규칙). 그 밖에 토스트 호스트(`app/src/renderer/Toast.tsx` 재사용), `PrototypeWindow.tsx`의 호출. 프로토타입 preload(`window.doanPrototype`)에 `export(target)`, `revealExport(id)`, `onExportRunning`, 그리고 `onWindowVisible`(또는 같은 역할의 채널). `useToast`가 토스트 타이머를 멈추고 다시 돌리려고 `window.doan.onWindowVisible`을 쓰기 때문이다(`Toast.tsx`).
- **창 배치는 세 기능에 걸쳐 정해졌다**: 이 기능의 Export, `prototype-conversation`의 대화 버튼, `prototype-responsive`의 툴바 줄이 같은 프로토타입 창을 바꾼다.
  - header: Back, Forward, 프레임 이름 버튼, 대화 버튼. 이 기능은 header에 아무것도 더하지 않는다. 360 px 창의 이름 버튼 폭은 `prototype-responsive`가 다시 계산한다.
  - 아래 툴바 줄(66 px, 프레임 열 아래): 툴바 [Reload prototype | Fit, Responsive | Export prototype]. Reload는 header에서 툴바로 내려오고(`prototype-responsive`가 옮긴다), Export는 마지막 묶음이다. 창 맞춤 높이는 표시 높이 + 122(header 56 + 툴바 줄 66)다.
  - 키보드: 툴바는 Tab 정지가 하나이고 ←/→로 네 버튼을 오간다(쓸 수 없는 Export 포함). Tab 순서는 Back, Forward, 프레임 이름, 대화 버튼, 툴바, 프레임 콘텐츠다.
- **구현 순서**: `prototype-responsive` → `prototype-cli-export` → `prototype-conversation`. 이 기능은 responsive가 만든 툴바에 Export 버튼을 더한다.
- 형제 기능 `prototype-conversation`과 겹치는 곳: 프로토타입 창의 토스트 호스트(그쪽도 `WindowShell`에 토스트 자리를 둔다). 토스트 호스트는 하나만 두고, 이 기능이 먼저 만들고 `prototype-conversation`이 쓴다. 지금 `.toast`는 오른쪽·아래 `--space-4`에 붙으므로 아래 툴바 줄 위에 뜨고, 좁은 창에서는 툴바(Export 포함)와 겹칠 수 있다. 이 겹침은 받아들인다(`prototype-responsive` 결정 11). 토스트는 Export를 누른 뒤에 나오므로, 겹친 토스트가 다음 클릭을 가리는지는 `/design-draft`에서 그림으로 보인다.
- `app/src/renderer/canvasRowMessages.ts`: 토스트 문구. 이름 자리에는 프레임 제목(없으면 ID)을 넣는다. 문구 초안(최종안은 `/design-draft`의 clarify):
  - 성공: "Exported “Checkout”. The file also contains the rest of the canvas." 외부 URL이 있으면 지금의 인터넷 문장을 뒤에 붙인다.
  - `notFound`: "Couldn’t export “Checkout”. Doan can export only a frame written in the canvas file, not one a script adds."
  - `notMarked`: "Couldn’t export “Checkout”. The canvas file doesn’t mark this frame as a prototype. Ask your agent to run doan check."
  - target이 바뀐 클릭: "Couldn’t export “Checkout”. The prototype changed before the export started. Try again."
- `app/src/main/exportViewer.test.ts`: 새 viewer 파일의 고정 검사(아래).

### 포맷

- `schema/app-socket.v6.schema.json`, `schema/fixtures/app-socket-v6/{request,response}/{valid,invalid}/`. 등록은 `cli/internal/formats/validate.go`의 `files` 목록과 `app/src/formats/validate.ts`의 import다. `schema/embed.go`는 `*.schema.json` glob이라 바꿀 것이 없다. 아래 '포맷 변경'.

### Skills와 eval

- guide 변경은 `/agent-eval` 대상이다(AGENTS.md: guide, CLI 출력과 메시지가 바뀌는 PR). 프로토타입 열기 시나리오는 fake app(`eval/lib/socket.ts`)이 v6에 답해야 하므로 runner가 바뀐다. 지금은 v2–v5만 등록한다.

## 흐름

### `doan open <canvas> --frame <id> --prototype`

1. 인자: `--prototype`에 `--frame`이 없으면 `usage_error`("--prototype needs --frame <id>"). `--frame` 검사는 지금의 `checkFrame`(비어 있지 않음, 200 code point, 제어 문자 없음).
2. 저장소, `workTarget`, 파일 존재(`canvas_not_found`)는 지금과 같다.
3. 크기(stat, 50 MiB 초과 → `canvas_unreadable`) → 읽기 → 파싱(실패 → `canvas_unreadable`, exit 2, nextSteps: `doan check`) → `PrototypeTarget(model, id)`: 일치하는 프레임 0개, 2개 이상, ID가 UTF-16 200 단위 초과 → `frame_not_found`. 표시 없음, 문법 위반 → `not_prototype`. 통과하면 원시 표시 값(크기 힌트)을 얻는다.
4. v6 요청 `{v:6, token, root, path, frame, mark}`를 `bootstrap(ctx, false, …)`로 보낸다(앞에서 열기, `not_ready` 재시도, `busy` 변환은 v4와 같다).
5. 앱: schema → token → root → 준비(`not_ready`) → 첫 실행(`busy`) → 목록(`canvas_not_found`: 목록에 없거나 canvas ID가 둘 이상) → `playTarget` → `playFromCli`. 응답 `{v:6, ok:true, played:true}`. 재생 시작이나 앞으로 가져오기는 응답 전에 동기로 일어난다(CLI의 2 s 안).
6. CLI 결과 `{opened: true, frame: "found", prototype: true}`, 사람용 줄 "Playing <frame> from <path> in Doan’s prototype window".

메인 창 Play와의 차이는 출발점뿐이다. 창 상태 전이(`windowState.ts`)는 바뀌지 않는다. ARCHITECTURE §3 'One window'의 활성화 목록(메인 창 Play, 창의 drawer, Back/Forward)에 `doan open --prototype`(에이전트 요청)을 더한다.

### `doan export <canvas> --frame <id> --prototype -o <file>`

1. 지금의 export 순서에 프레임 판정을 파싱과 `doan:width` 검사 직후에 넣는다.
2. `Inline`은 그대로 돈다(캔버스 전체).
3. `AssemblePrototype(Meta{Name, Width}, Proto{Frame, Title}, inlined.HTML)`:
   - 바깥 페이지 `prototype.html`: `<title>`은 "<title or id> — Prototype"(HTML 이스케이프, 표시 크기 없음). `<iframe sandbox="allow-scripts allow-forms" srcdoc>`가 CSS만으로 브라우저 viewport 전체(`position: fixed; inset: 0; width: 100%; height: 100%; border: 0`)를 채운다. 바깥 페이지는 스크롤하지 않는다. 그래서 iframe의 `innerWidth`, `innerHeight`, media query, `100vh`가 브라우저 창을 따르고, 창 크기를 바꾸면 프레임이 다시 배치된다. 표시 크기는 판정(표시가 있고 문법에 맞는지)에만 쓰고 크기에는 쓰지 않는다.
   - **iframe은 숨긴 채 시작한다**(결정 16): `visibility: hidden`으로 시작하고, `isolate.js`가 `ready`나 `missing`을 알리거나 `prototype.js`의 10 s 타이머가 끝나면 보인다. 격리 전에는 캔버스 전체(다른 프레임과 메모)가 그려지므로 그 순간을 가린다. 타이머가 있어 메시지가 오지 않아도 화면이 비지 않는다(POSTMORTEM 2026-10-22).
   - **JavaScript가 없을 때**: srcdoc iframe은 JavaScript 없이도 그려진다(기존 `viewer/shell.html`의 noscript 안내가 이를 전제로 한다). 그래서 `<noscript>` 안의 `<style>`이 iframe을 `display: none`으로 숨기고 안내 줄만 보인다. JavaScript가 있을 때 보이기는 위 규칙을 따른다.
   - srcdoc의 `<head>` 첫 스크립트는 `lib.js` 일부와 `isolate.js`를 함수로 감싼 것이다(`measure.js`와 같은 위치와 방식, `measureOffset` 재사용).
   - `isolate.js`: DOMContentLoaded에(없으면 `load` handler 뒤에) 프레임을 ID로 찾고(정확히 하나), 프로토타입 창 `prototypeScript.ts`의 `isolate`와 같은 표시 속성과 adopted stylesheet로 격리한다. 표시 값은 다시 보지 않는다(판정은 CLI가 했다). 결과를 부모에 한 번 알린다(`ready` 또는 `missing`).
   - **이동 차단**: `window`에 bubble 단계 `submit` listener를 달아 늘 `preventDefault()`(캔버스의 handler가 먼저 돈다). `click` listener는 `href` 값이 `#`으로 시작하지 않는 `<a href>` 활성화를 `preventDefault()`한다("같은 문서" 판정 규칙). `location` 대입, `location.reload()`, 스크립트의 `form.submit()`은 막지 못한다. srcdoc 문서는 부모의 base URL을 물려받으므로, `#id` 클릭·`location.hash`·`pushState`(fragment와 경로)가 문서를 떠나지 않는지, 캔버스 handler가 `stopPropagation()`할 때 `window` listener가 돌지 않는 경우를 PoC가 확인한다. PoC에서 실패한 경우는 '알려진 한계'와 spec B로 옮긴다.
   - 바깥 페이지는 `missing`이면 "This prototype’s frame didn’t load. Ask the sender to export it again." 줄을 보인다.
4. 결과 `{path, output, bytes, frames, external, links, prototype: true}`. 텍스트 "Exported <path> frame <id> to <output> (<n> bytes)".

### 프로토타입 창의 Export

1. 버튼은 `view.phase`가 `ready`, `loading`, `init-failed`일 때 쓸 수 있다. 이유는 캔버스 툴바 Export와 같은 tooltip과 sr-only 설명이다.
   - `view === null`(첫 순간): 이유 없이 쓸 수 없다. 툴바의 Reload, Fit, Responsive와 같다.
   - `read-failed`: "Can’t read this canvas."
   - `frame-unavailable`·`prototype-unavailable`: "Export isn’t available while this prototype can’t play." `prototype-unavailable`에서는 프레임이 그대로 있으므로 "frame"을 쓰지 않는다.
   - 내보내는 중: "Exporting".
2. 누르면 `prototype:export {root, path, frame}`(누른 순간의 target). main은 그 target을 지금 target과 비교하고, 다르거나 목록에서 사라졌으면 내보내지 않고 거절을 돌려준다. renderer는 거절 토스트를 보인다(결정 14). 창에서 이미 내보내는 중이면 거절한다.
3. 저장 패널(부모: 프로토타입 창, 기본 이름 `prototypeExportName(path, frame)`). 취소면 끝. 고르면 `prototype:exportRunning` → 진행 토스트 → `runExport(…, {frame})` → `interpretExport` → 결과 토스트.
   - 그 사이 창의 프레임이 바뀌어도 누른 프레임으로 끝까지 가고, 결과 토스트는 누른 프레임의 이름을 쓴다. 버튼은 끝날 때까지 "Exporting"이다(결정 15).
   - 그 사이 창이 닫히면 CLI는 끝까지 돌아 파일을 쓰고, 결과는 어디에도 보이지 않는다.
   - Show in Finder는 `prototype:revealExport`의 opaque id로만 연다.
4. 포커스는 저장 패널이 닫히면 Export 버튼으로 돌아간다(캔버스 툴바 Export와 같다). 툴바의 Tab 정지도 Export로 옮긴다(roving tabindex).

## 순수 함수로 뺄 것 (`/tdd` 대상)

Go
- `canvas.PrototypeTarget(c Canvas, id string) (PrototypeFrame, PrototypeRefusal)`: 0개·2개 이상·UTF-16 200 초과 → not found, 표시 없음·문법 위반 → not marked, 통과 시 `{ID, Title, Size}`. 경계 fixture: `<template>`와 `<template/>` 안 프레임, 표시 없는 같은 ID 두 개, 표시 `"390x844 "`, BOM, 200/201 UTF-16 단위의 astral ID.
- `cli.openInput`(확장): `--prototype`과 `--frame` 짝.
- `cli.exportInput`(새): `-o`, `--frame`, `--prototype` 짝.
- `cli.prototypeRequest(root, path, frame, mark)`, `cli.prototypeReply(line, target, secrets)`: v6 요청과 응답 판정. `v` 숫자 정규화, 다른 `v`는 `app_protocol_mismatch`, `bad_token`은 `app_not_running`(재실행 가능), `bad_request`는 `internal_error`, 응답에 token이나 runtime 경로가 있으면 거절.
- `export.AssemblePrototype`: 출력 고정 테스트(`TestAssemblePrototypeOutputIsPinned`)와 이름의 placeholder가 펼쳐지지 않는 테스트.

TypeScript (main)
- `prototype/requests.ts` `playTarget(root, path, frame, mark, entries)`(같은 canvas ID 두 행 → null)와 `validateCliPlay(value)`.
- `prototype/cliPlay.ts`(새) `cliPlayDecision({ready, firstRun, entries, request})`: `not_ready` → `busy` → `canvas_not_found` → play 순서.
- `canvasExport.ts` `prototypeExportName(path, frame)`: `/`, `:`, 제어 문자를 `-`로, 빈 stem 처리.
- `canvasExport.ts` `interpretExport`: 새 코드 두 개, `prototype: true` 결과.
- `prototype/requests.ts` `parseExportRequest(kind, value)`(target 모양 검사)와 `exportTargetMatches(clicked, current)`(root·경로·프레임 비교, 재생 중 ID가 겹친 경우 거절).

TypeScript (renderer)
- `prototype/view.ts` `exportAvailability(view, exporting)` → 사용 가능, 이유 없는 불가, 이유 있는 불가.
- `canvasRowMessages.ts` `exportToast` 확장(새 이유, 바뀐 target, 캔버스 전체가 들어 있다는 문장).

Viewer JS (`exportViewer.test.ts`가 실행)
- `isolate.js`의 격리 stylesheet 문자열과 `KEEP` 목록: `prototypeScript.ts`의 것과 같은 텍스트로 고정한다. 다른 viewer 복사본처럼, 앱 쪽이 바뀌고 복사본이 그대로면 테스트가 실패해야 한다.
- `isolate.js`의 같은 문서 판정(`href`가 `#`으로 시작)과 `prototype.js`의 보이기 판정(`ready`·`missing`·10 s).

## 포맷 변경

- **새 socket 버전 v6**: `schema/app-socket.v6.schema.json`. 요청 `{v: 6, token, root, path, frame, mark}`.
  - `path`는 v4의 그때 pattern을 따른다(지금 `^\.doan/(canvases|ds)/[^/]+\.html$`). `monorepo-services`의 결정 14는 v3–v5의 pattern만 넓히므로, 두 기능 중 나중에 병합되는 쪽이 v6 pattern과 fixture도 맞춘다.
  - `frame`은 v4의 `$defs/frameId`를 절대 `$id`로 참조한다(v3가 하는 방식).
  - `mark`는 convention 14 문법 패턴(`^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$`).
  - 응답 성공 `{v:6, ok:true, played:true}`, 실패 코드 `bad_request`, `bad_token`, `project_not_open`, `canvas_not_found`, `busy`, `not_ready`. 객체는 모르는 속성을 거절한다.
- `v` 상승: socket 버전만 6이 생긴다. v1–v5와 CLI envelope `v: 1`, `runtime.json`은 바뀌지 않는다. 새 오류 코드(`frame_not_found`, `not_prototype`, `canvas_unreadable`)는 패턴 규칙이라 envelope `v`를 올리지 않는다(ARCHITECTURE §12).
- 공유 fixture: `schema/fixtures/app-socket-v6/request/{valid,invalid}/`, `response/{valid,invalid}/`. Go(`formats`)와 TS(`validate.ts`) 테스트가 둘 다 읽는다. `app-socket/`이 아니라 따로 두는 이유는 v1 전용 reader가 그 디렉터리를 glob하기 때문이다(ARCHITECTURE §11).
- `schema/fixtures/prototype-mark/cases.json`은 그대로 읽힌다. Go `PrototypeTarget`의 표시 판정은 `canvas.PrototypeSizeValid`를 쓰므로 그 fixture가 이미 고정한다.
- `doan open`, `doan export`의 `result`는 스키마가 없다(§11 예외). 모양은 §12와 `open_test.go`, `export_test.go`가 고정한다.
- userData 파일, `.doan/config.json`, `sessions.v1`은 바뀌지 않는다.

## 규약 영향

- ARCHITECTURE §1 convention 14는 바뀌지 않는다. 새 속성과 새 `doan check` 규칙은 없다.
- guide item 14와 명령 줄이 바뀐다(에이전트 규칙). 바뀌는 guide 문장(제안):
  - `doan open <canvas path> [--frame <id> [--prototype]] --json`: with `--prototype`, play that marked frame alone in Doan’s prototype window; the main window stays. Returns `{opened, frame: "found", prototype: true}`. `frame_not_found` (no such frame, or its id is shared), `not_prototype` (no valid `data-doan-prototype`; mark it only if asked), `canvas_unreadable` (run `doan check`).
  - `doan export <canvas path> [--frame <id> --prototype] -o PATH --json`: with `--prototype`, the file plays only that frame, filling the browser window, but still contains the whole canvas; say so.

## 결정 영향

- **Deep link 보안 경계**(ARCHITECTURE §7 'Deep links'): `doan open`은 여전히 이동과 표시만 한다. 프로토타입 재생도 이미 보이는 캔버스를 다른 창에서 보이는 것이고, 쓰기·보내기·대화 시작·프로젝트 추가·설정 변경이 없다. 토큰이 있는 프로세스만 v6을 보낼 수 있다. `doan://`에는 더하지 않으므로 웹 페이지가 여는 경로는 늘지 않는다.
- **Out of scope 4**(자율 깨우기): 에이전트를 깨우지 않는다.
- **Out of scope 5**(서버): 파일은 사람이 직접 보낸다. 업로드와 호스팅 없음.
- **Export 경계**(ARCHITECTURE §3 'The serving scope is the export boundary'): `Inline`을 그대로 쓰고 새 경로 해석을 더하지 않는다.
- **내보낸 파일의 sandbox**: 지금 viewer는 `sandbox="allow-scripts"`다. 프로토타입 파일은 `allow-forms`를 더한다. 앱 프로토타입 창이 그렇게 하는 이유와 같다(없으면 `submit` 이벤트가 없어 `preventDefault` handler가 돌지 않는다). origin은 여전히 opaque다(`allow-same-origin` 없음). 기본 제출은 위 `submit` listener가 막는다. 캔버스 viewer는 바뀌지 않는다.
- **프로토타입 창 격리**: partition, 이동 gate, sender role 규칙은 그대로다. 프로토타입 창의 새 요청 두 개는 `prototype` role만 부를 수 있다.
- **PRODUCT 변경 필요**(마지막 task가 고친다):
  - §3 In scope 1(Show)과 8(Export).
  - §3 Out of scope 2: 프로토타입 표시는 창 재생 말고도 CLI 재생과 내보내기에 쓰인다.
  - §3 Out of scope 4: "`doan open` only moves"에 `--prototype`의 재생을 맞춘다.
  - §5 item 2 'Prototype window': "nothing is exported or hosted" → "nothing is hosted", 툴바(`prototype-responsive`가 쓰는 절)에 Export, 'Header'의 Back/Forward 기록 대상(`doan open --prototype`), Independence의 재생 목록.
  - §5 item 3 'Deep links': "same rules"와 "only moves". `--prototype`은 잠긴 페이지와 dialog에 막히지 않는다.
  - §5 item 3 'Export and viewer', item 10, item 12.

## PoC 의존

1. **내보낸 파일의 이동 차단과 격리**(Chromium, WebKit): `sandbox="allow-scripts allow-forms"` srcdoc iframe에서
   - (a) 캔버스의 submit handler가 돈 뒤 `window`의 bubble listener가 `preventDefault()`로 기본 제출을 막는지,
   - (b) `#`으로 시작하지 않는 링크 클릭을 같은 방법으로 막고, `#id` 클릭·`location.hash`·`pushState`(fragment와 경로)는 문서를 떠나지 않는지(srcdoc은 부모 base URL을 물려받는다),
   - (c) 캔버스 handler가 `stopPropagation()`할 때 어떻게 되는지,
   - (d) adopted stylesheet 격리가 WebKit에서도 같게 보이는지,
   - (e) viewport를 채운 iframe 안 `100vh`·`innerWidth`가 브라우저 창을 따르고 창 크기를 바꾸면 다시 배치되는지,
   - (f) JavaScript를 끄면 `<noscript>` 규칙으로 iframe이 숨는지.
   아직 확인하지 않은 가정이므로 첫 task로 둔다. 명령은 `node .scratch/prototype-export-poc/probe.mjs`(결정 11)이고, 같은 명령에 실제 출력 파일을 주면 tasks 9·10에서 같은 검사를 다시 돈다.
2. **다른 앱이 앞에 있을 때 프로토타입 창 활성화**: 메인 창 Play는 Doan이 이미 앞에 있을 때만 활성화를 썼다. 터미널이 앞에 있을 때 `host.activate()`가 Doan을 앞으로 가져오는지, 숨긴 앱에서 보이는지 확인되지 않았다. 구현 task의 `/runtime-test`에서 확인하고, 안 되면 `doan open`의 `opened()`(`app.show()` + `showWindow`) 방식을 따른다. `app.show()`는 ⌘H 전에 보이던 창만 되돌리므로, 닫아서 숨긴 메인 창은 나타나지 않아야 한다. 이것도 실제 앱에서 확인한다.

## POSTMORTEM에서 가져온 함정

- **2026-11-09 'Export inlined the wrong file after a nested self-closing `<template/>`'**: "every tokenizer walker that skips `<template>` content counts depth through `templateTag` … A new walker's tests include `<template/>` at top level and nested." → 프레임 판정은 `canvas.Parse`(HTML parser)를 쓰고 새 walker를 만들지 않는다. srcdoc 주입 위치는 기존 `measureOffset`을 쓴다. `PrototypeTarget` 테스트에 `<template/>` 안 프레임을 넣는다.
- **2026-11-07 '`doan export`'s cleanup did not run when the process was signalled'**: "subscribe to the signals before creating the owned file, remove only the path this process owns … Never sweep files by name pattern" → `writeExport`를 그대로 쓰고 새 쓰기 경로를 만들지 않는다.
- **2026-11-03 'Export refused icons the app showed, set as url() in a custom property'**: "any code that resolves a CSS `url()` must ask whether the token sits in a custom property value" → 이번 변경은 `url()`을 새로 해석하지 않는다. `Inline`을 바꾸지 않는다.
- **2026-11-09 '`open -g` to a running Doan brought its window over the app in use'**: "A handler for an OS 'bring forward' event must check `app.isActive()` before showing a window … `app.focus({ steal: true })` does not activate Doan while another app is in front." → CLI 재생의 활성화는 `activate` 이벤트에 기대지 않고 명시적으로 한다. PoC 2와 `/runtime-test`에서 터미널이 앞에 있는 경우를 확인한다.
- **2026-10-21 'TS and Go comment folding diverged on inputs the shared fixtures did not cover'**: "For any rule implemented in both TS and Go, state the exact character set / numeric range in design and add a fixture at the boundary" → 프레임 ID 상한은 두 단위가 섞여 있다. v4 스키마 `frameId`는 200 code point이고, 앱 `requests.ts` `MAX_REPORT_STRING`과 프로토타입 스크립트는 200 UTF-16 단위다. Go `PrototypeTarget`은 UTF-16 단위로 세어 200을 넘으면 `frame_not_found`로 거절한다(보드에서도 고를 수 없는 ID). v6 fixture에 200 code point지만 UTF-16 200을 넘는 ID를 넣는다(스키마는 통과, CLI는 보내지 않음).
- **2026-10-22 'A canvas link to a document without the canvas script left a dead board'**: "For any state that depends on a message from inside the iframe, write the e2e step for the document that never sends it." → 내보낸 파일의 바깥 페이지는 `isolate.js`의 응답에만 기대지 않는다. 10 s 타이머로 iframe을 보이고, 테스트에 응답하지 않는 문서를 넣는다.
- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: "a wrapper that adapts props for some states keeps the same component tree in every state" → 새 Export 버튼은 `TooltipTrigger`(asChild)를 지금 규칙대로 쓰고, 포커스가 있는 채로 사용 불가로 바뀌는 경우(내보내기 시작, 프레임 사라짐)를 테스트한다.
- **2026-11-07 'Radix added an open tooltip's id to an unavailable control's own description'**: "a control that carries its own description and also sits under a Radix tooltip keeps it through `TooltipTrigger`'s rule … check an open tooltip's attributes, not only the closed markup." → 프로토타입 창 Export를 `tooltip.describedby.test.tsx`에 일곱 번째 caller로 넣고, tooltip이 열린 상태의 `aria-describedby`를 확인한다.

## 알려진 한계 (PRODUCT·ARCHITECTURE 승격 때 적는다)

- 스크립트가 만드는 프레임은 CLI로 열거나 내보낼 수 없다(정적 판정). 그런 프레임을 재생 중인 창의 Export는 `frame_not_found` 토스트로 끝난다.
- 내보낸 파일에서 캔버스 스크립트의 `location` 변경과 `form.submit()`은 막지 못한다. 그러면 iframe 안 문서가 바뀌고 새로고침으로 돌아온다. PoC에서 더 찾은 실패도 여기에 적는다.
- 내보낸 파일은 앱 프로토타입 창의 Responsive 모드처럼 브라우저 viewport를 채우고(결정 5), Fit 모드는 없다. 앱의 기본인 Fit 모드(표시 크기 고정, 좁은 창에서는 비율 축소)와 다르므로, 표시 폭이 좁은 프레임도 파일에서는 창 폭으로 늘어난다. `/design-draft`에서 그림으로 보인다.
- `fetch` 같은 요청은 막지 않는다(앱과 같다). 외부 URL은 온라인에서만 열린다(기존 Export와 같다).

## 디자인 프리셋

- `doan design-skill --json`으로 목록을 보고 `clarify`(버튼 이름, 이유 문구, 토스트, 파일의 안내 줄)와 `harden`(사용 불가·진행·실패·JavaScript 없음 상태)을 읽었다. 이 문서의 문구는 그 기준으로 쓴 초안이고, 최종 문구는 `/design-draft`에서 정한다.
