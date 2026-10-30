# doan-mascot — spec

마스코트 Doany를 Welcome과 Home에 넣고, 두 화면의 세로 배치를 시안대로 바꾸고, 패키지 앱 아이콘을 Doany로 바꾼다.

- 시안: `.doan/canvases/doan-mascot.html`, 프레임 `mascot-home`(Home · Doany)과 `mascot-welcome`(Welcome · Doany). `mascot-motion` 프레임은 모션 검토용 확대본이다(아래 '모션' 참고).
- 에셋과 배치 인계: `.doan/assets/doany/README.md`(에셋·배치 인계·출처·검증), `.doan/assets/doany/study/README.md`(모션 스터디·상호작용).

## 사용자

- **사람**: 첫 실행 Welcome과 Home에서 Doany를 본다. Doany는 숨 쉬고 눈을 깜빡이며 포인터와 입력을 따라 눈을 돌리고, 누르거나 Send하면 뛴다. Finder·Dock·앱 전환기에서 Doan 앱 아이콘이 Doany로 보인다.
- **에이전트**: 해당 없음. CLI·MCP·스킬·형식은 바뀌지 않는다.

## 문제 (관찰한 사실)

- Welcome과 Home에는 마스코트가 없다. Welcome은 워드마크·문장·Get started만, Home은 인사 문구·입력창·추천 프롬프트만 있다(PRODUCT §5 'Home': "and nothing else").
- Home 본문은 위쪽 고정 여백 152px에서 시작한다(`.home-stage`, `app/src/renderer/styles.css`). 창 높이가 바뀌어도 그룹이 세로 중앙에 오지 않는다.
- 패키지 앱(`app/dist/mac-arm64/Doan.app`)은 Electron 기본 아이콘(`Contents/Resources/electron.icns`)을 쓴다. `app/package.json`의 electron-builder `build.mac`에 아이콘 설정이 없다.

## 완료 조건

### Doany 표시
- Home 본문 그룹 맨 위, 인사 문구 위에 Doany가 일반 흐름으로 놓인다. 그리기 영역은 114 × 114px, 쉬고 있을 때 보이는 캐릭터는 약 64px이다.
- Welcome 그룹 맨 위, 워드마크 위에 Doany가 놓인다. 그리기 영역은 142.5 × 142.5px, 보이는 캐릭터는 약 80px이다.
- 두 화면 모두 시안의 `mascot-home`·`mascot-welcome` 프레임과 computed style·박스가 맞는다(`/design-sync`).

### 모션 — 시안과 동일
앱의 Doany는 시안 스크립트 `.doan/assets/doany/motion/mascot.js`와 **같은 수식·상수·타이밍으로** 움직인다. 같은 시간·입력을 주면 같은 자세 값(squash, lift, tilt, hat, energy, look, eyeOpen)이 나온다.

- 쉬는 동안: 3.3초 주기의 숨, 2.5–6초 간격의 무작위 깜빡임(한 번에 260ms), 포인터가 1.8초 넘게 움직이지 않으면 느린 시선 이동, 가장자리 물결, 베레모의 감쇠 스프링.
- 포인터: 창 안에서 포인터가 움직이면 눈이 포인터 쪽을 보고 몸이 살짝 기운다. 시안 프레임이 창 전체이므로 범위도 창 전체다.
- 입력(Home만): 입력창에 글자를 넣으면 1.4초 동안 시선이 입력창 쪽으로 내려간다(attentive).
- 홉: Doany를 클릭하거나, 포커스된 Doany에서 Enter·Space를 누르면 뛴다(180ms 준비 → 570ms 비행 → 600ms 안착). Home에서는 전송이 시작될 때도 뛴다. Send 버튼·전송 키·알림의 Retry가 전송을 시작하는 순간이며, 전송할 수 없어 아무 일도 일어나지 않으면 뛰지 않는다(시안에서는 비활성 Send를 누를 수 없다). 시작한 전송이 나중에 실패해도 홉은 되돌리지 않는다.
- 줄인 모션(`prefers-reduced-motion: reduce`): 쉬는 자세로 멈춘다. 홉·숨·시선이 없고, 입력은 그대로 쓸 수 있다. 설정이 바뀌면 바로 반영한다.
- 화면 밖이거나 창이 숨겨지면 그리지 않는다.
- WebGL을 쓸 수 없거나 텍스처를 읽지 못하거나 컨텍스트를 잃으면 정지 PNG(`transparent/doany.png`)가 보인다.
- 접근성: Doany는 `aria-label="Make Doany hop"`인 버튼이고, 포커스 링은 공용 규칙(바깥 2px `--border-focus`, 2px 오프셋)을 따른다.

### 배치
- Home: 그룹(Doany·인사 문구·입력창·추천 프롬프트)을 ContentShell 본문 패널의 높이 기준으로 세로 중앙에 두고 64px 위로 올린다. 최소 위쪽 여백 32px, 아래 여백 160px(32 + 2 × 64). 고정 152px 위쪽 여백과 고정 `margin-top`을 쓰지 않는다.
- Welcome: 그룹(Doany·워드마크·소개 문장·Get started)을 창 크롬 아래 영역의 높이 기준으로 세로 중앙에 두고 72px 위로 올린다. 최소 위쪽 여백 32px, 아래 여백 176px(32 + 2 × 72). Get started는 소개 문장 아래 40px, 높이 48px를 유지한다.
- 두 화면 모두 가로 중앙을 유지한다. 짧은 창에서는 위쪽이 잘리지 않고 스크롤된다. 홉하는 동안 그리기 영역 안에서 베레모가 잘리지 않는다.
- 측정: 내용 높이가 다른 세 가지 이상에서 그룹 중심이 Home −64px, Welcome −72px이다. 짧은 창에서 위쪽 32px이 남고 스크롤된다. 한 높이의 스크린샷만으로는 통과로 보지 않는다.

### 앱 아이콘
- `npm --prefix app run package`로 만든 `Doan.app`의 아이콘이 흰 배경 Doany(`.doan/assets/doany/white/doany.png`)다. `Contents/Info.plist`의 아이콘 파일이 이 이미지에서 만든 icns를 가리킨다.

## 비목표

- 파비콘(`simple/favicon.ico`, `simple/doany-accent.svg`). 나중에 쓰려고 에셋에 둔 것이며 이번에는 앱에 넣지 않는다.
- 모션 스터디 프레임(`mascot-motion`)의 검토용 컨트롤(Greet·Blink·Hop·Pause)과 420px 확대본. 앱 화면에는 이 컨트롤이 없다.
- 시안 Home 프레임의 데모 동작 중 Doany가 아닌 것: 입력에 따른 Send 활성화, 추천 프롬프트 숨김, Send 뒤 입력 지우기. 이 동작은 기존 Home 규칙(PRODUCT §5 'Home')이 정하며 바꾸지 않는다.
- Home·Welcome 외 화면(Agent·Project 단계, 워크스페이스, Settings > About)의 Doany.
- 개발 실행(`npm --prefix app run dev`)의 Dock 아이콘. 아이콘은 패키지 앱에만 적용한다.
- 서명·공증·dmg(#9 `dist`).
- 다크 모드. 앱은 라이트 단일이다.
