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

## Codex 사용

- chain 상시 권한(링크 2의 모든 작업). 시작 때 Codex 주간 사용량 16%(rollout `window_minutes: 10080`).
- 실제로 쓴 범위: (진행하며 적는다)

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1 PoC | `.scratch/canvas-thumbnail-frame/`, `design.md` 'PoC 결과' | — | Claude Opus high: Electron OOPIF·CSP·숨은 창 페인트 판단, 틀리면 설계가 무너진다 | probe 결과가 `.scratch/`에 있고 design.md에 고른 방법과 이유 | 대기 |
| B | T2 순수 함수, T3 캡처 | `app/src/main/thumbnailWindow.ts`(+test), 필요하면 `thumbnails.ts`·`thumbnailCache.ts`(+test), 새 순수 함수 파일 | A 검토 | 같은 워커(Opus high): 캔버스가 만든 값을 main이 검사하는 신뢰 경계 | `npm --prefix app test`(red→green), `typecheck`, `lint` | 대기 |
| R | B 리뷰 | 보고만 | B | Codex Astra medium: 다른 계열의 독립 리뷰, 신뢰 경계 판단 | `/code-review` 보고 | 대기 |
| C | T4 실기 확인 | `.scratch/canvas-thumbnail-frame/` | R 🔴 0 | 같은 워커 | 항목별 기대값·스크린샷 | 대기 |
| D | T5 승격과 정리 | ARCHITECTURE, PRODUCT, BACKLOG, `docs/design/*.md`, 기능 디렉터리 | C | 컨덕터 | 문서 확인, 통합 HEAD `/verify` | 대기 |

## 겹침과 순서

- A → B → R → C → D 직렬. 이 링크 안에서 병렬 배치는 없다.
- 다른 링크 2 컨덕터와 겹치는 코드 파일은 없다(`styles.css`도 이 링크는 바꾸지 않을 것으로 본다).
