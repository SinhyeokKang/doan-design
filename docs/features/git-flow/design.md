# git-flow — design

규칙의 원천은 부모 [design.md](../release-0-1-0/design.md) '사용자 결정 (2026-11-07)' 1·2·3과 D1(hotfix 모드), D2(기본 브랜치 `develop`), D3(하네스·문서는 `develop`)다. hotfix 절차 자체는 release-skill이 `/release`에 쓰고, 이 자식은 브랜치 목록과 `/ship`의 예외만 적는다.

## 영향 범위

- 하네스만 바꾼다: AGENTS.md, `.agents/skills/{ship,orchestrate,chain,feature,code-review,design-draft,design-sync,tester-build,audit}/SKILL.md`.
- `/verify`는 바꿀 줄이 없다(`.agents/skills/verify/SKILL.md`에 기준 브랜치 가정이 없고 `verify.mjs`는 `HEAD`만 기록한다, 2026-11-07 grep). 사용자가 목록에 넣었으므로 T4에서 다시 확인만 한다.
- 앱·CLI·형식·`doan check` 규칙: 바뀌지 않는다. ARCHITECTURE §1 'Conventions'도 그대로다.
- 순수 함수로 뺄 부분: 없다. 코드가 없는 하네스 변경이라 `/tdd` 대상이 없다(검증은 grep과 스킬 문구 대조).
- PoC 의존: 없다.

## 브랜치 규칙

| 브랜치 | 나오는 곳 | 들어가는 곳 | 누가 |
|---|---|---|---|
| `main` | — | `/release`의 `develop` 병합, `/release` hotfix 모드의 `hotfix/<slug>` 병합 | 사용자가 `/release`를 부를 때만. 태그 `v<version>`도 `/release`가 단다 |
| `develop` | P0 뒤의 `main`(T1에서 한 번) | `<type>/<slug>` PR, 체인 링크 PR(링크 순서대로), 하네스·문서 직접 push | 기본 브랜치(D2) |
| `<type>/<slug>` (`feat`·`fix`·`docs`·`chore`·`refactor`) | `develop` | `develop` | `/ship`, `/orchestrate` |
| `hotfix/<slug>` | 마지막 태그(= `main` HEAD) | `main`, 이어서 `develop` | `/release` hotfix 모드(D1). 수정은 그 브랜치에서 `/ship` |

- PR 병합은 지금처럼 병합 커밋이다(`git log --merges`의 "Merge pull request #120 …").
- 실행 브랜치 보존 규칙(AGENTS.md:140)은 그대로다.

## 바꿀 줄

부모 design.md '하네스 영향' 표가 목록이다. 줄마다 바꿀 내용:

- AGENTS.md:109 — "`/ship` · `/orchestrate` always start by creating a `<type>/<slug>` branch from `develop` … end with a push of that branch + a PR against `develop`."
- AGENTS.md:110 — 체인 링크는 링크 순서대로 `develop`에 병합한다. 체인 파일은 `develop`에 커밋한다.
- AGENTS.md:111 — `--base-branch feat/<slug>` 규칙은 그대로. "without `--base-branch`, the child worktree branches from main"은 Orca의 동작이므로 G1 뒤 Orca가 무엇을 기준으로 하는지 확인해 고친다(확인 전에는 문구를 바꾸지 않는다).
- AGENTS.md:131–134 — 'Branches'를 세 경로로: 코드 변경(`develop`에서 분기, `develop`으로 PR), 하네스·문서(지금 브랜치에 커밋, `develop`이면 바로 push), 출시(`main`은 사용자가 `/release`를 부를 때만 바뀐다. 다른 어떤 커밋도 `main`에 직접 가지 않는다). 브랜치 목록은 `main`, `develop`, `<type>/<slug>`(`feat`·`fix`·`docs`·`chore`·`refactor`), `hotfix/<slug>`(`/release` hotfix 모드만 만든다).
- AGENTS.md:75 — `/tester-build`의 원천을 `origin/develop`으로.
- AGENTS.md 'Workflow' 스킬 목록 — `/release` 한 줄(사용자만 부른다, release-skill이 스킬을 만든다). release-skill 전까지는 "planned" 표시 없이 규칙만 둔다: 그 사이 출시가 없으므로 공백이 문제 되지 않는다.
- `.agents/skills/ship/SKILL.md:18`, `:35` — 분기 원천과 `gh pr create --base develop`. 예외 하나: 지금 브랜치가 `/release` hotfix 모드가 만든 `hotfix/<slug>`이면 그대로 쓰고 `--base main`으로 PR을 연다(병합은 `/release`가 한다).
- `.agents/skills/orchestrate/SKILL.md:6`, `:31`, `:69`, `:76` — 같은 교체.
- `.agents/skills/chain/SKILL.md:6`, `:8`, `:19`, `:20`, `:33`, `:49`, `:52`, `:53`, `:55` — "merged to main", "committed on main", "`origin/main`", "fully on main"을 `develop`으로. 링크가 병합 전 리베이스하는 대상도 `origin/develop`.
- `.agents/skills/feature/SKILL.md:52` — "on main push straight to main" → "on develop push straight to develop".
- `.agents/skills/code-review/SKILL.md:14` — `git diff develop...HEAD`.
- `.agents/skills/audit/SKILL.md:12` — "changes since main" → "changes since develop".
- `.agents/skills/design-draft/SKILL.md:18`, `:19`, `:21`, `:55`, `:83`, `:103`, `.agents/skills/design-sync/SKILL.md:8`, `:10`, `:23`, `:25`, `:27`, `:110` — "on main"은 "통합됐다"는 뜻이므로 "on develop"으로. 초안이 정본에서 내려오는 시점이 출시가 아니라 통합임을 한 번 적는다.
- `.agents/skills/tester-build/SKILL.md:3`, `:8`, `:48`, `:52` — `origin/develop`.
- PRODUCT·ARCHITECTURE·DESIGN·USABILITY-EVAL·POSTMORTEM의 "main 병합" 기록은 과거 사실이라 바꾸지 않는다. 현재 규칙을 말하는 문장만 `git grep -n -E '\b(on|to|from|into) main\b'`로 찾아 고친다(2026-11-07 기준 결과 없음).

## G1에 넘길 설정

- T1: `git push origin main:develop`(P0 병합 뒤, 사용자 승인 아래 에이전트가 하거나 사용자가 한다).
- Settings > General > Default branch를 `develop`으로(D2, 사용자).
- 열린 PR이 있으면 대상을 `develop`으로 바꾼다(`gh pr list`로 확인).

## 위험

- 스킬을 먼저 바꾸고 `develop`이 없으면 `--base develop` PR이 없는 브랜치를 가리킨다. 순서는 T1(브랜치 생성) → 스킬 커밋을 `develop`에 push다.
- 바꾸는 커밋 자체가 하네스 변경이라, 바뀐 규칙에 따라 `develop`에 push한다. 이 커밋들은 `main`에 들어가지 않으므로 `main`에서 일하는 세션은 옛 규칙을 읽는다. T1 뒤 이 저장소의 체크아웃을 `develop`으로 옮긴다(`git switch develop`).
- 진행 중인 `/orchestrate`·체인이 있으면 그 통합 브랜치는 `main` 기준이다. 사용자 결정 3대로 P0(problem-project-overlay 병합)을 기다리고, T0에서 다른 실행이 없는지도 확인한다.
