# 프로토타입 재생에서 프레임 바깥에 캔버스 배경이 비치지 않게 — tasks

순서: 테스트(실패 확인) → 두 스크립트 구현과 생성 파일 → 실제 앱 확인 → 문서 승격 → 게이트. `/ship bypass`가 이 순서를 따른다. 커밋 타입이 `fix:`이므로 `/ship`의 `/postmortem` 단계도 실행된다.

## T1. 테스트 (/tdd)

- **fake 하네스 준비**: 구현이 들어가도 기존 fake 테스트가 깨지지 않게 한다.
  - `prototypeScript.test.ts`의 `fakeDocument`와 `exportViewer.test.ts`의 `runIsolate`에 전역 `getComputedStyle` 스텁을 넣는다. 기본값은 투명이고, 케이스별로 값을 바꿀 수 있게 한다.
  - `runIsolate`의 `document`에 `documentElement`와 `body`를 넣는다.
- **순수 함수 표**: `exportViewer.test.ts`에서 `loadFunctions(isolateJs, ["ownBackground"])`로 design.md 'ownBackground' 표 전체를 돌린다.
- **일치 비교**: `isolate.js`와 `prototypeScript.ts`의 `ownBackground` 본문을 `extractFunction`과 `normalize`로 비교한다. 한쪽이 바뀌면 실패하는 drift 케이스도 넣는다. 기존 `isolationSheet` 비교는 새 규칙을 포함한 채 그대로 통과해야 한다.
- **fake 시트 텍스트**: "resolving and isolating the frame"에 새 규칙 텍스트를 확인하는 단언과 `data-doan-proto-clear` 부여·미부여 케이스를 더한다.
- **실제 DOM (`prototypeScript.test.ts` "in a real DOM")**: 픽스처가 조상에 칠을 먼저 준다.
  - `html`은 `body`와 다른 배경색을 가진다(`html` 쪽 선택자 확인).
  - `body`는 `linear-gradient` 배경을 가진다.
  - 중간 감싸개는 `box-shadow`, `outline`, `border-image`를 가진다.
  - 프레임은 흰 배경과 `border-radius: 24px`, `box-shadow`를 가진다.
- **실제 DOM 단언**:
  - 불투명 프레임: `html`·`body`·감싸개의 계산값이 `background-image: none`, `background-color: rgba(0, 0, 0, 0)`, `box-shadow: none`, `outline-style: none`, `border-image-source: none`이다. 프레임 자신의 배경·`border-radius`·`box-shadow`는 그대로다.
  - 투명 프레임, 반투명(`rgba(255, 255, 255, 0.5)`) 프레임, 배경색 없이 `linear-gradient`나 반투명 텍스처만 있는 프레임: 조상의 칠이 그대로다(회귀 방지).
  - 프레임이 `body`의 직계 자식인 경우와 `body` 자체인 경우: 직계 자식이면 지우고, `body` 자체면 지우지 않는다.
  - 중첩 프레임: 바깥 `data-doan-frame`이 조상이고 자기 배경을 가진다. 안쪽 프레임을 재생하면 바깥 프레임의 칠은 지워지고 안쪽 프레임의 칠은 남는다.
  - 조상의 `::before`(흐름 안, `content` 있음)는 그대로 그려진다(완료 조건 4).
  - 늦은 스타일시트: 뒤에 스크립트가 없는 `<link rel="stylesheet" href="data:text/css,…">`로 프레임 배경을 주어도, `load` 뒤에 `data-doan-proto-clear`가 붙는다.
- **실제 DOM (`exportViewer.test.ts` srcdoc)**: `isolate.js`로 불투명 프레임(조상 칠 제거), 투명 프레임, 그라디언트만 있는 프레임(둘 다 그대로)을 확인한다. 플레이어 srcdoc(`isolate.js`와 `prototypeScriptSource`를 함께)에서 두 번 판단해도 결과가 같은지 확인한다.
- 검증: `npm --prefix app test`에서 새 테스트가 빨갛게 실패하고, 기존 테스트는 통과한다.
- **커밋 경계**: `test: pin prototype isolation clearing ancestor paint`

## T2. 두 스크립트 구현과 생성 파일 (/implement)

- `prototypeScript.ts`와 `isolate.js`에 `ownBackground`, `judge`, 두 번째 판단, 시트 규칙을 같은 본문으로 더한다. 주석에는 "왜"만 영어로 쓴다(`docs/features/`를 인용하지 않는다). `isolate.js`의 "The same list and sheet as prototypeScript.ts's isolate" 주석에 판단 함수도 적는다.
- `node app/scripts/viewerInspect.mjs`로 `cli/internal/export/viewer/viewerApp.js`를 다시 생성한다.
- 검증 (모두 통과):
  - `npm --prefix app test`
  - `npm --prefix app run typecheck`, `npm --prefix app run lint`
  - `node app/scripts/viewerInspect.mjs --check`
- **커밋 경계**: `fix(prototype): stop ancestor paint showing around a playing frame` (`viewerApp.js` 포함)

## T3. 실제 앱과 내보낸 파일 확인 (/runtime-test)

- 임시 저장소에 캔버스 하나를 만든다. 사용자 저장소는 열지 않는다. 캔버스의 프레임은 다음과 같다.
  - (a) 흰 배경, `border-radius: 24px`, gray-800 `body`
  - (b) 어두운 배경의 둥근 프레임
  - (c) (a)와 같고 `:root { color-scheme: dark }`
  - (d) 투명 프레임
  - (e) 배경색 없이 반투명 그라디언트만 있는 프레임(지금과 같은지 확인)
- **앱**: `/runtime-test`의 격리 방식(임시 userData·HOME·SHELL, `DOAN_CLI`)으로 dev 앱을 띄운다. 각 프레임을 fit과 responsive로 재생하고, 한 run 안에서 Fit→Responsive로 바꿔도 결과가 유지되는지 본다.
- **내보낸 파일**:
  - `go run ./cli/cmd/doan export <canvas> --frame <id> --prototype -o <tmp>/proto.html --repo <tmp>`
  - `go run ./cli/cmd/doan export <canvas> -o <tmp>/canvas.html --repo <tmp>`로 내보낸 뒤 플레이어(`#doan-play=`)로 같은 프레임을 연다.
  - 브라우저에서 여는 방법은 명령이 정해지지 않았다(사용자 확인 필요). `/runtime-test`가 쓰는 Playwright 프로브를 `.scratch/runtime-test/prototype-frame-only/`에 둔다.
  - `color-scheme: light dark` 캔버스를 Playwright의 `colorScheme: 'dark'`로도 한 번 연다.
- 검증:
  - 위치별로 모서리 곡선 안쪽 픽셀의 RGB를 기록하고, 완료 조건 1의 호스트 색과 같은지 본다.
  - (c)가 어둡게 남으면 한계로 기록한다.
  - 스크린샷과 측정값은 `.scratch/runtime-test/prototype-frame-only/`에 둔다.
  - (a)와 (b)의 fit 스크린샷을 사용자에게 보여준다(spec '사람이 보는 결과').

## T4. 문서 승격과 기능 문서 삭제

- `docs/PRODUCT.md`:
  - §5 item 2 'Prototype window' 'Content': 조상 칠 규칙(불투명 배경색 기준, `html`·`body` 프레임 제외)을 현재 규칙으로 적는다.
  - §5 item 3 'Prototype file'과 'Browser player': item 2 'Content' 규칙을 따른다고 적는다.
- `docs/ARCHITECTURE.md`:
  - §3 'Prototype window' 'Rendering in place': `ownBackground` 판단과 두 판단 시점, 붙이기만 하는 속성, 시트 규칙을 적는다. 측정값을 칠에만 쓰고 상자에는 쓰지 않는다는 구분도 적는다.
  - §3 'Exported canvas and viewer' 'Isolation': 판단 함수도 글자로 고정된 복사본이라고 적는다.
  - 한계를 적는다: `background: inherit`, 프레임 바깥에 나온 내용, 조상 배경을 읽는 스크립트, T3에서 확인한 `color-scheme` 결과.
- `docs/BACKLOG.md`:
  - 'Undecided'에 조상 `::before`·`::after` 숨김 여부를 적는다. 숨기면 모달 딤 배경이 사라질 수 있다.
  - 내보낸 프로토타입 파일 항목(PRODUCT §5 item 3 'Prototype file')에 WebKit 미검증을 적는다. T3에서 한계가 나오면 그것도 적는다.
- 비공개 저장소나 캔버스 이름은 승격 문서에 쓰지 않는다.
- `docs/features/prototype-frame-only/`를 삭제한다.
- 검증 (모두 성공):
  - `grep -n "data-doan-proto-clear" docs/ARCHITECTURE.md`가 결과를 낸다.
  - `grep -n "own background" docs/PRODUCT.md`가 §5 item 2 'Content'에서 결과를 낸다.
  - `test ! -d docs/features/prototype-frame-only`가 성공한다.
- **커밋 경계**: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove prototype-frame-only`를 문서별로 나눈다.

## T5. 전체 게이트 (`/ship` 10단계 전)

- 검증:
  - `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
  - `git diff --stat origin/develop...HEAD -- app/src/main/canvasScript.ts cli/internal/export/viewer/measure.js`가 비어 있다(완료 조건 7).
