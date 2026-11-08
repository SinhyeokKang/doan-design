# remove-comments — tasks

`/orchestrate`로 구현한다. 배치는 B1(스키마·CLI·가이드·프리셋, 그리고 B1이 바로 깨뜨리는 eval 부분) → {B2(앱·초안) ∥ B3(나머지 eval)} → B4(문서·평가·마무리)다. B1에서 H6·H7·H8과 eval의 `.gitattributes` 기대값을 함께 정리하므로 B2와 B3은 서로 기다리지 않는다. B1·B2 통합 HEAD의 `/verify`는 `--eval` 없이 돌리고, `--eval`은 B3 통합 뒤부터 요구한다.

## B1. 스키마·CLI·가이드

- [ ] T1. `/tdd`: design '순수 함수'의 Go 사례를 먼저 쓴다.
  - `missingAttributes`: union 줄만, 두 줄, 둘 다 없음, linguist 줄만, CRLF. `init`과 `config --storage repo` 경로 둘 다.
  - `check.Run`: `.doan/comments/` 없음, 빈 디렉터리, 파일 있음, 캔버스 id와 같은 파일, 디렉터리 대신 파일, 심볼릭 링크, 읽을 수 없음 — 모두 finding 없음.
  - `ls` 결과에 `comments`·`commentsError`·`orphans`가 없음. `doan comments`, `doan comment resolve`가 `usage_error`.
  - 검증: `go test ./...`가 새 사례에서만 실패한다.
- [ ] T2. CLI와 스키마를 함께 들어낸다(design 'CLI (Go)', '스키마와 공유 fixture'). 스키마를 먼저 지우면 아직 남은 fold·resolve 코드와 테스트가 깨지므로 한 커밋으로 한다.
  - Go 삭제와 정리, 옮긴 `$defs`와 옮긴 무효 fixture, comment-event 스키마·fixture·fold fixture 삭제.
  - 같은 커밋에서 TS 쪽 스키마 연동: `app/src/formats/fold.ts`·`foldText.ts`·`fold.test.ts` 삭제, `validate.ts`의 등록과 `validateCommentEvent`, `validate.test.ts`의 comment-event 행.
  - 공유 brand fixture `command-comments`를 `doan ls`로 바꾸고 Go `brand_test.go`와 TS `brand/candidates.ts`를 같은 커밋에서 고친다.
  - eval이 바로 깨지는 부분: H6·H7·H8 은퇴, `eval/lib/socket.ts`의 `ATTRIBUTE_LINES`, `workspace.test.ts:163`의 `.gitattributes` 기대값.
  - 검증: `go test ./...`, `go vet ./...`, `npm --prefix app test`의 스키마·formats·brand 테스트, `node --test 'eval/lib/*.test.ts'` 통과. `go run ./cli/cmd/doan help`에 comments 명령이 없다.

── commit: `feat(cli)!: remove comments and the comment-event schema` ──

- [ ] T3. 가이드와 프리셋: `skill.md`를 design '가이드와 프리셋'대로 고친다(규칙 A–E, H 유지, J의 파일 이름, 밀린 수정 3건). 20개 프리셋의 코멘트 단계와 "guide rule G" 글자를 고치고 `notices/MODIFICATIONS.md`에 적는다. `skill_test.go`와 `schema/fixtures/cli-envelope/design-skill/get-clarify.json`을 맞춘다.
  - 검증: `go test ./...`(`skillOutputBudget`, `TestFixturesMatchCatalog` 포함)와 `npm --prefix app test`의 `designSkills.test.ts` 통과. `rg -n -i 'comment' cli/internal/cli/skill.md cli/internal/designskill/presets`가 프리셋의 `Source:` 줄 말고는 출력이 없다. `rg -n '\brules? [A-J]\b|guide rule [A-J]' cli app/src eval .agents docs/ARCHITECTURE.md`의 결과가 모두 새 글자를 가리킨다.

── commit: `feat(skill): guide and presets without comments` ──

## B2. 앱과 초안

- [ ] T4. `/tdd`: 앱 `.gitattributes` 계획이 한 줄만 쓰는 사례, `trashTarget`·Trash 계획이 comments 필드 없이 busy(캔버스 대화 작업 중 포함)·거부를 판정하는 사례, `folderState`에서 `OrphanFile`이 사라지고 옛 CLI의 `orphans`·`comments`를 무시하는 사례, `attributesStay` 문구, `RightPanel` 문구를 먼저 고친다.
  - 검증: `npm --prefix app test`가 해당 사례에서만 실패한다.
- [ ] T5. design '앱'대로 구현한다: 공용 앵커 타입과 문서 바인딩 이동(D4), `commentAnchors` 이름 변경, `projection.ts`의 코멘트 함수 삭제, Trash·목록·감시·첫 실행·설정 문구·주석 정리.
  - 검증: `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test` 통과. `rg -n 'comments/projection|main/comments/|commentAnchors|\.doan/comments|CommentEvent|OrphanFile|orphans|commentsId|comment on it|two lines stay' app/src`가 출력이 없다.
- [ ] T6. 초안: design '초안 캔버스'대로 `canvas-row-menu.html`, `doan-shell.html`, `local-doan-files.html`을 고친다.
  - 검증: `doan check --json`의 finding이 고치기 전과 같다(새 오류 없음). `rg -n -i 'comment' .doan/canvases/canvas-row-menu.html .doan/canvases/doan-shell.html`이 CSS·HTML 주석 말고는 출력이 없다.
- [ ] T7. `/runtime-test`(격리된 앱):
  - Move to Trash 확인 창 본문과 성공 토스트에 코멘트 문장이 없다.
  - `.doan/comments/<id>.jsonl`(캔버스 id와 같은 이름)이 있는 캔버스를 Move to Trash한 뒤 그 파일이 바이트까지 그대로다.
  - 캔버스 대화가 작업 중일 때 Move to Trash가 busy로 막힌다.
  - 코멘트 파일을 고쳐도 캔버스가 다시 읽히지 않는다.
  - 대화 칩을 넣은 메시지의 앵커가 대상 요소의 bounding rect와 겹친다.
  - 첫 실행 Set Up 변경 목록에 `.gitattributes` 줄이 하나다.
  - 검증: 위 여섯 가지의 스크린샷과 파일 해시 기록.

── commit: `feat(app)!: remove comments` / `docs(design): drafts without comments` ──

## B3. 나머지 eval

- [ ] T8. lib 정리(`commentEvents`, focus `"comments"`, 타입, answer·scenario·context 테스트)와 시나리오: H1, H4, R1, R3, R6b, R7b 은퇴, H2·H3·R4·W2의 코멘트 시드·확인 제거, 시드 `.gitattributes`의 union 줄 제거, `R8d/rubric.md`·`R8d/checks(.test).ts`의 규칙 글자, `regression.test.ts`·`audit.test.ts` 정리.
  - 검증: `node --test 'eval/**/*.test.ts'` 통과, `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0.

── commit: `test(eval): retire the comment scenarios` ──

## B4. 문서·평가·마무리 (conductor)

- [ ] T9. 결론 승격: design '문서'의 모든 문서를 고친다(PRODUCT은 spec 'PRODUCT 변경 요지'). USABILITY-EVAL의 코멘트 전용 열린 이슈는 "obsolete (comments removed)"로 닫고, D5의 주입 공백을 새 이슈로 적는다. 저장소 루트 `.gitattributes`의 union 줄을 지운다.
  - 검증: `rg -n -i --hidden --glob '!.git' 'doan comments?|comment resolve|\.doan/comments|orphan_comment|commentsError|unreadable_comments|comment_not_found|comment-event|comment (events?|log|bod(y|ies))|merge=union|lastResolution|append-only events|agents only resolve'`의 결과가 다음 예외 밖에 없다: `docs/POSTMORTEM.md`, `docs/USABILITY-EVAL.md`의 라운드·닫힌 이슈, `docs/features/remove-comments/`, export 테스트의 메타데이터 거부 시드(`cli/internal/export/exporttest/seed.go`, `inline_test.go`, `resolve_test.go`), T1의 무시 테스트, ARCHITECTURE §1의 "옛 경로" 한 줄. 이어서 `rg -n -i 'comment' docs/PRODUCT.md docs/ARCHITECTURE.md README.md`의 결과를 한 줄씩 보고, §1 문제 4의 Claude Design 인용("chats and comments")과 코드 주석을 뜻하는 줄만 남았는지 확인한다.

── commit: 문서별(`docs(PRODUCT): …` 등) ──

- [ ] T10. `npm --prefix app run package` 뒤 `/agent-eval` 한 라운드(남은 전체 시나리오, Claude Code와 Codex)를 feat 브랜치에서 돌려 USABILITY-EVAL에 기록한다. 직전 라운드보다 나빠진 시나리오가 있으면 원인을 고치고(가이드·프리셋이면 B1 파일) 그 시나리오를 다시 잰다.
  - 검증: USABILITY-EVAL에 이 브랜치 커밋의 라운드 행이 있고, 나빠진 시나리오가 없다.
- [ ] T11. 마무리 확인: Go `missingAttributes`, 앱 `ATTRIBUTE_LINES`, eval `ATTRIBUTE_LINES`가 같은 한 줄인지 확인한다. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.
- [ ] T12. 이 디렉터리를 지우고 PR을 연다(이 삭제가 PR의 마지막 커밋이다).

── commit: `docs(feature): remove remove-comments` ──
