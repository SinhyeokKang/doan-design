# terminal-agent-activity — orch

- 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 시작 hash: `20ea2c45` (main, PR #71 merge 포함)
- 통합 브랜치: `feat/terminal-agent-activity`
- 지휘: Claude Code (Opus). 모델 교차: 사용자가 이 세션에서 Codex를 허가했다. 구현은 Claude가 맡고, 독립 리뷰는 Codex `gpt-6-astra` medium, 절차가 많은 배치는 Codex `gpt-6.1-sol`이 맡는다. Codex를 쓴 곳은 배치 표의 모델 칸에 적는다.

## 결정 로그

- 권한(사용자, 인계 문서): PR을 main에 병합하는 것은 이 run에서 미리 허가되지 않았다. 병합 전에 사용자에게 묻는다.
- 선행 조건 충족: canvas-viewport-units 배치 G가 main에 있다(PR #71, merge `20ea2c45`). `canvasNotice.ts`, `canvasSeen.ts`, `Slot` 합성, `projectSlot`이 main에 있다.
- 사용자 승인(문서 작성 때): `doan work done [<canvas path>…]`의 경로는 `links`를 만드는 데만 쓴다. Go `canvasLink(root, path)`에는 frame 인자가 없고, 에이전트가 `&frame=`을 붙인다.
- O1 (지휘자 판단 — tasks 'P'의 이유): "P1·P2는 `/tdd` 전에 끝낸다"는 문구와 초안이 UI 테스트에 들어가기 때문이다. 그래서 문구와 초안이 필요 없는 배치(S, A, B, C)는 P와 병렬로 시작한다. 문구를 쓰는 UI 배치 D는 사용자가 초안을 확인한 뒤 시작한다. C가 About에 더하는 결과 줄 문구는 C가 clarify 프리셋으로 정한다.
- O2 (지휘자 판단 — 파일 겹침): `app/src/main/index.ts`·`app/src/preload/index.ts`는 B만, `app/src/renderer/App.tsx`는 D만 고친다. 그래서 deep link(T8b)를 main 쪽(B)과 renderer 쪽(D)으로 나눈다. `parseOpenLink`·링크 대기(T4c TS)는 main에서 쓰므로 B가 맡는다.
- O3 (지휘자 판단 — 스키마 공유): 스키마·fixture·두 검증기(T1)와 open-link fixture(T1b)는 A·B가 함께 읽으므로 작은 배치 S로 먼저 끝내 통합한 뒤 A·B를 시작한다.
- O5 (사용자 지시 "일부는 Codex로 구현 바꿔", 범위는 지휘자 판단): 아직 시작하지 않은 A(Go CLI)와 B(app main)를 Codex `gpt-6-astra` medium으로 구현한다. 이미 돌고 있는 P·S·C와 UI 판단이 큰 D, 실제 앱 probe인 G는 Claude로 둔다. Codex가 구현한 배치의 리뷰는 Claude Sonnet high가 맡아 교차 모델 리뷰를 유지한다.
- O6 (지휘자 판단 — PRODUCT §5 item 0, C의 질문): `~/.claude/settings.json`이 심볼릭 링크이거나 일반 파일이 아니면 링크를 따라가지 않는다. 그대로 두고 About의 agent setup 결과에 보인다.
- O7 (지휘자 판단 — B의 질문): B가 `app/src/main/senderAllowed.ts`(+테스트)도 맡는다(주 창 전용 채널). B→D 계약: `getWork()`·`onWorkChanged(listener)`(`WorkItem = {session, provider, root, path}`, 익명은 `session`·`provider`가 null), `onOpenLink(listener)`(`navigate {root, canvas, frame?}` | `malformed` | `unregistered-root` | `canvas-not-listed {project}`), `openLinksReady()`(renderer가 시작 복원과 첫 폴더 목록 뒤 부르고, 구독을 먼저 건다).
- D1 (사용자 결정, 초안 확인 중): 터미널 notice는 앱 대화와 같은 "Agent is working"을 쓰고 Stop만 보이지 않는다. 문구가 바뀌는 전환은 없다. P 수정 라운드 1이 design.md와 초안을 고친다.
- D2 (사용자 결정, 초안 확인 중): 캔버스 선택 힌트(`.doan-agent.doan-picking`, 지금 36px)도 agent notice와 같은 40px(`--size-control`) 높이로 맞춘다. 초안은 P 수정 라운드 2, 앱은 D가 맡고, G의 `/design-sync`가 잰다.
- D3 (사용자 결정): 초안의 나머지(사이드바 접근 이름, 비활성 이유 줄과 그 자리, 거절 토스트 셋, 비활성 카드 색)를 확정했다. P 수정 라운드 2를 지휘자가 확인하면 초안 확정이다.
- O8 (지휘자 판단 — design '명령' "이 세션의 집합을 모두 비운다", B의 질문): 식별된 세션은 root와 상관없이 `provider:id` 하나의 집합이다. 어느 root에서 온 `done`이든 모든 root의 경로를 비운다. 익명 세션은 root마다 하나이고 그 root만 비운다. 만료는 세션 단위(마지막 `start`와 집합 안 경로의 파일 변경 중 늦은 것)이고, 세션 상한은 식별 세션과 root별 익명 세션을 함께 센다. 경로 상한은 (root, path) 쌍을 센다.
- D4 (사용자 결정, 오케스트레이션 중 추가 요청): 추천 프롬프트 버튼 크기를 다시 작은 크기(`data-ui-size="sm"`)로 되돌린다. 문구는 지금 것을 유지한다. 배치 H가 앱·초안 4개·DESIGN.md를 고친다. D는 H 통합 뒤 `CanvasConversationPanel.tsx`를 고친다.
- D5 (사용자 결정, 리뷰 RA U1): `doan work done`에 틀린 경로가 섞여도 신호는 보내고 exit 0으로 끝낸다. 틀린 경로는 `links`에서 빼고 결과 `skipped`에 적는다(필드 이름은 지휘자 판단). design.md '명령'을 고쳤다.
- O9 (지휘자 판단 — 리뷰 RC-3): 심볼릭 링크 settings의 대상에 두 규칙이 이미 있으면 About에 아무것도 보이지 않는다. About 줄은 사람이 더할 것을 알리려는 것이라 빠진 것이 없으면 알릴 것도 없다.
- O10 (지휘자 판단 — 리뷰 RA U2): 링크된 `.doan`·기본 디렉터리 아래 경로도 root 안이면 `work`가 받아들인다. 앱은 목록에 있는 경로만 표시하고 목록은 링크된 디렉터리를 빼므로 표시되지 않을 뿐 해가 없다.
- O11 (지휘자 판단 — 리뷰 RA H2): `active.go` `readLine`의 64 KiB 상한 구멍은 이 feature 밖이다. Z1에서 BACKLOG 'known defects'에 적는다.
- O12 (지휘자 판단 — 리뷰 RB ⚪1): 만료 타이머는 1초 `setInterval` 대신 가장 이른 만료 시각까지의 `setTimeout` 하나로 둔다(design '폴링하지 않는다'에 더 가깝고 비용이 없다). ⚪4(관대한 URL 철자)는 root·canvas를 글자 그대로 비교하므로 그대로 둔다.
- O13 (지휘자 판단 — D의 질문): D가 `conversation/ipc.ts` resumeTarget 응답과 preload 타입에 세션 필드 하나를 더한다(별도 커밋).
- O4 (지휘자 판단 — T12 주의): runtime-test에서 `doan://`을 실제 `/Applications` 사본이 받으면 그 실행을 멈추고 사용자에게 묻는다(tasks T12).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | P1 문구, P2 `/design-draft` | `docs/features/terminal-agent-activity/design.md` '표시'·'Deep link' 문구, `.doan/canvases/` 새 초안 파일 | 없음 | Claude Opus medium — 문구와 초안 상태 판단, 기존 초안 규약을 지켜야 한다 | `doan check --repo .`, `doan ls --repo .`, 지휘자 초안 리뷰, 사용자 확인 | 통합됨 `8785f4d2`·`3e7d377d`, 수정 2라운드(`f361fbed`·`cac32215`, `9db60907` 외), 지휘자 리뷰 통과, 사용자 확정(D1~D3) |
| S | T1, T1b | `schema/app-socket.v3.schema.json`, `schema/fixtures/app-socket-v3/`, `schema/fixtures/open-link/cases.json`, `schema/embed.go`(필요하면), `app/src/formats/validate.ts`·테스트, `cli/internal/formats/validate.go`·테스트 | 없음 | Claude Sonnet medium — v2를 따라 하는 기계적인 형식 추가 | `go test ./...`, `npm --prefix app test` | 통합됨 `5175a113`·`bbbbf5f8`, 리뷰 RS(🟡1) → 수정 라운드 1 통합 `6df7027e` |
| C | T4b, T7 | `app/src/main/agentSetup/`, About의 agent setup 결과 표시(필요한 곳만), 테스트 | 없음 | Claude Opus high — 사용자의 `~/.claude/settings.json`을 고치므로 틀리면 사용자 설정을 잃는다. 규칙 문자열을 문서로 확인해야 한다 | `npm --prefix app test`, typecheck | 대기 |
| A | T2, T4c Go `canvasLink`, T5, T9 | `cli/internal/cli/work.go`(+새 Go 파일)·테스트, `cli/internal/cli/skill.md`·`skill_test.go`, CLI 명령 등록 파일 | S | Codex gpt-6-astra medium (O5) — 경로 판정(심볼릭 링크)과 오류 대응 표, 가이드 문구가 agent-eval 결과를 정한다 | `go test ./...`, `go vet ./...` | 통합됨 `f2cd335e`~`c86f62fb`(brand 커밋 중복 제외), 리뷰 RA(Claude Sonnet high) 진행 |
| B | T3, T4c TS `parseOpenLink`·링크 대기, T6, T8b main 쪽(`build.protocols`, `open-url`, 대기, 등록된 root·목록 확인, renderer로 보내기) | `app/src/main/` 새 활동 상태·deep link 모듈, `runtime.ts`, `index.ts`, `conversation/environment.ts`, `agentAuth/environment.ts`, `app/src/preload/index.ts`, `app/package.json` `build`, 테스트 | S | Codex gpt-6-astra medium (O5) — socket 인증 순서, 만료 타이머, 보안 경계(링크는 이동만)가 있다 | `npm --prefix app test`, typecheck, `npm --prefix app run package` 뒤 `Info.plist` `CFBundleURLTypes` | 대기 |
| D | T4, T8, T8b renderer 쪽(링크 이동, 프레임 이동, 거절 안내) | `app/src/renderer/`(`App.tsx`, `ShellSidebar.tsx`, `homeConversations.ts`, `conversationList.ts`, `agentIndicator.ts`, `CanvasAgent.tsx`, `CanvasConversationPanel.tsx` 등)·테스트, `styles.css` 해당 부분 | B, P(사용자 확인) | Claude Opus high — 표시 우선순위 합성과 worktree 함정(POSTMORTEM 2026-11-01) | `npm --prefix app test`, typecheck | 대기 |
| F | T10 `/agent-eval` | `eval/`(fake 앱 v3, `CheckContext.work()`, 새 시나리오·fixture·rubric), `docs/USABILITY-EVAL.md` | A, S | Codex gpt-6.1-sol high — 판단보다 절차(구현, self-test, 패키지, 실제 라운드)가 많다 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS, 실제 라운드에서 Claude·Codex 통과 | 1단계(eval 코드) 진행, 실제 라운드는 RA 수정 뒤 지휘자 허가 |
| G | T11 `/design-sync`, T12 `/runtime-test` | `docs/DESIGN.md`, 측정으로 생긴 UI 수정(소유 배치 D로 돌려보냄), `.scratch/` | B, C, D 통합 | Claude Opus medium — 실제 앱 격리 probe와 측정 판단 | 측정값·스크린샷·상태 로그 | 대기 |
| H | D4 추천 프롬프트 작은 크기로 되돌리기 | `HomeComposerView.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`의 `.suggestion`, 관련 테스트, 초안 4개(buzz-home·buzz-project·buzz-canvas-conversation·doan-mascot), `docs/DESIGN.md` 해당 행 | 없음 | Claude Sonnet medium — 속성 하나를 되돌리는 기계적인 수정 | `npm --prefix app test`, typecheck, `doan check --repo .` | 진행 중 |
| R* | 배치별 리뷰(RS, RC, RA, RB, RD, RF) | 보고만 | 각 배치 | 교차 모델 독립 리뷰: Claude가 구현한 배치(P·S·C·D)는 Codex gpt-6-astra medium, Codex가 구현한 배치(A·B·F)는 Claude Sonnet high | `/code-review` 보고 | 대기 |
| 지휘자 | P 초안 리뷰, T13, Z1 문서 승격 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `README.md`, 이 디렉터리 삭제 | 전부 | — | `verify.mjs --eval` 통과, `/doc-check` | 대기 |

## 초안 리뷰 (지휘자)

- 격리된 dev 앱(임시 HOME·userData, taa-P HEAD의 `.doan`·`app/src/renderer` 사본)에서 `terminal-agent-activity` 캔버스를 열어 네 프레임을 봤다. 실제 상태는 바뀌지 않았다(real-state 확인 통과). 근거: `.scratch/orch/draft/board.png`, `z-1.png`~`z-4.png`.
- spec·design의 상태 대응: 버튼 없는 notice(앱 대화 notice와 비교, 선택 힌트와 겹침), 사이드바 터미널 슬롯(캔버스 행 Codex, 접힌 프로젝트 행 Claude Code, 익명, 권한 요청이 이김), 비활성 'Terminal session'과 이유 줄(끝난 뒤 상태와 비교), deep link 거절 안내 세 가지. 빠진 상태는 없다. 같은 행에서 앱 대화가 이기는 경우와 앱 turn 뒤 전환은 shipped 모양이라 글로만 적었다.
- `doan check --repo .`: 오류 1·경고 12로 main과 같다(오류는 기존 `select-inspect.html`). `doan ls`: 프레임 4개.
- 수정 라운드 2 뒤 실제 앱에서 잰 높이: 터미널 notice 40(padding 4/16), 앱 notice 40(4/4/4/16), 선택 힌트 40(4/8/4/16).
- 확인하지 못한 것: 다크 테마 렌더링.

## 통합 기록

- S 수정 라운드 1과 A를 합친 HEAD에서 `go test ./cli/...` 통과. `npm --prefix app test`는 `thumbnails.test.ts` "the walk limit counts empty directories" 1건이 전체 실행에서 실패하고 단독 재실행에서 통과했다(워커 여럿이 도는 부하 중). 최종 `/verify`에서 다시 본다.

## 겹침과 순서

- 1파: P, S, C를 병렬로 시작한다. 셋은 파일이 겹치지 않는다(P는 문서·초안, S는 스키마·검증기, C는 agentSetup).
- 2파: S를 통합한 뒤 A(Go)와 B(app main)를 병렬로 시작한다. 파일이 겹치지 않는다.
- 3파: B 통합과 사용자의 초안 확인 뒤 D를 시작한다. A 통합 뒤 F를 시작한다.
- 4파: B·C·D 통합 뒤 G가 GUI probe를 돈다. F의 실제 라운드는 GUI를 쓰지 않으므로 G와 겹쳐도 된다.
- F 라운드에서 가이드를 고쳐야 하면 A가 고친다(`skill.md`는 A 소유).
- tasks 항목 대응: P1·P2→P, T1·T1b→S, T2→A, T3→B, T4→D, T4b→C, T4c→A(Go)+B(TS), T5→A, T6→B, T7→C, T8→D, T8b→B(main)+D(renderer), T9→A, T10→F, T11·T12→G, T13·Z1→지휘자.
