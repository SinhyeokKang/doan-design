# buzz-ds — spec

부모 feature [`buzz-restyle`](../buzz-restyle/spec.md)의 첫 자식이다. Buzz 디자인 시스템(토큰, 공용 컴포넌트 스타일, 여러 화면이 함께 쓰는 요소, DESIGN.md, UI 스택 기준)을 깔아서 이후 화면 자식 feature가 기댈 기반을 만든다. 부모 spec의 공통 결정 13개를 따르고, 이 문서는 그중 buzz-ds가 실현하는 부분만 적는다.

## 사용자

- **사람(앱 사용자)**: 이 feature가 main에 들어가면 모든 화면이 라이트 토큰과 Buzz 공용 컴포넌트 스타일로 바뀌고, 오렌지가 사라진다. 화면 배치(셸, 헤더, 행 수치, 패널 내부)는 화면 자식 feature가 바꾸기 전까지 지금 그대로다(부모 공통 결정 12, 중간 상태 허용).
- **에이전트**: 직접 얻는 것은 없다. `design/` 초안 12개가 `app/src/renderer/tokens.css`를 링크하므로 초안의 겉모습과 `doan check` 결과가 영향을 받는다.

## 문제

- 지금 토큰(`tokens.css`, 변수 25개)은 다크 전용 Sorcerer 계열 값이고, 스타일(`styles.css` 611줄)은 화면 규칙과 공용 규칙이 섞여 있다(2026-10-26 기준).
- 오렌지가 약 30곳의 서로 다른 표시에 쓰인다(`styles.css`, `settings.css`). 부모 공통 결정 2에 따라 이 중 Buzz 액센트 용례에 대응하는 4곳만 citrus가 되고 나머지는 무채색이 되어야 한다.
- 화면 자식 feature가 Buzz 규칙으로 화면을 옮기려면, Buzz 토큰·재질·타입, 공용 컴포넌트 스타일, 공유 요소가 먼저 있어야 한다.

## 완료 조건

- `app/src/renderer/buzz/`에 Buzz CSS(라이트 토큰·역할, citrus 액센트 family, 재질, 타입, 오버레이, 스크롤바, 폼, 공용 컴포넌트 조각)가 복사되어 있다. 파일마다 `/*! */` 출처 주석(리포, 전체 SHA, 원본 경로, Apache-2.0, 수정 내용)이 있고, `LICENSE`·`NOTICE.md` 사본이 있다.
- 복사한 클래스는 `doan-` 접두어, 데이터 속성은 `data-ui-*`로 바뀌어 있다. 확인: `grep -rnE '\bbuzz-|data-buzz-' app/src/renderer` 결과 없음(출처 주석 제외).
- 렌더러가 쓰는 색, 모서리, 그림자, 블러, 간격, 타입, 모션 값이 Buzz 라이트 토큰에서 온다.
- shadcn 색 이름이 Buzz 역할에 연결되어 있고 `primary`는 무채색이다. 지금 오렌지를 쓰는 모든 규칙이 대응표(design.md)대로 citrus 액센트 4자리 또는 무채색 역할로 옮겨져 있다. 확인: `grep -n '#f0773a\|--accent-line\|--accent-soft' app/src/renderer/*.css` 결과 없음.
- 공용 컴포넌트 스타일이 Buzz 규칙을 따른다: 버튼(prominent/subtle/ghost), `IconButton`, `Panel`, Buzz 툴팁(prominent 캡슐), 메뉴·팝오버의 `floating-surface`와 파생 모서리, 다이얼로그 틀(크기 단계, 안쪽 패딩, 헤더·액션 배치, 등장·퇴장 모션), 모달 scrim, 토스트, 스피너, 포커스 링(`:focus-visible`), disabled, 네이티브 얇은 스크롤바.
- 공유 요소(`ProjectSetupDialog`, `AddProjectsDialog`, `FirstPrompt`, `ConnectionRows`, `.ob-dialog`, `ErrorDetails`, `Toast`, 스피너)가 Buzz 규칙으로 바뀌어 있고, buzz-ds 초안(`design/buzz-ds.html`)과 `/design-sync`로 맞춰져 있다.
- 텍스트 대비 쌍(citrus 쌍 포함)이 Buzz 대비 기준을 통과한다(순수 함수 테스트).
- 렌더러 CSS에서 쓰는 `var(--*)`가 모두 정의되어 있다(순수 함수 테스트).
- 이 리포의 `design/` 초안 전체에 대해 `doan check`가 정의되지 않은 `var(--*)` 오류를 내지 않는다.
- 패키징된 앱에 `LICENSE`와 `NOTICE.md`가 들어 있다(방법은 질문 2).
- `docs/DESIGN.md` 맨 앞에 Buzz 기반 디자인 시스템 절(출처, 채택 규칙, doan 조정, 공용 컴포넌트·공유 요소 실측값)이 있고, 화면별 절의 기존 다크 실측값에는 "buzz-ds 이전" 표시가 있다. 'UX audit recovery update' 절은 buzz-ds가 다시 측정한다(부모 design 'DESIGN.md 절과 담당').
- `node .agents/skills/verify/scripts/verify.mjs --runtime`가 통과한다.
- PRODUCT §7에 부모 공통 결정이 기록되고, 2026-10-22 테마 결정과 Sorcerer 레퍼런스, 2026-10-25 공유 툴팁 패딩 결정이 대체되었다고 적힌다. PRODUCT §5 feature 목록에 `buzz-restyle`과 자식들이 있다.

## 비목표

- 화면 배치 변경. 셸 골격, 헤더, 사이드바 행, 온보딩 표면, 각 패널의 내부 배치는 화면 자식 feature가 한다. 이 feature는 대비와 가독성이 깨지는 곳만 막는다.
- `main` `BrowserWindow`의 크기, `titleBarStyle`, 신호등 위치(`buzz-shell`).
- 부모 spec의 비목표 전부.
