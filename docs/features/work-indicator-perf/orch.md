# work-indicator-perf 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261111](../chain-261111/chain.md) 링크 3. conductor는 Claude Code이고, 워커도 Claude 모델만 쓴다.
- 시작 hash: `4dbc7cc7`(PR #167 병합 뒤 develop). 통합 브랜치: `feat/work-indicator-perf`.
- 공유 증거 위치: conductor checkout의 `.scratch/work-indicator-perf/`(절대 경로 `/Users/sinhyeokkang/orca/workspaces/doan-design/work-indicator-perf-orch/.scratch/work-indicator-perf/`). probe `measure.mjs`와 화면 baseline `baseline/`을 여기 두고, 모든 배치가 이 경로를 쓴다. probe는 측정할 앱 디렉터리(`app/out` 빌드 산출물을 가진 worktree)를 인자로 받는다.

## 결정 기록

- conductor 판단 — chain.md 상시 권한·운영 메모: 측정 전 conductor가 `caffeinate -dimsu`를 백그라운드로 띄우고 재측정 뒤 끈다. 사용자가 같은 머신에서 일하므로 반복 측정(중앙값과 범위)과 load average를 함께 남긴다.
- conductor 판단 — design 'PoC' 1: `.scratch/flicker/probe3.mts`는 이 머신에 없다. P 배치가 design의 기록(main 핸들러 대체로 스트리밍 흉내)으로 다시 만든다.
- conductor 판단 — PR #167 인계: 기준선은 버디가 있는 develop(`4dbc7cc7`)에서 잰다. 작업 표시의 픽셀 비교에서는 reduced motion으로 버디를 멈추거나 `.docked-buddy-slot` 영역을 가린다. 성능 측정 표에는 버디가 켜진 상태와 멈춘 상태를 함께 적어 버디 비용(renderer Task 약 53–57 ms/s)을 나눌 수 있게 한다.
- conductor 판단 — PR #167 인계: 대화 패널에 거는 `contain`·`content-visibility`는 입력창 위 88px 버디 창과 툴바 위 버디를 자르지 않아야 한다. B 배치의 픽셀 비교 항목에 넣는다.
- conductor 판단 — chain.md 링크 1 인계: 마커와 그라디언트 레이어는 부모 overlay에 둔다(iframe 안은 16384 device px 경계). 2W×2H 그라디언트는 2W×DPR 96000 device px까지 크기 탈락이 없었으나, 큰 면적에서 1–4프레임 덜 그려진 변형이 있었으므로 B 배치는 큰 확대에서 이것을 drift로 보고 design의 대안(보이는 영역으로 자르기)을 먼저 검토한다.
- 사용자 결정(lead 경유): probe는 되도록 백그라운드로 돌린다. 격리 앱 창은 포커스를 가져가지 않고(`showInactive`, `app.focus` 없음) 사용자 창 뒤나 작업 영역 밖에 두며, 실행 중 앞으로 올리지 않는다. 가려진 창도 렌더하도록 `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`, `--disable-background-timer-throttling`으로 띄운다. 백그라운드 수치를 믿기 전에 잠깐 보이는 창과 그린 프레임/s·측정값이 같은지 한 번 확인하고 PR 본문에 남긴다. 스크린샷과 녹화는 `webContents.capturePage`·CDP로 한다. 창이 앞에 있어야 하는 측정은 사용자에게 먼저 묻고 짧게 한다. 모든 브리프에 `briefs/background-probe.md`로 넣는다.
- 사용자 결정: P의 visible-check를 바로 돌린다. 격리 앱 창이 약 2분 동안 작업 영역 왼쪽 위에 보이고, 포커스는 가져가지 않는다.
- conductor 판단 — 실제 사용자 상태 점검의 예외(P 질문): 아래 예외 밖의 키는 모두 엄격하게 본다.
  - `~/.gemini/antigravity-cli`: 같은 실행에 probe 임시 경로가 없는 새 `log/cli-*.log`가 생겼을 때만, 그 디렉터리 메타데이터와 `cache/`·`crashes/`의 변경을 허용한다. 근거는 PR #167이 본 같은 외부 쓰기다.
  - 실제 userData의 `ui-state.json`·`conversations`·`agent-auth`: probe의 자식이 아닌 Doan 프로세스가 도는 동안에만 변경을 허용한다. 그 프로세스의 pid와 시작 시각을 기록한다.
  - probe는 매 실행마다 userData·HOME·DOAN_RUNTIME이 임시 디렉터리 아래인지, PATH가 제한됐는지 기록한다. 사용자에게 Doan 종료를 요청하지 않는다.
- 기록: Electron 45에는 `webContents.incrementCapturerCount`가 없다(TypeError). 그래서 P는 픽셀 모드를 앱의 `--doan-launch=background`(숨긴 창, 포커스 없음)로 띄우고, probe 안에서 `window:visible` 응답을 대체했다. 이때 rAF는 60/s로 돈다. 규칙이 시행되기 전(10:45 전)의 짧은 실행 약 10회는 창을 보이고 포커스를 가져갔다.
- conductor 판단 — tasks 3: 링크 1(`frame-first-selection`)의 재로드 회귀 테스트는 `CanvasController.test.ts` 'working-frame marker' › "stays on its frame through repeated reloads without hiding or restarting, and lands on the new layout without the slide"이다(`8286c893`).
- conductor 판단 — 측정 간섭: 성능 수치(P, M)는 다른 워커의 빌드·테스트가 돌지 않을 때만 잰다. 구현 배치 A·B·C는 병렬로 돌리되, GUI probe는 conductor가 한 번에 하나씩 허락한다. 픽셀 비교는 애니메이션 시점을 고정하므로 부하에 영향받지 않는다.

## 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | 1(PoC 기준선·요소별 비용·baseline·그라디언트 위험) | `.scratch/work-indicator-perf/`(conductor checkout), tasks.md 'PoC 결과' | 없음 | Opus high — tracing 해석, 격리, `yes` PID 관리, 시제품 판단이 필요하다 | probe가 두 조건 수치 출력, 실제 사용자 상태 비교 통과, `yes` PID 잔존 0 | 진행 중(worktree `wip-p`, dispatch `ctx_d7c11a1267d5`) |
| (conductor) | 2(사용자 공유) | tasks.md 2 | P | — | 공유 요약을 tasks.md에 기록 | 대기 |
| A | 3의 점 필드 테스트, 4, 5 | `agentIndicator.ts`·`.test.ts`, `dotField.ts`·`.test.ts`, 새 Worker 진입점, `CanvasAgent.tsx`, `rendererImports.test.ts`, 필요하면 `electron.vite.config.*` | P | Opus high — Worker·OffscreenCanvas·CSP·빌드 산출물 확인, 상태 전환 메시지 설계 | typecheck·lint·test, 빌드 산출물에서 Worker·CSP 확인, 픽셀 채널 차 ≤2, fill 호출 수 | 대기 |
| B | 3의 마커 테스트, 6, 8 | `styles.css`, `CanvasController.ts`(`drawWork`), `CanvasController.test.ts` 'working-frame marker', 보드 글로우·알림 열·대화 패널 컨테이너의 CSS | P | Opus high — drift 0 가드레일, 상태 규칙 옮기기, 큰 확대 레이어 위험 | typecheck·lint·test, tasks 6·8 픽셀 비교 전부 채널 차 ≤2, 멈춘 상태 Paint 0, 버디 창 잘림 없음 | 대기 |
| C | 3의 스트리밍 테스트, 7 | `conversationStore.ts`·테스트, `ConversationThread.tsx`(스트리밍 반영만) | P | Opus medium — 범위가 좁지만 캐럿 위치 회귀(POSTMORTEM 2026-11-07)가 있다 | typecheck·lint·test, 40ms delta probe에서 프레임당 반영 ≤1, 최종 텍스트·캐럿 위치 동일 | 대기 |
| R-A·R-B·R-C | 각 배치 `/code-review` | 보고만 | 해당 배치 | Opus high(A·B), Opus medium(C) — diff 난이도에 맞춘다 | 🔴 0 | 대기 |
| M | 9(재측정) | `.scratch/work-indicator-perf/`, tasks.md 'PoC 결과' 아래 재측정 | A·B·C 통합 | Opus high — 남은 원인 판단과 추가 수단 탐색 | 같은 조건 결과 표, 녹화 빠진 프레임 수, verify PASS | 대기 |
| (conductor) | 10(승격과 삭제) | DESIGN.md, ARCHITECTURE.md(Worker를 쓰면), feature 디렉터리 삭제 | M | — | 문서 diff 검토, verify PASS | 대기 |

## 파일 겹침과 순서

- P → (2) → A·B·C 병렬 → 리뷰 → 통합 → M → 10.
- A·B·C의 파일은 겹치지 않는다. B의 대화 패널 `contain`은 `styles.css`에만 쓰고, C는 `ConversationThread.tsx`의 스트리밍 반영만 바꾼다. C가 스레드 컨테이너 클래스를 바꿔야 하면 conductor에게 먼저 묻는다.
- tasks.md는 P와 M만 쓴다(‘PoC 결과’). 구현 배치는 결과를 handoff 파일에 쓰고, conductor가 통합 때 옮긴다.
- 9번에서 빠진 프레임이 0이 아니거나 줄지 않은 요소가 있어 수단을 더하면, 그 코드 변경은 소유 배치(A·B·C)에 새 Task로 보낸다.
