# 체인 261111

같은 이름의 이전 체인(frame-first-selection, canvas-activity-notices)은 `ccd268c6`에서 삭제됐다. 이 파일은 새 체인이다.

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

## 순서

직렬 체인이다. 링크 2는 링크 1이 병합된 뒤, 링크 3은 링크 2가 병합된 뒤 시작한다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1. `canvas-rendering-stability` | [spec](../canvas-rendering-stability/spec.md) · [design](../canvas-rendering-stability/design.md) · [tasks](../canvas-rendering-stability/tasks.md) | `/feature-review` 완료(`1acd4dd4`까지). 새 화면이 없어 초안 없음 | 대형 캔버스 그래픽 깨짐의 원인(GPU 타일·메모리, 합성, 레이아웃)을 먼저 확인한다. 2026-11-11 녹화의 작업 중 레이어 누락도 skillflo의 큰 캔버스 위에서 일어나, 같은 원인을 공유할 수 있다 |
| 2. `work-indicator-perf` | [spec](../work-indicator-perf/spec.md) · [design](../work-indicator-perf/design.md) · [tasks](../work-indicator-perf/tasks.md) | `/feature-review` 완료(`bb2c44ec`). 새 화면이 없어 초안 없음 | 합성 레이어를 새로 만드는 변경이다. 링크 1의 PoC가 GPU 메모리·타일 한계를 밝히면 그 결과로 레이어 수와 크기를 정한다 |
| 3. `buddy-docked-motion` | [spec](../buddy-docked-motion/spec.md) · [design](../buddy-docked-motion/design.md) · [tasks](../buddy-docked-motion/tasks.md) | `/feature-review` 완료(`bd02429d`). 초안 `.doan/canvases/buddy-docked-motion.html` 수정본 커밋(`5e7d0e35`, tasks 1). 사용자 확인 완료 | 링크 2가 측정하는 대화 패널(입력창 테두리, 큐 행)에 움직이는 WebGL 버디를 더한다. 링크 2의 픽셀·프레임 기준선은 버디 없이 재고, 링크 3은 링크 2의 `contain` 규칙과 렌더링 최적화 위에서 버디의 비용을 잰다. 사용자 결정으로 직렬 |

**직렬 판단**: 링크 1과 2는 모두 `app/src/renderer/CanvasController.ts`와 보드·overlay 렌더링(`styles.css`, `canvasView.ts`, `viewport.ts`)을 건드릴 수 있다. 링크 3은 링크 1·2와 `styles.css`에서 겹치고, 링크 2와는 대화 패널(`ConversationThread.tsx` 주변 레이아웃, `contain`)과 측정 기준선에서 겹친다. 사용자가 링크 3을 직렬로 붙이기로 했다(2026-11-11).

**링크 2 → 링크 3 인계**: 링크 2 conductor는 PR 본문에 대화 패널에 건 `contain`·`content-visibility` 규칙과, 링크 3의 버디(입력창 위 88px 클립 창, WebGL 캔버스)가 받을 제약을 남긴다.

**링크 1 → 링크 2 인계**: 링크 1 conductor는 PR 본문에 다음을 남긴다. lead가 병합 때 아래 '인계 기록'에 옮긴다.
- 확인한 원인과 GPU 메모리·타일·레이어 크기에 관한 측정.
- 링크 2의 합성 레이어 계획(특히 큰 확대에서 2W×2H 그라디언트 레이어)에 걸리는 제약.

## 시작 점검

lead는 링크 1 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 남긴다. 승인 뒤 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **링크 1의 자료**: 링크 1 tasks 1은 사용자에게 원본 캔버스와 Export HTML을 받는다고 적었다. 대신 실제 앱에 등록된 `/Users/sinhyeokkang/code/skillflo/skillflo-web/.doan/`의 캔버스를 쓴다(사용자 제안). 의존 파일(`tokenCss` `.doan/assets/sf-ds/tokens.css` 등)까지 `.doan/`을 격리 위치로 복사한다. Export HTML은 복사본에서 설치된 `doan export`로 만든다. 원본 프로젝트는 읽기만 한다.
2. **재현할 캔버스와 동작**: 어떤 캔버스에서 어떤 동작(확대, 이동, 배율, 창 크기)을 할 때 무엇이 깨지는지 사용자가 대화로 알려준다. 큰 후보는 `enrollment-mobile-category-flow`(41프레임, 폭 2800), `partner-course-by-member`(23프레임, 폭 6500), `partner-member-search-flow`(폭 9600), `enrollment-filter-scroll-reveal`(폭 7672)이다.
3. **회사 프로젝트 자료 취급**: 복사본과 스크린샷은 develop checkout의 `.scratch/` 아래에만 둔다. 커밋하지 않고, 외부 서비스로 보내지 않는다. PR 본문과 feature 문서에는 캔버스 내용 없이 이름, 크기, 프레임 수, 측정값만 적는다.
4. **사용자 참여 방식**: 사용자는 대화로만 답한다. 로그인이나 머신 앞에서 하는 수동 조작은 하지 않는다. 링크 1의 개선 기준 합의와 원인 미확정 시 중단 판단은 conductor가 대화로 묻는다.
5. **측정 조건**: 사용자가 같은 머신에서 일하는 중에 측정할 수 있다. 화면은 켜져 있고 잠기지 않는다고 본다. 격리 앱 창이 사용자 화면에 뜬다. 다른 작업 부하가 섞이므로 반복 측정(중앙값과 범위)과 통제된 `yes` 부하로 보정하고, 측정 때 load average를 함께 기록한다.

**링크 3 시작 전 점검**(lead가 링크 3 시작 전에 사용자에게 확인하고 '인계 기록'에 남긴다):
1. 사용자가 앱에서 초안 수정본을 확인했다. 대기 중 이동 간격(60–120초)도 함께 확인한다(링크 3 tasks 1 확인 항목).
2. 링크 3 conductor는 tasks 2부터 시작한다. tasks 1(초안)은 develop에서 끝났다.

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
  - 링크 2는 해당하지 않는다.
  - 링크 3은 해당하지 않는다(CLI 출력, 가이드, `doan check`, 스킬 stub을 바꾸지 않는다).
- 링크 2는 PoC와 재측정 동안 화면이 켜져 있고 잠기지 않아야 한다. 링크 2 conductor는 측정 전에 `caffeinate`로 잠자기를 막는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1. `canvas-rendering-stability` | `canvas-rendering-stability-orch` (Claude conductor). 이전 머신에서 시작, 새 머신 `/Users/sinhyeok/orca/workspaces/doan-design/canvas-rendering-stability-orch`에서 재개 | 2026-11-11, `5676decd`. 재개 `12ddcfa8` | | 진행 중 |
| 2. `work-indicator-perf` | | | | 대기 |
| 3. `buddy-docked-motion` | | | | 대기 |

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
