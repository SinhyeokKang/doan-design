# buzz-shell — tasks

디자인 승인: 2026-10-27. 사용자가 디자인을 먼저 확정한 뒤 feature를 마무리하도록 지시했다. 이 체크리스트는 구현 순서이며 현재 구현 시작 승인은 아니다. 새 design-draft 승인 단계를 다시 요구하지 않는다.

## 승인과 구현 계약

- [x] 0. 현재 Shell·LNB 디자인을 승인받고 spec·design·tasks를 최종 배치 기준으로 정리한다. 홈 비교판은 승인 기준에서 제외한다.
  - 검증: 사용자 “좋아 AppShell 확정하자”, 문서 대조와 정적 시안 검증. `go run ./cli/cmd/doan check --repo . --json`, `go run ./cli/cmd/doan ls --repo . --json`은 격리 DOAN_RUNTIME으로 실행한다.
- [x] 1a. 탐색의 제품 판단을 확정했다(2026-10-27). Projects는 현재 화면 표시만 한다. 프로젝트별 마지막 워크트리·펼침은 재시작 후에도 기억하고 스크롤은 세션 안에서만 기억한다. 사용자 선택과 식별 가능한 에이전트 작업 중 최근 워크트리를 프로젝트 재진입 때 복원하며 현재 화면은 자동 전환하지 않는다. 삭제된 이전·다음 기록은 건너뛰고 유효한 대상이 없으면 비활성화한다.
  - 검증: 사용자 답변과 spec·design 대조. 시각 배치 변화가 없어 시안 재승인은 필요 없다.
- [x] 1b. task 3 전에 위 결정의 기술 연결을 문서화한다. git.common/경로 키, 에이전트 활동 공급원·시각·수집 누락 범위, 기록 없음/동률/제거·재탐색 때 대체 대상, ui-state.json 저장·복원 및 이전 형식 호환성을 기존 상태/IPC와 대조한다. sessions.jsonl은 변경된 캔버스의 shell check 연관 기록이지 모든 작업 기록이 아니므로 이를 그대로 전체 활동 이력으로 간주하지 않는다. 기록을 얻을 수 없는 에이전트까지 지원한다고 가정하거나 CLI/MCP 계약을 임의로 확장하지 않는다. 필요한 범위 변경이 확인되면 그 지점만 사용자에게 확인한다.
  - 검증 완료(2026-10-27, 배치 A): design의 구현 전 기술 계약에 공급원별 이벤트·누락, 시각·동률·제거/재등록 폴백, 앱 내부 조회 연결, ui-state 호환성과 복원 표를 남기고 기존 코드·IPC와 대조했다. 활동 범위와 재등록 시 역사적 활동 재발견은 지휘자가 확인했다. 문서만 변경해 TDD·runtime은 실행하지 않았으며 새 필드·IPC의 구현과 테스트는 task 3·6에 남는다.
- [x] 2. 부모의 공통 결정과 자식 책임표를 정리했다. Shell이 LNB·프로젝트 메뉴·Geist·썸네일 폴백을 맡고 buzz-project는 Overview 본문, buzz-home은 프로젝트 선택 전 본문, buzz-conversation은 오른쪽 패널 정책을 맡는다. 인증은 별도 후속 범위로 남긴다.
  - 검증: 부모/자식 문서 대조. 부모의 정보 구조 불변·시스템 폰트·violet LNB·사이드바 Panel 전제가 승인된 예외와 충돌하지 않게 한다(문서 검토, 실행 명령 없음).

── 문서별 commit: `docs(feature): finalize buzz-shell design contract` ──

## 순수 상태 → 리소스/창 연결 → UI

공용 schema·fixture 변경 단계는 없다. 기존 사용자 설정 형식을 바꿔야 한다면 1에서 영향과 호환성을 먼저 명시한다.

- [ ] 3. 폴백 이름 해시, 현재 프로젝트 펼침 강제, 확정한 탐색 기록 상태 전이를 TDD로 고정하고 구현한다. 승인되지 않은 별도 기록 저장소나 범용 라우터를 만들지 않는다.
  - 검증: `npm --prefix app test`에서 빈 이름·공백·한글·이모지·색 중복·강제 펼침·기록 양끝·새 이동 뒤 앞으로 기록 제거·동일 목적지 중복 방지·워크트리+캔버스 이동의 단일 기록·삭제된 대상·전환 취소·보호 통과 후 완료 시점의 기록 갱신·재시작 후 기록 초기화를 확인한다. 프레임·줌·설정 창 이동은 기록하지 않는지도 확인한다.

── commit: `feat(shell): model project navigation and thumbnail fallbacks` ──

- [ ] 4. Geist를 앱 리소스로 번들하고 라이선스를 보관한다. 앱 공통 폰트에 적용하고 개발/프로덕션/패키지에서 제공한다. 프로젝트 8색을 공통 역할 토큰으로 옮긴다. 이미 변경된 공통 칩 12px·2px/6px를 통합하고 translucent 변형을 추가한다.
  - 검증: `npm --prefix app run typecheck`, `npm --prefix app run build`, `npm --prefix app run package`; 후속 runtime에서 오프라인 폰트 로드, 실제 glyph와 기존 공통 칩 사용처의 줄바꿈·높이를 확인한다.

── commit: `feat(shell): serve Geist and share identity and badge styles` ──

- [ ] 5a. main 창 옵션부터 연결하고 투명·블러·신호등·비활성 창·전체 화면·투명도 감소를 실제 창에서 먼저 확인한다. HTML 모형만으로 네이티브 적용을 완료 처리하지 않는다.
  - 검증: 필요한 빌드 뒤 격리한 `node .scratch/design-sync/buzz-shell/measure.mjs`로 실제 창 관찰과 측정 근거를 남긴다. 지원되지 않는 재질이 있으면 UI 구현에 앞서 기록한다.
- [ ] 5b. 확인한 창 옵션에 56px 헤더·흰 본문·260px LNB 구조를 연결한다. 이전·다음과 헤더 버튼 그룹, 검색, 프로젝트/캔버스 목록, 이름 기반 썸네일 폴백을 적용한다. 이미지 공급원·조회·새 데이터 필드는 추가하지 않는다. 현재 상태 소유자·iframe·모달·창 수명을 보존한다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`; 5a의 네이티브 근거를 보존하고 UI가 더해진 뒤 drag/no-drag와 전체 창 회귀를 7에서 확인한다.
- [ ] 6. 프로젝트 … 드롭다운에 워크트리와 Overview·기존 관리 액션을 연결한다. 워크트리 선택은 본문도 해당 워크트리의 마지막 캔버스/뷰(없으면 Overview)로 전환하며 보호 취소 시 기존 상태를 유지한다. Portal·위로 열기·내부 스크롤·키보드·외부 클릭·Esc·포커스 복귀·전환 보호를 구현한다. Remove from doan은 프로젝트 그룹의 등록된 워크트리 전체에 기존 제거 흐름을 적용한다. 기존 LNB 방향키·Home/End·타이프어헤드와 … 버튼 접근, 상태별 Set Up…·Locate…·Retry·Details 및 개별 캔버스 오류 표시를 보존한다. 제거 후 인접 프로젝트/마지막 행의 Search 포커스 복귀를 처리한다. 읽기 전용 뱃지에는 hover/포커스/선택 액션을 주지 않는다. Dot 데이터 연결은 만들지 않는다.
  - 검증: `npm --prefix app test`; 7에서 하단 프로젝트·긴 목록·최소 창·조회 프로젝트 접기 금지·메뉴→Overview→캔버스 왕복과 기존 Feedback 도달성, 메뉴→설정/제거·워크트리 전환 보호를 실제 입력으로 확인한다. 프로젝트 제거가 모든 등록 워크트리를 대상으로 하되 다른 프로젝트와 실제 폴더·git 상태는 유지하는지, 기존 제거 취소·복구가 그룹 전체에 적용되는지도 확인한다.

── commit: `feat(shell): implement approved shell and project navigation` ──

## 대조와 완료

- [ ] 7. `/design-sync`와 `/runtime-test`로 승인 시안의 Shell·LNB를 실제 앱과 대조한다. Home 본문과 기존 오른쪽 내용은 디자인 동등성 대상에서 제외하되 회귀는 확인한다. 개발/프로덕션·최소 창·긴 이름·목록 로딩/실패·메뉴·키보드·포커스·캔버스/워크트리 전환·선택/코멘트 보호를 검증한다.
  - 검증: 필요한 빌드 뒤 `node .scratch/design-sync/buzz-shell/measure.mjs`, `node app/e2e/presentation.ts`, `node app/e2e/presentation.ts --dev`; 네이티브 드래그·신호등·재질 관찰도 남긴다. 늦게 온 A 조회 결과가 B 선택을 덮지 않는지, 열린 메뉴의 대상 유실·마지막 프로젝트 제거·보호 취소·개별 캔버스/코멘트 읽기 오류·복구 액션을 검증한다. 실제 서버가 아닌 통제된 응답 순서로 재현한다. 측정하지 않은 것을 PASS로 보고하지 않는다.
- [ ] 7b. 패키지 자체를 실행해 오프라인 Geist 로드를 별도로 확인한다. `presentation.ts`의 app 디렉터리 실행은 이 검증을 대신하지 않는다.
  - 검증: `npm --prefix app run package` 뒤 AGENTS Commands의 `app/dist/mac-arm64/doan.app/Contents/MacOS/doan --user-data-dir=<tmp>`를 사용한다. 임시 HOME·가짜 SHELL·CLAUDE_CONFIG_DIR/CODEX_HOME·userData를 모두 격리하고 실제 사용자 상태를 보호한다. 패키지의 폰트 리소스 요청 성공·FontFace loaded·실제 렌더링 글꼴·외부 폰트 요청 없음·오프라인 재실행을 확인한다. package exit 0만으로 통과 처리하지 않는다.
- [ ] 8. `/code-review`와 필요한 수정 뒤 공유 gate를 통과한다. 버그 수정은 `/postmortem`에 기록한다. 변경하지 않은 범위의 runtime 근거는 `/verify`의 재사용 조건을 따른다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --runtime` 최종 PASS·exit 0. e2e harness 변경 시 `node --test 'app/e2e/*.test.ts'`도 실행한다. 현재 계획은 CLI/MCP/guide/check 변경이 없어 실제 agent-eval 대상이 아니다.

── commit: `test(shell): verify approved shell behavior and native window` ──

- [ ] 9. 구현·실측 결론을 영어 PRODUCT·ARCHITECTURE·DESIGN.md로 승격하고 PRODUCT §7에 날짜와 근거를 남긴다. Window/Layout·LNB IA·Geist·칩·썸네일 결정을 반영하고 실제 인증 범위는 변경하지 않는다. 부모의 후속 자식 경계를 최종 확인한 뒤 **이 자식의** docs/features/buzz-shell/만 삭제한다.
  - 검증: 문서/코드/실측 근거 대조로 정적 시안 승인과 구현 완료를 구별한다. 문서만 바뀌었으면 8의 동일 구현 gate 근거를 재사용한다.

── 문서별 commit: `docs(product): record approved app shell` / `docs(architecture): record shell navigation and resources` / `docs(design): record app shell measurements` / `docs(feature): remove buzz-shell after promotion` ──
