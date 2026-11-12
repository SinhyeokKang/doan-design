# 체인 261111

같은 이름의 이전 체인(frame-first-selection, canvas-activity-notices)은 `ccd268c6`에서 삭제됐다. 이 파일은 새 체인이다.

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

## 순서

직렬 체인이다. 링크 2는 링크 1이 병합된 뒤, 링크 3은 링크 2가 병합된 뒤 시작한다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1. `canvas-rendering-stability` | [spec](../canvas-rendering-stability/spec.md) · [design](../canvas-rendering-stability/design.md) · [tasks](../canvas-rendering-stability/tasks.md) | `/feature-review` 완료(`1acd4dd4`까지). 새 화면이 없어 초안 없음 | 대형 캔버스 그래픽 깨짐의 원인(GPU 타일·메모리, 합성, 레이아웃)을 먼저 확인한다. 2026-11-11 녹화의 작업 중 레이어 누락도 skillflo의 큰 캔버스 위에서 일어나, 같은 원인을 공유할 수 있다 |
| 2. `buddy-docked-motion` | [spec](../buddy-docked-motion/spec.md) · [design](../buddy-docked-motion/design.md) · [tasks](../buddy-docked-motion/tasks.md) | `/feature-review` 완료(`bd02429d`). 초안 `.doan/canvases/buddy-docked-motion.html` 수정본(`5e7d0e35`, 클릭 결정 `97422347`) 사용자 확인 완료 | 긴 GUI 측정이 없다(짧은 `/design-sync`·`/runtime-test` probe뿐). 화면을 오래 켜 둘 수 없는 머신에서 먼저 돈다(사용자 결정, 2026-11-12). 대화 패널에 움직이는 WebGL 버디를 더하므로, 링크 3은 버디가 있는 앱을 기준으로 잰다 |
| 3. `work-indicator-perf` | [spec](../work-indicator-perf/spec.md) · [design](../work-indicator-perf/design.md) · [tasks](../work-indicator-perf/tasks.md) | `/feature-review` 완료(`bb2c44ec`). 새 화면이 없어 초안 없음 | 합성 레이어를 새로 만드는 변경이다. 링크 1의 PoC가 밝힌 GPU 메모리·타일 한계로 레이어 수와 크기를 정한다. PoC와 재측정 동안 화면이 켜져 있어야 해서 마지막에 둔다 |

**직렬 판단**: 링크 1과 `work-indicator-perf`는 모두 `app/src/renderer/CanvasController.ts`와 보드·overlay 렌더링(`styles.css`, `canvasView.ts`, `viewport.ts`)을 건드릴 수 있다. `buddy-docked-motion`은 두 링크와 `styles.css`에서 겹치고, `work-indicator-perf`와는 대화 패널(`ConversationThread.tsx` 주변 레이아웃, `contain`)과 측정 기준선에서 겹친다. 사용자가 `buddy-docked-motion`을 직렬로 붙였고(2026-11-11), 화면을 켜 둬야 하는 `work-indicator-perf`를 마지막으로 옮겼다(2026-11-12).

**링크 2 → 링크 3 인계**: 링크 2(`buddy-docked-motion`) conductor는 PR 본문에 다음을 남긴다.
- 버디 레이어 구조(입력창 위 88px 클립 창, 툴바 슬롯, WebGL 캔버스 하나)와 소유·dispose 규칙.
- probe에서 버디를 멈추거나 숨기는 방법(reduced motion 말고 다른 방법이 있으면 그것). 링크 3은 작업 표시의 픽셀 비교에서 버디를 멈추거나 그 영역을 가려야 한다.
- 실제 앱에서 잰 버디의 프레임 비용(측정한 값만).

링크 3(`work-indicator-perf`)은 버디가 있는 앱을 기준선으로 잰다. 대화 패널에 거는 `contain`·`content-visibility`가 버디의 88px 클립 창과 툴바 위 버디를 자르지 않는지 확인한다.

**링크 1 → 링크 3 인계**: 링크 1 conductor는 PR 본문에 다음을 남긴다. lead가 병합 때 아래 '인계 기록'에 옮긴다. 이 인계는 `work-indicator-perf`를 위한 것이다(순서가 바뀌어 링크 3).
- 확인한 원인과 GPU 메모리·타일·레이어 크기에 관한 측정.
- `work-indicator-perf`의 합성 레이어 계획(특히 큰 확대에서 2W×2H 그라디언트 레이어)에 걸리는 제약.

## 시작 점검

lead는 링크 1 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 남긴다. 승인 뒤 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **링크 1의 자료**: 링크 1 tasks 1은 사용자에게 원본 캔버스와 Export HTML을 받는다고 적었다. 대신 실제 앱에 등록된 `/Users/sinhyeokkang/code/skillflo/skillflo-web/.doan/`의 캔버스를 쓴다(사용자 제안). 의존 파일(`tokenCss` `.doan/assets/sf-ds/tokens.css` 등)까지 `.doan/`을 격리 위치로 복사한다. Export HTML은 복사본에서 설치된 `doan export`로 만든다. 원본 프로젝트는 읽기만 한다.
2. **재현할 캔버스와 동작**: 어떤 캔버스에서 어떤 동작(확대, 이동, 배율, 창 크기)을 할 때 무엇이 깨지는지 사용자가 대화로 알려준다. 큰 후보는 `enrollment-mobile-category-flow`(41프레임, 폭 2800), `partner-course-by-member`(23프레임, 폭 6500), `partner-member-search-flow`(폭 9600), `enrollment-filter-scroll-reveal`(폭 7672)이다.
3. **회사 프로젝트 자료 취급**: 복사본과 스크린샷은 develop checkout의 `.scratch/` 아래에만 둔다. 커밋하지 않고, 외부 서비스로 보내지 않는다. PR 본문과 feature 문서에는 캔버스 내용 없이 이름, 크기, 프레임 수, 측정값만 적는다.
4. **사용자 참여 방식**: 사용자는 대화로만 답한다. 로그인이나 머신 앞에서 하는 수동 조작은 하지 않는다. 링크 1의 개선 기준 합의와 원인 미확정 시 중단 판단은 conductor가 대화로 묻는다.
5. **측정 조건**: 사용자가 같은 머신에서 일하는 중에 측정할 수 있다. 화면은 켜져 있고 잠기지 않는다고 본다. 격리 앱 창이 사용자 화면에 뜬다. 다른 작업 부하가 섞이므로 반복 측정(중앙값과 범위)과 통제된 `yes` 부하로 보정하고, 측정 때 load average를 함께 기록한다.

**링크 2(`buddy-docked-motion`) 시작 전 점검**(lead가 확인하고 '인계 기록'에 남긴다):
1. 사용자가 앱에서 초안 수정본을 확인했다(완료, 2026-11-11). 대기 중 이동 간격 60–120초와 클릭 결정 14를 포함한다.
2. 링크 2 conductor는 tasks 2부터 시작한다. tasks 1(초안)은 develop에서 끝났다.

## 상시 권한

- lead는 각 링크의 PR을 검토와 게이트 통과 뒤 링크 순서대로 develop에 병합하고, 다음 링크를 시작한다.
- conductor 런타임은 Claude Code다. 모델 계열을 넘는 워커는 허가되지 않았다.

## 진행 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기는 `/orchestrate` §2의 백그라운드 감시 루프를 쓴다. 메일함을 소비하지 않는다.
- 세 링크 모두 로그인이 필요 없다.
- `/agent-eval`:
  - 링크 1은 export 코드(`cli/internal/export/viewer/`)를 바꾸면 CLI 출력에 해당하므로 마지막 통합 전에 실행한다. 바꾸지 않으면 해당하지 않는다.
  - 링크 2(`buddy-docked-motion`)는 해당하지 않는다(CLI 출력, 가이드, `doan check`, 스킬 stub을 바꾸지 않는다).
  - 링크 3(`work-indicator-perf`)은 해당하지 않는다.
- 링크 2는 `/design-sync`·`/runtime-test`의 짧은 GUI probe 동안만 화면이 켜져 있으면 된다.
- 링크 3은 PoC와 재측정 동안 화면이 켜져 있고 잠기지 않아야 한다. 링크 3 conductor는 측정 전에 `caffeinate`로 잠자기를 막는다. 직접 잠그거나 덮개를 닫으면 측정이 멈춘다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1. `canvas-rendering-stability` | `canvas-rendering-stability-orch` (Claude conductor). 이전 머신에서 시작, 새 머신에서 재개. worktree 삭제됨 | 2026-11-11, `5676decd`. 재개 `12ddcfa8` | [#164](https://github.com/SinhyeokKang/doan-design/pull/164), 병합 `ea637516` | 병합 |
| 2. `buddy-docked-motion` | `buddy-docked-motion-orch` (Claude conductor). worktree 삭제됨 | 2026-11-12, `e37a35fb` | [#167](https://github.com/SinhyeokKang/doan-design/pull/167), 병합 `4dbc7cc7` | 병합 |
| 3. `work-indicator-perf` | `work-indicator-perf-orch` (Claude conductor), 이 머신 `/Users/sinhyeokkang/orca/workspaces/doan-design/work-indicator-perf-orch` | 2026-11-12, `4dbc7cc7` | | 진행 중 |

## 인계 기록

- 2026-11-11 lead(develop checkout): 사용자 요청으로 체인 파일을 작성했다. 시작 점검 승인 뒤 링크 1을 시작한다.
- 2026-11-11 lead: 시작 점검 2 답. 큰 캔버스 대부분에서 깨진다. 최초 렌더링 때 오른쪽이 잘리고, 확대·축소를 빠르게 하거나 좌표를 마구 움직이면 깨진다. 시작 시점은 사용자가 알려준다. 나머지 시작 점검(1·3·4·5)은 그때 확인한다.
- 2026-11-11 lead: 시작 점검 1·3·4·5를 사용자가 모두 승인했다. 자료는 `skillflo-web/.doan/` 복사본을 쓰고 Export는 복사본에서 `doan export`로 만든다. 복사본과 스크린샷은 develop checkout의 `.scratch/canvas-rendering-stability/`에만 두고 커밋·외부 전송은 하지 않는다. 사용자는 대화로만 참여한다. 사용자가 일하는 동안 측정한다. 링크 1을 `5676decd`에서 시작했다.
- 2026-11-11 lead: 사용자 지시. 두 링크 모두 그래픽 깨짐·렌더링 버그 수정뿐 아니라 앱 자체의 최적화도 목표다. 시각적 drift가 없는 범위에서 렌더링 비용(첫 렌더링, 빠른 확대·축소, 마구잡이 이동, 메인 스레드·합성·래스터·GPU 메모리·레이어 수·무효화 범위)을 측정하고 줄이며, PR 본문에 전후 수치를 남긴다. ARCHITECTURE 구조 결정을 바꿔야 하면 사용자에게 먼저 묻는다. 링크 1 conductor에게 전달했고, 링크 2 브리프에도 넣는다.
- 2026-11-11 lead: 사용자 결정(LOD). (1) 움직이는 동안 LOD 허용: 확대·이동 중에는 다시 그리지 않고 기존 래스터를 늘려 보여 주며 잠깐 흐려져도 된다. 멈춘 화면은 이전과 픽셀이 같아야 한다. (2) 축소 배율 스냅샷 LOD는 보수적으로 허용: 모자이크처럼 깨져 보이면 안 된다. 스냅샷은 표시되는 장치 픽셀 해상도 이상으로 만들고, 그 배율에서 실제 렌더와 같아 보여야 하며, hover·선택·Picker·캡처처럼 실제 DOM이 필요한 동작 전에 돌아와야 한다. ARCHITECTURE §3 렌더링 규칙을 바꿔야 하면 사용자에게 먼저 묻는다. (3) 캔버스 문서 안의 화면 밖 생략은 레이아웃이 바뀌지 않을 때만 쓴다. 링크 1 conductor에게 전달했고 링크 2에도 같은 규칙을 적용한다.
- 2026-11-11 lead: **다른 머신으로 인계.** 사용자가 체인 전체를 다른 머신에서 이어 가기로 했다. 이 머신은 잠겨 GUI probe가 멈췄다.
  - 링크 1 상태: P(원인 C1·C2)와 P2(부하 비교)는 끝났다. F(C1 수정)는 배치 브랜치 `SinhyeokKang/crs-fix`에 커밋 두 개(`3c2c4c2b` 테스트, `e341d3e3` 수정)가 있다. conductor 계획은 F를 `feat/canvas-rendering-stability`에 cherry-pick하고, P·P2·F 측정 요약과 남은 작업을 orch.md에 적고, 브랜치를 push한 뒤 워커를 정리하고 멈추는 것이다. 기록 시점 원격 `feat/canvas-rendering-stability` tip은 `91c57304`(F 통합 전)이다.
  - 전달 실패: lead가 보낸 추가 지시(배치 브랜치 `crs-fix`·`crs-poc` push, orch.md에 probe 재현 절차 기록, PR은 아직 열지 않음)는 conductor 터미널이 입력을 받지 않아 전달되지 않았다. 새 머신은 원격에 F 커밋이 있는지 먼저 확인한다. 없으면 이 머신의 로컬 브랜치 `SinhyeokKang/crs-fix`에만 있으므로 이 머신에서 push해야 한다.
  - 새 머신에 남은 일(링크 1): F 완료 조건 4(C2 전후 4–5회 측정)와 5(`/runtime-test` probe), 독립 리뷰 R, 최적화 O1·O2(위 LOD 결정과 최적화 목표 적용), `/agent-eval`(export 변경), 문서 작업 7, PR.
  - 옮겨지지 않는 것: probe 스크립트, skillflo 복사본, 측정 원본, `.scratch/flicker/` 증거(work-indicator-perf design이 `.scratch/flicker/probe3.mts`를 참조한다)는 이 머신의 `.scratch/`에만 있다. 새 머신은 skillflo-web `.doan/`을 자기 `.scratch/`에 다시 복사하고 probe를 orch.md 기록으로 다시 만든다. 이 파일의 절대 경로(`/Users/sinhyeokkang/...`)는 새 머신에 맞게 확인한다.
  - 새 머신 시작: develop checkout에서 lead 세션을 열고 이 파일을 읽는다. 링크 1은 새로 시작하지 않고 원격 `feat/canvas-rendering-stability`를 체크아웃한 worktree에서 conductor가 orch.md를 읽고 `/orchestrate docs/features/canvas-rendering-stability/`를 이어 간다. 링크 2는 링크 1 병합 뒤 시작한다.
- 2026-11-11 lead: 링크 1 conductor가 이 머신에서 할 수 있는 만큼 마치고 멈췄다. 원격 `feat/canvas-rendering-stability` tip은 `12ddcfa8`이다. F 통합 커밋은 `85879e1b`·`22b4d776`·`c36a2961`이고, 배치 브랜치 `SinhyeokKang/crs-fix`도 원격에 있다. `crs-poc`는 커밋이 없어 push하지 않았다. 측정 요약과 남은 일 10가지는 그 브랜치 orch.md '머신 이전 인계'에 있다. C1 지속 잘림은 앱 세 레이아웃, Export Electron 창, Chrome 157에서 5회 모두 0이 됐다.
  - 새 머신에서 사용자 결정이 필요한 것: 모서리 AA 차이(앱 최대 3/255, Export 최대 4/255, AA 가장자리에서만)를 '같은 픽셀'로 볼지.
  - 미판정: C2 Export 빈 프레임 비율 최대가 수정 전 0.182, 수정 후 0.187이다. 수정 후 표본이 2개라 회귀인지 잡음인지 가르지 못했다.
- 2026-11-11 lead(새 머신, develop checkout `/Users/sinhyeok/code/doan-design`): **체인을 인수했다.**
  - 원격 상태를 확인했다. `feat/canvas-rendering-stability`의 tip은 `12ddcfa8`이고, `SinhyeokKang/crs-fix`도 원격에 있다.
  - 사용자 결정: C1 수정 뒤 모서리 AA 차이(앱 최대 3/255, Export 최대 4/255, AA 가장자리에서만, 8/255 초과 0)를 '같은 픽셀'로 본다. 링크 1 기준 ②의 허용치로 쓴다.
  - 새 머신의 경로: 홈은 `/Users/sinhyeok`이고, skillflo 원본은 `/Users/sinhyeok/code/skillflo/skillflo-web/.doan`이다. 이 머신의 원본에는 `config.json`만 있고 캔버스가 없다. 자료 위치는 conductor가 사용자에게 확인한다.
  - 링크 1 conductor를 새 worktree `canvas-rendering-stability-orch`(원격 브랜치 체크아웃)에서 다시 띄웠다. 브리프에 위 결정, 새 경로, origin/develop을 병합한다는 것(rebase 금지)을 넣었다.
- 2026-11-11 lead: 사용자 요청으로 `buddy-docked-motion`을 링크 3으로 붙였다. lead가 링크 2와의 병렬을 검토했다. 코드는 `styles.css`와 대화 패널에서만 겹치지만, 링크 2의 측정 기준선(대화 패널 픽셀·빠진 프레임)과 버디가 충돌한다. 사용자는 직렬을 택했다. `/feature-review`는 끝났고, 초안 수정본(`5e7d0e35`)은 독립 검수에서 막는 문제가 없었으며 사용자 앱 확인을 기다린다.
- 2026-11-11 lead: 링크 3 시작 전 점검 1 완료. 사용자가 초안 수정본(`5e7d0e35`)과 대기 중 이동 간격 60–120초를 그대로 확인했다.
- 2026-11-11 lead: 사용자 요청으로 링크 3에 결정 14(버디 클릭 시 숨었다가 다른 표면이나 같은 표면의 새 x로 이동, 그려진 몸만 클릭, 포인터만)를 더했다. 초안(`97422347`)과 feature 문서에 반영했다.
- 2026-11-12 lead: 사용자 결정으로 링크 2와 3의 순서를 바꿨다. 링크 2는 `buddy-docked-motion`, 링크 3은 `work-indicator-perf`다. 이유: `work-indicator-perf`는 PoC와 재측정 동안 화면이 켜져 있어야 한다. 링크 2부터는 다음 머신에 인계한다. 링크 1 병합 뒤 lead가 인계 항목을 정리한다. 이 항목 전의 기록에서 '링크 2'는 `work-indicator-perf`, '링크 3'은 `buddy-docked-motion`을 가리킨다. 최적화 목표와 LOD 결정은 `work-indicator-perf`에 그대로 적용한다.
- 2026-11-12 lead: **링크 1 병합.** PR #164를 `ea637516`으로 병합했다. 브랜치 tip은 `e444a847`이다. 리뷰와 게이트를 확인했다: `gate` pass, `/verify` PASS, R·R2 🔴0, `/agent-eval` X1 Claude·Codex pass. runner의 exit 1은 real-state 경고뿐이었다. conductor worktree를 지웠다. 배치 브랜치(`SinhyeokKang/crs-fix`, `crs-review`, `crs-measure`)와 `feat/canvas-rendering-stability`는 원격에 남겼다.
  - 링크 1에서 확인하지 못한 것:
    - skillflo 캔버스가 이 머신에 없어서, 재측정과 최적화는 같은 크기·프레임 수의 합성 캔버스로 했다(사용자 결정).
    - C2(빠른 이동 중 빈 영역)는 남았다. BACKLOG에 수치와 함께 있다.
    - 줌아웃 스냅샷 LOD는 만들지 않았다. BACKLOG 'Undecided'에 측정 비용과 필요한 규칙이 있다.
    - 격리 앱이 가끔 5초 안에 종료되지 않는다. 이 변경 전 빌드에서도 같았고, BACKLOG에 있다.
  - **링크 1 → 링크 3(`work-indicator-perf`) 인계** (PR #164 본문에서 옮김):
    - 쉬는 동안 보드·iframe 레이어는 최대 19200×21346 device px다. 나머지 host 레이어는 창 크기다.
    - GPU 메모리(합성 pmsf): GPU 프로세스는 쉴 때 1439–2332 MiB, 118% 이동 중 3111–3284 MiB다. iframe `cc`는 이동 중 1231–1298 MiB다. 이동 한 단계마다 iframe이 레이어 약 91개를 commit하고, 60fps를 유지한다.
    - 부모 쪽 2W×2H 그라디언트·마스크 레이어는 2W×DPR 96000 device px까지 크기에 따른 탈락이 없었다. W 4000–8200의 plain 큰 면적 변형만 1–4프레임 동안 덜 그려졌다.
    - 마커나 그라디언트를 캔버스 iframe 안에 두면 C1의 16384 device px 경계에 걸린다. 부모에 둔다.
    - 2026-11-11 녹화의 프레임 단위 레이어 탈락은 C1·C2와 원인이 다를 가능성이 높다(빠진 것이 부모 DOM이다). 그 현상 자체는 측정하지 않았다.
    - host는 이제 쉬는 동안 App을 최대 1Hz(시계)로만 렌더하고, 창이 숨으면 렌더하지 않는다. 보기 전용 publish는 App을 렌더하지 않는다. 기준선은 링크 2(`buddy-docked-motion`) 병합 뒤의 develop에서 잰다.
    - 둥근 스크롤 컨테이너 안에 이미지가 있는 캔버스는 쉬는 동안에도 iframe compositor가 vsync마다 그린다(BACKLOG). 그런 캔버스의 쉬는 상태 측정에 GPU 부하가 더해진다.
- 2026-11-12 lead: **다음 머신 인계.** 사용자 결정으로 링크 2부터 다음 머신에서 진행한다. 이 머신에서는 링크 2를 시작하지 않았다.
  - 상태:
    - 링크 1은 병합됐다. 링크 2(`buddy-docked-motion`)와 링크 3(`work-indicator-perf`)은 대기 중이다.
    - 링크 2 시작 전 점검은 끝났다. 초안 확인과 클릭 결정 14가 들어 있고, tasks 1은 develop에서 완료됐다.
    - 열린 conductor, worktree, PR은 없다.
  - 새 머신 lead가 할 일:
    1. develop checkout에서 lead 세션을 열고 이 파일을 읽는다.
    2. 앱 준비: `npm --prefix app ci`, `app/`에서 `node -e "require('electron')"`. 패키징이 필요하면 Xcode 첫 실행 설정도 한다(`sudo xcodebuild -runFirstLaunch`). 이 머신에서는 `actool` 실패로 이것이 필요했다.
    3. 링크 2를 `/chain` §3 'Lead'대로 시작한다. worktree는 `buddy-docked-motion-orch`, 브랜치는 최신 `origin/develop`에서 만든 `feat/buddy-docked-motion`, conductor는 Claude다. 브리프에 `/orchestrate docs/features/buddy-docked-motion/`를 tasks 2부터 진행하라고 쓰고, 링크 2 → 링크 3 인계 항목을 PR 본문에 남기라고 쓴다.
    4. 링크 2가 병합되면 링크 3을 시작한다. 링크 3은 PoC와 재측정 동안 화면이 켜져 있어야 한다(운영 메모).
  - 옮겨지지 않는 것: 이 머신의 `.scratch/`에만 있다. 어느 링크도 이것에 의존하지 않는다.
    - 링크 1 증거: `.scratch/canvas-rendering-stability/`, `.scratch/agent-eval/crs-x1/`
    - 버디 초안 검수 증거: `.scratch/buddy-docked-review/`, `.scratch/buddy-docked-draft/`
    - `work-indicator-perf` design이 참조하는 `.scratch/flicker/probe3.mts`는 이 머신에도 없다. 링크 3 conductor가 design의 기록으로 다시 만든다.
- 2026-11-12 lead(다음 머신, develop checkout `/Users/sinhyeokkang/code/doan-design`): **링크 2부터 인수했다.** PR #164 병합을 polling으로 확인했다. 링크 2를 `e37a35fb`에서 시작했다: worktree `buddy-docked-motion-orch`, 브랜치 `feat/buddy-docked-motion`, Claude conductor. 브리프에 tasks 2부터 진행, 최적화 목표와 LOD 결정, 링크 1이 바꾼 host 렌더 빈도(쉬는 동안 최대 1Hz, 숨으면 렌더 안 함)에 버디 애니메이션이 의존하지 않을 것, 앱 준비 명령, 링크 2 → 링크 3 인계 항목을 넣었다.
- 2026-11-12 lead: **링크 2 병합.** PR #167을 `4dbc7cc7`로 병합했다. 브랜치 tip은 `a71feb66`이다. `gate` pass, `/verify` PASS, 리뷰 세 번 모두 🔴0을 확인했다. conductor worktree를 지웠다. `feat/buddy-docked-motion`과 배치 브랜치(`SinhyeokKang/bdm-a`, `bdm-b`, `bdm-f1`, `bdm-o`)는 남겼다.
  - 링크 2에서 사용자가 정한 것: 터미널 세션 카드도 입력을 받으므로 버디가 선다. 대화 패널의 resume 선택과 Overview의 이동 안내는 비켜설 이유다. 입력창 버디는 60fps로 제한한다.
  - 링크 2에서 확인하지 못한 것: 에이전트가 필요한 화면(실제 큐, 제안 프롬프트, 권한·질문 카드 등), 실제 최소화, 60·120Hz가 아닌 디스플레이. BACKLOG 'Not verified in the real app'에 있다. probe의 `PATH` 누출과 Overview mask 레이어도 BACKLOG에 있다.
  - **링크 2 → 링크 3 인계** (PR #167 본문에서 옮김):
    - 구조: `.docked-buddy-slot`(입력창 카드와 `.doan-canvas-tools` 안, z-index 2) 안에 imperative 노드 `.docked-buddy` 하나가 있고, 그 안에 88px 클립 창과 112×112 WebGL 캔버스가 있다. 앱 전체에 WebGL context는 하나다. workspace 화면에 들어오면 시작하고 나가면 dispose한다. 큐 pill, Jump to latest, 패널 안내 줄은 z 3으로 버디 위다.
    - probe에서 멈추기: reduced motion이면 정지 프레임 하나만 그린다(rAF 0). 문서 루트에 `[data-capture-snapshot]`이 있으면 투명해진다. 창이 숨겨지거나 `document.hidden`이면 rAF 0이다. Overview에 큐가 있으면 숨고 멈춘다. 작업 표시의 픽셀 비교에서는 reduced motion을 쓰거나 슬롯 영역을 가린다.
    - 프레임 비용(최종 빌드, 120Hz, 버디가 보일 때): 60 drawn frames/s, 렌더러 Task 약 53–57 ms/s(버디 없을 때 6–7), GPU 프로세스 CPU 약 2.1–3.1%, 합성 레이어는 Overview 10개, 캔버스 11개다.
    - 대화 패널에 `contain`·`content-visibility`를 걸면 입력창 위 88px 클립 창과 툴바 위 버디가 잘리면 안 된다.
- 2026-11-12 lead: 링크 3을 `4dbc7cc7`에서 시작했다. worktree는 `work-indicator-perf-orch`, 브랜치는 `feat/work-indicator-perf`, conductor는 Claude다. 브리프에 두 인계, 최적화 목표와 LOD 결정, `.scratch/flicker/probe3.mts` 재작성, 측정 전 `caffeinate`, 반복 측정과 load average 기록을 넣었다. 사용자는 링크 3에 Energy Impact 비교를 더하지 않기로 했다.
