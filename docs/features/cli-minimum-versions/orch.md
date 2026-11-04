# cli-minimum-versions — orch

- 원천: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인: [chain-261104](../chain-261104/chain.md) 링크 1.
- 시작 hash: `b66b2a1d` (main). 통합 브랜치: `feat/cli-minimum-versions`. 지휘자 checkout: Orca `cli-minimum-versions-orch`.

## 결정 기록

- 2026-11-05 사용자: 사람이 필요한 단계를 모두 앞으로 당겨 이 링크에서 끝낸다.
- 2026-11-05 사용자(E0): 테스터 버전을 모른다. 하한을 테스터 버전 대신 날짜로 잡는다: 2026-09-28 이후의 정식 릴리스부터 지금 최소 버전 바로 아래까지. 내려받기는 체인 '상시 권한'의 규칙 승인이 이 목록에 그대로 적용된다(지휘자 판단 — 목록의 출처만 바뀌었다).
- 2026-11-05 사용자(D1): 규칙으로 미리 정한다. provider마다 design '통과 기준' 1~10을 모두 통과한 가장 오래된 후보로 낮춘다. Claude Code는 그 후보와 지금 최소 버전 사이에 C2 실패 릴리스가 있으면 그보다 위로 잡는다. 통과한 후보가 없으면 지금 값을 유지한다. 지휘자는 적용 결과만 보고한다.
- 2026-11-05 사용자(C1·E3): Copilot 요청은 이 링크 전체에서 최대 40개까지 쓴다. 넘을 것 같으면 멈추고 묻는다.
- 2026-11-05 사용자: OAuth 승인은 ego-browser에서 지휘자가 누른다. Codex·Copilot의 `login`이 Chrome을 직접 열 때는 사람이 Chrome에서 승인했다.
- 2026-11-05 사용자: 통과 기준 8은 ego-browser에 로그인된 Notion '팀 901'로 Connect하고 읽기 도구만 부른다. Z0에서 Notion의 연결 승인도 거둔다.
- 2026-11-05 사용자: 브라우저 sign-in은 설치와 정적 검사가 끝나는 대로 한 번에 모아 부른다.
- 2026-11-05 사용자: 열린 대화에서 `session_in_use`로 거절될 때의 범용 문구("Couldn’t send your message. Try again.")를 이 링크에서 명확한 문구로 바꾼다(B). 지휘자 판단: `SEND_ERRORS`에 "<provider> is using this session in another terminal. Try again when it finishes there."를 더한다(clarify 프리셋, resume 문구 "in use in another terminal"과 같은 말).
- 2026-11-05 사용자: 이 체인을 멈추지 말고 끝까지 진행한다. 웬만한 결정은 지휘자가 내린다.
- 지휘자 판단(정식 릴리스): `npm view` 목록 중 `x.y.z`만 쓴다. prerelease(`-alpha`, `-0`, `-unstable`)와 플랫폼 패키지(`-darwin-arm64` 등)는 릴리스 목록에서 뺀다. Codex 플랫폼 패키지는 그 버전 설치의 의존성으로만 받는다.
- 지휘자 판단(Cursor): 옛 버전을 받을 공개 경로가 없다. 설치 경로는 `downloads.cursor.com/lab/<version>-<hash>/…`로 build hash가 필요하고, `downloads.cursor.com/lab/`과 `anysphere-binaries` S3 목록은 403이며, cursor.com/changelog·/cli·/docs/cli/changelog에 버전 hash가 없다(2026-11-05 조회). design '후보 CLI 설치'대로 Cursor는 E1에서 빼고 D1에서 지금 값을 유지한다.
- 지휘자 판단(실험 위치): E와 C1은 design '실험 빌드'대로 같은 checkout에서 한다. 실험은 커밋하지 않는 임시 변경이라 batch 코드가 아니므로 지휘자 checkout에서 지휘자가 돌린다. 앱 코드 변경(A)만 작업자에게 준다.

## batch

| 항목 | 파일 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|
| E0~E5 실험 | `.scratch/cli-minimum-versions/`, 실험 중 임시 `minimumVersions.ts`·`sessions.ts`·`io.ts`(커밋 안 함) | — | 지휘자(Claude Opus) — 사람의 sign-in과 상태 보호 판단이 섞여 나눌 수 없다 | tasks E0~E5 | 완료(첫 후보가 모두 통과) |
| D1 | tasks 'E 결과' | E | 사용자 규칙 적용(위 결정) | 적용 보고 | 완료: Claude Code 2.1.284, Codex 0.158.0, Copilot 1.0.89, Cursor 유지 |
| A1·A2 (진행 중) | `conversation/minimumVersions.ts`, `sessions.ts`, (필요하면) `io.ts`, 버전 테스트·주석 | D1 | Claude Sonnet medium — 경계 값 교체가 대부분인 기계적 작업. `io.ts`를 고쳐야 하면 Opus medium | `npm --prefix app test`, typecheck | 대기 |
| B 문구(사용자 추가) | `renderer/dockedRules.ts`, `dockedRules.test.ts`, `canvasConversation.test.ts` | — | Claude Sonnet low — 문구 한 줄과 테스트. 문구는 지휘자가 clarify 프리셋으로 정함 | `npm --prefix app test`, typecheck, 통합 뒤 짧은 probe | 진행 중 |
| A 리뷰 | — | A | Codex Astra medium(체인 허가) 또는 Claude Sonnet medium — 시작 때 Codex 남은 사용량을 보고 정한다 | `/code-review` 보고서 | 대기 |
| C1 | `.scratch` probe | A 통합 | 지휘자 — E와 같은 checkout | tasks C1 | 대기 |
| C3·Z | 문서 | C1 | 지휘자 | `/verify`, tasks Z | 대기 |

- 겹침: A만 앱 코드를 커밋한다. E의 임시 변경은 E5에서 되돌린 뒤에 A를 통합한다.
- 체크박스 대응: E0~E5 → 실험, D1 → D1, A1·A2 → A, C1 → C1, C2 → A 리뷰, C3·Z0·Z1 → C3·Z.

## Z0 메모

- Notion: '팀 901' 설정에서 MCP 연결을 하나씩 거두는 화면이 없다(Connections > All connections에는 BugShot만, Notion MCP > Enabled clients에는 워크스페이스 수준의 "Claude Code" 하나). 워크스페이스 수준 설정은 사람의 다른 사용에 영향이 갈 수 있어 건드리지 않았다. Doan 쪽 토큰은 Disconnect(`mcp logout`)로 지워졌다.

## Codex 사용

- 2026-11-05 시작: 최근 rollout에 주간 창(`window_minutes` 10080) 기록이 없고 30일 창만 20% 사용이다(`~/.codex/sessions/2026/11/04/…`). A 리뷰를 맡기기 전에 다시 본다. 지금까지 쓴 범위: 없음.
