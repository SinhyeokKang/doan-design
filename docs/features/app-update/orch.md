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
| B1 | T2, T3 | 새 `app/src/main/update/`(eligibility, schedule, state, errorCode, gate, view, 타입 파일과 테스트), `app/src/main/preferences.ts`·`preferences.test.ts` | — | Opus high — 상태 기계의 겹침(수동·자동, 받는 중 재확인, 취소)과 view 매핑이 틀리면 UI 전체가 틀린다 | `npm --prefix app test`, `typecheck`, `rendererImports.test.ts` | 대기 |
| B2 | T4, Copy details 줄 | `app/package.json`·`package-lock.json`, `app/src/main/update/service.ts`(+테스트), `app/src/main/index.ts`·`index.test.ts`, `menuState.ts`(+테스트), `senderAllowed.ts`(+테스트), `app/src/preload/index.ts`(+테스트), `app/src/main/about.ts`(+테스트) | B1 통합 | Opus high — 종료 순서·flush·설치 시점은 상태를 잃을 수 있는 동시성 경로다 | `npm --prefix app test`, `npm --prefix app run build`, `verify.mjs` | 대기 |
| B3 | T5 | `app/src/renderer/SettingsAbout.tsx`(+테스트), `App.tsx`·헤더 버튼과 popover, `AgentUsageButton.tsx`(+테스트), `app/src/main/aboutView.ts`, `app/src/main/agentSetup/notice.ts`, `styles.css`, `docs/DESIGN.md` | B2 통합 | Opus medium — 초안이 정해져 있어 판단보다 측정이 많지만 popover·focus·폭 계산이 섞인다 | `test`, `typecheck`, `lint`, `/design-sync` 차이 0 | 대기 |
| B4 | T6 | 코드 수정 없음(보고만), `.scratch/` | B3 통합 | Sonnet medium — 정해진 probe를 격리된 앱에서 돌리고 기록한다 | `/runtime-test` 보고서 각 항목 | 대기 |
| conductor | T0, T7, 통합 `/verify` | `orch.md`, PRODUCT·ARCHITECTURE·BACKLOG·DIRECTORY 승격, 이 디렉터리 삭제 | B4 | — | tasks.md T7의 grep | T0 완료 |

- 리뷰: 각 구현 batch 뒤 독립 리뷰 worker가 `/code-review`(B1·B2 Opus high, B3 Opus medium, 보고만).
- T1은 완료(결정 2). tasks.md의 모든 체크 항목이 위 행 하나에 대응한다: T0·T7 conductor, T1 완료, T2·T3 B1, T4 B2, T5 B3, T6 B4.

## 파일 겹침과 순서

- B1과 B2는 `app/src/main/update/`를 함께 쓰지만 파일이 다르다(B2는 `service.ts`만 더한다). 직렬이라 B2가 B1 파일을 고쳐야 하면 고치고 handoff의 '계획과 다른 점'에 적는다.
- B3의 `aboutView.ts`·`notice.ts`는 main 디렉터리지만 B2가 건드리지 않는다.
- 모두 직렬이라 병렬 겹침은 없다.

## 진행 기록

- (비어 있음)
