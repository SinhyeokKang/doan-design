# tester-notarization — orch

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)

- 시작 hash: `d50e592b` (origin/main, PoC P1–P3 결과 포함)
- 통합 브랜치: `feat/tester-notarization`
- 끝: `feat/tester-notarization` push와 PR. merge하지 않는다.

## 결정 기록

1. PR 범위는 S0–S2와 이 orch.md다(사람, AskUserQuestion). S1 실행 검증(`/tester-build` 한 번)과 Z1 문서 승격은 사람이 PR을 merge한 뒤 후속으로 한다. 그래서 `docs/features/tester-notarization/`은 PR 뒤에도 남는다.
2. 모델 교차를 허용한다(사람, 이번 run의 standing permission). Claude와 Codex worker를 섞는다.
3. 통합 브랜치는 tasks.md의 `chore/tester-notarization`이 아니라 `feat/tester-notarization`이다(사람, standing permission; AGENTS.md 'Commit conventions').
4. `/verify` 전과 최종 push 전에는 매번 `feat/tester-notarization`을 최신 origin/main 위로 rebase한다(사람, standing permission).
5. S0는 앱 동작을 바꾸지 않는다. entitlements는 서명한 빌드에만 쓰이고 `npm --prefix app run package`는 서명하지 않으므로 `/runtime-test`는 하지 않는다. 그래서 GUI 프로브 조정도 필요 없다(conductor 판단 — design §0 4, §5).
6. U4(다른 머신)는 선택 task이고 Z1을 막지 않으므로 이번 run에 넣지 않는다(conductor 판단 — tasks U4).

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | S0, S2 | `app/resources/entitlements.mac.plist`(새 파일), `app/package.json`, `AGENTS.md` | 없음 | Codex Sol medium — plist 하나와 설정 두 줄, 문장 한 줄의 기계적 변경 | `node .agents/skills/verify/scripts/verify.mjs`; `mac.identity`가 `null`; `app/scripts/package.mjs` 무변경; `npm --prefix app run package` 결과의 `codesign -dv`에 Developer ID authority 없음; `grep -n "Tester build" AGENTS.md`에 "ad-hoc" 없음 | 대기 |
| B | S1 | `.agents/skills/tester-build/SKILL.md` | 없음 | Claude Opus high — design §2·§3의 절차와 실패 경로를 빠짐없이 skill로 옮겨야 하고, 틀리면 비밀값 경계나 공증 확인이 빠진다 | tasks S1 '검증(문서)' 항목이 SKILL.md에 모두 있다; preflight 실패 경로 확인(없는 프로필 이름으로 `notarytool history` → "No Keychain password item found") | 대기 |
| R | A·B 리뷰 | 없음(보고만) | A, B | Codex Astra medium — 다른 family의 독립 리뷰, skill 절차와 electron-builder 동작 대조에 판단이 필요하다 | `/code-review` 보고 | 대기 |

후속(이번 run 밖, 결정 1): S1 실행 검증, Z1.

## 파일 겹침과 순서

A와 B는 파일이 겹치지 않아 병렬로 돈다. R은 둘을 통합한 뒤 돈다.
