# canvas-chip — orch

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)

- 시작 hash: `8681e6a16` (origin/develop)
- 통합 브랜치: `feat/canvas-chip` (lead가 만들었다)
- 끝: `feat/canvas-chip` push와 develop 대상 PR. merge는 lead가 한다.

## 결정 기록

1. T2(드래프트)는 끝났다. 사용자가 `.doan/canvases/canvas-chip.html`을 확정했다(`c662fa369`). 이 run에서 다시 하지 않는다(lead 브리프).
2. T1(PoC)은 아직 하지 않았다. design.md에 'PoC 결과'가 없다. 그래서 이 run의 첫 batch로 돈다(conductor 판단 — tasks T1).
3. 선행 과제 check-scope와 thread-polish는 develop에 머지됐다. `git ls-tree origin/develop docs/features/check-scope docs/features/thread-polish`의 출력이 비어 있다(conductor 확인).
4. 놓일 자리 표시는 widget decoration으로 한다. PoC가 `prosemirror-dropcursor`를 고르지 않았으므로 새 의존성은 없다(conductor 판단 — design 'PoC 결과').
5. 모델 교차는 없다. Claude worker만 띄운다(AGENTS 'Runtime differences').
6. T8(승격과 정리)은 conductor가 문서 커밋으로 한다(orchestrate §5).
8. 칩의 이름과 tooltip 경로는 보내기 전에도 캔버스 id로 지금 이름을 따라간다. spec '확정한 결정'("칩은 캔버스 id로 따라간다")과 완료 조건 4가 이미 정했다. 방식은 리뷰 추천 (a)로 한다: B가 root 목록으로 캔버스 앵커의 `path`를 갱신하는 순수 함수를 만들고, C가 composer에, E가 보낸 칩에 연결한다(conductor 판단 — 호출처가 늘지 않는다).
7. T6의 실제 eval 회차는 개발용 실제 로그인을 복사본으로 쓴다(AGENTS 'Real agent sign-ins').

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| P | T1 | `.scratch/canvas-chip/`, design.md 'PoC 결과' | 없음 | Opus medium — Electron 끌기 동작을 관찰하고 방식을 골라야 한다 | tasks T1 검증 | 통합 `08e73c4dc`. 확인하지 못한 것: 막 없이 iframe이 놓기를 받는지, 드래그 이미지 모습, 포커스된 창의 caret(T7로 넘긴다) |
| A | T3 | `main/conversation/{types,prompt,store,messageText}.ts`, `renderer/{anchorField,chipField}.ts`의 거울 부분, 그 테스트 | 없음 | Opus medium — 모든 batch가 기대는 형식이다. 범위는 좁다 | tasks T3 검증(`verify.mjs --eval` 포함) | 통합 `c2feb0f49`, `f44aad8c4`. 리뷰 1회. 테스트 보강(⚪1·2)을 후속 Task로 보냈다 |
| B | T4 | `main/conversation/ipc.ts`, 판정·클립보드·Home 변환 순수 함수와 테스트 | A | Opus high — 보낼 때 경로 확인은 신뢰 경계이고 번호 다시 매기기가 틀리면 프롬프트가 깨진다 | tasks T4 검증 | 진행 중 |
| C | T5a | `ShellSidebar.tsx`(drag), `chipField.ts`(drop), `fieldDecorations.ts`, 보드 막, 이유 줄 | B, P | Opus high — 끌기와 ProseMirror drop, 트리 키보드 보존 | tasks T5a 검증 + test·typecheck·lint | 대기 |
| D | T5b | `canvasRowMenu.ts`, `ShellSidebar.tsx`(메뉴), composer 등록 | C | Opus medium — 판정은 B·C에 있고 연결과 포커스 처리가 남는다 | tasks T5b 검증 + test·typecheck·lint | 대기 |
| E | T5c | `ConversationThread.tsx`(SentChip), `prototype/requests.ts`, 클립보드 붙이기 | D | Opus medium — 기존 `replyChipTarget`을 재사용한다 | tasks T5c 검증 + test·typecheck·lint | 대기 |
| F | T5d | `HomeComposerView.tsx`, `homeConversations.ts`, Home 초안·마지막 요청 | E | Opus high — Home 상태 모양을 바꾸고 복원 경로가 많다 | tasks T5d 검증 + test·typecheck·lint | 대기 |
| G | T6 | `eval/` 새 시나리오, `docs/usability-eval/rounds-2026-11.md` | A | Opus medium — 시나리오 설계와 실제 회차 | tasks T6 검증 | 진행 중 |
| H | T7 | `docs/design/`, `docs/DESIGN.md`, 필요한 `fix:`·`test:` | F | Opus high — 측정과 실기 확인, 고칠 곳을 판단한다 | tasks T7 검증 | 대기 |
| R* | 구현 batch 리뷰 | 없음(보고만) | 각 batch | A·D·E·G는 Sonnet high, B·C·F·H는 Opus high — diff 난이도에 맞춘다 | `/code-review` 보고 | 대기 |
| Z | T8 | PRODUCT, ARCHITECTURE, BACKLOG, USABILITY-EVAL, 기능 디렉터리 삭제 | 전부 | conductor | tasks T8 검증 | 대기 |

## 파일 겹침과 순서

- P와 A는 파일이 겹치지 않아 병렬로 돈다. P는 앱 코드를 바꾸지 않는다.
- B는 A의 형식에 기댄다. C는 B의 판정과 P의 표시 방식에 기댄다.
- C·D·E·F는 `ShellSidebar.tsx`, `chipField.ts`, App의 composer 등록을 함께 건드리므로 차례로 돈다.
- G는 `eval/`만 바꾸므로 A 통합 뒤 B–F와 병렬로 돈다.
- H는 F 통합 뒤에 돈다. GUI probe이므로 다른 worker의 GUI probe와 겹치지 않게 한다.

## 리뷰와 수정 기록

- P: 리뷰 없음(문서만). conductor가 'PoC 결과'를 handoff와 대조했다. C에 넘길 것: 항목 줄 시작에 놓으면 본문 시작으로 옮기는 보정, 지금 `insertChip`이 caret을 칩 앞에 두는 현상(포커스 없는 창에서 관찰).
- A: worker가 `ConversationThread.tsx`의 `CHIP_ICONS`에 `canvas` 한 줄을 더했다(conductor 승인 — `ChipLabel.kind`를 넓히면 typecheck가 깨진다). `validAnchor`는 import cycle을 피하려고 `validCanvas`를 import하지 않고 `canvasKind` + `CANVAS_ID`로 판정한다.
- RA(Sonnet high): 🔴 0 / 🟡 1 / ⚪ 6. 리뷰어가 약 2.6만 경로로 `validAnchor`가 `validCanvas`보다 약하지 않음을 확인했다.
  - 🟡 1(보내기 전 이름 따라가기의 자리가 없다): 결정 8로 B·C·E에 나눴다.
  - ⚪ 1·2(테스트 보강): A에 후속 Task로 보냈다. ⚪ 3(클립보드에서 `canvasKind` 거르기)과 "보낼 때 앵커 path를 믿지 않는다" 테스트는 B에 넣었다. ⚪ 4·5(보낸 칩의 `ds/` 아이콘, 프로토타입 `chip` 분기)는 E에, ⚪ 6(`chipField.ts` 주석)은 C에 넘긴다. 클립보드 JSON에 `root`를 더할 때 `v`를 올릴지는 E가 정한다.
