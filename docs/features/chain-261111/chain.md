# 체인 261111

같은 이름의 이전 체인(frame-first-selection, canvas-activity-notices)은 `ccd268c6`에서 삭제됐다. 이 파일은 새 체인이다.

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

## 순서

직렬 체인이다. 링크 2는 링크 1이 병합된 뒤 시작한다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1. `canvas-rendering-stability` | [spec](../canvas-rendering-stability/spec.md) · [design](../canvas-rendering-stability/design.md) · [tasks](../canvas-rendering-stability/tasks.md) | `/feature-review` 완료(`1acd4dd4`까지). 새 화면이 없어 초안 없음 | 대형 캔버스 그래픽 깨짐의 원인(GPU 타일·메모리, 합성, 레이아웃)을 먼저 확인한다. 2026-11-11 녹화의 작업 중 레이어 누락도 skillflo의 큰 캔버스 위에서 일어나, 같은 원인을 공유할 수 있다 |
| 2. `work-indicator-perf` | [spec](../work-indicator-perf/spec.md) · [design](../work-indicator-perf/design.md) · [tasks](../work-indicator-perf/tasks.md) | `/feature-review` 완료(`bb2c44ec`). 새 화면이 없어 초안 없음 | 합성 레이어를 새로 만드는 변경이다. 링크 1의 PoC가 GPU 메모리·타일 한계를 밝히면 그 결과로 레이어 수와 크기를 정한다 |

**직렬 판단**: 두 링크 모두 `app/src/renderer/CanvasController.ts`와 보드·overlay 렌더링(`styles.css`, `canvasView.ts`, `viewport.ts`)을 건드릴 수 있다.

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

## 상시 권한

- lead는 각 링크의 PR을 검토와 게이트 통과 뒤 링크 순서대로 develop에 병합하고, 다음 링크를 시작한다.
- conductor 런타임은 Claude Code다. 모델 계열을 넘는 워커는 허가되지 않았다.

## 진행 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기는 `/orchestrate` §2의 백그라운드 감시 루프를 쓴다. 메일함을 소비하지 않는다.
- 두 링크 모두 로그인이 필요 없다.
- `/agent-eval`:
  - 링크 1은 export 코드(`cli/internal/export/viewer/`)를 바꾸면 CLI 출력에 해당하므로 마지막 통합 전에 실행한다. 바꾸지 않으면 해당하지 않는다.
  - 링크 2는 해당하지 않는다.
- 링크 2는 PoC와 재측정 동안 화면이 켜져 있고 잠기지 않아야 한다. 링크 2 conductor는 측정 전에 `caffeinate`로 잠자기를 막는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1. `canvas-rendering-stability` | | | | 대기 |
| 2. `work-indicator-perf` | | | | 대기 |

## 인계 기록

- 2026-11-11 lead(develop checkout): 사용자 요청으로 체인 파일을 작성했다. 시작 점검 승인 뒤 링크 1을 시작한다.
