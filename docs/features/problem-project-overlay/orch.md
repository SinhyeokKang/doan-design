# problem-project-overlay — orch

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 hash: `2b967ccb`(origin/main)
- 통합 branch: `feat/problem-project-overlay`(main에서 만듦). PR은 `--base main`, merge하지 않는다.
- conductor: Claude Code(Opus). worker도 Claude만 쓴다(model 교차 허가 없음).

## 결정 기록

- T0 결정은 design §3 Q1–Q27에 있다.
- 초안 확정(T1)은 첫 결정 gate다. B1·B2는 화면과 상관없어 확정 전에 시작한다. B3·B4는 확정 뒤에 시작한다.
  - 확인할 점 (a): `overlay-retrying`의 busy 상태에서 Retry는 채움을 유지하고 spinner를 보이며, 다른 버튼은 `--text-disabled`로 그린다. 문서 결정 없이 초안이 제안했다.
  - 확인할 점 (b): 문제 프로젝트 행은 펼침 chevron을 잃는다(`aria-expanded`·group이 없어서). 문서 결정 없이 초안이 제안했다.
  - 확인할 점 (c): `sidebar-states`의 읽는 중 spinner와 working 표시가 거의 같다(design §4.5가 사용자 확인으로 남긴 점).
  - 사용자 답: (a) 그대로 확정, (b) chevron 없음으로 확정, (c) 그대로 둔다. design §5에 적었다.
- worker가 `/runtime-test`를 따로 돌리지 않는다 — conductor 판단, 근거: B1·B2만으로는 화면이 바뀌지 않고, 화면 동작은 통합 뒤 T7에서 한 번 본다(AGENTS 'Verification policy').
- R1 review가 남긴 세 가지는 conductor가 정했다. 근거는 design이다. B4에 보냈다.
  - Home 전송 도착이나 Home 대화 열기의 root가 문제면 그 Overview + 오버레이로 간다. 근거: Q2, Q12, Q14. B2가 바꾼 `openWorkspace` 동작을 그대로 쓴다.
  - Back/Forward가 `uninitialized`·`error`·`cliError` root로 가면 toast 대신 Overview + 오버레이를 보인다. `notFound` visit은 지금처럼 건너뛴다. 근거: Q20, PRODUCT §5 'skipping deleted targets'.
  - Locate 뒤 새 root가 아직 문제면 `overview = true`로 들어가 오버레이를 보인다. 근거: design §9 2026-11-03 Locate 항목.
  - busy 동안 Details 글은 오버레이가 마지막 `detail`을 들고 있는다. `problemView`의 형태(§6)는 바꾸지 않는다.
  - `problemMessage`를 지운 뒤 notFound·uninitialized의 빈 `.canvas-status`가 그려지지 않는지 B4가 테스트로 고정한다.
- B3 handoff에서 conductor가 정한 것:
  - 메뉴의 Overview 항목은 `loading` root에서도 켜진다. 근거: 행 누르기가 이미 `loading` root를 연다(design §4.5 '행 누르기와 같은 곳').
  - 사이드바 hover 때 thumbnail을 숨기는 기존 규칙(`.shell-project-row:is(:hover, …) .shell-lead > .shell-thumbnail`)이 chevron 없는 문제·읽는 중 행에서 빈 자리를 남긴다. `styles.css`와 그 selector를 고정한 `ShellSidebar.test.tsx`를 함께 고쳐야 하므로 통합 뒤 B5가 맡는다.
- R2 review에서 conductor가 정한 것:
  - 🟡2(덮인 캔버스 페이지에서 Esc가 선택을 지움)를 고치려면 `CanvasController.ts`도 바꿔야 한다. B2가 끝났으므로 이 한 가지에 한해 B4에 그 파일을 맡긴다.
  - 사이드바 메뉴에서 문제 worktree를 고르면 repair 보기가 열리고, 거기서 Overview 항목으로 오버레이에 간다. 두 단계지만 그대로 둔다. 근거: Q13은 worktree를 옮기는 길만 요구하고, 한 번에 가게 바꾸면 PRODUCT 판단이 필요하다.
  - 오버레이를 지운 commit의 layout effect에서 포커스를 옮기는 방식을 받아들인다. 🟡1(목적지가 사이드바 행이 됨)을 고치는 것이 조건이다. 근거: R2가 그리기 전에 대상이 포커스를 받는 것을 확인했고, body를 읽는 경로를 찾지 못했다.
  - ⚪2(`loading` worktree가 문제로 끝나면 아무 일도 없음)는 전부터 있던 동작이라 이번 범위 밖이다.
- worker는 `/ship` 9단계(docs freshness)와 11단계(push)를 하지 않는다 — conductor 판단, 근거: 승격은 T9이고 conductor가 한다(orchestrate SKILL §4·§5).

## 초안 검토(conductor)

- `doan ls --json --repo .`: `problem-project` frame id 14개가 tasks T1 목록과 같다.
- `doan check --json --repo .`: error 1개(`select-inspect`의 `implements_not_found`, 기준선), 나머지는 mock.css `hardcoded_color` warning뿐이다.
- 렌더 검토: 프레임 14개를 Chromium으로 떠서 design §4.1–§4.5, §5 표와 맞춰 봤다(`.scratch/orch/draft/`). 어긋난 곳은 없다. `overlay-retrying`·`overlay-narrow-long`·`overlay-focus`의 implements가 design 표의 `ProblemOverlay.tsx` 대신 `App.tsx`인 이유는 그 파일이 아직 없어서이고, design §5에 적었다. 사용자는 설치된 앱에서 `doan open --frame`으로 프레임을 보고 확정했다.
- B3 ∥ B4 사이의 클래스 이름은 conductor가 정해 두 brief에 같이 적었다: `row-slot problem`, `row-slot reading`.

## batch

| batch | task | 파일 소유 | 선행 | model·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| B1 | T2 | `app/src/renderer/problemView.ts`, `problemView.test.ts` | — | Sonnet high: 순수 함수지만 사례가 많고 `cardRow` 동작 집합을 맞춰야 한다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `7cb87da8`·`953de0b8`·`3392bca3`(R1 보강 test), 완료 |
| B2 | T3 | `app/src/renderer/CanvasController.ts`, `CanvasController.test.ts` | — | Opus medium: `openWorkspace`의 `loading` 대기와 상태 비우기가 다른 진입 경로를 깨기 쉽다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `7d401638`·`634158b0`·`70135265`(R1 보강 test), 완료 |
| B3 | T4 | `app/src/renderer/ShellSidebar.tsx`, `ShellSidebar.test.tsx` | B1, 초안 확정 | Sonnet high: slot 우선순위·tooltip·aria는 단계가 많지만 판단은 design에 있다 | test, typecheck, lint | 통합 `6ddf05a0`·`8c521593`, review는 R2 |
| B4 | T5 | `App.tsx`, `ProblemOverlay.tsx`(새), `Home.tsx`, `styles.css`(모두 `app/src/renderer/`, `CanvasPane`은 `App.tsx` 안), `App.*.test.ts(x)`, `Home.test.tsx`, CSS 테스트, 새 `ProblemOverlay` 테스트 | B1, B2, 초안 확정 | Opus high: 포커스·inert·메뉴 상태·seen이 얽히고 틀리면 접근성과 데이터 표시가 깨진다 | test, typecheck, lint, build | 통합 `52ab3032`·`f118cbdc`·`85e248db`, lint cap 81로 낮춤 `81d5ba9e`, review는 R2 |
| B5 | T6 | B3·B4가 고친 파일, `docs/DESIGN.md` | B3·B4 통합 | Opus medium: computed style 측정과 수정 | `/design-sync` 프레임별 일치, `npm --prefix app test` | 통합 `410e5102`·`0132bccc`. 프레임 14개 중 13개 측정, 남은 차이 0(모두 문서화). 측정에서 renderer crash를 찾아 고쳤다 |
| R1 | B1·B2 review | 보고만 | B1·B2 통합 | Sonnet high: 작은 순수 함수와 controller diff다 | `/code-review` 보고 | 완료: 🔴 0, 🟡 3(B4 지시로 넘김), ⚪ 5(test 보강 2건 반영, 주석 경로는 T9) |
| R2 | B3·B4 review | 보고만 | B3·B4 통합 | Opus high: B4 diff가 포커스·inert·입력 막기·seen을 함께 바꾼다 | `/code-review` 보고 | 완료: 🔴 0, 🟡 2(B4), ⚪ 5. 수정은 B4에 보냈다(진행) |
| — | T7 | 없음(`.scratch/`) | B5 | conductor | `/runtime-test` 보고 | 대기 |
| — | T8 verify, T9 승격 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/BACKLOG.md`, 이 디렉터리 | 전부 | conductor | `verify.mjs` exit 0, T9 문구 검색 | 대기 |

- T0·T1(초안 그리기)은 시작 전에 끝났다. T1의 확정 기록 commit은 conductor가 한다.
- 사이드바 아이콘 CSS는 `styles.css`에 있으므로 B4가 가진다. B3은 클래스 이름을 정해 handoff에 적는다.

## B5 측정이 닿지 못한 상태

- `overlay-with-strip`: 문제 root 위 Home 대화 strip은 살아 있는 agent 실행이 있어야 만들 수 있다. T7에서도 같은 제약이 있다.
- `sidebar-states`의 checkout(권한 요청이 문제 아이콘을 이김), analytics(문제가 working을 이김), working 표시 행: 실행 중인 agent가 필요하다. 동작은 B3 test가 고정한다.
- 넘치는 scene의 스크롤: 초안 프레임이 넘치지 않아 실제로 굴려 보지 않았다.
- crash(오버레이와 Overview가 같은 React key)는 POSTMORTEM에 적었다(`7c227fd1`).

## 알려진 test 실패

- `src/main/shell.test.ts` "initializes a folder stored a moment ago, while its first read is still loading"는 시작 commit `85e3665a`에서도 실패한다(B2가 따로 확인). 이 run이 만든 실패가 아니다. 통합 verify 때 다시 본다.
- B4 통합 뒤 conductor checkout의 전체 실행(`81d5ba9e`)에서도 이 사례 하나만 실패했다(9431 통과). 그 파일만 두 번 따로 돌리면 71개가 모두 통과한다. 부하에서만 실패하는 main의 문제로 본다.
- `doanyRender`, `thumbnails`, `main/conversation/io` 테스트는 전체 실행의 부하에서만 실패하고 따로 돌리면 통과했다(B1·B2).

## 겹침과 순서

- B1 ∥ B2: 파일이 겹치지 않는다.
- B3 ∥ B4: B3은 `ShellSidebar.*`만, B4는 그 밖의 파일만 고친다. 둘 다 B1의 `problemView.ts`를 import만 한다.
- B5는 B3·B4 통합 뒤 단독이다.
