# app-update — orch

> 원천: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md) · 부모 [release-0-1-0](../release-0-1-0/design.md) D9–D12, D23, D24

- 시작 hash: `e1719794` (origin/develop)
- 통합 브랜치: `feat/app-update` (develop에서 분기, PR은 develop으로, 병합은 부모 세션이 한다)
- worker: Claude만(이 feature는 Codex를 쓰지 않는다). 시작은 `--worktree new-child --base-branch feat/app-update`.
- 실제 업데이트 PoC(설치한 rc.1 → rc.2)는 부모 R1이다. 이 실행의 runtime 확인은 격리된 앱과 fake로 한다.

## 결정 기록

| # | 질문 | 답 | 근거 |
|---|---|---|---|
| 1 | T0 확인 | 통과: D 결론 30개, `git ls-tree origin/develop docs/features/release-ci` 결과 없음(PR #126 병합) | conductor 확인 |
| 2 | T1 초안 | 다시 그리지 않는다. `.doan/canvases/app-update.html` 15 프레임(`doan ls`로 확인), 사용자 확정(2026-11-08), 표시는 (a) 헤더 버튼 | 부모 세션 인계, design.md 'UI (D24)' |
| 3 | `electron-updater` 버전 | `6.8.11`(npm `latest`) | conductor 판단 — 설치된 electron-builder 26.18.0의 `app-builder-lib`가 `builder-util-runtime` 9.7.0을 쓰고 6.8.11도 9.7.0이다. `v26` 태그 6.8.12는 9.7.1이라 런타임 사본이 둘이 된다 |
| 4 | Copy details 줄의 소유 | B2(main `about.ts`) | conductor 판단 — 복사 문구는 main의 `about:copy`가 만들고 업데이트 서비스 snapshot도 main에 있다 |
| 5 | 에이전트 설정 notice 제목 변경(`agentSetup/notice.ts`) | B3 | conductor 판단 — About 화면 문구라 design-sync 대상과 함께 본다 |
| 6 | batch 순서 | B1 → B2 → B3 → B4 직렬 | conductor 판단 — B2는 B1의 타입·상태 기계를, B3는 B2의 preload API를 쓴다 |

## Batch

| batch | 항목 | 파일 소유 | 선행 | model·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | T2, T3 | 새 `app/src/main/update/`(eligibility, schedule, state, errorCode, gate, view, 타입 파일과 테스트), `app/src/main/preferences.ts`·`preferences.test.ts` | — | Opus high — 상태 기계의 겹침(수동·자동, 받는 중 재확인, 취소)과 view 매핑이 틀리면 UI 전체가 틀린다 | `npm --prefix app test`, `typecheck`, `rendererImports.test.ts` | 통합 `88304821` |
| B2 | T4, Copy details 줄 | `app/package.json`·`package-lock.json`, `app/src/main/update/service.ts`(+테스트), `app/src/main/index.ts`·`index.test.ts`, `menuState.ts`(+테스트), `senderAllowed.ts`(+테스트), `app/src/preload/index.ts`(+테스트), `app/src/main/about.ts`(+테스트) | B1 통합 | Opus high — 종료 순서·flush·설치 시점은 상태를 잃을 수 있는 동시성 경로다 | `npm --prefix app test`, `npm --prefix app run build`, `verify.mjs` | 통합 `b88ca29f` |
| B3 | T5 | `app/src/renderer/SettingsAbout.tsx`(+테스트), `App.tsx`·헤더 버튼과 popover, `AgentUsageButton.tsx`(+테스트), `app/src/main/aboutView.ts`, `app/src/main/agentSetup/notice.ts`, `styles.css`, `docs/DESIGN.md` | B2 통합 | Opus medium — 초안이 정해져 있어 판단보다 측정이 많지만 popover·focus·폭 계산이 섞인다 | `test`, `typecheck`, `lint`, `/design-sync` 차이 0 | 진행 |
| B4 | T6 | 코드 수정 없음(보고만), `.scratch/` | B3 통합 | Sonnet medium — 정해진 probe를 격리된 앱에서 돌리고 기록한다 | `/runtime-test` 보고서 각 항목 | 대기 |
| conductor | T0, T7, 통합 `/verify` | `orch.md`, PRODUCT·ARCHITECTURE·BACKLOG·DIRECTORY 승격, 이 디렉터리 삭제 | B4 | — | tasks.md T7의 grep | T0 완료 |

- 리뷰: 각 구현 batch 뒤 독립 리뷰 worker가 `/code-review`(B1·B2 Opus high, B3 Opus medium, 보고만).
- T1은 완료(결정 2). tasks.md의 모든 체크 항목이 위 행 하나에 대응한다: T0·T7 conductor, T1 완료, T2·T3 B1, T4 B2, T5 B3, T6 B4.

## 파일 겹침과 순서

- B1과 B2는 `app/src/main/update/`를 함께 쓰지만 파일이 다르다(B2는 `service.ts`만 더한다). 직렬이라 B2가 B1 파일을 고쳐야 하면 고치고 handoff의 '계획과 다른 점'에 적는다.
- B3의 `aboutView.ts`·`notice.ts`는 main 디렉터리지만 B2가 건드리지 않는다.
- 모두 직렬이라 병렬 겹침은 없다.

## 진행 기록

- Run `run_5130ff98f541`. B1 시작: dispatch `ctx_325b01f3ccb4`, worktree `app-update-b1`(base `a0266c25`), Opus high.
- B1 질문: `Preferences.updates` 필수 키 때문에 renderer 테스트 픽스처 16개가 typecheck에 실패한다 → 테스트 픽스처만 고치도록 답했다(conductor 판단 — 타입을 optional로 약하게 하지 않는다).
- B1 완료(worker_done): `a98fa11c` test, `ce3796c1` feat, `1e530a92` refactor. worker 보고는 `verify.mjs` PASS(앱 테스트 9577개). 계획과 다른 점은 handoff에 있다(`updateView(snapshot, now)`, `lastAttemptAt`, 꺼진 사본 문구는 초안을 따름, 설치 실패 때 헤더 숨김).
- R1(B1 리뷰) 시작: dispatch `ctx_d956d3429cae`, B1 worktree에서 보고만, Opus high.
- R1 결과: 🔴 0, 🟡 4, ⚪ 3(`.scratch/review-B1.md`, conductor checkout에 사본을 남긴다). conductor 판단:
  - 🟡1 GitHub 공급자가 다시 감싼 오류(최신 릴리스 404, 릴리스 없음)는 `feedMissing`이 아니라 `other`로 둔다. feedMissing 문구는 "릴리스에 업데이트 정보가 없다"라서 릴리스가 없을 때는 사실이 아니고, design은 실패 문구가 원인을 단정하지 않게 한다.
  - 🟡2 `update-downloaded` 뒤 native(Squirrel) 오류는 코드와 상관없이 받기 실패(Retry)로 보낸다. 오류에 출처(`native`/`js`)를 싣고 B2 서비스가 채운다.
  - 🟡3 `view.ts`를 지금 `rendererImports.test.ts` EXTRA_ROOTS에 넣는다.
  - 🟡4 ready 행의 announcement는 게이트와 상관없이 같다. 막힘 이유는 Restart 누름이 `blocked`로 답할 때만 읽는다(초안 "a press reads the reason again").
  - 설치 실패 때 헤더 숨김·메뉴 "Check for Updates…"는 유지한다. 쓸 수 없는 `/Applications` 사본 같은 설치 실패는 헤더에서 다시 눌러도 낫지 않는다.
- B1 수정 1회차 보냄: dispatch `ctx_757dcb464f16`.
- B1 질문(수정 1회차): native `installFailed`는 설치 단계 실패(About에 Restart to Update)로, 나머지 native 오류는 받기 실패(Retry)로 둔다고 답했다(초안 row-failed 프레임과 같다). staging 중 설치 실패 뒤 Restart가 `quitAndInstall`에서 영원히 기다리지 않게 하는 처리는 B2 brief에 넣는다.
- B1 수정 1회차 완료: `f623af6a`, `120f556f`, `3702db7c`. worker 보고 `verify.mjs` PASS(9583). 🔴은 처음부터 0이라 재리뷰 없이 통합한다. 상태 기계와 서비스의 맞물림은 B2 리뷰가 본다.
- B1 통합: `b17f7a7a`..`88304821`(커밋 6개 cherry-pick). 통합 HEAD `88304821`에서 `verify.mjs` PASS(앱 테스트 9583개, 로그 `.scratch/orch/verify-B1.log`). B1 worker를 release하고 worktree `app-update-b1`을 Orca로 지웠다. 브랜치 `SinhyeokKang/app-update-b1`(`3702db7c`)은 남아 있다. handoff와 리뷰 사본은 `.scratch/orch/`에 있다.
- B2 시작: dispatch `ctx_6d3858b9458d`, worktree `app-update-b2`(base `88304821`), Opus high.
- B2 완료(worker_done): `bb39c6c3` test, `8f59d854` feat, `17f40dd9` refactor. worker 보고 `verify.mjs` PASS(앱 테스트 9666개), main 번들에 electron-updater가 들어간 것을 grep으로 확인했다고 한다. 계획 밖 파일 두 개(`agentSetup/runner.ts` `setupEligibility`, `ConversationService.restartHolds()`)를 더했다. staging을 60초 기다리고, `quitAndInstall` 뒤 10초가 지나면 그냥 종료한다.
- R2(B2 리뷰) 시작: dispatch `ctx_314b47c106e1`, Opus high, 보고만.
- R2 결과: 🔴 0, 🟡 4, ⚪ 5(`.scratch/orch/review-B2.md`). conductor 판단:
  - 🟡1 snapshot 게이트를 대화 서비스가 상태를 바꾼 뒤에 읽게 한다(지금은 한 이벤트씩 늦어 turn이 끝난 뒤에도 막힘 notice가 남는다).
  - 🟡2 staging 대기 뒤 종료 직전에 게이트를 다시 묻는다. 막히면 종료하지 않고 `ready`로 돌린다. 실패가 아니라 대화 때문에 막힌 것이라 "Couldn’t restart" 대신 막힘 이유를 보인다.
  - 🟡3 주석의 D23·D12 인용을 이유 문장으로 바꾼다. 🟡4 자동 받기의 `downloadPromise` rejection을 처리한다.
  - `quitAndInstall` 뒤 10초 fallback은 `app.relaunch()`를 부른 뒤 종료한다. 사용자가 Restart를 눌렀으니 옛 버전으로라도 다시 열리고, 업데이트는 다음 종료 때 다시 시도된다.
- B2 수정 1회차 보냄: dispatch `ctx_5615fdcff60f`.
- B2 수정 1회차 완료: `1cfe6233`, `c03bb048`. worker 보고 `verify.mjs` PASS(9675). B1의 `types.ts`·`state.ts`에 `restart-held` 이벤트를 더했다. 🔴은 처음부터 0이라 재리뷰 없이 통합한다.
- B2 통합: `61f1b887`..`b88ca29f`(커밋 5개 cherry-pick), push. B2 worker를 release하고 worktree `app-update-b2`를 지웠다. 브랜치 `SinhyeokKang/app-update-b2`(`c03bb048`)는 남아 있다.
- B3 시작: dispatch `ctx_77bdcff883a5`, worktree `app-update-b3`(base `b88ca29f`), Opus medium.
- 통합 HEAD `b88ca29f`에서 `verify.mjs` PASS(로그 `.scratch/orch/verify-B2.log`).
- B3 완료(worker_done): `c1aadab5`..`37c5fd2c`(커밋 9개; DESIGN·BACKLOG·POSTMORTEM 커밋 포함). worker 보고 `verify.mjs` PASS(앱 테스트 9706개), `/design-sync`에서 분류하지 않은 차이 0(분류된 차이 109행, `.scratch/design-sync/app-update/table.md`). design-sync에서 찾은 결함(밀어 넣은 popover가 마운트된 모든 헤더에서 열림)은 고쳤고 POSTMORTEM에 적었다. Release Notes 열기 실패에는 문구가 없다(초안에 없음).
- conductor가 스크린샷 두 장(`impl-blocked`, `impl-hb`)을 직접 봤다. 막힘 notice, 헤더 버튼 위치, popover 문구가 초안과 같다.
- R3(B3 리뷰) 시작: dispatch `ctx_d466fb21e482`, Opus medium, 보고만.
- R3 결과: 🔴 0, 🟡 1, ⚪ 4(`.scratch/orch/review-B3.md`). conductor 판단: 🟡1 이 헤더 버튼 누름으로 시작한 restart가 멈추거나 막히면 popover를 focus와 함께 연다. ⚪1·2·4는 고친다. ⚪3 초안 08 `auto-check`의 "Not checked yet" 타일이 스위치를 켠 채 그려져 자기 캡션과 어긋나므로, 그 타일만 B3가 고친다(차이 기록 대신 초안을 고친다).
- 사용자 결정(2026-11-08): Release Notes를 열지 못하면 표시 없이 두고 BACKLOG에 기록한다.
- B3 수정 1회차 보냄: dispatch `ctx_a1f2498d6c56`.
- B3 수정 1회차 완료: `87763c42`..`97dd47b4`(커밋 5개, 초안 타일 수정 `2658e098` 포함). worker 보고 `verify.mjs` PASS, 분류하지 않은 차이 0. 🔴은 처음부터 0이라 재리뷰 없이 통합한다.
