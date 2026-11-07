# public-cleanup — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D19(이력·브랜치), D20(정리 범위, 테스트 제목 예외), D26(주석 인용 금지 규칙), D27(`/orchestrate`, 디렉터리별 batch).

## 영향 범위

- 앱(TS)·CLI(Go)의 주석, 테스트 제목 문자열(`describe`·`test`·`it`의 첫 인자), CSS 주석. 실행 코드·테스트 단언·그 밖의 문자열 리터럴은 바꾸지 않는다. 대상 디렉터리는 `app/src` 전체(`main`, `renderer`, `restore`, `preload` 포함), `app/runtime`, `app/scripts`, `cli`, `eval`이다.
- 초안 `.doan/canvases/` 세 파일의 텍스트 다섯 줄. 이미 구현된 화면의 초안이라 `.agents/skills/design-draft/SKILL.md:103`이 금지하지만, 사용자가 이 경로 교체에 한해 예외를 줬다(D20).
- AGENTS.md 'Commit conventions'의 주석 규칙 한 줄과 `.agents/skills/code-review/SKILL.md`의 점검 항목(D26).
- 형식·`doan check` 규칙·ARCHITECTURE 결정: 영향 없음.
- 순수 함수로 뺄 부분: 없다. 동작을 바꾸지 않는 변경이라 `/tdd` 대상이 없다. 대신 diff가 주석·테스트 제목 줄만 건드리는지 확인하는 검사를 둔다(tasks T5).
- PoC 의존: 없다.

## batch (D27)

`/orchestrate`의 batch는 파일 소유가 겹치지 않게 디렉터리로 나눈다(한국어 주석 파일 수, 2026-11-07).

| batch | 파일 소유 | 규모 |
|---|---|---|
| B1 | `app/src/main` | 한국어 주석 43파일 |
| B2a | `app/src/renderer/App.tsx`, `styles.css` | JSX·CSS 주석 포함 |
| B2b | `app/src/renderer/canvas*`·`Canvas*` | 23파일 |
| B2c | `app/src/renderer/home*`·`Home*`·`conversation*`·`Conversation*` | 13파일 |
| B2d | `app/src/renderer`의 나머지 | 약 47파일 |
| B3 | `app/src/restore`, `app/src/preload`, `app/runtime`, `app/scripts`, `cli`, `eval`, 초안 세 파일(T4) | 작다 |

- batch 안의 커밋은 처리 규칙별로 나눈다: ① 괄호 안 참조만 지우기(기계적, diff 모양으로 확인), ② PRODUCT·ARCHITECTURE 절로 바꾸기(그 절에 내용이 실제로 있는지 리뷰), ③ 이유 문장 추가와 번역. 리뷰는 ②③을 자세히 본다. 표본으로 보면 한국어 주석 266줄 가운데 약 228줄은 한국어 절 제목을 인용한 영어 문장이라 ①이 다수다.
- 커밋마다 `npm --prefix app run typecheck`와 `npm --prefix app run lint`를 돌리고, 통합 뒤 `verify.mjs --eval`을 돌린다.
- 참조를 처리하려면 지운 문서를 이력에서 읽는다. batch 브리프에 아래 '참조 처리'의 명령을 넣는다.

## 주석 번역 규칙

- 뜻을 바꾸지 않는다. 한국어 인용(예: `design 'main의 project 처리'`)은 대부분 지운 문서의 절 제목이므로 아래 참조 규칙을 먼저 적용한다.
- AGENTS.md 'Commit conventions'의 주석 규칙(영어, "why"만)을 따른다. 번역하면서 "what"만 말하는 주석은 지우지 않는다(범위 밖의 개선을 하지 않는다).
- 실측 날짜와 관측 근거(예: "measured 2026-10-29")는 지우지 않는다. 코드 주석에만 남은 실측 사실이 있다(docs/POSTMORTEM.md:85).
- 테스트 제목은 같은 규칙으로 번역하고 참조를 지운다(D20 예외). 테스트가 제목 문자열로 다른 것을 찾지 않는지 확인한다.

## 참조 처리 (D20)

D20의 두 갈래("이유가 코드에 없을 때만 문장으로 풀고, 나머지는 지운다") 안에서 처리한다.

1. 참조가 가리키는 결정이 지금 PRODUCT·ARCHITECTURE에 있으면 참조를 지우고 그 절을 가리킨다(예: `buzz-settings design 'About'` → `PRODUCT §5 item 0 'About'`). D20의 '지운다'에 속한다.
2. 없고 이유가 코드에 필요하면, 이력에서 그 문서를 읽어(`git log --all --format=%h -- docs/features/<slug>/design.md`, `git show <sha>:<path>`) 이유를 한 문장으로 옮긴다.
3. 이유가 이미 주석 문장에 있으면 괄호 안 참조만 지운다.

## 참조 패턴

검사와 수치는 이 패턴 하나로 낸다. 지운 slug 목록은 `git log --diff-filter=D --name-only --format= -- docs/features`에서 하이픈이 든 slug만 뽑는다(`audit-*`·`ux-audit-*`·`chain-*` 제외). 일반 단어와 같은 slug(`mcp`, `formats` 등)는 오탐이 많아 패턴에 넣지 않는다.

```
SL=$(git log --diff-filter=D --name-only --format= -- docs/features | sed -n 's#^docs/features/\([^/]*\)/.*#\1#p' | sort -u | grep -v -E '^(audit|ux-audit|chain)-' | grep -- - | paste -sd'|' -)
P="(design|spec|tasks)( §|\.md| ')|docs/features/|\b($SL)\b( (design|spec|tasks|decision|결정)\b| [A-Z]\d+\b)|\b(decision|결정) \d+\b|\(D\d+\)"
rg -n -P "$P" app/src app/runtime app/scripts cli eval
```

- `git grep -P`는 이 큰 선택식에서 2분 넘게 걸려 `rg`를 쓴다(`rg`는 `.gitignore`를 따르므로 추적 파일만 본다).
- 기준 수치(2026-11-07, main `4da6bbd4` 뒤): 1,851줄, 501파일. 그중 문서 꼴(`design §` 등과 `docs/features/`) 750줄, slug 꼴 1,497줄, 결정 id 꼴 203줄(서로 겹친다).
- 허용 목록: 테스트 데이터로 쓰는 문자열(예: `app/src/renderer/threadItems.test.ts:84`, `ConversationThread.test.tsx:100`의 `"spec.md"` 파일명). batch가 처리하면서 찾은 테스트 데이터 줄을 이 목록에 더한다.
- 수치는 P0 병합 뒤 batch 시작 때 다시 잰다(그 사이 커밋이 늘 수 있다).

## 한국어 검사

```
git grep -n -P '[\x{AC00}-\x{D7A3}]' -- app/src app/runtime app/scripts cli eval ':!*.png' ':!*.gif' ':!*.woff2'
```

- 2026-11-07 결과는 397줄이다: `//` 주석 266줄, CSS·JSX 주석 약 12줄, 나머지는 테스트 데이터와 테스트 제목.
- 허용 목록(바꾸지 않는 줄): 테스트 입력 데이터 문자열(`*.test.ts`, `*.test.tsx`, `*_test.go`, `fixtures/` 안의 단언·입력), `cli/internal/exporttest/seed.go`의 파일명, `eval/scenarios/H4/checks.ts`·`H5/checks.ts`의 한국어 에이전트 답을 맞추는 정규식. batch가 찾은 테스트 데이터 줄을 이 목록에 더한다.

## 비밀 스캔

- 전역 설치 없이 Go 모듈 캐시로 돌린다. 모듈 경로와 정확한 버전은 T1에서 확인해 고정한다.
  ```
  git fetch origin '+refs/heads/*:refs/remotes/origin/*' '+refs/pull/*/head:refs/remotes/origin/pull/*'
  go run github.com/zricethezav/gitleaks/v8@<고정 버전> git --log-opts=--all --redact --report-format json --report-path .scratch/public-cleanup/gitleaks.json .
  ```
- `--redact`로 값을 출력하지 않는다. 발견은 파일·커밋·규칙 이름만 보고한다. 테스트 자리표시자(예: `app/src/main/agentAuth/environment.test.ts:10`의 `sk-ant-x`)는 오탐으로 보고, 무시 목록은 `.scratch/public-cleanup/`에 둔다.
- 진짜 비밀이면 공개 전에 폐기·교체하고, 이력 처리는 D19로 돌아간다.
- 결과는 PR 본문에 적고, 부모 G2가 같은 명령으로 다시 스캔해 그 줄에 적는다(이 디렉터리는 끝에 지워진다).

## 공통 함정

- POSTMORTEM 2026-10-30 'Removing a shared dialog class silently disabled two focus guards'처럼 문자열이 동작에 쓰이는 경우가 있다. 테스트 제목과 CSS 주석 밖의 문자열은 건드리지 않는다.
- 실측 사실이 주석에만 남은 사례(docs/POSTMORTEM.md:85)가 있으므로 번역 때 날짜와 관측 근거를 지우지 않는다.
