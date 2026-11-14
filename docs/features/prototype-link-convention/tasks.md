# prototype-link-convention — tasks

`/ship` 하나로 간다(상위 `prototype-frame-links` 체인의 첫 링크면 `/orchestrate` 배치 하나). 상위 문서의 체크는 리드가 develop에서 한다. 이 feature는 상위 문서를 고치지 않는다.

- [ ] 1. **공유 fixture**: `schema/fixtures/prototype-links/cases.json`(design.md '공유 fixture'의 경우를 모두).
  - 검증: `node -e "JSON.parse(require('fs').readFileSync('schema/fixtures/prototype-links/cases.json','utf8'))"`가 오류 없이 끝난다. 다음 작업의 테스트가 이 파일을 읽는다.
  - 커밋 경계: `test:` 커밋에 함께 둔다.
- [ ] 2. **Go 파싱과 묶음**(`canvas.go` `Gotos`, `links.go` `LinkGroups`).
  - 테스트: `cli/internal/canvas/links_test.go`가 fixture의 `placements`(`gotos`, `groups`)와 `groups`를 읽는다. 기존 `prototype_test.go`는 그대로 통과한다.
  - 검증: `go test ./...`, `go vet ./...`. `/tdd` 보고서가 새로 실패해야 할 테스트 이름을 적고, `/implement` 뒤 모두 green이다.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 3. **`doan check` 규칙**(`check.go`).
  - 테스트: `cli/internal/check/check_test.go`가 fixture `placements`의 `codes`를 읽는다(`prototypeCodes`처럼 네 코드만 거르는 도우미). 메시지 문자열, `value`와 `frame` 필드, 같은 (code, value, frame)의 중복 제거, `duplicate_frame_id`와 `goto_target_shared`가 함께 나오는 경우, 200자 초과 id의 메시지.
  - 검증: `go test ./...`, `go vet ./...`.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 4. **TS 묶음**(`app/src/main/prototype/links.ts`).
  - 테스트: `links.test.ts`가 fixture의 `groups`와 `placements`의 `gotos`·`groups`를 읽는다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 5. **전체 확인**: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다. `go run ./cli/cmd/doan check --repo <임시 저장소> --json`으로 fixture 경우 몇 개를 담은 캔버스를 검사해 네 코드가 나오는지 본다(임시 저장소, 이 저장소 아님).
- [ ] 6. **승격**: ARCHITECTURE §1에 convention 15와 `doan check` 표 네 줄(코드 순서), §11 'Shared formats'에 새 fixture. PRODUCT는 바꾸지 않는다(하위 2). `docs/features/prototype-link-convention/`를 지운다.
  - 검증: `rg -n "data-doan-goto" docs/ARCHITECTURE.md`가 convention 15와 표를 보인다. `git ls-files docs/features/prototype-link-convention`이 빈 결과다.
  - 커밋 경계: 문서별 커밋.
