# 대형 캔버스 렌더링 안정화 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261111](../chain-261111/chain.md) 링크 1. 시작 점검 승인은 lead 브리프(2026-11-11)에 있다.
- 시작 해시: `5676decd` (origin/develop)
- 통합 브랜치: `feat/canvas-rendering-stability`
- 런타임: Claude Code. 워커도 Claude만 쓴다(모델 계열 교차 없음).

## 결정 기록

1. 자료(시작 점검 1): 사용자가 캔버스를 건네는 대신 `/Users/sinhyeokkang/code/skillflo/skillflo-web/.doan/`을 의존 파일과 함께 격리 위치로 복사해 쓴다. 원본은 읽기만 한다. Export HTML은 복사본에서 설치된 `doan export`로 만든다.
2. 재현(시작 점검 2, 사용자): 큰 캔버스 대부분이 깨진다. 최초 렌더링 때 오른쪽이 잘리고, 빠른 확대·축소와 마구 하는 이동에서 깨진다. 후보는 `enrollment-mobile-category-flow`(41프레임, 폭 2800), `partner-course-by-member`(23프레임, 6500), `partner-member-search-flow`(9600), `enrollment-filter-scroll-reveal`(7672)이다.
3. 회사 자료(시작 점검 3): 복사본·스크린샷·녹화는 `/Users/sinhyeokkang/code/doan-design/.scratch/canvas-rendering-stability/` 아래에만 둔다. 커밋하지 않고 외부 서비스로 보내지 않는다. PR 본문과 feature 문서에는 캔버스 이름·크기·프레임 수·측정값만 적는다.
4. 사용자 참여(시작 점검 4): 대화로만 답한다. 개선 기준 합의와 원인 미확정 시 중단 판단은 conductor가 대화로 묻는다.
5. 측정 조건(시작 점검 5): 사용자가 같은 머신에서 일하는 중에 측정한다. 반복 측정해 중앙값과 범위를 적고 load average를 함께 기록한다. 설계가 요구하면 통제된 `yes` 부하를 쓴다.
6. 브라우저 비교 방법(tasks 2 미정, 사용자): Export HTML은 Playwright `_electron`으로 앱과 같은 Electron 45 창에서 연다. 엔진이 같아 차이가 앱 경로와 Export 경로 중 어디인지 바로 가른다.
7. `/agent-eval`: conductor 판단 — 체인 파일 운영 메모. `cli/internal/export/viewer/`를 바꾸면 마지막 통합 전에 실행하고, 바꾸지 않으면 실행하지 않는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P (PoC) | tasks 1, 2 | 추적 파일 수정 없음. probe·증거는 `/Users/sinhyeokkang/code/doan-design/.scratch/canvas-rendering-stability/` | 없음 | Opus high — GPU·합성·레이아웃 원인을 가르는 판단 중심 작업이고 틀리면 이후 수정 전부가 빗나간다 | 지문·버전·로드 상태 기록, 앱과 Electron Export 창의 재현 기록(반복 측정 중앙값·범위, load average), 원인 후보와 근거 | 대기 |
| F (수정) | tasks 3, 4(`/runtime-test`·`/postmortem`) | PoC가 정한 경계의 `app/src/renderer/`·`app/src/main/canvasScript.ts` 등. P 이후 확정 | P, 개선 기준 합의 | P 결과로 정한다 | 단위 red→green 또는 같은 probe의 전후 측정, `verify.mjs` | 대기 |
| R (리뷰) | F의 `/code-review` | 보고만 | F | F 난이도로 정한다 | 🔴 0 | 대기 |
| D (문서) | tasks 5 | PRODUCT·ARCHITECTURE·BACKLOG·POSTMORTEM, 이 디렉터리 삭제 | F 통합 | conductor가 직접 쓴다(문서 갱신 커밋) | 증거 대조 | 대기 |

## 파일 겹침과 순서

직렬이다. P는 코드를 바꾸지 않지만 F의 범위가 P 결과에 달려 있고, GUI 측정이 사용자 화면에서 겹치지 않아야 한다. P → (사용자 개선 기준 합의) → F → R → (수정 라운드) → 통합·`/verify` → D → push·PR.

원인 미확정이나 재현 실패면 P 뒤에 멈추고 사용자에게 관측과 필요한 자료를 보고한다.
