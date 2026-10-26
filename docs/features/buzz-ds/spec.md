# buzz-ds — spec

부모 feature [`buzz-restyle`](../buzz-restyle/spec.md)의 첫 자식이다. Buzz를 레퍼런스로 삼아 doan의 디자인 시스템(토큰, 공용 컴포넌트 스타일, 여러 화면이 함께 쓰는 요소, DESIGN.md, UI 스택 기준)을 새로 작성해서, 이후 화면 자식 feature가 기댈 기반을 만든다. 부모 spec의 공통 결정을 따르고, 이 문서는 그중 buzz-ds가 실현하는 부분만 적는다.

## 사용자

- **사람(앱 사용자)**: 이 feature가 main에 들어가면 모든 화면이 라이트 토큰과 새 공용 컴포넌트 스타일로 바뀌고, 오렌지는 액센트 자리에만 남는다. 화면 배치(셸, 헤더, 행 수치, 패널 내부)는 화면 자식 feature가 바꾸기 전까지 지금 그대로다. 이 중간 상태는 부모 공통 결정 12로 허용되어 있고, 마지막 자식이 머지될 때까지 main에서 만든 빌드는 배포하지 않는다.
- **에이전트**: 직접 얻는 것은 없다. `design/` 초안 12개가 `app/src/renderer/tokens.css`를 링크하므로 초안의 겉모습과 `doan check` 결과가 영향을 받는다.

## 문제

- 지금 토큰(`tokens.css`, 변수 25개)은 다크 전용 Sorcerer 계열 값이고, 스타일(`styles.css` 611줄)은 화면 규칙과 공용 규칙이 섞여 있다(2026-10-26 기준).
- 오렌지(`var(--accent*)`)가 렌더러 CSS·TS의 약 60줄에서 서로 다른 표시에 쓰인다. 부모 공통 결정 2에 따라 Buzz 액센트 용례에 대응하는 자리만 오렌지 램프가 되고 나머지는 무채색이 되어야 한다.
- 화면 자식 feature가 Buzz와 비슷한 화면을 만들려면, 토큰·타입·재질과 공용 컴포넌트 스타일, 공유 요소가 먼저 있어야 한다.

## 완료 조건

- `tokens.css`에 Buzz 라이트 값을 기준으로 한 팔레트·의미 역할·orange 램프가 평범한 `:root` 변수로 있고, 기존 doan 이름 25개는 그 역할을 가리키는 `var()` 별칭으로 남아 있다. 렌더러는 별칭을 읽지 않는다. 확인: 순수 함수 테스트 `legacyAliases` green, `grep -rnE 'var\(--(bg|panel|panel-2|raised|line|line-2|text|text-[234]|accent|accent-(ink|soft|line)|board-(bg|dot)|ok|warn|err|shadow-[12]|tl-(red|yellow|green))\)' app/src/renderer --include='*.css' --include='*.ts' --include='*.tsx' | grep -v 'renderer/tokens.css'` 결과 없음.
- 공용 디자인 시스템 CSS가 `app/src/renderer/ds/`에 doan이 새로 쓴 코드로 있다. 클래스는 `doan-` 접두어, 데이터 속성은 `data-ui-*`이고, 상태 선택자는 Radix `data-state`와 네이티브 `[open]`, `:disabled`, `aria-*`, `:focus-visible`에 직접 건다. 코드에는 Buzz 파일 사본, 라이선스 사본, Buzz 출처 주석이 없다.
- 예전 오렌지 값이 남지 않는다. 확인: `grep -rniE '#f0773a|#3a2117|#1a0b03' app/src` 결과 없음.
- 지금 `var(--accent*)`를 쓰는 모든 줄이 design.md의 셀렉터 대응표대로 옮겨져 있다. orange는 사이드바 현재 위치 행과 그 hover, 코멘트 핀, 코멘트 제출 버튼(modifier), 코멘트 카드 역할 정의에만 있다. 확인: 순수 함수 테스트 `accentPlaces` green(orange 역할을 읽는 셀렉터가 허용 목록과 같다).
- 공용 컴포넌트가 Buzz와 같은 값과 규칙을 따른다: 버튼(prominent/subtle/ghost), `IconButton`(기존 아이콘 버튼에 적용), `Panel`(정의만, 실측은 buzz-shell), 툴팁(prominent 캡슐), 메뉴·팝오버(floating 재질과 파생 모서리), 다이얼로그 틀(크기 단계, 안쪽 패딩, 헤더·액션 배치, 등장·퇴장 모션, reduced-motion), 모달 scrim, 토스트, 스피너, 폼 컨트롤, `.kbd`·`.chip`, 포커스 링, disabled, 네이티브 얇은 스크롤바.
- 공유 요소(`ProjectSetupDialog`, `AddProjectsDialog`, `FirstPrompt`, `ConnectionRows`, `.ob-dialog`, `ErrorDetails`, `Toast`, 스피너)가 새 공용 스타일로 바뀌어 있고, `design/buzz-ds.html`과 `/design-sync`로 맞춰져 있다.
- 텍스트 대비가 기준을 넘는다: 본문 WCAG 4.5:1과 APCA Lc 60, 메타 텍스트 APCA Lc 45, 비텍스트 3:1은 컴포넌트를 알아보게 하는 테두리(`border-prominent`), 포커스 링, 핀에 적용한다. 장식용 hairline(`border-standard`)과 채움으로 경계를 만드는 입력 필드는 Buzz 값을 따르는 예외로 두고 DESIGN.md에 적는다(2026-10-26 user). disabled는 예외. orange 쌍과 반투명 표면(흰색·검정 뒤 배경 둘 다로 합성)을 포함한다. 확인: 순수 함수 테스트 `contrastPairs` green.
- 렌더러 CSS와 TS 문자열에서 쓰는 `var(--*)`가 모두 정의되어 있다(런타임 변수 `--tw-*`, `--radix-*` 제외). 확인: 순수 함수 테스트 `cssVarUsage` green.
- 이 리포의 `design/` 초안 전체에 대해 `doan check`가 정의되지 않은 변수 오류를 내지 않는다.
- 앱이 macOS 외형 설정과 상관없이 라이트로 그려진다(`nativeTheme.themeSource = "light"`). 두 창의 `backgroundColor`가 셸 색으로 지정되어 있다.
- `docs/DESIGN.md` 맨 앞에 디자인 시스템 절(Buzz를 레퍼런스로 삼았다는 사실과 기준 커밋, 채택 규칙, doan 조정, 공용 컴포넌트·공유 요소 실측값, 의도한 예외)이 있고, 화면별 절의 기존 다크 실측값에는 "buzz-ds 이전" 표시가 있다. 'UX audit recovery update' 절은 buzz-ds가 다시 측정한다.
- `node .agents/skills/verify/scripts/verify.mjs --runtime`가 통과한다.
- PRODUCT §7에 부모 공통 결정과 buzz-ds 결정(토큰 별칭 방식, `themeSource` light)이 기록되고, 2026-10-22 테마 결정·Sorcerer 레퍼런스와 2026-10-25 공유 툴팁 패딩 결정이 대체되었다고 적힌다. §8의 툴팁 패딩 항목(PRODUCT.md:711)도 갱신된다. §5 feature 목록에 `buzz-restyle`과 자식들이 있다.

## 비목표

- 화면 배치 변경. 셸 골격, 헤더, 사이드바 행 수치, 온보딩 표면, 각 패널의 내부 배치는 화면 자식 feature가 한다. 이 feature는 색·타입·공용 컴포넌트를 바꾸고, 대비 테스트와 e2e 스크린샷으로 가독성이 깨지지 않았는지만 확인한다.
- 코멘트 카드에 채움을 실제로 입히는 일(역할만 정의하고 적용은 `buzz-comment`).
- `BrowserWindow`의 크기, `titleBarStyle`, 신호등 위치(`buzz-shell`).
- Buzz 코드 복사, 라이선스 사본, 패키징 변경.
- 부모 spec의 비목표 전부.
