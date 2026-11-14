# prototype-conversation-panel — orch

- 계획: [tasks.md](./tasks.md), [spec.md](./spec.md), [design.md](./design.md)
- 시작 hash: aa22f31e1 (develop, 링크 3 PR #192 병합 포함)
- 통합 브랜치: `feat/prototype-conversation-panel` (lead가 만들었다)
- 지휘: Claude Code. 모델 교차 없음(Claude 워커만).

## 결정 로그

- 지휘자 판단 — 시작 전에 사용자에게 새로 물을 것은 없다. spec 결정 1–16이 범위를 정했고, 사용자 확인이 남은 것은 tasks 4의 초안 확인뿐이다. 근거: spec '결정', tasks 4.
- 지휘자 판단 — PoC(tasks 2)와 `/runtime-test`(tasks 10)의 네이티브 입력은 design.md 'PoC 의존'대로 computer-use로 준다. 두 배치가 화면을 함께 쓰지 않도록 GUI 확인은 한 번에 한 워커만 한다.
- 지휘자 판단 — 실제 턴이 필요한 확인은 main checkout의 `.scratch/provider-profile`(링크 3이 쓴 공유 프로필)을 제자리에서 쓴다. 근거: tasks 10, design.md 'PoC 의존'.
- 지휘자 판단 (A 질문) — develop에서는 목록을 읽는 중·읽기 실패에도 composer가 그려지고 포커스를 받는다(`CanvasConversationPanel.tsx:514`). composer가 없는 것은 창이 첫 view를 받기 전뿐이다(`PrototypeConversation.tsx:14`). 결정 11은 그대로 두고 "받을 수 없는" 상황을 '창이 첫 view를 받기 전'으로 고친다. 막힌 composer도 포커스를 받으므로(`ComposerParts.tsx:163`, readOnly만 바뀜) design.md '포커스'의 조건대로 포커스를 옮기지 않는다. 근거: 사용자 결정의 내용은 바뀌지 않고 전제 사실만 develop에 맞춘다.
- 지휘자 판단 — tasks 11의 `/verify`와 tasks 12의 승격은 지휘자가 통합 HEAD에서 한다(orchestrate §4·§5).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 1, 2 | `docs/features/prototype-conversation-panel/{design,spec,tasks}.md`, `.scratch/prototype-conversation-panel/` | 없음 | Opus high — develop 코드와 문서 대조, 네이티브 입력 PoC 판정이 틀리면 UI 배치 전체가 흔들린다 | 대조표 모든 행, `node .scratch/prototype-conversation-panel/poc-drag.mjs` exit 0, 네이티브 입력 결과 기록 | 대기 |
| B | tasks 4 | `.doan/canvases/prototype-conversation-panel.html` | 없음 | Opus medium — 캡션·타일 수정이 대부분이지만 숫자와 출시된 머리 모양을 정확히 옮겨야 한다 | `doan check`, `doan ls`, 지휘자 리뷰, 사용자 앱 확인 | 대기 |
| C | tasks 5, 6, 7, 8 | `app/src/main/prototype/fit.ts`·`controller.ts`, `app/src/main/prototypeWindow.ts`, `app/src/main/exportViewer.test.ts`, `app/src/renderer/ConversationPanel.tsx`, `app/src/renderer/prototype/*`, `app/src/renderer/styles.css` (+ 각 테스트) | A 통합 | Opus high — 격자 배치, 포커스 이동, 맞춤 기하, clip 불변식이 얽혀 있다 | `npm --prefix app test`, `typecheck`, `lint`, `build` | 대기 |
| C2 | tasks 9, 10 | C와 같은 파일, `docs/DESIGN.md`, `.scratch/design-sync/prototype-conversation-panel/`, `.scratch/runtime-test/prototype-conversation-panel/` | C 통합, B 사용자 확인 | Opus high (C 워커에 이어서) — 실제 앱 측정과 네이티브 입력 판정 | `measure.mjs` 차이 0 또는 문서화된 차이, `probe.mjs` exit 0 | 대기 |
| R | tasks 11 리뷰 | 보고만 | C2 통합 | Opus high — 독립 `/code-review` | 🔴 0 | 대기 |
| 지휘자 | tasks 11 `/verify`, tasks 12 승격 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, 이 디렉터리 삭제 | R 🔴 0 | — | `verify.mjs`, tasks 12의 grep | 대기 |

## 겹침과 순서

- A와 B는 파일이 겹치지 않아 동시에 돈다.
- C는 A를 기다린다. PoC가 실패하면 design.md가 바뀌고, C가 그 design.md를 읽기 때문이다.
- C2(`/design-sync`)는 B의 초안을 사용자가 확인한 뒤에 돈다. 초안이 기준이기 때문이다.
- A의 PoC와 C2는 둘 다 화면과 네이티브 입력을 쓰지만 순서상 겹치지 않는다.
- tasks 3은 끝났다(8cd00821e). 모든 체크 항목이 위 한 행에 속한다.

## 리뷰·검증 기록

(진행하며 적는다)
