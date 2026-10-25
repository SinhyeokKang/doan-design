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

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | 1, 2 | `app/src/comments/targetLabel.ts`, `app/src/comments/panelText.ts`와 테스트(새 파일) | — | Opus high (대상 표시의 경계와 패널 상태 우선순위가 다른 기능의 기준이 된다) | `npm --prefix app test` red→green, `typecheck` | 대기 |
| M | 3 | `app/src/main/comments/{identity,service}.ts`, `app/src/preload/index.ts` 타입과 각 테스트 | — | Codex `gpt-6.1-sol` medium (원인 코드를 더하는 작은 기계적 변경) | test(identity·service), typecheck | 통합 2932e4d, f2132f8 |
| W | 4 | `CommentsPanel.tsx`, `useComments.tsx`, `styles.css`(대상 줄), 두 테스트, e2e 버튼 이름·문구(`presentation`, `design-nav`, `projects-home`, `onboarding`, `comments-ui`, `revision-continuity`) | P, M 통합 | Opus high (읽기 실패와 쓰기 차단 분리, identity 블록, 작성 중 외부 갱신·IME 유지) | test, typecheck | 대기 |
| Q | 5 일부 | `RightPanel.tsx`, `canvasInfo.ts`, `CommentPins.ts`, `Sidebar.tsx`(aria)와 테스트, `app/e2e/{anchors,runtime}.ts`의 aria·Canvas 정보 단언 | P 통합 | Opus medium (문구와 구성 제거) | test, typecheck | 대기 |
| L | 5 나머지 | `CommentsPanel.tsx`, `styles.css`, `App.tsx`, 포커스에 필요한 `CommentPins.ts`·`Sidebar.tsx`와 테스트 | W, Q 통합 | Opus high (비동기 필터 뒤 포커스, 대화상자와의 순서, container 높이) | test, typecheck | 대기 |
| E | 6, 7 | `.scratch/comments-readability/`, `app/e2e/comments-ui.ts`, `app/e2e/runtime.ts` export | L 통합 | Opus high (실제 창 도달성 측정, fixture 경고, identity 캔버스 시나리오) | 측정 로그·스크린샷, 모듈 단독 실행 PASS(전체 e2e는 지휘자) | 대기 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | R-PM·R-Q·R-E: Codex `gpt-6-astra` medium. R-W·R-L: Opus high. R-G: Opus medium | `/code-review`, 🔴 0 | — |
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
