# canvas-open-offer — tasks

- **실행 경로**: `/ship`으로, `feat/canvas-open-offer` 브랜치에서 한다. 앱 화면 변화가 없으므로 `/design-draft`는 없다.
- **순서**: schema와 fixture → 순수 함수 → 셸(I/O) → 가이드·설정 → eval → 승격. `──` 줄이 커밋 경계이고, 각 커밋은 테스트를 통과한다.

- [ ] T1. 포맷: `schema/app-socket.v4.schema.json`(open 요청·응답·거절 코드)과 `schema/fixtures/app-socket-v4/`(정상, 각 거절, 버전 불일치)를 만든다. ARCHITECTURE §11의 CLI 응답 표에 `doan open` 결과를 더할 자리를 정한다. 확인: Go와 TS의 schema fixture 테스트가 새 fixture를 읽고 green(`go test ./...`, `npm --prefix app test`).

── 커밋: `feat(schema): app-socket v4 for doan open`

- [ ] T2. Go 순수 함수: `openRequest`(인자 검사, 요청 생성)와 `openReply`(응답 검증, 결과·exit code 변환). 확인: `go test ./...`(`open_test.go`: 경로·frame 형식 오류는 exit 2, 거절 이유별 결과, `app_protocol_mismatch`).
- [ ] T3. TS 순수 함수: `openRequestResult`. deep link와 판정을 공유하고 잠금·다이얼로그 상태를 더한다. 확인: `npm --prefix app test`(기존 `open-link` fixture 테스트가 그대로 green, 새 판정 케이스 green).

── 커밋: `feat: doan open request rules`

- [ ] T4. CLI 셸: `doan open` 명령(`open.go`)을 만든다. 소켓 전송, 앱이 꺼져 있을 때 onboarding bootstrap 재사용, `--json` 출력, `doan help` 항목을 넣는다. 확인: `go test ./...`. 다음을 테스트로 고정한다.
  - 앱이 없고 `DOAN_RUNTIME`이 없으면 bootstrap을 한 번 시도한다.
  - `DOAN_RUNTIME`이 설정됐거나(빈 값 포함) 앱 밖의 CLI면 앱을 열지 않는다.
  - 권한이 거부되면 앱을 열지 않는다.
  - 응답에 토큰이나 runtime 경로가 섞이지 않는다.
  
  `go vet ./...`도 통과해야 한다.
- [ ] T5. 앱 셸: main의 v4 dispatch와 open 처리. 결과는 `deep-link:open`과 같은 renderer 경로로 보내고, 응답으로 결과를 돌려준다. 확인: `npm --prefix app test`. 다음을 고정한다.
  - token 검사
  - 등록되지 않은 루트 거절
  - 목록에 없는 캔버스 거절
  - 잠긴 페이지에서 `busy`
  - 쓰기·대화 시작이 없음
  
  `npm --prefix app run typecheck`도 통과해야 한다.
- [ ] T6. 실제 앱 확인: `/runtime-test`로 격리한 dev 앱에서 `DOAN_RUNTIME`을 지정한 `doan open`이 캔버스와 프레임을 연다. 없는 프레임이면 캔버스만 연다. 확인: probe가 완료 표시와 함께 exit 0으로 끝나고, 실제 상태가 실행 전후 같으며, 스크린샷을 남긴다.

── 커밋: `feat: doan open opens a canvas in the running app`

- [ ] T7. 에이전트 설정과 앱 프롬프트:
  - `CLAUDE_ALLOW_RULES`에 `Bash(doan open *)`을 더한다(`plan.ts`).
  - 앱 턴 프롬프트(`app/src/main/conversation/prompt.ts`)에 제안 금지 한 줄을 넣는다.
  
  확인: `npm --prefix app test`. `plan.test.ts`가 다음을 고정한다.
  - 두 규칙만 있는 파일에는 세 번째 규칙만 더한다.
  - 세 규칙이 다 있으면 쓰지 않는다.
  - 모양이 다른 파일은 건드리지 않는다.
  
  턴 프롬프트 테스트도 green이어야 한다.
- [ ] T8. 가이드: `skill.md`의 규칙 J와 Commands(`doan work done`의 links 용도, 새 `doan open`)를 고치고 `skill_test.go`가 새 문구를 고정한다. 출력 예산 테스트(`skillOutputBudget`)가 통과해야 한다. 확인: `go test ./...`.

── 커밋: `feat: agents offer to open edited canvases instead of printing links`

- [ ] T9. eval:
  - W3 rubric을 제안 기준으로 바꾼다(시나리오 버전 규칙상 W3b).
  - 사람이 열어 달라고 하는 새 시나리오를 더한다(`doan open` 호출과 인자를 automatic check로 확인).
  - 가짜 소켓에 v4를 지원한다.
  - R8을 새 턴 프롬프트로 갱신한다(R8b).
  - workspace의 Claude 허용 규칙을 갱신한다.
  
  모든 fixture는 절대 경로의 임시 `DOAN_RUNTIME`을 쓴다. 확인: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` 결과 `self-test PASS`와 exit 0.

── 커밋: `test(eval): open offer scenarios`

- [ ] T10. `/agent-eval`: `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios W3b,<새 시나리오>,R8b --round <name>`을 돌려 `docs/USABILITY-EVAL.md`에 기록한다. 확인: 각 시나리오가 Claude와 Codex에서 pass이고, 라운드가 기록됨.

── 커밋: `docs(eval): canvas-open-offer round`

- [ ] T11. 승격: 다음을 현재 규칙으로 고친다.
  - PRODUCT §5 item 3 'Deep links': 에이전트는 링크 대신 제안하고, 요청을 받으면 `doan open`을 실행한다.
  - PRODUCT §5 item 10: `doan open`은 앱이 필요하고, bundled CLI가 앱을 연다.
  - PRODUCT §5 item 0의 1: Claude 규칙이 세 개다.
  - ARCHITECTURE §4: app-socket v4, Bootstrap을 `doan open`도 쓴다.
  - ARCHITECTURE §6: 가이드 규칙 J.
  - ARCHITECTURE §7: 'Deep links'와 공유 판정, 'Agent setup'의 Claude allow rules, 'Input and prompt'.
  - ARCHITECTURE §11: v4 schema와 fixture.
  - ARCHITECTURE §12: `doan open` 결과와 exit code.
  - BACKLOG: 'Terminal `doan://` links'를 지우고, 2026-11-03에 확인한 Orca·Claude·Codex 앱의 scheme 차단 사실은 PRODUCT나 ARCHITECTURE에 이유로 남긴다.
  
  그 뒤 이 디렉터리를 지운다. 확인: `node .agents/skills/verify/scripts/verify.mjs --eval` 통과, `docs/features/canvas-open-offer/` 없음.

── 커밋: 문서마다 하나씩 (`docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): …`)
