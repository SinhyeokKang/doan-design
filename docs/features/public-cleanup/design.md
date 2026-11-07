# public-cleanup — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D19(이력·브랜치), D20(정리 범위). 둘 다 결론이다(사용자, 2026-11-07).

## 영향 범위

- 앱(TS)·CLI(Go)·eval의 주석만. 실행 코드·테스트 단언·문자열 리터럴은 바꾸지 않는다.
- 초안 `.doan/canvases/` 세 파일의 텍스트 다섯 줄. 이미 구현된 화면의 초안이라 `.agents/skills/design-draft/SKILL.md:103`이 금지하지만, 사용자가 이 경로 교체에 한해 예외를 줬다(D20).
- 형식·`doan check` 규칙·ARCHITECTURE 결정: 영향 없음.
- 순수 함수로 뺄 부분: 없다. 동작을 바꾸지 않는 변경이라 `/tdd` 대상이 없다. 대신 diff가 주석 줄만 건드리는지 확인하는 검사를 둔다(tasks T4).
- PoC 의존: 없다.

## 주석 번역 규칙

- 뜻을 바꾸지 않는다. 한국어 인용(예: `design 'main의 project 처리'`)은 대부분 지운 문서의 절 제목이므로 아래 참조 규칙을 먼저 적용한다.
- AGENTS.md 'Commit conventions'의 주석 규칙(영어, "why"만)을 따른다. 번역하면서 "what"만 말하는 주석은 지우지 않는다(범위 밖의 개선을 하지 않는다).

## 지운 문서 참조 처리 (D20)

1. 참조가 가리키는 결정이 지금 PRODUCT·ARCHITECTURE에 있으면 그 절로 바꾼다(예: `buzz-settings design 'About'` → `PRODUCT §5 item 0 'About'`).
2. 없고 이유가 코드에 필요하면, 이력에서 그 문서를 읽어(`git log --all -- docs/features/<slug>/design.md`, `git show <sha>:<path>`) 이유를 한 문장으로 옮긴다.
3. 이유가 이미 주석 문장에 있으면 괄호 안 참조만 지운다.
- 736줄은 한 PR로는 크다. 디렉터리 단위(main, renderer, cli, eval)로 커밋을 나눈다.

## 비밀 스캔

- 도구 설치는 사용자 승인이 필요하다(전역 설치). 후보: `gitleaks git --log-opts=--all`을 `.scratch/` 안에서 실행하고 보고서만 남긴다. 도구와 명령은 사용자 확인 뒤 정한다.
- 발견이 있으면 값을 출력하지 않고 파일·커밋·규칙 이름만 보고한다. 진짜 비밀이면 공개 전에 폐기·교체하고, 이력 처리는 D19로 돌아간다.

## 공통 함정

- POSTMORTEM에서 주석 정리와 관련된 항목은 없다(`grep -n -i 'comment' docs/POSTMORTEM.md`로 다시 확인).
