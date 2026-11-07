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
| B3 | T4 | `app/src/renderer/ShellSidebar.tsx`, `ShellSidebar.test.tsx` | B1, 초안 확정 | Sonnet high: slot 우선순위·tooltip·aria는 단계가 많지만 판단은 design에 있다 | test, typecheck, lint | 진행 |
| B4 | T5 | `App.tsx`, `ProblemOverlay.tsx`(새), `Home.tsx`, `styles.css`(모두 `app/src/renderer/`, `CanvasPane`은 `App.tsx` 안), `App.*.test.ts(x)`, `Home.test.tsx`, CSS 테스트, 새 `ProblemOverlay` 테스트 | B1, B2, 초안 확정 | Opus high: 포커스·inert·메뉴 상태·seen이 얽히고 틀리면 접근성과 데이터 표시가 깨진다 | test, typecheck, lint, build | 진행 |
| B5 | T6 | B3·B4가 고친 파일, `docs/DESIGN.md` | B3·B4 통합 | Opus medium: computed style 측정과 수정 | `/design-sync` 프레임별 일치, `npm --prefix app test` | 대기 |
| R1 | B1·B2 review | 보고만 | B1·B2 통합 | Sonnet high: 작은 순수 함수와 controller diff다 | `/code-review` 보고 | 완료: 🔴 0, 🟡 3(B4 지시로 넘김), ⚪ 5(test 보강 2건 반영, 주석 경로는 T9) |
| R2 | B3·B4 review | 보고만 | B3·B4 통합 | B4 diff를 보고 정한다 | `/code-review` 보고 | 대기 |
| — | T7 | 없음(`.scratch/`) | B5 | conductor | `/runtime-test` 보고 | 대기 |
| — | T8 verify, T9 승격 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/BACKLOG.md`, 이 디렉터리 | 전부 | conductor | `verify.mjs` exit 0, T9 문구 검색 | 대기 |

- T0·T1(초안 그리기)은 시작 전에 끝났다. T1의 확정 기록 commit은 conductor가 한다.
- 사이드바 아이콘 CSS는 `styles.css`에 있으므로 B4가 가진다. B3은 클래스 이름을 정해 handoff에 적는다.

## 알려진 test 실패

- `src/main/shell.test.ts` "initializes a folder stored a moment ago, while its first read is still loading"는 시작 commit `85e3665a`에서도 실패한다(B2가 따로 확인). 이 run이 만든 실패가 아니다. 통합 verify 때 다시 본다.
- `doanyRender`, `thumbnails`, `main/conversation/io` 테스트는 전체 실행의 부하에서만 실패하고 따로 돌리면 통과했다(B1·B2).

## 겹침과 순서

- B1 ∥ B2: 파일이 겹치지 않는다.
- B3 ∥ B4: B3은 `ShellSidebar.*`만, B4는 그 밖의 파일만 고친다. 둘 다 B1의 `problemView.ts`를 import만 한다.
- B5는 B3·B4 통합 뒤 단독이다.
