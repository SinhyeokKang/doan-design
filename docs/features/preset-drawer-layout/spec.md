# 프리셋 드로어 구조 — spec

## 사용자

- **사람**: composer의 Presets 버튼으로 design preset, 프로젝트 스킬, 내장 명령을 고르는 사람. 탭이 늘어도 드로어가 좌우로 커지지 않고, 검색 입력이 다른 입력과 같은 크기다.
- **에이전트**: 바뀌는 것이 없다.

## 문제 (관찰)

- Presets 드로어(popover)는 위쪽에 탭을 한 줄로 늘어놓는다: Suggested, 그룹 다섯 개(Start, Review, Refine, Content, Explore), 스킬이 있으면 Project, 명령이 있으면 Commands(PRODUCT §5 item 1 'Design presets', 'Project skills', 'Built-in commands').
- 탭이 늘 때마다 드로어 폭이 커진다: 600 px, 스킬이 있으면 691 px, 명령이 있으면 809 px(`app/src/renderer/styles.css` `.preset-popover`, `docs/design/conversation.md` 'Popover'). 사용자가 좌우로 너무 커졌다고 보고했다.
- 검색 입력은 작은 크기(`data-ui-size="sm"`, `ComposerParts.tsx` `popover-search`)다. MCP 커넥터의 Server URL 입력 모달(`SettingsMcpConnectors.tsx`)은 기본 크기 `doan-input`이다.

## 확정한 결정 (사용자)

- 드로어의 구조를 바꿔 탭이 늘어도 좌우로 커지지 않게 한다. 어떤 구조로 바꿀지는 드래프트에 후보를 그려 고른다.
- 검색 입력을 한 단계 크게, MCP Server URL 입력 모달의 입력과 같은 크기로 한다.

## 바꾸지 않는 것

- 무엇이 목록에 들어가는지(preset, 스킬, 명령, Suggested의 규칙), 행의 모양(아이콘 tile, 이름, 설명), 고르기와 칩, `/` 목록(탭이 없다), 닫기 규칙, 실패와 빈 상태 문구.

## 완료 조건

1. 드로어 폭이 스킬이나 명령의 유무와 관계없이 같다(값은 드래프트에서 정한다).
2. 모든 분류(Suggested, 그룹 다섯 개, Project, Commands)에 지금처럼 갈 수 있고, 키보드로도 갈 수 있다(지금의 탭 키보드 동작과 같은 수준).
3. 검색 입력의 높이·글자·안쪽 여백이 MCP Server URL 입력과 같다(computed style).
4. 검색 중 동작(분류를 넘는 결과, 결과 없음 문구)이 지금과 같다.
5. Home, Overview, 캔버스 대화 패널, 프로토타입 창의 composer에서 같은 드로어가 열린다.
6. 사용자가 확정한 드래프트와 모습이 같다(`/design-sync`).

## 하지 않는 것

- 목록 내용과 Suggested 규칙 변경, `/` 목록 변경.
- 새 분류 추가.
