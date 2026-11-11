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
8. GPU 부하 측정(사용자): P가 끝나면 같은 워커에 후속 Task(P2)로 GPU 부하 조건 측정을 보낸다. 같은 동작을 무부하·CPU `yes` 부하·GPU 부하에서 재어, 빈 영역이 GPU 래스터 처리량에 묶였는지 가른다.
9. 최초 렌더링 잘림의 확실한 관측(사용자): `partner-member-search-flow`의 Export HTML을 데스크톱 Chrome에서 열었을 때다. P에 실제 Chrome(설치된 157.0.8103.40, 임시 프로필) 재현을 추가했다. 결정 6의 같은 Electron 비교는 유지한다.

10. C1 수정 방식(사용자): 캔버스 iframe을 자르는 조상에서 네 모서리 같은 반경을 빼고, 보드 위에 모서리 덮개를 그려 같은 모양을 낸다. 1px 비균일 반경은 Chromium 내부 동작에 기대므로 쓰지 않는다.
11. Export 수정(사용자): Export viewer에도 같은 방식을 넣는다. CLI 출력이 바뀌므로 마지막 통합 전에 `/agent-eval`을 실행한다(결정 7).
12. C2 처리(사용자): 남은 현상으로 둔다. 회귀만 막고 BACKLOG에 현상과 측정값을 남긴다.
13. 개선 기준(사용자 합의): ① C1 — pmsf 최초 렌더링(대화 접힘), 정지 sweep(축소 0.065–0.13), emcf 빠른 축소에서 앱 세 레이아웃과 Export(Electron·Chrome)의 지속 잘림이 5회 모두 0. ② 모서리 외관이 수정 전과 픽셀 비교로 같다. ③ clip하는 조상에 균일 반경이 없다는 구조 단언. ④ C2 회귀 없음(이동 peak와 빈 프레임 비율이 수정 전 범위 이하). ⑤ 첫 표시 1프레임 빈 화면은 범위 밖이며 BACKLOG에 남긴다.
14. 앱 모서리 방식(사용자, F 질문): 앱 패널 모서리 뒤는 macOS vibrancy라 덮개로 같은 픽셀을 낼 수 없다. 그래서 앱은 패널이 둥근 배경만 그리고 자르지 않는다. 헤더가 위 모서리를, `.area`가 아래 모서리만 자른다. `.area`의 위 반경은 구조상 0이다. Export는 단색 `--bg-app` 위라 덮개 방식을 유지한다. 결정 10의 덮개 방식은 Export에만 적용한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P (PoC) | tasks 1, 2 | 추적 파일 수정 없음. probe·증거는 `/Users/sinhyeokkang/code/doan-design/.scratch/canvas-rendering-stability/` | 없음 | Opus high — GPU·합성·레이아웃 원인을 가르는 판단 중심 작업이고 틀리면 이후 수정 전부가 빗나간다 | 지문·버전·로드 상태 기록, 앱과 Electron Export 창의 재현 기록(반복 측정 중앙값·범위, load average), 원인 후보와 근거 | 완료(커밋 없음, `handoff-P.md`) |
| P2 (부하) | 결정 8 | 추적 파일 수정 없음 | P | Sonnet high — P의 probe를 그대로 반복 실행하는 측정이다. P 워커 터미널을 재사용할 수 없어 새 워커로 띄웠다 | 무부하·CPU·GPU 부하별 C2 이동 측정 중앙값·범위, C1 sanity | 진행 중 |
| F (수정) | tasks 3, 4(`/runtime-test`·`/postmortem`) | `app/src/renderer/styles.css`와 캔버스 패널을 그리는 컴포넌트, `cli/internal/export/viewer/*`, 그 테스트, `docs/POSTMORTEM.md` | P, 개선 기준 합의 | Opus high — 앱과 Export 두 경로에서 외관 픽셀 일치와 구조 단언을 맞춰야 하고, 틀리면 잘림이 남거나 모서리 모양이 바뀐다 | 단위 red→green 또는 같은 probe의 전후 측정, `verify.mjs` | 대기 |
| R (리뷰) | F의 `/code-review` | 보고만 | F | Opus medium — CSS·viewer 변경은 작지만 구조 단언과 회귀 판단이 필요하다 | 🔴 0 | 대기 |
| D (문서) | tasks 5 | PRODUCT·ARCHITECTURE·BACKLOG·POSTMORTEM, 이 디렉터리 삭제 | F 통합 | conductor가 직접 쓴다(문서 갱신 커밋) | 증거 대조 | 대기 |

## 파일 겹침과 순서

직렬이다. P2와 F는 파일이 겹치지 않아 함께 돌리되, F의 GUI probe는 P2가 끝난 뒤 conductor 허락을 받고 시작한다. P는 코드를 바꾸지 않지만 F의 범위가 P 결과에 달려 있고, GUI 측정이 사용자 화면에서 겹치지 않아야 한다. P → (사용자 개선 기준 합의) → F → R → (수정 라운드) → 통합·`/verify` → D → push·PR.

원인 미확정이나 재현 실패면 P 뒤에 멈추고 사용자에게 관측과 필요한 자료를 보고한다.
