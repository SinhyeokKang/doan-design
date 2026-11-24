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
- 재시작 수명: 큐 시점의 `sent` 표시 규칙을 그대로 둔다. 큐·예약·전송 중·돌려받은 메시지는 기록 전에 이미 `sent` 표시를 받으므로, 시작 시 정리는 드래프트 저장소를 읽지 않고 `fromPaths`도 폴더를 다시 맡지 않는다. 복원한 칩을 지워도 파일이 남는 점은 BACKLOG 참조 카운트 한계로 받아들인다. spec 완료 조건 8, design, tasks를 이에 맞게 고쳤다(사용자 결정, RA 🟡2).
- 첫 줄이 빈 글의 툴팁은 spec대로 첫 줄(빈 문자열)을 쓴다(conductor 판단 — spec 완료 조건 4, RA D3).
- 저장소 루트를 정규화한다. 기본 userData가 정규화돼 있어도 수정이 값싸고 격리 실행이 링크 경로를 쓴다(conductor 판단 — RA 🔴1·D2).
- 큐 행 문구는 확정 초안을 따른다. 보이는 이름은 "Pasted text"이고, 줄 수와 첫 줄은 접근성 이름(`Pasted text, N lines — <첫 줄>`)과 툴팁에 둔다. 이에 맞춰 tasks.md 작업 3의 확인 문구를 고쳤다. 거절 문구의 어포스트로피도 초안과 기존 문구처럼 `’`로 spec을 고쳤다(conductor 판단 — 사용자 결정 4, RB 🟡1·⚪1).
- 붙여넣기 가드(입력기 조합 중·읽기 전용·전송 중·잠김)는 Finder 파일과 이미지 붙여넣기에도 먼저 적용된다. 그래서 이때는 아무 일도 일어나지 않는다. 받아들인다(conductor 판단 — spec 완료 조건 2의 취지, RB ⚪4).
- design.md 'PoC 의존'의 세 가정이 작업 5에서 깨지면 그 공급자를 어떻게 할지 사용자에게 묻는다(design.md).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A 구현 | 작업 1, 2 | renderer 순수 함수(`homeComposer.ts` 등)와 테스트, `main/attachments.ts`, `attachmentHandlers.ts`, `senderAllowed.ts`, `main/index.ts`, preload 두 곳, `conversation/acpRunner.ts`, 드래프트 저장소 읽기, fence 주석, 각 테스트 | 없음 | Codex sol high — IPC 발신자 목록·`O_NOFOLLOW`·시작 시 삭제가 걸려 단계가 많다 | `npm --prefix app test`·`typecheck` | 통합 `02ca24bb4` |
| RA 리뷰 | A의 `/code-review` | 읽기만 | A | Claude Sonnet high — 다른 계열의 독립 리뷰, 보안 경계 판단 | 보고서 | 🔴1 🟡2 ⚪5 |
| A 수정 | RA의 🔴/🟡 | A와 같음 | RA | A 워커 그대로 | A와 같음 | 1차로 끝남 |
| B 구현 | 작업 3 | `HomeComposerView.tsx`, `DockedComposer.tsx`, `ProjectOverview`, `CanvasConversationPanel.tsx`, 프로토타입 창 대화, `homeComposer.ts` 문구·칩 표기, `ConversationThread.tsx`, 큐 행, 각 테스트 | A 통합 | Codex sol high — 호스트 넷과 상태가 많아 단계가 많다 | `npm --prefix app test`·`lint`·`typecheck` | 통합 `6795bdc62` |
| RB 리뷰 | B의 `/code-review` | 읽기만 | B | Claude Sonnet high — 다른 계열의 독립 리뷰 | 보고서 | 🔴0 🟡2 ⚪4 |
| B 수정 | RB의 🔴/🟡 | B와 같음 | RB | B 워커 그대로 | B와 같음 | 1차로 끝남 |
| B design-sync | 칩 `/design-sync` | B + 해당 `docs/design/*.md` | B 수정 | B 워커 그대로 — 구현 맥락이 필요 | `/design-sync` 차이 0 또는 문서화 | 불일치 0, 문서화 27 |
| D 실제 앱 | 작업 4 | 읽기만(결함은 B 워커로) | B design-sync 통합 | Codex sol high — 네이티브 메뉴·Finder·재시작·프로토타입 창까지 단계가 많다 | `/runtime-test` 보고서, 항목별 통과 | 대기 |
| E 실제 턴 | 작업 5 | 읽기만(결함은 소유 워커로) | D | Codex sol high — 로그인 복제·정리와 공급자 다섯의 fence 확인 | 공급자별 인용·fence 두 방향·실제 로그인 확인 | 대기 |
| C 문서 | 작업 6 | PRODUCT, ARCHITECTURE, BACKLOG, DESIGN, feature 디렉터리 삭제 | E | conductor | tasks 6 grep 검증 | 대기 |
| C 게이트 | 최종 | — | C 문서 | conductor | `node .agents/skills/verify/scripts/verify.mjs` PASS | 대기 |

- 겹침: A와 B는 `homeComposer.ts`를 함께 고친다. 모든 배치를 차례로 돌린다.
- tasks 항목 대응: 1·2 → A, 3 → B, 4 → D, 5 → E, 6 → C 문서.

## 리뷰·검증 기록

- run `run_cf06617624ea`.
- A 1차: 워커 `ctx_1d27c7a77400`(Codex sol high), 커밋 `c045207e4`..`1e7031a6c`. 워커 보고로는 전체 테스트 15,383개, `typecheck`, `lint`가 통과했다.
- RA: 리뷰어 `ctx_859ac71c9bb1`(Sonnet high)가 🔴1 🟡2 ⚪5를 냈다. 🔴1: 저장소 루트를 정규화하지 않아 링크 userData에서 GIF 시그니처 글을 재검사하면 `not_found`가 된다. 🟡1: `fromPaths`가 다른 항목의 폴더를 다시 맡는다. 🟡2: `kept`·폴더 다시 맡기가 실제로 하는 일이 없다. 확인한 것: IPC 허용 목록, 50 MB 상한, Antigravity 블록에는 문제가 없다. 수정 지시: 🔴1, 🟡1·2(결정에 따라 코드 제거), ⚪1(손상된 메타데이터는 버리고 재발급), ⚪4(주석). ⚪2·3·5는 넘긴다(design 결정 또는 기존 이미지와 같은 패턴).
- A 수정 1차: 커밋 `a32277e7d`·`3d374021a`. 수정 전 회귀 테스트 6개가 실패했고, 수정 뒤 전체 테스트 15,387개와 `typecheck`·`lint`가 통과했다(워커 보고). conductor가 수정 diff를 직접 읽고 확인했다. 시작 시 정리는 develop 동작으로 돌아갔고, 폴더를 다시 맡는 코드는 빠졌으며, 저장소 루트를 생성자에서 정규화한다.
- A 통합: `c520bba8e`..`02ca24bb4`(cherry-pick, app 트리가 워커 HEAD와 같다). 통합 `/verify`는 B 통합 뒤 A+B에 한 번 돌린다. A는 Go 코드를 건드리지 않았고, 워커가 같은 app 트리로 전체 테스트를 돌렸다.
- B: 워커 `ctx_ec69aaa013e3`(Codex sol high), 워크트리 `paste-chip-B`. 커밋 `6d81554f3`·`8d0f1ab21`. 워커 보고로는 전체 테스트 15,417개와 `typecheck`·`lint`가 통과했다.
- RB: 리뷰어 `ctx_9f30342ef23f`(Sonnet high)가 🔴0 🟡2 ⚪4를 냈다. 🟡1: 큐 행 문구가 초안과 다르다. 🟡2: 이름만 보고 붙여넣은 글로 판별해 같은 이름의 일반 파일을 잘못 표시한다. 수정 지시: 🟡1·2. ⚪2·3은 D의 실제 앱 확인에 넣는다(프로토타입 창의 붙여넣기→지우기→보내기, 실제 캐럿·선택 영역).
- B 수정 1차와 design-sync: 커밋 `6b7e71460`·`e9b039581`(붙여넣은 글은 이름과 메타데이터를 함께 보고 판별, 큐 행 문구), `f21298710`·`ae9bd876c`(`docs/design/conversation.md` 'Pasted text attachments'와 DESIGN.md 인덱스). 측정 3,220행 중 불일치 0, 문서화한 차이 27행이다. 처음 두 측정은 실제 상태 검사에 실패했다. 설치본 Doan이 실제 userData를 쓰고 있었기 때문이다. 사용자가 Doan을 끈 뒤 다시 측정해 통과했다.
- RDS: design-sync 리뷰어 `ctx_40dae0c99c8c`(Codex sol medium)가 🔴0 🟡1 ⚪2를 냈다. 🟡: 큐 툴팁을 설명한 문서 문장이 코드와 달랐다. B가 고쳤고, conductor가 그 문장이 코드와 맞는지 직접 확인했다.
- B 통합: `c7599d403`..`6795bdc62`. 통합 HEAD `6795bdc62`에서 `node .agents/skills/verify/scripts/verify.mjs`가 PASS했다(A+B). 로그는 `.scratch/verify-AB.log`.
