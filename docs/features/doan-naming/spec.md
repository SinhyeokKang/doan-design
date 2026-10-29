# doan-naming — spec

## 사용자

- **사람**(앱 사용자): 앱 화면, 온보딩 Welcome, 메뉴 막대·Dock·About, 토스트와 오류 문구에서 제품 이름을 본다.
- **에이전트**(CLI·MCP·스킬 사용자): `doan` CLI와 MCP 출력의 사람이 읽는 문장, 가이드(`doan skill`), 스킬 스텁에서 제품 이름을 읽는다. 명령어 `doan`과 경로는 그대로다.

## 문제

- 제품 이름이 "doan"과 "Doan"으로 섞여 있다(2026-10-30 확인, 대략적인 문자열 수): 앱 renderer 약 43곳, main 약 34곳, CLI Go 출력·가이드 약 115곳. 같은 화면 안에서도 섞인다(V2 design-sync 인계, 2026-10-30).
- 앱 번들은 `doan.app`이고 메뉴 막대·Dock·About에 'doan'이 보인다. 창 제목만 'Doan Design'이다(`app/src/main/index.ts`).
- 정해진 표기 규칙이 PRODUCT·ARCHITECTURE에 없다.

## 결정 (2026-10-30 user)

- 사람이 읽는 문구에서 `doan`으로 쓰던 곳은 **Doan**으로 바꾼다. 정식 이름(`doan design`·`Doan Design`)을 이미 쓰던 곳만 **Doan Design**으로 맞춘다. 정식 이름을 쓰지 않던 곳에 새로 넣지 않는다(2026-10-30 user). 지금 정식 이름이 보이는 곳은 창 제목(`Doan Design`)이다.
- 명령어·경로·식별자는 소문자 그대로다: `doan` CLI와 그 하위 명령, `.doan/`, `doan:` 메타 키, `data-doan-*` 속성, `window.doan`, 패키지 이름, appId `design.doan.app`, MCP 서버·도구 이름, 파일 이름, userData 디렉터리 `~/Library/Application Support/doan`.
- 앱 번들은 **`Doan.app`**이다(메뉴 막대·Dock 이름 'Doan').
- 진행: 먼저 전수조사로 후보 목록(바꿈/둠, 이유)을 만들고, 그 목록대로 일괄 바꾼다. 온보딩 Welcome을 포함한다.

## 완료 조건

1. `docs/features/doan-naming/survey.md`에 앱·CLI·MCP·가이드·스텁·문서·초안 캔버스의 모든 후보가 바꿈/둠과 이유로 적혀 있다.
2. 사람이 읽는 문구에서 제품 이름이 소문자 `doan`으로 남은 곳이 없다. 예외는 명령어·경로·식별자를 가리키는 경우뿐이고, 회귀 검사(앱·Go 테스트)가 이를 고정한다.
3. 패키지 빌드 결과가 `app/dist/mac-arm64/Doan.app`이고, 실행하면 메뉴 막대·About 앱 이름이 'Doan', 창 제목은 지금처럼 'Doan Design'이다. userData는 여전히 `~/Library/Application Support/doan/`이다.
4. 번들 안 CLI 경로(`Contents/Resources/bin/doan`)와 CLI 링크·MCP 등록 대상은 바뀌지 않거나, 바뀐 경로를 Settings > Connections가 기존처럼 진단·복구한다.
5. 가이드·스텁·CLI 출력이 바뀌었으므로 `/agent-eval`을 돌려 결과를 `docs/USABILITY-EVAL.md`에 기록했다.
6. PRODUCT §7에 표기 결정이, ARCHITECTURE에 번들 이름과 앱 이름 규칙이 기록되어 있다.

## 비목표

- 명령어 이름(`doan`), 디렉터리(`.doan/`), 메타 키, appId, userData 경로 바꾸기.
- 기존 대화 기록·이벤트·커밋 메시지 등 과거 기록 고치기.
- 로고·아이콘·워드마크 디자인.
- 코드 주석과 테스트 이름의 표기 통일(사람이 앱에서 보지 않는다). 단, 테스트가 단언하는 문구는 바뀐 문구를 따른다.
