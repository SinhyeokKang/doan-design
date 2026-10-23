# 툴팁 E2E 회귀 후속 작업

- 기준: `decea85`, 통합 브랜치 `feat-comments-ui`, PR #8.
- 사용자 요청: 간헐 툴팁 실패 원인을 재현하고 수정한다. main 병합 금지.
- 기존 실패 증거: `.scratch/comments-ui/evidence/final-first-attempt/`.

| 배치 | 소유 범위 | 모델·노력 | 검증 | 상태 |
| --- | --- | --- | --- | --- |
| Tooltip-fix | 툴팁 관련 E2E 및 입증된 원인에 필요한 최소 코드, POSTMORTEM | Astra medium: Electron 포인터·초기화 순서의 인과관계 판단 | 실제 Electron 재현 red→green, 원래 실패 전제 유지, 전체 E2E | 대기 |
| Tooltip-review | 보고서만, 수정 금지 | Astra medium: 원인 및 회귀 증거 독립 검토 | 원인·수정·회귀 검증, 남은 red 0 | 수정 후 |

워커는 같은 체크아웃에서 순차 실행한다. 지휘자는 제품 코드를 수정하지 않으며 워커 실행 중 추적 파일을 변경하지 않는다. 완료 시 문서 결론을 승격하고 이 임시 계획을 삭제한다. 기존 PR에 push만 한다.
