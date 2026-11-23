# 프로젝트 대화의 handoff — orch

- 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261123-1](../chain-261123-1/chain.md) 링크 2. 권한·로그인·운영 메모는 체인 파일을 따른다.
- 시작 hash: `4c4a75c0c` (`origin/develop`)
- 통합 브랜치: `feat/project-conversation-handoff` (이 워크트리, 리드가 만듦)
- 모델: conductor와 워커 모두 Claude. 모델 경계 넘기 없음(체인 '상시 권한').

## 결정 기록

- tasks 0: overview-conversation-list가 HEAD에 있다(#377, `81846cf9b`). 그 feature가 더한 '보이는 중 승격' 코드는 `CanvasConversationList.tsx:83`의 주석·판정과 `App.conversationPanel.test.tsx`, `CanvasConversationList.test.tsx`, `CanvasConversationList.keyboard.test.tsx`, `canvasConversationRows.test.ts`의 promotion 테스트다. 배치 B의 삭제 목록에 더한다.
- conductor's call — `ConversationSummary.projectTurnId`는 남긴다. tasks와 design은 루트 잠금과 함께 걷어낸다고 적었지만, 프로젝트 제거의 Stop(`homeRun.ts`의 removal, `interruptProjectTurn`)이 이 값으로 멈출 턴을 고른다. 잠금 용도만 없앤다. 근거: design.md '프로젝트 제거'가 제거의 Stop을 유지한다.
- conductor's call — 배치는 tasks.md 제안 A~D를 바꿔 프로토타입 창 C를 층별로 나눈다. main 쪽(`main/prototype/*`, `preload/prototype.ts`, `index.ts` 중계)은 A, 렌더러 쪽(`renderer/prototype/*`)은 B가 맡는다. 근거: `index.ts`, `preload/index.ts`, `preload/prototype.ts`를 A와 C가 함께 고치게 되어 병렬로 돌릴 수 없다.
- conductor's call — ACP PoC(tasks 1)는 배치 P로 따로 돌린다. 어댑터 수정이 필요하면 A에 새 Task로 보낸다(tasks 1).
- conductor's call — `styles.css`·`chipField*`·`package.json`은 어느 배치도 고치지 않는다(체인 '겹침 확인'). 고쳐야 하면 워커가 conductor에게 묻고, conductor가 리드에게 알린다. drawing 미리보기용 CSS가 고아로 남으면 링크 1 머지 뒤 처리한다.

## A·B 계약

A와 B는 병렬로 돌므로 경계 형태를 미리 정한다.

- **C1** `HandoffOrigin`(`main/conversation/types.ts`): `{ kind: "handoff"; conversationId: string; canvas?: Canvas }`. `canvas`가 없으면 원본은 그 루트의 Overview(프로젝트 대화)다.
- **C2** `HandoffNotice.source`·`HandoffMultiNotice.source`(`main/conversation/handoff.ts`): `{ conversationId: string; canvas?: Canvas }`. `root`는 그대로다. `canvas`가 없으면 원본은 Overview다.
- **C3** 없어지는 preload API: `window.doan.setPrototypeDrawing`, 프로토타입 preload의 `readDrawing`·`onDrawing`·`readPromoted`·`onPromoted`, 대화 오류 코드 `project_busy`. B가 렌더러 호출부를 모두 지운다.
- **C4** `ConversationSummary.projectTurnId`는 남는다(결정 기록). 뜻은 '일하는 중이거나 제거로 멈추는 중인 프로젝트 대화의 턴 id'다.
- **C5** handoff로 시작된 대화는 지금처럼 `startedBy: "handoff"`로 알아본다. 새 필드는 없다.
- **C6** `conversation.bound` 이벤트와 `startedBy: "promotion"`은 예전 기록에서 읽히기만 한다. main은 더 만들지 않는다.
- **C7** `HANDOFF_GUIDANCE`의 새 문구는 A가 정한다(spec '안내 문구'). D는 A가 들어온 뒤 `turnPrompt` 출력에 맞춘다.
- **경계 규칙**: A와 B는 각자 브랜치에서 상대 층 파일의 typecheck·lint 오류만 남길 수 있다(C1~C3 때문). 남긴 오류는 handoff에 파일별로 적는다. A를 통합한 뒤 B가 `feat/project-conversation-handoff`를 병합해 전체 게이트를 green으로 만든다(B의 미룬 항목). `viewerApp.js`는 A가 재생성하고, 마지막 통합 뒤 `node app/scripts/viewerInspect.mjs --check`로 확인한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | tasks 1 (ACP PoC) | `.scratch/`만. 저장소 파일 없음 | 없음. GUI·Keychain 창 전 conductor가 리드에게 알림 | Opus medium — 실제 로그인 복사본을 다루고 정리해야 해서 판단이 필요하지만 코드 변경은 없다 | provider별 관찰(경로 도착, handoff 실행, 버전, 날짜)과 정리 증거가 handoff에 있음 | 대기 |
| A | tasks 2, 3(main·서비스), 4(main·preload·프로토타입 main), 5, `viewerApp.js` 재생성 | `app/src/main/**`, `app/src/preload/**`, `cli/internal/cli/handoff_rules*.go`, `cli/internal/export/viewer/viewerApp.js` | 없음 | Opus high — 서비스의 큐·취소·동시 실행 경쟁(postmortem 다수), 잘못되면 대화가 엉뚱하게 시작되거나 멈춘다 | `npm --prefix app test`(main·preload), `go test ./...`, `go vet ./...`, `node app/scripts/viewerInspect.mjs --check`, typecheck·lint는 경계 규칙 안에서 | 대기 |
| B | tasks 3(renderer), 4(renderer·프로토타입 창 렌더러) | `app/src/renderer/**` (`styles.css`, `chipField*` 제외) | A 통합 뒤 병합 라운드(경계) | Opus high — 화면 이동 판정(고름·입력 중·오버레이)과 패널 따라가기가 여러 상태에 걸친다 | `npm --prefix app test`(renderer), 병합 라운드 뒤 전체 `/verify` | 대기 |
| D | tasks 6 (러너, R12, R8d·R9b·R10·R11 `prompt.md`) | `eval/**` | `prompt.md`·`prompt.test.ts`는 A 통합 뒤(C7) | Sonnet medium — 러너 형식과 fixture가 대부분 정해진 틀을 따른다 | `node eval/run.ts --self-test`(PASS, exit 0), `node --test 'eval/**/*.test.ts'` | 대기 |
| conductor | tasks 0(완료), 4의 `/runtime-test`, 6의 `/agent-eval` 라운드, 7 문서 승격 | `orch.md`, `docs/` | 모든 배치 통합 | — | `/verify --eval`, runtime 프로브, `/agent-eval` 기록, tasks 7의 grep | — |

- 리뷰 워커: A·B는 Opus high, D는 Sonnet medium, 각자 `/code-review`로 보고만 한다.
- 병렬: P·A·B·D를 함께 시작한다. 파일이 겹치지 않는다. A·B의 겹침은 타입 경계뿐이고 위 규칙으로 처리한다.
- 통합 순서: A → D(미룬 항목 뒤) → B(병합 라운드 뒤). 체인 밖 `fix/overview-waiting-row-focus`가 develop에 머지되면 리드의 지시에 따라 `origin/develop`을 병합한다(`ProjectOverview.tsx`, `App.tsx`가 B와 겹침).

## ACP PoC 결과

- 1차 실행(2026-11-23): 임시 HOME으로 띄워 macOS가 로그인 키체인을 찾지 못했고("키체인을 발견할 수 없음"), 복사한 vault를 풀지 못해 세 provider 모두 로그아웃으로 거부됐다(Cursor·Antigravity `not_logged_in`, Copilot `session_unavailable`). 관찰 없음. 설정 단계의 `doan check`가 격리되지 않은 `DOAN_RUNTIME`으로 돌아 실제 `sessions.jsonl`에 지워진 임시 경로를 가리키는 줄 두 개(6139, 6140)가 붙었다. 덧붙이기 기록이라 그대로 두었다.
- 2차 실행: 같은 원인(임시 HOME). 120초 게이트로 끝났다.
- 3차 실행(리드 규칙): 실제 HOME, userData 복사본, 격리된 `DOAN_RUNTIME`, 메인 체크아웃의 Electron 바이너리(Safe Storage 항목이 그 경로를 믿는다). 캔버스 대화에서 새 캔버스를 만들고 `doan check`를 돌리라고 했다.

| provider | 버전 | 편집 경로 | `doan handoff` | 결과 |
|---|---|---|---|---|
| GitHub Copilot | Copilot CLI 1.0.114 | 왔다(`activity {kind:"edit", path:<캔버스 절대 경로>}`) | 실행했다. `handoff.resolved started`, 새 대화 시작 | 확인 |
| Antigravity | ACP 서버 1.3.0, gemini-3.8-flash-high | 미확인 | 미확인 | 셸 도구만 13번 부른 뒤 서버가 "No capacity available for model gemini-3.8-flash-high"로 답하고 턴이 끝났다. 파일을 쓰기 전이다 |
| Cursor | cursor-agent 2026.11.22-e9042b2 | 미확인 | 미확인 | 시작이 호출 약 2초 뒤 `process_exited`로 거부됐다. 원인은 잡지 못했다(stderr 없음) |

- 원시 ACP 프레임은 잡지 못했다(spawn hook이 Playwright `_electron`에서 읽히지 않음). Copilot 경로가 `locations[].path`에서 왔는지 `rawInput`에서 왔는지는 모른다. `acp.ts`는 둘 다 읽으므로 어댑터 수정은 필요 없다.
- conductor's call — Cursor와 Antigravity는 다시 돌리지 않고 문서 승격에서 BACKLOG 'Not verified in the real app'에 남긴다. 근거: spec 'ACP provider'가 안 되는 provider는 관찰을 BACKLOG에 남기라고 정했고, 다시 돌리려면 사용자가 Keychain 창 앞에 또 있어야 한다.
- 정리: Electron 종료, 복사본·임시 저장소·Copilot이 쓴 `/tmp/doan-guide.txt` 삭제, Keychain 항목 없음, 3차 실행의 real-state guard 통과. 증거 사본은 conductor 체크아웃 `.scratch/orch/acp-poc/`. 워커 해제, 워크트리 제거(브랜치 `SinhyeokKang/pch-p` 유지).

## 리뷰·통합 기록

- A: 구현 `7802800ab`·`1852e5bd6` → 통합 `72b4ab207`·`43d7bcfd1`. 독립 리뷰(Opus high) 🔴 0·🟡 2·⚪ 5(`.scratch/orch/review-A.md`). 수정 라운드 진행 중: 보류된 Claude 턴 끝 뒤 판정에 들어간 handoff를 프로젝트 제거가 취소하지 않음, 고아가 된 프로토타입 target 중계 제거, 프로토타입 창이 Overview 원본 대화가 남아 있는지 읽는 API(B 리뷰 🟡 1의 main 쪽), ⚪ 1·2·3·5. ⚪ 4(handoff 대상 시작의 runner가 제거 끝에 아직 닫히는 중일 수 있음)는 기록·상태가 남지 않아 둔다.
- `origin/develop` 병합 `07cf30f65`(#379, `ProjectOverview.tsx`의 권한 요청 항목 포커스). 리드 지시.
- D: `87e133726`·`1d1319542`·`b247de835` → 통합 `40ab2a584`·`638af3787`·`5da982af8`. 독립 리뷰(Sonnet medium) 🔴 0·🟡 2, 둘 다 고침(R12 판정을 수락된 요청에만, fail fixture에 다른 경로 요청). R10의 같은 판정 구조는 이 feature 전부터 있던 것이라 두고 PR에 적는다. A 병합 뒤 `prompt.md`는 그대로 맞았다. 워커 해제, 워크트리 제거(브랜치 `SinhyeokKang/pch-d` 유지).
- B: `a188e8982`·`61f377931`·`760bae9e6`·`2dcdee86c` → 통합 `5f22c6f8c`·`1a80e59bd`·`c2f3e2554`·`85e1b0fae`(트리가 B 브랜치와 같음, eval 제외). 독립 리뷰(Opus high) 🔴 0·🟡 2·⚪ 6(`.scratch/orch/review-B.md`). ⚪ 1·2·3·4·6은 고침. 🟡 1(프로토타입 창이 지워진 Overview 원본에 Open을 남김, spec 위반)과 🟡 2의 렌더러 fixture, ⚪ 5는 A의 수정이 통합된 뒤 B에 보낸다.
- 사용량 한도로 A·B가 한 번씩 멈췄다가 이어서 끝냈다.
