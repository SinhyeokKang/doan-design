# canvas-thumbnail-frame — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- chain: [chain-261128-1](../chain-261128-1/chain.md) 링크 2(병렬 그룹)
- 시작 hash: 7ffe758fa (`origin/develop`, canvas-message PR #430 머지 뒤)
- 통합 브랜치: `feat/canvas-thumbnail-frame` (lead가 만들었다)

## 결정 로그

- 사용자에게 새로 물을 결정 없음. spec '확정한 결정'과 design이 동작을 모두 정했다.
- 배치 분할 — 컨덕터 판단: T1–T3가 모두 `thumbnailWindow.ts`를 바꾸고 T2·T3가 PoC 결과에 달려 있어 한 워커가 직렬로 맡는다. T1 끝에서 멈추고 컨덕터가 PoC 결과를 검토한 뒤 T2–T3를 같은 dispatch의 새 Task로 보낸다. PoC가 design의 방법을 뒤집으면(예: main world 실행 불가) 그때 사용자에게 묻는다.
- T4 probe — 컨덕터 판단: T1 probe 하네스를 가진 워커가 리뷰 수정 뒤 실기 확인과 스크린샷을 맡고, 컨덕터는 통합 HEAD에서 `/verify`를 돌리고 스크린샷을 검토한다. GUI probe는 다른 링크 2 컨덕터와 Orca 메일로 시간을 맞춘다.
- T5 승격은 컨덕터가 한다(문서만).
- PoC 검토(339d68a1c, design 'PoC 결과') — 컨덕터 판단, 사용자가 보는 동작은 spec 그대로라 묻지 않았다:
  - `scrollTo` 대신 `scrollIntoView({ block: "start", behavior: "instant" })`와 스크롤 뒤 viewport 사각형 다시 읽기, rAF 두 번 대기를 받아들인다. body 스크롤 컨테이너와 smooth 루트에서 `scrollTo`가 첫 화면이 되고, 스크롤 직후 캡처가 64번 중 20번 예전 화면이었기 때문이다.
  - 캡처 높이를 프레임 폭 이하로 자르는 제안을 받아들인다. 썸네일 칸 중 가장 세로로 긴 것이 1:1(`.cv-thumb`)이고 모두 `cover` + 위쪽 정렬이라 보이는 부분이 같다. T3에서 칸 비율을 다시 확인한다.
  - 스크롤한 뒤 측정이 실패하면 맨 위로 되돌리고(`instant` + rAF 두 번, 남은 제한 시간 안) 첫 화면을 찍는다. spec이 "실패하면 첫 화면"이라서다. 되돌리기마저 제한에 걸리면 그대로 찍는다. 그 캔버스 자기 썸네일만 영향을 받는다.
  - 배율 함수는 넣지 않는다. 312 CSS px보다 좁은 프레임이 늘어나 보이는 것과 fixed·sticky 겹침은 ARCHITECTURE 한계로 적는다.
  - renderer를 멈추는 캔버스가 세션의 뒤 캡처를 모두 흰 화면으로 만드는 문제는 이 기능 전부터 있던 결함이라 T5에서 BACKLOG에 적는다.
- B 결과의 폭 상한 예외 — 컨덕터 판단: 넓은 canvas card(480 px 이상)의 160 px 배너 칸은 상태 글이 약 7줄 넘게 줄바꿈되면 1:1보다 세로로 길어진다. 그때 상한을 건 이미지는 양옆이 잘린다. 드문 경우라 상한을 두고 ARCHITECTURE 한계로 적는다.

- R 리뷰(🔴2 🟡3 🟢1) 처리 — 컨덕터 판단:
  - 🔴1 스크롤 뒤 실패에서 아래쪽 디자인이 첫 화면 사각형으로 찍힐 수 있다 → 스크롤 전에 첫 화면을 먼저 찍어 두고 실패하면 그것을 쓴다. 되돌리기 스크립트는 없앤다. 앞의 "되돌리기마저 제한에 걸리면 그대로 찍는다"를 대신한다.
  - 🔴2 캔버스가 만든 큰 값이 main 검사 전에 프로세스 경계를 넘는다 → 스크립트가 고정 크기 숫자 배열만 돌려준다.
  - 🟡2 사각형이 실제 창 밖 → 실제 content 경계와 교차, 비면 첫 화면.
  - 🟢 폭 상한 주석을 이유만 남기게 고친다.
  - 🟡1(작업 제한 20 s 직전 측정 시작)은 고치지 않는다. load 8 s + settle이라 측정이 20 s 근처에서 시작하지 않는다.
  - 🟡3(안쪽 스크롤 컨테이너가 자른 프레임)은 고치지 않고 ARCHITECTURE 한계로 적는다.
- R2 재리뷰(🔴0 🟡3) 처리 — 컨덕터 판단:
  - 🟡1 프레임 캡처가 거절되면 이미 찍은 첫 화면까지 버린다 → 거절을 잡아 첫 화면을 쓴다(고친다).
  - 🟡3 측정 기한이 지난 뒤에도 스크롤을 보낸다 → 보내기 전에 기한을 확인한다(고친다).
  - 🟡2 첫 화면 캡처 실패가 프레임 캡처를 막는다 → 고치지 않는다. 첫 화면 캡처 실패는 지금도 작업 실패이고 동작이 같다.
  - 수정은 T4가 끝난 뒤 같은 워커에 보낸다. 오류 경로만 바뀌어 T4 결과는 그대로 쓴다.
- T4(실기, DPR 2·1 PASS) 결과: 넓은 canvas card의 160 px 배너 칸이 이미지 비율로 높이가 정해져, 1:1 상한의 폰 프레임 카드가 100 → 160 px로 커졌다(`t4/dpr2/card-wide-phone.png`).
  - 사용자 결정: 캡처 높이 상한을 1:1에서 16:10(폭 × 10/16)으로 바꾼다. 칸 CSS는 바꾸지 않는다. 48 × 48 행에서 폰 프레임은 위쪽 가운데만 보인다. 앞의 'B 결과의 폭 상한 예외' 판단은 이것으로 없어진다.
  - 수정 2차(16:10, R2 🟡1·🟡3) 뒤 폰·intro 캔버스만 DPR 2로 다시 확인한다.

## Codex 사용

- chain 상시 권한(링크 2의 모든 작업). 시작 때 Codex 주간 사용량 16%(rollout `window_minutes: 10080`).
- 실제로 쓴 범위: R 리뷰 워커 Codex `gpt-6.2-astra` medium(models_cache의 최신 Astra), 리뷰 1회 + 재리뷰 1회.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1 PoC | `.scratch/canvas-thumbnail-frame/`, `design.md` 'PoC 결과' | — | Claude Opus high: Electron OOPIF·CSP·숨은 창 페인트 판단, 틀리면 설계가 무너진다 | probe 결과가 `.scratch/`에 있고 design.md에 고른 방법과 이유 | 완료 339d68a1c(워커 브랜치) |
| B | T2 순수 함수, T3 캡처 | `app/src/main/thumbnailWindow.ts`(+test), 필요하면 `thumbnails.ts`·`thumbnailCache.ts`(+test), 새 순수 함수 파일 | A 검토 | 같은 워커(Opus high): 캔버스가 만든 값을 main이 검사하는 신뢰 경계 | `npm --prefix app test`(red→green), `typecheck`, `lint` | 완료 11431b2bb..fdb58e1cb, verify PASS(워커) |
| R | B 리뷰 | 보고만 | B | Codex Astra medium: 다른 계열의 독립 리뷰, 신뢰 경계 판단 | `/code-review` 보고 | 완료(리뷰 🔴2 → 재리뷰 🔴0) |
| C | T4 실기 확인 | `.scratch/canvas-thumbnail-frame/` | R 🔴 0 | 같은 워커 | 항목별 기대값·스크린샷 | 1차 PASS, 수정 2차 뒤 일부 재확인 |
| D | T5 승격과 정리 | ARCHITECTURE, PRODUCT, BACKLOG, `docs/design/*.md`, 기능 디렉터리 | C | 컨덕터 | 문서 확인, 통합 HEAD `/verify` | 대기 |

## 겹침과 순서

- A → B → R → C → D 직렬. 이 링크 안에서 병렬 배치는 없다.
- 다른 링크 2 컨덕터와 겹치는 코드 파일은 없다(`styles.css`도 이 링크는 바꾸지 않을 것으로 본다).
