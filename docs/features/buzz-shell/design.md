# buzz-shell — design

디자인 확정: 2026-10-27. 사용자 승인: “좋아 AppShell 확정하자”. 이 문서가 이전 비교안·드로어안·누적 수정 메모를 대체한다. 홈·인증·본문 내부는 승인 범위가 아니다.

## 근거

- 사용자가 첨부한 `스크린샷 2026-10-27 10.55.53.png`: 투명한 Shell/LNB, 흰색 본문, 그룹형 탐색, 무채색 선택 음영. Buzz 버전은 미확인이다.
- 사용자 첨부 `스크린샷 2026-10-27 13.37.36.png`: 옅은 캡슐 배경과 흰 선택 캡슐로 구성한 헤더 버튼 그룹.
- 읽기 전용 `~/code/buzz-app`, `c40dfdf4c81aabe759f3a4329c3e77f854746a59`: AppShell.tsx·globals.css·tauri.conf.json의 셸 배치와 창 위치를 확인했다. 설치·실행·수정하지 않았다.
- `~/code/malmoi/lib/hue.ts`, `components/ui/project-thumbnail.tsx`, `components/ui/tone.ts`, `app/globals.css`, 설치된 Tailwind theme.css: 이름 기반 고정색 폴백.
- Malmoi의 `app/fonts/geist/`: Geist Sans v1.7.2, 100–900 가변 WOFF2. 원본 파일과 SIL OFL 라이선스를 `design/fonts/geist/`에 보관했다. SHA-256은 `2ffebe993e969069a9789d15164b7715d42491b5835516c5e3b935d5f81b05f1`이다.
- 현재 `App.tsx`, `Home.tsx`, `Sidebar.tsx`, `QuickOpenDialog.tsx`, `RightPanel.tsx`, `ds/controls.css`, `tokens.css`, DESIGN.md를 대조했다. 아이콘은 설치된 lucide-react의 정의를 확인했다.

## 승인 시안과 측정 기준

캔버스는 `design/buzz-shell.html`, id `buzz-shell`, 폭 2560이다. 프레임 id 10개를 유지한다.

| 프레임 | 역할 |
|---|---|
| `a-workspace` | 기본 260px LNB, 이전만 활성 — 주 기준 |
| `b-workspace` | 동일 골격, 이전·다음 모두 활성 |
| `c-workspace` | 240px LNB 비교 이력, 다음만 활성. 폭 구현 기준은 아님 |
| `a-minimum`, `b-minimum` | 960×600, 긴 이름·상태 띠·기록 활성 상태 |
| `project-worktrees` | 읽기 전용 뱃지와 프로젝트 드롭다운 열림 |
| `project-list-states` | 여러 프로젝트 펼침과 캔버스 없는 프로젝트 |
| `home-panel`, `home-sheet`, `home-empty` | 이전 홈 비교 이력. 본문과 LNB 유무 모두 승인 기준에서 제외 |

오른쪽 기존 정보·코멘트 열과 가운데 가상 예제 화면은 배치 맥락용이다. 이들의 내용·색·내부 버튼까지 새 디자인으로 승인한 것은 아니다. 모든 프레임은 정적 HTML이며 클릭·기록·메뉴 닫기·전환을 구현하지 않았다.

| 요소 | 확정값/역할 |
|---|---|
| 창 | 기본 1238×780, 최소 960×600 |
| 헤더 | 56px, 신호등과 이전·다음 중심 y=28px |
| 이전·다음 | 32px 버튼, 16px Arrow, 간격 4px, 항상 표시 |
| 중앙 그룹 | Add Projects → Projects → Settings, 높이 40px·패딩 4px·내부 버튼 32px, Projects만 흰색 선택 |
| Shell/LNB | 투명·블러, 별도 LNB Panel 없음, 셸 점 격자 없음 |
| 본문 | 흰색 패널, 모서리 24px, 셸 좌우/하단 여백 8px·LNB와 간격 8px |
| LNB | 기본 260px, 검색 고정·프로젝트 목록 독립 스크롤 |
| Search | 36px, `--radius-control` 20px, 아이콘 16px, KBD 없음 |
| 행 | 높이/클릭 영역 32px, 아이콘·썸네일 16px, 글자 간격 8px, 그룹 간격 16px |
| 글자 | Geist, 캔버스·헤더 14/20 400, 프로젝트 이름 14/20 500 |
| 선택/hover | `--affordance-backdrop-pressed` / `--affordance-backdrop-hover` |
| 캔버스 | Palette, 이름 끝 `.html`만 생략, Accent Dot 6px |
| 프로젝트 | 썸네일+이름, 브랜치 뱃지, 우측 Ellipsis 32×32px. 쉐브론·디렉터리 캡션 없음 |
| 브랜치 뱃지 | 공통 `.doan-chip`, GitBranch 12px·간격 4px, 최대 폭 84px, 읽기 전용 |
| 공통 칩 기본값 | 12px, 줄높이 1.35, 상하 2px·좌우 6px, 약 20.2px 높이, 공통 모서리 12px |
| 칩 translucent | 배경 `--affordance-backdrop-hover`(검정 6%), 글자 `--text-subtle`, hover/탭 정지 없음 |

HTML은 배경 모형 위 흰색 55%·blur 32px로 재질을 보여준다. 이 수치를 macOS 네이티브 API의 확정 인자로 간주하지 않는다. 폰트는 `-webkit-font-smoothing: antialiased`와 `-moz-osx-font-smoothing: grayscale`을 적용한다. 레이블은 Projects처럼 쓰며 전체 대문자 표기를 피한다. ID 같은 약어·실제 파일명은 유지한다.

## 탐색과 프로젝트 메뉴

현재 조회 중인 프로젝트는 펼침 고정이다. 이름 부분에 접기 액션을 주지 않되 다른 프로젝트는 이름 영역으로 접고 펼친다. … 버튼은 조회 여부와 무관하게 사용한다. 캔버스는 선택한 워크트리 기준으로 나열하며 프레임을 중첩하지 않는다. 긴 이름은 말줄임을 허용한다.

브랜치 뱃지는 span이며 워크트리 선택을 직접 열지 않는다. … 버튼 아래 4px에 드롭다운을 end 정렬한다. 시안 폭은 244px, 패딩 4px·모서리 12px다. 위에는 Worktrees 레이블과 GitBranch·이름·경로·현재 선택 체크를 두고, 구분선 아래에는 다음 액션을 둔다.

| 액션 | 아이콘 | 동작 |
|---|---|---|
| Show in Finder | FolderOpen | 기존 폴더 표시 |
| Project Settings | Settings | 기존 프로젝트 설정 진입 |
| Remove from doan | CircleMinus | 기존 앱 목록 제거. 파일 삭제가 아님 |

모든 메뉴 아이콘은 16px, 텍스트와 간격은 8px다. 워크트리와 액션의 텍스트 시작선은 같다. Radix DropdownMenu와 Portal을 사용해 LNB 스크롤에서 분리한다. 아래 공간이 부족하면 위로 열고 창에도 다 못 들어가면 메뉴 내부 스크롤을 사용한다. 외부 클릭·Esc·선택 후 닫기와 트리거 포커스 복귀는 기존 보호 흐름을 따른다. 메뉴 행은 키보드로 이동할 수 있어야 한다. 배경 딤·우측 드로어·닫기 버튼은 없다.

검색은 기존 Quick Open의 캔버스·프레임 검색과 단축키를 유지한다. Add Projects는 기존 OS 폴더 선택 → 폴더 종류별 분기 흐름, Settings는 기존 별도 창을 연다. Projects 버튼은 작업 영역의 현재 모드를 나타내며 홈 본문 설계를 이 버튼에 끌어오지 않는다. 구체적인 이동 연결은 구현 전 과업에서 정리한다.

이전·다음은 실제 기록의 이동 가능 여부에 따라 활성화한다. 시안의 Home 비활성은 빈 기록 예시이며 화면 종류에 따른 강제 비활성 규칙이 아니다. 기록 단위·수명·중복·삭제된 대상 처리·워크트리별 복원은 아직 기능 설계가 필요하다. 미작성 코멘트/선택 보호를 우회하지 않는다.

## 폰트와 썸네일

Geist를 앱 리소스로 번들하고 로컬 @font-face로 제공한다. 원격 폰트 요청이나 새 패키지는 필요 없다. 앱 UI용 `--type-family`를 바꾸되 캔버스 iframe의 자체 폰트는 건드리지 않는다. 기존 시스템 스택을 대체 글꼴로 유지하며, 개발·프로덕션·패키지 및 오프라인 로딩을 검증한다. 폰트 변경으로 생기는 줄바꿈·말줄임은 실제 화면에서 재측정한다.

프로젝트 이미지가 없거나 로딩에 실패하면 이니셜과 고정색 타일을 쓴다. Malmoi와 동일하게 이름을 trim하고 Unicode 코드 포인트마다 `hash = ((hash * 33) XOR codePoint) >>> 0`을 적용한다. 시작값은 5381이다. `hash % 8`로 rose·orange·amber·emerald·teal·sky·indigo·fuchsia 순서에서 고른다. 팔레트는 Malmoi의 Tailwind 600 값이다. 같은 이름이면 같은 색이며 서로 다른 이름의 색 중복도 허용한다. 16px 타일·4px 반경·흰 이니셜을 유지한다. 예시 doan-design과 malmoi는 같은 indigo다.

시안 팔레트는 `design/mock.css`의 임시 `--mock-project-*`다. 앱 구현 시 프로젝트 식별용 공통 역할 토큰으로 옮기며 성공/경고 같은 상태 토큰으로 대신하지 않는다. 실 이미지 공급원과 캐시 정책은 별도다. Dot은 시각 예시만이며 에이전트 판별이나 확인 상태 저장을 이 과업에서 만들지 않는다.

## 영향 범위와 경계

- 앱: Electron main 창 옵션, App 셸·탐색 상태·LNB, 현재 프로젝트/워크트리 데이터 연결, 기존 관리 액션, 공통 칩·폰트 토큰, 패키지 폰트 리소스, 관련 runtime 측정.
- 오른쪽 패널의 기존 내용은 유지한다. 최종 표시/숨김·대화 탭은 buzz-conversation, Inspector 내용은 buzz-inspector다. Overview 본문은 buzz-project다.
- CLI·MCP·스킬·캔버스/코멘트 포맷·JSON Schema·v·TS/Go 공용 fixture 변경은 없다. doan check 규칙과 serving scope도 변경하지 않는다.
- CSP·sandbox iframe·append-only 기록·기존 자격 증명 비관리·git 쓰기 금지를 유지한다. 로컬 워크트리 경로를 선택하는 것과 git checkout은 다르다.
- 라이트 테마와 close→hide·전체 화면 복귀·activate 수명은 유지한다. 헤더 빈 영역만 drag, 버튼·메뉴·모달과 겹치는 모든 상호작용 표면은 no-drag다. Settings 창 배치는 범위 밖이다.
- 부모의 시스템 폰트·violet LNB·정보 구조 유지 전제를 이 자식에 한해 대체한다. PRODUCT·ARCHITECTURE 승격 및 부모 책임표 조정은 별도 문서 과업으로 추적한다. 인증 범위는 이 승인에 포함되지 않는다.

## 순수 함수와 구현 전 조건

1. 이름 → 폴백 색상: 빈 이름·공백·한글·이모지·unsigned 경계·결정성을 검증한다.
2. 조회 프로젝트의 강제 펼침과 나머지 펼침 집합 도출: 사용자 접기와 현재 조회 대상이 충돌하지 않게 한다.
3. 프로젝트/워크트리/캔버스 탐색 기록 상태 전이: 구현 전 기록 계약을 정리한 뒤 이전·다음·새 이동·사라진 대상·보호 취소를 검증한다. 위치 계산용 headerCenterBounds는 만들지 않는다.

기존 PRODUCT §6 PoC에 새 의존성은 없다. 다만 네이티브 재질은 정적 시안으로 검증할 수 없으므로 구현 초반에 실제 Electron 창으로 검증해야 한다. 접근성의 투명도 감소와 비활성 창에서도 읽을 수 있어야 한다.

## 현재 근거와 남은 검증

브라우저에서 기본·최소 창의 헤더 비겹침, 32px 프로젝트 클릭 높이, 16px 썸네일, 12px 브랜치 아이콘, Geist 로드, 400/500 굵기, 공통 칩 12px·2px/6px·약 20.2px를 확인했다. 드롭다운은 목록 밖 창 레이어이며 최소 창 안에 들어간다. 실제 Radix의 위로 열기·키보드·포커스 복귀는 아직 검증하지 않았다. 이들은 구현 task다.

근거는 `.scratch/buzz-shell-draft/`의 `dropdown-icons.png`, `project-dropdown.png`, `worktree-chip.png`, `check-chip-size.json` 등이다. 각 이미지는 해당 시점 값이며 최종 승인 캡처는 `approved-shell.png`, `approved-dropdown.png`를 사용한다. 정적 CLI 검사는 errors 0, 기존 mock.css warnings 12였으며 최종 검사는 별도로 남긴다.

사용자 요청으로 현재 checkout에 공통 칩의 좌우 6px·상하 2px·폰트 12px 변경이 이미 있다. translucent 변형과 Geist는 아직 시안에만 있다. **실제 앱 전체 runtime·네이티브 창 검증은 미실행**이다.

POSTMORTEM 예방 근거:
- “Production CSS extraction concealed missing development styles”: “verify actual development and production entry loading and representative child computed styles”. 컨테이너뿐 아니라 칩·아이콘·메뉴의 실제 스타일을 확인한다.
- 모달 포커스: “never focus content behind an open modal dialog”. 메뉴→설정/제거 흐름에서도 포커스 복귀 순서를 보존한다.
- 스크롤바 측정: “compare matching box domains for scroll containers”. 외곽과 내용 폭을 혼동하지 않는다.
- “Native focus waits hid a locked desktop”: “preflight native suites and repeat the lock check before hide/quit”. 잠긴 데스크톱을 PASS로 기록하지 않는다.
