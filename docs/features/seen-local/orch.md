# seen-local 오케스트레이션

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `0204a5bd` (origin/develop)
- 통합 브랜치: `feat/seen-local` (리드가 만들었다)
- 지휘자 런타임: Claude Code. 워커는 Claude만 쓴다(모델 교차 없음).

## 결정 로그

- 열린 해석 없음. spec·design이 저장 형식, 판정 규칙, 전환, 실패를 모두 정했다. — 지휘자 판단, 근거: design.md '저장 구조'·'새 캔버스 판정'·'전환'.
- `parseLocalSeen`·`localSeenText`·`mergeRoots`는 `canvasSeen.ts`에 둔다. 지금 v2 파싱과 `createLocalSeen`이 그 파일에 있기 때문이다. — 지휘자 판단.
- `parseGitSignal`·`resolveGitDir`·`settlePending`은 새 파일 `app/src/main/gitSignal.ts`에 둔다. tasks 3이 `gitSignal.test.ts`를 새 파일로 정했다. — 지휘자 판단.
- tasks 5(실제 앱 확인)·6(전체 게이트)·7(문서 승격)은 통합 뒤 지휘자가 한다(orchestrate §4·§5).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort, 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 1, 2 | `app/src/main/canvasSeen.ts`, `canvasSeen.test.ts`, 필요하면 `seenRecords.ts`의 읽기 타입 import만 | 없음 | Opus high — 전환 규칙과 마지막 판정 이전이 틀리면 점이 사라지거나 남발된다 | `npm --prefix app test -- canvasSeen`, typecheck | 통합 88e92b8e·9ea3652a, 테스트 42개 통과. 정리 끝 |
| B | tasks 3 | 새 `app/src/main/gitSignal.ts`, `gitSignal.test.ts`, `onboarding/gitConfig.ts`의 export 추가만 | 없음 | Sonnet high — 순수 함수지만 유예 시간창 경계 케이스가 많다 | `npm --prefix app test -- gitSignal`, typecheck | 통합 fcaed6de, 테스트 43개 통과. 정리 끝 |
| C | tasks 4 | `readState.ts`, `readState.test.ts`, `watch.ts`, `watch.test.ts`, `seenRecords.ts`(쓰기 경로 삭제), `seenRecords.test.ts`, `index.ts`(`copyRoots`), A·B 파일의 연결용 수정 | A, B 통합 | Opus high — 감시·유예 타이머·쓰기 실패 처리가 얽힌 동시성 배치 | `npm --prefix app test`, typecheck, lint | 진행 중 |
| 지휘자 | tasks 5, 6, 7 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/features/seen-local/` | C 통합 | — | `/runtime-test`, verify.mjs, tasks 7 grep | 대기 |

## 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돌린다.
- C는 A·B가 바꾼 파일과 `readState.ts`·`watch.ts`를 함께 고치므로 A·B 통합 뒤에 시작한다.
- 모든 tasks 체크 항목(1~7)이 위 표의 한 행에 속한다.

## 리뷰

- A·B는 순수 함수만 바꾸고 C가 같은 파일을 다시 연결한다. 그래서 배치마다 리뷰하지 않고, C를 통합한 뒤 A·B·C 전체 diff를 독립 리뷰 워커 한 명에게 맡긴다. — 지휘자 판단.
