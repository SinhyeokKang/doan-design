# prototype-late-frame — tasks

1. **테스트 harness 확장**: `app/src/main/prototypeScript.test.ts`의 fake context에 delay를 지키는 timer와 fake `MutationObserver`를 넣는다. 기존 case는 그대로 통과해야 한다.
   - 검증: `npm --prefix app test` (기존 prototypeScript tests green)
2. **주입 script 유예**: design의 확인 경우를 먼저 test로 쓰고 red를 확인한 뒤 구현한다. `prototypeScript.ts` 머리 주석을 고친다.
   - 검증: `npm --prefix app test` (새 case가 먼저 red, 구현 뒤 green), `npm --prefix app run typecheck`
   - — commit 경계 (`test:` → `fix:`) —
3. **export viewer**: `isolate.js`에 같은 유예와 판정 규칙을 넣고 주석을 고친다. 그다음 `node app/scripts/viewerInspect.mjs`로 `viewerApp.js`를 다시 생성하고, `output_test.go`의 export digest를 갱신한다. `exportViewer.test.ts`에 isolate.js의 유예 case, 늦게 찾은 frame의 link 이동, 두 script의 2초 literal 일치를 먼저 쓰고 red를 확인한다.
   - 검증: `npm --prefix app test` (exportViewer tests: 새 case가 먼저 red, 구현 뒤 green), `node app/scripts/viewerInspect.mjs --check`, `go test ./...`
   - — commit 경계 (`test:` → `fix:`) —
4. **통합 gate**: `node .agents/skills/verify/scripts/verify.mjs`
   - 검증: 종료 코드 0
5. **실제 앱과 export viewer 확인** (`/runtime-test`): 시험용 canvas 두 개를 쓴다. 하나는 `load` 뒤 500ms에 표시된 frame을 만들고, 다른 하나는 3초 뒤에 만든다.
   - 격리된 앱에서 500ms canvas의 Play를 누른다. prototype window의 상태 scene("Frame unavailable" heading)이 한 번도 DOM에 나타나지 않고 frame이 재생되면 통과다.
   - 3초 canvas는 Play 뒤 약 2초에 "Frame unavailable"이 뜨면 통과다(지금 동작 유지).
   - 500ms canvas를 export하고 Playwright Chromium으로 연다. board의 Play로 player가 frame을 재생하고, frame 안의 `data-doan-goto` link를 누르면 대상 frame으로 넘어가면 통과다.
   - 검증: 위 판정 결과와 스크린샷을 기록한다.
6. **문서 반영과 정리**:
   - ARCHITECTURE를 현재 규칙으로 고친다. 대상은 §1 convention 14, §3 'Prototype window' 'Rendering in place', §3 'Exported canvas and viewer'의 export 'Isolation' 문장이다.
   - PRODUCT.md:333에서 틀려진 문장이 없는지 다시 확인한다.
   - `docs/BACKLOG.md` Known defects 항목을 "load 뒤 2초보다 늦게 생기는 frame"으로 줄인다.
   - `docs/features/prototype-late-frame/`를 삭제한다.
   - 검증: `rg -n "one created later cannot" docs/`가 0건이다. BACKLOG 항목이 2초 범위를 말한다. 디렉터리가 없다.
   - — commit 경계 (`docs(ARCHITECTURE)`, `docs(BACKLOG)`, 디렉터리 삭제. 문서별로 나눈다) —
