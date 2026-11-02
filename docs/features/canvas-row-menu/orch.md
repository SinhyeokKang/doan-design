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
- 리뷰 전 통합: A1·B·C1은 리뷰가 도는 동안 feat에 먼저 cherry-pick했다(3c54f122..bab0b631). A2·C2가 그 위에서 바로 시작하기 위해서다. 리뷰 수정은 새 커밋으로 원 작업자가 내고, 지휘자가 feat에 더한 뒤 A2·C2에 rebase를 보낸다. — 지휘자 재량.
- CLI 오류 메시지 형식(C1 제안): `export_refused`는 막힌 참조를 한 줄에 하나씩 `- <href>: <reason>`, `export_too_large`는 큰 자산을 큰 순서로 `- <repo 상대 경로>: <크기>`로 쓴다. 앱 `interpretExport`가 이 형식을 읽고, A2가 CLI 테스트로 고정한다. — 지휘자 재량.
- Show in Finder는 넷째 채널 `canvas:revealExport`가 main이 방금 쓴 파일의 id만 받는다(C1). `canvas:trashPlan`에 `kind: "ready"`, `canvas:trash` `comments`에 `"none"`과 실패 시 `file`을 더했다. — 지휘자 재량, C1 handoff.
- 데스크톱이 잠겨 있다(`CGSSessionScreenIsLocked` true). T5의 실제 Safari 확인은 할 수 없으므로, A2는 headless Chromium과 Playwright WebKit(대리 확인, Safari로 적지 않는다)으로 구조를 먼저 보고, 실제 Safari는 T13(e)로 미룬다. WebKit 브라우저 바이너리는 `~/Library/Caches/ms-playwright`에만 내려받고 패키지는 바꾸지 않는다. — 지휘자 재량.
- `runExport` 타임아웃(`EXPORT_TIMEOUT_MS` 120초)은 잠정값이다. A2가 50 MiB 근처 export 시간을 재고, 그 값으로 고친다. — 지휘자 재량.
- Export 진행 표시(C2 질문 1): main이 저장 패널에서 경로를 받은 뒤 CLI를 부르기 전에 주 창으로 `canvas:exportRunning {root, path}`를 한 번 보낸다(C1 수정 회차). renderer는 이 이벤트부터 1초를 재 진행 토스트를 띄우고, 답이 올 때까지 메뉴의 Export를 비활성으로 둔다. 요청 시점부터 재면 패널이 열린 동안이나 취소한 뒤에도 토스트가 뜨기 때문이다. — 지휘자 재량.
- `canvas:trashPlan` 거절(C2 질문 2): `busy`면 대화상자를 연 채 대화상자 안 작업 중 이유 줄을 보이고 확인 버튼을 `aria-disabled`로 둔다. `notListed`·`notFile`·`failed`와 IPC 실패면 대화상자를 닫고 같은 이유의 삭제 거절 토스트를 띄운다. — 지휘자 재량, design '문구'의 기존 문장.
- SVG `<use>`(RA1 🟡3): data: URL을 `<use href>`에 넣으면 WebKit·Firefox에서 보이지 않고 Chromium에서도 빠졌다. 결과 파일이 혼자 아이콘을 보이는 spec 결과를 지키려고, 로컬 `<use href="file.svg#id">`는 그 SVG 파일 내용을 숨긴 inline `<svg>` 하나에 한 번 넣고 href를 `#id`로 바꾼다. fragment가 없거나, 그 id가 파일에 없거나, sprite의 id가 캔버스나 다른 sprite의 id와 겹치면 거절한다. `<image>`·`feImage`는 data: 그대로다. — 지휘자 재량(링크 1 지휘자가 남긴 'Safari에서 안 되면 가장 가까운 구조' 결정과 같은 성격), 아침 보고에 넣는다.
- 결과 크기 상한(RA1 🟡2): `@import` diamond·순환이 결과를 폭증시킬 수 있어, A1이 `Inline` 안에서 읽기 전 파일 크기와 만들어지는 길이로 50 MiB에서 멈춘다. A2는 그 결과로 `export_too_large` 메시지를 쓴다. — 지휘자 재량.
- sprite의 자체 로컬 참조와 `<style>`(RA1-fix1 ⚪1): 자체 참조는 sprite 디렉터리 기준으로 같은 규칙을 거치거나 거절한다. sprite 안 `<style>`은 inline하면 캔버스 전체에 적용되므로 거절한다. — 지휘자 재량.
- `EXPORT_TIMEOUT_MS`: A2 측정 최악 15.7 s(한 디렉터리 자산 5,000개)라 120 s를 그대로 둔다(약 7배 여유, 느린 기기 여유). 'Provisional' 주석만 측정 근거로 바꾼다(C2 수정 회차). — 지휘자 재량, RA2 권고.
- `repo.Resolve` → `diskSpelling`이 참조마다 디렉터리 전체를 읽는 O(참조 × 항목) 비용과 24 MiB CSS의 1.4 GB RSS는 이번에 고치지 않고 BACKLOG에 적는다(Z1). 최악도 타임아웃 안이다. — 지휘자 재량.
- 사용량(링크 5 시작): Claude 7일 80%(2026-11-04 13:59 KST 초기화). Opus는 판단이 무거운 배치(A1, C1, C2)에만 쓴다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| A1 | T1·T2·T3 | 새 `cli/internal/export/*.go`(+테스트, `viewer/` 제외), `cli/internal/canvas/css.go`(위치를 내는 lexer와 `rewriteCSS`만)+테스트 | 없음 | Claude Opus high: serving scope가 곧 보안 경계이고, 링크·`..`·scope 밖 판정과 CSS lexer 다시 쓰기가 틀리면 repo 파일이 새어 나간다 | go test, go vet | 수정 1회(66593fc5·1891d4a6 → feat 0c39fe3e·59fa1cd0): CSS `<` escape, `InlineLimit` 50 MiB 조기 중단, `<use>` sprite inline. RA1-fix1 🔴 0·🟡 0·⚪ 8. 수정 2회 진행 중(ctx_2a3b5bed0ea6: sprite 안 로컬 참조·`<style>`, 고정 안 된 주장 테스트) |
| B | T4 | 새 `cli/internal/export/viewer/*`, 새 `app/src/main/exportViewer.test.ts` | 없음(MIME 표 비교 테스트는 A1의 MIME 표 커밋 뒤) | Claude Sonnet high: 앱 함수를 그대로 옮기는 golden과 viewer 상태가 정해져 있다. 높이 규칙의 함정이 많아 high | app test·typecheck | 완료. 통합 a3bc4c38, 수정 1회 1ee5c759 → febd8b46(캔버스로 포커스가 가면 팝업 닫기, 메시지 검사 고정). RB 🔴 0·🟡 2. Geist 미포함, layout `total` 추가. 작업자 해제, worktree 삭제, 브랜치 `canvas-row-menu-b`(1ee5c759)로 남김 |
| C1 | T6·T9 | 새 `app/src/main/canvasTrash.ts`+테스트, `app/src/main/cli.ts`(`runExport`), `app/src/main/index.ts`, preload, `senderAllowed.ts`, 새 `app/src/renderer/canvasRowMenu.ts`+테스트, `app/src/renderer/canvasView.ts`+테스트. C1 질문으로 더함: `conversation/service.ts`(project evidence 읽기 전용 accessor, root 일치만), `CanvasController.ts`(휴지통 표시 저장소, `applyEntries`의 정리, `canvasTrashed` 콜백만) | 없음 | Claude Opus high: renderer가 보낸 경로를 믿지 않는 경계, 확인과 사용 사이의 경로 교체, main의 작업 중 판정 근거가 얽혀 있다 | app test·typecheck·build | 완료. 통합 247f449c·bab0b631(e7231653·922ff308). 새 파일 `canvasExport.ts`. RC1 🔴 0·🟡 2(대기 표시 경쟁, main busy 근거 테스트). 수정 1회 af73bec9·6d16ea74 → feat 925245e1·1a05abba(행마다 대기 표시 여럿, renderer busy에 `working` 포함, `canvas:exportRunning`). 작업자 해제, worktree 삭제, 브랜치 `canvas-row-menu-c1`(6d16ea74)로 남김 |
| A2 | T5·T7·T8 | `cli/internal/export/assemble*.go`, `cli/internal/cli/export.go`·`run.go`·`args.go`·`envelope.go`·help usage+테스트, `cli/internal/cli/skill.md`·`skill_test.go` | A1·B 통합 | Claude Sonnet high: 조립과 명령은 design이 순서·오류 코드까지 정했다. `srcdoc` escape는 리뷰를 Opus로 한다 | go test, go vet, Safari 스크린샷 | 구현 완료(b7f472e9·aed36112·7efb135c → feat d63a6891·a3859a7f·30cc86e0). Chromium·Playwright WebKit 확인(실제 Safari 아님). 가이드 예산 1 B 남음. 최악 export 15.7 s(5,000개 자산). RA2 🔴 0·🟡 3(재스캔이 inline CSS 안을 안 봄, 가이드 줄에 `--json` 없음, `nextSteps`가 승인 없는 파일 이동·설정 변경을 권함). 수정 1회 진행 중(ctx_af3ce1cd626d) |
| C2 | T10 | `ShellSidebar.tsx`+테스트, `App.tsx`+테스트, 새 대화상자 컴포넌트+테스트, `styles.css` | C1 통합 | Claude Opus high: 메뉴·대화상자·포커스 복귀·삭제 뒤 화면이 여러 POSTMORTEM 함정과 겹친다 | app test·typecheck·build, verify | 구현 완료(2ecaa1d3 → feat 7293b1d4). `canvasTrashed` 미사용, `data-held` 포커스 유지. RC2 리뷰 중 |
| D | T11 | `eval/`(X1), `docs/USABILITY-EVAL.md` | A2 통합 | Claude Sonnet high: 시나리오 선례가 많다 | eval unit, self-test, `/agent-eval` | 진행 중(ctx_0a0d9183cb57). A2 리뷰 전에 시작했다 |
| E | T12·T13 | `.scratch/design-sync/`, `.scratch/runtime-test/`, `docs/DESIGN.md`, `/design-sync` 고침은 C2 파일에 한정 | 모든 구현 배치 통합 | Claude Sonnet high: 측정·probe 선례가 있다. 실제 Safari와 휴지통은 임시 파일만 | probe exit 0, real-state, DESIGN 갱신 | 대기 |
| 지휘자 | Z1 | 통합 브랜치, `docs/` 승격 | 모든 배치 | — | `/verify --eval` | 대기 |

리뷰는 Claude 서브에이전트로 한다(`/code-review`, 보고만): A1·C1·C2는 Opus, B·A2(조립 escape는 Opus)·D는 Sonnet.

## 겹침과 순서

- A1, B, C1은 파일이 겹치지 않아 함께 시작한다. B의 MIME 표 비교 테스트는 A1이 MIME 표를 먼저 커밋하면 지휘자가 feat에 cherry-pick하고 B에 rebase를 보낸다. 그전에 끝나면 deferred로 둔다.
- A2는 A1·B 통합 뒤(`assemble`이 viewer 파일을 embed한다). C2는 C1 통합 뒤(preload API와 순수 함수).
- D는 A2 통합 뒤, E는 모든 구현 배치 통합 뒤다. D의 `/agent-eval`과 E의 GUI probe는 겹치지 않게 돌린다.
