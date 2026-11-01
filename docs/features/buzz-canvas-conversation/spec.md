# buzz-canvas-conversation — spec

`buzz-restyle`의 자식 12번이다(부모 [spec](../buzz-restyle/spec.md) 표 12번과 '캔버스 페이지 방향'). 캔버스 페이지의 대화 패널 껍데기(`buzz-canvas`)에 캔버스 대화를 채우고, 캔버스의 프레임·요소를 대화에 넣는 길을 만들고, 앱의 코멘트 화면 코드를 걷어낸다. 선행: `buzz-conversation`(main 병합), `buzz-canvas`(문서·초안 확정, 구현 전). `buzz-inspector`는 기다리지 않는다. 이 feature는 인스펙터에 기대지 않고, 도구모음은 `role="toolbar"`라 도구를 어느 순서로 더해도 된다(2026-11-01 user, 부모 표 12번 선행을 고친다).

## 사용자

- **사람(앱 사용자)**: 캔버스를 보면서 그 캔버스의 대화를 읽고 이어 간다. 새 대화를 시작하고, 이전 대화를 찾아 다시 연다. 프레임·요소·빈 곳을 골라 메시지에 칩으로 넣는다. 에이전트의 권한 요청에 답하고, 실패한 턴을 알아본다.
- **에이전트**: 받는 프롬프트의 형식은 바뀌지 않는다. 이미 있는 앵커(`frame`·`element`·`point`, `{{n}}` 표시)를 이제 앱이 실제로 보낸다. 코멘트 CLI·스킬·형식은 이 feature에서 바뀌지 않는다(별도 feature).

## 문제 (2026-11-01 관찰)

- 캔버스 대화는 앱에서 읽거나 이어 갈 수 없다(PRODUCT §5 항목 1 'Project conversations'). Overview의 Canvas conversations 행은 캔버스를 열 뿐이고, 캔버스 페이지 오른쪽 패널은 `buzz-canvas` 뒤에 빈 껍데기다.
- 대화 백엔드는 앵커(`Anchor`: `frame`·`element`·`point`)와 `{{n}}` 표시를 받지만, 앱에 앵커를 고르는 피커와 칩이 없다(ARCHITECTURE §7 'Agent conversation runtime and IPC': "there is no anchor picker or anchor chips").
- 캔버스 페이지 위쪽에는 임시 상태줄이 그 root의 최근 프로젝트 대화를 보인다. 이 캔버스의 대화가 아니어서, 캔버스 작업 표시(`buzz-canvas`)의 응답 대기에 답할 곳이 없다.
- 코멘트 화면(Comments 패널, 핀, Review bar, Hand Off)은 `buzz-canvas`가 캔버스 페이지에서 그리지 않게 했지만, 컴포넌트와 앱 전용 IPC가 남아 있다.

## 이번 범위

1. **캔버스 대화 패널 내용**: 패널 헤더의 대화 드롭다운(새 대화, 이 캔버스의 현재·보관 대화, `buzz-canvas` 초안 `conversation-menu` 프레임 모양), 본문의 스레드(`ConversationThread`), 아래의 docked 입력창(`DockedComposer`). Overview 대화 화면의 부품과 규칙(대기열, 반환된 초안, 복원, 모델·effort, 첨부, 프리셋)을 그대로 쓴다. 캔버스당 현재 대화는 하나다(PRODUCT §3 In scope 6).
2. **새 대화와 이어 가기**: 현재 대화가 없거나 "New conversation"을 고르면 새 대화 상태다. 첫 전송은 그 캔버스에 묶인 새 대화를 시작한다(새 계정 연결의 `new`). 터미널의 Claude Code·Codex가 그린 캔버스에 세션 연결이 있으면(`conversationResumeTarget`) 새 대화 상태에 "Continue the <Provider> session from your terminal"과 마지막 check 시각을 보이고, 기본은 그 세션 이어 가기(`mode: "resume"`)다. 새 계정 연결로 시작하는 것도 고를 수 있다. 연결이 없거나 쓸 수 없으면 선택지 없이 새 대화다(2026-11-01 user).
3. **대화 상태는 패널에서**: 권한 요청과 답, 실패·중단, 진행 상태는 스레드가 보인다(`buzz-canvas`의 캔버스 작업 표시는 그대로). 캔버스 페이지에서 임시 상태줄을 없앤다. 이 캔버스의 대화는 패널이, 프로젝트 대화와 다른 캔버스의 대화는 사이드바 슬롯과 권한 토스트가 알린다. 문제 워크스페이스 화면의 상태줄은 그대로다(2026-11-01 user).
4. **패널을 여는 규칙**: 사람이 특정 캔버스 대화로 가려는 동작(Overview 행, 알림·토스트의 Open, 승격 알림의 Open, 작업 안내 캡슐의 Open, 답 대기·안 본 끝이 보이는 사이드바 행, 대화에 넣기, ⌘N)은 접힌 패널을 펴고 그 대화를 보인다. 답을 기다리는 동안 캔버스 작업 안내 캡슐에는 Stop 대신 Open만 둔다(`buzz-canvas` 확정분 변경, 2026-11-01 user). 에이전트가 시작하거나 권한을 요청하는 것만으로는 펴지 않는다. 사람이 접어 둔 선택을 존중하되, 접혀 있을 때 캔버스 헤더의 열기 버튼(Show conversation)에 새 소식 표시(accent 점)를 둔다: 이 캔버스의 현재 대화가 답을 기다리거나, 본 적 없는 끝(완료·실패·중단)이 있을 때(2026-11-01 user).
5. **본 것 규칙**: 캔버스 대화는 그 캔버스 페이지에서 대화 패널이 펴져 있고 창이 포커스를 가진 채 그 대화가 보일 때 본 것으로 기록한다(지금은 "캔버스를 열면").
6. **앵커 칩**: 입력창 필드를 칩을 담는 필드로 바꾼다. 칩은 프레임, 요소, 점(프레임 안 빈 곳의 좌표)이고 메시지 안 커서 위치에 인라인으로 들어간다. 보낸 메시지의 칩을 누르면 그 대상으로 뷰를 옮기고 강조한다. 찾지 못하면 "Not in the current canvas"를 보인다. 대화 제목·미리보기·알림처럼 한 줄로 보이는 곳은 칩 자리에 칩 이름을 쓴다.
7. **칩을 넣는 두 길**(부모 '캔버스 페이지 방향'): (a) 입력창 옆 요소 피커 — 켜면 캔버스가 고르기 상태가 되고, 프레임·요소를 누르면 칩, 프레임 안 빈 곳을 누르면 점 칩이 들어가며 입력창 포커스가 돌아온다. Esc로 취소한다. 고르기 상태의 캔버스 표시도 여기서 만든다. (b) 도구모음의 "Add to conversation" 도구 — 현재 선택(프레임·요소)이 있을 때 활성이고, 누르면 패널을 펴고 입력창 커서 위치에 칩을 넣는다. 메뉴 Edit > Add Selection to Conversation(⌘L)도 같다.
8. **Overview·승격과의 연결**: Overview의 Canvas conversations 행은 캔버스를 열고 패널에 그 현재 대화를 보인다. 프로젝트 대화가 캔버스로 승격되면 Overview의 "moved to" 줄의 Open이 그 캔버스와 대화 패널로 간다.
9. **오류 처리**(2026-11-01 user): 캔버스 대화의 시작·전송·복원·대기열·턴 실패·권한 답, 캔버스 로드 문제 중의 피커, 칩 대상 없음, 터미널 세션 이어 가기 불가를 패널에서 그 자리에 보이고 다음 동작을 준다(design §2 '오류 처리' 표).
10. **앱의 코멘트 화면 코드 제거**: Comments 패널, 코멘트 핀, Review bar·배너, Hand Off 다이얼로그, 코멘트 세션과 그 renderer 모듈, 앱 전용 코멘트 IPC(`comments:*`)와 Review 상태 IPC(`review-state:*`), 코멘트 초안 가드, Go 메뉴의 Next/Previous Resolved Comment, Activity의 resolved 집계, 사이드바 캔버스 행의 코멘트 수·코멘트 읽기 오류 표시. 캔버스 identity·document bindings와 eval이 쓰는 공용 코멘트 함수는 남긴다(design §1 남김·지움 표). 코멘트 파일, CLI·스킬·JSON Schema는 남긴다(2026-11-01 user: 앱 쪽은 main IPC와 Quit 가드까지 모두 지운다).
11. **공용 선택 카드**(2026-11-01 user): 선택 카드(`ob-choice`)의 오른쪽 체크를 없애고 왼쪽 위 라디오로 바꾼다. 온보딩 Your projects, Add Projects의 폴더 안 저장소, 캔버스 세션 이어 가기가 같은 카드를 쓴다.
12. **새 대화 IPC**: 캔버스 새 대화가 Settings 기본값·고른 모델·첨부를 쓰도록 `startConversation` `mode: "new"`가 `model`·`effort`·`attachments`를 받는다(2026-11-01 user).

## 완료 조건

- 세션 연결이 있는 캔버스의 새 대화 상태에 터미널 세션 이어 가기가 기본으로 보이고, 보내면 그 세션이 이어진다. 연결이 없거나 쓸 수 없으면 보이지 않는다. 확인: 순수 함수 테스트, 연결을 만들 수 있으면 `/runtime-test`(아니면 미검증).
- 캔버스를 열면 대화 패널에 그 캔버스의 현재 대화 스레드가 보이고, 입력창으로 이어 보낼 수 있다. 현재 대화가 없으면 새 대화 상태이고, 첫 전송이 이 캔버스에 묶인 대화를 시작한다. 확인: 순수 함수 테스트와 `/runtime-test`(로그인한 공급자로).
- 패널 헤더의 대화 드롭다운에 New conversation, 현재 대화, 나머지 대화가 최근 활동 순으로 보이고, 보관 대화를 고르면 읽기 상태로 열리며 보내면 복원된다(PRODUCT §5 항목 1 'Project conversations'의 복원 규칙). 확인: 순수 함수 테스트와 `/runtime-test`.
- 권한 요청, 실패, 중단, 대기열, 반환된 초안이 패널 스레드와 입력창에서 Overview와 같은 규칙으로 보인다. 캔버스 페이지 위쪽 임시 상태줄은 없고, 문제 워크스페이스 화면에서는 그대로 보인다. 확인: 단위 테스트.
- Overview 행, 알림·토스트 Open, 승격 알림 Open, 캡슐 Open으로 오면 접힌 패널이 펴지고 그 대화가 보이며, 권한 요청으로 왔으면 그 요청의 첫 선택지에, 아니면 입력창에 포커스가 있다. 답 대기 중 캡슐에는 Open만 있다. 에이전트가 시작하거나 권한을 요청해도 접힌 패널은 그대로이고, 그때 열기 버튼에 새 소식 점이 보인다(답 대기, 본 적 없는 끝). 패널을 펴서 그 대화가 보이면 점이 사라진다. 확인: 단위 테스트와 `/runtime-test`.
- 패널이 펴져 있고 창이 포커스를 가진 채 그 대화가 보이면 본 것으로 기록되고, 접혀 있으면 기록되지 않는다. 확인: 단위 테스트.
- 요소 피커를 켜면 고르기 상태 표시가 보이고, 프레임·요소·빈 곳을 누르면 각 칩이 커서 위치에 들어가고 입력창 포커스가 돌아온다. Esc는 고르기만 취소한다. 확인: 단위 테스트와 `/runtime-test`.
- 선택이 있으면 "Add to conversation" 도구와 ⌘L이 활성이고, 누르면 패널이 펴지며 칩이 들어간다. 선택이 없거나 입력창·캔버스를 쓸 수 없으면 비활성이다. 확인: 단위 테스트.
- 캔버스 A의 새 대화 초안(칩 포함)이 캔버스 B나 Overview의 새 대화 입력창에 나타나지 않는다. 칩으로 시작한 대화의 제목·미리보기에 `{{n}}`이 보이지 않는다. 확인: 순수 함수 테스트.
- 캔버스 새 대화가 고른 모델·effort·첨부로 시작한다. 확인: IPC 단위 테스트와 `/runtime-test`.
- 온보딩 Your projects와 Add Projects의 선택 카드에 왼쪽 위 라디오가 보이고 체크 아이콘이 없다. 확인: `Onboarding.test.tsx`와 `/design-sync` 측정.
- 보낸 메시지의 칩을 누르면 대상(`data-doan-id` → selector → 프레임 id 순서)으로 뷰가 옮겨 강조되고, 찾지 못하면 "Not in the current canvas"가 보인다. 칩은 선택·`doan active`·입력창을 바꾸지 않는다. 확인: 순수 함수 테스트와 `/runtime-test`.
- 칩이 든 메시지가 `{{n}}`과 앵커로 전송·대기열에 들어가고, 반환된 초안에서 칩으로 돌아온다. IME 조합과 포커스가 칩 삽입·모양 전환에서 유지된다. 확인: 순수 함수 테스트와 `/runtime-test`(CDP IME, 네이티브 IME는 미검증으로 남길 수 있음).
- design §2 '오류 처리' 표의 모든 경우에서 패널이 표에 적힌 것을 보이고, 입력(텍스트·칩·첨부·프리셋)이 남는다. Overview와 같은 코드는 같은 문구다. 확인: `canvasConversationError` 순수 함수 테스트(표의 행마다), 실제로 만들 수 있는 경우(목록 읽기 실패, 캔버스 로드 실패 중 피커 비활성, 칩 대상 없음, 로그인 만료)는 `/runtime-test`, 나머지는 미검증으로 남긴다.
- 앱 코드에 Comments 패널·핀·Review·Hand Off·코멘트 세션·`comments:*` IPC·초안 가드가 없다. 코멘트 CLI(`doan comments` 등)와 형식은 그대로 동작한다. 확인: 셀렉터·이름 grep, `node .agents/skills/verify/scripts/verify.mjs --eval`(Go 테스트와 eval import 포함).
- 초안 `.doan/canvases/buzz-canvas-conversation.html`과 구현이 `/design-sync`로 맞는다.
- 결론이 PRODUCT·ARCHITECTURE·DESIGN에 현재 규칙으로 들어가고 이 디렉터리를 지운다.

## 비목표

- 코멘트 CLI·스킬·JSON Schema·eval의 제거(별도 feature, 2026-10-26 user).
- 에이전트가 작업 중인 곳을 실시간으로 짚기(`buzz-canvas` 비목표, PRODUCT Open questions).
- 인스펙터와 도구모음의 인스펙트 도구(`buzz-inspector`).
- 한 캔버스에 현재 대화를 둘 이상 두기, 대화 삭제, 대화 이름 바꾸기.
- 프로젝트 대화를 캔버스 패널에서 읽기. 프로젝트 대화는 Overview가 맡는다.
- 다른 캔버스의 프레임·요소를 칩으로 넣기(칩은 열린 캔버스만).
- 프레임 밖(보드 여백)의 점 앵커.
- 피커 단축키(Add to conversation만 ⌘L).
- 칩의 대상이 다시 로드 뒤 옮겨졌을 때 칩을 고쳐 쓰기. 보낸 칩은 보낸 그대로다.
