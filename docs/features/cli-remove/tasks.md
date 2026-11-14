# cli-remove — tasks

`/ship` 하나로 간다(초안 없음: 새 화면이 없다). guide와 스킬 스텁이 바뀌지 않으므로 `/agent-eval`은 하지 않는다(spec 결정 4).

- [ ] 1. 형식: `schema/app-socket.v7.schema.json`(요청 `{v:7, token, root}`, 성공 `{removed, project, roots}`, 오류 `bad_token`·`bad_request`·`project_not_open`·`busy`·`conversation_running`)과 CLI envelope의 `remove` 결과 모양, fixture(성공, 각 오류, 다른 `v`). 검증: `go test ./...`와 `npm --prefix app test`가 새 fixture를 양쪽에서 읽고 green.
  - 커밋 경계: 형식.
- [ ] 2. `/tdd`: design.md '순수 함수' 1–4를 고정하고 red를 확인한다. 검증: `go test ./...`와 `npm --prefix app test`가 새 테스트에서만 실패한다.
  - Go `removeReply`: 각 코드의 envelope·종료 코드(`conversation_running` 5, `project_not_open` 3, `busy` 5, `bad_token` → `app_not_running` 3, 다른 `v` → `app_protocol_mismatch` 3), 요청 루트가 없는 성공 답 → `internal_error`, 64 KiB 경계는 공유 `readLine` 테스트가 가드.
  - TS `cliRemoveDecision`: 대화상자 → `busy`, 카드 없음 → `project_not_open`, 그룹의 다른 워크트리에서 도는 대화(대기 포함) → `conversation_running`, 아니면 그룹 루트 전체와 그룹 이름.
  - TS `validateCliRemove`와 `removeRequests`의 짝 맞추기·시간 초과(`busy`)·늦은 답 버림.
- [ ] 3. `/implement`: 순수 함수. 검증: `go test ./...`, `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: 순수 함수와 테스트.
- [ ] 4. CLI 셸: `remove.go`, `run.go` 분기, `doan help` 한 줄(파일과 Git 워크트리가 남는다는 말 포함), `ExitCode`. 검증: `go test ./...`, `go vet ./...`, `go run ./cli/cmd/doan help`에 `remove` 줄이 있고 `go run ./cli/cmd/doan skill`의 출력이 develop과 같다.
  - 커밋 경계: CLI.
- [ ] 5. 앱: main `answerLine`의 `v: 7` 분기(스키마 → 토큰 → 등록된 루트 → 첫 실행·Buddy 화면 → renderer), preload 구독·답 채널, `senderAllowed.ts`, renderer `App.tsx`의 요청 처리(`cliRemoveDecision` → `removeNow`). 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`, 그리고 `rg -n 'selection = null|ready\.(remove|replace)\(' app/src/main/index.ts`에서 제거 길이 `selection`을 지운다.
  - 커밋 경계: 앱.
- [ ] 6. `/runtime-test`: 격리 앱(임시 userData·HOME·SHELL, `DOAN_RUNTIME`)에서 확인한다. 검증: `node .scratch/runtime-test/cli-remove/probe.mjs`가 완료 줄을 찍고 exit 0이다.
  - 워크트리 두 개인 그룹의 작업 공간을 연 채 `doan remove --repo <둘째 워크트리> --json` → exit 0, `roots`에 둘 다, 앱이 Home, 사이드바에 그 프로젝트가 없음, 두 폴더와 Git 워크트리가 디스크에 남음.
  - 그 그룹에서 프로젝트 대화(가짜 CLI)가 도는 동안 → `conversation_running`, exit 5, 목록 그대로.
  - Remove from Doan 확인 창이 열린 동안 → `busy`, 목록 그대로.
  - 등록되지 않은 폴더 → `project_not_open`, exit 3. 앱 종료 뒤 → `app_not_running`, exit 3이고 앱이 열리지 않음.
- [ ] 7. `/code-review` → `/refactor` → `/verify`. 검증: `node .agents/skills/verify/scripts/verify.mjs`.
  - 커밋 경계: `/refactor` 수정.
- [ ] 8. 결론을 승격하고 `docs/features/cli-remove/`를 삭제한다. 문서마다 커밋한다. 검증: `test ! -d docs/features/cli-remove`, `grep -c "doan remove" docs/PRODUCT.md`가 1 이상.
  - PRODUCT §5 item 10: `doan remove`(그룹 단위, 실행 중인 대화가 있으면 거부, 앱을 열지 않음, 확인 없음, help에만 있고 사람이 요청할 때만 씀). item 1 'Remove from Doan'에 CLI에서도 같은 결과가 난다는 문장.
  - ARCHITECTURE §4 첫 문장에 `remove`, 새 절 'Removing a project over app-socket v7'(분기 순서, renderer에 묻는 이유, 답과 종료 코드), §12 `remove` 결과 모양.
  - 커밋 경계: 문서 승격.
