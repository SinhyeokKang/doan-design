# composer-long-paste-chip — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 초안: `.doan/canvases/composer-long-paste-chip.html`(사용자 확정).
- 시작 해시: `4173ed767`(origin/develop). 통합 브랜치: `feat/composer-long-paste-chip`(리드가 만듦, 이 워크트리).
- conductor 런타임: Claude Code. 워커는 Claude(Sonnet·Opus, effort 최대 high) 또는 Codex `gpt-6.1-sol`(effort 최대 high).

## 결정 기록

- 배치는 하나씩 차례로 돌린다. 병렬로 돌리지 않는다(사용자 지시).
- 워커는 Claude(Sonnet·Opus, effort 최대 high)나 Codex를 쓴다. 이번 실행은 Codex로 넘어가도 된다. Codex 워커는 `gpt-6.1-sol`(effort 최대 high)만 쓰고 `gpt-6-astra`는 쓰지 않는다(사용자 지시, 구독 한도).
- 작업 5(실제 에이전트 턴): AGENTS.md 'Real agent sign-ins'대로 실제 로그인을 격리된 임시 HOME에 복제해도 된다. 복제본을 격리 앱의 Doan 프로필에 넣는 절차는 워커가 찾는다. 끝나면 모든 복사본과 임시 Keychain 항목을 지우고, 실제 로그인이 그대로 동작하는지 확인한다(사용자 지시).
- `.doan/canvases/composer-long-paste-chip.html`은 사용자가 확정한 초안이고, 이 칩들의 `/design-sync` 기준이다(사용자 지시).
- 주간 Claude 사용량이 94% 근처라 구현·실제 앱 배치는 Codex `gpt-6.1-sol`에 맡기고, 리뷰는 다른 모델 계열의 눈으로 보도록 Claude Sonnet에 맡긴다(conductor 판단 — 사용자 맥락과 결정 2).
- 작업 1·2는 한 배치(A)로 묶는다. 작업 1의 main 쪽 순수 함수(`pasteTextRequest`, `pastedTextAttachments`, `cleanupTargets`)가 작업 2의 파일에 있고, 배치를 나눠도 차례로 돌기 때문이다. 커밋은 tasks의 커밋 경계대로 나눈다(conductor 판단 — tasks.md).
- `/design-sync`는 작업 3을 구현한 워커(B)가 리뷰 수정 뒤에 한다. 구현 맥락이 필요하다(conductor 판단 — 이전 orch 관행).
- 작업 6(문서 승격)과 최종 게이트는 conductor가 통합 브랜치에서 한다(conductor 판단 — orchestrate §4·§5).
- design.md 'PoC 의존'의 세 가정이 작업 5에서 깨지면 그 공급자를 어떻게 할지 사용자에게 묻는다(design.md).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A 구현 | 작업 1, 2 | renderer 순수 함수(`homeComposer.ts` 등)와 테스트, `main/attachments.ts`, `attachmentHandlers.ts`, `senderAllowed.ts`, `main/index.ts`, preload 두 곳, `conversation/acpRunner.ts`, 드래프트 저장소 읽기, fence 주석, 각 테스트 | 없음 | Codex sol high — IPC 발신자 목록·`O_NOFOLLOW`·시작 시 삭제가 걸려 단계가 많다 | `npm --prefix app test`·`typecheck` | 대기 |
| RA 리뷰 | A의 `/code-review` | 읽기만 | A | Claude Sonnet high — 다른 계열의 독립 리뷰, 보안 경계 판단 | 보고서 | 대기 |
| A 수정 | RA의 🔴/🟡 | A와 같음 | RA | A 워커 그대로 | A와 같음 | 대기 |
| B 구현 | 작업 3 | `HomeComposerView.tsx`, `DockedComposer.tsx`, `ProjectOverview`, `CanvasConversationPanel.tsx`, 프로토타입 창 대화, `homeComposer.ts` 문구·칩 표기, `ConversationThread.tsx`, 큐 행, 각 테스트 | A 통합 | Codex sol high — 호스트 넷과 상태가 많아 단계가 많다 | `npm --prefix app test`·`lint`·`typecheck` | 대기 |
| RB 리뷰 | B의 `/code-review` | 읽기만 | B | Claude Sonnet high — 다른 계열의 독립 리뷰 | 보고서 | 대기 |
| B 수정 | RB의 🔴/🟡 | B와 같음 | RB | B 워커 그대로 | B와 같음 | 대기 |
| B design-sync | 칩 `/design-sync` | B + 해당 `docs/design/*.md` | B 수정 | B 워커 그대로 — 구현 맥락이 필요 | `/design-sync` 차이 0 또는 문서화 | 대기 |
| D 실제 앱 | 작업 4 | 읽기만(결함은 B 워커로) | B design-sync 통합 | Codex sol medium — 정해진 probe 목록을 따른다 | `/runtime-test` 보고서, 항목별 통과 | 대기 |
| E 실제 턴 | 작업 5 | 읽기만(결함은 소유 워커로) | D | Codex sol high — 로그인 복제·정리와 공급자 다섯의 fence 확인 | 공급자별 인용·fence 두 방향·실제 로그인 확인 | 대기 |
| C 문서 | 작업 6 | PRODUCT, ARCHITECTURE, BACKLOG, DESIGN, feature 디렉터리 삭제 | E | conductor | tasks 6 grep 검증 | 대기 |
| C 게이트 | 최종 | — | C 문서 | conductor | `node .agents/skills/verify/scripts/verify.mjs` PASS | 대기 |

- 겹침: A와 B는 `homeComposer.ts`를 함께 고친다. 모든 배치를 차례로 돌린다.
- tasks 항목 대응: 1·2 → A, 3 → B, 4 → D, 5 → E, 6 → C 문서.

## 리뷰·검증 기록

(진행하며 적는다)
