# quick-open-conversations — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261113-2](../chain-261113-2/chain.md) 링크 1. 권한은 체인 파일을 따른다.
- 시작 hash: `11bf5a9d`
- 통합 브랜치: `feat/quick-open-conversations` (lead가 `origin/develop`에서 만들었다)
- 런타임: Claude Code만 쓴다. 모델 계열을 넘지 않는다.

## 결정 기록

- 범위·문구·아이콘·토스트·포커스·순위는 spec과 design의 '초안 리뷰에서 정한 것'에 이미 정해져 있다. 새로 물을 결정은 없다(conductor 판단 — spec·design에 답이 있다).
- 배치를 하나의 워커로 직렬 진행한다(conductor 판단 — tasks 2~6이 모두 `quickOpen.ts`·`QuickOpenDialog.tsx`·`homeRun.ts`·`App.tsx`를 함께 바꿔 병렬로 나눌 파일이 없다).
- tasks 7(검증과 문서 승격)은 conductor가 통합 뒤에 한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 2~4 (`/tdd` → `/implement` → 화면 연결, `/ship bypass` push 전까지) | `app/src/renderer/{canvasConversationRows,quickOpen,QuickOpenDialog,homeRun,App}*` 와 그 테스트 | 없음 | Opus high — App의 `pick`·포커스·방문 기록과 POSTMORTEM 함정(렌더 시점 ref, main import)을 판단해야 한다 | `npm --prefix app test`, `run typecheck`, `run lint` | 대기 |
| B | tasks 5~6 (`/design-sync`, `/runtime-test`) | A와 같은 파일, `docs/DESIGN.md` 'Quick Open', `.scratch/` | A 리뷰 통과 | Opus high — A와 같은 워커에 새 Task로 보낸다(맥락 재사용). 실제 앱 측정과 포커스·방문 확인이 필요하다 | `node .scratch/design-sync/<screen>/measure.mjs`, runtime-test 스크린샷·probe | 대기 |
| R | 전체 diff 독립 리뷰(`/code-review`, 보고만) | 없음(읽기만) | A·B | Opus high — 포커스·방문 기록·같은 화면 판정의 경계 조건을 봐야 한다 | 🔴 0 | 대기 |
| 7 | `/verify`, PRODUCT·DESIGN·ARCHITECTURE 승격, feature 디렉터리 삭제 | 문서 | R | conductor | `node .agents/skills/verify/scripts/verify.mjs` | 대기 |

## 파일 겹침과 순서

- A와 B는 같은 파일을 바꾸므로 직렬이다. 같은 워커와 worktree를 쓴다.
- 체인 링크 2(`usage-limit-resume`)도 `homeRun.ts`·`App.tsx`를 바꾼다. 이 링크가 병합된 뒤 시작한다.

## tasks 매핑

- 1 → 완료(초안, `7431dc49`)
- 2·3·4 → A
- 5·6 → B
- 7 → conductor

## 진행 기록

- 배치 A 시작: dispatch `ctx_8d108fed9c97`, worktree `qoc-batch-a`, Opus high(launch 확인). Run `run_b490604baf71`.
- 배치 A 1차 보고(16:27): tasks 2~4 커밋 `57d773d6`·`3e7ea98c`·`fb156171`·`fbea7b7e`, test·typecheck·lint 통과. 사용량 한도로 /code-review·/refactor를 못 했다. 계획과 다른 점: `openFound`가 캔버스 행 목록을 받아 다시 판정, `groupResults` 그대로, `conversationDelete.ts`의 `quoted()` export.
- 18:10 한도 리셋 뒤 같은 워커에 /ship 5~7단계를 후속 Task로 보냈다(dispatch `ctx_d06065f1ccf3`).
- 배치 A 리뷰·정리 완료: 🔴 0, 🟡 1 수정(`3c9aa5a9`). 남긴 ⚪: `canvasRow`가 `conversationCanvasMatch`를 쓰게 되어 ID가 중복된 캔버스 대화의 알림 Open은 첫 행 대신 Overview로 간다(design이 요구한 변경, conductor 판단으로 수용, PR 본문에 적는다). 빈 제목 행의 이름은 비어 보인다(spec에 규칙 없음).
- 배치 B 시작: 같은 워커에 후속 Task(dispatch `ctx_eb1c2faaadf7`). lead에 GUI again을 보냈다.
- 배치 B 완료: design-sync 구현 결함 0(`57fa9f57` DESIGN.md), runtime-test 기대값 5개 모두 통과, tasks 5~6 체크(`73b88231`). 코드 변경 없음. real-state 검사는 probe 여러 번에서 실패했다. 실행 중인 사용자 `/Applications/Doan.app`(pid 18002, codex 자식이 agent-auth WAL을 쥠)이 쓴 것으로 보고 받아들였다(conductor 판단 — 격리 앱은 임시 userData만 썼고, measure run5는 통과). 토스트의 missing·duplicate 원인은 단위 테스트로만 확인했다.
- lead에 GUI done을 보냈다. 독립 리뷰 R을 Claude Opus subagent로 시작했다.
- 독립 리뷰 R: 🔴 0, 🟡 3, ⚪ 5. 사용자 결정: 알림·strip의 Open은 출시된 `canvasRow` 규칙을 유지하고, 새 판정은 Quick Open에서만 쓴다(design의 canvasRow 줄은 승격 때 반영하지 않는다). conductor 판단: 빈 제목 대화 행은 Conversation 메뉴처럼 빈 이름 그대로 둔다.
- 수정 라운드 1을 워커에 보냈다(dispatch `ctx_d76624db8bab`): 실패 시 Escape와 같은 닫기 경로, canvasRow 되돌리기, 기다림 판정 통일, 색인 memo 분리, DESIGN.md 옛 문구, 빈 검색어 동점 순서. lead에 GUI again을 보냈다.
- 수정 라운드 1 완료: `0c422188` test, `8c36d9ca` fix, `b2183b28` docs(DESIGN). test 11128 통과, typecheck·lint 통과(워커 보고). probe 8개 검사 통과. real-state 검사는 다시 실패했다: probe의 `app.hide()`가 사용자의 실제 Doan.app을 앞으로 가져와 그 앱이 자기 ui-state를 저장한 것으로 본다(증명 안 됨). conductor가 수정 diff를 직접 읽고 받아들였다.
