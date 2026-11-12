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
- 사용자 결정 — 실제 사용자 상태 점검의 예외(P 질문에서 conductor가 정하고 사용자가 모두 승인했다. Antigravity 로그 예외는 lead를 거쳐 chain.md에도 기록됐다): 아래 예외 밖의 키는 모두 엄격하게 본다.
  - `~/.gemini/antigravity-cli`: 같은 실행에 probe 임시 경로가 없는 새 `log/cli-*.log`가 생겼을 때만, 그 디렉터리 메타데이터와 `cache/`·`crashes/`의 변경을 허용한다. 근거는 PR #167이 본 같은 외부 쓰기다.
  - 실제 userData의 `ui-state.json`·`conversations`·`agent-auth`: probe의 자식이 아닌 Doan 프로세스가 도는 동안에만 변경을 허용한다. 그 프로세스의 pid와 시작 시각을 기록한다.
  - 실제 userData의 `runtime.json`: 같은 실행 안에서 probe의 자식이 아닌 Doan 프로세스가 새로 시작됐다는 기록(pid, 시작 시각)이 있을 때만 변경을 허용한다. 근거는 16:20:25 사용자의 Doan이 재시작하며 runtime.json을 다시 쓴 일이다(B의 marker-cost 실행 중).
  - 키체인: 바뀐 항목의 서비스가 모두 `doan*`이 아니고 `gemini`나 `Antigravity*`일 때만 허용한다. `Claude Code-credentials*`·`Codex*` 항목의 변경은, probe의 제한 PATH에서 `claude`·`codex`를 찾을 수 없음을 같은 실행에 기록했을 때만 허용한다(이 머신의 다른 세션이 토큰을 갱신한다). `doan*` 항목이 바뀌면 실패다. 서비스와 수정 시각만 기록하고, 계정이나 비밀값은 기록하지 않는다.
  - probe는 매 실행마다 userData·HOME·DOAN_RUNTIME이 임시 디렉터리 아래인지, PATH가 제한됐는지 기록한다. 사용자에게 Doan 종료를 요청하지 않는다.
- 기록: Electron 45에는 `webContents.incrementCapturerCount`가 없다(TypeError). 그래서 P는 픽셀 모드를 앱의 `--doan-launch=background`(숨긴 창, 포커스 없음)로 띄우고, probe 안에서 `window:visible` 응답을 대체했다. 이때 rAF는 60/s로 돈다. 규칙이 시행되기 전(10:45 전)의 짧은 실행 약 10회는 창을 보이고 포커스를 가져갔다.
- 기록: 2026-11-12 lead가 링크 3 중단을 지시했다가 곧 취소했다(릴리스만 링크 2에서 끊고 링크 3은 계속한다). 그 사이 A·B·C 워커를 멈췄다. A·B는 커밋하지 않은 작업을 WIP 커밋으로 보존했다(`b8bd059d`, `8f8b1f23`, 검증 전). 세 batch 브랜치와 `SinhyeokKang/wip-p`를 push했다. 증거 사본을 develop checkout의 `.scratch/work-indicator-perf/`에 두었다. 같은 worktree에서 새 dispatch로 다시 시작했다.
- 사용자 결정 — tasks 7: C의 프레임 묶기(`9b05e7a4`, 검증 PASS·픽셀 동일)는 40ms 스트림 비용을 줄이지 못했다. 기존 `useFrameText`가 이미 프레임당 한 번만 반영하기 때문이다. 그래서 통합하지 않는다. tasks 7을 '스레드 항목 메모화'로 다시 계획한다. App 전체 재렌더를 막는 대화별 구독은 위험과 범위가 커서 넣지 않는다. C의 파일 소유에 `ConversationThread.tsx` 전체와 `threadItems.ts`를 더한다.
- conductor 판단 — R-C D2: 원래 tasks 7에서는 "프레임당 반영 1회 이하"와 "턴 종료 즉시 반영"이 같은 프레임에서 충돌했다. design의 "지연 없이"를 따라 즉시 반영을 예외로 봤다. 묶기를 빼서 지금은 해당하지 않는다.
- 사용자 결정 — 디스플레이: 15:57쯤 LG 4K(60 Hz) 모니터가 빠져 내장 디스플레이(120 Hz)만 남았다. 바꾸지 않은 빌드도 기존 baseline과 채널 차가 약 14 났다. 사용자는 내장 디스플레이로 계속하기로 했다. conductor가 바꾸지 않은 빌드(`d5467032`, `1955bc28`과 앱 코드 동일)로 내장 디스플레이에서 `baseline/`과 `noise-1..3`을 다시 찍었다. 기존 것은 `baseline-lg60/`에 남겼다. 이후 픽셀 비교와 성능 측정은 모두 내장 디스플레이에서 한다. 성능의 before/after는 같은 세션에서 나란히 잰다(P의 perf3는 60 Hz라 직접 비교하지 않는다).
- conductor 판단 — tasks 3: 링크 1(`frame-first-selection`)의 재로드 회귀 테스트는 `CanvasController.test.ts` 'working-frame marker' › "stays on its frame through repeated reloads without hiding or restarting, and lands on the new layout without the slide"이다(`8286c893`).
- conductor 판단 — 측정 간섭: 성능 수치(P, M)는 다른 워커의 빌드·테스트가 돌지 않을 때만 잰다. 구현 배치 A·B·C는 병렬로 돌리되, GUI probe는 conductor가 한 번에 하나씩 허락한다. 픽셀 비교는 애니메이션 시점을 고정하므로 부하에 영향받지 않는다.

## 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | 1(PoC 기준선·요소별 비용·baseline·그라디언트 위험) | `.scratch/work-indicator-perf/`(conductor checkout), tasks.md 'PoC 결과' | 없음 | Opus high — tracing 해석, 격리, `yes` PID 관리, 시제품 판단이 필요하다 | probe가 두 조건 수치 출력, 실제 사용자 상태 비교 통과, `yes` PID 잔존 0 | 완료, 통합 `0671195a`(워커 `ecdbc0b4`). 워커 해제, worktree 삭제, 브랜치 `SinhyeokKang/wip-p` 보존 |
| (conductor) | 2(사용자 공유) | tasks.md 2 | P | — | 공유 요약을 tasks.md에 기록 | 완료 |
| A | 3의 점 필드 테스트, 4, 5 | `agentIndicator.ts`·`.test.ts`, `dotField.ts`·`.test.ts`, 새 Worker 진입점, `CanvasAgent.tsx`, `rendererImports.test.ts`, 필요하면 `electron.vite.config.*` | P | Opus high — Worker·OffscreenCanvas·CSP·빌드 산출물 확인, 상태 전환 메시지 설계 | typecheck·lint·test, 빌드 산출물에서 Worker·CSP 확인, 픽셀 채널 차 ≤2, fill 호출 수 | 진행 중(worktree `wip-a`, 재시작 dispatch `ctx_2e16905bcecc`) |
| B | 3의 마커 테스트, 6, 8 | `styles.css`, `CanvasController.ts`(`drawWork`), `CanvasController.test.ts` 'working-frame marker', 보드 글로우·알림 열·대화 패널 컨테이너의 CSS | P | Opus high — drift 0 가드레일, 상태 규칙 옮기기, 큰 확대 레이어 위험 | typecheck·lint·test, tasks 6·8 픽셀 비교 전부 채널 차 ≤2, 멈춘 상태 Paint 0, 버디 창 잘림 없음 | 진행 중(worktree `wip-b`, 재시작 dispatch `ctx_ce79e627029f`) |
| C | 7(스레드 항목 메모화, 테스트 포함) | `ConversationThread.tsx`, `threadItems.ts`와 그 테스트 | P | Opus medium — 범위가 좁지만 캐럿 위치 회귀(POSTMORTEM 2026-11-07)가 있다 | typecheck·lint·test, 40ms delta probe에서 프레임당 반영 ≤1, 최종 텍스트·캐럿 위치 동일 | 진행 중(worktree `wip-c`, 재시작 dispatch `ctx_31a25c340a6d`) |
| R-A·R-B·R-C | 각 배치 `/code-review` | 보고만 | 해당 배치 | Opus high(A·B), Opus medium(C) — diff 난이도에 맞춘다 | 🔴 0 | 대기 |
| M | 9(재측정) | `.scratch/work-indicator-perf/`, tasks.md 'PoC 결과' 아래 재측정 | A·B·C 통합 | Opus high — 남은 원인 판단과 추가 수단 탐색 | 같은 조건 결과 표, 녹화 빠진 프레임 수, verify PASS | 대기 |
| (conductor) | 10(승격과 삭제) | DESIGN.md, ARCHITECTURE.md(Worker를 쓰면), feature 디렉터리 삭제 | M | — | 문서 diff 검토, verify PASS | 대기 |

## 파일 겹침과 순서

- P → (2) → A·B·C 병렬 → 리뷰 → 통합 → M → 10.
- 브리프: `.scratch/work-indicator-perf/briefs/`(`common.md`, `A.md`, `B.md`, `C.md`, `background-probe.md`). GUI probe는 워커가 `ask`로 슬롯을 받아 한 번에 하나만 돌리고, perf 모드는 다른 GUI probe 없이 혼자 돈다.
- M은 바꾸기 전 빌드(`1955bc28`)와 바꾼 빌드를 같은 세션·같은 창 위치·같은 디스플레이(60 Hz 메인)에서 나란히 다시 잰다. 기준선 perf3는 창 일부가 보이는 위치에서 쟀고(P handoff), 그 위치에 따라 수치가 달라질 수 있기 때문이다.
- A·B·C의 파일은 겹치지 않는다. B의 대화 패널 `contain`은 `styles.css`에만 쓰고, C는 `ConversationThread.tsx`의 스트리밍 반영만 바꾼다. C가 스레드 컨테이너 클래스를 바꿔야 하면 conductor에게 먼저 묻는다.
- tasks.md는 P와 M만 쓴다(‘PoC 결과’). 구현 배치는 결과를 handoff 파일에 쓰고, conductor가 통합 때 옮긴다.
- 9번에서 빠진 프레임이 0이 아니거나 줄지 않은 요소가 있어 수단을 더하면, 그 코드 변경은 소유 배치(A·B·C)에 새 Task로 보낸다.
