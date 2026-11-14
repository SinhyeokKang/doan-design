# canvas-edit-awareness — tasks

상위 [canvas-multi-conversation](../canvas-multi-conversation/tasks.md)의 하위 3이다. 하위 1(`canvas-concurrent-conversations`), 하위 2(`sidebar-canvas-conversations`)와 함께 한 체인의 링크로 돈다. 구현은 하위 1이 병합된 뒤에 시작한다. CLI, 형식, 앱, 가이드에 걸치므로 `/ship`의 범위 기준에 걸린다. 사용자가 `/ship bypass`나 체인의 `/orchestrate`로 시작한다. 커밋 경계는 `/ship`을 따른다(`test:` → 구현 → `refactor:` → 문서 승격은 문서마다). 상위 tasks의 체크는 리드가 develop에서 한다.

- [ ] 1. 하위 1 병합본과 맞추기: design.md의 `conversation/` 인용(대화의 캔버스 바인딩, 프로바이더, `liveTurns`, `ConversationWork`)과 `index.ts` 줄 번호를 develop과 대조해 고친다. 검증: design.md의 인용이 모두 develop에 있다(명령 미정 — 리뷰어 확인).
  - 커밋 경계: 문서 맞추기.
- [ ] 2. `/tdd`: 형식과 순수 함수 1–3을 고정하고 red를 확인한다.
  - 형식: `schema/app-socket.v3.schema.json` `response.others`, fixture `schema/fixtures/app-socket-v3/response/`(others 있음, 원소 모양별, 상한 경계, 상한 초과 거부, 모르는 원소 필드 거부), TS·Go fixture 표 항목.
  - TS `workOthers.test.ts`: 같은 파일만, 다른 루트의 같은 경로 제외, 부른 쪽 제외(이름 있는 터미널, 익명 터미널, 앱 대화), 익명 터미널 둘은 서로 안 보임, 앱 대화는 `running` 턴만, 바인딩만 있고 `update` 없는 대화, `update`를 보낸 대화의 프레임·메모, 만료된 터미널 제외, 순서와 상한, ID가 원소에 없음.
  - TS `runtime.test.ts`(v3): 답에 `others`가 실리고 비면 없음, 오류 답에는 없음, 자동 등록 뒤 적용된 경우.
  - Go `work_rules_test.go`·`work_test.go`: `workResponseOthers`(이전 답 → others 없음, 새 답 → others, 스키마 밖 → delivered false), 결과에 `others`, `done`은 그대로, 텍스트 모드 한 줄과 없을 때 무출력.
  - 가이드: `skill.md` 규칙 D 문장이 있다(Go 가이드 테스트), `skillOutputBudget` 테스트가 green.
  - eval: `eval/lib/socket.test.ts`의 `workOthers` 옵션.
  - 검증: `go test ./...`가 새 심볼이 없어 컴파일에 실패하거나 새 테스트에서만 실패한다. `npm --prefix app test`와 `node --test 'eval/**/*.test.ts'`는 새 테스트에서만 실패한다.
  - 커밋 경계: `test:`.
- [ ] 3. `/implement`: 스키마, `workOthers.ts`, `runtime.ts`·`index.ts` 배선, `types.ts`, CLI `work.go`·`work_rules.go`, 가이드 `skill.md`(문구는 `doan design-skill clarify --json`으로 확정), eval fake 앱 옵션. 검증: `go test ./...`, `go vet ./...`, `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`, `node --test 'eval/**/*.test.ts'`.
  - 커밋 경계: 구현 하나.
- [ ] 4. eval 시나리오 `W9`, `W9b`(design.md 'agent-eval')와 pass·fail fixture. 검증: `node eval/run.ts --self-test --scenarios W9,W9b`가 `self-test PASS`, exit 0.
  - 커밋 경계: eval.
- [ ] 5. `/runtime-test`: 격리 앱(임시 userData·HOME·SHELL, `DOAN_RUNTIME`, `go build`한 CLI)에서 확인한다. 검증: `node .scratch/runtime-test/canvas-edit-awareness/probe.mjs`가 완료 줄을 찍고 exit 0이다(명령 미정 — `/runtime-test` 스킬의 관례).
  - 두 터미널 신원(`CLAUDE_CODE_SESSION_ID`를 바꿔)으로 같은 캔버스에 `start`·`update` → 서로의 답에 상대가 있고 자신은 없다.
  - 다른 워크트리의 같은 경로 → 없다. 앱을 끈 뒤 → `{delivered: false}`, `others` 없음.
  - 앱 대화 쪽(`DOAN_APP_CONVERSATION=1`, `DOAN_CONVERSATION_ID`)은 앱이 그 대화를 `running`으로 알아야 하므로 probe가 main의 대화 IPC를 가짜로 둔다(`.scratch/runtime-test/doan-mascot/lib.mjs` 방식). 실제 턴은 확인하지 않고 BACKLOG에 적는다.
- [ ] 6. `/agent-eval`: 새 시나리오 `W9`, `W9b`와 work 관련 기존 시나리오(`W5`)를 Claude Code와 Codex로 돌린다(`npm --prefix app run package` 뒤 `node eval/run.ts --scenarios W5,W9,W9b --agents claude,codex`). 검증: 결과가 `docs/USABILITY-EVAL.md`에 기록되고, W9·W9b가 두 에이전트에서 통과하거나 실패가 사용성 이슈로 기록되었다.
  - 커밋 경계: `docs(usability-eval)`.
- [ ] 7. `/code-review` → `/refactor`. `/refactor`가 앱이나 CLI를 고치면 5·6의 영향받은 항목을 다시 확인한다. 검증: `/code-review` 보고서에 🔴가 없다.
  - 커밋 경계: `/refactor` 수정.
- [ ] 8. 결론을 승격하고 `docs/features/canvas-edit-awareness/`를 삭제한다. 문서마다 커밋한다.
  - PRODUCT §5 item 10: work 문장에 `others`와 에이전트의 한 번 확인.
  - ARCHITECTURE §1 'Agent rules' D, §4 'Work signals over app-socket v3'(답의 `others`, 호환 규칙, 고르기와 빼기, 익명 터미널 한계), §12 `work` 결과 `{delivered, others?}`.
  - BACKLOG: 실제 앱 대화 턴으로 확인하지 않은 경우, 익명 터미널끼리 구분하지 못하는 한계.
  - 검증: `test ! -d docs/features/canvas-edit-awareness`, `grep -c "others" docs/ARCHITECTURE.md`가 1 이상, `rg -n 'features/canvas-edit-awareness' -g '!docs/features/**' .`가 아무것도 찾지 않는다.
  - 커밋 경계: 문서 승격.
- [ ] 9. `/verify`(승격 뒤 마지막 HEAD). 검증: `node .agents/skills/verify/scripts/verify.mjs --eval`이 PASS다(eval이 바뀌므로 `--eval`).
