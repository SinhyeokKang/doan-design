# picker-default-labels — orch

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md). 초안: `.doan/canvases/picker-default-labels.html`(D1·D2 완료, round 4 확정).
- 시작 hash: `bd5b71ba`(main, fast-mode 병합 뒤).
- 통합 branch: `feat/picker-default-labels`(사람이 만든 worktree를 그대로 쓴다).
- 지휘: Claude Code(Opus 5.5).

## 결정 기록

| # | 내용 | 근거 |
|---|---|---|
| 1 | Codex worker를 섞어 쓴다 | 사람, 이번 실행의 상시 허가 |
| 2 | `/verify` 전과 최종 push 전에 매번 최신 `origin/main`으로 rebase하고, rebase 뒤에만 `/verify`를 돌린다 | 사람, 이번 실행의 상시 규칙 |
| 3 | 실제 앱 확인(`/runtime-test`, `/design-sync`) 전에 다른 실행(tester-notarization)의 Doan 앱이 떠 있는지 보고, 떠 있으면 기다리거나 사람에게 묻는다 | 사람, 이번 실행의 상시 규칙 |
| 4 | 공용 로그인 프로필 `~/code/doan-design/.scratch/provider-profile/userData`를 쓰되, 로그아웃하거나 지우지 않는다 | 사람, 이번 실행의 상시 규칙(다른 feature도 쓴다) |
| 5 | push와 PR까지만 한다. 병합하지 않는다 | 사람 |
| 6 | worker의 `/ship`은 push 직전에 멈추고, `/runtime-test`(5단계 앞)와 docs freshness(9단계)를 건너뛴다. 실제 앱 확인은 통합 뒤 R1에서, 문서 승격은 Z1에서 지휘자가 한다 | 지휘자 판단 — GUI probe를 한 곳에서 조율하고(결정 3), 문서 승격은 tasks Z1이 한 번에 한다 |
| 7 | A2·A3·A4·B1을 한 batch(RA)로 묶는다 | 지휘자 판단 — 모두 renderer이고 `homeComposer.ts`·`SettingsAgents.tsx`·`ComposerParts.tsx`를 서로 이어서 고친다. 나누면 파일이 겹쳐 직렬이 되므로 batch를 나눠 얻는 것이 없다 |
| 8 | B2(`/design-sync`)는 RA 통합 뒤 RA worker에게 새 Task로 보낸다 | 지휘자 판단 — 구현을 고치는 단계이므로 RA 파일을 가진 worker가 맡는다 |
| 9 | 독립 리뷰는 통합한 MA+RA diff 하나를 Codex Astra가 본다 | 지휘자 판단 — 다른 계열이 읽는다(사람의 이전 선호, worker-model-mix) |

## Batch

| Batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| MA | A1 | `app/src/main/conversation/models.ts`, `models.test.ts` | 없음 | Codex Sol `medium` — 함수 하나와 테스트 네 경우가 spec에 정해져 있다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `87d2769d`·`98ecb231`(worker red 2건 → 전체 8688 통과, typecheck 통과) |
| RA | A2, A3, A4, B1 | `app/src/renderer/` 중 `homeComposer.ts`, `dockedRules.ts`, `permissionPicker.ts`, `ComposerParts.tsx`, `DockedComposer.tsx`, `SettingsAgents.tsx`, `HomeComposerView.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, Settings 순수 함수 새 파일, 각 테스트와 CSS | 없음 | Claude Opus `high` — 접근성 이름, 저장 규칙(POSTMORTEM 2026-11-02), Settings 고정 해제처럼 틀리면 보내는 값이 어긋나는 판단이 많다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `bcbac125`까지 9 commit(worker 자체 리뷰 🔴1 수정 포함) |
| RV | MA+RA 독립 리뷰(`/code-review`) | 보고만 | MA, RA 통합 | Codex Astra `medium` — 판단이 필요한 리뷰, 다른 계열 | 보고서 | 완료: 🔴0 🟡1 ⚪2(`.scratch/orch/review-RV.md`) |
| B2 | `/design-sync picker-default-labels` | RA 파일 + `docs/DESIGN.md`의 tray 측정값 | RA 통합, RV 🔴 0 | RA worker(Claude Opus `high`) — 실제 앱 측정과 구현 수정 | `/design-sync` 보고에 불일치 없음 | 대기 |
| R1 | `/runtime-test` | 없음(확인만) | B2 통합 | 지휘자 | 보고, 스크린샷, frame 발췌 | 대기 |
| R2 | `/verify` | 없음 | rebase 뒤 | 지휘자 | 종료 코드 0 | 대기 |
| Z1 | 문서 승격, feature 디렉터리 삭제 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/BACKLOG.md` | R1, R2 | 지휘자 | tasks Z1 검증 | 대기 |

- tasks의 체크 항목 D1·D2는 완료됐고, A1–A4·B1·B2·R1·R2·Z1은 위 표의 한 행에 하나씩 속한다.

## 파일 겹침과 순서

- MA와 RA는 고치는 파일이 겹치지 않으므로 병렬로 돌린다.
- RV는 둘을 통합한 뒤에 돌린다. 수정은 소유 worker에게 보낸다.
- B2는 RA 파일과 `docs/DESIGN.md`를 고치므로 RV 수정 round가 끝난 뒤 직렬로 돌린다.
- R1·R2·Z1은 B2 통합 뒤 지휘자가 차례로 한다.

## 진행 기록
- Orca run `run_9a87ca7f6348`. MA: task `task_2eefb08278fa`, dispatch `ctx_5104aba571e0`, worktree `pdl-ma`(branch `SinhyeokKang/pdl-ma`), Codex `gpt-6.1-sol` medium 확인. RA: task `task_a4da549949af`, dispatch `ctx_3fdb8ad9dd05`, worktree `pdl-ra`(branch `SinhyeokKang/pdl-ra`), Claude Opus high 확인. 둘 다 `5f0f5cf6`에서 시작했다.
- RA 질문(Settings Claude Model 메뉴, 초안 tile은 Default 아래 Opus 5.5 고정 행을 두지만 design 결정 5와 A1은 `opus` 행을 뺀다): 사람이 design대로 정했다. 메뉴는 Default(설명 'Opus 5.5') · Fable · Sonnet · Haiku다. 초안 `settings` tile은 B2 전에 이 결정에 맞게 고친다(draft-follows-decisions).
- RA 통합 뒤 통합 HEAD `bcbac125`에서 typecheck 통과, `npm --prefix app test` 310 files · 8711 tests 통과(MA의 A1 모양과 RA fixture가 함께 맞는다).
- 지휘자 판단: Codex 모델에 `defaultReasoningEffort`가 없을 때 노력 Default 행 설명을 `Set by Codex`로 쓴 RA의 일반화를 받는다 — design §5는 Claude만 정했고, 같은 문형이 사실과 맞다.
- postmortem 후보(RA 리뷰 🔴1, 목록 전 Default 행 값 `"default"`가 Claude 모델 id와 겹침)는 main에 닿기 전에 잡혔으므로 `/postmortem` 대상으로 보고 Z1 전에 판단한다.
- 초안 `settings` tile 수정(RA follow-up)을 지휘자가 diff로 확인했다. Opus 5.5 고정 행이 빠지고 note가 메뉴 내용을 말한다. 이 캔버스의 `doan check` finding은 0이다(다른 파일의 기존 finding 13개는 무관). 통합 커밋은 `3608f2f4`이다.
- RV(Codex Astra medium) 리뷰: 🔴0 🟡1 ⚪2. 🟡1(Settings Model 메뉴의 고정 해제 행과 실제 `default` id 모델 행이 같은 value를 가진다)과 ⚪2(노력 Default 행 → send에서 노력이 빠지는지 composer 수준 테스트)는 RA fix round 1로 보냈다. ⚪1(tray CSS를 소스 문자열로만 고정)은 B2의 computed-style 측정으로 보완한다. RV가 본 `conversation/io.test.ts:233` 시간 초과 1건은 단독 재실행에서 통과했다. RA가 본 `watch.test.ts` 1건과 함께 `/verify`에서 다시 본다.
- 정리: MA·RV worker를 release했고, worktree `pdl-ma`·`pdl-rv`를 Orca로 지웠다. branch `SinhyeokKang/pdl-ma`(`6dd9c1bd`)·`SinhyeokKang/pdl-rv`(`11d94d54`)는 남아 있다.
- RA fix round 1(`b4a5ec09`·`1677cb99`)을 지휘자가 diff로 확인하고 통합했다(통합 `13892d5c 06ed0017 `). Settings Model 메뉴 값이 `unset`과 `model:<id>`로 나뉜다. worker 기준 8714 tests 통과. B2를 RA에게 보냈다(dispatch `ctx_efada0971d47`). 보내기 전에 다른 Doan 앱은 떠 있지 않았다(tester-build의 electron-builder dmg 빌드만 돌고 있었다).
- B2 질문 Q1(Settings Default 상태에서 composer의 어떤 선택이든 해석된 기본 모델을 고정해 버린다): 지휘자 판단으로 고친다(rememberChoice.ts 허용) — Settings Default가 고정을 푸는 결정 5를 지킨다. Q2(docked에서 결정 9의 metadata 잉크가 출시 tray 잉크와 거의 같다)는 사람에게 물었다.
- Q2: 사람이 초안대로 정했다. docked tray의 모델·노력·권한 값 글은 --text-standard(rgb 15), 서랍 이름은 metadata 잉크(rgb 95), Attach·Pick은 --text-subtle을 유지한다. RA에게 보냈다.
- B2 재측정 전 worker가 본 Doan(pid 13100)은 지휘자가 사람에게 초안을 보여 주려고 연 설치본이다. 격리된 dev 앱을 병렬로 띄워도 된다고 답했다.
- 사람의 추가 요청(이번 run에서 함께 고친다): 캔버스를 연 채로 사이드바 프로젝트 행을 누르면 hover 때만 보여야 할 chevron이 남는다. batch BG로 맡긴다. 지휘자가 본 단서는 `styles.css:452-453`의 `:focus-within`이다. 클릭으로 받은 focus도 chevron을 보이게 하는데, PRODUCT §5는 hover나 키보드 focus에서만 보이게 한다. `styles.css`를 RA(B2)가 고치는 중이므로, B2를 통합한 뒤 새 Claude worker(Opus `medium` — 원인 확인과 CSS 한 규칙 수정, 실제 앱 재현이 필요하다)로 직렬로 돌린다.
- 사람의 두 번째 추가 요청: Codex 구계정으로 모델 목록을 본 뒤 Settings > Agents에서 구독 계정으로 바꾸고 대화로 돌아오면, 모델 목록이 구계정 것으로 남는다. batch BC로 맡긴다. 단서는 main 목록 cache 키(`models.ts:92`)에 `accountId`가 없다는 점과 renderer가 provider별 목록을 들고 있다는 점이다. Claude Opus `high`로 정했다 — 계정 수명주기와 cache, lease 규칙(POSTMORTEM 2026-10-30)을 함께 판단해야 한다. 공용 로그인 프로필은 계정을 바꾸면 로그아웃되므로 쓰지 않는다. 가짜 provider로 재현하고, 실제 두 계정 확인이 필요하면 사람에게 묻는다. B2를 통합한 뒤 BG와 병렬로 돌린다(BC는 `styles.css`를 고치지 않는다).
- B2 질문 Q3(선택 기억이 고정된 노력을 잃거나 다른 모델의 노력을 고정 모델 아래 저장한다): 고친다 — Q1 수정에서 생긴 어긋남이다. Q4(메뉴에서 'Default' 표시가 붙은 Codex 모델 행을 고르면 Settings가 그 모델로 고정된다): 그대로 둔다 — 이름이 붙은 모델을 고른 것이고, 고정을 푸는 길은 Settings의 Default 행이다. 둘 다 지휘자 판단이다.
- BG 시작: task `task_240806cbd7e3`, dispatch `ctx_e4a29d6ffff1`, worktree `pdl-bg`, Claude Opus medium. RA의 남은 작업은 `rememberChoice.ts` 계열이라 `styles.css`와 겹치지 않는다. 그래서 B2 통합을 기다리지 않고 띄웠다. BC는 composer 호출부가 RA의 Q3 수정과 겹칠 수 있어 B2를 통합한 뒤에 띄운다.
- B2를 통합했다(`518c89d2`..`c0bf2417`, 커밋 14개). worker 보고: 17 tile에서 152쌍을 쟀다. docked 단계는 13개 폭(432/431, 384/383, 320/319 포함)에서 초안과 맞았고, 간격은 2/2/2와 링 앞 4다. gate는 typecheck, 8722 tests, build다. worker가 확인하지 못한 것: 실제 provider 목록, Overview와 box docked composer, 비활성 docked 트리거의 잉크. 마지막 `effortPicked` 커밋은 리뷰를 받지 않았다. 그래서 B2 코드 변경 전체를 RV2(Codex Astra medium, dispatch `ctx_fb2b63dd67e8`)에 맡겼다.
- BC 시작: task `task_ef0ceabf8e07`, dispatch `ctx_612bc1d2b94a`, worktree `pdl-bc`, Claude Opus high.
- postmortem(사람의 지시): RA 쪽 세 건(Home이 마운트될 때 선택을 기억함, 고른 값과 해석된 값을 구별하지 못함, 미선택 sentinel이 모델 id와 겹침)을 지휘자가 `98f72a51`로 기록했다. BG와 BC는 각 worker가 자기 버그를 기록한다.
- BG를 통합했다(test `6bd89da9`, fix `1a85332f`, postmortem). `POSTMORTEM.md`가 충돌해서 같은 날짜 항목 위에 BG 항목을 두는 방식으로 풀었고, 항목 안의 hash를 통합 hash로 고쳤다. worker의 probe는 수정 뒤 6/6 통과했고, 키보드 화살표와 Tab에서도 chevron이 보인다.
- 사람의 결정: 캔버스 행의 ⋯ 메뉴 버튼도 클릭 뒤에 남으므로 같이 고친다. PRODUCT §5 'Canvas row menu'의 "focus is in it"은 Z1에서 키보드 focus로 고친다. BG follow-up은 dispatch `ctx_22d38b603aa0`이다.
- RV2(B2 코드 리뷰) 결과는 🔴0 🟡3이다(`.scratch/orch/review-RV2.md`). Edit 복원 표식이 effect 의존성에 빠졌고, `modelPicked` 경로가 고정 노력을 무시하며, docked에서 provider를 바꿔도 이전 effort와 표식이 남는다. 고칠 파일이 BC가 고치는 파일과 겹치므로, BC를 통합한 뒤 RA fix round 2로 보낸다.
- RV2 worker는 release한다.
- BG follow-up(캔버스 행 ⋯ 버튼)을 통합했다(`8cdae5b6`·`20639b30`·`64e8d004`, postmortem hash도 통합 hash로 고쳤다). worker probe는 11/11 통과했다. design-system 행은 같은 class와 규칙을 쓰지만 직접 probe하지는 않았다. BG는 할 일이 더 없으므로 release한다.
- BC를 통합했다(test `57e557d2`, fix `5751e5c1`, postmortem). `POSTMORTEM.md` 충돌은 같은 방식으로 풀었다. 원인은 renderer였다. 창이 모델 목록을 `root + provider`로만 보관했다(Home memory, DockedSupport, Settings). main은 이미 connection마다 목록을 다시 읽고 있었다. 수정은 Status DTO에 auth `generation`을 싣고, 목록 키에 그 값을 붙이는 것이다. 다섯 provider가 같은 상태 기계를 쓰므로 모두에 적용된다. 테스트는 Codex 교체만 다룬다. worker 자체 리뷰는 🔴0 🟡0 ⚪3이다. 실제 두 계정 확인은 하지 않았다(R1에서 사람에게 묻는다). ARCHITECTURE §7 'Model lists' 문장은 Z1에서 고친다.
- RA fix round 2(RV2 🟡3)를 보냈다(dispatch `ctx_fd06241beed7`). 그 뒤 BC와 RA fix 2를 묶어 독립 리뷰(RV3)를 받는다.
- 참고: BC 정리 때 `git cherry`가 `9d726fa1`(postmortem)을 `+`로 보였다. 충돌을 풀면서 hash 두 개를 통합 hash로 바꿔 patch가 달라졌기 때문이고, 항목 내용은 통합됐다. branch `SinhyeokKang/pdl-bc`는 남아 있다.
- RA fix round 2를 통합했다(`e03b6ecc`·`5992ccee`). RV3(Codex Astra medium)는 BC와 RA fix 2를 보고 🔴0 🟡0 ⚪0을 냈다(`.scratch/orch/review-RV3.md`). RV3 worker와 worktree는 정리했다.
- 사람의 결정: BC를 실제 두 Codex 계정으로 확인한다. 로그인은 지휘자가 ego-browser로 직접 한다. 공용 프로필을 복사하지 않고, 새 userData에서 real HOME으로 확인한다. Codex keyring은 정규화한 `CODEX_HOME` 경로로 키가 잡히므로(`agentAuth/providers.ts:137`), 다른 경로에서 로그인하거나 교체해도 공용 프로필의 항목은 바뀌지 않는다.
- origin/main으로 rebase했다(커밋 60개, 충돌 없음; tester-notarization은 main에 병합됐다). R1 시작: dispatch `ctx_95fb0d2c611b`, worktree `pdl-r1`, Claude Opus high. A는 공용 프로필로 tasks R1 통과 조건을, B는 새 userData와 ego 로그인으로 BC 두 계정 확인을 한다. 보고만 한다.
- Z1 시작: dispatch `ctx_b1391ec85f0c`, worktree `pdl-z1`, Claude Opus medium(문서만). 지휘자는 결과를 검토해 통합하고, R1 결과는 BACKLOG에 직접 더한다. feature 디렉터리는 마지막에 지휘자가 지운다.
- Z1을 통합했다(PRODUCT·ARCHITECTURE·DESIGN·BACKLOG 커밋 4개). 지휘자가 diff를 결정 기록과 맞춰 봤다. ARCHITECTURE에는 remembered-choice 절이 없어서, 고른 값만 고정하는 규칙은 PRODUCT item 0에만 적었다. Z1 worker와 worktree는 정리했다.
- R1 B의 계정: 구계정은 ox501501@gmail.com이고 worker가 ego로 로그인한다. 구독 계정은 사람이 직접 로그인한다. worker가 교체 단계에서 로그인 URL을 ask로 보내면 지휘자가 전달한다.
- 사람의 정정: ox501501@gmail.com은 구독 계정이다. 확인 방향은 상관없으므로, 구독 계정(ego 로그인)에서 구계정(사람 로그인)으로 바꾼다.
- R1 B: 사람의 수동 로그인이 재시도 끝에 패스키에 막혔다. 바꿀 계정을 b2b_product_group@day1company.co.kr(사람의 설치본 Doan이 쓰는 Codex 계정)로 하고, worker가 ego로 새 프로필에 로그인한다. 설치본과 그 userData는 건드리지 않는다.
