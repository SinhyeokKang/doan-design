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
