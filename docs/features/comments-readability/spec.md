# comments-readability — 댓글 대상과 상태를 사람이 읽을 수 있게 한다

근거: [ux-audit-261025-2 보고서](../ux-audit-261025-2/report.md)의 L-6, L-15, L-16(표시 부분), L-18, L-19, L-22(문구), L-23a–m과 리뷰 W-11, W-12, W-13, W-15, W-16, P-5, P-9, P-10, P-13, P-14. 원 근거는 `.scratch/ux-audit/loop-261025-2/`에 있다.

선행: `revision-continuity`. 리로드와 렌더 문서가 없는 상태에서 위치를 어떻게 판정할지(W-9)는 그 기능이 맡는다.

## 사용자

- **사람**: 댓글을 쓰고, 목록에서 찾고, 실패를 복구하는 사람이다.
- **에이전트**: 바뀌는 것이 없다. 저장 형식과 CLI 출력은 그대로다.

## 문제 (관찰한 사실)

1. **대상 이름을 읽을 수 없다(L-15).** doan-id가 없는 요소는 "To: Element · [data-doan-frame="shipping"] > div:nth-of-type(1) > div:nth-of-type(1) > label:nth-of-type(1)"처럼 CSS 경로로 나오고 여러 줄로 감긴다(S3 #1, S4 #2). 저장된 텍스트("Address")와 프레임은 쓰지 않는다. 같은 대상을 Inspector는 한 줄 말줄임으로, 사이드바는 `label`로 보인다.
2. **대상이 사라진 댓글의 대상 줄이 흐려진다(L-16 표시 부분).** 비활성 버튼에 opacity 0.4가 걸려 대비가 약 2.4:1이다(S3 #2). 무엇에 달았는지 가장 필요할 때 읽기 어렵다.
3. **최소 창(960×600)에서 작성기를 열면 머리가 밀려난다(L-18).** 작성기가 목록 뒤에 붙어 패널이 자동 스크롤되고, Comments 제목·범위·상태 필터·Copy all open이 보이지 않는다. Inspector와 Comments의 잘린 경계가 겹쳐 보인다(S3 #1, S4 #1–#2). 스크린샷으로 재면 패널은 282px이고, 머리는 약 152px, 작성기는 약 204px이다.
4. **경고와 오류가 원문 코드로 나오거나 두 번 나온다(L-19, L-22).**
   - 잘못된 줄은 "invalid_event · line 5"로만 나온다(S3 #4).
   - 에이전트가 댓글을 만들거나 고치려 한 시도도 `agent_not_allowed · line N`으로만 나온다.
   - 읽기 실패는 "Comments are read-only"와 "Couldn’t read comments"로 두 번 나온다(S3 #5).
   - 이 경고들은 `doan check`가 아니라 `doan comments`만 보고한다(`cli/internal/cli/read.go`).
5. **canvas id가 없으면 패널에 서로 맞지 않는 세 상태가 뜬다(L-6).** "read-only"와 함께, 끝나지 않는 "Checking Git name…"과 비활성 Retry, "Loading comments…"가 같이 나온다(design-nav e2e 스크린샷 `12-missing-id-comments.png`). id가 잘못됐거나 중복이면 main의 일반 오류가 읽기 실패로만 나온다.
6. **작은 문구·표현 문제(L-23).**
   - 핀 aria가 "1 open comments"다.
   - 해결 카드마다 "Reopen this comment before copying."이 붙는다.
   - Git 이름 안내가 작성까지 막힌다는 사실을 빠뜨린다.
   - 빈 Resolved·Canvas 목록이 "Leave a note on this target."이라고 한다.
   - 저장 불확실 대화상자에 "directory child exited"라는 말이 나온다.
   - Canvas 정보와 Comments가 같은 수를 두 번 보인다.
   - Activity가 "Click an element…" 안내를 밀어낸다.
   - 카드의 대상 줄이 "캔버스에서 보기" 동작인데 캡션처럼 보인다.
   - 핀에서 Enter를 누르면 포커스가 핀에 남는다.
   - 작성기가 사라지면 포커스가 `<body>`로 간다.
   - "Updated" 라벨이 캔버스 내용 위에 겹친다.
   - Selection 범위가 비활성인 이유가 없고, "New selection comment"라는 이름이 대상 종류와 맞지 않는다.

## 완료 조건

### 대상 표시
- 요소 대상은 카드, 작성기 "To:", 초안 대화상자 "To:" 줄에 `Element · label “Address” · in Shipping` 형식으로 한 줄에 나온다.
  - doan-id가 있으면 텍스트 대신 id를 쓴다: `Element · button ship-next · in Shipping`.
  - 프레임 대상은 `Frame · Payment`, 캔버스 대상은 `Canvas`다.
  - 프레임 이름은 title을 먼저 쓰고, 없으면 id를 쓴다. 이름은 `doan ls` 행의 프레임 목록에서 가져오므로 열리지 않은 캔버스에서도 같다.
  - 저장 형식은 바뀌지 않는다.
- 위치를 찾을 수 있는 대상 줄은 accent 색 버튼이고 title은 "Show on canvas"와 전체 선택자다. 찾을 수 없는 대상 줄은 텍스트(`--text-2`, 계산 opacity 1)이고 title은 전체 선택자다.

### 배치 (960×600)
- 3개 댓글이 있는 상태에서 "Comment on selection"/"Comment on canvas"를 누르면, 작성기는 머리 바로 아래 목록 위에 열린다.
- Comments 제목 줄은 sticky로 보인다. "To:" 줄, 입력란, Save는 스크롤 없이 패널 안에 보인다. 범위·상태 필터는 위로 스크롤하면 닿는다.
- 작은 창에서는 입력란 최소 높이를 줄여 이 조건을 맞춘다. Inspector는 접지 않는다.
- 1238×780에서는 머리 전체와 작성기가 함께 보인다.

### 경고와 오류
- 경고는 같은 코드끼리 한 줄로 묶는다. 묶음 제목은 "Some comment changes were ignored"이고, 코드별 문장과 줄 번호("Lines 5, 9")가 따라온다. 블록 끝에는 파일 이름(`.doan/comments/<id>.jsonl`)과 "Ask your agent to run doan comments and fix the file."이 한 번 나온다. `unknown_version`은 기존 문장에 줄 번호만 더한다.
- 읽기 실패는 한 블록("Couldn’t read comments" + Retry)으로만 보인다. 이 상태에서도 편집 초안의 Save는 비활성이다.
- canvas id가 없거나, 잘못되었거나, 중복이면 패널은 원인별 블록 하나만 보인다. 로딩 표시, Git 이름 블록, 범위·상태 필터, 넘기기·작성 버튼은 렌더하지 않는다.
  - 없음: "This canvas has no ID" + "Ask your agent to add a unique doan:canvas ID. Run doan check in a terminal to see details."
  - 잘못됨: "This canvas ID isn't valid" + 같은 다음 행동
  - 중복: "Another canvas uses the ID <id>" + "Ask your agent to give one of them a different ID. Run doan check in a terminal to see details."
  - `project-feedback`의 이전 id 안내 줄이 있으면 이 블록 위에 보인다.

### 작은 항목
- design §6 표의 결과와 같다. 핀 aria 단수형, 해결 카드 본문 안내 제거, Git 이름 문구, 빈 목록 네 조합, 저장 불확실 문구, Canvas 정보 수 제거, 안내 순서, 포커스 규칙, Updated 배경, Selection 범위 이유와 버튼 이름을 고친다.
- 카드 상태 배지(L-23h)는 유지한다(Q3). Home의 "Open" 태그와 "N open" 중복(L-23f)은 `revision-recheck`·`project-feedback`의 Home 요약 정리에 맡긴다.

## 범위 밖

- 렌더 문서가 없는 상태와 리로드 중의 위치 표시(W-9, T-11): `revision-continuity`
- 해결자·해결 시각, Outdated의 의미, 위치 찾기의 화면 이동: `revision-recheck`
- 대상이 사라진 댓글을 현재 선택에 다시 만드는 동작: `revision-recheck`
- 넘기기 문구, Copy 상태, 해결 카드의 넘기기 버튼과 그 이유 표시: `agent-handoff`
- 캔버스를 클릭한 뒤 Tab이 캔버스 안 요소를 먼저 지나는 순서(L-23k). 캔버스 안 Tab 이동은 ARCH §3가 허용한 동작이다.
- Inspector의 프레임 이름 규칙. U-50대로 id를 유지한다.

## 결정 (2026-10-25 사용자)

- Q1: 요소 대상은 태그 + 저장된 텍스트 발췌 + 프레임 이름으로 보인다. doan-id가 있으면 텍스트 대신 id를 쓴다. 전체 선택자는 title로 본다.
- Q2: 작성기는 Comments 머리 바로 아래, 목록 위에 연다. Inspector는 접지 않는다.
- Q3: Canvas 정보의 댓글 수를 없애고, 카드의 상태 배지는 유지한다.
- 리뷰 C1: 960×600에서는 제목 줄을 sticky로 두고 To:·입력란·Save만 스크롤 없이 보장한다. 필터는 스크롤로 닿는다.
- 리뷰 C2: 댓글 대상의 프레임 이름은 title을 먼저 쓴다(`ls` 행 기준). Inspector는 U-50대로 id를 유지한다. U-50의 댓글 부분을 바꾸는 결정으로 승격한다.
- 리뷰 C3: 경고의 다음 행동은 `doan comments`다. 위치 판정은 `revision-continuity`가 맡는다. 해결 카드 버튼은 `agent-handoff`가 맡는다. identity 블록은 원인별로 보이고, 포커스 규칙과 측정 방식을 위와 design대로 정한다.
