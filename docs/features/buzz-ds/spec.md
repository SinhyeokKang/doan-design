# buzz-ds — spec

부모 feature [`buzz-restyle`](../buzz-restyle/spec.md)의 첫 자식이다. Buzz 디자인 시스템(토큰, 공용 컴포넌트 스타일, DESIGN.md, UI 스택 기준)을 깔아서 이후 화면 자식 feature가 기댈 기반을 만든다. 공통 결정 8개(라이트 단일, 무채색 주요 버튼 + 오렌지 선택·핀 전용, SF Pro 하나, Radix 유지, copy & paste 수준, 기능 불변, Buzz 브랜드 자산 제외, 로컬 Buzz clone 참조)는 부모 spec을 따른다.

## 사용자

- **사람(앱 사용자)**: 이 feature가 main에 들어가면 모든 화면이 라이트 토큰과 Buzz 공용 컴포넌트 스타일로 바뀐다. 화면 배치(셸, 헤더, 행 수치, 패널 내부)는 화면 자식 feature가 바꾸기 전까지 지금 그대로다.
- **에이전트**: 직접 얻는 것은 없다. `design/` 초안 10개가 `app/src/renderer/tokens.css`를 링크하므로 초안의 겉모습과 `doan check` 결과가 영향을 받는다.

## 문제

- 지금 토큰(`tokens.css`, 변수 25개)은 다크 전용 Sorcerer 계열 값이고, 스타일(`styles.css` 611줄)은 화면 규칙과 공용 규칙이 섞여 있다.
- 화면 자식 feature가 Buzz 규칙으로 화면을 옮기려면, Buzz 토큰·재질·타입과 공용 컴포넌트 스타일이 먼저 있어야 한다.

## 완료 조건

- `app/src/renderer/buzz/`에 Buzz CSS(라이트 토큰·역할, 재질, 타입, 공용 컴포넌트 조각)가 복사되어 있고, 파일마다 출처(리포, 커밋, 원본 경로, Apache-2.0, 수정 내용)가 적혀 있으며 `LICENSE`·`NOTICE.md` 사본이 있다.
- 렌더러가 쓰는 색, 모서리, 그림자, 블러, 간격, 타입, 모션 값이 Buzz 라이트 토큰에서 온다.
- shadcn 색 이름이 Buzz 역할에 연결되어 있고, `primary`는 무채색, 오렌지는 선택 상태와 코멘트 핀 역할에만 연결되어 있다.
- 공용 컴포넌트 스타일이 Buzz 규칙을 따른다: 버튼(prominent/subtle/ghost), `IconButton`, `Panel`, 툴팁·메뉴·팝오버의 `floating-surface`와 파생 모서리, 다이얼로그 크기 단계·인셋·모션, 토스트, 포커스 링, disabled, 네이티브 얇은 스크롤바.
- 텍스트 대비 쌍이 Buzz 대비 기준을 통과한다(순수 함수 테스트).
- 렌더러 CSS에서 쓰는 `var(--*)`가 모두 정의되어 있다(순수 함수 테스트).
- 이 리포의 `design/` 초안에 대해 `doan check`가 정의되지 않은 `var(--*)` 오류를 내지 않는다.
- `docs/DESIGN.md` 맨 앞에 Buzz 기반 디자인 시스템 절(출처, 채택 규칙, doan 조정, 공용 컴포넌트 실측값)이 있고, 화면별 절의 기존 다크 실측값에는 "buzz-ds 이전" 표시가 있다.
- `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run e2e`가 통과한다.
- PRODUCT §7에 공통 결정이 기록되고, 2026-10-22 테마 결정과 Sorcerer 레퍼런스가 대체되었다고 적힌다.

## 비목표

- 화면 배치 변경. 셸 골격, 헤더, 사이드바 행, 온보딩 표면, 각 패널의 내부 배치는 화면 자식 feature가 한다. 이 feature가 main에 들어가면 모든 화면이 라이트가 되지만, 배치는 다크 시절 그대로이고 이 feature는 대비와 가독성이 깨지는 곳만 막는다.
- 부모 spec의 비목표 전부.
