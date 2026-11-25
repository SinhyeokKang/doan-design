# 주석 정리 — orch

원본: [spec.md](spec.md) · [design.md](design.md) · [tasks.md](tasks.md)

- 시작 해시(기준 ref): `e6b7457b3` (origin/develop, #395 머지)
- 통합 브랜치: `feat/comment-trim` (lead가 만들었다. conductor는 브랜치를 만들거나 바꾸지 않는다)
- 런타임: conductor와 워커 모두 Claude. 모델 계열을 넘지 않는다.

## T0 (lead가 마쳤다)

- chain-261125-1이 끝났다: thread-motion 머지 `a1095a45c`, chain 디렉터리를 지웠다.
- #394(card meta one line), #395(forced-colours edges)가 develop에 머지되었다.
- 사용자가 시작을 승인했고, comment-trim이 도는 동안 코드를 바꾸는 다른 conductor를 띄우지 않는 데 동의했다.

## T1 동등성 검사 도구와 기준 측정

도구는 이 worktree의 `.scratch/comment-trim/`에 있다(커밋하지 않는다). AGENTS.md 'Commands'에 없는 이 feature 전용 일회성 도구다.

- 실행: `node /Users/sinhyeok/orca/workspaces/doan-design/comment-trim-orch/.scratch/comment-trim/check.mjs --root <검사할 worktree> --base e6b7457b3 --batch <B1..B9|all> --strict`
  - Go는 같은 디렉터리의 `gotok-bin`(`gotok/main.go`를 `go build`한 것)으로 토큰 열을 뽑는다.
  - 문서가 가리키는 주석은 `exempt.json`에 적었다. 덩어리 세기에서 빠지고 보고서에 따로 나온다.
  - `--strict`가 없으면 경로 가드·동등성·지시 주석만 실패 조건이다. 있으면 3줄 이상 덩어리와 0이어야 하는 grep도 실패 조건이다.
- 자기 검사: `node .../check.mjs --self-test` → 34건 모두 기대대로 통과·실패(`SELF-TEST PASS`).
  - TS: 주석만 지운 사본 통과. 식·문자열·template 안 `/* */` 변경, 지시 주석 삭제·이동·대상 간격 변경·규칙 변경, `@ts-expect-error`·`@vitest-environment` 삭제는 실패.
  - JSX: 주석 식 컨테이너만 지운 사본 통과. `foo{/* c */}\n  bar`, `foo\n{/* c */}\nbar`는 실패.
  - Go: 주석만 지운 사본 통과. 식·문자열 변경, `//go:embed` 삭제·이동, `//go:build` 삭제는 실패.
  - CSS: 주석만 지운 사본 통과. 값·문자열 변경, 주석 삭제로 토큰이 붙는 경우, SPDX 삭제·이동은 실패.
  - 덩어리 세기 7건(JSDoc 구분자 줄 제외, 빈 줄로 나뉨, 줄 끝 주석은 따로, 지시 주석 제외, Go, CSS).
- 기준 ref에서 작업 트리를 바꾸지 않고 `--batch all`로 돌리면 바뀐 파일 0개로 통과한다.

### 기준 측정 (`e6b7457b3`)

주석 줄은 주석 내용이 있는 줄 수다(`/**`, `*/`만 있는 줄 제외, 지시 주석 포함).

| 배치 | 파일 | 주석 줄(소스) | 주석 줄(테스트) | 3줄 이상 덩어리 |
|---|---|---|---|---|
| B1 | 115 | 1,855 | 1,063 | 246 |
| B2 | 159 | 2,133 | 1,346 | 254 |
| B3 | 158 | 1,802 | 628 | 185 |
| B4 | 142 | 3,557 | 0 | 349 |
| B5 | 160 | 0 | 1,906 | 50 |
| B6 | 188 | 2,608 | 2,395 | 329 |
| B7 | 7 | 970 | 0 | 116 |
| B8 | 160 | 918 | 820 | 137 |
| B9 | 193 | 1,287 | 460 | 127 |
| 합계 | 1,282 | 15,130 | 8,618 | 1,793 |

- 0이어야 하는 grep 결과: 5줄(`installCommand.test.ts`, `App.tsx`, `CanvasController.test.ts`, `ConversationDeleteDialog.test.tsx`, `conversationDeleteMenus.test.tsx`). 줄마다 판정할 후보: 381줄.
- lint 경고 기준값: `npm --prefix app run lint`의 app 경고 76개(`grep -c ": warning "`, 상한은 `--max-warnings 77`). eval lint는 경고 0.
- 문서가 가리키는 주석(`docs/` grep으로 다시 만든 목록, `exempt.json`):
  - `app/src/main/agentAuth/providers.ts` 전체(ARCHITECTURE: "its comments give each switch's reason")
  - `app/src/main/conversation/usageLimit.ts` 전체(ARCHITECTURE: "each with its reason in a comment")
  - `app/src/main/conversation/models.ts`의 `olderIds` 위 주석(ARCHITECTURE: "its comment holds the naming rule")
  - `app/src/main/conversation/ipc.ts`의 `validateSendExtras` 위 주석(ARCHITECTURE: "rules in its comment")
  - `app/src/renderer/tokens.css` 전체(DESIGN.md가 램프 방법과 사이드바 violet 주석을 가리킨다)

### `/tdd` 건너뛰기 예외

이 feature는 동작을 바꾸지 않는다. 워커는 `/deliver bypass`에서 `/tdd`와 커밋 #0을 건너뛰고, 동등성 검사로 대신한다.

## 결정 로그

- conductor 판단 — 워커는 `/deliver`의 자체 `/code-review`·`/refactor`(5–7단계)를 돌리지 않는다. 근거: `/orchestrate` §3이 배치마다 독립 리뷰 워커를 두고, 수정은 그 리뷰를 받아 같은 워커에게 보낸다. 같은 리뷰를 두 번 돌리지 않는다.
- conductor 판단 — 배치 커밋은 `chore: trim comments in <path>` 하나다(tasks.md T2).
- conductor 판단 — 동시 워커는 4개까지. 근거: 워커마다 전체 app 테스트를 돌린다(Orca 가이드: 한 번에 약 4개).
- conductor 판단 — 문서가 가리키는 주석 목록은 위 다섯 곳이다. 테스트가 읽어서 되돌린 주석은 워커 보고를 확인한 뒤 `exempt.json`에 더한다.

## 배치

| 배치 | 경로 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|
| B1 | `app/src/main/conversation/` | T1 | Opus medium — provider·세션 제약 주석이 많아 남길 것을 가려야 한다 | T2 공통 + 도구 B1 | 대기 |
| B2 | `app/src/main/*` 바로 아래 | T1 | Opus medium — 소켓·IPC·설치 제약 주석, `exportViewer.test.ts`가 다른 배치 소스를 읽는다 | T2 공통 + 도구 B2 + viewerInspect `--check` | 대기 |
| B3 | `app/src/main/` conversation 밖 하위 디렉터리 | T1 | Opus medium — 인증·agent setup 보안 제약, 문서가 가리키는 `providers.ts` | T2 공통 + 도구 B3 + viewerInspect `--check` | 대기 |
| B4 | `app/src/renderer/**` `.ts` 소스 | T1 | Opus medium — 소스 주석이 가장 많고 viewerInspect 입력이 있다 | T2 공통 + 도구 B4 + viewerInspect `--check` | 대기 |
| B5 | `app/src/renderer/**` `.ts` 테스트 | T1 | Sonnet medium — 테스트 주석이라 남길 판단이 비교적 단순하다 | T2 공통 + 도구 B5 | 대기 |
| B6 | `app/src/renderer/**` `.tsx` | T1 | Opus medium — JSX 주석 컨테이너와 화면 묘사가 섞여 판단이 많다 | T2 공통 + 도구 B6 | 대기 |
| B7 | `app/src/renderer/**` `.css` | T1 | Sonnet medium — 파일 7개, `tokens.css`는 예외, CSS 검사는 주석을 지우고 읽는다 | T2 공통 + 도구 B7 | 대기 |
| B8 | `cli/**/*.go`, `schema/embed.go` | T1 | Opus medium — Go doc comment 판단, gofmt 조건 | T2 공통 + 도구 B8 + go vet/test + gofmt | 대기 |
| B9 | preload·restore·formats·brand·runtime·scripts·설정·eval·스킬 스크립트 | T1 | Sonnet medium — 소규모 파일이 흩어져 있고 제약이 국소적이다 | T2 공통 + 도구 B9 + B9 테스트 묶음 | 대기 |
| 리뷰 | 배치마다 독립 리뷰 워커 | 해당 배치 | Sonnet medium — 동등성은 도구가 증명하므로 지운 주석의 제약 여부만 본다 | `/code-review` 보고 | 대기 |
| T3 | ARCHITECTURE 옮기기 | 배치 보고 | conductor(ARCHITECTURE), 절 참조는 해당 배치 워커 | tasks.md T3 | 대기 |
| T4 | 통합 검증 | 전 배치 | conductor | 도구 `all` + `verify.mjs --eval` | 대기 |
| T5 | BACKLOG, 문서 삭제, PR | T4 | conductor | tasks.md T5 | 대기 |

- T2 공통: `npm --prefix app test`, `npm --prefix app run lint`(경고 76), `npm --prefix app run typecheck`, 도구 `--strict` 통과, 후보 줄 판정, 주석 줄 수 전과 후.
- 파일 겹침: 없다. 배치 경로 규칙이 서로 겹치지 않는다(도구의 `batchOf`가 한 파일을 한 배치에만 넣는다).
- 실행 순서: B1·B2·B4·B6를 먼저 띄우고, 하나가 끝날 때마다 B3·B8·B5·B9·B7 순서로 띄운다.
- tasks.md 항목 대응: T0(lead), T1(conductor), T2(B1–B9), T3(conductor + 해당 워커), T4·T5(conductor). 주인 없는 항목은 없다.
