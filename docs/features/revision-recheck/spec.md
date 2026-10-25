# revision-recheck — 수정본에서 처리된 것을 보고 하나씩 확인한다

근거: [ux-audit-261025-2 보고서](../ux-audit-261025-2/report.md)의 L-1, L-7, L-9, L-10, L-14, L-16(행동), L-20, 제안 N1과 리뷰 W-4·W-5·W-6·W-7, A-1·A-5·A-6·A-7·A-11, T-1·T-6·T-7·T-10·T-15, P-1·P-3·P-8. 원 근거는 `.scratch/ux-audit/loop-261025-2/`(S1 #20–#28, S2 #3–#6, #19, #101)에 있다.

## 사용자

- **사람**: 에이전트에게 피드백을 넘긴 뒤 돌아와서, 무엇이 처리됐는지 보고 댓글마다 결과를 확인하는 사람이다. 만족하지 않으면 다시 연다.
- **에이전트**: `doan comments`가 이전에 해결했다가 다시 열린 댓글임을 알려준다. 그 밖의 동작은 바뀌지 않는다.

## 문제 (관찰한 사실)

1. **위치로 가기가 긴 캔버스에서 동작하지 않는다(L-1).** 화면 밖 열린 댓글의 대상 줄을 눌러도 아무 일이 없다(S2 #3, board transform 그대로). 해결된 댓글은 선택만 되고 화면이 움직이지 않는다. 해결된 카드에서 위치로 가면 범위가 Selection으로 바뀌어 다른 해결 카드가 사라진다(S1 #23).
2. **누가 언제 해결했는지 보이지 않는다(L-7).** 해결 카드에는 작성자와 작성 시각만 있다(S1 #22, #28). Resolved 목록은 작성 순서라 1회차와 2회차 해결을 구분할 수 없다. 다시 열면 해결 기록이 지워진다(`fold.ts:126-130`).
3. **수정 도착을 알 수 없다(L-7).**
   - "Updated"는 캔버스를 열기만 해도 뜬다(S1 #5).
   - Activity는 Opened/Reloaded뿐이라 에이전트 수정, 사람의 ⌘R, 다른 파일 변경이 모두 같다(S2 #15, #18).
   - 창을 숨긴 사이나 앱을 끈 사이의 해결은 알림 없이 반영된다(S2 #19, #101).
   - Home은 열린 댓글 수만 보인다. 0이 되면 "모두 해결, 재확인 대기"와 "댓글 없음"을 구분할 수 없다(S1 #25).
4. **사람의 Resolve·Reopen 뒤 피드백이 잘못되어 있다(L-9).** 카드가 확인 없이 목록에서 사라지고 포커스는 `<body>`로 간다. 해결 카드에는 저장 복구용 문구 "Comment saved — … No duplicate was added."가 남는다(S2 #5).
5. **해결된 댓글을 고쳐도 에이전트에게 닿지 않는다(L-10).** Edit는 가능하지만 상태는 Resolved로 남고, 에이전트는 열린 댓글만 읽는다(S2 #6과 `doan comments` 출력). 앱은 이를 알려주지 않는다.
6. **Outdated가 신호 역할을 못 한다(L-14).** 수정 한 번 뒤 모든 댓글이 경고색 Outdated가 된다(S2 #15). 해결 카드에서는 캔버스가 바뀐 것이 정상 결과인데도 경고로 보인다(S1 #22).
7. **대상이 사라진 댓글은 지우고 새로 쓰는 길뿐이다(L-16).** 대상을 다시 지정할 수 없는 것은 결정이다(PRODUCT §5 항목 5 Q2).

## 완료 조건

- 대상 줄과 재확인 단계의 위치로 가기는 대상이 화면 밖이어도 그 대상을 선택하고, 화면을 그 대상으로 옮겨 잠깐 강조한다(트리 이동과 같은 강조). 열린 댓글과 해결된 댓글이 같다. 이동은 목록의 범위·상태 필터를 바꾸지 않는다.
- 해결 카드에 "Resolved by <name> · <상대 시각>"(절대 시각 title)이 보인다. 에이전트면 런타임 이름(`claude-code`, `codex`)이다. Resolved 목록은 해결 시각 역순이다.
- 재확인 흐름(알림 + Review 단계, 캔버스별 마지막 확인 시각)이 동작한다. 수정 도착 알림, 확인할 목록, 이동, 다음/이전, 끝내기가 포함된다. 숨김·재시작 뒤에도 마지막 확인 이후 해결된 것이 보인다.
- Activity와 "Updated"는 열기("Opened"), 캔버스 바이트가 바뀐 리로드("Changed"), 바뀌지 않은 리로드("Reloaded"), 해결("Resolved N · codex")을 구분한다. 연 직후에는 "Updated"가 아니라 "Opened HH:MM"이 보인다.
- 사람의 Resolve·Reopen이 성공하면 카드 자리에 짧은 상태 줄("Resolved" / "Reopened")이 남고, 포커스는 다음 카드로, 없으면 Comments 제목으로 간다. "No duplicate was added." 문구는 상태 확인 복구 경로에서만 보인다.
- 해결된 댓글을 편집하면 기본 버튼이 "Save and reopen"이고, 저장 뒤 `doan comments`에 다시 나온다.
- Outdated는 "Canvas changed"로 이름을 바꾸고, 열린 카드에서는 중립색으로, 해결 카드에서는 보이지 않는다.
- 대상이 사라진 댓글에서 "Comment on selection instead"로 같은 본문의 새 댓글을 현재 선택에 만들고, 저장 뒤 원래 댓글 삭제를 확인한다.
- Home 행과 Overview 카드에 "N resolved to check"가 보인다.

## 범위 밖

- 승인(approval). MVP 이후로 미룬 결정(PRODUCT §5)을 유지한다. 재확인 표시는 기기 로컬 표시일 뿐이며 저장소 파일에 기록하지 않는다.
- 전후 비교 화면과 스크린샷. 미룬 결정(PRODUCT §5 Deferred)을 유지한다.
- 넘기기 문구와 Copy 상태(`agent-handoff`), 대상 표시 문구(`comments-readability`), 리로드 중 초안·범위 유지(`revision-continuity`).
- 프로젝트 전체 피드백 목록(`project-feedback`).

## 결정 (2026-10-25 사용자)

- Q1: 수정 도착 알림과 Review 단계(하나씩 대상 위치로 이동, Reopen / Next / Previous / Done)를 둔다.
- Q2: 확인 기준은 캔버스별 마지막 확인 시각(기기 로컬)이다. Home·Overview에 "N to check"를 보인다.
- Q3: Outdated는 계산을 유지하고 이름을 "Canvas changed"로, 열린 카드는 중립색, 해결 카드는 숨김으로 바꾼다.
- Q4: 해결된 댓글의 편집기 기본 버튼은 "Save and reopen"이다(edit와 reopen을 한 번의 append로).
- Q5: fold 출력과 CLI `comments`에 선택적 `lastResolution`을 더하고, skill에 한 줄을 추가해 agent-eval로 측정한다.
- Q6: Location unavailable 카드에 "Comment on selection instead"를 둔다.
