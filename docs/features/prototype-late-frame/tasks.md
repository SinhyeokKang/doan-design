# prototype-late-frame — tasks

1. **`windowState.report()` 수락 규칙**: 같은 gen에서 `missing` 뒤의 `ready`만 받고, 나머지 두 번째 결과는 거절한다. 마지막 lost 상태를 state에 담는다.
   - 검증: `npm --prefix app test` (windowState tests green, 새 case가 먼저 red)
2. **host 전달 확인**: 같은 gen의 두 번째 결과가 main까지 가는지 확인하고, 막혀 있으면 연다. 10초 timer는 loading에만 걸린다.
   - 검증: `npm --prefix app test` (host tests green)
   - — commit 경계 (`fix:` main·host) —
3. **주입 script 유예와 관찰**: `load` 뒤 2초 유예, 그 뒤 `missing`, 이어서 target이 생기면 `ready`. 찾으면 observer를 끊는다. 2초가 10초 init timer보다 짧다는 조건을 test로 고정한다.
   - 검증: `npm --prefix app test` (prototypeScript tests green), `npm --prefix app run typecheck`
4. **export viewer**: `node app/scripts/viewerInspect.mjs`로 bundle을 다시 생성하고, `player.js`가 `missing` 뒤의 `ready`를 처리하게 한다. `isolate.js` 주석을 고친다.
   - 검증: `node app/scripts/viewerInspect.mjs --check`, `go test ./...`
   - — commit 경계 (`fix:` 주입 script·export viewer) —
5. **실제 앱 확인**: `/runtime-test`로 격리된 앱에서 `load` 뒤 500ms에 frame을 만드는 canvas(바로 재생)와 3초 뒤에 만드는 canvas(Frame unavailable 뒤 재생, window가 앞으로 나오지 않음)를 확인한다.
   - 검증: probe 기록과 스크린샷
6. **문서 반영과 정리**: ARCHITECTURE §1 convention 14와 §3 'Prototype window' 'Rendering in place'의 판정 문장, PRODUCT §5 item 2 'Prototype window' 상태 설명(필요하면)을 현재 규칙으로 고친다. guide에 같은 문장이 있으면 함께 고친다. `docs/BACKLOG.md` Known defects의 해당 항목을 지우고 `docs/features/prototype-late-frame/`를 삭제한다.
   - 검증: `rg -n "created later|load. handlers" docs/ cli/` 결과가 새 규칙과 맞는다
   - — commit 경계 (`docs(ARCHITECTURE)`, `docs(PRODUCT)`, `docs(BACKLOG)`, 문서별로 나눈다) —
