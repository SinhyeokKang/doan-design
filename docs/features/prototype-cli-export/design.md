# prototype-cli-export — design

spec.md '결정'(사용자 확인)을 따른다: v6, 프로토타입 창만, `--frame <id> --prototype`, 캔버스 전체를 넣고 토스트와 guide로 알림, 프레임이 브라우저 viewport 전체를 채움, chrome 없음, [Export][Conversation], 링크 없음, header Export와 CLI만, CLI 정적 판정.

## 영향 받는 구성 요소

### CLI (Go)

- `cli/internal/canvas/`: 정적 판정 `PrototypeTarget`(아래 '순수 함수'). `canvas.Parse`가 이미 `Frame.Prototype`(원시 표시 값)과 `<template>` 밖 프레임만 모으므로 새 tokenizer walker는 없다.
- `cli/internal/cli/run.go`: `Flags.Prototype bool`, `--prototype` 플래그, `open`과 `export`의 허용 플래그(`export`에 `frame`, `prototype`), usage 줄 두 개.
- `cli/internal/cli/open.go`, `open_rules.go`: `--prototype`이면 캔버스를 `export.ReadFile`로 읽고(`.doan/` 안 경로, 크기 상한은 export와 같은 50 MiB) `canvas.Parse` → `PrototypeTarget` → v6 요청. v4 경로는 바뀌지 않는다. 새 파일 `prototype_rules.go`에 v6 요청·응답 규칙을 둔다(`open_rules.go`의 `decodeOpenReply`·`withoutSecrets` 방식을 따른다).
- `cli/internal/cli/export.go`: `--frame`/`--prototype` 짝 검사(`--prototype`은 `--frame` 필수, `--frame`만은 `usage_error`), 파싱 직후 `PrototypeTarget`, `export.Assemble` 대신 `export.AssemblePrototype`. 결과에 `prototype: {frame, size}`. 거절 순서: 인자 → 저장소 → 캔버스 → **프레임 판정** → 참조 → 크기 → 출력. 프레임 판정을 참조 검사 앞에 두는 이유: 틀린 프레임 ID로 무거운 inline을 돌리지 않는다.
- `cli/internal/cli/envelope.go` `ExitCode`: `frame_not_found`, `not_prototype` → 2. 빠지면 exit 1(internal)로 읽힌다(ARCHITECTURE §12).
- `cli/internal/export/assemble.go`: `AssemblePrototype(meta, proto, html)`. 같은 `fillShell`, `writeEscaped`, `measureOffset`, BOM 제거를 쓰고 shell만 다르다. `Assemble`은 바이트 단위로 그대로다.
- `cli/internal/export/viewer/`: 새 파일 `prototype.html`(shell), `prototype.css`, `prototype.js`(바깥 페이지: 메시지 수신과 상태 줄), `isolate.js`(srcdoc 안 첫 스크립트: 프레임 찾기와 격리, 이동 차단). `go:embed viewer/*`가 그대로 포함한다.
- `cli/internal/cli/skill.md`(guide): `doan open`, `doan export` 줄과 item 14.
- `cli/internal/formats/`: v6 검증기.

### 앱 (Electron + TS)

- `app/src/main/runtime.ts` `answerLine`: `v: 6` 분기. schema → token → 등록된 root(`project_not_open`) → `state.playPrototype(value)`.
- `app/src/main/index.ts`: `playPrototype` 연결. 준비 판정(`openLinksReady()`와 대상 root가 loading이 아님) → 첫 실행(`onboardingOpen`, `buddyIntroOpen`) → 목록 판정(`resolveOpenTarget` 재사용) → `prototype.controller.playFromCli(...)`.
- `app/src/main/prototype/requests.ts`: `validatePlay`에서 row와 canvas key를 찾는 부분을 `playTarget(root, path, frame, mark, entries)`로 빼고, `validatePlay`(메인 창)와 v6 요청이 함께 쓴다.
- `app/src/main/prototype/controller.ts`: `playFromCli(request)`. 판정을 마친 target과 크기로 `transitions.play`를 그대로 부른다. 결과 `played`(창을 열었거나 다른 프레임으로 바꿈) 또는 `forward`(이미 그 프레임) 또는 `refused`(목록에서 사라짐)를 돌려준다.
- `app/src/main/prototypeWindow.ts`: `activate`가 다른 앱이 앞에 있을 때도 Doan을 앞으로 가져오는지 확인하고, 숨긴 앱(`app.hide`)이면 `app.show()` 후 창을 보인다(아래 POSTMORTEM 2026-11-09).
- `app/src/main/prototype/ipc.ts`: 채널 `prototype:export`(`{gen}`), `prototype:revealExport`(opaque id), 이벤트 `prototype:exportRunning`. `PROTOTYPE_WINDOW_REQUESTS`에 앞의 둘을 더한다. 메인 창의 `mainOnly`는 넓히지 않는다.
- `app/src/main/canvasExport.ts`: `createCanvasExport`가 프레임 있는 요청도 받게 한다(키 `root\npath\nframe`, 메인 창 Export와 따로 잠금). `runExport`(`app/src/main/cli.ts`)에 `--frame <id> --prototype` 인자. `interpretExport`에 `frame_not_found` → `notFound`, `not_prototype` → `notMarked`. 저장 패널은 프로토타입 창을 부모로 연다.
- `app/src/renderer/prototype/`: `WindowShell`의 header에 Export 버튼(`IconTip`, `aria-disabled`와 이유 설명), 토스트 호스트(`app/src/renderer/Toast.tsx` 재사용), `PrototypeWindow.tsx`의 호출. 프로토타입 preload(`window.doanPrototype`)에 `export(gen)`, `revealExport(id)`, `onExportRunning`.
- **header 배치는 세 기능에 걸쳐 함께 정한다**: 이 기능의 Export, `prototype-conversation`의 대화 버튼, 곧 쓸 `prototype-responsive`의 Fit / Responsive 모드 전환이 모두 프로토타입 창 header에 들어간다. 오른쪽 끝은 [Export][Show conversation]으로 정해졌고(결정 7, `prototype-conversation`과 같은 결정), 모드 전환의 자리와 프레임 이름 버튼의 폭은 세 기능의 초안이 맞춰 정한다.
- 형제 기능 `prototype-conversation`과 겹치는 곳: header 오른쪽 끝, 프레임 이름 버튼이 오른쪽에 비워 둘 폭, 프로토타입 창의 토스트 호스트(그쪽도 `WindowShell`에 토스트 자리를 둔다). 토스트 호스트는 하나만 두고, 먼저 합쳐지는 기능이 만들고 뒤 기능이 쓴다.
- `app/src/renderer/canvasRowMessages.ts`: 토스트 문구에 프레임용 이유 두 개와, 파일에 캔버스 전체가 들어 있다는 성공 토스트 문장(결정 4). 이름 자리에는 프레임 제목(없으면 ID)을 넣는다.
- `app/src/main/exportViewer.test.ts`: 새 viewer 파일의 고정 검사(아래).

### 포맷

- `schema/app-socket.v6.schema.json`, `schema/fixtures/app-socket-v6/{request,response}/{valid,invalid}/`, `schema/embed.go`, `app/src/formats/validate.ts`, `cli/internal/formats/validate.go`. 아래 '포맷 변경'.

### Skills와 eval

- guide 변경은 `/agent-eval` 대상이다(AGENTS.md: guide, CLI 출력과 메시지가 바뀌는 PR). 프로토타입 열기 시나리오는 fake app(`eval/lib/socket.ts`)이 v6에 답해야 한다. 지금은 v2–v5만 등록한다.

## 흐름

### `doan open <canvas> --frame <id> --prototype`

1. 인자: `--prototype`에 `--frame`이 없으면 `usage_error`("--prototype needs --frame <id>"). `--frame` 검사는 지금의 `checkFrame`(비어 있지 않음, 200 code point, 제어 문자 없음).
2. 저장소, `workTarget`, 파일 존재(`canvas_not_found`)는 지금과 같다.
3. 캔버스를 읽고 `PrototypeTarget(model, id)`: 일치하는 프레임 0개, 2개 이상, ID가 UTF-16 200 단위 초과 → `frame_not_found`. 표시 없음, 문법 위반 → `not_prototype`. 통과하면 원시 표시 값(크기 힌트)을 얻는다. 파싱 실패와 50 MiB 초과는 `not_prototype`이 아니라 `canvas_unreadable`(exit 2, nextSteps: `doan check`)로 나눈다.
4. v6 요청 `{v:6, token, root, path, frame, mark}`를 `bootstrap(ctx, false, …)`로 보낸다(앞에서 열기, `not_ready` 재시도, `busy` 변환은 v4와 같다).
5. 앱: schema → token → root → 준비(`not_ready`) → 첫 실행(`busy`) → 목록(`canvas_not_found`: 목록에 없거나 canvas ID가 둘 이상) → `playTarget` → `playFromCli`. 응답 `{v:6, ok:true, played:true}`. 재생 시작이나 앞으로 가져오기는 응답 전에 동기로 일어난다(CLI의 2 s 안).
6. CLI 결과 `{opened: true, frame: "found", prototype: true}`, 사람용 줄 "Playing <frame> from <path> in Doan’s prototype window".

메인 창 Play와의 차이는 출발점뿐이다. 창 상태 전이(`windowState.ts`)는 바뀌지 않는다. CLI 재생도 "사람의 재생"으로 창을 활성화하고 기록에 남는다(ARCHITECTURE §3 'One window'의 활성화 목록에 더한다).

### `doan export <canvas> --frame <id> --prototype -o <file>`

1. 지금의 export 순서에 프레임 판정을 파싱과 `doan:width` 검사 직후에 넣는다.
2. `Inline`은 그대로 돈다(캔버스 전체).
3. `AssemblePrototype(Meta{Name, Width}, Proto{Frame, Title}, inlined.HTML)`:
   - 바깥 페이지 `prototype.html`: `<title>`은 "<title or id> — Prototype"(HTML 이스케이프). `<iframe sandbox="allow-scripts allow-forms" srcdoc>`가 CSS만으로 브라우저 viewport 전체(`position: fixed; inset: 0; width: 100%; height: 100%; border: 0`)를 채운다. 바깥 페이지는 스크롤하지 않는다. 그래서 iframe의 `innerWidth`, `innerHeight`, media query, `100vh`가 브라우저 창을 따르고, 창 크기를 바꾸면 프레임이 다시 배치된다. 표시 크기는 판정(표시가 있고 문법에 맞는지)에만 쓰고 크기에는 쓰지 않는다. JavaScript가 없으면 `<noscript>` 줄만 보인다.
   - srcdoc의 `<head>` 첫 스크립트는 `lib.js` 일부와 `isolate.js`를 함수로 감싼 것이다(`measure.js`와 같은 위치와 방식, `measureOffset` 재사용).
   - `isolate.js`: DOMContentLoaded에(없으면 `load` handler 뒤에) 프레임을 ID로 찾고(정확히 하나), 프로토타입 창 `prototypeScript.ts`의 `isolate`와 같은 표시 속성과 adopted stylesheet로 격리한다. 표시 값은 다시 보지 않는다(크기는 정적 표시에서 왔다). 결과를 부모에 한 번 알린다(`ready` 또는 `missing`).
   - 이동 차단: `window`에 bubble 단계 `submit` listener를 달아 늘 `preventDefault()`(캔버스의 handler가 먼저 돈다), `click` listener로 같은 문서가 아닌 `<a href>` 활성화를 `preventDefault()`. `location` 대입, `location.reload()`, 스크립트의 `form.submit()`은 막지 못한다.
   - 바깥 페이지는 `missing`이면 "This prototype’s frame didn’t load." 줄을 보인다. 응답이 아예 없으면(파서를 막는 문서) iframe을 그대로 둔다(아래 POSTMORTEM 2026-10-22).
4. 결과 `{path, output, bytes, frames, external, links, prototype: {frame, size}}`. 텍스트 "Exported <path> frame <id> to <output> (<n> bytes)".

### 프로토타입 창의 Export

1. 버튼은 `view.phase`가 `ready`, `loading`, `init-failed`일 때 쓸 수 있다. `read-failed`는 "Can’t read this canvas.", `frame-unavailable`·`prototype-unavailable`은 "Export isn’t available while this frame is unavailable.", 내보내는 중은 "Exporting". 이유는 툴바 Export와 같은 툴팁과 sr-only 설명이다.
2. 누르면 `prototype:export {gen}`. main은 현재 gen이 아니면 무시하고, 현재 target에서 root와 row path를 찾는다(목록에서 사라졌으면 `refused`).
3. 저장 패널(부모: 프로토타입 창, 기본 이름 `prototypeExportName(path, frame)`). 취소면 끝. 고르면 `prototype:exportRunning` → 진행 토스트 → `runExport(…, {frame})` → `interpretExport` → 결과 토스트. Show in Finder는 `prototype:revealExport`의 opaque id로만 연다(메인 창과 같은 `written` 상한 16).
4. 포커스는 저장 패널이 닫히면 Export 버튼으로 돌아간다(툴바 Export와 같다).

## 순수 함수로 뺄 것 (`/tdd` 대상)

Go
- `canvas.PrototypeTarget(c Canvas, id string) (PrototypeFrame, PrototypeRefusal)`: 0개·2개 이상·UTF-16 200 초과 → not found, 표시 없음·문법 위반 → not marked, 통과 시 `{ID, Title, Size}`. 경계 fixture: `<template>` 안 프레임, 표시 없는 같은 ID 두 개, 표시 `"390x844 "`, BOM, 200/201 UTF-16 단위의 astral ID.
- `cli.openInput`(확장): `--prototype`과 `--frame` 짝.
- `cli.exportInput`(새): `-o`, `--frame`, `--prototype` 짝.
- `cli.prototypeRequest(root, path, frame, mark)`, `cli.prototypeReply(line, target, secrets)`: v6 요청과 응답 판정. `v` 숫자 정규화, 다른 `v`는 `app_protocol_mismatch`, `bad_token`은 `app_not_running`(재실행 가능), `bad_request`는 `internal_error`.
- `export.AssemblePrototype`: 출력 고정 테스트(`TestAssemblePrototypeOutputIsPinned`)와 이름의 placeholder가 펼쳐지지 않는 테스트.

TypeScript (main)
- `prototype/requests.ts` `playTarget(root, path, frame, mark, entries)`와 `validateCliPlay(value)`.
- `prototype/cliPlay.ts`(새) `cliPlayDecision({ready, firstRun, entries, request})`: `not_ready` → `busy` → `canvas_not_found` → play 순서.
- `canvasExport.ts` `prototypeExportName(path, frame)`: `/`, `:`, 제어 문자를 `-`로, 빈 stem 처리.
- `canvasExport.ts` `interpretExport`: 새 코드 두 개, `prototype` 결과.
- `prototype/requests.ts` `parseExportRequest(kind, value)`(gen만).

TypeScript (renderer)
- `prototype/view.ts` `exportAvailability(view, exporting)` → 사용 가능 또는 이유.
- `canvasRowMessages.ts` `exportToast` 확장(새 이유, 캔버스 전체가 들어 있다는 문장).

Viewer JS (`exportViewer.test.ts`가 실행)
- `isolate.js`의 격리 stylesheet 문자열과 `KEEP` 목록: `prototypeScript.ts`의 것과 같은 텍스트로 고정한다. 다른 viewer 복사본처럼, 앱 쪽이 바뀌고 복사본이 그대로면 테스트가 실패해야 한다.

## 포맷 변경

- **새 socket 버전 v6**: `schema/app-socket.v6.schema.json`. 요청 `{v: 6, token, root, path, frame, mark}`. `path`는 v4와 같은 `^\.doan/(canvases|ds)/[^/]+\.html$`, `frame`은 v4의 `$defs/frameId`를 절대 `$id`로 참조(v3가 하는 방식), `mark`는 convention 14 문법 패턴(`^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$`). 응답 성공 `{v:6, ok:true, played:true}`, 실패 코드 `bad_request`, `bad_token`, `project_not_open`, `canvas_not_found`, `busy`, `not_ready`. 객체는 모르는 속성을 거절한다.
- `v` 상승: socket 버전만 6이 생긴다. v1–v5와 CLI envelope `v: 1`, `runtime.json`은 바뀌지 않는다. 새 오류 코드(`frame_not_found`, `not_prototype`, `canvas_unreadable`)는 패턴 규칙이라 envelope `v`를 올리지 않는다(ARCHITECTURE §12).
- 공유 fixture: `schema/fixtures/app-socket-v6/request/{valid,invalid}/`, `response/{valid,invalid}/`. Go(`formats`)와 TS(`validate.ts`) 테스트가 둘 다 읽는다. `app-socket/`이 아니라 따로 두는 이유는 v1 전용 reader가 그 디렉터리를 glob하기 때문이다(ARCHITECTURE §11).
- `schema/fixtures/prototype-mark/cases.json`은 그대로 읽힌다. Go `PrototypeTarget`의 표시 판정은 `canvas.PrototypeSizeValid`를 쓰므로 그 fixture가 이미 고정한다.
- `doan open`, `doan export`의 `result`는 스키마가 없다(§11 예외). 모양은 §12와 `open_test.go`, `export_test.go`가 고정한다.
- userData 파일, `.doan/config.json`, `sessions.v1`은 바뀌지 않는다.

## 규약 영향

- ARCHITECTURE §1 convention 14는 바뀌지 않는다. 새 속성과 새 `doan check` 규칙은 없다.
- guide item 14와 명령 줄이 바뀐다(에이전트 규칙). 바뀌는 guide 문장(제안):
  - `doan open <canvas path> [--frame <id> [--prototype]] --json`: with `--prototype`, play that marked frame alone in Doan’s prototype window; the main window stays. Returns `{opened, frame: "found", prototype: true}`. `frame_not_found` (no such frame, or its id is shared), `not_prototype` (no valid `data-doan-prototype`; mark it only if asked).
  - `doan export <canvas path> [--frame <id> --prototype] -o PATH --json`: with `--prototype`, the file plays only that frame, filling the browser window, but still holds the whole canvas; say so.

## 결정 영향

- **Deep link 보안 경계**(ARCHITECTURE §7 'Deep links'): `doan open`은 여전히 이동과 표시만 한다. 프로토타입 재생도 이미 보이는 캔버스를 다른 창에서 보이는 것이고, 쓰기·보내기·대화 시작·프로젝트 추가·설정 변경이 없다. 토큰이 있는 프로세스만 v6을 보낼 수 있다. `doan://`에는 더하지 않으므로 웹 페이지가 여는 경로는 늘지 않는다.
- **Out of scope 4**(자율 깨우기): 에이전트를 깨우지 않는다.
- **Out of scope 5**(서버): 파일은 사람이 직접 보낸다. 업로드와 호스팅 없음.
- **Export 경계**(ARCHITECTURE §3 'The serving scope is the export boundary'): `Inline`을 그대로 쓰고 새 경로 해석을 더하지 않는다.
- **내보낸 파일의 sandbox**: 지금 viewer는 `sandbox="allow-scripts"`다. 프로토타입 파일은 `allow-forms`를 더한다. 앱 프로토타입 창이 그렇게 하는 이유와 같다(없으면 `submit` 이벤트가 없어 `preventDefault` handler가 돌지 않는다). origin은 여전히 opaque다(`allow-same-origin` 없음). 기본 제출은 위 `submit` listener가 막는다. 캔버스 viewer는 바뀌지 않는다.
- **프로토타입 창 격리**: partition, 이동 gate, sender role 규칙은 그대로다. 프로토타입 창의 새 요청 두 개는 `prototype` role만 부를 수 있다.
- **PRODUCT 변경 필요**: §3 In scope 1(Show)과 8(Export), §5 item 2 'Prototype window'("nothing is exported or hosted", header, Independence의 재생 목록), item 3 'Export and viewer', item 10, item 12. 마지막 task가 고친다.

## PoC 의존

1. **내보낸 파일의 이동 차단**(Chromium, WebKit): `sandbox="allow-scripts allow-forms"` srcdoc iframe에서 (a) 캔버스의 submit handler가 돈 뒤 `window`의 bubble listener가 `preventDefault()`로 기본 제출을 막는지, (b) 다른 문서 링크 클릭을 같은 방법으로 막는지, (c) adopted stylesheet 격리가 WebKit에서도 같게 보이는지. 아직 확인하지 않은 가정이므로 첫 task로 둔다(`.scratch/prototype-export-poc/`, Playwright).
2. **다른 앱이 앞에 있을 때 프로토타입 창 활성화**: 메인 창 Play는 Doan이 이미 앞에 있을 때만 활성화를 썼다. 터미널이 앞에 있을 때 `host.activate()`가 Doan을 앞으로 가져오는지, 숨긴 앱에서 보이는지 확인되지 않았다. 구현 task의 `/runtime-test`에서 확인하고, 안 되면 `doan open`의 `opened()`(`app.show()` + `showWindow`) 방식을 따른다.

## POSTMORTEM에서 가져온 함정

- **2026-11-09 'Export inlined the wrong file after a nested self-closing `<template/>`'**: "every tokenizer walker that skips `<template>` content counts depth through `templateTag` … A new walker's tests include `<template/>` at top level and nested." → 프레임 판정은 `canvas.Parse`(HTML parser)를 쓰고 새 walker를 만들지 않는다. srcdoc 주입 위치는 기존 `measureOffset`을 쓴다. `PrototypeTarget` 테스트에 `<template/>` 안 프레임을 넣는다.
- **2026-11-07 '`doan export`'s cleanup did not run when the process was signalled'**: "subscribe to the signals before creating the owned file, remove only the path this process owns … Never sweep files by name pattern" → `writeExport`를 그대로 쓰고 새 쓰기 경로를 만들지 않는다.
- **2026-11-03 'Export refused icons the app showed, set as url() in a custom property'**: "any code that resolves a CSS `url()` must ask whether the token sits in a custom property value" → 이번 변경은 `url()`을 새로 해석하지 않는다. `Inline`을 바꾸지 않는다.
- **2026-11-09 '`open -g` to a running Doan brought its window over the app in use'**: "A handler for an OS 'bring forward' event must check `app.isActive()` before showing a window … `app.focus({ steal: true })` does not activate Doan while another app is in front." → CLI 재생의 활성화는 `activate` 이벤트에 기대지 않고 명시적으로 한다. PoC 2와 `/runtime-test`에서 터미널이 앞에 있는 경우를 확인한다.
- **2026-10-21 'TS and Go comment folding diverged on inputs the shared fixtures did not cover'**: "For any rule implemented in both TS and Go, state the exact character set / numeric range in design and add a fixture at the boundary" → 프레임 ID 상한은 두 단위가 섞여 있다. v4 스키마 `frameId`는 200 code point이고, 앱 `requests.ts` `MAX_REPORT_STRING`과 프로토타입 스크립트는 200 UTF-16 단위다. Go `PrototypeTarget`은 UTF-16 단위로 세어 200을 넘으면 `frame_not_found`로 거절한다(보드에서도 고를 수 없는 ID). v6 fixture에 200 code point지만 UTF-16 200을 넘는 ID를 넣는다(스키마는 통과, CLI는 보내지 않음).
- **2026-10-22 'A canvas link to a document without the canvas script left a dead board'**: "For any state that depends on a message from inside the iframe, write the e2e step for the document that never sends it." → 내보낸 파일의 바깥 페이지가 `isolate.js`의 응답을 기다리는 상태를 만들지 않는다. 응답 없이도 iframe이 보이게 하고, 테스트에 응답하지 않는 문서를 넣는다.
- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: "a wrapper that adapts props for some states keeps the same component tree in every state" → 새 Export 버튼은 `TooltipTrigger`(asChild)를 지금 규칙대로 쓰고, 포커스가 있는 채로 사용 불가로 바뀌는 경우(내보내기 시작, 프레임 사라짐)를 테스트한다.

## 알려진 한계 (PRODUCT·ARCHITECTURE 승격 때 적는다)

- 스크립트가 만드는 프레임은 CLI로 열거나 내보낼 수 없다(정적 판정). 그런 프레임을 재생 중인 창의 Export는 `frame_not_found` 토스트로 끝난다.
- 내보낸 파일에서 캔버스 스크립트의 `location` 변경과 `form.submit()`은 막지 못한다. 그러면 iframe 안 문서가 바뀌고 새로고침으로 돌아온다.
- 앱 프로토타입 창은 표시 폭이 `PROTOTYPE_NARROW_BELOW`보다 좁으면 그 폭을 지키고 가운데 둔다(ARCHITECTURE §3 'Fit'). 파일은 viewport 전체를 채우므로(결정 5) 좁은 표시도 창 폭으로 늘어난다. 앱과 다른 점이고, `/design-draft`에서 그림으로 보인다.
- `fetch` 같은 요청은 막지 않는다(앱과 같다). 외부 URL은 온라인에서만 열린다(기존 Export와 같다).

## 디자인 프리셋

- `doan design-skill --json`으로 목록을 보고 `clarify`(버튼 이름, 이유 문구, 토스트, 파일의 안내 줄)와 `harden`(사용 불가·진행·실패·JavaScript 없음 상태)을 읽었다. 이 문서의 문구는 그 기준으로 쓴 초안이고, 최종 문구는 `/design-draft`에서 정한다.
