# 백로그 수정 배치 — backlog-fixes-261118

- 작성일: 2026-11-18
- 기준: `develop`(BACKLOG 'Known defects'에 "Fix (decided)"를 적은 커밋)
- 출처: 2026-11-18에 사용자가 수정안을 정한 BACKLOG 항목 4개다. 이 문서에서는 항목을 BACKLOG 문장의 첫머리로 가리킨다.
- 성격: `/feature` 계획이 아니라 `/ship` 배치 목록이다. 배치 하나를 컨덕터 하나가 맡는다. 마지막 배치가 머지되면 이 디렉터리를 지운다.

## 1. 확인하지 못한 것 (먼저)

- 이 문서를 쓸 때 코드를 확인하지 않았다. 컨덕터가 고치기 전에 재현하거나 실패하는 테스트로 고정한다.
- 고쳐 보니 제품 결정이 더 필요하면 그 항목은 빼고 사용자에게 묻는다.

## 2. 사용자 결정 (2026-11-18)

| 항목 | 결정 |
|---|---|
| 툴바 버튼 클릭 뒤 Space | 툴바 버튼을 포인터로 누르면 포커스를 가져가지 않는다. 포커스가 캔버스 영역에 남아 Space가 패닝이 된다. 키보드로 온 포커스는 그대로다. 앱 툴바와 export 뷰어 툴바 모두 같다. |
| 프로토타입 창 프레임의 우클릭 | 프레임 안의 편집 가능한 필드에서 우클릭하면 앱과 같은 텍스트 편집 메뉴를 연다. 필드가 아닌 곳에서는 지금처럼 아무것도 열지 않는다. |
| Codex 권한 요약 | `reason`이 없으면 권한 종류마다 읽을 수 있는 한 줄(쓸 경로, 접속할 호스트 등)로 보인다. 모르는 모양만 짧게 자른 JSON으로 두고, 요약 전체를 다른 권한 요약과 같은 길이로 자른다. |
| Overview의 “<title> moved to <canvas>.” 줄 | 사람이 Overview에서 그 줄을 본 뒤에만 지운다. |

## 3. 배치

| 배치 | 브랜치 | 항목 |
|---|---|---|
| B1 앱 | `fix/app-backlog-261118` | 1-1 툴바 포인터 포커스(앱), 1-2 프레임 우클릭 메뉴, 1-3 Codex 권한 요약, 1-4 moved 줄 |
| B2 export 뷰어 | `fix/viewer-toolbar-focus` | 2-1 툴바 포인터 포커스(뷰어) |

B1과 B2는 고치는 파일이 겹치지 않아 동시에 돌린다. 두 툴바가 같은 규칙을 따르므로, 나중에 머지하는 쪽이 PRODUCT 문장을 맞춘다.

**모든 배치 공통.**
- 컨덕터는 `/ship`으로 진행하고, 끝나면 `/verify`를 돌린다.
- 바뀐 동작만 `/runtime-test`로 짧게 확인한다. 확인하지 못한 것은 PR 본문에 적는다.
- 마지막 단계에서 고친 항목을 BACKLOG에서 지우고, 2절 결정을 PRODUCT·ARCHITECTURE에 지금 규칙으로 적는다.
- 문구를 새로 쓰면 먼저 Doan의 `clarify` 프리셋을 읽는다.
- 코드 주석에 이 문서나 배치 번호를 적지 않는다.

## 4. 배치별 작업

### B1 앱 (`fix/app-backlog-261118`)

1. **툴바 포인터 포커스** (BACKLOG "Space after a click on a canvas toolbar button…")
   - 수정: 캔버스 툴바 버튼을 포인터로 누를 때 포커스를 옮기지 않는다. 버튼의 동작은 그대로다. Tab으로 간 포커스와 Enter·Space는 지금처럼 동작한다.
   - 확인: 버튼을 클릭한 뒤 Space를 누르면 패닝이 되는지를 테스트한다.
2. **프레임 우클릭 메뉴** (BACKLOG "The prototype window's frame content has no context menu…")
   - 수정: 프로토타입 창의 프레임 콘텐츠에서 편집 가능한 필드를 우클릭하면 텍스트 편집 메뉴를 연다(PRODUCT §5 'Text edit menu'와 같은 항목). 필드가 아닌 곳에서는 열지 않는다.
3. **Codex 권한 요약** (BACKLOG "Codex `item/permissions/requestApproval` without `reason`…")
   - 수정: 2절 결정대로 요약을 만든다. 실제 `params.permissions` 모양은 Codex app-server 스키마와 기존 fixture에서 확인한다.
4. **moved 줄** (BACKLOG "The Overview's “<title> moved to <canvas>.” line can go before the person sees it…")
   - 수정: Overview를 떠날 때 줄을 지우지 않고, Overview에 그 줄이 보인 뒤에만 지운다.

### B2 export 뷰어 (`fix/viewer-toolbar-focus`)

1. **툴바 포인터 포커스** (같은 BACKLOG 항목의 뷰어 쪽)
   - 수정: export 뷰어(`cli/internal/export/viewer`)의 툴바 버튼을 포인터로 누를 때 포커스를 옮기지 않는다. 앱 툴바와 같은 규칙이다.
   - 확인: Chromium과 WebKit에서 클릭 뒤 Space가 패닝이 되는지를 테스트한다.
   - 앱 쪽이 이미 머지돼 BACKLOG 항목이 없으면 그대로 두고, 남아 있으면 뷰어 쪽만 고쳤다고 좁힌다.

## 5. 리드 인수인계

- 리드는 B1과 B2의 컨덕터를 동시에 띄운다. 방법은 `/ship` 'Lead'(`.agents/skills/ship/lead.md`)를 따른다.
- PR을 리뷰할 때 범위가 4절의 해당 배치와 맞는지, 2절 결정을 PRODUCT·ARCHITECTURE에 적었는지, 확인하지 못한 것을 적었는지 본다.
- 두 배치가 모두 머지되면 이 디렉터리(`docs/features/backlog-fixes-261118/`)를 지운다.
