# buzz-conversation — orch

원본: [spec](./spec.md), [design](./design.md), [tasks](./tasks.md). 이 문서는 배치 나누기, 결정, 진행 상태만 적는다.

- 시작 해시: `53221762` (main)
- 통합 브랜치: `feat-buzz-conversation`
- 지휘자: Claude Code (Opus 5.5), 체크아웃 `/Users/sinhyeok/code/doan-design`

## 결정 기록

1. 모델 경계: 이 세션에서 Codex 워커를 써도 된다(사용자, "Codex 워커 사용 가능"). 구현은 Claude가 맡고, Codex는 PoC 한 배치와 독립 리뷰 일부에 쓴다(지휘자 판단 — 메모리의 이전 지휘 방식).
2. P1과 D2는 격리 HOME의 dev 앱에서 Claude Code와 Codex 둘 다 로그인한다(사용자). 로그인 승인은 지휘자가 ego-browser로 직접 한다(사용자). 워커는 로그인 URL이나 창이 뜨면 `ask`로 지휘자에게 알리고 기다린다.
3. tasks.md 체크 표시는 지휘자가 통합할 때 고친다. 워커는 tasks.md를 고치지 않는다. 예외: P1 워커는 P1 절에 관찰 결과를 적는다(지휘자 판단 — 병렬 배치가 같은 파일을 고치지 않게 하려고).
4. GUI probe(P1의 dev 앱, B1의 Home 기준선, D2)는 겹치지 않게 지휘자가 순서를 정한다. 워커는 앱을 띄우기 전에 `ask`로 허락을 받는다(지휘자 판단 — orchestrate §4 GUI probe 조정).
5. B1의 링크 클릭은 주입받은 콜백으로 그린다. preload의 `openLink` 연결은 A1 통합 뒤 B2가 한다(지휘자 판단 — preload는 A1 소유).
6. B2의 대기열 연결(Queue 버튼, 대기 줄, 실패 시 초안 복원)은 A2 통합 뒤에 보내는 후속 작업이다. B2는 나머지를 먼저 끝내고 이 항목을 미룬 항목으로 넘긴다(지휘자 판단 — orchestrate §0.4).
7. Z1·Z2(문서 승격과 디렉터리 삭제)는 지휘자가 한다(orchestrate §5).
8. 안 본 종료 판정의 "마지막 seq"는 `conversation.*` 표시 이벤트(bound·archived·restored)를 뺀 마지막 seq다. archived 대화는 안 본 종료로 세지 않는다. `markSeen`은 전체 마지막 seq로 자르고, crash로 접힌 턴은 그대로 안 본 종료다(지휘자 판단 — A1 질문. spec '안 본 종료'의 취지는 사람이 보지 않은 턴 끝이고, 표시 이벤트는 새 결과가 아니다. Z1에서 ARCHITECTURE에 반영).
9. P1 로그인 계정은 Google `sinhyeok.kang@day1company.co.kr`이다(사용자). Claude Code OAuth 화면의 승인 버튼이 비활성이라 ego-browser 공간 16을 사용자에게 넘겼다. 사용자가 두 공급자 승인을 브라우저에서 직접 했다.
10. 격리 HOME에서는 로그인이 끝나지 않는다(Claude는 Keychain이 없어 `storage_failed`, Codex는 "Sign-in could not be completed"). P1과 D2는 실제 HOME을 쓰고, userData·`DOAN_RUNTIME`·저장소만 임시로 둔다(사용자). P1이 로그인한 임시 userData를 D2까지 남기고, D2가 끝날 때 앱에서 sign out해 임시 프로필의 Keychain 항목을 지운다(지휘자 판단 — 사용자 로그인 승인을 한 번으로 줄이려고). 실제 `~/.claude`·`~/.codex`의 임시 저장소 세션 기록은 경로만 남긴다.
11. Home 이유 줄의 Open은 지금 Home 그대로(`subtle`, 접근 이름 없음) 둔다. 초안 `hero-composer` 타일의 `panel` 변형은 초안 쪽 차이로 보고, D2가 DESIGN.md에 차이로 기록한다(지휘자 판단 — spec 결정 1과 design §0이 Home에서 바뀌는 것을 포커스 보더와 문구로 한정한다).
12. 프로젝트 제거 확인 문구는 "A conversation is still running in <project>." / "A conversation in <project> needs your answer."다. Home 이유 줄은 "Another…" 그대로다(사용자 — RB1 지적. spec 결정 18을 고쳤다).
13. Home 이유 줄의 Open에 접근 이름 "Open the running conversation"을 더한다. 변형은 `subtle` 그대로다(지휘자 판단 — RB1 권고. 겉모습은 바뀌지 않고, docked와 같은 이름이다).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | P1 | `.scratch/`, tasks.md P1 절 | 없음 | Codex Sol medium — 정해진 절차를 따르는 관찰이고 판단이 적다 | 공급자별 관찰을 tasks.md에 기록, 원시 jsonl을 `.scratch/`에 보관 | 통합 `5a145101` |
| A1 | T1, T2, T3, T4, M1, M2, M3, M7, M8 | `app/src/main/**`, `app/src/preload/**` | 없음 | Opus high — 저널 형식·crash 복구·IPC 검증이 틀리면 기록이 깨진다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `verify.mjs` | 리뷰 중 |
| B1 | T5, R1, R3 | `app/src/renderer/**`, `app/package.json`, `app/package-lock.json`, `docs/DESIGN.md` | 없음 | Opus high — Home 회귀 없는 분해와 Markdown 안전 규칙 | 같음 + R1 기준선 probe(`.scratch/`) | 리뷰 중 |
| RA1 | A1 리뷰 | 보고만 | A1 | Codex Astra medium — 다른 계열의 판단 리뷰 | `/code-review` 보고 | 진행 중 |
| RB1 | B1 리뷰 | 보고만 | B1 | Opus high — 포커스·IME·보안 렌더링 판단 | `/code-review` 보고 | 진행 중 |
| A2 | M4, M5, M6 | `app/src/main/**`, `app/src/preload/**` | A1 통합 | Opus high — 승격·복구·대기열의 동시성과 저널 커밋 | A1과 같음 | 대기 |
| B2 | R2, R4 (+ 대기열 연결은 A2 뒤) | `app/src/renderer/**` | A1·B1 통합 | Opus high — 렌더 사이 경쟁(POSTMORTEM 2026-10-25)과 거절 이유 줄 | `npm --prefix app test`, typecheck, `verify.mjs` | 대기 |
| RA2 | A2 리뷰 | 보고만 | A2 | Codex Astra medium — 다른 계열의 동시성 리뷰 | `/code-review` 보고 | 대기 |
| RB2 | B2 리뷰 | 보고만 | B2 | Opus high — 상태 복원과 포커스 규칙 | `/code-review` 보고 | 대기 |
| D | D2 | `.scratch/`, 수정이 필요하면 `app/src/renderer/**`, `docs/DESIGN.md` | 모든 구현 배치 통합 | Opus medium — 정해진 측정 절차, 판단은 design-sync 리뷰가 받친다 | `verify.mjs` 통과 뒤 `/design-sync`(Home 보드)와 `/runtime-test` probe | 대기 |
| Z | Z1, Z2 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/features/buzz-restyle/tasks.md`, 이 디렉터리 | D | 지휘자 | Z1 grep 결과 없음, `verify.mjs` 통과 | 대기 |

이미 끝난 항목: D1(초안, 2026-10-31 사용자 확정).

## 겹침과 순서

- 1차(병렬): P, A1, B1. A1은 main·preload만, B1은 renderer·의존성·DESIGN.md만 고친다. P는 앱 코드를 고치지 않는다.
- 2차: RA1, RB1 → 수정 라운드 → A1, B1, P 통합.
- 3차(병렬): A2(main), B2(renderer). 같은 파일이 없다.
- 4차: RA2, RB2 → 수정 라운드 → 통합 → B2에 대기열 연결 후속 작업 → 다시 리뷰.
- 5차: D → Z → push와 PR.

## 진행 기록
- run `run_0ec367d3dab4`. 1차 워커를 `feat-buzz-conversation`(`23da3c84`)에서 띄웠다. 모두 `launch.effective`가 요청과 같다.
  - A1: dispatch `ctx_dd4acc66b6e0`, worktree `bc-a1`, Claude opus high.
  - B1: dispatch `ctx_1cf7a9338c59`, worktree `bc-b1`, Claude opus high.
  - P: dispatch `ctx_58b62dc8ae61`, worktree `bc-p`, Codex gpt-6.1-sol medium.
- P의 GUI probe 시작을 허락했다. B1 기준선 probe는 P와 겹치는지 보고 정한다.
- B1의 Home 기준선 GUI probe를 허락했다. P의 앱은 로그인 대기로 멈춰 있다.
- P1 관찰 네 경우가 모두 끝났다. Claude는 보존 지시를 읽기 전에 sign out됐다. D2에서 Claude 로그인 승인이 한 번 더 필요하다. Codex는 연결된 채 `/private/tmp/doan-p1-ogyLep/userData`에 남아 있다.
- P 완료(`worker_done` succeeded). `e5cf271b`를 `5a145101`로 cherry-pick했다. 증거와 handoff를 지휘자 `.scratch/buzz-conversation/p1/`로 복사했다. P1 관찰 원문은 tasks.md P1에 있다. 거부된 수정도 edit 활동을 남기므로 파일 변경 교차 확인이 필요하다는 design §2.4 전제가 확인됐다.
- P 워커 release, worktree `bc-p` 제거(Orca 목록에서 사라짐 확인). D2용 임시 userData `/private/tmp/doan-p1-ogyLep/`는 남겨 두었다.
- B1 완료(`worker_done` succeeded): `59ac8833..e570055b` 4커밋, verify 통과, Home 전후 측정 차이 31건이 모두 예상한 차이다. B1은 기준선 재시도로 허락 없이 앱을 한 번 띄웠다(실제 상태 변화 없음). 수정 라운드에 쓰려고 B1 터미널을 retain했다.
- RB1 리뷰 시작: dispatch `ctx_b3c4893f7024`, worktree `bc-b1`, Claude opus high.
- RB1 완료: 🔴1(crash로 접힌 마지막 턴이 스레드에서 실행 중으로 남음), 🟡4, ⚪7. 🟡4(로컬 요약·이벤트 타입이 A1과 다름)는 B2가 main 타입으로 바꾼다.
- B1 수정 라운드 1을 같은 터미널로 보냈다: dispatch `ctx_7f9d0865b213`. RB1 워커는 release했다.
- A1 완료(`worker_done` succeeded): `d2f02dca..ace812af` 8커밋, 테스트 5167개·typecheck·verify 통과, 자체 리뷰 🟡3·⚪1 반영. 계획과 다른 점 10개는 handoff에 있다(`.scratch/buzz-conversation/handoff-A1.md`). 열린 항목: Codex에서 effort 없이 모델만 보낼 때 이전 effort가 이어지는지, `listChanged` 빈도에 따른 R4 throttle. A1 터미널은 수정 라운드용으로 retain했다.
- RA1 리뷰 시작: dispatch `ctx_f75b434dfbf1`, worktree `bc-a1`, Codex gpt-6-astra medium.
