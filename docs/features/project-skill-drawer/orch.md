# project-skill-drawer — orch

원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261106](../chain-261106/chain.md) 링크 2.

- 시작 hash: `3b89d013`(origin/main, 링크 1 병합 `0825d9eb` 뒤 줄 번호 인용 수정)
- 통합 브랜치: `feat/project-skill-drawer`
- 지휘자: Claude Code(Opus). Codex 작업자 허용(체인 '상시 권한'). 시작 때 Orca Codex 계정 rollout의 10080분 창 33% 사용.

## 결정 기록

- 사람이 정할 점은 남지 않았다(design '결정할 점' 없음, 체인 '시작 점검 승인'). 아래는 지휘자 판단이다.
- 지휘자 판단 — 고정 줄 형식과 떼기 함수(결정 18)는 renderer와 main이 함께 쓰는 순수 모듈 `app/src/main/conversation/requestLines.ts`에 둔다. 근거: renderer가 값으로 import하는 main 순수 모듈(`permissionMode.ts`, `steerSupport.ts`, `question.ts`)과 같은 자리이고, `rendererImports.test.ts`의 `EXTRA_ROOTS`에 더해 지킨다. 이 모듈은 batch B가 만든다. batch A의 대화 제목(C1 마지막 항목)은 B가 통합된 뒤 후속 Task로 보낸다.
- 지휘자 판단 — small-ui-tweaks는 이미 main에 있다(`Home.test.tsx`의 `.anchor-chip`·`.suggestion-value` CSS 테스트, `ds/checks.test.ts`의 `.suggestion-value`). D1은 그 테스트에 `.skill-word`를 더한다.
- 지휘자 판단 — F1의 실제 Antigravity 턴과 R1의 실제 Claude Code·Codex 턴, 한글 IME 녹화는 batch R이 공용 프로필로 한 번에 돈다(체인 '시작 점검 승인': 묻지 않고 돌림, 사람 확인 대신 녹화·스크린샷). F1 코드는 batch A가 한다.
- 지휘자 판단 — R2 `/design-sync`는 UI를 만든 batch D 작업자가 한다(측정 뒤 고치는 코드가 D의 코드). R1 `/runtime-test`는 D 통합 뒤 따로 batch R로 돈다. GUI probe가 겹치지 않게 R2 → R1 순서다.
- 사람(2026-11-07, RB 리뷰): queue에서 합친 메시지의 고정 줄은 표시에서 문단마다 뗀다(design 결정 27). 고정 줄을 떼고 남는 글이 없으면 대화 제목은 preset title이다(결정 28).
- 지휘자 판단 — anchor chip 바로 앞에서 skill 단어가 끝난다(`/deploy<chip>`은 하이라이트). 근거: design §4.1의 단어는 "`/` 뒤로 다음 공백이나 글 끝까지의 글자"이고 chip은 글자가 아니다. 그래서 보낼 skill과 하이라이트는 글(`{{n}}` 자리표시)이 아니라 segment(`fieldSkillRuns`)로 정한다. Z1에서 승격한다.
- 지휘자 판단(RA 리뷰) — skill 캐시는 `ModelCatalog`처럼 요청마다 prepare를 돌리고 root × provider × 연결 id × 설치 버전으로 묶는다. 30초 상한과 진행 중 promise 공유는 그대로다. 근거: POSTMORTEM 2026-11-06(계정에 묶인 값은 연결 세대로 나눈다)과 tasks C1의 "로그인되지 않았거나 연결이 없으면 `{error}`"를 30초 안에도 지킨다. 같은 연결에서 제품 동작(결정 6)은 바뀌지 않는다.
- 지휘자 판단 — F1은 버그 수정이므로 지휘자가 통합 때 `/postmortem`을 돌린다(작업자는 docs를 고치지 않는다).
- 지휘자 판단(RD 리뷰 🟡2) — chip field는 조합이 끝난 뒤 지연 repair 전에 다시 그리지 않고, 같은 이름 집합과 같은 값의 host 렌더는 다시 그리지 않는다. 근거: design §4.2와 결정 20을 그대로 지킨다. 조합 사이에 DOM을 바꾸면 다음 음절이 깨질 수 있어, 결정 20의 모양을 바꾸는 쪽(사람이 정할 점)으로 가지 않는다.
- 지휘자 판단 — Z1 문서 승격과 R3 `/verify`는 지휘자가 통합 gate에서 한다.

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | F1, A1, C1(대화 제목 제외) | `app/src/main/agentAuth/providers.ts`·테스트, `app/src/main/conversation/`의 새 skill parser 모듈·fixture·`ipc.ts`·`service.ts`·`runners.ts`·`models.ts`(lease를 넓힐 때만)·그 테스트, `app/src/preload/` | 없음 | Claude Opus high — lease·동시성(POSTMORTEM 2026-10-28·10-30)과 캐시 promise 공유가 틀리면 send·sign-out이 막힌다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 완료 `a293e4da`·`d59d745b`·`8732e368`(전체 테스트 8,906개·typecheck 통과). RA: 🔴0 🟡2 → 수정 round 1 `53432476`(전체 테스트 8,917개 통과). 통합 `13294605`·`00575844`·`7b8c2d35`·`12df3451` |
| A2 | C1의 대화 제목(결정 18·28, `service.ts` `messageLine`) | `service.ts`의 제목 줄과 그 테스트 | A, B 통합 | A 작업자 후속(같은 모델) — 한 줄 변경 | 같음 | 완료 `b319574e`(전체 테스트 9,028개 통과), 통합 `ad5b63aa`. 작업자 해제, worktree `psd-batch-a` 지움(브랜치 `SinhyeokKang/psd-batch-a` `b319574e` 남김) |
| B | B1, B2, B3 | `app/src/renderer/homeComposer.ts`·테스트, 새 renderer 순수 모듈(`skillWords` 등)·테스트, 새 `app/src/main/conversation/requestLines.ts`·테스트, `rendererImports.test.ts`의 `EXTRA_ROOTS` | 없음 | Codex gpt-6-astra medium — 경계 규칙·검색 순서가 많지만 design §4.1·tasks B에 예가 다 있다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 완료 `3e6e63f1`(전체 테스트 8,974개·typecheck 통과). RB: 🔴0 🟡4, 사람 결정 2 → 수정 round 1 `369b5961`(전체 테스트 8,986개 통과). 통합 `45b57070`·`0c056d4e`. 작업자 해제, worktree `psd-batch-b` 지움(브랜치 `SinhyeokKang/psd-batch-b` `369b5961` 남김) |
| D | D1, D2, R2 | `chipField.ts`, `styles.css`, `ds/checks.test.ts`, `Home.test.tsx`, `ComposerParts.tsx`, `HomeComposerView.tsx`, `DockedComposer.tsx`, `ConversationThread.tsx`, `Home.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx` 등 host, 그 테스트, `docs/DESIGN.md`(R2 측정값) | A, B 통합 | Codex gpt-6-astra medium(계획은 Claude Opus high) — chip field 그리기·IME·root 경쟁과 design-sync 판단이 필요하다. Claude 주간 사용 81%, Codex 35%라 Codex로 옮겼다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, `/design-sync` 보고 | 완료 `65560c30`·`279341f3`·`7c4a9244`·`a3cf425a`(전체 테스트 9,030개·typecheck·build 통과, design-sync 2,619개 중 문서화한 차이 7개), RD: 🔴0 🟡2 → 수정 round 1 `4c01dcef`·`9d744c63`(테스트 9,045개 통과, design-sync 다시 통과). 지휘자 확인에서 조합 직후 host 값이 버려지는 회귀를 찾아 수정 round 2 `94e9c3b0`(테스트 9,047개 통과). 통합 `93cca2db`…`386d2835` |
| R | R1, F1 실제 턴 | 코드 없음(문제는 D·A 소유 작업자에게 돌려보냄), `.scratch/` 기록 | D 통합 | Codex gpt-6-astra medium(계획은 Claude Sonnet high) — native IME를 실제 키 입력으로 돌리는 판단이 필요하고 Claude 주간 한도를 아낀다 | `/runtime-test` 기록, 녹화·스크린샷 위치 | 진행(worktree `psd-batch-r`, dispatch `ctx_267f407e66ee`, base `386d2835`) |
| 리뷰 RA | A의 diff `/code-review` | 보고만 | A 완료 | Codex gpt-6-astra medium — 다른 계열의 독립 판단 | 보고 | 완료(🔴0 🟡2) |
| 리뷰 RB | B의 diff `/code-review` | 보고만 | B 완료 | Claude Opus high — 다른 계열의 독립 판단 | 보고 | 완료(🔴0 🟡4) |
| 리뷰 RD | D의 diff `/code-review` | 보고만 | D 완료 | Claude Opus high — D가 Codex로 바뀌어 다른 계열인 Claude가 본다 | 보고 | 완료(🔴0 🟡2) |
| 지휘자 | R3, Z1 | `docs/` 승격, feature·chain 디렉터리 삭제 | 전부 | — | `/verify`, `/agent-eval` | 대기 |

## 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다. B가 만드는 `requestLines.ts`를 A는 쓰지 않는다(대화 제목은 A2로 미룸).
- D는 A의 preload `skills` method와 B의 순수 함수를 쓰므로 둘의 통합 뒤에 돈다.
- R은 D 통합 뒤. R2(D 작업자)와 R1(R 작업자)의 GUI probe는 겹치지 않게 차례로 돈다.
- tasks의 P1–P3·P5와 D0는 이미 끝났다. 남은 항목 F1, A1, B1–B3, C1, D1, D2, R1–R3, Z1이 모두 위 표의 한 행에 있다.

## 진행

- Orca run `run_6ab071426733`. A·B를 `0481bd0a`에서 병렬로 시작했다(2026-11-06).
- A+B 통합 HEAD `12df3451`에서 `/verify` PASS(verify-tests, runtime-support, go-test, go-vet, typecheck, app-test, build).
- A+B+D 통합 HEAD `386d2835`(그 뒤 문서 커밋만)에서 `/verify` PASS. 그 시점 `origin/main`에 새 커밋이 없어 rebase할 것이 없었다.
- Codex 사용 범위: batch B, 리뷰 RA, batch D, batch R.
