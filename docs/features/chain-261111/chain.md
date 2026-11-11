# 체인 261111

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

## 순서

`folder-attachments`(별도 `/orchestrate` 실행 중, 체인 밖)가 develop에 병합된 뒤 시작한다. 두 링크는 하나의 병렬 그룹이다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1. `frame-first-selection` | [spec](../frame-first-selection/spec.md) · [design](../frame-first-selection/design.md) · [tasks](../frame-first-selection/tasks.md) | `/feature-review` 완료, 초안 사용자 확정 | 다섯 기능 계획의 2번이다. 병합 순서에서 먼저 둔다 |
| 2. `canvas-activity-notices` | [spec](../canvas-activity-notices/spec.md) · [design](../canvas-activity-notices/design.md) · [tasks](../canvas-activity-notices/tasks.md) | `/feature-review` 완료, 초안 사용자 확정 | 다섯 기능 계획의 5번이다. 3번 `canvas-rendering-stability`와 4번 `frame-prototype`은 초안 확정 전이라 이 체인에 넣지 않았다 |

**병렬 판단**: 두 design이 밝힌 변경 파일이 겹치지 않는다.
- 링크 1: `app/src/main/canvasScript.ts`, `app/src/renderer/CanvasController.ts`, `selection.ts`, `canvasTool.ts`, `canvasMessage.ts`와 선택 표시.
- 링크 2: `app/src/main/canvasSeen.ts`, `shell.ts`, `view.ts`, `watch.ts`, `index.ts`의 읽음 IPC, `document/bindings.ts`, renderer의 `canvasNotice.ts`, `homeConversations.ts`, `sidebarSize.ts`, `rightPanelOpen.ts`, `sidebarSlots`와 관련 표시.
- 초안도 각자의 캔버스(`frame-first-selection.html`, `canvas-activity-notices.html`)만 쓴다.

구현 중 한 링크가 상대 링크의 파일을 건드리게 되면 그 conductor는 lead에게 알린다. lead는 병합 순서대로 처리하고, 나중 링크가 `origin/develop`을 병합해 충돌을 푼다(`/ship` 'Lead' 4단계).

## 시작 점검

lead는 링크 1 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 `인계 기록`에 남긴다. 승인 뒤 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **계획 순서 변경**: 링크 2는 계획상 3·4번보다 뒤지만 먼저 구현한다. spec 6항의 '프로토타입만 보는 것은 읽음 처리하지 않음'은 `frame-prototype`이 아직 없으므로 이번에는 썸네일 제외만 검증하고, 프로토타입 제외는 `frame-prototype` 구현 때 지킨다. 이 처리를 승인하는가.
2. **링크 2의 공유 메타데이터 계약**: 작업 1 PoC가 `.doan/` 아래 저장 경로·파일 단위·버전·schema·TS/Go 소비 여부를 정한다. 이는 ARCHITECTURE §7·§10·§11을 바꾸는 구조 결정이다. PoC 결과를 conductor가 사용자에게 확인받고 진행할지, conductor 판단으로 진행할지 정한다.
3. **링크 2의 대화 종료 실제 확인**: 말풍선 표시를 실제 앱에서 보려면 읽지 않은 대화 종료가 필요하다. 격리 앱에서 대화 기록 fixture로 만들지, 제공자 로그인으로 실제 대화를 끝낼지 정한다. 로그인이 필요하면 아래 `로그인` 절을 추가한다.

## 상시 권한

- lead는 각 링크의 PR을 검토와 게이트 통과 뒤 링크 순서대로 develop에 병합하고, 다음 링크를 시작한다.
- conductor 런타임은 Claude Code다. 모델 계열을 넘는 워커는 허가되지 않았다.

## 진행 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기는 `/orchestrate` §2의 백그라운드 감시 루프를 쓴다. 메일함을 소비하지 않는다.
- `/agent-eval`: 링크 1은 CLI 출력·가이드·`doan check`를 바꾸지 않아 해당하지 않는다. 링크 2는 메타데이터를 CLI가 읽게 되거나 CLI 출력·메시지가 바뀌면 마지막 통합 전에 실행한다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1. `frame-first-selection` | | | | 대기 |
| 2. `canvas-activity-notices` | | | | 대기 |

## 인계 기록

- 2026-11-11 lead(develop checkout): 두 초안의 사용자 확정 뒤 체인 파일을 작성했다. `folder-attachments` 병합 뒤 시작 점검을 거쳐 두 링크를 함께 시작한다.
