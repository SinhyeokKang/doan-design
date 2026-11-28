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
9. 드래프트 `copy` 프레임에 없던 이유 문구 두 개는 B의 임시안으로 정한다: pick 중 "Finish or cancel the pick first.", IME 조합 중 "Finish typing first."(사람, AskUserQuestion). 프로토타입 창은 따로 문구를 두지 않고 "Open Home, the Overview or a canvas to add this to a message."를 쓴다(conductor 판단 — 사이드바가 없고 다른 창의 끌기는 메모리 끌기가 없어 받지 않으므로 거의 보이지 않는다). 드래프트 `copy` 프레임에도 더한다(H가 design-sync 때).
10. 캔버스 앵커는 큐에 넣을 때와 usage limit로 미뤄 둘 때 바꾸지 않고, 실제로 나갈 때(start, 즉시 send, flush, Send now)만 지금 경로나 이름으로 바꾼다. design '보낼 때'의 "큐와 Send now는 실제로 나갈 때 같은 처리를 거친다"를 따른 것이다(conductor 판단 — 큐에 넣는 때는 에이전트가 그 캔버스를 고치는 때라, 그때 바꾸면 칩을 잃는다). 승격 때 ARCHITECTURE에 이 규칙으로 적는다.
11. 보내는 중인 composer는 캔버스 칩(놓기와 행 메뉴)을 받지 않는다. 이유 문구는 "Wait for the message to send."이다(사람, AskUserQuestion). 받으면 보낸 글이 칩과 함께 필드에 남아 다시 보낼 위험이 있다. 드래프트 `copy` 프레임에도 더한다(H).
12. 드래프트의 `.drop-caret` margin을 구현의 순 너비 0 값으로 고친다(conductor 판단 — 드래프트 문구 "Nothing moves until the drop"이 이미 그 결정이다. 'Draft follows decisions'). H가 design-sync 때 한다.
13. 행 메뉴의 꺼진 이유는 확정 드래프트대로 항목 라벨 아래 줄과 접근성 설명으로 보인다. spec 완료 조건 2와 tasks T5b의 "tooltip"은 이 결정으로 대신한다(conductor 판단 — 사용자가 확정한 드래프트가 모습의 기준이고(spec 완료 조건 10), 같은 문장을 tooltip으로 한 번 더 띄울 이유가 없다). 승격 때 PRODUCT에 이 방식으로 적는다.
7. T6의 실제 eval 회차는 개발용 실제 로그인을 복사본으로 쓴다(AGENTS 'Real agent sign-ins').

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| P | T1 | `.scratch/canvas-chip/`, design.md 'PoC 결과' | 없음 | Opus medium — Electron 끌기 동작을 관찰하고 방식을 골라야 한다 | tasks T1 검증 | 통합 `08e73c4dc`. 확인하지 못한 것: 막 없이 iframe이 놓기를 받는지, 드래그 이미지 모습, 포커스된 창의 caret(T7로 넘긴다) |
| A | T3 | `main/conversation/{types,prompt,store,messageText}.ts`, `renderer/{anchorField,chipField}.ts`의 거울 부분, 그 테스트 | 없음 | Opus medium — 모든 batch가 기대는 형식이다. 범위는 좁다 | tasks T3 검증(`verify.mjs --eval` 포함) | 통합 `c2feb0f49`, `f44aad8c4`. 리뷰 1회. 테스트 보강(⚪1·2)을 후속 Task로 보냈다 |
| B | T4 | `main/conversation/ipc.ts`, 판정·클립보드·Home 변환 순수 함수와 테스트 | A | Opus high — 보낼 때 경로 확인은 신뢰 경계이고 번호 다시 매기기가 틀리면 프롬프트가 깨진다 | tasks T4 검증 | 통합 `585544720`–`bd8ad9004`. 리뷰 1회, 수정 1회(conductor가 수정 diff를 직접 확인했다) |
| C | T5a | `ShellSidebar.tsx`(drag), `chipField.ts`(drop), `fieldDecorations.ts`, 보드 막, 이유 줄 | B, P | Opus high — 끌기와 ProseMirror drop, 트리 키보드 보존 | tasks T5a 검증 + test·typecheck·lint | 통합 `804af5a01`–`c0cacf25f`. 리뷰 1회, 수정 1회(conductor가 끌기 끝 경로 diff를 확인했다). postmortem `7384a4632`. T7에서 볼 것: 실제 마우스 끌기 중에 move가 오지 않는지 |
| D | T5b | `canvasRowMenu.ts`, `ShellSidebar.tsx`(메뉴), composer 등록 | C | Opus medium — 판정은 B·C에 있고 연결과 포커스 처리가 남는다 | tasks T5b 검증 + test·typecheck·lint | 통합 `aeba4bcd0`–`a89de6b06`. 리뷰 1회, 수정 1회(conductor가 수정 diff를 확인했다). 수정 뒤 실기 probe는 다시 돌리지 않았다 |
| E | T5c | `ConversationThread.tsx`(SentChip), `prototype/requests.ts`, 클립보드 붙이기 | D | Opus medium — 기존 `replyChipTarget`을 재사용한다 | tasks T5c 검증 + test·typecheck·lint | 진행 중 |
| F | T5d | `HomeComposerView.tsx`, `homeConversations.ts`, Home 초안·마지막 요청 | E | Opus high — Home 상태 모양을 바꾸고 복원 경로가 많다 | tasks T5d 검증 + test·typecheck·lint | 대기 |
| G | T6 | `eval/` 새 시나리오, `docs/usability-eval/rounds-2026-11.md` | A | Opus medium — 시나리오 설계와 실제 회차 | tasks T6 검증 | 통합 `396214630`–`e1f4ac61e`. 리뷰 1회, 수정 1회. 새 시나리오 R13, 회차 `canvas-chip-r13-261128`에서 Claude·Codex 통과. 수정한 검사는 남긴 transcript에 손으로 다시 돌려 두 agent 모두 참이다(새 회차는 돌리지 않았다) |
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
- RG(Sonnet high): 🔴 0 / 🟡 1 / ⚪ 5, 결정 항목 2.
  - 🟡 1: `anchor_path_read`가 낱말을 글자 그대로 비교해서, 스크립트 안의 경로로 읽으면 fail로 센다. R13이 아직 머지 전이므로 부분 문자열 비교로 넓히고, glob 읽기의 한계는 rubric에 적는다(conductor 판단 — 넓히면 거짓 fail만 줄고 기록한 회차는 그대로 유효하다).
  - ⚪ 1·2·5는 G에 보냈다. ⚪ 3·4는 그대로 둔다(판정은 맞고 T6 범위 밖이다).
  - 결정 항목 1(decoy 범위): 지금 설계를 유지한다(conductor 판단 — 순서를 자동으로 재면 정상 탐색을 벌한다. judge가 transcript를 본다).
- B: worker가 계획보다 넓게 `service.ts`의 flush와 Send now에도 확인을 넣었다. 자체 리뷰에서 Send now가 sending으로 남는 버그를 찾아 고쳤다(`bca142012`).
- RB(Opus high): 🔴 0 / 🟡 1 / ⚪ 6. 모든 보내는 경로를 따라갔고 문구를 드래프트와 바이트 단위로 대조했다.
  - 🟡 1(큐에 넣을 때 바꾸면 칩을 잃는다): 결정 10으로 B에 고치게 했다.
  - ⚪ 1(이름 가장자리 중괄호)·4(빠진 테스트 둘)는 B에 보냈다. ⚪ 2·3·5는 한계로 두고 그 자리에 주석을 남긴다. ⚪ 6(composer가 등록되지 않은 화면의 문구)은 C·D·F 브리프에 넣는다: 접힌 캔버스 패널도 composer를 등록해야 한다.
- C: 기존 버그를 고쳤다. `insertChip`이 줄 중간과 필드 끝에서 caret을 칩 앞에 두었다(칩으로 시작하는 slice가 줄 시작 filler를 함께 가져오고, filler 정리 전에 caret을 계산했다). postmortem은 conductor가 통합 때 쓴다. 확인하지 못한 것: 드래그 이미지 모습, 실제 앱의 이유 줄(넣을 수 없는 행은 끌리지 않는다). T7로 넘긴다.
- RC(Opus high): 🔴 0 / 🟡 0 / ⚪ 8, 결정 항목 2. 결정 11·12로 정했다. ⚪ 1(이름 갱신이 필드를 다시 만든다)·2(원천 행이 사라지면 막이 남는다)·3(`gone` 알림 중에도 받는다고 답한다)을 C에 보냈다. ⚪ 5는 T7, ⚪ 6은 그대로, ⚪ 7·8(문서, postmortem)은 conductor가 한다.
- RD(Sonnet high): 🔴 0 / 🟡 1 / ⚪ 5, 결정 항목 2. U1(이유 표시 방식)은 결정 13. 🟡 1(누르는 순간 재판정이 거절하면 메뉴가 말없이 닫힌다)과 ⚪ 3(테스트가 순서로 항목을 고른다)은 D에 보냈다. ⚪ 1(접혀 있고 한 번도 포커스를 받지 않은 필드의 caret)은 T7 probe에 넣는다. ⚪ 5(Home에서 composer 없는 화면 문구)는 F가 Home을 등록하면 사라진다.
