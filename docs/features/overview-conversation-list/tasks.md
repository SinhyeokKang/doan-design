# Overview 대화 목록 — tasks

순서: 시안 → 순수 함수 → 연결(App)·UI → `/design-sync` → 문서 승격. 포맷 변경이 없어서 스키마 단계는 없다. 커밋은 `/ship` 순서를 따른다: 시안(develop) → test 하나 → feat 하나 → `/design-sync`의 자체 커밋 → 문서별 docs 커밋.

1. **시안**: `/design-draft`로 새 파일 `.doan/canvases/overview-conversation-list.html`에 Overview 화면을 그린다. 기존 시안은 고치지 않는다. 헤더와 가운데 열은 지금 그대로 그리고, 오른쪽 패널에 아래 상태를 담는다.
   - 프로젝트 대화 행과 캔버스 대화 행이 섞인 목록. 프로젝트 행은 각 상태(응답 필요, 작업 중, 사용량 한도 대기, 안 본 끝, 끝남)를 하나 이상씩 담는다.
   - current 행: 쉬고 있을 때, hover, 키보드 포커스, Delete가 보일 때.
   - 읽을 수 없는 프로젝트 대화 행.
   - 행은 있지만 current가 없는 새 대화 상태.
   - 빈 목록, 처음 읽는 중, 읽기 실패와 Retry.
   - Delete 가능·불가 상태.
   - 프로젝트 행 아이콘과 빈 목록·로딩 문구(design.md '결정'의 후보 중에서 고른다).
   - 검증: `doan check --json`이 오류 없이 통과하고, `doan ls --json`에 캔버스가 나온다. 사람이 앱에서 시안을 확정하고, 확정 사실을 design.md에 적는다.
   - ── 커밋 경계(시안, develop에 직접) ──
2. **행 목록 함수 테스트**: `canvasConversationRows`의 union 행, 정렬·동점, 읽을 수 없는 프로젝트 대화, 상태 표시, Delete 가능 여부를 테스트로 고정한다.
   - 확인할 경우
     - 대화가 하나도 없음(빈 목록), 프로젝트만 있음, 캔버스만 있음
     - 프로젝트 행 상태: 응답 필요, 작업 중(promotion 판정 대기·곧 나갈 큐 포함), 사용량 한도 대기, 안 본 끝, `{ phase: "ended", working: true }`
     - 동점: 프로젝트끼리 ID순, 프로젝트가 캔버스보다 앞, 캔버스끼리 경로순, 시간 없는 행은 맨 끝
     - 프로젝트 행은 썸네일 요청과 `observedRows`에 들어가지 않음
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
3. **목록·App 테스트**: 컴포넌트 테스트(`CanvasConversationList.test.tsx`, `CanvasConversationList.keyboard.test.tsx`)와 App 테스트(`App.conversationPanel.test.tsx`, `App.conversationDelete.test.tsx`)에 아래를 더한다.
   - **current**
     - 보이는 프로젝트 대화의 행에 `aria-current="true"`가 붙는다.
     - 새 대화 상태, `wait` 상태, 목록에 아직 없는 막 시작한 대화에는 current가 없다. 첫 목록 읽기에서 current가 된다.
     - 승격으로 캔버스 행이 된 같은 키는 current가 아니다(두 도착 순서 모두).
     - 헤더 메뉴에서 고르면 목록 읽기 없이도 current가 옮겨진다.
   - **열기**
     - 프로젝트 행은 `select`를 부르고 composer에 포커스를 준다. Back/Forward 방문은 추가되지 않는다.
     - 응답을 기다리는 프로젝트 행은 `request`(permission scroll)로 연다.
     - 이미 보이는 행을 누르면 대화가 바뀌지 않는다.
     - 행을 누르면 fresh start가 끝난다(선택으로 친다).
     - 캔버스 행은 지금처럼 캔버스를 연다.
   - **Delete**: 보이는 대화의 행을 지우면 가운데 열이 새 대화 상태가 되고, 포커스는 다음 행, 없으면 이전 행, 그것도 없으면 패널 제목으로 간다.
   - **키보드**
     - ↑/↓, Home, End가 혼합 행 사이를 움직인다. Tab과 Shift-Tab으로 프로젝트 행의 Delete에 간다.
     - Tab으로 들어올 때 마지막 포커스 행, 없으면 current 행, 그것도 없으면 첫 행이다.
   - **순서 고정**: 포인터나 포커스가 목록 안에 있는 동안 활동이 바뀌어도 순서가 그대로이고 새 행은 끝에 붙는다. 둘 다 떠나면 다시 정렬된다.
   - **문구**: 패널 제목, region 라벨, 크기 조절 핸들 라벨, 빈 목록과 로딩 문구가 새 이름을 쓴다(`App.conversationPanel.test.tsx:296`의 핸들 조회도 바꾼다).
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
   - ── 커밋 경계(test) ──
4. **구현**: 행 목록 함수, 목록 컴포넌트, `RightPanel.tsx`, `App.tsx` 연결, `styles.css`를 구현한다(design.md '영향받는 구성 요소').
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`와 `npm --prefix app run lint` 통과.
   - `/runtime-test` 짧은 프로브로 아래를 실제 앱에서 확인한다. 단위 테스트로는 실제 포커스 이동을 확인할 수 없다(ARCHITECTURE §7 'Home tests without a DOM').
     - 프로젝트 행 클릭 → 가운데 열 전환과 composer 포커스
     - 캔버스 행 클릭 → 캔버스 열림
     - 보이는 대화의 행 Delete → 새 대화 상태와 다음 행 포커스
   - ── 커밋 경계(feat) ──
5. **`/design-sync`**: 새 시안과 구현을 실제 앱에서 computed style로 비교해 맞추고, `docs/design/project.md`에 측정값을 기록한다. 고친 내용과 측정 기록은 `/design-sync`가 자체 커밋한다.
   - 검증: `/design-sync` 보고서에서 시안과 구현의 차이가 0이거나, 남은 차이가 문서화돼 있다.
6. **문서 승격**: 아래를 현재 규칙으로 고쳐 쓰고(영어, 문서별 커밋), `docs/features/overview-conversation-list/`를 지운다.
   - **PRODUCT §5 item 3**
     - Project Overview 개요 문장
     - 'Canvas conversations' 항목(이름, 프로젝트 행, current, 순서와 순서 고정, 열기 규칙). Retry 포커스를 말하는 "current keyboard row"는 "tab-stop row"로 바꿔 `aria-current` 행과 겹치지 않게 한다.
     - Delete 문장: "If the Overview showed it … focus in its composer"를 헤더 메뉴에서 지울 때로 좁히고, 목록에서 지울 때는 목록 규칙을 따른다고 적는다.
     - 목록 이름을 가리키는 다른 문장: `:218`, `:281`, `:355`, `:419`
   - **ARCHITECTURE**: §3 'Overview'(`canvasConversationRows.ts`를 설명하는 곳)와 `:546`의 Quick Open 문장.
   - **DESIGN**: `docs/DESIGN.md`의 색인과 `docs/design/` 아래 문서 중 목록 이름을 가리키는 곳. 측정 절 제목(예: '…and Canvas conversations Delete')은 측정 당시 이름이므로 그대로 둔다. `docs/design/project.md` 본문은 `/design-sync`가 이미 고쳤으니 이름만 확인한다.
   - **`docs/BACKLOG.md:99`**: 목록 이름을 가리키는 문장.
   - 검증: `grep -rni "canvas conversations" docs README.md --exclude-dir=postmortem --exclude-dir=features`의 남은 결과가 측정 절 제목과 그 인용뿐이다. 문서만 바뀌므로 참조 확인으로 검증한다(AGENTS.md 'Workflow' `/verify`).
   - ── 커밋 경계(docs, 문서마다) ──
