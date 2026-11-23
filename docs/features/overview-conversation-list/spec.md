# Overview 대화 목록 — spec

## 사용자

- **사람**: 앱의 프로젝트 Overview에서 그 프로젝트의 대화를 고르고 이어 간다.
- **에이전트**: 바뀌는 것이 없다. CLI, 가이드, 스킬 스텁은 그대로다.

## 문제

- Overview 오른쪽 패널(Canvas conversations, PRODUCT §5 item 3)은 캔버스에 묶인 대화만 보여준다. 캔버스에 묶이지 않은 프로젝트 대화는 헤더 제목의 Conversation menu를 열어야만 보인다.
- 그래서 한 프로젝트의 대화가 두 곳으로 나뉜다. 캔버스 대화는 오른쪽 패널에 있고, 프로젝트 대화는 접힌 메뉴 안에 있다.
- 이후 별도 feature에서 promotion을 handoff로 바꾸면, Overview에서 시작한 대화는 캔버스로 옮겨 가지 않고 계속 Overview에 남는다. 그러면 프로젝트 대화가 쌓이는데, 지금은 이 대화들을 한눈에 볼 곳이 없다.

## 완료 기준

- Overview 오른쪽 패널이 그 루트의 프로젝트 대화와 캔버스 대화를 한 목록에 보여준다.
- 프로젝트 대화 행을 누르면 페이지를 옮기지 않고 Overview 가운데 열에 그 대화가 열린다. 포커스는 composer로 간다.
- 캔버스 대화 행은 지금처럼 그 캔버스를 열고 패널을 펼친다.
- 상태 표시, Delete, 키보드 이동, 읽기 실패와 Retry, 처음 읽는 중 표시는 두 종류의 행에 똑같이 적용된다.
- 결정된 목록 이름, 행 순서, 행 모양, current 표시가 그대로 구현되고, 헤더 Conversation menu는 그대로 남는다(design.md '결정').
- `/design-draft` 시안을 사람이 앱에서 확정했고, 구현이 `/design-sync`로 시안과 일치한다.
- PRODUCT §5 item 3과 ARCHITECTURE §7, docs/design/project.md가 새 규칙으로 바뀐다.

## 하지 않는 것

- promotion을 handoff로 바꾸는 일. 별도 feature에서 한다.
- 캔버스 페이지의 대화 패널, 프로토타입 창 패널, 사이드바 슬롯, Home의 대화 strip.
- 대화 검색, 필터, 고정, 이름 바꾸기.
- 다른 루트(워크트리)의 대화를 한 목록에 모으는 일. 목록은 지금처럼 Overview가 보여주는 루트 하나만 다룬다.
