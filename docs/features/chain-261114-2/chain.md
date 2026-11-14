# chain-261114-2

## 규칙

- 진행 방식은 [/chain](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다.
- 이 파일은 리드만 쓴다. 컨덕터는 시작할 때 읽고, 이 파일이 말하는 곳에서만 `/orchestrate` 기본값 대신 이 파일을 따른다.
- 세 링크는 상위 feature [canvas-multi-conversation](../canvas-multi-conversation/spec.md)의 하위다. 상위 문서의 작업 체크는 리드가 develop에서 한다. 컨덕터는 상위 문서를 고치지 않는다.

## 순서

링크 1 다음에 링크 2와 3을 병렬 그룹으로 돌린다.

1. **canvas-concurrent-conversations** — [spec](../canvas-concurrent-conversations/spec.md) · [design](../canvas-concurrent-conversations/design.md) · [tasks](../canvas-concurrent-conversations/tasks.md)
   - 리뷰: `/feature-review`를 반영했다(1c19a168d). 초안 `.doan/canvases/canvas-concurrent-conversations.html`은 독립 리뷰를 거쳐 사용자가 확인했다(739280338).
   - 먼저 가는 이유: 저장 형식 v3, 보관 제거, 동시 턴, 기본 대화 고르기를 바꾼다. 링크 2와 3은 이 모델 위에 선다.
   - 작업 1은 다섯 프로바이더 실제 로그인 PoC다('로그인').
2. **sidebar-canvas-conversations** — [spec](../sidebar-canvas-conversations/spec.md) · [design](../sidebar-canvas-conversations/design.md) · [tasks](../sidebar-canvas-conversations/tasks.md)
   - 리뷰: 반영했다(2d371a280). 초안 `.doan/canvases/sidebar-canvas-conversations.html`은 독립 리뷰를 거쳐 사용자가 확인했다(82a55996b).
3. **canvas-edit-awareness** — [spec](../canvas-edit-awareness/spec.md) · [design](../canvas-edit-awareness/design.md) · [tasks](../canvas-edit-awareness/tasks.md)
   - 리뷰: 반영했다(b0273cfb6). 화면이 없어 초안은 없다. `/agent-eval`(W9, W10)이 필요하다.

**병렬 그룹 2·3의 겹침 확인**: 링크 2는 렌더러(`ShellSidebar.tsx`, `conversationList.ts`, `canvasNotice.ts`, `uiState.ts`, `App.tsx`, `homeRun.ts`, `conversationDelete.ts`, `styles.css`)와 초안을 고친다. 링크 3은 CLI(`cli/internal/cli/work*.go`, `skill.md`), 스키마(`schema/app-socket.v3.schema.json`과 fixture), main(`runtime.ts`, `workState.ts`, `conversationWork.ts`, 새 `workOthers.ts`, `index.ts`), `eval/`을 고친다. 겹치는 코드·테스트·초안 파일이 없다. 두 PR은 링크 순서(2 → 3)로 병합하고, 경합은 `/ship` 'Lead' 4단계를 따른다.

## 시작 점검

링크 1을 시작하기 전에 리드가 사용자와 한 번에 정하고, 승인을 '인계 기록'에 적는다. 그 뒤 컨덕터는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **명령 미정 항목**: AGENTS.md 'Commands'에 없는 검증 명령을 그대로 쓴다.
   - 링크 1 작업 1 PoC: `node .scratch/canvas-concurrent-conversations/poc.mjs`(다섯 프로바이더가 모두 겹친 턴을 끝까지 돌렸을 때만 exit 0).
   - 링크 1 작업 11 로그인 정리: 프로필·scratch HOME이 없고 `security find-generic-password`로 프로바이더 Keychain 항목이 남지 않았음을 확인.
   - 링크 2 작업 2·링크 3 작업 1(하위 1 병합본과 맞추기): `git grep -n` 결과를 design.md와 비교.
   - 링크 2 작업 5·6, 링크 3 작업 5: `/design-sync`·`/runtime-test` 스킬의 `.scratch` 측정·probe 스크립트.
2. **PoC 실패**: 어느 프로바이더에서 겹친 턴이 실패하면 관찰을 커밋하고 멈춰 사용자에게 범위를 묻는다(링크 1 spec).
3. **링크 3의 `/agent-eval`**: W9 또는 W10 실패는 사용자가 열린 이슈로 받아들이지 않는 한 병합을 막는다.
4. **모델 경계**: Codex 워커 허가(아래 '상시 권한').

## 상시 권한

- 리드는 각 링크의 PR을 리뷰와 `gate`가 통과하면 링크 순서대로 develop에 병합하고 다음 링크를 시작한다.
- 컨덕터는 Claude다. **모델 경계**: 사용자가 2026-11-14 세 링크 모두에 Codex 워커를 허가했다. 컨덕터는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고, 각 링크의 `orch.md`에 쓴 범위를 적는다.

## 로그인

- 링크 1의 PoC(작업 1)와 `/runtime-test`(작업 10)는 다섯 프로바이더(Claude Code, Codex, Cursor, Antigravity, GitHub Copilot)의 실제 로그인을 쓴다. 실제 HOME에서 사용자가 브라우저로 승인한다.
- 리드가 시작 점검 때 필요한 로그인을 만들고, 로그인된 userData는 메인 체크아웃의 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 둔다. 각 링크는 자기 워크트리를 쓰므로 이 절대 경로를 재사용한다. 파괴적인 probe에는 복사본을 쓰고, 새 로그인을 청하기 전에 이 프로필을 먼저 확인하며, 링크마다 로그아웃하지 않는다.
- 링크 2와 3은 실제 로그인이 필요 없다(IPC 가짜 응답, 단위 테스트, eval 가짜 앱).
- 마지막 링크의 PR이 오면 리드가 로그아웃하고 Keychain 항목이 없어졌는지 확인한 뒤 userData를 지우고 병합한다. Cursor 로그인은 기기 전체 Keychain에 쓴다는 점을 유의한다.
- PoC와 probe에서는 설치된 `doan`을 `PATH`에서 빼고, `/Applications/Doan.app`이 뜨는지 실행 내내 지켜보며, 임시 `DOAN_RUNTIME`과 임시 저장소를 쓴다(POSTMORTEM 2026-11-14).

## 진행 규칙

[/chain](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기 루프는 `/orchestrate` §2를 따른다.
- `/agent-eval`: 링크 1·2는 해당하지 않는다(에이전트가 보는 문구 변화 없음, 각 spec에 사용자 승인과 이유). 링크 3은 필요하다.

## 링크 상태

| 링크 | 세션·워크트리 | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| canvas-concurrent-conversations | Claude 컨덕터 · `canvas-concurrent-conversations-orch` | 2026-11-14 | — | 진행 중 |
| sidebar-canvas-conversations | — | — | — | 대기 |
| canvas-edit-awareness | — | — | — | 대기 |

## 인계 기록

- 2026-11-14 리드 세션: 체인 파일을 썼다. 사용자가 시작 점검 1–4를 승인하고 세 링크 모두에 Codex 워커를 허가했다. 체인 시작은 사용자가 새 리드 세션에 맡겼다. 이 세션은 시작하지 않는다. 로그인('로그인')은 아직 만들지 않았다. 새 리드가 링크 1을 시작하기 전에 만든다.
- 2026-11-14 새 리드 세션: dev 앱(실제 HOME, 설치된 `doan`을 `PATH`에서 뺌)에서 사용자가 다섯 프로바이더에 로그인했다. 로그인된 userData는 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`이다. 그동안 설치된 Doan.app이 새로 뜨지 않았다. 링크 1 컨덕터를 시작했다.
