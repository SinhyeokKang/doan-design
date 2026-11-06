# turn-activity — orch

출처: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md). 이 파일은 실행 기록만 둔다.

- 시작 hash: `d324b642`(main, fast-mode·tester-notarization·picker-default-labels 병합 뒤)
- 통합 branch: `feat/turn-activity`(이 worktree, 사람이 미리 만들었다)
- P1–P4, D1은 이 run 전에 끝났다(tasks.md 'P 결과', 결정 1·10).

## 결정 기록

- 모델 교차: 이 run에서 사람이 허락했다. 구현은 Claude, 독립 리뷰는 Codex Astra medium을 섞는다(conductor's call — 사람의 기존 지시 'Claude 주 업무, Codex 리뷰 위주').
- project-skill-drawer와의 순서: 그 feature가 돌고 있지 않아 정할 것이 없다(사람).
- main의 문서 커밋: `/verify` 전마다, 그리고 마지막 push·PR 전에 `origin/main`으로 rebase하고 그 뒤에 `/verify`를 돌린다(사람).
- 실제 앱 probe(U2, R1) 전에 다른 Doan 앱이 떠 있는지 보고, 떠 있으면 기다리거나 사람에게 묻는다(사람). 공용 로그인 프로필(main checkout `.scratch/provider-profile/userData`)은 로그아웃하지도 지우지도 않는다(사람).
- R1은 공용 로그인 프로필을 쓰므로 실행 직전에 사람의 승인을 받는다(tasks.md P).
- A1을 B1·B2와 한 batch로 묶는다(conductor's call — B1의 "events는 그대로" 기준이 A1 fixture이고 같은 normalizer 파일을 읽는다).
- B3는 U1과 한 batch로 묶는다(conductor's call — 둘 다 renderer이고 U1이 B3 함수를 바로 쓴다). 단계 type(`types.ts`)은 MA가 만들므로 RU는 MA 통합 뒤에 시작한다.
- RU의 `App.tsx` 단계 구독과 `conversation:read` 답의 단계 읽기는 C1의 preload API(`onConversationStage`)가 필요하다. RU는 그것을 deferred item으로 남기고, MC 통합 뒤 새 Task로 보낸다.
- MA 해석 1–4(handoff-MA)는 받아들인다(conductor's call — design §2 표의 Codex 일반은 '같은 item'의 완료이고, Claude 도구 block의 stop에 일반을 내면 도구(event) 상태를 가린다). MA-rev 🟡(Claude 도구 block stop): 해석 2를 유지하고 design §2 표와 tasks P1 Task 관찰을 그에 맞춘다. subagent가 도는 동안 턴 표시는 Task activity다(conductor's call — 결정 2가 Claude 도구 상태를 activity event로 정했다). ACP thought chunk 중복 제거는 단계와 seq를 함께 비교한다(MA가 MC에 넘김).
- Z1–Z3(문서 승격)은 지휘자가 통합 뒤 문서별 커밋으로 쓴다(orchestrate §4·§5). DESIGN.md는 U2가 쓴다.

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| MA | A1, B1, B2 | `app/src/main/conversation/fixtures/`의 새 fixture와 `README.md`, `types.ts`, `transport.ts`, `acp.ts`, 그 테스트(`transport.test.ts`, `acp.test.ts`, 새 fixture 테스트) | 없음 | Claude Opus high — 세 provider normalizer의 경계 조건이 많고, fixture의 개인 정보 제거와 "events는 그대로"가 틀리면 기록 형식이 깨진다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `ed04b3ee`·`18dece0f`·`2d5eb9eb`(worker `6d3918a3`·`88b254e2`·`56997f01`), test 312 files/8773 pass |
| MA-rev | MA 리뷰 | 없음(보고만) | MA | Codex Astra medium — 다른 계열의 독립 판단 | `/code-review` 보고 | 완료, 🔴 0 · 🟡 1 · 🟢 1(`.scratch/review-MA.md`). fix 1(테스트만) 통합, 8776 pass. `ta-ma` worktree 지움, branch 남김 |
| MC | C1 | `runners.ts`, `acpRunner.ts`, `dispatcher.ts`, `service.ts`, `ipc.ts`, `app/src/main/index.ts`, `app/src/preload/index.ts`, 그 테스트 | MA 통합 | Claude Opus high — live entry 수명, Stop·archive·종료 경계, 순서 보장이 걸린 동시성 작업 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `0cd02bfc`(worker `e4c4f4d3`), 314 files/8790 pass. fix 1(테스트 보강) 진행 중 |
| MC-rev | MC 리뷰 | 없음 | MC | Codex Astra medium | `/code-review` 보고 | 완료, 🔴 0 · 🟡 0 · 🟢 2(`.scratch/review-MC.md`). 🟢 둘 다 테스트로 보강(conductor's call — 검증을 더 확실히) |
| RU | B3, U1 | renderer의 새 순수 함수 파일과 테스트, `conversationStore.ts`, `ConversationThread.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `styles.css`, `App.tsx`(deferred) | MA 통합(`App.tsx` 구독은 MC 통합) | Claude Opus high — settle·rev·timer·접근성 규칙이 서로 얽힌다 | `npm --prefix app test`, typecheck, `npm --prefix app run build`, `rendererImports.test.ts` | 진행 중(`ta-ru`) |
| RU-rev | RU 리뷰 | 없음 | RU | Codex Astra medium | `/code-review` 보고 | 대기 |
| SY | U2 | 턴 표시 style 수정, `docs/DESIGN.md` | MC·RU 통합 | Claude Opus high — 실제 앱 computed style 비교와 판단 | `/design-sync` 보고 | 대기 |
| RT | R1 | `.scratch/runtime-test/turn-activity/` | SY 통합, 사람 승인 | Claude Opus medium — 실제 provider 턴을 몰고 관찰만 한다 | `/runtime-test` 스크린샷·로그 | 대기 |
| — | R2 | 없음 | 모두 통합, rebase | 지휘자 | `node .agents/skills/verify/scripts/verify.mjs` | 대기 |
| — | Z1–Z3 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/turn-activity/` 삭제 | R1·R2 | 지휘자 | tasks.md Z의 grep | 대기 |

## 겹침과 순서

- MA → (MC ∥ RU) → SY → RT → R2 → Z.
- MC와 RU는 파일이 겹치지 않는다. 둘이 함께 쓰는 계약은 MA가 `types.ts`에 둔 단계 type과, MC가 정하는 preload API 이름 `onConversationStage`·`conversation:read` 답 필드다. 그 이름은 design §2를 따른다.
- 리뷰 worker는 그 batch 통합 전에 돌고, 🔴가 0이 될 때까지 소유 worker가 고친다.
