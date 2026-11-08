# remove-comments — tasks

`/orchestrate`로 구현한다. 배치는 B1(스키마·CLI·가이드·프리셋) → {B2(앱) ∥ B3(eval)} → B4(문서 승격) 순서다. B2와 B3은 B1의 `ls` 모양과 가이드에 기대고, 서로 코드가 겹치지 않는다(`eval/scenarios/H6`·`H7`이 앱의 `copyText`를 가져다 쓰므로 B3이 그 두 시나리오를 지운 뒤 B2가 `copyText`를 지운다. 같은 배치 순서 안에서 B3의 그 커밋을 먼저 통합한다).

## B1. 스키마와 CLI

- [ ] T1. `/tdd`: Go `missingAttributes`가 `.doan/** linguist-documentation` 한 줄만 요구하는 사례(union 줄이 있을 때와 없을 때), `check`가 `.doan/comments/`가 있는 저장소에서 finding을 내지 않는 사례, `ls` 결과에 `comments`·`commentsError`·`orphans`가 없는 사례, `doan comments`와 `doan comment resolve`가 `usage_error`인 사례를 먼저 쓰고 실패를 확인한다.
  - 검증: `go test ./...`가 새 사례에서만 실패한다.
- [ ] T2. 스키마: app-socket.v1의 selection `element`와 sessions.v1의 `at`을 각 스키마의 `$defs`로 옮기고 comment-event 스키마, `schema/fixtures/comment-event/`, `schema/fixtures/fold/`를 지운다. Go `formats/validate.go`와 TS `app/src/formats/validate.ts`의 등록 목록을 함께 고친다(TS를 같은 커밋에서 고쳐야 앱 테스트가 깨지지 않는다).
  - 검증: `go test ./...`와 `npm --prefix app test`의 스키마·fixture 테스트 통과.

── commit: `refactor(schema): inline the shared defs and drop the comment-event schema` ──

- [ ] T3. CLI에서 코멘트를 들어낸다(design 'CLI (Go)'). `cli/internal/comments/`, `resolve.go`, `orphans.go`, fold 파일 삭제, `read.go`·`run.go`·`envelope.go`·`check`·`repo/files.go`·`formats/types.go`·`storage.go`·`brand_test.go` 정리.
  - 검증: `go test ./...`, `go vet ./...` 통과. `go run ./cli/cmd/doan help`에 comments 명령이 없다.

── commit: `feat(cli)!: remove comments` ──

- [ ] T4. 가이드와 프리셋: `skill.md`를 design '가이드와 프리셋'대로 고치고(규칙 A–D, 밀린 수정 3건 포함), 20개 프리셋의 코멘트 단계를 지우고 `notices/MODIFICATIONS.md`에 적는다. `skill_test.go`를 맞춘다.
  - 검증: `go test ./...`(`skillOutputBudget` 포함) 통과. `rg -n -i 'comment' cli/internal/cli/skill.md cli/internal/designskill/presets`가 "HTML comment" 같은 무관한 줄만 낸다.

── commit: `feat(skill): guide and presets without comments` ──

## B2. 앱

- [ ] T5. `/tdd`: 앱 `.gitattributes` 계획(`onboarding/projects.ts`)이 한 줄만 쓰는 사례, `canvasTrash`의 plan/trash가 comments 필드 없이 busy·거부를 그대로 판정하는 사례, `folderState`가 `orphans` 없는 `ls` 결과를 읽는 사례를 먼저 고치고 실패를 확인한다.
  - 검증: `npm --prefix app test`가 해당 사례에서만 실패한다.
- [ ] T6. design '앱'대로 구현한다: fold·코멘트 타입 삭제, 공용 앵커 타입과 문서 바인딩 이동(D4), `commentAnchors` 이름 변경, Trash·목록·감시·첫 실행·브랜드·문구·토큰 정리. 바뀐 문구는 Doan clarify 프리셋으로 다듬는다.
  - 검증: `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test` 통과. `rg -n -i 'comments?/|commentAnchors|copyText|\.jsonl' app/src`가 대화 저장 같은 무관한 줄만 낸다.
- [ ] T7. `/runtime-test`: 격리된 앱에서 Move to Trash 확인 창과 결과 토스트, `.doan/comments/`가 남은 프로젝트를 열었을 때 목록·캔버스·대화 칩 앵커가 그대로 동작하는지 본다.
  - 검증: 확인 창 본문에 코멘트 문장이 없고, 칩을 넣은 메시지의 앵커 위치가 이전과 같다.

── commit: `feat(app)!: remove comments` ──

## B3. eval

- [ ] T8. lib 정리(`commentEvents`, focus `"comments"`, 가짜 앱 `ATTRIBUTE_LINES`)와 시나리오: H1, H4, H6, H7, H8, R1, R3, R6b, R7b 은퇴, H2·H3·R4·W2의 코멘트 시드·확인 제거, 시드 `.gitattributes`의 union 줄 제거, regression·audit·lib 테스트 정리.
  - 검증: `node --test 'eval/**/*.test.ts'` 통과, `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0.

── commit: `test(eval): retire the comment scenarios` ──

## B4. 문서와 평가

- [ ] T9. 결론 승격: design '문서'의 모든 문서를 코멘트 없는 현재 규칙으로 고친다(PRODUCT, ARCHITECTURE, DIRECTORY, DESIGN, README, AGENTS, 개발 스킬, BACKLOG). USABILITY-EVAL의 코멘트 전용 열린 이슈는 obsolete로 닫고, D5의 주입 공백을 새 이슈로 적는다. 저장소 루트 `.gitattributes`의 union 줄을 지운다.
  - 검증: `rg -n -i 'doan comments?|comment resolve|\.doan/comments|orphan_comment|comment-event' --glob '!docs/POSTMORTEM.md' --glob '!docs/USABILITY-EVAL.md' .`가 이 feature 디렉터리 밖에서 아무것도 내지 않는다(eval 이력과 export의 메타데이터 거부 fixture는 예외로 확인).

── commit: 문서별(`docs(PRODUCT): …` 등) ──

- [ ] T10. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과 후 PR.
- [ ] T11. PR 병합 뒤 리드 세션이 `/agent-eval` 한 라운드를 돌려 USABILITY-EVAL에 기록한다(가이드·프리셋·CLI 출력이 바뀌었으므로 AGENTS.md 'Workflow' 규칙). 새 문제는 이슈로 적고, 0.1.0을 막는 것만 고친다.
  - 검증: USABILITY-EVAL에 새 라운드 행이 있다.
- [ ] T12. 이 디렉터리를 지운다.

── commit: `docs(feature): remove remove-comments` ──
