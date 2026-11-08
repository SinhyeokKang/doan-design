# fixes-0-1-2 — tasks

`/orchestrate`로 구현한다. 배치 B1(업데이트 화면: 1·2) ∥ B2(문제 화면: 3) ∥ B3(Look Up: 4) ∥ B4(테스트: 5) ∥ B5(프리셋: 6). 서로 파일이 겹치지 않는다. 초안 `.doan/canvases/fixes-0-1-2.html`을 사용자가 앱에서 확정한 뒤 시작한다.

## 0. 초안

- [ ] T0. `/design-draft`: 1(About 실패 줄), 2(팝오버가 상태를 따르는 모습: 막힘 → 풀림, 멈춤 → 막힘), 3(CLI error Details 접힘·펼침, 긴 메시지)을 그린다. 사용자가 앱에서 확정한다.
  - 검증: `doan check --json`이 이 캔버스에 새 오류를 내지 않는다.

── commit: `docs(design): fixes-0-1-2 draft` ──

## B1. 업데이트 화면

- [ ] T1. `/tdd`: 스냅샷 → 팝오버 문구가 막힘 해제·멈춤 후 막힘에서 바뀌는 사례, no-drag 카운터(둘 열고 하나 닫으면 유지), About의 Release Notes 실패 줄(실패 시 나타남, 다음 성공·상태 변화에 사라짐).
  - 검증: `npm --prefix app test`가 새 사례에서만 실패한다.
- [ ] T2. 구현하고 `/design-sync`로 초안과 맞춘다.
  - 검증: `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test` 통과.

## B2. 문제 화면

- [ ] T3. `/tdd`: CLI 실행 결과(봉투 오류, spawn 오류, 시간 초과, 종료 코드) → `cliError.message`, `problemView`의 `cliError` 동작에 `details`, Config error Show in Finder가 config 파일을 고르는 경로(있음·없음).
  - 검증: `npm --prefix app test`가 새 사례에서만 실패한다.
- [ ] T4. 구현하고 `/design-sync`.
  - 검증: typecheck, lint, test 통과.

## B3. Look Up

- [ ] T5. PoC: 칩 필드에서 메뉴가 열릴 때 renderer의 보이는 선택 글이 main의 메뉴 구성 전에 닿는지 확인한다(design 4). 결과를 design에 한 줄 적는다.
- [ ] T6. `/tdd`와 구현: DOM 조각 → 보이는 글, 칩 필드의 Look Up 이름.
  - 검증: typecheck, lint, test 통과.

## B4. 테스트

- [ ] T7. 두 테스트를 사건 기반으로 바꾼다(design 5).
  - 검증: `npm --prefix app test`를 다른 worktree의 전체 테스트와 함께 연속 3번 돌려 통과한다.

## B5. 프리셋

- [ ] T8. 네 프리셋 본문, `MODIFICATIONS.md`, 프리셋 fixture를 고친다.
  - 검증: `go test ./...`(출력 예산, `TestFixturesMatchCatalog`)와 앱 `designSkills.test.ts` 통과. `rg -n -i 'token CSS path first' cli/internal/designskill/presets`가 출력이 없다.

── commit: 배치마다 `fix(app): …` / `fix(skill): presets follow the setup rule` ──

## 마무리 (conductor)

- [ ] T9. `/runtime-test`(격리된 앱): Release Notes 실패 줄(실패하게 만든 main 응답), 팝오버 문구 변화와 no-drag, CLI error Details, Config error Show in Finder, 칩 필드 Look Up 이름.
  - 검증: 다섯 가지의 스크린샷.
- [ ] T10. `npm --prefix app run package` 뒤 `/agent-eval`(프리셋 시나리오, Claude Code·Codex)을 돌려 USABILITY-EVAL에 기록한다. 직전 라운드보다 나빠지지 않아야 한다.
- [ ] T11. 결론 승격: PRODUCT(About 실패 줄, 문제 화면 Details와 Show in Finder), ARCHITECTURE(§7 App updates·Problem states·텍스트 편집 메뉴), DESIGN(측정값), BACKLOG(여섯 항목 삭제, 남은 부분만 남김). `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.
- [ ] T12. 이 디렉터리를 지우고 PR을 연다(마지막 커밋).

── commit: `docs(feature): remove fixes-0-1-2` ──
