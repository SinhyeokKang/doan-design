# 체인 261113

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

## 순서

직렬 체인이다. 체인 261112가 끝나고 사용자가 `/release`를 마친 뒤 링크 1을 시작한다(사용자 결정, 2026-11-13). 링크 2는 링크 1이 병합된 뒤 시작한다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1. `github-star-prompt` | [spec](../github-star-prompt/spec.md) · [design](../github-star-prompt/design.md) · [tasks](../github-star-prompt/tasks.md) | `/feature-review` 완료(`815e7fbc`). 초안 `.doan/canvases/github-star-prompt.html` 사용자 확인 완료(`5bfc1ec8`, tasks 1 완료) | PoC가 없는 작은 링크라 먼저 끝낸다. 토스트 그림자·모션과 `--shadow-floating`이 먼저 들어가면 링크 2는 바뀐 토스트 위에서 시작한다 |
| 2. `frame-prototype` | [spec](../frame-prototype/spec.md) · [design](../frame-prototype/design.md) · [tasks](../frame-prototype/tasks.md) | `/feature-review` 완료(`b8d46b6a`, `5a251683`, `452b0a91`), 프리셋 검수 반영(`f1e05dc4`). 초안 `.doan/canvases/frame-prototype.html` 사용자 확인 완료(`54ed7302`, tasks 2 완료) | PoC부터 시작하는 큰 링크라 뒤에 둔다 |

**직렬 판단**: 두 링크 모두 `app/src/main/index.ts`에 IPC를 더하고(링크 1 `star:open`·`star:moment`, 링크 2 프로토타입 창), `App.tsx`와 `styles.css`도 바꿀 가능성이 크다. 겹침이 불확실하므로 직렬로 둔다.

## 시작 점검

lead는 링크 1 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 남긴다. 승인 뒤 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **시작 조건**: 체인 261112의 링크 2·3이 병합되고, 사용자가 `/release`를 마쳤다.
2. **링크 1 실제 앱 확인**: dev 빌드를 `app/runtime/` 격리로 띄우고 `electronApp.evaluate`로 `star:moment`와 `shell.openExternal`을 대신한다(tasks 5). 실제 Applications 설치, 실제 브라우저 열기, provider 로그인은 하지 않는다. 격리 앱 창이 사용자가 일하는 중에 뜬다.
3. **링크 2 PoC와 계약**: 지원 표시 속성 이름·값, 실행 계약, 공유 schema와 `v`는 PoC가 정한다(design.md 'PoC가 먼저 정할 구현 계약'). 지원 조건이 사용자 요구를 줄여야 하면 conductor가 묻는다.
4. **링크 2 `/agent-eval`**: 가이드와 `doan check`가 바뀌므로 마지막 통합 전에 실제 Claude Code와 Codex로 라운드를 돈다(다른 계열 판정은 AGENTS.md 상시 예외). 사용량을 쓴다.
5. **링크 2 프리셋 크기**: `doan design-skill document --json`이 출력 상한 21,600바이트 중 21,588바이트다(체인 261112 링크 1). 링크 2가 `document` 프리셋에 문장을 더하면 `TestDesignSkillFitsToolOutputCap`이 깨진다. 더해야 하면 다른 문장을 줄이거나 사용자에게 묻는다.

## 상시 권한

- lead는 각 링크의 PR을 검토와 게이트 통과 뒤 링크 순서대로 develop에 병합하고, 다음 링크를 시작한다.
- conductor 런타임은 Claude Code다. 모델 계열을 넘는 워커는 허가되지 않았다(`/agent-eval`의 다른 계열 판정은 AGENTS.md의 상시 예외다).

## 진행 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기는 `/orchestrate` §2의 백그라운드 감시 루프를 쓴다. 메일함을 소비하지 않는다.
- 두 링크 모두 로그인이 필요 없다.
- `/agent-eval`: 링크 1은 해당하지 않는다(가이드, CLI 출력, `doan check`, 스킬 stub을 바꾸지 않는다). 링크 2는 해당한다(tasks 5).
- GUI probe는 짧게 돌린다. 사용자에게 화면이 필요한 동안과 끝난 때를 lead에게 알린다(`[conductor <slug>] GUI done` / `GUI again`).
- 링크 2가 병합되면 BACKLOG의 prototype-conversation(별도 feature와 캔버스) `/feature` 라운드를 시작할 수 있다(사용자 결정, 2026-11-13).

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1. `github-star-prompt` | | | | 대기(체인 261112와 릴리스 대기) |
| 2. `frame-prototype` | | | | 대기 |

## 인계 기록

- 2026-11-13 lead(develop checkout): 사용자 요청으로 체인 파일을 써 두었다. 체인 261112가 끝나고 릴리스한 뒤 시작 점검을 묻고 링크 1을 시작한다.
