# canvas-row-menu — orch

- 계획: [spec](spec.md)·[design](design.md)·[tasks](tasks.md). 체인: [chain-261103](../chain-261103/chain.md) 링크 5.
- 시작: main 5b96de98(c371d7d2 위에 링크 5 시작 기록). 통합 브랜치 `feat/canvas-row-menu`.
- 지휘자: Claude Code 세션 e4ed3c1b(Opus), worktree `canvas-row-menu-orch`.

## 결정 기록

- 착수 조건(tasks 3–5행)과 Z1의 "terminal-agent-activity와 같은 PR" 전제를 지웠다. #72 병합으로 work 목록과 `doan work`가 main에 있다. spec 서두와 design 서두도 같이 고쳤다. — 지휘자 재량, 체인 시작 점검.
- design의 행 번호는 링크 1–4가 고친 파일에서 맞지 않는다. 행 번호 대신 이름으로 찾도록 서두에 적고, 바뀐 모양(프로젝트 메뉴 effect의 `menuRoot`, `modalClosed()`의 `focusAfterModal`, `modal` 구성, "Remove from Doan"의 위치 `homeCards.ts` `ROW_ACTION_LABELS`, 링크 2의 Project Settings 페이지)을 고쳤다. — 지휘자 재량, 링크 2 인계 기록.
- 캔버스 행 메뉴는 `menu doan-floating doan-menu shell-side-menu`를 쓴다. `shell-project-menu`는 붙이지 않는다(프로젝트 메뉴 effect가 그 클래스로 포커스 복귀를 판정한다). — 링크 1 사용자 결정(chain.md 인계 기록).
- 가이드 출력 예산: 약 134 B 남았다. T8은 새 문장을 짧게 쓰고 예산을 올리지 않는다. 다른 규칙 문장을 줄여야 하면 지휘자에게 묻는다. — 링크 3 인계 기록.
- eval id `X1`: 기존 D·H·O·R·W 계열(R8c, R9, W3b, W4 포함)과 겹치지 않는다. — 지휘자 재량.
- 링크 3·4의 `decideOpen`·`openLink`·칩 경로는 바꾸지 않는다. 휴지통으로 간 캔버스를 가리키는 링크·칩은 기존 목록 재확인이 거절한다(design '링크 3·4 경로와의 관계'). — 지휘자 재량.
- Safari에서 `doan export` 결과가 동작하지 않으면 두 브라우저에서 동작하는 가장 가까운 viewer 구조(예: srcdoc 대신 blob URL)를 골라 구현하고, 결정과 근거를 이 파일과 chain.md에 적은 뒤 계속한다. — 링크 1 지휘자가 남긴 사용자 결정.
- 실제 Safari 확인과 Put Back은 임시 파일로만 하며 묻지 않는다. — 체인 시작 점검.
- 작업자와 리뷰는 모두 Claude다. Codex 주간 한도는 91%를 썼다(2026-11-04 15:35 KST 초기화, 링크 4 eval rollout 기록). 대시보드의 Codex 18%는 30일 창이다. `/agent-eval`은 Claude 쪽을 먼저 돌리고 Codex 쪽을 따로 돌린다. Codex가 한도로 못 돌면 기록하고 Claude 쪽이 pass이면 병합한다. — 링크 5 브리프.
- viewer는 Geist를 넣지 않는다(B 차이 2). shell 크롬의 글꼴은 토큰에 이미 적힌 시스템 글꼴 스택으로 떨어진다. 넣으면 결과마다 base64로 약 93 KB가 늘고, design·초안은 글꼴 포함을 요구하지 않는다. `/design-sync`에서 글꼴 차이는 문서화된 차이로 적는다. — 지휘자 재량.
- 사용량(링크 5 시작): Claude 7일 80%(2026-11-04 13:59 KST 초기화). Opus는 판단이 무거운 배치(A1, C1, C2)에만 쓴다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| A1 | T1·T2·T3 | 새 `cli/internal/export/*.go`(+테스트, `viewer/` 제외), `cli/internal/canvas/css.go`(위치를 내는 lexer와 `rewriteCSS`만)+테스트 | 없음 | Claude Opus high: serving scope가 곧 보안 경계이고, 링크·`..`·scope 밖 판정과 CSS lexer 다시 쓰기가 틀리면 repo 파일이 새어 나간다 | go test, go vet | 대기 |
| B | T4 | 새 `cli/internal/export/viewer/*`, 새 `app/src/main/exportViewer.test.ts` | 없음(MIME 표 비교 테스트는 A1의 MIME 표 커밋 뒤) | Claude Sonnet high: 앱 함수를 그대로 옮기는 golden과 viewer 상태가 정해져 있다. 높이 규칙의 함정이 많아 high | app test·typecheck | 대기 |
| C1 | T6·T9 | 새 `app/src/main/canvasTrash.ts`+테스트, `app/src/main/cli.ts`(`runExport`), `app/src/main/index.ts`, preload, `senderAllowed.ts`, 새 `app/src/renderer/canvasRowMenu.ts`+테스트, `app/src/renderer/canvasView.ts`+테스트. C1 질문으로 더함: `conversation/service.ts`(project evidence 읽기 전용 accessor, root 일치만), `CanvasController.ts`(휴지통 표시 저장소, `applyEntries`의 정리, `canvasTrashed` 콜백만) | 없음 | Claude Opus high: renderer가 보낸 경로를 믿지 않는 경계, 확인과 사용 사이의 경로 교체, main의 작업 중 판정 근거가 얽혀 있다 | app test·typecheck·build | 대기 |
| A2 | T5·T7·T8 | `cli/internal/export/assemble*.go`, `cli/internal/cli/export.go`·`run.go`·`args.go`·`envelope.go`·help usage+테스트, `cli/internal/cli/skill.md`·`skill_test.go` | A1·B 통합 | Claude Sonnet high: 조립과 명령은 design이 순서·오류 코드까지 정했다. `srcdoc` escape는 리뷰를 Opus로 한다 | go test, go vet, Safari 스크린샷 | 대기 |
| C2 | T10 | `ShellSidebar.tsx`+테스트, `App.tsx`+테스트, 새 대화상자 컴포넌트+테스트, `styles.css` | C1 통합 | Claude Opus high: 메뉴·대화상자·포커스 복귀·삭제 뒤 화면이 여러 POSTMORTEM 함정과 겹친다 | app test·typecheck·build, verify | 대기 |
| D | T11 | `eval/`(X1), `docs/USABILITY-EVAL.md` | A2 통합 | Claude Sonnet high: 시나리오 선례가 많다 | eval unit, self-test, `/agent-eval` | 대기 |
| E | T12·T13 | `.scratch/design-sync/`, `.scratch/runtime-test/`, `docs/DESIGN.md`, `/design-sync` 고침은 C2 파일에 한정 | 모든 구현 배치 통합 | Claude Sonnet high: 측정·probe 선례가 있다. 실제 Safari와 휴지통은 임시 파일만 | probe exit 0, real-state, DESIGN 갱신 | 대기 |
| 지휘자 | Z1 | 통합 브랜치, `docs/` 승격 | 모든 배치 | — | `/verify --eval` | 대기 |

리뷰는 Claude 서브에이전트로 한다(`/code-review`, 보고만): A1·C1·C2는 Opus, B·A2(조립 escape는 Opus)·D는 Sonnet.

## 겹침과 순서

- A1, B, C1은 파일이 겹치지 않아 함께 시작한다. B의 MIME 표 비교 테스트는 A1이 MIME 표를 먼저 커밋하면 지휘자가 feat에 cherry-pick하고 B에 rebase를 보낸다. 그전에 끝나면 deferred로 둔다.
- A2는 A1·B 통합 뒤(`assemble`이 viewer 파일을 embed한다). C2는 C1 통합 뒤(preload API와 순수 함수).
- D는 A2 통합 뒤, E는 모든 구현 배치 통합 뒤다. D의 `/agent-eval`과 E의 GUI probe는 겹치지 않게 돌린다.
