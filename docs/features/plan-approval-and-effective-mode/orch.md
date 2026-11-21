# plan 승인과 실제 권한 모드 — orch

- 출처: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 시작 해시: `579375fd8`
- 통합 브랜치: `feat/plan-approval-and-effective-mode` (리드가 만들었다. conductor는 브랜치를 만들거나 바꾸지 않는다)
- conductor: Claude Code (Opus 5.5). 리드: `term_83e6e9ba-317a-4f82-af95-b88a7720b687`

## 결정 기록

- 모델: Claude 워커만 쓴다(Sonnet·Opus, effort는 high까지). 사용자가 Codex로 넘어가는 것을 허락하지 않았다(리드 brief).
- C1(`/design-draft`)은 끝났다: `.doan/canvases/permission-run-mode.html`(frame 4개)을 사용자가 앱에서 확정했다(`579375fd8`). 이 초안이 C4 `/design-sync`의 기준이다.
- 두 줄기: Claude 줄기(P1 → C2 → C3 → C4)와 Antigravity 줄기(P2 → 결정 게이트 → A1). Claude 줄기는 게이트를 기다리지 않는다(tasks.md).
- P1과 P2는 병렬로 돌린다: conductor 재량 — 둘 다 `.scratch/`에서만 probe를 돌린다. design.md를 둘 다 고쳐야 하므로, P2 워커는 probe 단계에서 문서를 고치지 않고 결과를 핸드오프에만 적는다. 결정 게이트 뒤 같은 워커가 P1이 통합된 통합 브랜치를 merge하고 문서 커밋(`docs(feature): … P2 results and scope`)을 만든다.
- 실제 로그인(P1 Claude, P2 Antigravity, `/runtime-test`): real HOME, 유지된 provider profile `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`를 복사해서 쓴다. 원본에서 로그아웃하거나 지우지 않는다(다른 기능도 쓴다). 확인이 막히면 건너뛰지 않고 사용자에게 넘긴다.
- P1 probe의 `defaultMode` 설정은 `.scratch/` 아래 임시 프로젝트의 `.claude/settings.json`에만 둔다. 이 repo의 `.claude/settings.json`은 건드리지 않는다: conductor 재량.
- P1이 Accept edits·Plan·Full access 이름을 확인하면 초안 `--revise`(DR 배치)가 C4 `/design-sync` 전에 필요하다. 독립 리뷰를 거친 뒤 사용자가 앱에서 본다(리드 brief).
- C2와 C3는 같은 워커가 이어서 한다(C3는 C2 통합 뒤 새 Task): conductor 재량 — 같은 저장 조건 함수와 service 경로를 다룬다.
- C4의 `/runtime-test`는 conductor가 통합 HEAD에서 한다(orchestrate §4).
- A1 전에 리드에게 알린다. 리드가 `fix/antigravity-stop-tool-group` PR의 머지 여부를 알려 주면 `origin/develop`을 먼저 merge한다(`acpRunner.ts`·`acp.ts`·`commandView.ts` 겹침).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P1 | tasks C0 | `.scratch/poc-p1/`, design.md 'PoC 의존' P1과 '표시' 이름 목록, spec.md 완료 조건 | 없음 | Claude Opus medium — 실제 계정으로 여러 설정을 관찰하고 결과를 문서 결정에 옮긴다. 틀리면 표시 목록이 잘못된다 | frame 기록, 문서 커밋 | 대기 |
| P2 | tasks A0 probe | `.scratch/poc-p2/` (문서는 게이트 뒤 후속 Task) | 없음 | Claude Opus medium — ACP protocol 관찰과 (a)·(b)·(c) 판정 | frame 기록, 핸드오프 | 대기 |
| GATE | tasks A0 결정 게이트 | — | P2 | conductor가 사용자에게 묻는다 | spec '미정'이 빔 | 대기 |
| P2-doc | tasks A0 문서 커밋 | spec·design·tasks의 Antigravity 부분 | GATE, P1 통합 | P2 워커 후속 Task | 문서 커밋 | 대기 |
| DR | 초안 `--revise` (P1 결과에 따라) | `.doan/canvases/permission-run-mode.html` | P1 통합 | Claude Sonnet high — 기존 초안에 상태 몇 개를 더하는 일, 규약은 skill이 정한다 | `doan check`·`doan ls`, 독립 리뷰, 사용자 확인 | P1 결과 대기 |
| C2 | tasks C2 | `app/src/main/conversation/transport.ts`·`store.ts`·저장 조건 순수 모듈(또는 `service.ts`의 순수 함수)·`permissionMode.ts`(필요하면), `app/src/renderer/permissionPicker.ts`와 각 테스트 | P1 통합 | Claude Opus high — 턴·init·승인 조건이 여러 경로에 걸치고, 틀리면 오래된 모드가 보인다 | `npm --prefix app test`(`rendererImports.test.ts` 포함), typecheck | 대기 |
| C2-rev | C2 리뷰 | 없음(보고만) | C2 | Claude Opus high | `/code-review` 보고 | 대기 |
| C3 | tasks C3 | `runners.ts`·`service.ts`·`summary.ts`와 각 테스트 | C2 통합 | Claude Opus high(C2 워커 후속 Task) — 한 번의 index 저장, steer·queue·실패 경로 | `npm --prefix app test`, typecheck | 대기 |
| C3-rev | C3 리뷰 | 없음(보고만) | C3 | Claude Opus high | `/code-review` 보고 | 대기 |
| C4 | tasks C4(`/design-sync` 포함) | `ProjectOverview.tsx`·`CanvasConversationPanel.tsx`·`DockedComposer.tsx`·`ComposerParts.tsx`·`styles.css`와 테스트, `docs/design/<group>.md`·DESIGN.md 색인 | C3 통합, DR 사용자 확인(DR이 있을 때) | Claude Opus medium — UI 연결과 computed style 측정, 절차는 skill이 정한다 | `npm --prefix app test`, lint, `/design-sync` 기록 | 대기 |
| C4-rev | C4 리뷰 | 없음(보고만) | C4 | Claude Opus medium | `/code-review` 보고 | 대기 |
| A1 | tasks A1 | 게이트가 정한 범위(`commandView.ts`, `acpRunner.ts`·`acp.ts` 가능) | GATE, 리드 확인 | 게이트 뒤 정한다 | 게이트 뒤 정한다 | 대기 |
| conductor | C4 `/runtime-test`, 최종 verify, 승격 | orch.md, PRODUCT·ARCHITECTURE·BACKLOG, feature 디렉터리 삭제 | 전부 | — | `/runtime-test`, verify, `grep -rn "plan-approval-and-effective-mode" docs/ AGENTS.md .agents/ app/` | 대기 |

- 겹침: P1과 P2는 파일이 겹치지 않는다(위 결정). C2 → C3 → C4는 직렬이다. DR은 `.doan/canvases/`만 고치므로 C2·C3와 병렬로 돌 수 있다. A1은 C2·C3와 파일이 겹치지 않는다(`acpRunner.ts`·`acp.ts`·`commandView.ts`). 범위가 `permissionPicker.ts`나 composer에 닿으면 C4 뒤로 미룬다.
- tasks 체크 항목: C0 → P1, C1 끝, C2 → C2(테스트·구현), C3 → C3(테스트·구현), C4 → C4(테스트·구현), `/runtime-test` → conductor, A0 probe → P2, A0 게이트 → GATE, A1 → A1, 최종 verify·승격 → conductor. 주인 없는 항목은 없다.
