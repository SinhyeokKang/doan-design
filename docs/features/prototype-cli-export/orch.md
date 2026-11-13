# prototype-cli-export — orch

계획 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 체인: [chain-261113-3](../chain-261113-3/chain.md) 링크 2.

- 시작 hash: `a359ed91`(origin/develop, 링크 1a #189·1b #190 병합 뒤)
- 통합 브랜치: `feat/prototype-cli-export`(lead가 만들었다), conductor worktree `prototype-cli-export-orch`
- conductor: Claude Code(Opus). 체인 상시 권한으로 Codex 워커를 Claude 워커와 함께 쓴다. `/agent-eval`이 두 계열을 모두 돌리는 것은 AGENTS.md의 상시 예외다.
- Codex 사용량: 링크 시작 때 주간(`window_minutes: 10080`) 31% 사용(Orca `CODEX_HOME` rollout 기준).

## 결정 기록

새 제품·범위 결정은 없다. spec '결정' 1–18이 정해 두었다.

- conductor 판단 — 배치를 파일 소유로 넷으로 나눈다(아래 표). 근거: tasks 3–8이 CLI(Go), viewer, 앱(TS)에 걸치고, 셋의 파일이 겹치지 않는다.
- conductor 판단 — 선행 작업 둘은 '미룬 항목'으로 넘긴다. B의 `export.go` `AssemblePrototype` 호출은 A가 통합된 뒤, C의 `runtime.ts` v6 분기는 B의 스키마 커밋이 통합된 뒤 새 Task로 보낸다. 근거: /orchestrate §0.4(워커가 다른 배치를 기다리지 않는다).
- conductor 판단 — B는 스키마(task 3)를 첫 Task로 끝내고 `worker_done`을 보낸다. conductor가 바로 통합하고 C에 알린 뒤, B에 Go CLI를 다음 Task로 보낸다.
- conductor 판단 — `/design-sync`(task 9)와 `/runtime-test`(task 10)는 A·B·C 통합 뒤 C 워커가 통합 브랜치를 받아 돈다. 근거: 고칠 코드가 대부분 C의 파일이다. CLI·viewer 결함은 A·B로 돌려보낸다.
- conductor 판단 — eval(task 11의 runner·시나리오·`/agent-eval` 라운드)은 B 통합 뒤 D가 맡는다. guide(`skill.md`, `skill_test.go`)는 CLI 출력과 함께 B가 바꾼다.
- conductor 판단 — 문서 승격(task 12)은 conductor가 문서 커밋으로 한다(/orchestrate §4 docs-freshness).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | task 1(PoC), task 4·5의 `AssemblePrototype` 테스트·구현, task 6의 viewer(`prototype.html`·`.css`·`.js`, `isolate.js`)와 `exportViewer.test.ts` 고정 검사 | `.scratch/prototype-export-poc/`, `cli/internal/export/**`, `app/src/main/exportViewer.test.ts`, PoC 결과를 적는 `tasks.md` task 1·`design.md` '알려진 한계'·spec B | 없음 | Claude Opus high — 두 엔진의 격리·이동 차단은 실패하면 받는 사람에게 캔버스 전체가 드러난다 | `node .scratch/prototype-export-poc/probe.mjs` exit 0, `go test ./...`, `go vet ./...`, `npm --prefix app test` | 완료(리뷰 2회, 🔴·🟡 0) |
| B1 | task 3(스키마와 fixture, Go·TS v6 검증기) | `schema/app-socket.v6.schema.json`, `schema/fixtures/app-socket-v6/`, `cli/internal/formats/`, `app/src/formats/` | 없음 | Claude Opus high(B2와 같은 워커) — B2가 이어서 쓰는 v6 경계라 한 워커에 둔다 | `go test ./...`, `npm --prefix app test` | 완료 `6c3887fc` |
| B2 | task 4·5·6의 Go 부분(`PrototypeTarget`, `openInput`·`exportInput`, `prototypeRequest`·`prototypeReply`, `run.go`·`open.go`·`prototype_rules.go`·`export.go`·`envelope.go`, `open_test.go`·`export_test.go`), task 11의 guide(`skill.md`, `skill_test.go`) | `cli/internal/canvas/`, `cli/internal/cli/` | B1. `export.go`의 `AssemblePrototype` 호출은 A 통합 뒤(미룬 항목) | Claude Opus high — 오류 코드·exit·bootstrap 계약이 많고 에이전트가 직접 읽는다 | `go test ./...`, `go vet ./...`, `npm --prefix app test` | 완료(B3 `835d5dd6`, 리뷰 2회, 🔴·🟡 0) |
| C | task 4·5·7·8의 TS 부분(main: `requests.ts`, `cliPlay.ts`, `controller.ts`, `prototypeWindow.ts`, `runtime.ts`, `index.ts`, `ipc.ts`, `senderAllowed.ts`, `canvasExport.ts`, `cli.ts`, `fit.ts` R 104 / preload / renderer: 헤더 Export, 토스트 호스트, `view.ts`, `canvasRowMessages.ts`, `styles.css` `--pw-right`), 이어서 task 9·10 | `app/src/main/`(exportViewer.test.ts 제외), `app/src/preload/`, `app/src/renderer/`, `docs/DESIGN.md`(task 9) | `runtime.ts` v6 분기는 B1 통합 뒤(미룬 항목). task 9·10은 A·B·C 통합 뒤 | Claude Opus high — 포커스·tooltip·잠금·stale target 함정이 POSTMORTEM에 여럿 있다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`; task 9·10은 tasks.md의 명령 | 통합 `e82f0a81`, C2·리뷰 진행 중 |
| D | task 11의 eval(`eval/lib/socket.ts` v6, 시나리오 X2·W8, self-test, `/agent-eval` 라운드, USABILITY-EVAL.md) | `eval/`, `docs/USABILITY-EVAL.md` | B2 통합(guide·CLI 출력) | Codex gpt-6-astra medium — 시나리오 설계에 판단이 필요하고, 체인이 허용한 Codex 혼용 몫 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios X2,W8`, `npm --prefix app run package` 후 tasks 11의 라운드 | 통합 `cb381a26`, 리뷰 진행 중, 실제 라운드 대기 |
| 리뷰 | 배치별 독립 `/code-review` | 보고만 | 각 배치 완료 | A·B·C: Codex gpt-6-astra medium(다른 계열의 독립 판독), D: Claude Opus high | 보고서 | 대기 |

task 2(`/design-draft`)는 이미 끝났다. task 12(승격·삭제)는 conductor가 한다. 모든 체크 항목이 한 행에 속한다.

## 겹침과 순서

- A, B, C는 파일이 겹치지 않아 병렬로 돈다. 요청 v6 스키마(B1)와 `AssemblePrototype`(A)만 다른 배치가 쓴다 → 위 미룬 항목.
- D는 B2 통합 뒤 시작한다(eval self-test가 CLI를 스스로 빌드한다).
- C의 task 9·10은 A·B·C 통합 뒤. GUI 창을 띄우기 전과 뒤에 lead에 `GUI again` / `GUI done`을 알린다.
- 마지막: `/verify --eval`, 문서 승격, 기능 디렉터리 삭제, PR.

## 진행 기록
- Run `run_50c5d1fb8bd8`. A(`ctx_14263696ec87`, worktree `pce-a`), B1(`ctx_2fe81d7812fd`, `pce-b`), C(`ctx_821e87d65bb7`, `pce-c`)를 `142203a5`에서 시작했다. 모두 Claude Opus high.
- B1 완료(`af667b69`) → `6c3887fc`로 통합. B1 리뷰는 B2와 함께 B 리뷰에서 한다(conductor 판단: 스키마만 바뀐 작은 커밋이고, B2가 이 검증기를 바로 쓴다). 같은 워커에 B2(`ctx_a31f6b36ef7f`)를 보냈다. C의 `runtime.ts` v6 분기는 C가 끝난 뒤 새 Task로 보낸다.
- C 완료(`c9b09988..0001cbbb`) → `199a3393..e82f0a81`로 통합. 남은 것: `runtime.ts` v6 분기(C2, `ctx_7445cf99dfa4`로 보냄), 실제 앱 확인(task 9·10). C의 `runExport`는 `--frame=<id>`를 쓴다(프레임 ID `--`가 구분자로 읽히지 않게). Go `flag`가 이 형태를 받으므로 그대로 둔다(conductor 판단).
- C 리뷰: Codex gpt-6-astra medium(`ctx_0bca41bcc560`, worktree `pce-rc`). 리뷰 초점에 프로토타입 창 renderer가 root 절대 경로를 받는 점을 넣었다.
- C 리뷰 1회차(Codex): 🔴 0, 🟡 1(쓸 수 없는 Export가 `aria-disabled`만 있어 활성 색·hover를 유지한다. 초안은 비활성 잉크와 `not-allowed`), ⚪ 2(창 표시 이벤트 등록을 지워도 host 테스트가 통과한다, 창 닫힘·포커스·메인 창 독립성은 task 10에서 확인). 계획과 다른 점 7개와 root 절대 경로 노출은 수용. C2가 끝나면 🟡1과 ⚪1을 C에 보낸다.
- A 완료(`6061b251..91208d5b`) → `f159615d..d69dbc9f`로 통합. PoC: Chromium 156.0.8078.4·WebKit 27.2에서 (a)(d)(e)(f)(g) 통과. (b)는 srcdoc이 `#id`를 바깥 파일 URL로 풀어 실패해서 `isolate.js`가 `location.hash`로 직접 옮긴다. URL을 준 `pushState`는 두 엔진에서 `SecurityError`, (c) `stopPropagation()`한 handler의 기본 동작은 막지 못해 '알려진 한계'로 옮겼다. PoC 파일은 conductor `.scratch/prototype-export-poc/`에 복사했다.
- A 리뷰: Codex gpt-6-astra medium(`ctx_2ec46cedaad1`, worktree `pce-ra`). URL을 준 `pushState`를 한계로 둘지 `isolate.js`에서 완화할지 판단을 맡겼다. B2가 끝나면 `export.go`의 `AssemblePrototype` 호출(미룬 항목)을 B에 보낸다.
- B2 완료(`43cb1e0d..ff8cca86`) → `ab942c71..1a0b331b`로 통합. 통합 HEAD에서 `go test ./cli/...` 통과. 계획과 다른 점: guide가 `skillOutputBudget`(남은 16 B) 때문에 design 제안보다 짧고 item 14는 그대로다. 오류 코드별 안내는 `nextSteps`로 옮겼다. 사고: 테스트 한 번이 임시 HOME 없이 돌아 실행 중인 실제 Doan에 닿았고, 앱이 v1 `bad_request`로 답했다(상태 변경 없음). 이후 테스트는 임시 HOME을 쓴다.
- C2 완료(`665ba211`, `db9e90c0`) → `05958569`, `241f1b89`로 통합.
- A 리뷰 1회차(Codex): 🔴 0, 🟡 1(URL을 준 `pushState`·`replaceState`가 `SecurityError`를 던져 캔버스 스크립트가 멈춘다 → `isolate.js`가 그 경우만 URL 없이 다시 부른다), ⚪ 2(click·submit listener가 capture로 바뀌어도 테스트가 통과한다 / 캔버스가 `ready`를 위조할 수 있다 — 표시 규칙일 뿐 보안 경계가 아니므로 수용하고 한계에 적는다). 🟡1 수용은 conductor 판단: spec B의 "pushState가 동작한다"에 더 가깝다. A-fix1(`ctx_68e25df0ef66`)로 보냈다.
- C-fix1(`ctx_a23439f93fb1`), B3(`ctx_15915121cc50`, `AssemblePrototype` 호출과 CLI 출력 파일 probe), B 리뷰(Codex gpt-6-astra medium, `ctx_dc814240397d`, `pce-rb`), D(Codex gpt-6-astra medium, `ctx_da0c3e984a5b`, `pce-d`)를 보냈다. D의 실제 `/agent-eval` 라운드는 B3 통합과 package 뒤 새 Task로 보낸다.
- Codex 사용 범위(지금까지): A·B·C 리뷰, D 구현.
- C-fix1 완료 → `0d29661e`, `fd113a3d`로 통합. 표시 이벤트 등록을 지우는 변이가 이제 실패한다. C 리뷰 2회차(C2와 C-fix1)를 같은 Codex 리뷰어에 보냈다(`ctx_22abc182df7a`). C의 task 9·10은 A-fix1과 B3가 통합된 뒤 보낸다.
- B 리뷰 1회차(Codex, B1+B2): 🔴 0, 🟡 0, ⚪ 1(export 테스트에 앱이 쓰는 `--frame=<id>` 형태를 고정). ⚪1은 B3 브리프에 이미 있다. 계획과 다른 점(guide 축약, item 14 유지, `nextSteps` 이동 등)은 모두 수용됐다. B3가 끝나면 같은 리뷰어에게 B3 diff를 보낸다.
- D 완료(`d800cc37..d03b2f2c`) → `db780096..cb381a26`로 통합. eval 테스트 316개, self-test 41개 통과(D 보고). X2 실패 fixture는 지금 `prototype_export_command`로만 실패한다(B3 전이라 프로토타입 파일과 캔버스 viewer의 바이트가 같다). B3 통합 뒤 self-test를 다시 돈다. W8 거절 변형(표시 없는 프레임 → `not_prototype`)은 별도 시나리오 제안으로 남겼다.
- D 리뷰: Claude Opus high(`ctx_50c1c13435f5`, `pce-rd`).
- C 리뷰 2회차(Codex): 🔴 0, 🟡 1(새 비활성 규칙의 specificity (0,4,0)가 공유 pressed 규칙 (0,5,0)에 져 눌린 배경이 남는다. Chromium `forcePseudoState`로 재현), ⚪ 1(실제 앱 통합은 task 9·10). v6 socket 순서·CLI 요청과 응답의 일치·visibility 보강은 수용. C-fix2로 보냈다.
- A-fix1 완료 → `40b149ad`, `02b8b834`로 통합. probe 65(PoC)·63(실제 파일) 통과, capture 변이가 이제 실패한다(A 보고). A 리뷰 2회차를 같은 Codex 리뷰어에 보냈다(`ctx_2d53be29289d`).
- A 리뷰 2회차(Codex): 🔴 0, 🟡 0, ⚪ 1(모든 URL이 거절되는 것은 아니다. `about:srcdoc#…`은 성공한다. 주석과 문서 표현을 좁힌다). A-fix2로 보냈다.
- A-fix2 완료 → 통합. 주석이 페이지에 들어가므로 `TestAssemblePrototypeOutputIsPinned` digest 셋이 바뀌었다. A 배치는 리뷰 🔴·🟡 0으로 닫는다. task 9·10에서 viewer 결함이 나오면 A로 돌려보낸다.
- D 리뷰 1회차(Opus): 🔴 0, 🟡 3(X2가 프로토타입 페이지와 캔버스 viewer를 구별하지 못한다 / X2 명령 검사가 `-o` 경로까지 요구해 export 뒤 복사하는 정당한 경로를 실패시킨다 / W8 rubric에 partial 줄이 없다), ⚪ 4. 첫 실제 라운드 전에 고쳐야 새 id 없이 넣을 수 있다. B3 통합 뒤 D-fix1로 보낸다.
- B3 완료 → `835d5dd6`로 통합. CLI가 쓴 프로토타입 파일이 probe 57 통과(B 보고). 공백뿐인 `data-doan-title`을 그대로 쓰는 점은 B 리뷰 2회차(`ctx_83b3d8eceea2`)에서 앱의 이름 규칙과 대조한다. D-fix1(`ctx_6c937723e7e6`)을 보냈다.
- C-fix2 완료 → `99a68b7d`로 통합. Export 배경 규칙이 (0,6,0)이 되어 공유 hover (0,4,0)·pressed (0,5,0)를 이긴다. 테스트가 specificity를 계산해 비교한다. C 리뷰는 3회차 대신 task 9의 실제 앱 computed 측정(기본·hover·active)으로 닫는다(conductor 판단: CSS 한 규칙이고, 리뷰어가 요청한 확인이 바로 그 측정이다).
- lead에 `GUI again`을 보내고 C에 task 9·10(`ctx_34f8e7525844`)을 보냈다.
- B 리뷰 2회차(Codex, B3): 🔴 0, 🟡 0, ⚪ 1(공백 제목 회귀 테스트는 선택). 앱도 공백 제목을 그대로 쓰므로 id로 바꾸지 않는다. ⚪1은 넣지 않는다(conductor 판단: 앱과 같은 동작이고 리뷰어도 선택으로 분류). B 배치를 닫는다. task 10에서 CLI 결함이 나오면 B로 돌려보낸다.
- 정리: 리뷰어 `pce-ra`·`pce-rb`·`pce-rc`를 release하고 Orca로 worktree를 지웠다(브랜치는 남겼다). 보고서는 conductor `.scratch/evidence/`에 복사했다.
- D-fix1 완료 → `9a3abb3b`, `ba111596`로 통합. X2에 `output_not_canvas_viewer`(일반 export와 바이트가 다르고 프로토타입 제목·noscript 안내가 있음)를 더했고, 명령 검사는 출력 경로를 요구하지 않는다. D가 쓴 POSTMORTEM 초안(재생성한 참조와의 바이트 비교만으로는 결과의 종류를 증명하지 못한다)은 conductor가 문서 단계에서 POSTMORTEM에 넣는다. D 리뷰 2회차를 같은 Opus 리뷰어에 보냈다. 통과하면 실제 라운드를 D에 보낸다.
- D 리뷰 2회차(Opus): 🔴 0, 🟡 0, ⚪ 4. ⚪1(절대 경로를 문자열로 비교해 `/tmp` 별칭이 거짓 실패한다), ⚪2(W8 상대 경로 기준을 repo로), ⚪3(W8 rubric에 추가 일반 open 줄)은 첫 라운드 전에 D-fix2로 넣는다(conductor 판단: 첫 기록 라운드 뒤에는 시나리오가 고정된다). ⚪4(ARCHITECTURE §14)는 task 12. D-fix2 diff는 conductor가 직접 읽고 실제 라운드를 보낸다.
- D-fix2 완료 → `a5cb0b3c`로 통합. conductor가 diff를 읽었다(경로 `realpath` 정규화, W8 repo 기준, rubric 한 줄). 실제 라운드(`pce-x2w8`, `pce-full`)를 D에 보냈다(`ctx_5bdae7b6e8f0`). 사용자 승인으로 실행 중이던 `/Applications/Doan.app`을 라운드 전에 종료했다.
- C task 9·10 완료 → DESIGN.md `aa5c9d25`로 통합. design-sync 487행 차이 0(비활성 Export 기본·hover·press·forcePseudoState 포함), runtime-test 26/26 통과, 결함 없음. 미확인: 406 × 952(화면 work area 823), DPR 1, 실제 sheet로 파일 저장(main에서 stub), 실제 선택이 있을 때 선택 유지. design-sync 독립 리뷰 단계는 고친 코드가 없어 건너뛰었다. lead에 `GUI done`을 보냈다.
- D 실제 라운드: `pce-x2w8` 7 pass, W7-codex fail(`done_at_end`, judge partial). real-state는 `keychain:provider-items`만 바뀌어(USABILITY-EVAL의 기존 사례와 같다) 그대로 기록하고 `pce-full`과 W7-codex 반복을 진행하게 했다.
- task 12 승격(서브에이전트, Claude Opus): PRODUCT `f96f04c2`, ARCHITECTURE `252197fd`, README `89f0c9d6`, BACKLOG `5a805cc1`, POSTMORTEM `e3120299`. ARCHITECTURE §1 convention 14에 "CLI는 파일로 판정한다" 한 문장을 더했다(결정 10의 결과). 독립 리뷰: Codex gpt-6-astra medium(`ctx_9b05df94b15c`).
- 문서 리뷰(Codex): 🔴 0, 🟡 1(export의 파일 읽기 실패는 `export_refused`가 아니라 `canvas_not_found`/`internal_error`), ⚪ 2(측정 이력·변경 전후 문구, 소스와 겹치는 필드·채널 목록). 모두 `06eb2a1e`에서 고쳤다. 문서 리뷰어 worktree는 지웠다.
- `/verify --eval`을 `06eb2a1e`에서 시작했다(D의 실제 라운드와 동시에 돈다).
- `/verify --eval` 통과(`06eb2a1e`): verify-tests, runtime-support, go-test, go-vet, typecheck, lint, app-test, eval-tests, eval-self-test(`self-test PASS`), build. 로그 `.scratch/verify/2026-11-13T18-26-53-176Z-34900/`.
