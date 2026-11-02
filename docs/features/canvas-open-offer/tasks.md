# canvas-open-offer — tasks

- **실행 경로**: `/ship`으로, `feat/canvas-open-offer` 브랜치에서 한다. 앱 화면 변화가 없으므로 `/design-draft`는 없다.
- **순서**: schema와 fixture → 순수 함수 → 셸(I/O) → 가이드·설정 → eval → 승격. `──` 줄이 커밋 경계이고, 각 커밋은 테스트를 통과한다.

- [ ] T1. 포맷: `schema/app-socket.v4.schema.json`과 `schema/fixtures/app-socket-v4/`를 만든다.
  - schema 내용: open 요청(root, path, frame), 응답(`opened`+frame 결과, `not_ready`, §12 거절 코드). `frame`의 `minLength`·`maxLength`·제어 문자 pattern도 넣는다.
  - fixture: 정상, 각 거절, `not_ready`, 버전 불일치, 오래된 앱의 v1 refusal, 토큰이나 runtime 경로가 섞인 응답.
  - 등록할 곳: `schema/embed.go`, `cli/internal/formats/validate.go`의 files 목록과 validator map, `app/src/formats/validate.ts`·`types.ts`.
  
  확인: `go test ./...`, `npm --prefix app test`. `cli/internal/formats/validate_test.go`와 `app/src/formats/validate.test.ts`가 새 fixture를 읽고 green이다. v4 fixture는 v1–v3 validator가 거절하고, v1–v3 fixture는 v4 validator가 거절한다.

── 커밋: `feat(schema): app-socket v4 for doan open`

- [ ] T2. Go 순수 함수(`cli/internal/cli/open_rules.go`): `openRequest`(해석된 경로의 형식 검사, frame 검사, 요청 생성)와 `openReply`(응답 검증, 결과·exit code 변환). 확인: `go test ./...`. `open_test.go`가 다음을 고정한다.
  - 인자: 인자 0개, 캔버스 2개, `--frame` 두 번 → `usage_error`.
  - `--frame`: 값 없이 끝남(args parser `usage_error`), `--frame=`(빈 값), 제어 문자, 길이 상한(schema와 같은 값).
  - 경로: `.doan/canvases|ds/` 밖, `..` 순회, 루트 안 절대 경로(허용), 루트 밖 절대 경로.
  - 응답: `opened`와 frame 결과, `project_not_open`(3), `canvas_not_found`(2), `busy`(5)와 이유별 message, `not_ready`는 재시도 신호, 버전 불일치와 오래된 앱의 v1 `bad_request` → `app_protocol_mismatch`(3, nextSteps "Doan을 업데이트").
- [ ] T3. TS 순수 함수:
  - `deepLinks.ts`에서 `resolveOpenLink`를 `parseOpenLink` + `resolveOpenTarget(link, entries)`로 나눈다.
  - renderer 판정 helper를 `App.tsx`의 `openLink`에서 뽑는다(다이얼로그 cancel 결과, `locked()`, first run, 목록 재확인 → `opened` / `busy`+이유 / `canvas_not_found`).
  
  확인: `npm --prefix app test`. 기존 `open-link` fixture 테스트(`deepLinks.test.ts`)가 그대로 green이다(POSTMORTEM 2026-10-25 'A new link state silently removed replacement-guard coverage'). `resolveOpenTarget`와 renderer helper의 새 판정 케이스가 green이다. loading 중인 루트는 목록 거절이 아니다.

── 커밋: `feat: doan open request rules`

- [ ] T4. CLI 셸: `doan open` 명령(`open.go`)을 만든다.
  - bootstrap 루프를 `onboarding.go`에서 `attempt(deadline) → (reply, failure, launchable)` 함수로 뽑는다.
  - 소켓 전송, `not_ready` 재시도, `workTarget` 호출(파일이 없으면 앱에 묻지 않고 `canvas_not_found`), `--json` 출력과 `--json` 없는 사람용 한 줄 출력, `doan help` 항목.
  - `run.go`의 runtime 경로 해석, `onboardingRuntime` 분기, `args.go`의 `--frame`.
  
  확인: `go test ./...`, `go vet ./...`. 기존 `onboarding_test.go` bootstrap 테스트는 green을 유지한다. `TestOnboardingOnlyStartLaunches`는 "`onboarding start`와 `open`만 launch한다"로 바꾼다. 테스트는 harness의 주입 clock(`ctx.Now`/`ctx.Sleep`)을 쓰고 실제로 기다리지 않는다. 다음을 고정한다.
  - 앱이 없고 `DOAN_RUNTIME`이 없으면 bootstrap을 한 번 시도한다. 준비되지 않은 채 시간이 다하면 `app_launch_failed`다.
  - 이미 떠 있는 앱이 계속 `not_ready`면 시간이 다한 뒤 `busy`다.
  - `DOAN_RUNTIME`이 설정됐거나(빈 값 포함) 앱 밖의 CLI면 앱을 열지 않는다. 상대 경로 `DOAN_RUNTIME`은 `usage_error`다.
  - 권한이 거부되면 앱을 열지 않는다.
  - `--repo`가 doan 저장소가 아니면 `repo_not_found`다.
  - 루트를 떠나는 symlink와 dangling link는 `workTarget` 규칙대로 거절한다(POSTMORTEM 2026-10-31).
  - 응답에 토큰이나 runtime 경로가 섞이지 않는다.
- [ ] T5. 앱 셸:
  - main의 v4 dispatch(schema → token → 등록 루트 → 준비 판정 → 목록 판정)를 만든다.
  - main↔renderer 요청-응답 IPC를 만든다. 요청 id를 쓰고, 소켓 deadline 안의 timeout을 둔다. timeout이면 `busy`이고 늦은 결과는 버린다.
  - renderer 처리: 열리면 창을 앞으로 가져오고 결과를 보낸다. 거절이면 창도 토스트도 없다. `App.tsx:954-956` 주석을 고친다.
  
  확인: `npm --prefix app test`, `npm --prefix app run typecheck`. `app/src/main/runtime.open.test.ts`(`runtime.work.test.ts`와 같은 방식)와 renderer 테스트가 다음을 고정한다.
  - token 검사
  - 등록되지 않은 루트 → `project_not_open`
  - 목록에 없는 캔버스 → `canvas_not_found`
  - 준비 전·loading 중 → `not_ready`
  - 잠긴 페이지, 거부하는 다이얼로그, first run → `busy`와 이유
  - 숨긴 창을 보이게 함(opened일 때만)
  - 동시 요청 두 개가 각자 응답을 받음
  - renderer timeout
  - 쓰기·대화 시작이 없음
  
  대기하는 테스트는 held promise나 fake timer를 쓴다(POSTMORTEM 2026-10-30 timing).
- [ ] T6. 실제 앱 확인: `/runtime-test`로 격리한 dev 앱에서 `DOAN_RUNTIME`을 지정한 `doan open`을 실행한다.
  - 캔버스와 프레임을 연다.
  - 없는 프레임이면 캔버스만 열고 frame missing을 돌려준다.
  - 목록에 없는 캔버스는 창이 앞으로 오지 않고 토스트 없이 `canvas_not_found`다.
  
  bootstrap(앱을 띄우는 경로)은 `/usr/bin/open`이 `--user-data-dir`나 env를 넘기지 않아 격리 probe로 확인할 수 없다. T4의 unit 테스트로만 확인하고, T11에서 BACKLOG에 미검증 surface로 남긴다. 확인: probe가 완료 표시와 함께 exit 0으로 끝나고, 실제 상태가 실행 전후 같으며, 스크린샷을 남긴다.

── 커밋: `feat: doan open opens a canvas in the running app`

- [ ] T7. 에이전트 설정과 앱 프롬프트:
  - `CLAUDE_ALLOW_RULES`에 `Bash(doan open *)`을 더한다(`plan.ts`).
  - About 안내(`app/src/main/agentSetup/notice.ts:79`)를 세 규칙으로 고친다. 문구를 쓰기 전에 Doan의 clarify preset을 읽는다.
  - 앱 턴 프롬프트(`app/src/main/conversation/prompt.ts`)에 제안 금지 한 줄을 넣는다. 이 줄이 가이드의 제안 규칙보다 우선한다고 밝힌다.
  - R8의 `prompt.md`가 `turnPrompt`와 바이트까지 같아야 하므로(`eval/scenarios/R8/prompt.test.ts`), 이 커밋에서 `eval/scenarios/R8b/`를 만들고 `R8/`을 지운다. R8b의 rubric과 automatic check는 T9에서 마무리한다.
  
  확인: `npm --prefix app test`, `node --test 'eval/**/*.test.ts'`. `plan.test.ts`가 다음을 고정한다.
  - 두 규칙만 있는 파일에는 세 번째 규칙만 더한다.
  - 세 규칙이 다 있으면 쓰지 않는다.
  - 모양이 다른 파일은 건드리지 않는다.
  
  두 규칙 리터럴과 "both rules"를 고정한 `plan.test.ts:178,207-231`, `runner.test.ts:303,306`, `notice.test.ts:59`를 갱신한다. `prompt.test.ts`도 green이어야 한다.
- [ ] T8. 가이드: `skill.md`의 규칙 J(spec 완료 조건 5·6·11)와 Commands(`doan work done`의 links 용도, 새 `doan open`과 거절 코드별 행동)를 고친다. `skill_test.go`가 새 문구를 고정한다. 쓰기 전에 현재 `doan skill` 출력 크기를 측정하고, 출력 예산 테스트(`skillOutputBudget`)가 통과해야 한다. 확인: `go test ./...`.

── 커밋: `feat: agents offer to open edited canvases instead of printing links`

- [ ] T9. eval:
  - W3 → W3b: 제안 기준 rubric으로 바꾸고 `W3/`을 지운다. 판정은 특정 문장이 아니라 의도로 쓴다(캔버스를 이름으로 들고, 열지 묻고, 링크를 넣지 않음). `doan open` 호출 없음을 automatic check(`ctx.calls`)로 더한다.
  - 새 시나리오 W4: 처음부터 고친 뒤 열어 달라고 하는 한 프롬프트다. `doan open` 호출과 인자, 가짜 앱이 받은 v4 교환을 automatic check로 확인한다(ARCHITECTURE §14 "호출만으로는 성공의 증거가 아니다").
  - 가짜 소켓(`eval/lib/socket.ts`)에 v4를 지원하고, v4 교환을 돌려주는 accessor를 `eval/lib/types.ts`, `context.ts`에 더한다.
  - R8b: 새 턴 프롬프트에 맞는 rubric과 `doan open` 호출 없음 automatic check.
  - workspace의 Claude 허용 규칙은 `workspace.ts:79`가 `CLAUDE_ALLOW_RULES`를 import하므로 자동으로 반영되는지만 확인한다.
  
  모든 fixture는 절대 경로의 임시 `DOAN_RUNTIME`을 쓴다. 확인: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` 결과 `self-test PASS`와 exit 0.

── 커밋: `test(eval): open offer scenarios`

- [ ] T10. `/agent-eval`: `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios W3b,W4,R8b --agents claude,codex --repeat 3 --round <name>`을 돌려 `docs/USABILITY-EVAL.md`에 기록한다. 실제 에이전트 상태와 로그인을 쓴다(AGENTS 'Commands'). partial이나 fail이면 U-issue로 기록하고, 가이드를 고친 뒤 다시 돌린다. 확인: 각 시나리오가 Claude와 Codex에서 pass이고, 라운드가 기록됨.

── 커밋: `docs(eval): canvas-open-offer round`

- [ ] T11. 승격: 다음을 현재 규칙으로 고친다. 날짜는 문서에 넣지 않고 커밋 메시지에 둔다.
  - PRODUCT §3 Out of scope 4: "a `doan://` link only moves"에 `doan open`을 더한다.
  - PRODUCT §5 item 0 'Agent setup': 첫 실행 줄("the bundled CLI's `onboarding start` opens the app")과 Claude 규칙 세 개("both rules" → 모든 규칙).
  - PRODUCT §5 item 3 'Deep links': 에이전트는 링크 대신 제안하고, 요청을 받으면 `doan open`을 실행한다.
  - PRODUCT §5 item 10: `doan open`은 앱이 필요하고, bundled CLI가 앱을 연다.
  - ARCHITECTURE §4: 첫 줄("Only `active`, `onboarding …` and `work` need the app"), app-socket v4, 'Bootstrap'의 "(`onboarding start` only)", `not_ready` 재시도.
  - ARCHITECTURE §6: 가이드 규칙 J.
  - ARCHITECTURE §7: 'Deep links'와 공유 판정(`resolveOpenTarget`, renderer helper), 'Agent setup'의 Claude allow rules와 About 안내, 'Input and prompt'.
  - ARCHITECTURE §11: v4 schema와 fixture.
  - ARCHITECTURE §12: `doan open` 결과와 exit code, onboarding 줄의 "only `start` may launch the app".
  - ARCHITECTURE §14: "R8 with `turnPrompt`" → R8b.
  - README: "What works today"의 "`doan://` links in that agent's final answer"와 "(Claude Code: `doan work` only)", CLI 명령 목록과 앱이 필요한 명령 설명.
  - BACKLOG:
    - 'Terminal `doan://` links'를 지운다. Orca·Claude·Codex 앱의 scheme 차단 사실은 참조한 앱 버전과 함께 PRODUCT나 ARCHITECTURE에 이유로 남긴다.
    - 잠긴 페이지 링크 항목(BACKLOG.md:56)은 링크에만 해당한다고 고친다.
    - `doan open`의 bootstrap 경로를 미검증 surface로 더한다.
  
  그 뒤 이 디렉터리를 지운다. 확인: `node .agents/skills/verify/scripts/verify.mjs --eval` 통과, `docs/features/canvas-open-offer/` 없음.

── 커밋: 문서마다 하나씩 (`docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs: README …`, `docs(feature): …`)
