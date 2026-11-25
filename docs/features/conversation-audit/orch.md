# orch: conversation-audit

- 출처: `docs/features/audit-261126/report.md`(/audit-loop 1라운드)의 conversation 발견. 리뷰어 원본은 메인 체크아웃 `.scratch/audit/261126-r1/`(`lifecycle-G2.md`, `maintainability-G2.md`, `contracts-G2.md`, `w2-conv-core.md`, `w2-conv-transport.md`).
- 시작 해시: `08ec857c6`. 통합 브랜치: `feat/conversation-audit`(리드가 develop에서 만듦).
- 이 디렉터리는 PR 전에 지운다.

## 결정 기록

- 사용자에게 묻지 않는다(리드 브리프). PRODUCT·ARCHITECTURE의 결정을 바꾸거나 사용자가 보는 사용성을 바꾸는 부분은 고치지 않고 PR 본문 "Needs a user decision"에 적는다.
- 의심 발견(M6, L-G2-2, W2-conv-transport-2)은 실패 테스트나 짧은 격리 probe로 먼저 재현한다. 재현되지 않으면 버리고 PR 본문에 적는다.
- C-G2-1은 문서 한 줄 수정이라 컨덕터가 직접 커밋했다(`9ad17a6b0`). 컨덕터 판단 — 배치 코드가 아니고, 현재 writer는 `service.ts` start·send 수락과 `refreshCanvas`뿐이다.
- 배치 분할은 파일 소유로 나눈다. 컨덕터 판단 — `transport.ts`(M7·transport-2·transport-3·M-G2-8), `store.ts`(core-2·M-G2-7), `service.ts`(M4·L-G2-2)가 겹치지 않게 묶었다.
- 리드가 범위를 바꿨다: M-G2-13의 `store.ts`·`replyAnchor.ts` canvas id 정규식 사본을 이 run에 더했다. `skills.ts`·`skills.commands.test.ts`는 main-audit 소유라 건드리지 않는다.
- B 리뷰의 사용자 결정 1: ACP open 단계에 근거 없는 패턴(rate limit, invalid api key 등)을 새로 적용하면 ARCHITECTURE §7 'Turn-end reads'(Cursor `rate_limited`는 `limitReached`에서만)와 어긋나고 복구 문구가 바뀐다. 컨덕터 판단 — open 단계는 기록된 문구와 Doan 자신의 문구만 매핑하고 나머지는 전처럼 `session_unavailable`로 둔다. 남은 단계 간 차이는 PR "Needs a user decision"에 적는다.
- B 리뷰 ⚪1: activity summary를 `visibleText` 전체에 통과시키면 VS16·ZWJ가 `<U+FE0F>`로 보인다. 컨덕터 판단 — 발견 범위(NUL)를 넘는 보이는 변화라 U+0000만 처리한다.
- B 리뷰 ⚪5(message 텍스트·`mcpStartup.ts` summary의 NUL)는 범위 밖이라 PR 본문에 BACKLOG 후보로 적는다.
- 렌더러 변경은 `threadItems.ts`·`ConversationThread.tsx`에만 둔다(renderer-audit 컨덕터와 충돌 방지, 리드 브리프).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | M4, L-G2-2 | `service.ts`, `service*.test.ts` | 없음 | Opus high — 예약·서버 종료 수명주기, 동시성 | `npm --prefix app test`(대화 테스트), typecheck, lint | 통합 `874d10ff2`, 리뷰 1회(Opus medium), 수정 1회 |
| B | M7, W2-conv-transport-2, W2-conv-transport-3, M-G2-8 | `transport.ts`, `acpRunner.ts`, `summary.ts`, `models.ts`, 렌더러 `threadItems.ts`·`ConversationThread.tsx`와 각 테스트 | 없음 | Opus high — 기존 기록 호환과 main·렌더러에 걸친 키 변경 | 같음 | 통합 `873849185`, 리뷰 1회(Opus high), 수정 1회 진행 중 |
| C | M6, W2-conv-core-2, M-G2-7, M-G2-13(대화 부분) | `prepare.ts`, `io.ts`, `store.ts`, `types.ts`, `drafts.ts`, `prompt.ts`, `replyAnchor.ts`와 각 테스트 | 없음 | Opus medium — 검증기 공유는 기계적이지만 M6은 링크 거부를 지켜야 한다 | 같음 | 통합, 리뷰 1회(Opus medium), 수정 1회 |
| 컨덕터 | C-G2-1 | `docs/ARCHITECTURE.md` | 없음 | — | 문서 대조 | 완료 `9ad17a6b0` |

## 겹침과 순서

- A·B·C는 소유 파일이 겹치지 않아 병렬로 돌린다. 소유 밖 파일이 필요하면 워커는 고치지 않고 handoff의 deferred 항목으로 남긴다.
- 통합 후 공유 게이트 `node .agents/skills/verify/scripts/verify.mjs`를 통합 HEAD에서 한 번 돌린다.
