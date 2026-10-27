# buzz-shell — tasks

디자인 승인: 2026-10-27. 사용자가 디자인을 먼저 확정한 뒤 feature를 마무리하도록 지시했다. 이 체크리스트는 구현 순서이며 현재 구현 시작 승인은 아니다. 새 design-draft 승인 단계를 다시 요구하지 않는다.

## 승인과 구현 계약

- [x] 0. 현재 Shell·LNB 디자인을 승인받고 spec·design·tasks를 최종 배치 기준으로 정리한다. 홈 비교판은 승인 기준에서 제외한다.
  - 검증: 사용자 “좋아 AppShell 확정하자”, 문서 대조와 정적 시안 검증. `go run ./cli/cmd/doan check --repo . --json`, `go run ./cli/cmd/doan ls --repo . --json`은 격리 DOAN_RUNTIME으로 실행한다.
- [ ] 1. 구현 전에 기존 프로젝트/워크트리 상태와 새 LNB의 연결 계약을 정리한다. 이전·다음 기록의 대상·수명·중복·사라진 대상·보호 취소, 프로젝트별 선택/스크롤 복구, Projects 버튼의 이동 목적지를 명시한다. 기존 앱에서 유지할 기능의 진입점과 빈 목록·조회 중·조회 실패·경로 유실·전환 중 상태도 정리한다. 새 제품 판단이 필요하면 해당 지점만 사용자에게 확인한다.
  - 검증: 현재 상태/IPC와 표로 대조하고 미정 동작을 구현 완료 조건에 숨기지 않는다(문서 검토, 실행 명령 없음).
- [ ] 2. 부모의 공통 결정과 자식 책임표를 정리한다. Shell이 LNB·프로젝트 메뉴·Geist·썸네일 폴백을 맡고 buzz-project는 Overview 본문, buzz-home은 프로젝트 선택 전 본문, buzz-conversation은 오른쪽 패널 정책을 맡는다. 인증은 별도 후속 범위로 남긴다.
  - 검증: 부모/자식 문서 대조. 부모의 정보 구조 불변·시스템 폰트·violet LNB·사이드바 Panel 전제가 승인된 예외와 충돌하지 않게 한다(문서 검토, 실행 명령 없음).

── 문서별 commit: `docs(feature): finalize buzz-shell design contract` ──

## 순수 상태 → 리소스/창 연결 → UI

공용 schema·fixture 변경 단계는 없다. 기존 사용자 설정 형식을 바꿔야 한다면 1에서 영향과 호환성을 먼저 명시한다.

- [ ] 3. 폴백 이름 해시, 현재 프로젝트 펼침 강제, 확정한 탐색 기록 상태 전이를 TDD로 고정하고 구현한다. 승인되지 않은 별도 기록 저장소나 범용 라우터를 만들지 않는다.
  - 검증: `npm --prefix app test`에서 빈 이름·공백·한글·이모지·색 중복·강제 펼침·기록 양끝·새 이동·삭제된 대상·전환 취소를 확인한다.

── commit: `feat(shell): model project navigation and thumbnail fallbacks` ──

- [ ] 4. Geist를 앱 리소스로 번들하고 라이선스를 보관한다. 앱 공통 폰트에 적용하고 개발/프로덕션/패키지에서 제공한다. 프로젝트 8색을 공통 역할 토큰으로 옮긴다. 이미 변경된 공통 칩 12px·2px/6px를 통합하고 translucent 변형을 추가한다.
  - 검증: `npm --prefix app run typecheck`, `npm --prefix app run build`, `npm --prefix app run package`; 후속 runtime에서 오프라인 폰트 로드, 실제 glyph와 기존 공통 칩 사용처의 줄바꿈·높이를 확인한다.

── commit: `feat(shell): serve Geist and share identity and badge styles` ──

- [ ] 5. main 창의 투명·블러와 신호등, 56px 헤더·흰 본문·260px LNB 구조를 연결한다. 이전·다음과 헤더 버튼 그룹, 검색, 프로젝트/캔버스 목록, 실제 썸네일 실패 폴백을 적용한다. 현재 상태 소유자·iframe·모달·창 수명을 보존한다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`; 네이티브 재질·신호등·비활성/전체 화면·투명도 감소·drag/no-drag는 7에서 실제 창으로 확인한다.
- [ ] 6. 프로젝트 … 드롭다운에 워크트리와 기존 관리 액션을 연결한다. Portal·위로 열기·내부 스크롤·키보드·외부 클릭·Esc·포커스 복귀·전환 보호를 구현한다. 읽기 전용 뱃지에는 hover/포커스/선택 액션을 주지 않는다. Dot 데이터 연결은 만들지 않는다.
  - 검증: `npm --prefix app test`; 7에서 하단 프로젝트·긴 목록·최소 창·조회 프로젝트 접기 금지·메뉴→설정/제거·워크트리 전환 보호를 실제 입력으로 확인한다.

── commit: `feat(shell): implement approved shell and project navigation` ──

## 대조와 완료

- [ ] 7. `/design-sync`와 `/runtime-test`로 승인 시안의 Shell·LNB를 실제 앱과 대조한다. Home 본문과 기존 오른쪽 내용은 디자인 동등성 대상에서 제외하되 회귀는 확인한다. 개발/프로덕션·최소 창·긴 이름·목록 로딩/실패·메뉴·키보드·포커스·캔버스/워크트리 전환·선택/코멘트 보호를 검증한다.
  - 검증: 필요한 빌드 뒤 `node .scratch/design-sync/buzz-shell/measure.mjs`, `node app/e2e/presentation.ts`, `node app/e2e/presentation.ts --dev`; 네이티브 드래그·신호등·재질 관찰도 남긴다. 측정하지 않은 것을 PASS로 보고하지 않는다.
- [ ] 8. `/code-review`와 필요한 수정 뒤 공유 gate를 통과한다. 버그 수정은 `/postmortem`에 기록한다. 변경하지 않은 범위의 runtime 근거는 `/verify`의 재사용 조건을 따른다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --runtime` 최종 PASS·exit 0. e2e harness 변경 시 `node --test 'app/e2e/*.test.ts'`도 실행한다. 현재 계획은 CLI/MCP/guide/check 변경이 없어 실제 agent-eval 대상이 아니다.

── commit: `test(shell): verify approved shell behavior and native window` ──

- [ ] 9. 구현·실측 결론을 영어 PRODUCT·ARCHITECTURE·DESIGN.md로 승격하고 PRODUCT §7에 날짜와 근거를 남긴다. Window/Layout·LNB IA·Geist·칩·썸네일 결정을 반영하고 실제 인증 범위는 변경하지 않는다. 부모의 후속 자식 경계를 최종 확인한 뒤 **이 자식의** docs/features/buzz-shell/만 삭제한다.
  - 검증: 문서/코드/실측 근거 대조로 정적 시안 승인과 구현 완료를 구별한다. 문서만 바뀌었으면 8의 동일 구현 gate 근거를 재사용한다.

── 문서별 commit: `docs(product): record approved app shell` / `docs(architecture): record shell navigation and resources` / `docs(design): record app shell measurements` / `docs(feature): remove buzz-shell after promotion` ──
