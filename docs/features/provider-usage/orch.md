# provider-usage — orch

원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md). 이 문서는 배치 나누기와 진행만 적는다.

- 시작 hash: `4a2233c3`(origin/main)
- 통합 branch: `feat/provider-usage`(conductor worktree `provider-usage-orch`)
- worker: Claude 모델만(사람). PR은 push만 하고 merge하지 않는다(사람).

## 결정 기록

1. **worker 모델 범위**: Claude만. Codex로 넘어가지 않는다(사람).
2. **merge**: PR을 열고 merge하지 않는다(사람).
3. **공용 프로필**: E1·E2는 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`(실제 HOME, 다섯 provider 연결)를 쓴다. E2가 끝나면 sign out하고 userData와 Keychain 항목 `Claude Code-credentials-45991d82`·`Codex Auth`를 지운다. 지우기 전에 사람에게 묻는다. `doan Safe Storage`는 지우지 않는다(`/Applications/Doan.app`과 이름이 같다)(사람).
4. **Cursor 한도 창**: `individualUsage.plan`의 `autoPercentUsed` → "Auto", `apiPercentUsed` → "API", 둘 다 `resetsAt = billingCycleEnd`. `isUnlimited: true`면 `unlimited`. 지휘자 판단 — 사람이 확정한 초안(`.doan/canvases/provider-usage.html` popover 행 "Auto 100% used · API 0% used")과 Orca 1.4.240의 같은 두 값(`research/orca-line2515.js` "Cursor Models"/"Other Models").
5. **Copilot의 지난 `resetDate`**: PoC U3에서 `resetDate`가 조회 때 이미 지났다. 초안대로 그 한도 창은 "Reset · updating"이고 링 값에서 빠진다(spec 완료 조건 2). 그래서 이 계정의 Copilot 링은 비고, popover를 열 때마다 Copilot을 다시 읽는다(결정할 점 2의 예외). 지휘자 판단 — 사람이 확정한 초안(design 결정할 점 18). E2에서 실제로 이렇게 보이는지 확인하고 보고에 적는다.
6. **Claude 한도 창**: `rate_limits`의 null 아닌 `five_hour` → "5-hour", `seven_day` → "Weekly", `seven_day_opus` → "Weekly · Opus", `seven_day_sonnet` → "Weekly · Sonnet", `model_scoped[]`의 각 항목 → "Weekly · <display_name>". 그 밖의 키(`seven_day_cowork`, `seven_day_oauth_apps`, 이름 없는 키 등)와 null 항목은 무시한다. 필요한 키가 없거나 타입이 다르면 `read_failed`(tasks 'P 결과' U1). `limited`는 그 한도 창의 `locked_reason`이 null이 아닐 때만 둔다. 지휘자 판단 — 초안의 "Weekly · Fable (model_scoped)"와 design §1 "provider가 직접 말할 때만".
7. **Copilot `limited`**: `remainingPercentage 0`이면서 `usageAllowedWithExhaustedQuota: false`. `hasQuota: false`나 `entitlementRequests 0`인 종류는 뺀다(design 순수 함수 3, 'P 결과' U3). 지휘자 판단.
8. **IPC 계약(B와 C를 나란히 돌리기 위해 미리 고정)**. 지휘자 판단 — design §3.
   - `agent-usage:read`(invoke, `mainOnly`): 인자 `{ trigger?: "open" | "refresh" }`. 반환 `UsageEntry[]`: 지원 provider(claude, codex, cursor, copilot) 가운데 연결한 것만, `PROVIDERS` 순서. Antigravity는 없다. `trigger`가 없으면 조회를 시작하지 않고 지금 값만 준다. `"open"`은 popover 열기, `"refresh"`는 새로고침 버튼(간격 무시)이다.
   - `agent-usage:changed`(main → 앱 창): 인자 `UsageEntry[]`(위와 같은 규칙). 항목이 바뀔 때(조회 시작·끝, 연결 변화) 보낸다.
   - preload: `readAgentUsage(trigger?: "open" | "refresh"): Promise<UsageEntry[]>`, `onAgentUsage(listener: (entries: UsageEntry[]) => void): () => void`(구독하면 `agent-usage:read`를 trigger 없이 한 번 불러 첫 값을 준다. `onAgentAuth`와 같은 방식, `preload/index.ts:189-200`).
   - 타입은 A가 만드는 type-only 모듈의 `UsageEntry`·`UsageReading`·`UsageWindow`를 쓴다.
9. **preload 소유**: C(tasks C1 "preload 호출"). B는 main handler만 만든다.
10. **lease 용도(`"usage"` 또는 `"listing"`)와 시간 제한 값**: B 담당 worker가 `/tdd`에서 정한다(design §2 "`/tdd`에서 정한다"). 지휘자 판단.
11. **E1·E2는 worker, E3·Z1은 지휘자**: E1(`/design-sync`)은 구현을 고치므로 worker가 한다. E2는 보고만 하는 `/runtime-test`라 worker가 하고, sign-out·정리 승인은 지휘자를 거쳐 사람에게 묻는다. E3(`/verify`)와 Z1(문서 승격)은 지휘자 몫이다(orchestrate §4·§5).
12. **쓸 수 없는 연결의 reauth 문구**: `UsageEntry.blocked`는 원인 코드만 담는다. B는 `readiness()`가 `reauth_required`이면서 auth phase가 `reauthRequired`가 아닌 연결(`state.ts:119` `unpinned`)을, A의 `blockedText`가 Settings > Agents와 같은 일반 문구("isn’t available right now")를 내는 원인 코드로 바꿔 담는다. 계약(결정 8)은 바뀌지 않는다. 지휘자 판단 — spec 완료 조건 3 "Settings > Agents와 같은 원인 문구"(RA 🟡2).
13. **창이 다시 보일 때 읽기**: 숨겨진 앱 창이 다시 보이면 앱 시작과 같은 규칙(5분 간격)으로 읽는다. design 결정할 점 2에 더했다(사람).
14. **확인되지 않은 연결**: 앱 시작에는 저장된 연결이 모두 `unverified`라, design대로면 시작 때 링이 거의 빈다. 대화 준비와 같이 먼저 확인하고 읽는다. Copilot은 확인 없이 읽고, 확인이 실패해야 `blocked`가 된다. design 결정할 점 5를 고쳤다(B의 질문, 사람).
15. **바깥 클릭으로 닫힐 때 포커스**: Radix non-modal popover는 바깥 클릭 뒤 포커스를 버튼으로 돌리지 않는다. 클릭이 포커스를 아무 데도 두지 않았으면(`<body>`) 버튼으로 돌리고, 다른 컨트롤에 포커스를 두었으면 그대로 둔다. canvas press는 canvas 포커스를 유지한다. 지휘자 판단 — spec 완료 조건 1의 뜻을 지키되 사람이 누른 컨트롤의 포커스를 뺏지 않는다(E1의 질문).
16. **막힌 연결의 popover 문구**: popover 행은 Settings > Agents의 그 연결 행과 같은 문구를 쓴다(확인 실패면 "Couldn’t check …" 계열). 결정 12의 `unavailable()` 기준을 대신한다(E2 항목 7, 사람).
17. **시작 직후 tool facts 전**: 첫 tool facts 확인이 끝나기 전에는 `blocked`를 보이지 않고 처음 읽는 중으로 둔다. lease 단계에서 실패한 조회는 main 로그에 Doan 쪽 분류 한 줄을 남긴다. 지휘자 판단 — E2 관찰(0.7초 `version_unknown`, `usageService.ts:188`).
18. **R2 리뷰의 열린 점 두 가지**: 교체 sign-in 중 popover 행은 "Preparing <X> sign-in."으로 둔다(attempt ID를 창에 보내지 않는 §7 규칙). 설명 글은 문장에 provider 이름이 없으면 `<이름>: ` 접두를 붙인다(문장 사본을 두지 않는다). 지휘자 판단 — 결정 16의 목적, RR2 권고.

## 배치

| 배치 | tasks 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | A1, A2 | 새 `app/src/main/agentAuth/usage*.ts`(type-only 타입 모듈, provider 파서, `shouldRead`, `UsageStore`)와 테스트, 새 `app/src/renderer/agentUsage*.ts`(`ringValue`, `usageText`, 설명 글)와 테스트, `app/src/main/agentAuth/fixtures/*-usage.json`, `fixtures/README.md`, `app/src/renderer/rendererImports.test.ts`(필요할 때만) | — | Opus medium: 순수 함수지만 PoC 응답의 모양과 결정 4–7을 바르게 옮겨야 한다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `3950f2de`·`4e507db3`·`514a534e`(round 1) |
| RA | A 리뷰 | 보고만 | A | Sonnet high: 순수 함수 diff, 규칙 대조가 대부분 | `/code-review` 보고 | 🔴0 🟡3. 🟡1·3과 🟢1은 A-r1(Sonnet medium: 범위가 좁은 수정)이 고쳤고, 🟡2는 결정 12 |
| B | B1, B2 | 새 `app/src/main/agentAuth/usageRead*.ts`·IPC 모듈과 테스트, `agentAuth/manager.ts`(+test), `main/index.ts`, `main/senderAllowed.ts`(+test), `main/conversation/*`(턴 끝 계기, 열린 runner 재사용) | A 통합 | Opus high: lease·sign-out·동시 조회 합치기·늦은 결과 버리기·Cursor 토큰 처리 — 틀리면 sign-in이 풀리거나 토큰이 샌다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `105063c7`·`3cce4dd0`·`c1d0f0ac`·`5e3f78dd`·`48f4c28f`(round 1) |
| C | C1 | `app/src/preload/index.ts`(+test), `app/src/renderer/` 새 링·popover 컴포넌트와 테스트, `App.tsx`(+App 테스트), `SettingsAgents.tsx`(원인 문구 공유가 필요할 때만), `tokens.css`, `styles.css`, `docs/DESIGN.md`, `.doan/ds/color.html`(지휘자 brief가 처음에 `design-system-canvases.html`로 잘못 적었다. C의 질문으로 고쳤다) | A 통합 | Opus high: 포커스·Esc 순서·접힘·실시간 행 변화 등 상호작용 규칙이 많고 모든 화면에 보인다 | `npm --prefix app test`, typecheck, `npm --prefix app run build` | 통합 `fba3d8a8`·`114a794a`·`6be30a1d`·`e9b467cc`·`2dec1854`(round 1) |
| RB | B 리뷰 | 보고만 | B | Opus high: 동시성·자격 증명 경계 | `/code-review` 보고 | 🔴0 🟡2(턴 끝 Claude 조회가 다음 send를 busy로, 확인 대기 중 quit 5초) 🟢3. B-r1(Opus high: 대화 종료 대기와 겹치는 시간 규칙)이 모두 고쳤다 |
| RC | C 리뷰 | 보고만 | C | Opus medium: UI 규칙 대조 | `/code-review` 보고 | 🔴1(페이지 Esc) 🟡1. C-r1(Opus medium: App의 Esc 경로라 판단이 필요)이 고쳤다. 🟡1의 실제 키·포커스 확인은 E1·E2로 넘긴다 |
| E1 | E1 | C의 renderer 파일, `tokens.css`, `styles.css`, `docs/DESIGN.md` | B·C 통합 | Opus high: 실제 앱에서 계산된 style 측정과 수정 | `/design-sync` 보고 | 통합 `aea31116`·`dfefe248`(자체 리뷰 2 round, 🔴0 🟡0) |
| E2 | E2 | 보고만(`.scratch/`) | E1 통합 | Opus high: 실제 프로필로 원인 진단까지 해야 해서 medium에서 올렸다 | `/runtime-test` 보고 | 완료: 7 통과, 항목 7 문구 차이 → 결정 16. `.scratch/runtime-test-E2.md` |
| E3 | E3 | — | E2 | 지휘자 | `node .agents/skills/verify/scripts/verify.mjs` exit 0 | 대기 |
| Z1 | Z1 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/provider-usage/` 삭제 | E3 | 지휘자 | tasks Z1의 grep 검증 | 대기 |

tasks의 남은 항목(A1, A2, B1, B2, C1, E1, E2, E3, Z1)은 모두 한 배치에 속한다. U4는 막힘으로 닫혔다(U6 결정).

## 겹침과 순서

- A가 먼저다. B와 C는 A의 타입과 순수 함수를 쓴다.
- A 통합 뒤 B와 C를 나란히 돌린다. 둘이 같이 고치는 파일은 없다: main(B)과 preload·renderer(C)로 나뉘고, 계약은 결정 8이다. B가 A의 파일을 고쳐야 하면 고치지 않고 '미룬 항목'으로 넘긴다(C도 같다).
- E1은 B·C 통합 뒤, E2는 E1 통합 뒤, 그다음 E3·Z1.

## 진행

- A: worker Opus medium(`ctx_1a09f55737df`) → RA Sonnet high(`ctx_55e6b6a6640a`, `.scratch/review-A.md`) → A-r1 Sonnet medium(`ctx_4479c451c70a`). 통합 hash는 배치 표에 있다. A-r1의 전체 테스트에서 1건이 실패했고 이름을 남기지 않았다. 통합 tree(`514a534e`와 같은 tree)에서 다시 돌리니 285 files / 7492 tests 모두 통과했다. 부하 flake로 본다.
- C: worker Opus high(`ctx_c0eb42cf24b4`, `.scratch/handoff-C.md`) → RC Opus medium(`ctx_f14e435edf07`, `.scratch/review-C.md`, handoff 해석 1–10 accept) → C-r1 Opus medium(`ctx_efd8cf2ed278`). E1·E2에서 확인할 것: Space·Return·Esc·바깥 클릭과 포커스 복귀(workspace·Home·Settings), 접힘 폭 8px, 1시간 넘는 "Updated Nh ago" 문구(초안 밖, Z1에서 사람에게 알린다).
- B: worker Opus high(`ctx_a46613f385c4`, `.scratch/handoff-B.md`) → RB Opus high(`ctx_1a0d78bfa199`, `.scratch/review-B.md`) → B-r1 Opus high(`ctx_abfdd3ba08d0`, `.scratch/handoff-B-r1.md`). 턴 끝 Claude 조회 상한 3초(3초 + D1 종료 5.0초 < `EXIT_WAIT_MS` 10초), 새 Claude 조회도 org pin, 최소화된 앱 창은 보이는 것으로 센다. E2에서 확인할 것: 턴 끝 Claude 조회 뒤 다음 send가 `busy`가 되지 않는지와 지연 시간, 열린 Query의 `get_usage`, 시작 때 확인에서 Keychain 대화상자가 뜨지 않는지.
- 통합 HEAD `48f4c28f`에서 `/verify` PASS(verify-tests, runtime-support, go-test, go-vet, typecheck, app-test, build). 로그 `.scratch/orch/verify-1.log`, `.scratch/verify/`.
- E1: worker Opus high(`ctx_2fa6508bc1eb`, `.scratch/handoff-E1.md`, 측정표 `.scratch/design-sync/agent-usage/table.md`). 실제 계정으로 시작했을 때 Claude Code 99%, Codex 38%였고, **Cursor는 blocked("isn’t available right now"), Copilot은 `read_failed`**였다. PoC에서는 둘 다 읽혔으므로 E2에서 원인을 먼저 본다. limit reached·unlimited·not_supported·no_plan_limits·blocked 원인 문구는 주입으로만 확인했다.
- G: 사람이 이번 run에 더한 요청(에이전트 작업 glow 300%). Sonnet medium(`ctx_095eee475321`), 통합 `a9771658`(blur 36 px / 108 px).
- E2: Opus high(`ctx_9c912dd367c9`). E1의 Cursor blocked·Copilot `read_failed`는 probe 환경 탓이었다(`doan Safe Storage` ACL이 PoC checkout의 Electron 경로만 신뢰해서 worktree Electron은 vault를 열지 못함). PoC Electron으로 네 provider 값이 PoC와 맞았다. Codex는 승인된 sign-out으로 `Codex Auth` 항목까지 없어졌다. 남은 정리: Claude·Cursor·Antigravity·Copilot sign-out, userData, `Claude Code-credentials-45991d82`(사람에게 묻는다).
