# composer-list-hanging-indent — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인: [chain-261123-1](../chain-261123-1/chain.md) 링크 1.
- 시작 해시: `4c4a75c0c`(origin/develop). 통합 브랜치: `feat/composer-list-hanging-indent`(리드가 만듦, 이 워크트리).
- conductor 런타임: Claude Code. 워커도 Claude 모델만 쓴다(모델 경계 넘기 허가 없음).

## 결정 기록

- tasks 1(PoC)·2(시안)는 develop에서 끝났다. 링크는 tasks 3, 4, 6, 7, 8을 순서대로 한 배치로 한다(chain.md '순서' 링크 1).
- tasks 5(사람의 한글 IME 확인)는 링크에서 하지 않는다. 병합 뒤 리드가 사용자와 한다. PR 본문에 남았다고 적는다(chain.md, 사용자 지시).
- 범위에 더함: BACKLOG 'Known defects'의 "A composer at its eight-row maximum shows its caret out of view after code focuses it at its end"를 고친다. `focusFieldEnd`·`focus(true)`에서 코드가 놓은 커서도 보이게 스크롤하는지 Electron DOM 테스트로 고정하고, 다른 호출 경로(`CanvasConversationPanel.tsx` 패널 포커스, `App.tsx` 삭제 뒤 포커스, Home `focusEnd`, `ProjectOverview.tsx`)를 확인한 뒤 BACKLOG 항목을 지운다(chain.md, 사용자 지시).
- 호스트 composer 파일(`CanvasConversationPanel.tsx`, `HomeComposerView.tsx`, `ComposerParts.tsx`)을 고쳐야 하면 리드에게 먼저 알린다(chain.md 겹침 확인).
- 실제 앱 GUI probe(`/runtime-test`, `/design-sync`) 전에 리드에게 알린다(링크 2 probe와 겹치지 않게).
- 배치 하나로 진행: 변경이 입력란 하나에 모여 있어 나눌 이유가 없다(conductor 판단 — tasks.md 머리).
- 문서 승격(tasks 7)과 최종 게이트(tasks 8)는 conductor가 통합 브랜치에서 한다(conductor 판단 — orchestrate §4 docs freshness 커밋). `/design-sync`가 고치는 `docs/design/canvas-conversation.md`와 BACKLOG 커서 결함 삭제, 커서 결함 postmortem은 워커 배치에 들어간다.
- 본문 시작에서 ↓ 뒤 ↑ x가 9.3px 다른 PoC 관찰(design.md 'PoC 결과')은 워커가 구현 때 원인을 확인하고 지금 입력란과 같게 맞춘다(conductor 판단 — spec '편집' 화살표 기준).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A 구현 | tasks 3, 4, 커서 결함 | `app/src/renderer/chipField.ts`, 새 입력란 모듈, `styles.css`, `app/package.json`·`package-lock.json`, `chipField*.test.ts`, 커서 결함 BACKLOG 줄, postmortem | 없음 | Opus high — 편집기 전체를 다시 쓰고 IME·실행 취소·클립보드 회귀 위험이 크다 | `npm --prefix app test`·`typecheck`·`lint`·`build`, `/runtime-test` 짧은 probe | 대기 |
| R 리뷰 | A의 `/code-review` | 읽기만 | A | Opus high — 큰 diff와 편집 동작 판단 | 보고서 | 대기 |
| A 수정 | R의 🔴/🟡 | A와 같음 | R | A 워커 그대로 | A와 같음 | 대기 |
| A design-sync | tasks 6 | A + `docs/design/canvas-conversation.md` | A 수정 | A 워커 그대로 — 구현 맥락이 필요 | `/design-sync` 보고서 차이 0 또는 문서화 | 대기 |
| C 문서 | tasks 7 | PRODUCT, ARCHITECTURE, BACKLOG, `docs/design/canvas-conversation.md` 나머지, feature 디렉터리 삭제 | A design-sync 통합 | conductor | tasks 7 grep 검증 | 대기 |
| C 게이트 | tasks 8 | — | C 문서 | conductor | `node .agents/skills/verify/scripts/verify.mjs` PASS | 대기 |

- 겹침: A의 단계는 모두 직렬이다. 병렬 배치 없음.
- tasks 항목 대응: 3 → A, 4 → A·R·A 수정, 5 → 링크 밖(리드), 6 → A design-sync, 7 → C 문서, 8 → C 게이트.

## 리뷰·검증 기록

- 2026-11-23 A 1차(`ctx_cdc3bc4cd333`): 사용량 한도로 중단됐다. 커밋 없이 워크트리 `composer-indent-a`에 미커밋 작업이 남았다(ProseMirror 재작성, `fieldDoc.ts`·`fieldDecorations.ts`, DOM 테스트 28/32 통과). 남은 일과 실패 테스트 4건은 그 워크트리의 `.scratch/handoff-A.md`에 있다. PoC의 9.3px ↓/↑ 차이는 예전 inline-block 마커에서 온 것이라 옮기지 않았다고 워커가 보고했다(검토 필요).
