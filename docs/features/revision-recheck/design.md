# revision-recheck — 설계

## 영향받는 구성 요소

- **앱 renderer**: `CommentsPanel.tsx`(해결 메타, 재확인 영역, 성공 상태 줄, 해결 카드 편집), `useComments.tsx`·`CommentsSession.ts`(정렬, 확인 상태, 성공 처리, 포커스), `CanvasController.ts`(대상 위치로 이동, Activity 종류), `activity.ts`, `RightPanel.tsx`, `Home.tsx`·`homeCards.ts`·`ProjectOverview.tsx`(확인할 수), `App.tsx`(알림).
- **앱 main**: 기기 로컬 확인 상태 저장소(Q2 결정). `ui-state.json`처럼 main이 검증하는 파일 하나를 더하거나 `ui-state.json`에 항목을 더한다. 캔버스 바이트 해시는 댓글 목록 응답의 기존 `canvasHash`를 쓴다.
- **공유 형식과 CLI**: fold 출력에 선택적 `lastResolution {by, at, reopenedAt}`을 더한다(TS·Go, 공유 fold fixture, CLI `comments` 출력 ARCH §12). 댓글 이벤트 스키마와 `v`는 바뀌지 않는다.
- **skills**: skill 본문에 "`lastResolution`이 있는 열린 댓글은 이전 해결이 받아들여지지 않은 것"을 한 줄 더한다. 이 경우 `/agent-eval` 실행 대상이다.

## 동작

### 1. 대상 위치로 가기 (L-1, L-20)
- `CanvasController.locate(node)`: 앵커 스냅샷의 노드 사각형(board 좌표)으로 `fitFrame`과 같은 방식의 이동과 1.2초 강조를 한다. 그다음 기존 선택 경로(`select-comment` 또는 `selectPath`)로 선택한다. 이 동작은 핀 표시 여부에 의존하지 않는다. 기존 가드와 펜스(의도, 문서, 바인딩 리비전)를 유지한다.
- 스냅샷에 화면 밖 노드의 사각형이 있는지 먼저 확인한다(`canvasScript` 앵커 응답). 없으면 앵커 질의에 사각형을 더한다. 내부 메시지만 바뀌고 저장 형식은 그대로다.
- 이동으로 생긴 선택 변화는 범위 맞춤 효과를 일으키지 않는다(`revision-continuity`의 선택 정체성 규칙을 확장해, 목록에서 시작한 선택에는 범위를 바꾸지 않는다).

### 2. 해결 메타와 정렬 (L-7)
- 카드: 해결 상태면 작성 줄 아래에 "Resolved by <name> · <relative>"를 둔다. 사람이면 Git 이름이다.
- Resolved 목록: `resolvedAt` 역순으로 정렬한다. Open은 작성 순서를 유지한다.
- 다시 열린 카드에 "Reopened · was resolved by codex 3 min ago"를 보인다.

### 3. 재확인 흐름 (N1, Q1·Q2)
- 확인 기준은 기기 로컬에 둔다. 캔버스별 `lastCheckedAt`을 쓴다(Q2 결정). `resolvedAt > lastCheckedAt`인 해결 댓글이 "확인할 것"이다. 처음 열린 캔버스는 `lastCheckedAt`이 없으므로 그 캔버스의 해결 댓글 전체가 대상이다. 다만 앱이 처음 이 기능을 켤 때 기존 캔버스는 현재 시각으로 초기화해 과거 해결이 쏟아지지 않게 한다.
- 알림: 열린 캔버스에서 확인할 것이 생기면 Comments 머리에 "3 resolved since you last checked · Review"를 띄운다. 숨김·재시작 뒤에도 같은 기준으로 계산하므로 다시 보인다.
- Review(Q1 결정): 확인할 것을 해결 시각 순으로 하나씩 보인다. 단계마다 대상 위치로 가기(1번), 해당 카드 강조, [Reopen] [Next] [Previous] [Done]을 둔다. Reopen은 기존 reopen 이벤트를 쓴다. Done이나 마지막 Next는 `lastCheckedAt`을 그 시점까지의 최대 `resolvedAt`으로 올린다. 재확인 중의 Esc는 Review를 닫되 `lastCheckedAt`을 바꾸지 않는다.
- 재확인 상태는 승인이 아니다. 저장소 파일에 기록하지 않고, 다른 사람이나 에이전트에게 보이지 않는다.
- Home 행과 Overview 카드: 확인할 것이 있으면 "N to check"를 열린 수 옆에 둔다. 계산에는 main이 캔버스별 해결 시각 최대값이 필요하다. `ls`의 캔버스 행에는 해결 시각이 없으므로, 그 프로젝트의 댓글 파일을 읽어 계산한다(성능 측정 필요, tasks 1).

### 4. Activity와 Updated (L-7, T-10)
- Activity 종류를 `opened | changed | reloaded | resolved`로 늘린다. `changed`는 리로드 전후 캔버스 해시가 다를 때다. `resolved`는 댓글 재읽기에서 open→resolved로 바뀐 수와 해결자를 묶는다.
- 하단 라벨: 최신 항목이 `opened`면 "Opened HH:MM", `changed`면 "Changed HH:MM", 그 밖이면 지금처럼 "Updated HH:MM"이다. 날짜가 오늘이 아니면 날짜를 붙인다.
- 이 변경은 PRODUCT §7 2026-10-22("Updated shows the open canvas's last successful load")를 바꾼다. 결정 로그에 기록한다.

### 5. 사람의 Resolve·Reopen 성공 (L-9)
- 카드 변경 성공은 `mutations`를 `idle`로 돌리고, 목록에서 사라진 자리에 4초 동안 상태 줄("Resolved · Undo" 없음, 단순 상태)을 둔다. `saved` 상태와 "No duplicate was added."는 상태 확인으로 확정된 경우에만 쓴다.
- 포커스: 사라진 카드의 다음 카드 조작, 없으면 이전 카드, 둘 다 없으면 Comments 제목. 에이전트의 해결로 포커스된 카드가 사라질 때도 같다.

### 6. 해결된 댓글 편집 (L-10, Q4)
- 결정(Q4): 해결된 댓글의 편집기 기본 버튼은 "Save and reopen"이다. 보조 버튼 "Save only"를 둔다. 편집기 안내에 "Agents read open comments only."를 보인다. "Save and reopen"은 edit와 reopen 이벤트를 한 번의 쓰기(같은 파일 한 번의 append)로 기록한다. ARCH §2 "한 파일의 새 줄을 한 번의 write로"를 지킨다. 불변 요청과 재시도 규칙도 두 이벤트를 하나의 요청으로 다룬다.

### 7. Outdated (L-14, Q3)
- 결정(Q3): 이름을 "Canvas changed"로 바꾸고 title "The canvas changed after this comment was written."을 단다. 열린 카드에서는 중립색, 해결 카드에서는 표시하지 않는다. 계산은 지금처럼 작성 시 해시와 현재 바이트를 비교한다.

### 8. 사라진 대상 (L-16, Q6)
- 결정(Q6): Location unavailable 카드에 "Comment on selection instead"를 둔다. 현재 선택이 있으면 같은 본문으로 새 댓글 초안을 시작하고, 저장되면 원래 댓글을 삭제할지 확인한다(기존 삭제 확인을 재사용). 자동 재부착이 아니라 사람의 명시 동작이므로 Q2(재부착 없음)를 유지한다.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- `toCheck(comments, lastCheckedAt)`, `advanceCheck(state, action)` — Review 단계 상태 기계(next/previous/reopen/done/esc).
- `sortResolved(comments)`.
- `activityKind(previousHash, nextHash, manual)`, `resolvedActivity(before, after)`.
- `bottomLabel(latest, now)`.
- `nextFocus(cards, removedId)`.
- `resolutionText(comment, now)`.
- `fold`의 `lastResolution`(TS·Go 공유 fixture).
- 위치 이동 계산 `locateView(rect, viewport, view)`.

## 형식 변경

- 공유 이벤트 스키마: 없음.
- fold 출력과 CLI `comments` 응답: 선택적 필드를 추가한다. 공유 fold fixture로 TS와 Go가 같은 결과를 내는지 확인한다.
- 기기 로컬: 캔버스별 `lastCheckedAt`(Q2 결정).

## 컨벤션 영향

- skill 규칙에 한 줄을 추가한다. `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- 승인을 미룬 결정: 유지한다. 재확인 표시는 로컬이며 공유되지 않는다.
- PRODUCT §7 2026-10-22 Updated/Activity 정의: 바꾼다(위 4번).
- PRODUCT §5 항목 5 Q2(재부착 없음): 유지한다(위 8번은 사람의 명시 동작).
- PRODUCT §5 항목 5 Q5(Outdated 계산): 계산은 유지하고 표시만 바꾼다(Q3 결정).
- ARCH §2 쓰기 규칙: Save and reopen은 한 번의 append로 두 이벤트를 쓴다.

## POSTMORTEM에서 가져온 함정

- 2026-10-25 "Comment creation errors…": 작업 오류와 읽을 수 있는 데이터를 분리하고, 문서 수명에 묶는다.
- 2026-10-25 "focus after disappearing action"(UX N 재발 항목): 사라지는 동작 뒤 포커스는 현재 유효한 위치로 복원한다.
- 2026-10-25 "Navigation feedback read the previous React snapshot": 알림 계산은 동기 생산자가 쓴 상태를 콜백에 넘긴다.

## PoC 의존

- 없음. Home·Overview의 "N to check" 계산 비용은 tasks 1에서 측정한다.
