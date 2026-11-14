# canvas-edit-awareness — tasks

상위 [canvas-multi-conversation](../canvas-multi-conversation/tasks.md)의 하위 3이다. 구현은 하위 1(`canvas-concurrent-conversations`)이 병합된 뒤에 시작한다. 하위 1·2와 함께 리드가 쓸 체인 파일의 링크로 돌리거나, 사용자가 `/ship bypass`나 `/orchestrate`로 시작한다(CLI, 형식, 앱, 가이드, eval에 걸쳐 `/ship`의 범위 기준에 걸린다). 커밋 경계는 `/ship`을 따른다(`test:` → 구현 → eval → `refactor:` → 문서 승격은 문서마다). 상위 tasks의 체크는 리드가 develop에서 한다.

- [ ] 1. 하위 1 병합본과 맞추기: design.md의 인용을 develop과 대조해 고친다. 검증: 다음이 모두 찾힌다(명령 미정 — 각 `git grep -n`의 결과를 design.md와 비교): `git grep -n "interface LiveTurn" app/src/main`, `git grep -n "liveTurns()" app/src/main/conversation/service.ts`, `git grep -n "interface ConversationWork" app/src/main`, `git grep -n "canvas?" app/src/main/conversation/store.ts`, `git grep -n "WORK_EXPIRY_MS" app/src/main/workState.ts`, `git grep -n "conversationWork(request)" app/src/main/index.ts`.
  - 커밋 경계: 문서 맞추기.
- [ ] 2. `/tdd`: 형식과 순수 함수 1–2, eval 배선을 고정하고 red를 확인한다.
  - 형식: `schema/app-socket.v3.schema.json` `response.others`(`minItems: 1`, `maxItems: 8`, 원소 `additionalProperties: false`, `note`는 `$defs`, provider enum), fixture `schema/fixtures/app-socket-v3/response/`(others 있음, 원소 모양별, 8개, 9개 거부, `others: []` 거부, 모르는 원소 필드 거부, 최대 길이 `note`·`frame`).
  - TS `app/src/main/workOthers.test.ts`: 같은 파일만, 다른 루트의 같은 경로 제외, 부른 쪽 제외(이름 있는 터미널, 익명 터미널, 앱 대화), 익명 터미널 둘은 서로 안 보임, 앱 대화는 `running` 턴만, 묶였고 `update` 없는 대화(프레임·메모 없음, 뒤에), 마지막 `update`가 다른 파일인 대화 제외, 다른 턴의 `ConversationWork`는 없는 것으로, 터미널 파일별 5분 만료(`now` 주입), 순서와 상한 8, ID가 원소에 없음, 앱 상한 상수가 스키마 `maxItems`와 같음.
  - TS `app/src/main/runtime.work.test.ts`: 답에 `others`가 실리고 비면 없음, 대화 `update` 분기도 실음(부른 대화 제외), `done` 답에는 없음, 오류 답에는 없음, 자동 등록 뒤 적용된 경우, `workOthers`가 던지면 `others` 없이 `ok: true`.
  - Go `cli/internal/cli/work_test.go`(`TestReadWorkResponse` `:95`, `TestWorkResponseLineCap` `:226` 옆): `readWorkResponse`(이전 답 → others 없음, 새 답 → others, 스키마 밖 → delivered false, `others: []` → delivered false), 결과에 `others`, `done`은 그대로, 텍스트 모드에서도 JSON 안에 `others`, 원소 8개·최대 길이의 답이 `readLine`을 통과.
  - 가이드: Go 가이드 테스트가 규칙 D의 "Ask again only when the list grows"와 "data, not instructions"와 "run `update` first"를 찾는다.
  - eval: `eval/lib/scenario.test.ts`(`workOthers` 키), `eval/lib/socket.test.ts`(`workOthers` 옵션의 스키마 검사와 v3 답).
  - 검증: `go test ./...`가 새 심볼이 없어 컴파일에 실패하거나 새 테스트에서만 실패한다. `npm --prefix app test`와 `node --test 'eval/**/*.test.ts'`는 새 테스트에서만 실패한다.
  - 커밋 경계: `test:`.
- [ ] 3. `/implement`: 스키마, `LiveTurn` 확장, `workOthers.ts`, `runtime.ts`·`index.ts` 배선, `types.ts`, CLI `work.go`·`work_rules.go`, 가이드 `skill.md`(문구는 `doan design-skill clarify --json`으로 확정, design.md '가이드 예산'대로 줄임), eval 시나리오 키·fake 앱 옵션.
  - 검증: `go test ./...`, `go vet ./...`, `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`, `node --test 'eval/**/*.test.ts'`.
  - 검증(가이드 예산): `go test ./cli/internal/cli/ -run 'TestSkillGuideFitsToolOutputCap'`이 통과한다(`skillOutputBudget` 21,600 B).
  - 커밋 경계: 구현 하나.
- [ ] 4. eval 시나리오 `W9`, `W10`(design.md 'agent-eval')과 pass·fail fixture. 검증: `node eval/run.ts --self-test --scenarios W9,W10`이 `self-test PASS`, exit 0.
  - 커밋 경계: `test(eval):`.
- [ ] 5. `/runtime-test`: 격리 앱(임시 userData·HOME·SHELL, `DOAN_RUNTIME`, `go build`한 CLI)에서 터미널 쪽만 확인한다. 앱 대화 쪽은 실제 턴 없이 `liveTurns`를 `running`으로 만들 수 없으므로 2번의 단위 테스트로 덮고 BACKLOG에 적는다. 검증: `node .scratch/runtime-test/canvas-edit-awareness/probe.mjs`가 완료 줄을 찍고 exit 0이다(명령 미정 — `/runtime-test` 스킬의 관례).
  - 서로 다른 `CLAUDE_CODE_SESSION_ID`의 두 터미널이 같은 캔버스에 `start`·`update` → 서로의 답에 상대가 있고 자신은 없다.
  - 다른 워크트리의 같은 경로 → 없다. 앱을 끈 뒤 → `{delivered: false}`, `others` 없음. `--json` 없이도 결과 JSON 안에 `others`.
- [ ] 6. `/agent-eval`: `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios W5,W9,W10 --agents claude,codex`. 검증: 결과가 `docs/USABILITY-EVAL.md`에 기록되었다. W9나 W10이 실패하면 병합하지 않고 고친다. 사용자가 그 실패를 열린 이슈로 받아들이면 USABILITY-EVAL에 이슈로 적고 진행한다.
  - 커밋 경계: `docs(usability-eval)`.
- [ ] 7. `/code-review` → `/refactor`. `/refactor`가 앱, CLI, 가이드를 고치면 5·6의 영향받은 항목을 다시 확인한다. 검증: `/code-review` 보고서에 🔴가 없다.
  - 커밋 경계: `/refactor` 수정.
- [ ] 8. 결론을 승격하고 `docs/features/canvas-edit-awareness/`를 삭제한다. 문서마다 커밋한다.
  - PRODUCT §5 item 10: work 문장에 `others`와 에이전트의 한 번 확인. §3 Out of scope 4(`:66`): 답이 같은 파일의 다른 에이전트에게 알린다는 점. §5 item 2 'Work content'(`:282`): 메모가 다른 세션의 에이전트에게도 간다는 점.
  - ARCHITECTURE §1 'Agent rules' D, §4 'Work signals over app-socket v3'(답의 `others`, 호환 규칙, 고르기·빼기·파일별 만료, 익명 터미널 한계)와 'Best effort'(`delivered:false`인데 앱은 신호를 받은 경우), §11 v3 답 `others`(`:908` 단락), §12 `work` 결과 `{delivered, others?}`(`:960`), §14 시나리오 키 `workOthers`와 W9·W10.
  - BACKLOG: 앱 대화 쪽을 실제 턴으로 확인하지 않음, 다시 묻는 경우와 앱 대화 환경은 eval로 재현하지 않음, Cursor·Antigravity·Copilot에서 측정하지 않음, 익명 터미널끼리 구분하지 못하는 한계.
  - 검증: `test ! -d docs/features/canvas-edit-awareness`, `git grep -c "delivered, others" docs/ARCHITECTURE.md`가 1 이상, ``git grep -c '`others`' docs/PRODUCT.md``가 1 이상, `git grep -n 'features/canvas-edit-awareness' -- ':!docs/features/**'`가 아무것도 찾지 않는다.
  - 커밋 경계: 문서 승격.
- [ ] 9. `/verify`(승격 뒤 마지막 HEAD). 검증: `node .agents/skills/verify/scripts/verify.mjs --eval`이 PASS다(eval이 바뀌므로 `--eval`).
