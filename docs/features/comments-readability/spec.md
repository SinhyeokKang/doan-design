# comments-readability — 댓글 대상과 상태를 사람이 읽을 수 있게 한다

근거: [ux-audit-261025-2 보고서](../ux-audit-261025-2/report.md)의 L-6, L-15, L-16(표시 부분), L-18, L-19, L-22(문구), L-23a–m과 리뷰 W-9, W-11, W-12, W-13, W-15, W-16, P-5, P-9, P-10, P-13, P-14. 원 근거는 `.scratch/ux-audit/loop-261025-2/`에 있다.

## 사용자

- **사람**: 댓글을 쓰고, 목록에서 찾고, 실패를 복구하는 사람이다.
- **에이전트**: 바뀌는 것이 없다. 저장 형식과 CLI 출력은 그대로다.

## 문제 (관찰한 사실)

1. **대상 이름을 읽을 수 없다(L-15).** doan-id가 없는 요소는 "To: Element · [data-doan-frame="shipping"] > div:nth-of-type(1) > div:nth-of-type(1) > label:nth-of-type(1)"처럼 CSS 경로로 나오고 여러 줄로 감긴다(S3 #1, S4 #2). 저장된 텍스트("Address")와 프레임은 쓰이지 않는다. 같은 대상을 Inspector는 한 줄 말줄임으로, 사이드바는 `label`로 보인다.
2. **대상이 사라진 댓글의 대상 줄이 흐려진다(L-16 표시 부분).** 비활성 버튼에 opacity 0.4가 적용되어 대비가 약 2.4:1이다(S3 #2). 가장 필요할 때 무엇에 달았는지 읽기 어렵다.
3. **최소 창(960×600)에서 작성기를 열면 머리가 밀려난다(L-18).** 작성기가 목록 뒤에 붙어 패널이 자동 스크롤되고, Comments 제목, 범위·상태 필터, Copy all open이 보이지 않는다. Inspector와 Comments의 잘린 경계가 겹쳐 보인다(S3 #1, S4 #1–#2).
4. **경고와 오류가 원문 코드로 나오거나 두 번 나온다(L-19, L-22).** 잘못된 줄은 "invalid_event · line 5"로만 나온다(S3 #4). 에이전트의 생성·편집 시도도 `agent_not_allowed · line N`으로만 나온다. 읽기 실패는 "Comments are read-only"와 "Couldn’t read comments"로 두 번 나온다(S3 #5).
5. **canvas id가 없으면 패널에 서로 맞지 않는 세 상태가 뜬다(L-6).** "read-only", 끝나지 않는 "Checking Git name…"과 비활성 Retry, 그리고 "Loading comments…"가 함께 나온다(design-nav e2e 스크린샷 `12-missing-id-comments.png`).
6. **작은 문구·표현 문제(L-23).**
   - 핀 aria가 "1 open comments"다.
   - 해결 카드마다 "Reopen this comment before copying."이 붙는다.
   - Git 이름 안내가 작성도 막힌다는 사실을 빠뜨린다.
   - 빈 Resolved·Canvas 목록이 "Leave a note on this target."이라고 한다.
   - 저장 불확실 대화상자가 "directory child exited"라는 내부 용어를 쓴다.
   - Canvas 정보와 Comments가 같은 수를 두 번 보인다.
   - Activity가 "Click an element…" 안내를 밀어낸다.
   - 카드마다 필터와 같은 상태 배지를 반복한다.
   - 카드의 대상 줄이 "캔버스에서 보기" 동작인데 캡션처럼 보인다.
   - 핀에서 Enter를 누르면 포커스가 핀에 남는다.
   - "Updated" 라벨이 캔버스 내용 위에 겹친다.
   - Selection 범위가 비활성인 이유가 없고, "New selection comment"라는 이름이 대상 종류와 맞지 않는다.

## 완료 조건

- 요소 대상은 `Element · label “Address” · in Shipping` 형식(태그, 저장된 텍스트 발췌, 프레임 이름)으로 카드, 작성기 "To:", 초안 대화상자에 한 줄로 나온다. 전체 선택자는 title로 볼 수 있다. doan-id가 있으면 그 id를 쓴다. 저장 형식은 바뀌지 않는다.
- 위치를 찾을 수 없는 대상 줄은 정상 대비로 읽힌다(계산 opacity 1, `--text-2`). 찾을 수 있는 대상 줄에는 hover 표시와 `title="Show on canvas"`가 있다.
- 960×600 창에서 3개 댓글이 있는 상태로 New … comment를 누르면 "To:" 줄, 입력란, Save가 스크롤 없이 Comments 패널 안에 보인다. Comments 제목과 필터도 보인다(작성기는 머리 바로 아래).
- 경고는 코드별 문장으로 보이고 파일 이름(`.doan/comments/<id>.jsonl`)과 "Run doan check in a terminal"을 함께 보인다. `unknown_version`의 기존 문장은 유지한다.
- 읽기 실패는 한 블록("Couldn’t read comments" + Retry)으로만 보인다.
- canvas id가 없거나 잘못되었거나 중복이면, 패널은 원인과 다음 행동을 담은 한 블록만 보인다. 로딩 표시와 Git 이름 블록은 보이지 않는다.
- 3절 6번의 각 항목이 고쳐져 있다. 고치지 않은 항목은 범위 밖에 이유를 적는다.
- 렌더된 문서가 없는 상태(폭 없음, 로드 실패)에서는 "Location unavailable"을 표시하지 않는다. 리로드 중의 처리는 `revision-continuity`가 맡는다.

## 범위 밖

- 해결자·해결 시각, Outdated의 의미, 위치 찾기의 화면 이동: `revision-recheck`
- 대상이 사라진 댓글을 현재 선택에 다시 만드는 동작: `revision-recheck`(재확인 흐름에서 판단)
- 넘기기 문구와 Copy 상태: `agent-handoff`
- 캔버스 클릭 뒤 Tab이 캔버스 안 요소를 먼저 지나는 순서(L-23k). 캔버스 안 Tab 이동은 ARCH §3가 허용한 동작이라 바꾸지 않는다.
- Inspector와 댓글 사이의 프레임 이름 규칙(U-50). 기존 결정을 유지한다.

## 결정 (2026-10-25 사용자)

- Q1: 요소 대상은 태그 + 저장된 텍스트 발췌 + 프레임 이름으로 보인다. doan-id가 있으면 텍스트 대신 id를 쓴다. 전체 선택자는 title로 본다.
- Q2: 작성기는 Comments 머리 바로 아래, 목록 위에 연다. Inspector는 접지 않는다.
- Q3: Canvas 정보의 댓글 수를 없애고, 카드의 상태 배지는 유지한다.
