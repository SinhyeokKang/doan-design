# inspector 넓히기 — tasks

(B)와 (A)는 서로 다른 파일을 바꾸므로 따로 커밋하고, (B)를 먼저 끝낸다. `/ship`·`/orchestrate`는 커밋 경계를 따른다.

## (B) 선택 버블의 Inspect

1. **디자인 초안**: `/design-draft`로 Inspect가 들어간 선택 버블(접힘, 열림 후, yield)을 그린다. 사용자가 앱에서 확인한다.
   - 확인: `doan check` 통과, 사용자 확인.
2. **`bubbleItems`** 순수 함수와 테스트(접힘일 때만 Inspect, yield, Play 유무).
   - 확인: `npm --prefix app test` 초록.
   - ── 커밋 경계 (`test:` → `feat:`) ──
3. **버블 Inspect 연결**: App portal, `foldInspector` 호출, 포커스 이동(`moveBubbleFocus`).
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run typecheck` 통과.
4. **`/design-sync`, `/runtime-test`**: 버블 측정을 `docs/design/prototype.md`(또는 버블 섹션)에 기록하고, 실제 앱에서 열기·포커스·yield를 확인한다.
   - 확인: `/design-sync` 기록, `/runtime-test` PASS.
   - ── 커밋 경계 (`feat:`) ──

## (A) export 파일의 inspector

5. **PoC**: `.scratch/inspector-reach/`에서 export 파일과 같은 구조(opaque-origin `srcdoc`, `data:` 스타일시트, 외부 스타일시트 하나)의 페이지를 만들고 Chromium과 Safari(WebKit)에서 `cssRules` 읽기, 매칭 규칙 수집, 늘어나는 JS 크기를 잰다. 결과는 design.md에 적는다. 규칙을 읽지 못하는 브라우저가 있으면 계산된 값으로 물러설지 사용자에게 묻는다.
   - 확인: Playwright Chromium·WebKit 실행 기록.
   - ── 커밋 경계 (`docs(feature):` PoC 결과) ──
6. **디자인 초안**: `/design-draft`로 export 뷰어의 Show inspector, 선택·hover, inspector 열을 그린다(`.doan/canvases/export-viewer-chrome.html`은 고치지 않고 새 초안).
   - 확인: `doan check` 통과, 사용자 확인.
7. **순수 함수**: `cssomMatched`(또는 `computedRows`), 뷰어 선택 단계, 복사본 고정(`exportViewer.test.ts`).
   - 확인: `npm --prefix app test` 초록, `go test ./...` 통과.
   - ── 커밋 경계 (`test:` → `feat:`) ──
8. **뷰어 연결**: `measure.js`의 선택·hover·값 수집, `shell.js`의 inspector 열, 메시지 검증. 출력 고정 테스트 갱신과 크기 기록.
   - 확인: `go test ./...` 통과(`TestAssembleOutputIsPinned`, `TestExportAllocationIsBounded`), `go vet ./...` 통과.
9. **브라우저 확인**: 실제 캔버스로 export한 파일을 Chromium과 WebKit에서 열어 선택·hover·값·복사·JavaScript 없을 때를 확인한다.
   - 확인: Playwright 스크린샷과 기록.
   - ── 커밋 경계 (`feat:`) ──

## 마무리

10. **최종 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
    - 확인: verify PASS.
11. **승격**: PRODUCT §5 item 2('Size bubble'), item 3('Export and viewer'), item 4('Inspector')와 ARCHITECTURE §3('Exported canvas and viewer', 'Canvas rendering'의 inspector 문단)을 현재 규칙으로 고쳐 쓰고(근거는 커밋 메시지), `docs/features/inspector-reach/`를 지운다.
    - 확인: `grep -rn "inspector-reach" docs/ app/ cli/` 결과 없음.
    - ── 커밋 경계 (`docs(PRODUCT):`, `docs(ARCHITECTURE):` 문서별) ──
