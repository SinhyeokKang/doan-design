# buzz-add-projects — orch

계획 출처: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 배치 분할·결정·상태만 적는다.

- 시작 해시: `dfaedfc2` (2026-10-30, main)
- 통합 브랜치: `feat-buzz-add-projects`
- 지휘자 체크아웃: `/Users/sinhyeok/code/doan-design`

## 결정 기록

| 날짜 | 결정 | 출처 |
|---|---|---|
| 2026-10-30 | 계획 문서는 `docs/features/buzz-add-projects/`다. 인자의 `buzz-add-project`는 같은 자식(부모 tasks C5)을 가리킨다 | 지휘자 판단 — 그 이름의 디렉터리는 이것 하나다 |
| 2026-10-30 | 이 세션에서 Codex 작업자를 쓸 수 있다(모델 계열 교차). Claude가 구현을 맡고, Codex는 교차 리뷰와 기계적 배치(BR)를 맡는다 | 사용자 ("Codex 워커 사용 가능"), 배분은 지휘자 판단 — 사용자 선호(Claude 주 작업, Codex는 교차 리뷰·일부 기계적 배치) |
| 2026-10-30 | M2의 "`flow.add`를 한 경로 판정으로 축소"는 BR(R1)로 옮긴다 | 지휘자 판단 — 축소하면 R1 전까지 남아 있는 체크리스트 스캔 경로가 깨진다. 지우는 배치가 함께 줄이는 편이 중간 통합을 컴파일 가능한 상태로 둔다 |
| 2026-10-30 | T1 중 App 수준 사례(잠긴 동안 이동 함수마다 무시, 페이지 진입이 startup 복원 취소)는 U1이 맡는다. BP는 순수 함수 `addPageReturn`·`leaveLocked`의 사례만 쓴다 | 지휘자 판단 — 두 사례는 `App.tsx`의 이동 함수를 거쳐야 검증되고, `App.tsx`는 BU1 소유다 |
| 2026-10-30 | S2 probe 명령: `node .scratch/runtime-test/buzz-add-projects/probe.mjs`. `/runtime-test` 스킬의 위치 규칙과 `app/runtime/` 지원을 쓴다 | 지휘자 판단 — tasks S2가 "명령 미정"으로 남겼고, `/runtime-test` 스킬이 probe 위치와 방법을 정한다(buzz-search 선례) |
| 2026-10-30 | `/agent-eval`은 해당하지 않는다. CLI·MCP 출력, 가이드, `doan check`, 스킬 스텁이 바뀌지 않는다. `onboarding_*` 계약 보존은 fixture `git diff --exit-code`와 기존 onboarding 테스트로 확인한다 | 지휘자 판단 — AGENTS '/agent-eval' 실행 조건, spec 완료 조건 12 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BM | T2, T5, M1, M2(`flow.add` 축소 제외) | `app/src/main/**`(새 공유 project 클래스, `onboarding/service.ts`, `menuState.ts`, `index.ts`, `senderAllowed.ts`, 새 `addPageRequest`), `app/src/preload/index.ts`(페이지 API 추가만) | — | Claude Opus high (clone 프로세스 정리, 두 인스턴스의 leftovers·대상 잠금 공유, IPC 발신자 검사. 틀리면 git 프로세스·임시 폴더가 남거나 온보딩 계약이 깨진다) | 구현 전 red 기록, `npm --prefix app test`(onboarding 기존 테스트 무수정), typecheck, `git diff --exit-code main -- app/src/main/onboarding/fixtures cli/internal` | 대기 |
| BP | T1(순수 함수 사례), T3, T4 | 새 렌더러 순수 모듈과 테스트, `homeComposer.ts`·테스트, `projectStep.ts`·테스트(`projectFooter`) | — | Claude Opus medium (이동 결과·하단 문구 판정. 명세가 자세해 판단 폭은 좁다) | 구현 전 red 기록, `npm --prefix app test`, typecheck, `onboardingView.test.ts`·`Onboarding.test.tsx` 무수정 통과 | 대기 |
| BU1 | U1, U2, U3 | `App.tsx`, 새 `AddProjectsPage.tsx`·페이지 세션·포커스 훅, `Onboarding.tsx`, `projectStep.ts`, `HomeComposerView.tsx`, `homeComposer.ts`, 이동 함수가 있는 렌더러 파일(`homeRun.ts`, `useComments.tsx`, `ShellSidebar.tsx` 등), 그 테스트 | BM·BP 통합 | Claude Opus high (화면 모델·포커스·잠금이 여러 이동 경로에 걸침, POSTMORTEM 다수) | tasks U1~U3 검증, POSTMORTEM `rg` 기록, test, typecheck | 대기 |
| BU2 | U4, U5 | `Onboarding.tsx`, `styles.css`, 온보딩 테스트 | BU1(같은 작업자·워크트리) | Claude Opus high (BU1 작업자 재사용. 터미널 재사용은 모델을 바꿀 수 없다) | tasks U4·U5 검증, test, build | 대기 |
| BR | R1, `flow.add` 한 경로 축소 | 지울 파일과 그 참조(`AddProjectsDialog.tsx`, `DropOverlay.tsx`, `addProjects.ts`, `addFlow.ts`, `index.ts`, `preload/index.ts`, `senderAllowed.ts`, `styles.css`의 옛 규칙, 관련 테스트) | BU2 통합 | Codex `gpt-6.1-sol` high (삭제와 참조 정리. 판단보다 단계가 많다) | tasks R1 `rg` 결과 없음, test, typecheck, build | 대기 |
| BS | S1, S2, S3 | U·R 배치 파일의 수정, `.scratch/design-sync/buzz-add-projects/`, `.scratch/runtime-test/buzz-add-projects/`, `docs/DESIGN.md` | BR 통합 | Claude Opus high (측정·수정·회귀 테스트, 실제 앱 probe) | 기록되지 않은 차이 0, probe exit 0, tasks S3 grep | 대기 |
| BZ | Z1~Z3 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/features/buzz-restyle/spec.md`·`tasks.md`(C5), `docs/features/buzz-add-projects/` 삭제 | 모든 배치 | 지휘자 (`/verify`, 문서 승격 커밋) | `verify.mjs` exit 0, tasks Z2 grep, Z3 디렉터리 없음 | 대기 |

D1(초안)은 이미 완료됐다(tasks D1, 4차 확정 + 5차 `selecting` 잠금 표시).

리뷰 작업자(보고만): BM → Codex `gpt-6-astra` medium. BP → Codex `gpt-6-astra` medium. BU1 → Claude Opus high(포커스·이동 판단이 많다). BU2 → Codex `gpt-6-astra` medium. BR → Claude Opus medium(Codex 구현의 교차 리뷰). BS의 코드 수정 → Codex `gpt-6-astra` medium.

## 겹침과 순서

- 1차 병렬: BM(main·preload), BP(렌더러 순수 모듈). 파일이 겹치지 않는다. GUI를 쓰는 배치가 없다.
- BU1은 BM·BP 리뷰·통합 뒤 새 워크트리에서 시작한다. BU1 완료 뒤 같은 작업자에게 BU2를 새 Task로 보내고, 그동안 BU1 리뷰를 돌린다. BU1 수정은 BU2 뒤 같은 작업자가 한다.
- BR은 BU2 통합 뒤. BS는 BR 통합 뒤이고, 실제 앱을 띄우는 유일한 배치다.
- BZ → push·PR. 병합하지 않는다.

## 진행 기록

- 2026-10-30: orch.md 작성.
- 2026-10-30: Run `run_68744da98d31`. BM(워크트리 `buzz-add-projects-BM`, dispatch `ctx_220895b5312c`, Opus high)·BP(워크트리 `buzz-add-projects-BP`, dispatch `ctx_bb598e0d7b7b`, Opus medium) 시작. `launch.effective`가 요청과 같다. 두 작업자 모두 heartbeat `investigating`으로 시작을 확인했다.
- 2026-10-30: BP 질문 — 알림 문구를 바꾸면 소유 밖 `HomeComposerView.interaction.test.tsx:178`의 기대 문자열이 깨진다. 그 문자열 하나만 고치도록 허용했다. `dropTarget`의 `project` 분기 제거는 `HomeComposerView.tsx` 호출부를 고쳐야 하므로 BU1로 미룬다(지휘자 판단 — 테스트 파일은 BM과 겹치지 않고, 호출부는 BU1 소유다).
- 2026-10-30: BP 완료. 커밋 `3d1faa70`(test, red 4파일·4테스트)·`673c1fd4`(feat), 브랜치 `SinhyeokKang/buzz-add-projects-bp`. 작업자 보고 app test 4719 통과, typecheck, `verify.mjs` PASS. 계획과 다른 점: `projectFooter(use, state, {busy, agentReady})`(온보딩 하단이 phase만으로 정해지지 않음), `setUpLabel`·`projectNoticeCode` 추가. BU1로 미룬 것: `dropTarget` `project` 분기 제거, T1 App 수준 사례, T3 세션 쪽 드롭 사례(busy 거부, inspecting 중 두 번째 드롭, notice 지우기). BP 작업자를 해제했다. 리뷰는 Codex `gpt-6-astra` medium(dispatch `ctx_859f961489e6`).
- 2026-10-30: BP 리뷰(Codex) 🔴0·🟡1. 🟡1: `addPageReturn`이 Quick Open을 root로만 비교해, 드래프트가 있는 origin과 같은 root의 다른 캔버스를 고를 때 `guard:false`를 낸다. 리뷰어가 test 4719·typecheck를 다시 돌려 통과를 확인했다. 계획과 다른 점과 BU1 이관은 타당하다고 판단했다. BP를 통합하고, 🟡1은 BU1의 필수 항목으로 넘긴다(지휘자 판단 — BP 작업자는 해제됐고, Quick Open pick 연결과 `addProjectsNav.ts` 사용처는 BU1 소유다. Quick Open은 기존 `openCanvas`의 캔버스 단위 가드에 맡기고 계약·테스트를 고친다). 리뷰어를 해제했다.
- 2026-10-30: BP를 cherry-pick했다(`5ef06e10`·`2e0f5d21`). 통합 지점에서 typecheck와 BP 관련 테스트 5파일·141개 통과를 확인했다. BP 워크트리는 BM 통합 뒤 정리한다.
- 2026-10-30: BM 완료. 커밋 `01ec862c`(T2·T5)·`23f57d12`(M1 refactor)·`960e30df`(M2), 브랜치 `SinhyeokKang/feat-buzz-add-projects`. 테스트 먼저 작성(red 17 실패, 모듈 없는 2파일). 작업자 보고: app test 4756, typecheck, `verify.mjs` PASS, fixtures·`cli/internal` diff 없음, onboarding 기존 테스트 무수정. 계획과 다른 점: `addPageRequest(op, value)`, `menu:state`의 `choose` 플래그 추가, `OperationBook` 분리, 전용 이벤트 `add-projects:open`, 클래스 단위 사례를 `addPage.test.ts`에 둠, `did-navigate`도 페이지 clone 취소. BM 작업자를 해제했다. 리뷰는 Codex `gpt-6-astra` medium(dispatch `ctx_b4d225e520e5`).
- 2026-10-30: BU1을 BM 리뷰와 병렬로 시작했다(dispatch `ctx_43de6caa551b`, 워크트리 `buzz-add-projects-BU`, Opus high). 기준은 `buzz-add-projects-bu1-base` = 통합 브랜치 + BM 커밋 세 개(통합 브랜치에는 아직 넣지 않음). 지휘자 판단 — BU1은 `app/src/main/**`·preload를 고치지 않으므로 BM 리뷰 수정과 파일이 겹치지 않는다. 리뷰가 preload API를 바꾸면 BU1에 알린다. BM은 리뷰 통과 뒤 통합 브랜치에 넣는다. BP 🟡1과 BP가 미룬 항목을 BU1 브리프에 넣었다.
- 2026-10-30: BM 리뷰(Codex) 🔴0·🟡2. 🟡1: 두 인스턴스의 clone이 같은 부모에서 동시에 실패하면 leftovers 기록을 서로 덮어쓴다. 🟡2: `projects.destination()`을 기다리는 동안 렌더러가 바뀌면(reload·crash) 그 뒤에 페이지 clone이 시작된다. 리뷰어가 실제 모듈로 둘 다 재현했고, test 4756·typecheck·보호 파일 diff 없음을 다시 확인했다. 계획과 다른 점 7개는 모두 수용했다. BM 수정 1차를 보냈다(Opus high, dispatch `ctx_9156a5a39360`). 리뷰어를 해제했다.
- 2026-10-30: BM 수정 1차 완료. 커밋 `bb15c91d`(test, red 4/195)·`470a312b`(fix, `projectAdder.ts`만). leftovers는 덮어쓰지 않고 합치며, 존재 확인 뒤 기록을 다시 읽는다. `cancelClones()`가 카운터를 올리고, destination 확인 뒤 카운터가 바뀌었으면 `inspection_stale`로 거절한다. 지휘자가 diff를 직접 확인했다(await와 재읽기 사이에 다른 await가 없다). 작업자 보고: test 4760, typecheck, 보호 파일 diff 없음. 리뷰어 재검토 없이 통합한다(지휘자 판단 — 수정이 19줄이고 리뷰어가 낸 재현이 그대로 회귀 테스트가 됐다). 작업자를 해제했다.
- 2026-10-30: BM 커밋 다섯 개를 cherry-pick했다(`6e0114a2` `d5670887` `3a0e31f8` `ce72772c` `8637969c`). 통합 지점에서 typecheck, app test 4774개 통과, fixtures·`cli/internal` diff 없음을 확인했다. BP·BM 워크트리는 `git cherry`에 `+`가 없고 깨끗한 것을 확인한 뒤 Orca로 지웠다. handoff와 리뷰 보고는 `.scratch/orch/buzz-add-projects/`에 옮겼다.
- 2026-10-30: BU1 완료. 커밋 `58b0158e`(test, red 20/296·7파일)·`b786887b`(feat), 브랜치 `SinhyeokKang/lugworm`. 작업자 보고: test 4801, typecheck, build, `verify.mjs` PASS, POSTMORTEM `rg` 기록. BP 🟡1은 `addPageReturn`에서 `row`·`quickOpen`과 `guard`를 빼고, LNB 행·Quick Open이 기존 `openCanvas`의 캔버스 단위 가드를 거치게 해서 고쳤다. 계획과 다른 점: 페이지 제목은 `h2`(design '포커스'; 초안은 `h1`), 잠금 중 Back은 `aria-disabled`(design '잠금'; 초안은 `disabled`), `addPageApi` 어댑터, 열린 dialog·메뉴도 Escape overlay로 봄. 둘 다 design.md가 정했으므로 `/design-sync`는 이를 문서화된 차이로 다룬다.
- 2026-10-30: BU1의 질문 — 잠금 중 다른 프로젝트 행 접기도 `toggleProject`로 막힌다. design '잠금'이 "펼치기 허용"이라 했으므로, 펼치기와 접기는 잠금 중에도 되고 워크스페이스로 가는 동작만 막는다(지휘자 판단 — 접기는 페이지를 떠나지 않아 같은 허용이다). BU2에 넣었다.
- 2026-10-30: BU2를 같은 터미널에 보냈다(dispatch `ctx_62a7dbc5c905`, Opus high 재사용). BU1 리뷰는 Claude Opus high(dispatch `ctx_8a016e065a02`)이고, BU2가 같은 워크트리를 고치므로 리뷰는 `b786887b`에서 만든 새 child 워크트리 `buzz-add-projects-rBU1`에서 한다.
- 2026-10-30: BU2 완료. 커밋 `a32a371f`(test, red 1/13)·`b6fbe1b0`(fix, 잠금 중 펼치기·접기)·`5ad3b0c9`(feat, 온보딩 `.ob-scroll.doan-scroll` 전체 폭 스크롤, clone 중 줄 두 쓰임, `.add-panel` 스크롤, 잠금 disabled 잉크). U4·U5 사례는 BU1 파일에 대해 red(3/61)를 확인했다. 작업자 보고: test 4805, typecheck, build. 남긴 것: 실제 앱 측정(S1), 잠금 중 LNB 행은 `aria-disabled`인데 펼치기는 됨(S2 접근성 트리에서 확인). BU 작업자는 BU1 리뷰 수정을 위해 유지한다(`worker-retain`). BU2 리뷰는 Codex `gpt-6-astra` medium(dispatch `ctx_a137077b0227`, child 워크트리 `buzz-add-projects-rBU2`, `5ad3b0c9`).
- 2026-10-30: BU2 리뷰(Codex) 🔴0·🟡1. 🟡1: 잠금 중 프로젝트 메뉴의 Overview·비선택 워크트리 항목에 Radix `data-highlighted` 강조 배경이 남고, 첫 아이콘과 경로 `small`이 disabled 색을 받지 않는다(`styles.css:688-689`, `ds/surfaces.css:80`). 이동은 App이 막으므로 표시만의 결함이다. 리뷰어가 test 4805·typecheck·build를 다시 돌려 통과를 확인했다. BU1 리뷰 결과와 함께 BU 작업자에게 수정으로 보낸다. 리뷰어를 해제하고 `buzz-add-projects-rBU2` 워크트리를 지웠다(보고는 `.scratch/orch/buzz-add-projects/`로 옮김).
- 2026-10-30: BU1 리뷰(Claude Opus high) 🔴0·🟡2·⚪5. 🟡1: 잠기기 전에 페이지에서 건 워크스페이스 이동(loading 프로젝트 행 등)이 잠금 뒤에 끝나 clone 중에 페이지를 떠난다. 🟡2: 창 전역 drag 거부가 파일이 아닌 드래그(텍스트·링크)도 막는다(옛 `DropOverlay`는 `Files`만 봤다). 계획과 다른 점 6개는 모두 타당하다. 리뷰어가 test 4801·typecheck를 다시 돌려 통과를 확인했다. ⚪ 처리(지휘자 판단 — "검증을 확실히" 기준과 design 문구): ⚪1 드롭 notice가 오류 alert 포커스를 가로챔 → 고침. ⚪2 `PageBody` 배선 테스트 → 추가. ⚪3(a) radio 포커스에서 Escape → design의 "편집 중인 입력"에 radio는 들지 않으므로 떠나게 고침, (b) tooltip overlay → 작고 테스트 가능하면 고침. ⚪4 세션 준비 전 Cmd+O → 버리지 않게 고침. ⚪5 origin reroot 뒤 Home 복귀 → design "목록에 없으면 Home"대로 둔다.
- 2026-10-30: BU 수정 1차(BU1 🟡1·🟡2, BU2 🟡1, ⚪1~4)를 유지한 BU 터미널에 보냈다(dispatch `ctx_aadaa8fdf0e4`). 리뷰어 두 명을 해제하고 `buzz-add-projects-rBU1`·`rBU2` 워크트리를 지웠다.
- 2026-10-30: BU 수정 1차 완료. 커밋 `7f6ef858`(test, red 9/94·5파일)·`94fe15dc`(fix). 지휘자가 제품 코드 diff를 직접 확인했다. 잠금 시작 때 `navigationIntent`를 올리고 `cancelWorkspaceOpen()`을 부른다. 창 거부는 `Files`일 때만 한다. 잠긴 메뉴 항목은 강조 배경을 없애고 아이콘·경로에 disabled 잉크를 준다. 드롭 notice는 포커스 대상에서 뺐다. Escape는 타이핑 입력만 붙잡고, tooltip은 overlay로 본다. 세션 준비 전 Cmd+O를 보존한다. 작업자 보고: test 4816, typecheck, build, `verify.mjs` PASS. 남긴 것: readonly URL 필드(확인 중)도 Escape를 붙잡는다(인라인 Cancel이 있어 그대로 둔다, 지휘자 판단). 별도 리뷰어 재검토는 하지 않는다(지휘자 판단 — 리뷰가 고칠 방법까지 적었고, 각 항목의 red→green이 있다). BS가 실제 앱에서 확인할 것: 잠긴 메뉴 항목에서 강조 배경을 없앤 뒤에도 키보드 포커스가 보이는지, 텍스트·링크 드롭, 붙잡힌 프로젝트 읽기 뒤의 잠금.
- 2026-10-30: BU 커밋 일곱 개를 cherry-pick했다(`9b1a79ad`..`65397f7f`). 통합 지점에서 typecheck, app test 4820개, build 통과를 확인했다. BU 작업자를 해제했고(`git cherry`에 `+` 없음), BU 워크트리와 임시 기준 브랜치 `buzz-add-projects-bu1-base`를 지웠다.
- 2026-10-30: BR 시작(Codex `gpt-6.1-sol` high, dispatch `ctx_47347c6d217b`, 워크트리 `buzz-add-projects-BR`).
- 2026-10-30: BR 작업자(Codex)가 도중에 멈춰 사용자가 재개했다. 재개 시점의 커밋은 `02378078`(test)·`95009905`(refactor)이다. 완료 신호를 받으면 handoff와 실제 커밋을 대조한다.
- 2026-10-30: BR 완료. 커밋 `02378078`(test, red 3/4823)·`95009905`(refactor). 작업자 보고: test 4783(옛 동작 테스트 40개 삭제, handoff에 하나씩 근거), typecheck, build, `verify.mjs` PASS, R1 `rg` 0건, 온보딩·fixtures·CLI diff 없음. 행동 변화: 저장소를 품은 부모 폴더는 `flow.add`에서 체크리스트 대신 `refuse`(앞단 inspection이 저장소 고르기를 먼저 보인다). 리뷰는 Claude Opus medium(dispatch `ctx_4c05172f314a`, child 워크트리 `buzz-add-projects-rBR`, `95009905`). BR 터미널은 사용자가 재개해서 `user_takeover`로 유지돼 해제되지 않는다(Orca 응답 `retained`). 사용자가 닫으면 된다.
- 2026-10-30: 대기 루프에 멈춤 감지를 더했다. 진행 중인 작업자가 두 번 연속 `working`이 아니거나 15분 동안 heartbeat가 없으면 깨운다(사용자 — Codex가 capacity에 걸려 완료 신호 없이 멈춘다).
- 2026-10-30: BR 리뷰(Claude Opus medium) 🔴0·🟡0·⚪3. 부모 폴더 `refuse`는 옛 스캔 후 취소 경로와 같은 `null`을 내고, `inspectPath`가 저장소 고르기를 먼저 보인다고 확인했다. 리뷰어가 test 4783·typecheck·build·R1 `rg`를 다시 돌려 통과를 확인했다. ⚪1(고아 토큰 `--bg-scrim-drop`과 대비 검사 행), ⚪2(`runLs`의 쓰이지 않는 `signal`과 옛 scan 주석)는 BR이 만든 고아라 지운다. ⚪3(`projectDeps.add` confirm 분기의 index 테스트)은 더한다. 셋 다 BS 앞머리에 넣었다(지휘자 판단 — BR 터미널은 사용자 소유이고, 정리가 작아 새 작업자를 띄울 일이 아니다).
- 2026-10-30: BR 커밋 두 개를 cherry-pick했다(`747b56a6`·`d2c855cf`). 통합 지점에서 typecheck, app test 4783, build, R1 `rg` 0건, 보호 파일 diff 없음을 확인했다. 리뷰어를 해제하고 `buzz-add-projects-rBR` 워크트리를 지웠다. BR 워크트리는 사용자가 지휘 뒤 BR 터미널을 닫을 때까지 남긴다.
- 2026-10-30: BS 시작(Opus high, dispatch `ctx_39dd6fabeb17`, 워크트리 `buzz-add-projects-BS`).
- 2026-10-30: BS 질문 — 확정 초안 `setup` 프레임은 로컬 폴더 setup 아래에 Choose another folder를 그렸는데, 구현과 출하된 온보딩은 URL에서 온 setup에만 둔다. 페이지에만 두고 '온보딩과의 공유' 표에 행을 더했다(지휘자 판단 — 초안이 페이지의 정본이고, 페이지 하단은 Cancel뿐이라 없으면 다른 폴더를 고르려고 페이지를 떠나야 한다. 첫 실행은 완료 조건 12·13이 공유 개선 셋 밖의 변화를 막는다). 온보딩에도 넣을지는 사용자 결정으로 남긴다.
