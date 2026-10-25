# comments-readability — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `f5ca6c8`(main)
- 통합 브랜치: `feat-comments-readability`(main에서 만듦)
- 지휘: Claude Code(Opus). review-loop 체인 링크 2(`.scratch/handoff/review-loop-chain.md`). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.
- 지휘 자료(브리프·인계·리뷰·근거): `.scratch/orch/comments-readability/`

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-26 | 사용자 확인 질문을 하지 않고 권장안대로 진행한다. 결정 지점에서는 지휘자가 권장안을 골라 이 로그에 근거와 함께 적는다. 실제 사용자 상태를 바꾸는 일은 예외로 묻는다 | 사용자(체인 규칙, "이 루프 링크는 가능한 내 허가 없이 추천안대로 쭉 진행해", "링크 5까지 전부 다") |
| 2026-10-26 | 구현은 Claude Opus가 맡고 Codex를 적당히 섞는다. 기계적인 배치 M은 Codex `gpt-6.1-sol` medium, 독립 리뷰 일부(R-PM, R-Q, R-E)는 Codex `gpt-6-astra` medium이 다른 계열로 읽는다. 쓸 때마다 진행 기록에 적는다 | 사용자(체인 규칙, "Codex 적당히 섞어 써도 괜찮아. 주 업무는 클로드 코드가 진행하되 적당히 섞어 사용해") |
| 2026-10-26 | 이 링크의 PR은 통합과 `/verify` 통과 뒤 main에 병합한다(`/orchestrate`의 병합 금지를 이 체인에서만 대체) | 사용자(체인 규칙, "링크마다 메인에 병합하면서 간다") |
| 2026-10-26 | tasks 6 측정 명령: 작업자가 `.scratch/comments-readability/measure.mjs`(Playwright `_electron`, `/design-sync` 측정 스크립트와 `app/e2e/runtime.ts`의 격리 방식)를 만들어 `node .scratch/comments-readability/measure.mjs`로 돌린다. 960×600과 1238×780에서 각 2회, 전후로 `real-state.ts`를 확인하고 exit 0으로 끝낸다 | 지휘자 판단 — AGENTS.md 'Commands'의 `/design-sync` 측정 스크립트 형식, 링크 1 tasks 2와 같은 방식 |
| 2026-10-26 | tasks 9 남은 참조 검사: `git grep -n -e 'comments-readability' -e 'features/comments-readability' -- . ':!docs/features/*' ':!design/*'` | 지휘자 판단 — 링크 1과 같은 검사. `design/`의 초안은 확정 초안이라 제외한다 |
| 2026-10-26 | `/design-sync` 루프는 돌리지 않는다. 바뀌는 화면이 모두 main에 있는 comments-ui이고, 확정 초안 `design/comments-readability.html`은 tasks 6 측정의 기준으로만 쓴다 | design.md '초안 요청'("`/design-sync` 루프 대상이 아니다"), 체인 규칙("이미 있는 화면은 tasks의 측정을 따른다") |
| 2026-10-26 | `/agent-eval` 회차를 돌리지 않는다 | spec '에이전트: 바뀌는 것이 없다', 체인 규칙(유일한 실제 회차는 링크 5) |
| 2026-10-26 | tasks 5를 둘로 나눈다. Q는 CommentsPanel·useComments·styles.css 밖의 표현(Canvas 정보 수 제거와 안내 순서, 핀·사이드바 aria 단수형)을 W와 병렬로 맡고, L은 W·Q 통합 뒤 작성기 위치, sticky 제목, 작은 패널 입력란, 포커스 규칙, Updated 배경, 대상 줄 hover를 맡는다 | 지휘자 판단 — 같은 파일을 두 배치가 동시에 고치지 않게 하고, Q의 파일은 W와 겹치지 않는다 |
| 2026-10-26 | 잘못된 canvas id는 앱에서 '없음' 블록("This canvas has no ID")으로 보인다. `doan ls`가 형식이 틀린 id를 행에서 빼므로 앱은 없음과 잘못됨을 구분할 수 없다. e2e는 두 캔버스 모두 이 문구를 정확히 단언한다. main의 `invalid` 원인은 그대로 둔다. 승격 때 알려진 한계와 PRODUCT §8 열린 질문(구분하려면 CLI 변경이 필요)으로 적는다 | 지휘자 판단 — spec과 design이 'CLI 바뀌지 않음'을 정했고, ARCH는 앱이 캔버스 meta를 다시 읽지 않게 한다. 다음 행동 문장은 두 경우에 모두 맞다 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | 1, 2 | `app/src/comments/targetLabel.ts`, `app/src/comments/panelText.ts`와 테스트(새 파일) | — | Opus high (대상 표시의 경계와 패널 상태 우선순위가 다른 기능의 기준이 된다) | `npm --prefix app test` red→green, `typecheck` | 통합 1603ed5, 47b71cc |
| M | 3 | `app/src/main/comments/{identity,service}.ts`, `app/src/preload/index.ts` 타입과 각 테스트 | — | Codex `gpt-6.1-sol` medium (원인 코드를 더하는 작은 기계적 변경) | test(identity·service), typecheck | 통합 2932e4d, f2132f8 |
| W | 4 | `CommentsPanel.tsx`, `useComments.tsx`, `styles.css`(대상 줄), 두 테스트, e2e 버튼 이름·문구(`presentation`, `design-nav`, `projects-home`, `onboarding`, `comments-ui`, `revision-continuity`) | P, M 통합 | Opus high (읽기 실패와 쓰기 차단 분리, identity 블록, 작성 중 외부 갱신·IME 유지) | test, typecheck | 통합 f8891d2, 536b43b |
| Q | 5 일부 | `RightPanel.tsx`, `canvasInfo.ts`, `CommentPins.ts`, `Sidebar.tsx`(aria)와 테스트, `app/e2e/{anchors,runtime}.ts`의 aria·Canvas 정보 단언 | P 통합 | Opus medium (문구와 구성 제거) | test, typecheck | 통합 5d1abd1, 6964435 |
| L | 5 나머지 | `CommentsPanel.tsx`, `styles.css`, `App.tsx`, 포커스에 필요한 `CommentPins.ts`·`Sidebar.tsx`와 테스트 | W, Q 통합 | Opus high (비동기 필터 뒤 포커스, 대화상자와의 순서, container 높이) | test, typecheck | 통합 479f5de, aae3766 |
| E | 6, 7 | `.scratch/comments-readability/`, `app/e2e/comments-ui.ts`, `app/e2e/runtime.ts` export | L 통합 | Opus high (실제 창 도달성 측정, fixture 경고, identity 캔버스 시나리오) | 측정 로그·스크린샷, 모듈 단독 실행 PASS(전체 e2e는 지휘자) | 통합 4d46e75 · 리뷰 R-E 진행 |
| F | R-W 🟡1·⚪2 | `useComments.tsx`와 테스트 | L 통합 | Opus high (렌더 시점의 세션 정체성 판정) | test red→green, typecheck | 통합 352bf4b, 54a0130 |
| F2 | R-L 🟡1·⚪1, postmortem | `useComments.tsx`와 테스트, `docs/POSTMORTEM.md` | F 통합 | Opus high (비동기 완료를 최신 의도에 묶는 수명) | test red→green, typecheck | 진행 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | R-PM·R-Q·R-L: Codex `gpt-6-astra` medium. R-W·R-E: Opus high. R-G: Opus medium | `/code-review`, 🔴 0 | — |
| 지휘자 | 8 | — | 전부 통합 | — | `node .agents/skills/verify/scripts/verify.mjs --runtime` 최종 PASS, exit 0 | 대기 |
| G | 9 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/DIRECTORY.md`, 이 디렉터리 삭제 | 8 | Opus medium (승격 위치가 tasks 9에 다 나와 있다) | 문서 diff 검토, 위 git grep 결과 없음 | 대기 |

tasks.md의 1~9는 모두 위 배치 중 하나에 속한다.

## 순서와 파일 겹침

- 1파: P ∥ M. P는 새 파일만, M은 main만 고친다.
- 2파: W ∥ Q(P·M 통합 뒤). W는 CommentsPanel·useComments·styles.css와 버튼 이름 e2e, Q는 RightPanel·canvasInfo·CommentPins·Sidebar와 anchors·runtime e2e를 고친다.
- 3파: L(W·Q 통합 뒤).
- 4파: E(L 통합 뒤). 그 뒤 지휘자 `/verify --runtime`, G, PR, 병합.
- 각 배치는 `--worktree new-child --base-branch feat-comments-readability`로 만든 자기 worktree에서 돈다.
- 링크 1에서 남은 일: 화면 잠금 때문에 전체 runtime 묶음이 돌지 않았다. 이 링크의 `verify --runtime` 전에 `ioreg -n Root -d1`로 잠금 상태를 확인한다. 풀려 있으면 이 실행이 링크 1도 덮는다. 잠겨 있으면 통과로 세지 않고 그대로 보고한다.

## 진행 기록

- 2026-10-26: 시작. 화면 잠금 상태 `CGSSessionScreenIsLocked = Yes`.
- 2026-10-26: Run `run_c1d82675f0e6`. 1파 시작 — P(`ctx_12b058718fa3`, Opus high, `cr-p`), M(`ctx_13b7e1b6bd81`, Codex `gpt-6.1-sol` medium, `cr-m`). `launch.effective`가 요청과 같다.
- 2026-10-26: P 질문 3건, 권장안대로 답했다. (1) 읽기 실패와 Git 이름 블록은 서로 독립이라 함께 보인다. identity 원인은 나머지를 모두 가리고, 로딩 중에도 identity 블록만 보인다. (2) `commentsPanelState`는 `{kind:'identity', cause} | {kind:'panel', read, authorBlock}`을 돌려주고, id가 필요한 문구는 `identityText(cause, canvasId)`·`warningFileText(canvasId)`가 만든다. (3) 선택이 없으면 범위가 Canvas로 바뀌므로(`useComments.tsx`) 따로 문구를 두지 않는다.
- 2026-10-26: M 완료(Codex Sol medium, `5acffd6`, `a80387d`) — red 9건 뒤 green, test 2329·typecheck 통과. preload는 `CommentReply`를 그대로 가져오므로 바꾸지 않았다. 통합(`2932e4d`, `f2132f8`). M 해제, `cr-m` 제거.
- 2026-10-26: P 완료(`1172cfa`, `0da4729`) — red(새 모듈 2개 import 실패) 뒤 green. 통합(`1603ed5`, `47b71cc`), 통합 HEAD test 2364·typecheck 통과(지휘자 실행). P 해제, `cr-p` 제거.
- 2026-10-26: 2파 시작 — W(`ctx_98f0dfe35314`, Opus high, `cr-w`), Q(`ctx_128b64903b44`, Opus medium, `cr-q`), R-PM(`ctx_913c75d0851e`, Codex `gpt-6-astra` medium, `cr-r-pm`). `launch.effective`가 요청과 같다.
- 2026-10-26: W 질문 — renderer `CommentsSession.ts`가 응답의 `cause`를 버린다. 허락: W가 `CommentsSession.ts`와 테스트의 read 경로를 고쳐 identity 원인을 세션에 남기고, `panelText.ts`는 main의 `CanvasIdentityCause`를 type import해 한 타입으로 둔다.
- 2026-10-26: R-PM 완료(Codex Astra medium) — 🔴 0 · 🟡 0 · ⚪ 1(원인 타입을 두 곳에 따로 선언). W가 이미 한 타입으로 합치는 중이다. R-PM 해제, `cr-r-pm` 제거.
- 2026-10-26: Q 완료(`3775005`, `74edbca`) — red 5건 뒤 green, test 2364·typecheck 통과. 남은 것: `styles.css`의 `.accent` 규칙이 쓰이지 않게 됨(L에 보낸다), Home·Project Overview의 'N open comments'는 단수형을 적용하지 않음(브리프 범위 밖, Home 요약은 spec대로 `revision-recheck`·`project-feedback`가 정리). 통합(`5d1abd1`, `6964435`). Q 해제, `cr-q` 제거. R-Q(Codex `gpt-6-astra` medium, `cr-r-q`) 시작.
- 2026-10-26: R-Q 완료(Codex Astra medium) — 🔴 0 · 🟡 0 · ⚪ 1(쓰이지 않는 `.accent`, L에 이미 넣었다). R-Q 해제, `cr-r-q` 제거.
- 2026-10-26: W 완료(`6a9f18f`, `022c347`) — red 35건 뒤 green. 승인한 확장: `CommentsSession.ts` read 경로, `panelText.ts`의 type import. 계획과 다른 점: 쓰기 응답의 identity 원인은 블록으로 보이지 않고 다음 읽기에서 보인다, identity 블록 아래에도 열린 편집기는 남는다(막힌 채), 경고 목록 CSS를 더했다. revision-continuity 모듈 단독 실행(화면 잠김)은 첫 실행에 t11 1건 실패, base와 재실행은 모두 통과. 통합(`f8891d2`, `536b43b`), 통합 HEAD test 2389·typecheck 통과(지휘자 실행). W 해제, `cr-w` 제거.
- 2026-10-26: 3파 시작 — L(`ctx_861936f2a932`, Opus high, `cr-l`), R-W(`ctx_487ce6f407a2`, Opus high, `cr-r-w`). R-W 지적 중 L이 가진 파일의 것은 L 통합 뒤 수정 배치로 보낸다.
- 2026-10-26: L 질문 — Save 뒤 포커스에 저장된 댓글 id가 필요한데 `CommentsSession.settle`이 버린다. 허락: L이 `CommentsSession.ts`에 `savedComment` 필드를 더한다(목록 차이로 추정하면 외부 댓글이 함께 올 때 틀린다).
- 2026-10-26: R-W 완료(Opus high) — 🔴 0 · 🟡 1 · ⚪ 3. 🟡: 캔버스를 바꾼 첫 렌더에서 이전 캔버스의 identity 원인이 새 캔버스 id로 보인다("Another canvas uses the ID b", role=alert). 세션 identity가 열린 행과 같을 때만 원인과 목록을 쓰게 고친다. 🟡와 ⚪2(`draftFrames`, `canSave`의 readError 훅 테스트)는 L 통합 뒤 수정 배치 F가 맡는다(L이 지금 `useComments.tsx`를 가진다). ⚪1(중복 해제 뒤 블록이 사라지는 e2e 단언)은 E에 넣는다. noWidth 캔버스에서 중복을 고쳐도 블록이 남는 것은 드문 조합이라 기록만 한다. ⚪3(열린 캔버스 없이 남은 초안의 read-only 블록)은 이전부터 있던 동작이라 고치지 않는다. W의 다른 점 3·4는 spec에 맞다고 판정했다. 근거: `evidence-R-W/`. R-W 해제, `cr-r-w` 제거.
- 2026-10-26: L 완료(`709f741`, `b808747`) — red 15건 뒤 green. 승인한 확장 `CommentsSession.savedComment`. 계획과 다른 점: 960×600에서 포커스만으로는 Save가 패널 밖에 남아 `revealComposer`로 스크롤한다, Save 뒤 포커스는 다시 읽은 목록의 앵커가 답할 때까지 제목이 가진다, 초안 대화상자의 Save and continue는 포커스를 카드로 옮기지 않는다. 격리 실제 창 확인(화면 잠김, DOM 포커스는 동작)에서 두 크기 모두 제목·To:·입력란·Save가 패널 안에 있었다. comments-ui 단독 실행은 08단계의 네이티브 창 포커스 대기에서 멈췄다(화면 잠금, 링크 1과 같은 지점). 통합(`479f5de`, `aae3766`), 통합 HEAD test 2406·typecheck 통과(지휘자 실행). 근거: `evidence-L/`. L 해제, `cr-l` 제거.
- 2026-10-26: 4파 시작 — F(`ctx_f33d20f40350`, Opus high, `cr-f`, R-W 수정), R-L(`ctx_2669067d8b04`, Codex `gpt-6-astra` medium, `cr-r-l`), E(`ctx_358544aac2f2`, Opus high, `cr-e`). 리뷰 모델 배정을 바꿨다: R-L은 Codex, R-E는 Opus high(E가 실제 창 측정이라 같은 계열로 재현하기 쉽다). E는 e2e와 `.scratch`만 고치므로 F와 겹치지 않아 병렬로 돈다.
- 2026-10-26: F 질문 — 캔버스 전환 첫 렌더에 이전 캔버스의 readError도 새 캔버스의 읽기 실패로 보인다. 허락: 패널 읽기 상태도 같은 조건(세션 identity = 열린 행)으로 막아 그 렌더는 로딩으로 보인다. `canSave`는 세션의 readError를 그대로 쓴다.
- 2026-10-26: R-L 완료(Codex Astra medium) — 🔴 0 · 🟡 1 · ⚪ 1. 🟡: 지연된 저장·핀 포커스 요청이 그 뒤에 연 새 작성기의 입력 포커스를 가져간다(IME 조합 중 포함, 재현 3건). ⚪: 저장 뒤 앵커 재조회에 응답이 없으면 포커스 대기가 끝나지 않는다. 결정: 지연 포커스는 그것을 시작한 사용자 동작에 묶고, 새 작성기·편집기·대화상자, 다른 선택이나 캔버스, 필터 변경에서 버린다. 앵커 무응답이면 측정 응답 제한 시간 뒤 제목에 남기고 끝낸다. F 통합 뒤 수정 배치 F2(Opus high)가 맡는다. 근거: `evidence-R-L/`. R-L 해제, `cr-r-l` 제거.
- 2026-10-26: F 완료(`0b56dad`, `358fe4b`) — red 1건 뒤 green, 변이 검사 4건이 각각 새 테스트 하나를 실패시킴. 세션 identity가 열린 행(root + canvas id)과 같을 때만 목록·readError·원인을 패널에 쓴다. 통합(`352bf4b`, `54a0130`), 통합 HEAD test 2409·typecheck 통과(지휘자 실행). F 해제, `cr-f` 제거. F2(`ctx_519455999cff`, Opus high, `cr-f2`) 시작 — R-L 수정과 두 리뷰 결함의 postmortem.
- 2026-10-26: E 완료(`2149c1c`) — tasks 6 측정 2회 모두 40/40(결과는 tasks.md 6에 옮겼다), 구현 결함 없음. comments-ui에 00e–00h 단계를 더했다(identity 단일 블록과 중복 해제, 960×600 대상 표시와 작성기 도달, 실제 `git merge-file --union` 경고, 읽기 실패와 Retry). 모듈 단독 실행은 기존 08단계(네이티브 창 포커스, 화면 잠김)에서 exit 1이고, 그 조건만 뺀 실행은 exit 0이었다. 창 크기 조정은 `runtime.ts`를 가져오면 전체 묶음이 돌아서 `appWindow` + `setSize`로 했다. 통합(`4d46e75`). E 해제, `cr-e` 제거. R-E(`ctx_fae9045c5bfc`, Opus high, `cr-r-e`) 시작.
