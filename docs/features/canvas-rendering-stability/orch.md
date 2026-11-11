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
13. 개선 기준(사용자 합의): ① C1 — pmsf 최초 렌더링(대화 접힘), 정지 sweep(축소 0.065–0.13), emcf 빠른 축소에서 앱 세 레이아웃과 Export(Electron·Chrome)의 지속 잘림이 5회 모두 0. ② 모서리 외관이 수정 전과 픽셀 비교로 같다. AA 가장자리에서만 생긴 차이(앱 최대 3/255, Export 최대 4/255, 8/255 초과 0)는 같은 픽셀로 본다(결정 17). ③ clip하는 조상에 균일 반경이 없다는 구조 단언. ④ C2 회귀 없음(이동 peak와 빈 프레임 비율이 수정 전 범위 이하). ⑤ 첫 표시 1프레임 빈 화면은 범위 밖이며 BACKLOG에 남긴다.
14. 앱 모서리 방식(사용자, F 질문): 앱 패널 모서리 뒤는 macOS vibrancy라 덮개로 같은 픽셀을 낼 수 없다. 그래서 앱은 패널이 둥근 배경만 그리고 자르지 않는다. 헤더가 위 모서리를, `.area`가 아래 모서리만 자른다. `.area`의 위 반경은 구조상 0이다. Export는 단색 `--bg-app` 위라 덮개 방식을 유지한다. 결정 10의 덮개 방식은 Export에만 적용한다.
15. 최적화 범위(사용자, lead 전달): 깨짐 수정에 더해 큰 캔버스의 렌더링 비용을 drift 없이 줄인다(spec 완료 조건 5, tasks 5–6). 목표 수치는 측정에서 정하고, ARCHITECTURE §3 구조 변경이 필요한 후보만 사용자에게 묻는다. drift 없는 후보의 채택은 conductor가 측정 근거로 정한다.
16. LOD 예외(사용자, lead 전달): 이동 LOD와 보수적 축소 스냅샷 LOD를 허용한다(spec 완료 조건 6). 축소 스냅샷 LOD가 ARCHITECTURE §3 변경을 요구하면 제안 규칙을 적고 구현 전에 사용자에게 묻는다. 화면 밖 건너뛰기는 drift 없음 규칙을 따른다. O1은 이 두 LOD를 후보로 함께 잰다.
17. 기준 ② 허용치(사용자, lead가 체인 파일에 기록): C1 수정 뒤 모서리 AA 차이는 '같은 픽셀'로 본다. 앱 최대 3/255, Export 최대 4/255이고 AA 가장자리에서만 생기며 8/255를 넘는 픽셀은 없다. 기준 ②는 통과다.
18. 새 머신 측정 자료(사용자): 새 머신의 skillflo-web `.doan/`에는 캔버스가 없다(`config.json`만 있다). 원본 대신 크기와 프레임 수가 같은 합성 캔버스를 `.scratch/`에 만들어 쓴다. 전후 비교는 이 머신 안에서만 한다. C1·C2는 크기와 iframe 구조로 재현되지만, paint 비용은 실제 내용과 다르다. PR과 문서에 합성 자료로 쟀다고 적는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P (PoC) | tasks 1, 2 | 추적 파일 수정 없음. probe·증거는 `/Users/sinhyeokkang/code/doan-design/.scratch/canvas-rendering-stability/` | 없음 | Opus high — GPU·합성·레이아웃 원인을 가르는 판단 중심 작업이고 틀리면 이후 수정 전부가 빗나간다 | 지문·버전·로드 상태 기록, 앱과 Electron Export 창의 재현 기록(반복 측정 중앙값·범위, load average), 원인 후보와 근거 | 완료(커밋 없음, `handoff-P.md`) |
| P2 (부하) | 결정 8 | 추적 파일 수정 없음 | P | Sonnet high — P의 probe를 그대로 반복 실행하는 측정이다. P 워커 터미널을 재사용할 수 없어 새 워커로 띄웠다 | 무부하·CPU·GPU 부하별 C2 이동 측정 중앙값·범위, C1 sanity | 완료(이전 머신) |
| F (수정) | tasks 3, 4(`/runtime-test`·`/postmortem`) | `app/src/renderer/styles.css`와 캔버스 패널을 그리는 컴포넌트, `cli/internal/export/viewer/*`, 그 테스트, `docs/POSTMORTEM.md` | P, 개선 기준 합의 | Opus high — 앱과 Export 두 경로에서 외관 픽셀 일치와 구조 단언을 맞춰야 하고, 틀리면 잘림이 남거나 모서리 모양이 바뀐다 | 단위 red→green 또는 같은 probe의 전후 측정, `verify.mjs` | 부분 완료: 통합 `85879e1b`·`22b4d776`·`c36a2961`(원본 `3c2c4c2b`·`e341d3e3`·`3f388b82`, 배치 브랜치 `SinhyeokKang/crs-fix`). 기준 ④ 일부와 ⑤는 미실행 |
| M (새 머신 재측정) | 남은 일 2·3: 합성 캔버스와 probe 재구성, C1 sanity, C2 회귀(기준 ④), 일반 크기 캔버스 `/runtime-test`(기준 ⑤) | 추적 파일 수정 없음. probe·증거는 `/Users/sinhyeok/code/doan-design/.scratch/canvas-rendering-stability/` | F 통합, develop 병합 | Opus high — 기록만으로 probe를 다시 만들고 합성 자료가 원래 현상을 재현하는지 판정해야 한다. 틀리면 회귀 판정과 O1 기준선이 모두 빗나간다 | 합성 자료의 C1 재현(수정 전)과 0(수정 후), C2 수정 전·후 번갈아 각 5회 중앙값·범위·load average, `/runtime-test` 기록 | 대기 |
| R (리뷰) | F의 `/code-review` | 보고만 | F | Opus medium — CSS·viewer 변경은 작지만 구조 단언과 회귀 판단이 필요하다 | 🔴 0 | 대기 |
| O1 (최적화 측정) | tasks 5 | 추적 파일 수정 없음 | M(같은 워커의 후속 Task, probe 재사용) | Opus high — 비용 분해와 drift 없는 후보 선정은 판단 중심이고, 틀리면 O2가 효과 없는 변경을 넣는다 | 비용별 기준선(중앙값·범위, load average), 후보와 근거·예상 효과 | 대기 |
| O2 (최적화 구현) | tasks 6 | O1이 고른 후보의 파일. O1 이후 확정 | O1 | O1 결과로 정한다 | 후보별 전후 비용, 픽셀 비교 drift 0, `verify.mjs` | 대기 |
| D (문서) | tasks 7 | PRODUCT·ARCHITECTURE·BACKLOG·POSTMORTEM, 이 디렉터리 삭제 | F 통합 | conductor가 직접 쓴다(문서 갱신 커밋) | 증거 대조 | 대기 |

## 파일 겹침과 순서

직렬이다. P2와 F는 파일이 겹치지 않아 함께 돌리되, F의 GUI probe는 P2가 끝난 뒤 conductor 허락을 받고 시작한다. P는 코드를 바꾸지 않지만 F의 범위가 P 결과에 달려 있고, GUI 측정이 사용자 화면에서 겹치지 않아야 한다. P → (사용자 개선 기준 합의) → F → R → (수정 라운드) → 통합 → O1 → O2 → R2 → 통합·`/verify`·`/agent-eval` → D → push·PR. O1·O2는 F와 같은 렌더러 파일을 건드릴 수 있어 F 통합 뒤에 시작한다.

원인 미확정이나 재현 실패면 P 뒤에 멈추고 사용자에게 관측과 필요한 자료를 보고한다.

## 머신 이전 인계 (2026-11-11)

사용자가 체인을 다른 머신에서 이어받는다. 이 머신의 Mac이 잠겨 GUI 측정이 멈췄다. 아래는 이 머신에서 얻은 측정 요약이다(캔버스 이름·크기·측정값만). 원자료와 probe는 이 머신의 `/Users/sinhyeokkang/code/doan-design/.scratch/canvas-rendering-stability/`에만 있고 옮기지 않는다. 새 머신에서는 skillflo `.doan/`을 그 머신의 `.scratch/` 아래로 다시 복사하고 probe를 다시 만들어야 한다.

### 환경

Apple M3, macOS 26.3.1, 메모리 16 GB, 내장 디스플레이 논리 1512×982·배율 2. Electron 45.0.0(Chromium 156.0.8078.48), 데스크톱 Chrome 157.0.8103.40. Skia Graphite(Dawn Metal), GPU 합성 켜짐. WebGL 최대 텍스처 16384. Export는 설치된 doan v0.1.5로 만들었다. 대상 캔버스: `partner-member-search-flow`(pmsf, 9600×10673, 2프레임), `enrollment-mobile-category-flow`(emcf, 2800×19305, 41), `partner-course-by-member`(6500×15313, 23), `enrollment-filter-scroll-reveal`(7672×12619, 5).

### 원인 (P)

- **C1 지속 잘림**: 캔버스 iframe(교차 출처, 별도 프로세스)의 조상이 네 모서리 반경이 같은 clip을 가지면, Chromium은 iframe 표면을 compositing rect 원점에서 16384 device px(DPR 2에서 8192 CSS px) 안에서만 그린다. 앱은 대화 패널을 접을 때, Export는 항상 해당한다. 앱·Electron Export·Chrome 157 모두 같은 위치에서 잘렸다(측정 위치와 예측의 차이 1–5 px). 반경 0, 비균일 반경, `overflow: visible`, DPR 1에서는 0이었다. 부하·이력과 무관했다. Chromium 내부 경로(fast rounded corner → 병합되지 않는 render pass → 최대 텍스처로 자름)는 소스로 확인하지 않은 추정이다.
- **C2 이동 중 빈 영역**: Chromium은 별도 프로세스 iframe을 창 viewport + 각 방향 15% 범위만 그리고, 그 범위를 약 1프레임 늦게 갱신한다. 모델과 실제 빈 영역의 IoU는 0.978이었다. pmsf 118% 마구 이동에서 최대 빈 비율은 앱 0.791, Electron Export 0.794, Chrome 0.922였고, 멈추면 17–54 ms 안에 0이 됐다.
- 확대·축소 자체는 깨지지 않았다(안정된 화면과의 차이 최대 4.9%).
- 첫 표시 1프레임 빈 화면(92–96%)은 범위 밖이다(결정 13 ⑤). BACKLOG에 남긴다.

### 부하 비교 (P2, 최적화 기준선)

pmsf 118% 이동, 무부하·CPU(`yes` 4개)·GPU(WebGL fill-rate, Device Utilization 100%) 각 5회.
- 최대 빈 비율 0.79와 최종 0은 모든 조건에서 같았다. 15% 여백 모델 IoU는 앱 0.98, Export 0.93이었다.
- GPU 포화는 빈 프레임을 35–40% 늘렸다. 지연은 앱 16→29 ms, Export 9→27 ms, 사라질 때까지 걸린 시간은 31→51 ms, 21→62 ms로 늘었다. CPU 부하는 악화시키지 않았다.
- C1은 모든 부하에서 0.145였다.
- 한계: 무부하 조건의 GPU 사용률도 다른 앱 때문에 약 70%였다. load average는 3.8–72 사이로 흔들렸다.

### 수정 결과 (F)

- 앱: 패널은 둥근 배경만 그리고 자르지 않는다. 헤더가 위 모서리를, `.area`가 아래 모서리만 자른다(결정 14).
- Export: 패널은 사각 clip이다. `::after` 덮개가 곡선 바깥을 `--bg-app`으로 칠한다(결정 10·11). Export 고정 digest 9개를 갱신했다.
- 기준 ① 지속 잘림(수정 전 n=2 → 수정 후 n=5), 모두 5/5회 0이 됐다.
  - 앱 pmsf 첫 렌더링: 대화 접힘 0.1454 → 0, 양쪽 접힘 0.1457 → 0.
  - 앱 sweep(s 0.065/0.08/0.1/0.13): 대화 접힘 0.389/0.421/0.281/0.213 → 0, 양쪽 접힘 0.389/0.421/0.261/0.131 → 0.
  - 앱 emcf 빠른 축소: 대화 접힘 0.0413 → 0, 양쪽 접힘 0.0458 → 0.
  - Export/Electron: pmsf 0.1454 → 0, emcf 0.4099 → 0. Export/Chrome pmsf 0.1458 → 0.
  - 기본 레이아웃은 수정 전에도 0이었다.
- 기준 ② 모서리 픽셀: 앱은 대부분 차이 0이다. 대화 접힘에서 캔버스 내용이 모서리 아래에 올 때만 아래 모서리 AA 가장자리에서 최대 3/255였다(네이티브 캡처 1/255). Export는 네 모서리 AA 가장자리에서 최대 4/255였다(8/255를 넘는 픽셀 0). **'같은 픽셀'로 볼지 사용자 확인이 필요하다.**
- 기준 ③ 구조 단언: 단위 테스트(`app/src/main/exportViewer.test.ts`)가 수정 전 red, 수정 후 green이었다. 실제 앱의 레이아웃 6종과 Export(Electron·Chrome)에서도 위반이 사라졌다.
- 게이트: 앱 테스트 372 files / 10199 tests, typecheck, lint, `go test`, `go vet`, `verify.mjs` 모두 PASS(F 브랜치 기준).

### 남은 일 (새 머신)

1. 통합 HEAD에서 `/verify` 재실행. 이 머신에서는 통합 뒤 실행하지 않았다.
2. F 기준 ④ C2 회귀: 앱·Export 수정 전·후 4·5회차와 Export 수정 후 3회차. 지금까지 앱 프레임>1%는 수정 전 0.095 [0.084–0.099] → 수정 후 0.101 [0.082–0.104](n=3), Export는 0.174 [0.172–0.182] → 0.181 [0.175–0.187](n=2)이다. Export 최대 0.187이 수정 전 최대 0.182보다 조금 높아 판정을 미뤘다. 같은 세션에서 수정 전·후를 번갈아 잰다.
3. F 기준 ⑤ 일반 크기 캔버스 `/runtime-test`(선택 위치·프레임 점프·Capture area·재로드·스크롤·모션).
4. 기준 ② AA 차이의 사용자 확인.
5. 독립 리뷰 R → 수정 라운드.
6. O1 최적화 측정 → O2 구현 → R2(결정 15·16, spec 완료 조건 5·6).
7. `/agent-eval`: Export viewer를 바꿨으므로 실행한다(결정 7·11).
8. D(tasks 7): PRODUCT·ARCHITECTURE 승격, BACKLOG(C2 잔여, 첫 표시 1프레임 빈 화면), DESIGN.md 'Viewer panel' 문구(지금은 "24px on all four corners, `overflow: clip`"이다. 보이는 값은 같지만 구조가 바뀌었다).
9. PR 본문에 링크 2 인계를 적는다. 
   - 원인과 측정은 위와 같다.
   - 부모 쪽 2W×2H 그라디언트·마스크 레이어는 2W×DPR 96000 device px까지 크기에 따른 탈락이 없었다. W 4000–8200의 plain 큰 면적 변형에서만 1–4프레임이 일시적으로 덜 그려졌다.
   - 마커나 그라디언트를 캔버스 iframe 안에 두면 C1 조건의 16384 device px 경계를 받는다.
   - 2026-11-11 녹화의 프레임 단위 레이어 탈락은 같은 원인일 가능성이 낮다. 탈락한 요소가 부모 DOM이고, C1·C2는 iframe 표면에서만 생긴다. 다만 그 현상 자체는 측정하지 않았다.
10. 측정 중 실제 상태 검사 경고: `~/.gemini/antigravity-cli` 메타가 몇 번 바뀌었다. 이 CLI는 측정과 무관하게 하루 30–70회 실행돼 왔다(로그로 확인). 사용자 실제 Doan의 `ui-state.json`이 1회 바뀌었는데, 같은 시간에 실제 앱이 실행 중이었다. MCP 설정 키 diff 1회는 출력이 잘려 확인하지 못했고, 재실행에서는 통과했다.

## 새 머신 재개 (2026-11-11)

- 통합 브랜치에 `origin/develop`을 병합했다(`25bed19c`). `docs/POSTMORTEM.md` 충돌은 같은 날짜의 두 새 항목을 모두 남겨 풀었다.
- 환경: Apple M1(8코어), 메모리 16 GB, macOS 26.6.2. 디스플레이는 외장 5K 하나, 논리 2560×1440·배율 2. Electron 45.0.0, 데스크톱 Chrome 157.0.8103.40. 설치된 Doan은 0.1.4다. lead 브리프의 'M3'는 실제와 달라 이 값을 쓴다. 이전 머신 수치와는 비교하지 않는다.
- 자료: 결정 18. 증거와 probe는 `/Users/sinhyeok/code/doan-design/.scratch/canvas-rendering-stability/`에 둔다.
- 남은 일 상태: 4는 결정 17로 닫았다. 2·3은 배치 M, 5는 R, 6은 O1·O2·R2, 1은 마지막 통합 뒤 `/verify`, 7·8·9는 conductor가 맡는다. 10은 M 브리프에 실제 상태 보호로 넣었다.
