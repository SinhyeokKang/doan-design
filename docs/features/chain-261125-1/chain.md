# chain-261125-1

## 규칙

- 이 체인은 [`/chain` 스킬](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains 규칙을 따른다.
- 이 파일은 lead만 고친다. conductor는 시작할 때 읽기만 한다.

## 순서

이 체인은 직렬이다. 두 링크가 모두 `app/src/renderer/ConversationThread.tsx`와 `app/src/renderer/styles.css`를 바꾸기 때문이다.

1. **handoff-card-emphasis** — [spec](../handoff-card-emphasis/spec.md) · [design](../handoff-card-emphasis/design.md) · [tasks](../handoff-card-emphasis/tasks.md)
   - `/feature-review` 완료, 드래프트 `.doan/canvases/handoff-card-emphasis.html` 사용자 확정(2026-11-25).
   - 먼저 하는 이유: 카드 마크업과 CSS 구조(바탕 클래스, 머리 행 클래스)를 바꾼다. 모션 링크는 스레드 항목 위에 진입과 스크롤 동작을 얹으므로, 바뀐 카드 구조 위에서 시작하는 편이 충돌이 적다.
2. **thread-motion** — [spec](../thread-motion/spec.md) · [design](../thread-motion/design.md) · [tasks](../thread-motion/tasks.md)
   - `/feature-review` 완료, 드래프트 `.doan/canvases/thread-motion.html` 사용자 확정(2026-11-25).
   - 나중에 하는 이유: 스레드 전체의 스크롤 따라가기와 답 렌더링을 바꾸는 가장 큰 링크다.

체인 밖의 선행 작업: thread-edit-lines(`feat/thread-edit-lines`)가 독립 `/orchestrate` conductor로 진행 중이다. 이 작업도 `ConversationThread.tsx`, `styles.css`, `threadItems.ts`, `turnStatus.ts`를 바꾼다. 그래서 링크 1은 thread-edit-lines PR이 develop에 머지된 뒤 시작한다.

## 시작 점검

lead는 링크 1을 시작하기 전에 아래를 사용자와 한 번에 확인하고, 승인을 '인계 기록'에 적는다. 승인 뒤에는 conductor가 일상적인 판단을 스스로 하고, 새로운 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

- thread-edit-lines PR이 develop에 머지되었다.
- handoff-card-emphasis T2(썸네일 공유와 프로토타입 창 IPC): 설계 범위(두 채널을 프로토타입 창에 열기, root 범위 제한, 인스턴스 공유)를 넘어 새 캡처 경로나 채널이 필요하면 conductor가 멈추고 묻는다. 이 결정 지점을 다시 확인한다.
- thread-motion T5의 `/runtime-test`는 실제 provider 턴 하나를 쓴다. AGENTS.md 'Real agent sign-ins'에 따라 실제 HOME의 로그인을 임시 홈에 복제해 쓰고 지운다. Codex 로그인(`~/.codex`)은 2026-11-25 15:07에 다시 로그인되어 있다. 새 로그인을 만들 필요는 없다.
- 두 링크의 기능 문서에 '확인 필요'로 남은 항목은 없다.

## 상시 권한

- lead는 각 링크의 PR을 리뷰와 gate 통과 뒤 링크 순서대로 develop에 머지하고, 다음 링크를 시작한다(체인 기본값).
- conductor와 워커의 런타임은 Claude다(lead와 같은 모델 계열). 모델 계열을 넘는 허가는 없다.

## 진행 규칙

- [`/chain` 스킬](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기: conductor는 `/orchestrate`의 워커 대기 루프를 쓴다. 워커가 완료 신호 없이 멈추는 경우를 잡는다.
- `/agent-eval`: 두 링크 모두 해당하지 않는다. 안내, CLI 출력, `doan check` 규칙, 스킬 stub이 바뀌지 않는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·머지 | 상태 |
|---|---|---|---|---|
| handoff-card-emphasis | conductor `term_5911532b-fa28-4a97-bd15-c7f419c527c7` · `/Users/sinhyeok/orca/workspaces/doan-design/handoff-card-emphasis-orch` (`feat/handoff-card-emphasis`) | 2026-11-25 17:08 | PR #392 · 머지 `9d4559e59` | 완료 |
| thread-motion | — | — | — | 대기 |

## 인계 기록

- 2026-11-25 lead: 체인 파일을 만들었다. 링크 1은 thread-edit-lines PR 머지 뒤 시작한다. 시작 점검은 아직 사용자와 확인하지 않았다.
- 2026-11-25 lead 교대: 이 lead 세션(터미널 `term_d868ec4b-a8ad-4a84-9b19-e09bf10a6d6f`)은 컨텍스트가 부족해, thread-edit-lines PR의 리뷰·머지·worktree 정리와, 이 lead가 머지한 PR들의 미검증 항목 확인까지 맡고 물러난다. 이 체인은 새 lead가 시작한다(사용자 결정). 새 lead가 이어받을 것:
  - thread-edit-lines: conductor 터미널 `term_e86cb4b9-296e-4f62-b7e9-2f9ebee31eb7`, worktree `/Users/sinhyeok/orca/workspaces/doan-design/thread-edit-lines`. 이 lead가 머지하면 여기 '인계 기록'에 머지 커밋과 PR 본문의 미검증 항목을 적는다. 머지 전에 이 lead가 물러나게 되면 새 lead가 리뷰와 머지를 이어받는다.
  - scrollbar-hover(PR #390, 머지 `f138f4435`)의 미검증 항목(일반 버튼을 마우스로 클릭해 연 대화상자, 시스템 설정의 "스크롤 막대 항상 보기")은 이 lead가 맡는다(사용자 결정). thread-edit-lines를 머지한 뒤 그 PR의 미검증 항목과 묶어 develop에서 확인하고, 결과를 여기에 적는다.
  - 실제 Codex 로그인(`~/.codex`)은 thread-edit-lines의 T0 녹화 중 refresh로 끊겼다가 15:07에 다시 로그인했다.
- 2026-11-25 lead: 새 lead가 할 일을 정리한다(사용자 지시).
  - 각 링크는 `/orchestrate` conductor로 띄운다(§3 'Lead'). 링크 1(handoff-card-emphasis)은 thread-edit-lines PR 머지 뒤 시작 점검을 거쳐 시작한다.
  - 주석 정리 feature를 진행한다. AGENTS.md 'Commit conventions'의 주석 규칙을 조였다(`0ab8ac6bf`: 1~2줄, 비자명한 제약·함정만, 코드 반복·이력·드래프트 서사 금지, 긴 이유는 ARCHITECTURE로). 테스트를 뺀 소스의 약 26%(TS·Go), CSS의 약 29%가 주석이다. 새 lead가 `/feature`로 기준과 디렉터리별 배치를 잡고 `/feature-review`까지 마친다. 구현(`/orchestrate`)은 이 체인의 마지막 링크가 머지된 뒤 시작한다. 거의 모든 파일을 건드려서, 진행 중인 링크와 `ConversationThread.tsx`, `styles.css`에서 충돌하기 때문이다. 지울 수 없는 긴 제약을 ARCHITECTURE로 옮길지는 그 feature에서 정한다.
- 2026-11-25 lead: thread-edit-lines PR #391을 develop에 머지했다(`46f91b070`). conductor worktree를 지웠고 브랜치 `feat/thread-edit-lines`는 남겼다. 링크 1이 알아야 할 것:
  - 대화 히스토리에 `activity.callId`와 `activity.result`가 생겼고, `turnStatus.ts`의 activity 머리가 구조화되었다(PRODUCT §5 item 3 'Edit line counts', ARCHITECTURE 'Edit line counts'). 링크 1과 2는 이 위에서 시작한다.
  - Copilot `apply_patch` 단계가 경로 대신 도구 이름으로 표시되는 문제는 BACKLOG 'Known defects'에 있다.
- 2026-11-25 lead: 이 lead가 머지한 두 PR의 미검증 항목을 develop(`46f91b070` 이후)에서 격리된 실제 앱으로 확인했다. 모두 확인했고, BACKLOG의 해당 미검증 항목을 지웠다.
  - scrollbar-hover(#390): 마우스로 연 대화상자에서 쉴 때 썸 숨김, 호버·Tab에서 표시. 실제 macOS 설정 "항상 보기"(잠깐 바꾸고 unset으로 되돌림)에서 사이드바, Quick Open, 메뉴, 대화상자 모두 쉴 때 숨김, 호버·키보드에서 표시, 간격 유지.
  - thread-edit-lines(#391): Codex와 Copilot 실제 편집 턴의 숫자가 `git diff --numstat`과 같다. 프로토타입 창 패널에도 같은 숫자가 보인다. 회전 중인 머리에는 합계가 없고 멈추면 나타난다(DOM 기록).
  - 증거: main checkout의 `.scratch/lead-verify-261125/`.
  - 주의: 공유 provider 프로필(`.scratch/provider-profile/userData`)을 복사하면 Claude Code와 Codex는 로그인이 만료된 것으로 보인다. 자격 증명이 프로필 경로의 해시가 붙은 Keychain 항목에 있기 때문이다. 이 두 provider의 probe는 원본 경로에서 돌리고, 바뀌는 작은 상태 파일은 백업했다 되돌린다.
- 2026-11-25 새 lead: 시작 점검을 사용자와 확인했고 사용자가 승인했다. 확인한 항목: thread-edit-lines 머지(`46f91b070`)와 미검증 항목 확인 완료, handoff-card-emphasis T2의 결정 지점(설계 범위를 넘는 새 캡처 경로나 채널이 필요하면 conductor가 멈추고 묻는다), thread-motion T5의 실제 provider 턴(실제 HOME 로그인을 임시 홈에 복제해 쓰고 지운다, 새 로그인 없음), 두 기능 문서에 '확인 필요' 항목 없음. 링크 1을 시작한다.
- 2026-11-25 lead: 링크 1 handoff-card-emphasis PR #392를 develop에 머지했다(`9d4559e59`). gate 통과. conductor worktree를 지웠고, 브랜치 `feat/handoff-card-emphasis`와 배치 브랜치 `SinhyeokKang/hce-b1`~`b3`는 남겼다. 링크 2가 알아야 할 것은 PR #392 본문의 'For link 2'에 있다.
  - 새 클래스는 `.card-surface`, `.card-layout`, `.card-head`, `.cc-banner`, `.cc-meta`다. `.cc-*`는 `.conversation-thread .card-head` 아래로 옮겼고, `.handoff-head`는 지웠다. `.handoff-card`는 ENTRY_FOCUS와 scrollIntoView가 기대므로 남겼다.
  - `ConversationThread`는 `now`(필수)와 `thumbnails?: { hub, root }`를 받는다. `CardThumbnails`가 IntersectionObserver로 배너를 본다. 썸네일 hub는 뷰어가 없는 root의 이미지를 `LEAVE_MS`(2초) 동안 유지한다. 스레드를 다시 마운트하거나 늦추는 모션은 이 창을 고려해야 한다.
  - T2 결정 지점: 새 채널이나 캡처 경로는 필요 없었다. 기존 `thumbnails:changed`를 프로토타입 창에도 보내는 것은 conductor가 승인 범위 안으로 판단했다.
  - 실제 앱에서 확인하지 못한 항목(BACKLOG 'Not verified in the real app'): 캡처 실패 뒤 배너, 짧은 경로 폴더 메타, "No frames", 사라진 캔버스의 캔버스 카드, "Hands off when this turn ends" 카드, 347 프로토타입 창 패널, Open hover·pressed, reduced motion.
